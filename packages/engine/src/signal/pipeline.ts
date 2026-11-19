/**
 * CSV bytes → `takeover`, `sig` and `tel` blocks: parse, map, find t_to, resample,
 * quantise, then compute features on the decoded window (§5.1–§5.6, D2).
 */
import { ok, type MappingPreset, type Result, type TakeoverInfo, type TelemetryBlock } from "../schema/index.js";
import { parseCsv } from "../csv/parse.js";
import type { CsvTable, EngineWarning } from "../csv/types.js";
import { applyMapping } from "../mapping/apply.js";
import { detectTakeover } from "../resample/takeover.js";
import { resampleWindow } from "../resample/window.js";
import { quantiseWindow } from "../codec/telemetry.js";
import { analyzeSignal, type SignalAnalyzeOptions, type SignalAnalysis } from "./analyze.js";

export interface CsvSignalResult {
  readonly table: CsvTable;
  /** Takeover time in the CSV's time base. */
  readonly tTo: number;
  readonly takeover: TakeoverInfo;
  readonly tel: TelemetryBlock;
  readonly sig: SignalAnalysis;
  readonly warnings: readonly EngineWarning[];
  /** Mean raw sample rate in Hz over the whole file, 0 when it cannot be estimated. */
  readonly rawHz: number;
}

/** Mean raw sample rate: (n − 1) / (t_last − t_first); 0 for fewer than 2 samples. */
export function meanSampleRate(t: readonly number[]): number {
  const n = t.length;
  if (n < 2) return 0;
  const span = (t[n - 1] as number) - (t[0] as number);
  return span > 0 ? (n - 1) / span : 0;
}

export interface CsvSignalOptions extends Omit<SignalAnalyzeOptions, "brakeUnit"> {
  /** Takeover time entered in the modal (CSV time base). */
  readonly manualTakeoverTime?: number;
}

/** Runs the whole signal path. Errors from any stage are returned unchanged. */
export function analyzeCsvSignal(input: string | Uint8Array, preset: MappingPreset, options: CsvSignalOptions = {}): Result<CsvSignalResult> {
  const table = parseCsv(input);
  return table.ok ? analyzeTableSignal(table.value, preset, options) : table;
}

/** The signal path after parsing: map, find t_to, resample, quantise/decode, features and type. */
export function analyzeTableSignal(table: CsvTable, preset: MappingPreset, options: CsvSignalOptions = {}): Result<CsvSignalResult> {
  const series = applyMapping(table, preset);
  if (!series.ok) return series;
  const to = detectTakeover(series.value, options.manualTakeoverTime);
  if (!to.ok) return to;
  const { tel, window } = quantiseWindow(resampleWindow(series.value, to.value.tTo), preset.brakeUnit);
  const sig = analyzeSignal(window, { ...options, brakeUnit: preset.brakeUnit });
  return ok({
    table,
    tTo: to.value.tTo,
    takeover: { source: to.value.source, confidence: to.value.confidence },
    tel,
    sig,
    warnings: series.value.warnings,
    rawHz: meanSampleRate(series.value.t),
  });
}
