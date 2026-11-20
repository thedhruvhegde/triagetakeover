/**
 * The intake computation, run in the Web Worker (or on the main thread as the SPIKE-C3 fallback).
 * It only CALLS the engine: `parseCsv` + `suggestMapping` to inspect headers, and
 * `processEventFiles` (the same function the demo seed uses) to build `tt.event`. JPEGs are
 * decoded here, in the browser, with the engine's pure-JS decoder; never on the server (D1).
 *
 * Everything returned is structured-clone safe (plain objects, typed arrays).
 */
import {
  DEFAULT_CHIP_THRESHOLDS,
  DEFAULT_RULE_THRESHOLDS,
  decodeJpeg,
  decodeTelemetryValues,
  downscale,
  parseCsv,
  processEventFiles,
  serializedSize,
  suggestMapping,
  toLuma,
  type ChipThresholds,
  type EngineError,
  type EngineWarning,
  type EventContext,
  type MappingPreset,
  type RuleThresholds,
  type TtEventV1,
} from "@tt/engine";
import { mappingStatus, type MappingCoverage } from "./mapping-status.js";

/** Long side of the `tt.thumbs` previews (ARCHITECTURE §14: 160x90 grayscale). */
export const THUMB_MAX_SIDE = 160;

export { mappingStatus, needsMappingStep, presetFits } from "./mapping-status.js";

export interface InspectResult extends MappingCoverage {
  readonly ok: true;
  readonly headers: readonly string[];
  readonly rowCount: number;
  readonly suggested: MappingPreset;
}

export type InspectOutput = InspectResult | { readonly ok: false; readonly errors: readonly EngineError[] };

/** Inspects the CSV header row and suggests a mapping (PRD US-05 AC2). */
export function inspectCsv(csv: Uint8Array): InspectOutput {
  const table = parseCsv(csv);
  if (!table.ok) return { ok: false, errors: table.error };
  const suggested = suggestMapping(table.value.headers);
  return { ok: true, headers: table.value.headers, rowCount: table.value.rowCount, suggested, ...mappingStatus(suggested) };
}

/** Merges admin thresholds (a loose record) over the engine defaults, keeping only known keys. */
export function mergeThresholds<T extends object>(defaults: T, overrides: Readonly<Record<string, number>> | undefined): T {
  const out: Record<string, number> = { ...(defaults as Record<string, number>) };
  if (overrides !== undefined) for (const k of Object.keys(out)) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out as T;
}

export interface ProcessInput {
  readonly csv: Uint8Array;
  readonly frames: readonly Uint8Array[];
  readonly ctx: EventContext;
  readonly preset?: MappingPreset;
  readonly presetId?: string;
  readonly manualTakeoverTime?: number;
  readonly ruleThresholds?: Readonly<Record<string, number>>;
  readonly chipThresholds?: Readonly<Record<string, number>>;
  readonly app?: string;
}

/** A grayscale thumbnail raster (RGBA, R = G = B = luma) for the canvas encoder. */
export interface ThumbRaster {
  readonly w: number;
  readonly h: number;
  readonly rgba: Uint8ClampedArray;
}

export interface FrameOutcome {
  readonly ok: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly message?: string;
}

export interface ProcessResult {
  readonly ok: true;
  readonly event: TtEventV1;
  readonly warnings: readonly EngineWarning[];
  readonly frames: readonly FrameOutcome[];
  readonly tTo: number;
  readonly insufficientChannels: boolean;
  /** Decoded 10 Hz window for the preview plot (null = masked sample). */
  readonly series: { readonly hz: number; readonly tStart: number; readonly channels: Readonly<Record<string, readonly (number | null)[]>> };
  /** Thumbnails of the decodable frames, in input order (index into `frames`). */
  readonly thumbs: readonly (ThumbRaster & { readonly frame: number })[];
  /** Serialised size of `tt.event` in bytes (target 12 KB, hard limit 32,768 B). */
  readonly eventBytes: number;
}

export type ProcessOutput = ProcessResult | { readonly ok: false; readonly errors: readonly EngineError[] };

/** Runs the engine on the picked files. Total: failures are returned, never thrown. */
export function processFiles(input: ProcessInput): ProcessOutput {
  const r = processEventFiles(
    { csv: input.csv, frames: input.frames },
    {
      ctx: input.ctx,
      ...(input.preset !== undefined ? { preset: input.preset, presetId: input.presetId ?? "custom" } : {}),
      ...(input.manualTakeoverTime !== undefined ? { manualTakeoverTime: input.manualTakeoverTime } : {}),
      ...(input.app !== undefined ? { app: input.app } : {}),
      thresholds: mergeThresholds<RuleThresholds>(DEFAULT_RULE_THRESHOLDS, input.ruleThresholds),
      chipThresholds: mergeThresholds<ChipThresholds>(DEFAULT_CHIP_THRESHOLDS, input.chipThresholds),
      synthetic: false,
    },
  );
  if (!r.ok) return { ok: false, errors: r.error };
  const p = r.value;
  const decoded = decodeTelemetryValues(p.event.tel);
  const channels: Record<string, (number | null)[]> = {};
  if (decoded.ok) for (const [k, values] of Object.entries(decoded.value)) channels[k] = values.map((x) => (Number.isFinite(x) ? x : null));
  const size = serializedSize(p.event);
  return {
    ok: true,
    event: p.event,
    warnings: p.warnings,
    frames: p.frames.map((f) => (f.ok ? { ok: true, width: f.value.width, height: f.value.height } : { ok: false, message: f.error.map((e) => e.message).join("; ") })),
    tTo: p.tTo,
    insufficientChannels: p.insufficientChannels,
    series: { hz: p.event.tel.hz, tStart: p.event.tel.tStart, channels },
    thumbs: thumbRasters(input.frames, p.frames.map((f) => f.ok)),
    eventBytes: size.ok ? size.value : Number.POSITIVE_INFINITY,
  };
}

/** Grayscale ≤ 160 px rasters of the frames the engine could decode (for `tt.thumbs`). */
export function thumbRasters(frames: readonly Uint8Array[], decodable: readonly boolean[]): (ThumbRaster & { frame: number })[] {
  const out: (ThumbRaster & { frame: number })[] = [];
  frames.forEach((bytes, i) => {
    if (decodable[i] !== true) return;
    const img = decodeJpeg(bytes);
    if (!img.ok) return;
    const small = downscale(img.value, THUMB_MAX_SIDE);
    if (!small.ok) return;
    const luma = toLuma(small.value);
    if (!luma.ok) return;
    const { width: w, height: h, data } = luma.value;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const y = data[p] ?? 0;
      rgba[p * 4] = y;
      rgba[p * 4 + 1] = y;
      rgba[p * 4 + 2] = y;
      rgba[p * 4 + 3] = 255;
    }
    out.push({ frame: i, w, h, rgba });
  });
  return out;
}
