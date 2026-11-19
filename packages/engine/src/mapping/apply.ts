/**
 * Applies a mapping preset to a parsed CSV: canonical time base, unit multipliers,
 * inversion, sort by `t`, duplicate removal and gap check (ARCHITECTURE §5.1).
 */
import {
  SIGNAL_CHANNELS,
  err,
  ok,
  type BrakeUnit,
  type EngineError,
  type MappingPreset,
  type Result,
  type SignalChannel,
} from "../schema/index.js";
import type { CsvTable, EngineWarning } from "../csv/types.js";
import { isIsoTimestamp, parseIsoSeconds } from "./iso.js";

/** Consecutive (sorted) time steps larger than this are an `E_TIME_NONMONOTONIC_GAP`. */
export const MAX_RAW_DT_S = 10;

/** Canonical raw time series, sorted by strictly increasing `t`. */
export interface MappedSeries {
  /** Time in seconds, strictly increasing. */
  readonly t: readonly number[];
  /** Mapped signal channels; same length as `t`; NaN where the cell was not numeric. */
  readonly channels: { readonly [K in SignalChannel]?: readonly number[] };
  readonly brakeUnit: BrakeUnit;
  /** 1-based physical line per sample. */
  readonly lines: readonly number[];
  readonly warnings: readonly EngineWarning[];
}

/** Index of a header, or -1. */
const columnIndex = (table: CsvTable, header: string): number => table.headers.indexOf(header.trim());

/** Reads the time column: ISO-8601 when its first non-empty cell is ISO, else numeric × multiplier. */
function readTime(table: CsvTable, col: number, multiplier: number): number[] {
  const cells = table.cells[col] ?? [];
  const first = cells.find((c) => c.trim() !== "");
  if (first !== undefined && isIsoTimestamp(first)) return cells.map(parseIsoSeconds);
  return (table.values[col] ?? []).map((v) => v * multiplier);
}

/** Reads a signal column with its multiplier and optional inversion (`1 − v`). */
function readSignal(table: CsvTable, col: number, multiplier: number, invert: boolean): number[] {
  return (table.values[col] ?? []).map((v) => {
    const x = v * multiplier;
    return invert ? 1 - x : x;
  });
}

/** Resolves every mapped column; collects missing-header errors. */
function resolveColumns(table: CsvTable, preset: MappingPreset, errs: EngineError[]): Map<"t" | SignalChannel, number> {
  const out = new Map<"t" | SignalChannel, number>();
  const tHeader = preset.columns.t;
  if (tHeader === undefined) errs.push({ code: "E_MAPPING_NO_TIME", message: "the time channel `t` is not mapped" });
  for (const ch of ["t", ...SIGNAL_CHANNELS] as const) {
    const header = preset.columns[ch];
    if (header === undefined) continue;
    const idx = columnIndex(table, header);
    if (idx < 0) errs.push({ code: "E_MAPPING_COLUMN_MISSING", message: `column "${header}" for ${ch} not found`, column: header });
    else out.set(ch, idx);
  }
  return out;
}

/**
 * Maps a CSV table to canonical channels. Rows are sorted by `t` (stable); a duplicate
 * `t` keeps the first row in file order and adds `W_DUPLICATE_TIME`. A row whose time
 * is not a finite number is an `E_TIME_INVALID`; a sorted step larger than
 * {@link MAX_RAW_DT_S} is an `E_TIME_NONMONOTONIC_GAP` at the later row.
 */
export function applyMapping(table: CsvTable, preset: MappingPreset): Result<MappedSeries> {
  const errs: EngineError[] = [];
  const cols = resolveColumns(table, preset, errs);
  const tCol = cols.get("t");
  if (errs.length > 0 || tCol === undefined) return err(errs);
  const t = readTime(table, tCol, preset.multipliers.t ?? 1);
  const badRow = t.findIndex((x) => !Number.isFinite(x));
  if (badRow >= 0) {
    return err([{ code: "E_TIME_INVALID", message: "time cell is not a number", row: table.lines[badRow] ?? 0, column: table.headers[tCol] ?? "" }]);
  }
  const raw = new Map<SignalChannel, number[]>();
  for (const ch of SIGNAL_CHANNELS) {
    const idx = cols.get(ch);
    if (idx !== undefined) raw.set(ch, readSignal(table, idx, preset.multipliers[ch] ?? 1, preset.invert[ch] === true));
  }
  return sortAndCheck(t, raw, table.lines, preset.brakeUnit, table.headers[tCol] ?? "t");
}

/** Sorts by time, drops duplicates, checks gaps, and assembles the series. */
function sortAndCheck(
  t: readonly number[],
  raw: ReadonlyMap<SignalChannel, readonly number[]>,
  lines: readonly number[],
  brakeUnit: BrakeUnit,
  tHeader: string,
): Result<MappedSeries> {
  const order = t.map((_, i) => i).sort((a, b) => (t[a] as number) - (t[b] as number) || a - b);
  const keep: number[] = [];
  const warnings: EngineWarning[] = [];
  for (const i of order) {
    const prev = keep[keep.length - 1];
    if (prev !== undefined && t[prev] === t[i]) {
      warnings.push({ code: "W_DUPLICATE_TIME", message: `duplicate t = ${t[i]}; kept the first row`, row: lines[i] ?? 0, column: tHeader });
      continue;
    }
    if (prev !== undefined && (t[i] as number) - (t[prev] as number) > MAX_RAW_DT_S) {
      return err([{ code: "E_TIME_NONMONOTONIC_GAP", message: `time step ${(t[i] as number) - (t[prev] as number)} s exceeds ${MAX_RAW_DT_S} s`, row: lines[i] ?? 0, column: tHeader }]);
    }
    keep.push(i);
  }
  if (order.some((v, k) => v !== k)) warnings.push({ code: "W_UNSORTED_TIME", message: "rows were not sorted by time; sorted" });
  const channels: { [K in SignalChannel]?: readonly number[] } = {};
  for (const [ch, vals] of raw) channels[ch] = keep.map((i) => vals[i] as number);
  return ok({ t: keep.map((i) => t[i] as number), channels, brakeUnit, lines: keep.map((i) => lines[i] as number), warnings });
}
