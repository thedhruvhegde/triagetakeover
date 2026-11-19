/**
 * `processEventFiles`: raw files → `tt.event` (ARCHITECTURE §5.1–§5.6, §6.1; SEED_DATA §2.2).
 *
 * The single function both the intake Web Worker and the demo seed call, so seeded events take
 * exactly the real intake path: CSV parse → mapping → t_to → 10 Hz window → quantise/decode →
 * features and type; JPEG decode → downscale → luma → metrics → per-event median → chips.
 * The result is validated with {@link parseTtEvent} before it is returned.
 */
import {
  ENGINE_VERSION,
  err,
  ok,
  parseTtEvent,
  type EngineError,
  type EventContext,
  type FeatureParams,
  type FrameSourceRef,
  type MappingPreset,
  type Result,
  type TtEventV1,
} from "../schema/index.js";
import type { ChipThresholds } from "../schema/index.js";
import { parseCsv } from "../csv/parse.js";
import type { EngineWarning } from "../csv/types.js";
import { encodeUtf8 } from "../csv/utf8.js";
import { presetHash } from "../mapping/hash.js";
import { sha256Hex } from "../mapping/sha256.js";
import { suggestMapping } from "../mapping/suggest.js";
import { analyzeEventFrames, type FrameAnalysis } from "../image/pipeline.js";
import type { RuleThresholds } from "../signal/rules.js";
import { analyzeTableSignal } from "../signal/pipeline.js";

/** Schema limit on frames per event (`source.frames`, §6.1). */
export const MAX_EVENT_FRAMES = 8;
/** Preset id recorded when the mapping was auto-suggested from the headers. */
export const SUGGESTED_PRESET_ID = "suggested";

export interface EventFilesInput {
  /** Telemetry CSV, as bytes (preferred: hashed as uploaded) or text (hashed as UTF-8). */
  readonly csv: Uint8Array | string;
  /** Dashcam stills, in the order they should be listed. */
  readonly frames: readonly Uint8Array[];
}

export interface ProcessEventOptions {
  readonly ctx: EventContext;
  /** Column mapping; when absent, `suggestMapping(headers)` is used with id {@link SUGGESTED_PRESET_ID}. */
  readonly preset?: MappingPreset;
  readonly presetId?: string;
  readonly synthetic?: boolean;
  /** App semver stored as `app`; defaults to the engine version. */
  readonly app?: string;
  /** Takeover time entered in the modal, in the CSV time base. */
  readonly manualTakeoverTime?: number;
  readonly thresholds?: RuleThresholds;
  readonly scales?: FeatureParams;
  readonly chipThresholds?: ChipThresholds;
}

export interface ProcessedEvent {
  readonly event: TtEventV1;
  /** Non-fatal CSV/mapping warnings (duplicate time, unsorted rows, …). */
  readonly warnings: readonly EngineWarning[];
  /** Per-frame results, in input order; failed frames are left out of `event.source.frames`. */
  readonly frames: readonly Result<FrameAnalysis>[];
  /** Takeover time in the CSV's own time base. */
  readonly tTo: number;
  /** None of lane_offset, ttc, brake was mapped (§5.1 footnote). */
  readonly insufficientChannels: boolean;
}

const tooManyFrames = (n: number): readonly EngineError[] => [
  { code: "E_TOO_MANY_FRAMES", message: `an event holds at most ${MAX_EVENT_FRAMES} frames, got ${n}`, path: "source.frames" },
];

/** Computes the `tt.event` property for one event's files. Total: every failure is a Result error. */
export function processEventFiles(files: EventFilesInput, opts: ProcessEventOptions): Result<ProcessedEvent> {
  if (files.frames.length > MAX_EVENT_FRAMES) return err(tooManyFrames(files.frames.length));
  const csvBytes = typeof files.csv === "string" ? encodeUtf8(files.csv) : files.csv;
  const table = parseCsv(csvBytes);
  if (!table.ok) return table;
  if (table.value.rowCount === 0) return err([{ code: "E_CSV_EMPTY", message: "CSV has a header but no data rows", path: "source.csv" }]);
  const preset = opts.preset ?? suggestMapping(table.value.headers);
  const presetId = opts.presetId ?? (opts.preset === undefined ? SUGGESTED_PRESET_ID : "default");
  const signal = analyzeTableSignal(table.value, preset, {
    ...(opts.manualTakeoverTime === undefined ? {} : { manualTakeoverTime: opts.manualTakeoverTime }),
    ...(opts.thresholds === undefined ? {} : { thresholds: opts.thresholds }),
    ...(opts.scales === undefined ? {} : { scales: opts.scales }),
  });
  if (!signal.ok) return signal;
  const s = signal.value;
  const image = analyzeEventFrames(files.frames, opts.chipThresholds === undefined ? {} : { thresholds: opts.chipThresholds });
  const frameRefs: FrameSourceRef[] = [];
  image.frames.forEach((r, i) => {
    if (r.ok) frameRefs.push({ sha256: sha256Hex(files.frames[i] as Uint8Array), w: r.value.width, h: r.value.height });
  });
  const { insufficientChannels, ...sig } = s.sig;
  const event: TtEventV1 = {
    v: 1,
    engine: ENGINE_VERSION,
    app: opts.app ?? ENGINE_VERSION,
    synthetic: opts.synthetic ?? false,
    ctx: opts.ctx,
    mapping: { presetId, hash: presetHash(preset) },
    source: { csv: { sha256: sha256Hex(csvBytes), rows: s.table.rowCount, rawHz: s.rawHz }, frames: frameRefs },
    takeover: s.takeover,
    sig,
    ...(image.summary === null ? {} : { img: image.summary }),
    tel: s.tel,
  };
  const checked = parseTtEvent(event);
  if (!checked.ok) return checked;
  return ok({ event: checked.value, warnings: s.warnings, frames: image.frames, tTo: s.tTo, insufficientChannels });
}
