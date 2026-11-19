/**
 * Signal features F1..F10 on the 10 Hz window (ARCHITECTURE §5.3).
 */
import {
  FEATURE_IDS,
  FEATURE_SPECS,
  clampFeature,
  type BrakeUnit,
  type FeatureFlag,
  type FeatureFlags,
  type FeatureId,
  type FeatureVector,
  type SignalChannel,
} from "../schema/index.js";
import type { SignalWindow } from "../resample/window.js";
import { finiteSlice, indexAt, lowerMedian, maxOf, minOf, movingAverage5 } from "./smooth.js";

/** F2 lateral threshold (m). */
export const DRIFT_THRESHOLD_M = 0.3;
/** F4 brake-onset thresholds. */
export const BRAKE_ONSET_RATIO = 0.1;
export const BRAKE_ONSET_BAR = 3;
/** F4 value when there is no braking (s). */
export const NO_BRAKE_TTC_S = 10;

/** Feature values and flags. Missing keys are n/a; NaN never appears. */
export interface FeatureSet {
  readonly features: FeatureVector;
  readonly flags: FeatureFlags;
}

type Values = readonly number[];
type Ctx = { readonly ch: (c: SignalChannel) => Values; readonly brakeUnit: BrakeUnit };

const W_MINUS: readonly [number, number] = [indexAt(-5), indexAt(0)];
const absAll = (xs: readonly number[]): number[] => xs.map(Math.abs);

/** F2: seconds since |lane_offset| last rose above 0.30 m and stayed there until 0. */
export function driftLatency(lane: Values): number {
  let onset: number | null = null;
  for (let k = indexAt(0); k >= indexAt(-15); k--) {
    const x = lane[k];
    if (x === undefined || !Number.isFinite(x)) continue;
    if (Math.abs(x) <= DRIFT_THRESHOLD_M) break;
    onset = k;
  }
  if (onset === null) return 0;
  return (indexAt(0) - onset) / 10;
}

/** F4: ttc at the first sample in [−5, +2] with brake above threshold; 10 if none; NaN if ttc is masked there. */
export function brakeOnsetTtc(ttc: Values, brake: Values, brakeUnit: BrakeUnit): number {
  const th = brakeUnit === "bar" ? BRAKE_ONSET_BAR : BRAKE_ONSET_RATIO;
  for (let k = indexAt(-5); k <= indexAt(2); k++) {
    if ((brake[k] ?? NaN) > th) return ttc[k] ?? NaN;
  }
  return NO_BRAKE_TTC_S;
}

/** F5: max of −d(speed)/dt over [−5, +2] on the 5-tap smoothed speed (backward difference), ≥ 0. */
export function peakDecel(speed: Values): number {
  const sm = movingAverage5(speed);
  const decel: number[] = [];
  for (let k = indexAt(-5) + 1; k <= indexAt(2); k++) {
    const d = ((sm[k - 1] as number) - (sm[k] as number)) * 10;
    if (Number.isFinite(d)) decel.push(d);
  }
  return decel.length === 0 ? NaN : Math.max(0, maxOf(decel));
}

/** F9: max |yaw − median(yaw over [−15, −5])| over W⁻. */
export function yawRateDev(yaw: Values): number {
  const med = lowerMedian(finiteSlice(yaw, indexAt(-15), indexAt(-5)));
  return maxOf(finiteSlice(yaw, ...W_MINUS).map((y) => Math.abs(y - med)));
}

/** F10: max over k in W⁻ of (ttc(k−1 s) − ttc(k)) / ttc(k−1 s), floored at 0. */
export function ttcDropRate(ttc: Values): number {
  const drops: number[] = [];
  for (let k = indexAt(-5); k <= indexAt(0); k++) {
    const prev = ttc[k - 10];
    const cur = ttc[k];
    if (prev === undefined || cur === undefined || !(prev > 0) || !Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    drops.push((prev - cur) / prev);
  }
  return drops.length === 0 ? NaN : Math.max(0, maxOf(drops));
}

/** Raw (unclamped) value of each feature; NaN when no valid sample is available. */
const RAW: Readonly<Record<FeatureId, (c: Ctx) => number>> = {
  F1: ({ ch }) => maxOf(absAll(finiteSlice(ch("lane_offset"), ...W_MINUS))),
  F2: ({ ch }) => (finiteSlice(ch("lane_offset"), indexAt(-15), indexAt(0)).length === 0 ? NaN : driftLatency(ch("lane_offset"))),
  F3: ({ ch }) => minOf(finiteSlice(ch("ttc"), ...W_MINUS)),
  F4: ({ ch, brakeUnit }) => brakeOnsetTtc(ch("ttc"), ch("brake"), brakeUnit),
  F5: ({ ch }) => peakDecel(ch("speed")),
  F6: ({ ch }) => minOf(finiteSlice(ch("lane_conf"), indexAt(-3), indexAt(0))),
  F7: ({ ch }) => maxOf(absAll(finiteSlice(ch("steer_torque"), indexAt(-0.5), indexAt(0.5)))),
  F8: ({ ch }) => ch("speed")[indexAt(0)] ?? NaN,
  F9: ({ ch }) => yawRateDev(ch("yaw_rate")),
  F10: ({ ch }) => ttcDropRate(ch("ttc")),
};

/** Why a feature cannot be computed, or null when all its channels are usable. */
function unavailable(id: FeatureId, w: SignalWindow): FeatureFlag | null {
  const needs = FEATURE_SPECS[id].needs;
  if (needs.some((c) => w[c] === undefined)) return "channel-unmapped";
  if (needs.some((c) => w[c]?.usable !== true)) return "channel-coverage";
  return null;
}

/**
 * Computes F1..F10. A feature whose channel is unmapped or unusable (< 80 % coverage),
 * or whose sub-window has no valid sample, is left out with a flag. Present values are
 * clamped into their range (flag `clamped` when that changed the value).
 */
export function computeFeatures(window: SignalWindow, brakeUnit: BrakeUnit = "ratio"): FeatureSet {
  const features: { [K in FeatureId]?: number } = {};
  const flags: { [K in FeatureId]?: FeatureFlag } = {};
  const ctx: Ctx = { ch: (c) => window[c]?.values ?? [], brakeUnit };
  for (const id of FEATURE_IDS) {
    const why = unavailable(id, window);
    if (why !== null) {
      flags[id] = why;
      continue;
    }
    const raw = RAW[id](ctx);
    if (!Number.isFinite(raw)) {
      flags[id] = "channel-coverage";
      continue;
    }
    const c = clampFeature(id, raw);
    features[id] = c.value;
    if (c.clamped) flags[id] = "clamped";
  }
  return { features, flags };
}
