/**
 * Telemetry CSV writer with the deterministic format quirks of SEED_DATA §8.1 and §8.4.
 * Output is ASCII (plus a BOM for Q9), returned as bytes.
 */
import type { Rng } from "../rng/index.js";
import { GENERATOR_VERSION } from "../plan/profile.js";
import type { QuirkId } from "../types.js";
import { asciiEncode, concatBytes } from "../util/utf8.js";
import { quantize } from "../util/num.js";
import { QUANT, type NumericChannel, type RawTelemetry } from "./model.js";

/** Decimals printed per numeric channel. */
const DECIMALS: Readonly<Record<NumericChannel, number>> = {
  speed: 2, yaw_rate: 4, lane_offset: 3, steer_torque: 2, brake: 3, ttc: 2, lane_conf: 2, takeover: 0, accel_x: 2,
};

const DEFAULT_ORDER: readonly NumericChannel[] = ["speed", "yaw_rate", "lane_offset", "steer_torque", "brake", "ttc", "lane_conf", "takeover", "accel_x"];

/** One output column: header plus a per-row formatter. */
interface Column {
  readonly header: string;
  readonly cell: (row: number) => string;
}

export interface CsvWriteInput {
  readonly seed: number;
  readonly eventId: string;
  readonly raw: RawTelemetry;
  readonly quirks: readonly QuirkId[];
  /** Stream for quirk parameters (gap position, reordered rows). */
  readonly rng: Rng;
}

/** `# SYNTHETIC …` first line (§8.1). */
export function commentLine(seed: number, eventId: string): string {
  return `# SYNTHETIC DATA - Takeover Triage seedgen ${GENERATOR_VERSION} - seed ${seed} - ${eventId} - not real vehicle data`;
}

/** CSV file name for an event. */
export const csvFileName = (eventId: string): string => `SYNTHETIC_${eventId}.csv`;

function buildColumns(raw: RawTelemetry, quirks: readonly QuirkId[]): Column[] {
  const has = (q: QuirkId): boolean => quirks.includes(q);
  const fmt = (ch: NumericChannel) => (row: number): string => (raw.values[ch][row] ?? 0).toFixed(DECIMALS[ch]);
  const cols: Column[] = [];
  if (has("Q3")) cols.push({ header: "time_ms", cell: (r) => quantize((raw.tOffset + (raw.tau[r] ?? 0)) * 1000, 0.1).toFixed(1) });
  else cols.push({ header: "t", cell: (r) => (raw.tOffset + (raw.tau[r] ?? 0)).toFixed(4) });
  for (const ch of DEFAULT_ORDER) {
    if (ch === "speed" && has("Q2")) {
      cols.push({ header: "speed_kph", cell: (r) => quantize((raw.values.speed[r] ?? 0) * 3.6, QUANT.speed).toFixed(2) });
    } else if (ch === "takeover") {
      if (has("Q5")) continue;
      if (has("Q4")) cols.push({ header: "ad_active", cell: (r) => ((raw.values.takeover[r] ?? 0) === 1 ? "0" : "1") });
      else cols.push({ header: "takeover", cell: fmt(ch) });
    } else if (ch === "lane_conf" && has("Q6")) {
      continue;
    } else cols.push({ header: ch, cell: fmt(ch) });
  }
  cols.push({ header: "ad_mode", cell: (r) => ((raw.values.takeover[r] ?? 0) === 1 ? "OFF" : "ON") });
  return cols;
}

/** Row order after Q7 (0.7 s gap in [−15, −5] s) and Q8 (3 rows out of order + 1 duplicate). */
export function rowOrder(raw: RawTelemetry, quirks: readonly QuirkId[], rng: Rng): number[] {
  let rows = Array.from({ length: raw.tau.length }, (_, i) => i);
  if (quirks.includes("Q7")) {
    const g = rng.fork("Q7").range(-14, -6.5);
    rows = rows.filter((i) => {
      const t = raw.tau[i] ?? 0;
      return t < g || t > g + 0.7;
    });
  }
  if (quirks.includes("Q8")) {
    const q = rng.fork("Q8");
    const at = (sec: number): number => Math.max(1, Math.round((sec + 22) * raw.hz));
    const i = at(q.range(-21, -19));
    const j = at(q.range(-18, -17));
    const a = rows[i], b = rows[i + 1], c = rows[i + 2];
    if (a !== undefined && b !== undefined && c !== undefined) rows.splice(i, 3, c, a, b);
    const d = rows[j];
    if (d !== undefined) rows.splice(j + 1, 0, d);
  }
  return rows;
}

/** Writes the CSV for one event, applying its quirks. */
export function writeTelemetryCsv(input: CsvWriteInput): Uint8Array {
  const { raw, quirks } = input;
  const decimalComma = quirks.includes("Q1");
  const delim = decimalComma ? ";" : ",";
  const cols = buildColumns(raw, quirks);
  const lines: string[] = [];
  if (!quirks.includes("Q9")) lines.push(commentLine(input.seed, input.eventId));
  lines.push(cols.map((c) => c.header).join(delim));
  for (const r of rowOrder(raw, quirks, input.rng)) {
    const cells = cols.map((c) => c.cell(r));
    lines.push((decimalComma ? cells.map((s) => s.replace(".", ",")) : cells).join(delim));
  }
  const body = asciiEncode(`${lines.join("\n")}\n`);
  return quirks.includes("Q9") ? concatBytes([Uint8Array.of(0xef, 0xbb, 0xbf), body]) : body;
}
