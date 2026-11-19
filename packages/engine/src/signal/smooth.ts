/**
 * Window helpers for feature extraction (ARCHITECTURE §5.2 step 4, §5.3).
 */
import { WINDOW_HZ, WINDOW_ZERO_INDEX } from "../schema/index.js";

/** Window sample index of time `s` seconds (integer arithmetic). */
export const indexAt = (s: number): number => WINDOW_ZERO_INDEX + Math.round(s * WINDOW_HZ);

/**
 * Centred 5-tap moving average. Samples within 2 of either end, or whose taps include
 * a NaN, are NaN.
 */
export function movingAverage5(v: readonly number[]): number[] {
  return v.map((_, k) => {
    if (k < 2 || k + 2 >= v.length) return NaN;
    const s = (v[k - 2] as number) + (v[k - 1] as number) + (v[k] as number) + (v[k + 1] as number) + (v[k + 2] as number);
    return s / 5;
  });
}

/** Finite values of `v[from..to]` (inclusive). */
export function finiteSlice(v: readonly number[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let k = from; k <= to; k++) {
    const x = v[k];
    if (x !== undefined && Number.isFinite(x)) out.push(x);
  }
  return out;
}

/** Max of a non-empty list, or NaN when empty. */
export const maxOf = (xs: readonly number[]): number => (xs.length === 0 ? NaN : xs.reduce((a, b) => (b > a ? b : a)));
/** Min of a non-empty list, or NaN when empty. */
export const minOf = (xs: readonly number[]): number => (xs.length === 0 ? NaN : xs.reduce((a, b) => (b < a ? b : a)));

/** Lower median (an actual sample for even counts), or NaN when empty. */
export function lowerMedian(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] as number;
}
