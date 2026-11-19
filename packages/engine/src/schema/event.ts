/**
 * `tt.event` issue entity property, schema v1 (ARCHITECTURE §6.1), its companion
 * properties, and the column-mapping preset (§5.1). Types plus total runtime validators.
 *
 * Every read of a property must go through a `parse*` function: anyone with edit rights
 * can change properties through REST (§6.1 "Integrity").
 */
import { BRAKE_UNITS, CANONICAL_CHANNELS, CSV_MAX_ROWS, SIGNAL_CHANNELS, WINDOW_HZ, WINDOW_N, WINDOW_PRE_S } from "./channels.js";
import type { BrakeUnit, CanonicalChannel, SignalChannel } from "./channels.js";
import { CONDITION_CHIPS, CHIP_OPS, HIST32_BINS, IMAGE_METRIC_KEYS, IMAGE_METRIC_RANGES } from "./image.js";
import type { ChipRule, ConditionChip, ImageMetrics } from "./image.js";
import { FEATURE_FLAGS, FEATURE_IDS, FEATURE_SPECS, RULE_IDS, RULE_TYPE, TAKEOVER_CONFIDENCES, TAKEOVER_SOURCES, TAKEOVER_TYPES } from "./features.js";
import type { FeatureFlags, FeatureVector, RuleId, RuleMargins, TakeoverConfidence, TakeoverSource, TakeoverType } from "./features.js";
import { err, type EngineError, type Result } from "./result.js";
import {
  INVALID,
  arrayOf,
  bool,
  isRecord,
  joinPath,
  literal,
  num,
  object,
  oneOf,
  partialRecord,
  refine,
  run,
  str,
  type Decoder,
} from "./validate.js";
import { EVENT_SCHEMA_VERSION, SEMVER_PATTERN } from "./version.js";

// ---------------------------------------------------------------- types

export interface EventContext {
  /** ISO-8601 timestamp with zone, e.g. `2026-11-14T09:12:33Z`. */
  readonly occurredAt: string;
  readonly vehicleId: string;
  /** Sensor variant, e.g. `cam-B`. */
  readonly variant: string;
  /** Software build, e.g. `4.12.0`. */
  readonly build: string;
  readonly driveSessionId?: string;
  /** ODD tags, e.g. `["highway"]`. */
  readonly odd: readonly string[];
}

export interface MappingRef {
  readonly presetId: string;
  /** `sha256:<64 hex>` of the canonical preset. */
  readonly hash: string;
}

export interface CsvSourceRef {
  /** Absent until the attachment upload succeeds (§15 row 2). */
  readonly attachmentId?: string;
  /** 64 lower-case hex chars. */
  readonly sha256: string;
  readonly rows: number;
  /** Raw sample rate in Hz. */
  readonly rawHz: number;
}

export interface FrameSourceRef {
  readonly attachmentId?: string;
  readonly sha256: string;
  readonly w: number;
  readonly h: number;
}

export interface EventSource {
  readonly csv: CsvSourceRef;
  readonly frames: readonly FrameSourceRef[];
}

export interface TakeoverInfo {
  readonly source: TakeoverSource;
  readonly confidence: TakeoverConfidence;
}

export interface SignalSummary {
  readonly type: TakeoverType;
  readonly ruleId: RuleId;
  readonly margins: RuleMargins;
  readonly features: FeatureVector;
  readonly flags: FeatureFlags;
}

export interface ImageSummary {
  /** Image metrics cannot be re-verified server side (§6.1). */
  readonly attested: "client";
  readonly median: ImageMetrics;
  /** 32-bin luminance histogram of the median frame (pixel counts). */
  readonly hist32: readonly number[];
  readonly chips: readonly ConditionChip[];
  readonly chipRules: readonly ChipRule[];
}

export interface TelemetryChannelRef {
  readonly k: SignalChannel;
  /** Quantisation scale (> 0). */
  readonly s: number;
  readonly o: number;
}

export interface TelemetryBlock {
  readonly hz: typeof WINDOW_HZ;
  readonly tStart: number;
  readonly n: typeof WINDOW_N;
  readonly ch: readonly TelemetryChannelRef[];
  /** base64 of channel-major little-endian int16, n × ch.length × 2 bytes. */
  readonly data: string;
}

