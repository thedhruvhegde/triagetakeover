/**
 * 10 Hz window resampling with linear interpolation and gap masks (ARCHITECTURE §5.2).
 */
import {
  MIN_CHANNEL_COVERAGE,
  RESAMPLE_MAX_GAP_S,
  SIGNAL_CHANNELS,
  WINDOW_N,
  windowTime,
  type SignalChannel,
} from "../schema/index.js";
import type { MappedSeries } from "../mapping/apply.js";

/** One channel in the window: {@link WINDOW_N} samples, NaN where masked. */
export interface ChannelWindow {
  readonly values: readonly number[];
  /** Number of finite samples. */
  readonly valid: number;
  /** valid / WINDOW_N. */
  readonly coverage: number;
  /** coverage ≥ {@link MIN_CHANNEL_COVERAGE}; features of an unusable channel are n/a. */
  readonly usable: boolean;
}

/** The resampled window; a missing channel was not mapped. */
export type SignalWindow = { readonly [K in SignalChannel]?: ChannelWindow };

/** Wraps sample values (any length; normally WINDOW_N) with coverage bookkeeping. */
export function channelWindow(values: readonly number[]): ChannelWindow {
  let valid = 0;
  for (const v of values) if (Number.isFinite(v)) valid++;
  const coverage = values.length === 0 ? 0 : valid / values.length;
  return { values, valid, coverage, usable: coverage >= MIN_CHANNEL_COVERAGE };
}

/** Builds a window from raw per-channel sample arrays (e.g. decoded telemetry). */
export function windowFromValues(channels: { readonly [K in SignalChannel]?: readonly number[] }): SignalWindow {
  const out: { [K in SignalChannel]?: ChannelWindow } = {};
  for (const ch of SIGNAL_CHANNELS) {
    const v = channels[ch];
    if (v !== undefined) out[ch] = channelWindow(v);
  }
  return out;
}

/** Largest index i with t[i] ≤ x, or -1. `t` is sorted ascending. */
function floorIndex(t: readonly number[], x: number): number {
  let lo = 0;
  let hi = t.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((t[mid] as number) <= x) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Linear interpolation of finite samples (t ascending) at `x`; NaN outside or across a gap. */
export function interpolateAt(t: readonly number[], v: readonly number[], x: number, maxGap = RESAMPLE_MAX_GAP_S): number {
  const i = floorIndex(t, x);
  if (i < 0) return NaN;
  const t0 = t[i] as number;
  const v0 = v[i] as number;
  if (t0 === x) return v0;
  if (i + 1 >= t.length) return NaN;
  const t1 = t[i + 1] as number;
  if (t1 - t0 > maxGap) return NaN;
  const v1 = v[i + 1] as number;
  if (v1 === v0) return v0; // keeps constants exact (including −0)
  return v0 + (v1 - v0) * ((x - t0) / (t1 - t0));
}

/**
 * Resamples one raw channel onto the window around `tTo`: sample k is at
 * `tTo + (k − 150) / 10`. NaN raw samples are dropped first, so a dropout becomes a
 * gap; output samples between raw samples more than 0.5 s apart, or outside the raw
 * range, are NaN.
 */
export function resampleChannel(t: readonly number[], values: readonly number[], tTo: number): number[] {
  const ft: number[] = [];
  const fv: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const v = values[i] as number;
    if (Number.isFinite(v)) {
      ft.push(t[i] as number);
      fv.push(v);
    }
  }
  const out = new Array<number>(WINDOW_N);
  for (let k = 0; k < WINDOW_N; k++) out[k] = interpolateAt(ft, fv, tTo + windowTime(k));
  return out;
}

/** Resamples every mapped channel of a series into the [−15 s, +5 s] window. */
export function resampleWindow(series: MappedSeries, tTo: number): SignalWindow {
  const out: { [K in SignalChannel]?: ChannelWindow } = {};
  for (const ch of SIGNAL_CHANNELS) {
    const v = series.channels[ch];
    if (v !== undefined) out[ch] = channelWindow(resampleChannel(series.t, v, tTo));
  }
  return out;
}
