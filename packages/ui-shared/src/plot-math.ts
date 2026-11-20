/**
 * Pure geometry for the SVG plots (no DOM): axis domains, path strings and text summaries.
 */
import type { SeriesLike } from "./types.js";

export interface ChannelMeta {
  readonly label: string;
  readonly unit: string;
}

/** Display names of the 8 stored signal channels (ARCHITECTURE §5.1). */
export const CHANNEL_META: Readonly<Record<string, ChannelMeta>> = {
  lane_offset: { label: "Lane offset", unit: "m" },
  lane_conf: { label: "Lane confidence", unit: "0..1" },
  ttc: { label: "Time to collision", unit: "s" },
  brake: { label: "Brake", unit: "0..1 / bar" },
  speed: { label: "Speed", unit: "m/s" },
  steer_torque: { label: "Steering torque", unit: "Nm" },
  yaw_rate: { label: "Yaw rate", unit: "rad/s" },
  takeover: { label: "Takeover flag", unit: "0/1" },
};

/** Order in which channels are shown when the caller does not choose. */
export const DEFAULT_CHANNEL_ORDER = ["lane_offset", "lane_conf", "ttc", "brake", "speed", "steer_torque", "yaw_rate"] as const;

export function channelMeta(channel: string): ChannelMeta {
  return CHANNEL_META[channel] ?? { label: channel, unit: "" };
}

/** Channels present in a series, in display order (the takeover flag is left out). */
export function displayChannels(series: SeriesLike, wanted?: readonly string[]): string[] {
  const order = wanted ?? DEFAULT_CHANNEL_ORDER;
  return order.filter((c) => {
    const v = series.channels[c];
    return v !== undefined && v.some((x) => x !== null && Number.isFinite(x));
  });
}

export type Domain = readonly [number, number];

/** Min/max of the finite values, padded 5 %; a flat or empty channel gets a unit-wide domain. */
export function channelDomain(values: readonly (number | null)[]): Domain {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v === null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) {
    const half = Math.max(Math.abs(lo) * 0.1, 0.5);
    return [lo - half, hi + half];
  }
  const pad = (hi - lo) * 0.05;
  return [lo - pad, hi + pad];
}

/** One domain covering the channel across several series ("same axes", PRD US-10 AC2). */
export function sharedDomain(series: readonly SeriesLike[], channel: string): Domain {
  const all: (number | null)[] = [];
  for (const s of series) all.push(...(s.channels[channel] ?? []));
  return channelDomain(all);
}

/** Time (s, relative to the takeover) of sample `k`. */
export function sampleTime(series: Pick<SeriesLike, "hz" | "tStart">, k: number): number {
  return series.tStart + k / series.hz;
}

export interface Frame {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** Maps a time range onto the frame's x range. */
export function xScale(tMin: number, tMax: number, f: Frame): (t: number) => number {
  const span = tMax - tMin || 1;
  return (t) => f.x0 + ((t - tMin) / span) * (f.x1 - f.x0);
}

/** Maps a value domain onto the frame's y range (SVG y grows downwards). */
export function yScale(d: Domain, f: Frame): (v: number) => number {
  const span = d[1] - d[0] || 1;
  return (v) => f.y1 - ((v - d[0]) / span) * (f.y1 - f.y0);
}

/** SVG path for a sampled channel; null samples break the line (a gap is shown as a gap). */
export function linePath(series: Pick<SeriesLike, "hz" | "tStart">, values: readonly (number | null)[], x: (t: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, k) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(sampleTime(series, k)).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

/** Time range covered by a series. */
export function timeRange(series: SeriesLike): readonly [number, number] {
  const n = Math.max(0, ...Object.values(series.channels).map((v) => v.length));
  return [series.tStart, sampleTime(series, Math.max(0, n - 1))];
}

export interface ChannelSummary {
  readonly min: number;
  readonly minAt: number;
  readonly max: number;
  readonly maxAt: number;
  readonly atTakeover: number | null;
  readonly missing: number;
}

/** Text summary of a channel for screen readers (min / max with times, value at t = 0). */
export function summariseChannel(series: SeriesLike, channel: string): ChannelSummary | null {
  const values = series.channels[channel];
  if (values === undefined) return null;
  let min = Infinity;
  let max = -Infinity;
  let minAt = 0;
  let maxAt = 0;
  let missing = 0;
  let atTakeover: number | null = null;
  values.forEach((v, k) => {
    const t = sampleTime(series, k);
    if (v === null || !Number.isFinite(v)) {
      missing++;
      return;
    }
    if (Math.abs(t) < 0.5 / series.hz) atTakeover = v;
    if (v < min) {
      min = v;
      minAt = t;
    }
    if (v > max) {
      max = v;
      maxAt = t;
    }
  });
  if (!Number.isFinite(min)) return null;
  return { min, minAt, max, maxAt, atTakeover, missing };
}

/** "Lane confidence (0..1): min 0.22 at -1.2 s, max 0.95 at -14.0 s, 0.30 at takeover." */
export function describeChannel(series: SeriesLike, channel: string): string {
  const s = summariseChannel(series, channel);
  const m = channelMeta(channel);
  if (s === null) return `${m.label}: no data.`;
  const at = s.atTakeover === null ? "" : `, ${round(s.atTakeover)} at takeover`;
  const gaps = s.missing > 0 ? `, ${s.missing} missing samples` : "";
  return `${m.label} (${m.unit}): min ${round(s.min)} at ${s.minAt.toFixed(1)} s, max ${round(s.max)} at ${s.maxAt.toFixed(1)} s${at}${gaps}.`;
}

function round(v: number): string {
  const a = Math.abs(v);
  return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}

/** Tick values for a time axis (every `step` seconds, including 0). */
export function timeTicks(tMin: number, tMax: number, step = 5): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(tMin / step) * step; t <= tMax + 1e-9; t += step) out.push(Math.abs(t) < 1e-9 ? 0 : t);
  return out;
}