/** The `tt.event` property, schema v1. */
export interface TtEventV1 {
  readonly v: 1;
  /** Engine semver that computed `sig`/`img`. */
  readonly engine: string;
  readonly app: string;
  readonly synthetic: boolean;
  readonly ctx: EventContext;
  readonly mapping: MappingRef;
  readonly source: EventSource;
  readonly takeover: TakeoverInfo;
  readonly sig: SignalSummary;
  /** Absent when no frame could be decoded (chips `n/a`, §15 row 3). */
  readonly img?: ImageSummary;
  readonly tel: TelemetryBlock;
}

/** The current `tt.event` shape. */
export type TtEvent = TtEventV1;

// ---------------------------------------------------------------- shared decoders

const ISO_TIMESTAMP = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const id = str({ minLength: 1, maxLength: 128 });
const shortTag = str({ minLength: 1, maxLength: 64 });
const isoTimestamp = str({ pattern: ISO_TIMESTAMP });
const semver = str({ maxLength: 64, pattern: SEMVER_PATTERN });
const sha256 = str({ pattern: SHA256_HEX });
const version1 = literal(EVENT_SCHEMA_VERSION);

/** Array decoder that also rejects duplicate primitive values. */
function uniqueArrayOf<T extends string>(item: Decoder<T>, maxLength: number): Decoder<readonly T[]> {
  return refine(arrayOf(item, { maxLength }), (xs) => (new Set(xs).size === xs.length ? null : "contains duplicates"));
}

/** Feature map: keys F1..F10, values finite and inside each feature's clamp range. */
const featureVector: Decoder<FeatureVector> = (u, path, errs) => {
  if (!isRecord(u)) {
    errs.push({ code: "E_SCHEMA_INVALID", message: "expected object", path });
    return INVALID;
  }
  let bad = false;
  const out: { [K in (typeof FEATURE_IDS)[number]]?: number } = {};
  for (const key of Object.keys(u)) {
    if (!(FEATURE_IDS as readonly string[]).includes(key)) {
      errs.push({ code: "E_SCHEMA_INVALID", message: "unknown key", path: joinPath(path, key) });
      bad = true;
      continue;
    }
    const fid = key as (typeof FEATURE_IDS)[number];
    const [min, max] = FEATURE_SPECS[fid].range;
    const d = num({ min, max })(u[key], joinPath(path, key), errs);
    if (d === INVALID) bad = true;
    else out[fid] = d;
  }
  return bad ? INVALID : out;
};

// ---------------------------------------------------------------- tt.event decoders

const eventContext: Decoder<EventContext> = object(
  { occurredAt: isoTimestamp, vehicleId: id, variant: shortTag, build: shortTag, odd: uniqueArrayOf(shortTag, 16) },
  { driveSessionId: id },
);

const mappingRef: Decoder<MappingRef> = object({ presetId: id, hash: str({ pattern: /^sha256:[0-9a-f]{64}$/ }) });

const eventSource: Decoder<EventSource> = object({
  csv: object(
    { sha256, rows: num({ integer: true, min: 1, max: CSV_MAX_ROWS }), rawHz: num({ min: 0, max: 100_000 }) },
    { attachmentId: id },
  ),
  frames: arrayOf(
    object({ sha256, w: num({ integer: true, min: 1, max: 65_535 }), h: num({ integer: true, min: 1, max: 65_535 }) }, { attachmentId: id }),
    { maxLength: 8 },
  ),
});

const takeoverInfo: Decoder<TakeoverInfo> = object({ source: oneOf(TAKEOVER_SOURCES), confidence: oneOf(TAKEOVER_CONFIDENCES) });

const signalSummary: Decoder<SignalSummary> = refine(
  object({
    type: oneOf(TAKEOVER_TYPES),
    ruleId: oneOf(RULE_IDS),
    margins: partialRecord(FEATURE_IDS, num()),
    features: featureVector,
    flags: partialRecord(FEATURE_IDS, oneOf(FEATURE_FLAGS)),
  }),
  (s) => (RULE_TYPE[s.ruleId] === s.type ? null : `ruleId ${s.ruleId} does not assign type ${s.type}`),
);

const imageMetrics: Decoder<ImageMetrics> = refine(
  object(
    Object.fromEntries(
      IMAGE_METRIC_KEYS.map((k) => [k, num({ min: IMAGE_METRIC_RANGES[k][0], max: IMAGE_METRIC_RANGES[k][1] })]),
    ) as Record<(typeof IMAGE_METRIC_KEYS)[number], Decoder<number>>,
  ),
  (m) => (m.p5 <= m.p95 ? null : "p5 must be <= p95"),
);

