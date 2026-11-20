/**
 * Server-side verification of `tt.event` (ARCHITECTURE §6.1 "Integrity", D2).
 *
 * Anyone with edit rights can change properties through REST, so every read is validated:
 * schema and bounds (engine `parseTtEvent`), then `sig` is RECOMPUTED from the stored 10 Hz
 * telemetry with the engine. When the stored `sig` differs, the recomputed values win and the
 * event is flagged "signal data modified outside the app". Image metrics cannot be recomputed
 * server-side (the server never reads attachments, D1); they stay `attested: "client"`.
 */
import {
  CODEC_BRAKE_BAR_SCALE,
  ENGINE_VERSION,
  analyzeSignal,
  decodeTelemetry,
  FEATURE_IDS,
  needsRecompute,
  parseTtEvent,
  type BrakeUnit,
  type EngineError,
  type FeatureVector,
  type SignalSummary,
  type TtEvent,
} from "@tt/engine";
import type { EventRow } from "../ports/entities";
import type { ProjectConfig } from "./config";
import { eventRowOf, type IssueIdentity, UNASSIGNED } from "./index-store";

export const TAMPERED_WARNING = "Signal data modified outside the app: the signature was recomputed from the stored telemetry.";
export const IMAGE_ATTESTATION_NOTE = "Image statistics, not scene understanding. Computed in the browser (client-attested); the server cannot re-verify them.";

export interface VerifiedEvent {
  /** The event with `sig` replaced by the server recomputation. */
  readonly event: TtEvent;
  /** The stored `sig` (as written). */
  readonly storedSig: SignalSummary;
  /** Stored type/features differed from the recomputation. */
  readonly tampered: boolean;
  /** The stored `engine` differs from the running engine (§15 #26). */
  readonly engineChanged: boolean;
  readonly warnings: readonly string[];
}

export type VerifyResult = { readonly ok: true; readonly value: VerifiedEvent } | { readonly ok: false; readonly error: readonly EngineError[] };

/** Brake unit as encoded in the codec (bar uses scale 0.01; ratio 0.001). */
export function brakeUnitOf(event: TtEvent): BrakeUnit {
  const brake = event.tel.ch.find((c) => c.k === "brake");
  return brake !== undefined && Math.abs(brake.s - CODEC_BRAKE_BAR_SCALE) < 1e-12 ? "bar" : "ratio";
}

const EPS = 1e-9;

export function sameFeatures(a: FeatureVector, b: FeatureVector): boolean {
  for (const id of FEATURE_IDS) {
    const x = a[id];
    const y = b[id];
    if (x === undefined && y === undefined) continue;
    if (x === undefined || y === undefined || Math.abs(x - y) > EPS * Math.max(1, Math.abs(x))) return false;
  }
  return true;
}

/** Validates and recomputes. Fails only on schema or telemetry-decode errors. */
export function verifyEvent(raw: unknown, config: Pick<ProjectConfig, "ruleThresholds">): VerifyResult {
  const parsed = parseTtEvent(raw);
  if (!parsed.ok) return parsed;
  const event = parsed.value;
  const window = decodeTelemetry(event.tel);
  if (!window.ok) return window;
  const analysis = analyzeSignal(window.value, { brakeUnit: brakeUnitOf(event), thresholds: config.ruleThresholds });
  const { insufficientChannels, ...sig } = analysis;
  void insufficientChannels;
  const tampered = sig.type !== event.sig.type || sig.ruleId !== event.sig.ruleId || !sameFeatures(sig.features, event.sig.features);
  const engineChanged = needsRecompute(event.engine);
  const warnings: string[] = [];
  if (tampered) warnings.push(TAMPERED_WARNING);
  if (engineChanged) warnings.push(`Computed with engine ${event.engine}; features were recomputed with engine ${ENGINE_VERSION}.`);
  return { ok: true, value: { event: { ...event, sig }, storedSig: event.sig, tampered, engineChanged, warnings } };
}

/**
 * True when the index row no longer reflects the verified property (§7.5 lazy re-processing):
 * missing row, engine change, or a difference in bucket, build, time, chips or features.
 */
export function rowIsStale(row: EventRow | undefined, issue: IssueIdentity, clockless: EventRow): boolean {
  if (row === undefined) return true;
  if (row.engine !== ENGINE_VERSION || row.issueKey !== issue.key || row.projectKey !== issue.projectKey) return true;
  return row.bucket !== clockless.bucket || row.build !== clockless.build || row.occurredAt !== clockless.occurredAt || row.chipsMask !== clockless.chipsMask || row.synthetic !== clockless.synthetic || !sameFeatures(row.features, clockless.features);
}

/** Row content derived from the property alone (membership left unassigned), for comparisons. */
export function propertyRow(issue: IssueIdentity, verified: VerifiedEvent): EventRow {
  const fixedClock = { nowIso: () => "1970-01-01T00:00:00.000Z", nowMs: () => 0 };
  return eventRowOf(issue, verified.event, UNASSIGNED, fixedClock);
}
