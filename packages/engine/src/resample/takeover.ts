/**
 * Takeover time detection (ARCHITECTURE §5.2 step 1).
 */
import { err, ok, type Result, type TakeoverConfidence, type TakeoverSource } from "../schema/index.js";
import type { MappedSeries } from "../mapping/apply.js";

/** Heuristic thresholds (§5.2 1.iii). */
export const HEURISTIC_TORQUE_NM = 3.0;
export const HEURISTIC_BRAKE_RATIO = 0.2;
export const HEURISTIC_BRAKE_BAR = 5;
/** The condition must hold this long (s). */
export const HEURISTIC_HOLD_S = 0.2;
/** ... after at least this long (s) below threshold. */
export const HEURISTIC_QUIET_S = 2;

/** Detected takeover time in the CSV's time base. */
export interface TakeoverTime {
  readonly tTo: number;
  readonly source: TakeoverSource;
  readonly confidence: TakeoverConfidence;
}

/**
 * Time of the first rising edge of the `takeover` flag: the first finite sample ≥ 0.5
 * whose previous finite sample is < 0.5. NaN samples are skipped. Null when none.
 */
export function flagRisingEdge(t: readonly number[], flag: readonly number[]): number | null {
  let prev: number | null = null;
  for (let i = 0; i < t.length; i++) {
    const v = flag[i] as number;
    if (Number.isNaN(v)) continue;
    if (prev !== null && prev < 0.5 && v >= 0.5) return t[i] as number;
    prev = v;
  }
  return null;
}

/** Per-sample heuristic condition: |torque| > 3 Nm or brake above its threshold. NaN counts as false. */
export function heuristicActive(series: MappedSeries): boolean[] {
  const torque = series.channels.steer_torque;
  const brake = series.channels.brake;
  const brakeMax = series.brakeUnit === "bar" ? HEURISTIC_BRAKE_BAR : HEURISTIC_BRAKE_RATIO;
  return series.t.map((_, i) => {
    const q = torque?.[i] ?? NaN;
    const b = brake?.[i] ?? NaN;
    return Math.abs(q) > HEURISTIC_TORQUE_NM || b > brakeMax;
  });
}

/**
 * First time `t[i]` where the condition starts a run lasting ≥ 0.2 s (t[last] − t[i])
 * and the preceding below-threshold run lasted ≥ 2 s (t[i] − t[start of quiet run]).
 */
export function heuristicOnset(t: readonly number[], active: readonly boolean[]): number | null {
  let quietStart: number | null = null;
  let i = 0;
  while (i < t.length) {
    if (!active[i]) {
      quietStart ??= t[i] as number;
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < t.length && active[j + 1]) j++;
    const quietOk = quietStart !== null && (t[i] as number) - quietStart >= HEURISTIC_QUIET_S;
    if (quietOk && (t[j] as number) - (t[i] as number) >= HEURISTIC_HOLD_S) return t[i] as number;
    quietStart = null;
    i = j + 1;
  }
  return null;
}

/**
 * Finds `t_to` in priority order: flag rising edge, manual time, heuristic, else
 * `E_NO_TAKEOVER`. The heuristic gives `confidence: "low"`; the others `"high"`.
 * A non-finite manual time is ignored.
 */
export function detectTakeover(series: MappedSeries, manualTime?: number): Result<TakeoverTime> {
  const flag = series.channels.takeover;
  const edge = flag === undefined ? null : flagRisingEdge(series.t, flag);
  if (edge !== null) return ok({ tTo: edge, source: "flag", confidence: "high" });
  if (manualTime !== undefined && Number.isFinite(manualTime)) return ok({ tTo: manualTime, source: "manual", confidence: "high" });
  const h = heuristicOnset(series.t, heuristicActive(series));
  if (h !== null) return ok({ tTo: h, source: "heuristic", confidence: "low" });
  return err([{ code: "E_NO_TAKEOVER", message: "no takeover found; enter the takeover time manually" }]);
}