const chipRule: Decoder<ChipRule> = object({
  chip: oneOf(CONDITION_CHIPS),
  metric: oneOf(IMAGE_METRIC_KEYS),
  op: oneOf(CHIP_OPS),
  value: num(),
  threshold: num(),
});

const imageSummary: Decoder<ImageSummary> = object({
  attested: literal("client"),
  median: imageMetrics,
  hist32: arrayOf(num({ integer: true, min: 0 }), { minLength: HIST32_BINS, maxLength: HIST32_BINS }),
  chips: refine(uniqueArrayOf(oneOf(CONDITION_CHIPS), CONDITION_CHIPS.length), (cs) =>
    cs.length === 0 ? "must contain at least one chip" : cs.includes("normal") && cs.length > 1 ? "normal is exclusive" : null,
  ),
  chipRules: arrayOf(chipRule, { maxLength: 16 }),
});

/** Number of base64 chars for `bytes` bytes (with padding). */
export function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

const telemetryBlock: Decoder<TelemetryBlock> = refine(
  object({
    hz: literal(WINDOW_HZ),
    tStart: literal(-WINDOW_PRE_S),
    n: literal(WINDOW_N),
    ch: refine(
      arrayOf(object({ k: oneOf(SIGNAL_CHANNELS), s: num({ min: Number.MIN_VALUE }), o: num() }), {
        minLength: 1,
        maxLength: SIGNAL_CHANNELS.length,
      }),
      (cs) => (new Set(cs.map((c) => c.k)).size === cs.length ? null : "duplicate channel"),
    ),
    data: str({ pattern: BASE64 }),
  }),
  (t) => {
    const expected = base64Length(t.n * t.ch.length * 2);
    return t.data.length === expected ? null : `data length ${t.data.length} != expected ${expected}`;
  },
);

const ttEventV1: Decoder<TtEventV1> = object(
  {
    v: version1,
    engine: semver,
    app: semver,
    synthetic: bool,
    ctx: eventContext,
    mapping: mappingRef,
    source: eventSource,
    takeover: takeoverInfo,
    sig: signalSummary,
    tel: telemetryBlock,
  },
  { img: imageSummary },
);

/**
 * Checks the `v` field before full validation. A newer version is reported as
 * `E_SCHEMA_VERSION` so callers can say "computed by a newer app" rather than "corrupt".
 */
function checkVersion(u: unknown, supported: number): readonly EngineError[] {
  if (!isRecord(u)) return [{ code: "E_SCHEMA_INVALID", message: "expected object", path: "" }];
  const v = u["v"];
  if (v === supported) return [];
  if (typeof v === "number" && Number.isInteger(v) && v > supported) {
    return [{ code: "E_SCHEMA_VERSION", message: `schema v${v} is newer than supported v${supported}`, path: "v" }];
  }
  return [{ code: "E_SCHEMA_VERSION", message: `unsupported schema version ${JSON.stringify(v) ?? "undefined"}`, path: "v" }];
}

/** Validates with a version precheck. */
function parseVersioned<T>(decoder: Decoder<T>, u: unknown): Result<T> {
  const vErr = checkVersion(u, EVENT_SCHEMA_VERSION);
  return vErr.length > 0 ? err(vErr) : run(decoder, u);
}

/**
 * Validates an untrusted `tt.event` value. Unknown keys are stripped. Bounds checked:
 * feature clamp ranges, metric ranges, ruleId/type consistency, telemetry length.
 * Does not recompute `sig` from `tel`; that is the feature module's job (D2).
 */
export function parseTtEvent(u: unknown): Result<TtEvent> {
  return parseVersioned(ttEventV1, u);
}

// ---------------------------------------------------------------- companion properties

/** `tt.thumbs`: ≤ 4 grayscale 160x90 thumbnails as base64 JPEG. */
export interface TtThumbs {
  readonly v: 1;
  readonly frames: readonly { readonly w: number; readonly h: number; readonly jpegB64: string }[];
}

export const TRIAGE_STATES = ["accepted", "rejected", "none"] as const;
export type TriageState = (typeof TRIAGE_STATES)[number];

/** One entry of the triage history. */
export interface TriageAction {
  /** Free-form action verb, e.g. `accept`, `reject`, `split`, `route`. */
  readonly action: string;
  readonly by: string;
  readonly at: string;
  readonly clusterKey?: string;
}

/** `tt.triage`: human triage state; keeps the last 10 actions. */
export interface TtTriage {
  readonly v: 1;
  readonly state: TriageState;
  readonly clusterKey?: string;
  /** Atlassian accountId. */
  readonly by: string;
  readonly at: string;
  readonly history: readonly TriageAction[];
}

/** `tt.cluster`: cluster issue metadata. */
export interface TtCluster {
  readonly v: 1;
  /** `"<type>|<variant>"` (see `bucketId`). */
  readonly bucket: string;
  readonly nameDet: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly params: string;
}

/** `tt.scenario`: optional scenario tags; `any` is a wildcard. */
export interface TtScenario {
  readonly v: 1;
  readonly type: TakeoverType | "any";
  readonly variant: string;
  readonly cond: readonly (ConditionChip | "any")[];
  readonly odd: readonly string[];
}

export const TRIAGE_HISTORY_MAX = 10;

const ttThumbs: Decoder<TtThumbs> = object({
  v: version1,
  frames: arrayOf(
    object({ w: num({ integer: true, min: 1, max: 4096 }), h: num({ integer: true, min: 1, max: 4096 }), jpegB64: str({ minLength: 4, pattern: BASE64 }) }),
    { maxLength: 4 },
  ),
});

const triageAction: Decoder<TriageAction> = object({ action: shortTag, by: id, at: isoTimestamp }, { clusterKey: id });

const ttTriage: Decoder<TtTriage> = object(
  { v: version1, state: oneOf(TRIAGE_STATES), by: id, at: isoTimestamp, history: arrayOf(triageAction, { maxLength: TRIAGE_HISTORY_MAX }) },
  { clusterKey: id },
);

const ttCluster: Decoder<TtCluster> = object({
  v: version1,
  bucket: str({ minLength: 3, maxLength: 160, pattern: /^[^|]+\|[^|]+$/ }),
  nameDet: str({ minLength: 1, maxLength: 255 }),
  createdBy: id,
  createdAt: isoTimestamp,
  params: shortTag,
});

const ttScenario: Decoder<TtScenario> = object({
  v: version1,
  type: oneOf([...TAKEOVER_TYPES, "any"] as const),
  variant: shortTag,
  cond: uniqueArrayOf(oneOf([...CONDITION_CHIPS, "any"] as const), CONDITION_CHIPS.length + 1),
  odd: uniqueArrayOf(shortTag, 16),
});

/** Validates an untrusted `tt.thumbs` value. */
export function parseTtThumbs(u: unknown): Result<TtThumbs> {
  return parseVersioned(ttThumbs, u);
}
/** Validates an untrusted `tt.triage` value. */
export function parseTtTriage(u: unknown): Result<TtTriage> {
  return parseVersioned(ttTriage, u);
}
/** Validates an untrusted `tt.cluster` value. */
export function parseTtCluster(u: unknown): Result<TtCluster> {
  return parseVersioned(ttCluster, u);
}
/** Validates an untrusted `tt.scenario` value. */
export function parseTtScenario(u: unknown): Result<TtScenario> {
  return parseVersioned(ttScenario, u);
}

// ---------------------------------------------------------------- mapping preset (§5.1)

/** Column-mapping preset stored in KVS as `preset:<projectKey>:<id>`. */
export interface MappingPreset {
  /** Canonical channel → raw CSV header. */
  readonly columns: { readonly [K in CanonicalChannel]?: string };
  /** Canonical channel → factor applied to the raw value. */
  readonly multipliers: { readonly [K in CanonicalChannel]?: number };
  /** Channels whose 0/1 value is inverted (e.g. `ad_active` → `takeover`). */
  readonly invert: { readonly [K in CanonicalChannel]?: boolean };
  readonly brakeUnit: BrakeUnit;
}

const mappingPreset: Decoder<MappingPreset> = object({
  columns: partialRecord(CANONICAL_CHANNELS, str({ minLength: 1, maxLength: 256 })),
  multipliers: partialRecord(
    CANONICAL_CHANNELS,
    refine(num(), (x) => (x === 0 ? "multiplier must be non-zero" : null)),
  ),
  invert: partialRecord(CANONICAL_CHANNELS, bool),
  brakeUnit: oneOf(BRAKE_UNITS),
});

/** Validates an untrusted mapping preset (no `v` field; presets are not versioned in the spec). */
export function parseMappingPreset(u: unknown): Result<MappingPreset> {
  return run(mappingPreset, u);
}
