/**
 * Telemetry channel models (SEED_DATA §8.2) and archetype overlays (§8.3).
 *
 * Latent (noise-free) signals are built on a fixed 100 Hz grid over the raw window, so the
 * shape of an event does not depend on the vehicle's sample rate. Raw samples are then read
 * from the grid by linear interpolation, white noise is added per raw sample, and values are
 * quantised. Time is relative to the latent takeover (τ = 0).
 */
import type { Rng } from "../rng/index.js";
import { CSV_POST_S, CSV_PRE_S, ROUTE_SPEED } from "../plan/profile.js";
import type { LatentId, RoleId, Route } from "../types.js";
import { clamp, quantize, smoothstep } from "../util/num.js";

/** Numeric channels written to the CSV (decoys included). */
export const NUMERIC_CHANNELS = ["speed", "yaw_rate", "lane_offset", "steer_torque", "brake", "ttc", "lane_conf", "takeover", "accel_x"] as const;
export type NumericChannel = (typeof NUMERIC_CHANNELS)[number];

/** Quantisation step per channel (§8.2). */
export const QUANT: Readonly<Record<NumericChannel, number>> = {
  speed: 0.01, yaw_rate: 0.0001, lane_offset: 0.001, steer_torque: 0.01, brake: 0.004, ttc: 0.01, lane_conf: 0.01, takeover: 1, accel_x: 0.01,
};

/** "No target" TTC; the engine clamps at 10 s. */
export const TTC_NO_TARGET = 10;

const GRID_HZ = 100;
const GRID_N = (CSV_PRE_S + CSV_POST_S) * GRID_HZ + 1;
const gridTime = (i: number): number => -CSV_PRE_S + i / GRID_HZ;

/** Archetype parameters drawn per event (PRE-REGISTERED ranges chosen to hit §8.5 targets). */
export interface ArchetypeParams {
  readonly archetype: LatentId;
  /** +1 = left, −1 = right. */
  readonly sign: number;
  readonly v0: number;
  /** Peak latent lane offset at τ = 0 (m) and latency of the 0.30 m crossing (s). */
  readonly driftPeak: number;
  readonly driftLatency: number;
  readonly laneConfMin: number;
  readonly torqueSpike: number;
  readonly ttcEnd: number;
  readonly ttcRatio: number;
  readonly brakePedal: number;
  readonly decel: number;
  readonly brakeLead: number;
  readonly curveRadius: number;
  readonly curveStart: number;
  readonly yawPeak: number;
}

function routeSpeed(rng: Rng, route: Route): number {
  const [lo, hi] = ROUTE_SPEED[route];
  return rng.range(lo, hi);
}

/** Draws the archetype parameters. Planted P1a/P1b force a left drift; AMB1/AMB2 use boundary ranges. */
export function drawArchetypeParams(rng: Rng, archetype: LatentId, roles: readonly RoleId[], route: Route): ArchetypeParams {
  const forcedLeft = roles.includes("P1a") || roles.includes("P1b");
  const sign = forcedLeft ? 1 : rng.chance(0.5) ? 1 : -1;
  const amb1 = roles.includes("AMB1");
  const amb2 = roles.includes("AMB2");
  const base: ArchetypeParams = {
    archetype, sign, v0: routeSpeed(rng, route), driftPeak: 0, driftLatency: 0, laneConfMin: 1, torqueSpike: 0,
    ttcEnd: TTC_NO_TARGET, ttcRatio: 1, brakePedal: 0, decel: 0, brakeLead: 0, curveRadius: 0, curveStart: 0, yawPeak: 0,
  };
  switch (archetype) {
    case "LC-A":
      return {
        ...base, driftPeak: rng.range(0.66, 0.8), driftLatency: rng.range(1.7, 2.2),
        laneConfMin: amb1 ? rng.range(0.39, 0.45) : rng.range(0.1, 0.2), torqueSpike: rng.range(3.9, 5.0),
      };
    case "LC-B":
      return {
        ...base, ttcEnd: amb2 ? rng.range(1.9, 2.1) : rng.range(0.82, 1.0), ttcRatio: amb2 ? rng.range(0.47, 0.53) : rng.range(0.68, 0.78),
        brakePedal: rng.range(0.5, 0.8), decel: rng.range(5.2, 6.8),
      };
    case "LC-C":
      return {
        ...base, driftPeak: rng.range(0.72, 0.88), driftLatency: rng.range(3.6, 4.4), torqueSpike: rng.range(2.3, 3.1),
        curveRadius: rng.range(500, 900), curveStart: rng.range(-6.5, -5.7),
      };
    case "LC-D":
      return { ...base, decel: rng.range(4.2, 5.3), brakeLead: rng.range(0.8, 1.5), torqueSpike: rng.range(0.6, 1.2) };
    case "NOVEL-1":
      return {
        ...base, v0: rng.range(19.5, 22.5), driftPeak: rng.range(0.95, 1.2), driftLatency: rng.range(0.35, 0.65),
        laneConfMin: rng.range(0.03, 0.08), torqueSpike: rng.range(6.4, 7.6), decel: rng.range(1.0, 1.6), yawPeak: rng.range(0.065, 0.09),
      };
  }
}

/** Trapezoid pulse on [a, b] with `edge` second ramps. */
function pulse(t: number, a: number, b: number, edge: number): number {
  if (t <= a || t >= b) return 0;
  return Math.min(1, (t - a) / edge, (b - t) / edge);
}

/** Latent signals on the 100 Hz grid. */
export interface LatentTrace {
  readonly speed: Float64Array;
  readonly accel: Float64Array;
  readonly yaw: Float64Array;
  readonly laneOffset: Float64Array;
  readonly laneConf: Float64Array;
  readonly torque: Float64Array;
  readonly brake: Float64Array;
  readonly ttc: Float64Array;
}

/** Linear drift reaching 0.30 m at −latency and `peak` at 0, then a 1.5 s correction (LC-A, LC-C). */
function linearDrift(t: number, peak: number, latency: number): number {
  const rate = (peak - 0.3) / latency;
  const start = -latency - 0.3 / rate;
  if (t < start) return 0;
  if (t <= 0) return rate * (t - start);
  return peak * (1 - smoothstep(t / 1.5));
}

/** Deceleration (m/s², ≥ 0) imposed by the archetype at time t. */
function archetypeDecel(p: ArchetypeParams, t: number): number {
  if (p.archetype === "LC-B") return p.decel * pulse(t, 0, 4, 0.2);
  if (p.archetype === "LC-D") return p.decel * pulse(t, -p.brakeLead, 0.2, 0.2);
  if (p.archetype === "NOVEL-1") return p.decel * pulse(t, -1, 2, 0.3);
  return 0;
}

function archetypeTtc(p: ArchetypeParams, t: number): number {
  if (p.archetype !== "LC-B") return TTC_NO_TARGET;
  const q = p.ttcRatio;
  if (t < -8) return TTC_NO_TARGET;
  if (t < -5) return Math.min(TTC_NO_TARGET, p.ttcEnd / q ** 5);
  if (t <= 0.3) return Math.min(TTC_NO_TARGET, p.ttcEnd * q ** t);
  return Math.min(TTC_NO_TARGET, p.ttcEnd * q ** 0.3 + (t - 0.3) * 3);
}

function archetypeLane(p: ArchetypeParams, t: number): number {
  if (p.archetype === "LC-A" || p.archetype === "LC-C") return p.sign * linearDrift(t, p.driftPeak, p.driftLatency);
  if (p.archetype === "NOVEL-1") {
    const start = -p.driftLatency - 0.15;
    const dur = p.driftLatency + 0.15;
    if (t <= 0) return p.sign * p.driftPeak * smoothstep((t - start) / dur);
    return p.sign * p.driftPeak * (1 - smoothstep(t / 1.2));
  }
  return 0;
}

function archetypeLaneConf(p: ArchetypeParams, t: number, base: number): number {
  let drop = 0;
  if (p.archetype === "LC-A") {
    const rate = (p.driftPeak - 0.3) / p.driftLatency;
    const fallStart = -p.driftLatency - 0.3 / rate - 0.5;
    drop = smoothstep((t - fallStart) / 0.5);
  } else if (p.archetype === "NOVEL-1") {
    drop = smoothstep((t + p.driftLatency) / 0.2);
  } else return base;
  const recover = t > 0.5 ? smoothstep((t - 0.5) / 2) : 0;
  const low = base + (p.laneConfMin - base) * drop;
  return low + (base - low) * recover;
}

function archetypeYaw(p: ArchetypeParams, t: number, v: number): number {
  if (p.archetype === "LC-C") return (p.sign * v * smoothstep((t - p.curveStart) / 1.0)) / p.curveRadius;
  if (p.archetype === "NOVEL-1") {
    const start = -p.driftLatency - 0.15;
    const lobe = p.driftLatency + 0.55;
    const x = (t - start) / lobe;
    if (x > 0 && x < 1) return p.sign * p.yawPeak * Math.sin(Math.PI * x);
    if (x >= 1 && x < 2) return -p.sign * 0.7 * p.yawPeak * Math.sin(Math.PI * (x - 1));
  }
  return 0;
}

function archetypeTorque(p: ArchetypeParams, t: number): number {
  if (p.torqueSpike === 0) return 0;
  const spike = -p.sign * p.torqueSpike * pulse(t, 0, 0.4, 0.05);
  const fade = p.archetype === "LC-C" ? -p.sign * 0.4 * smoothstep((t + 6) / 1.0) * (t < 0 ? 1 : 0) : 0;
  return spike + fade;
}

/** AR(1) process on the grid with coefficient `phi` and innovation std `sigma`, started at stationarity. */
function ar1(rng: Rng, phi: number, sigma: number): Float64Array {
  const out = new Float64Array(GRID_N);
  let x = (sigma / Math.sqrt(1 - phi * phi)) * rng.normal();
  for (let i = 0; i < GRID_N; i++) {
    x = phi * x + sigma * rng.normal();
    out[i] = x;
  }
  return out;
}

/** Builds every latent channel on the grid for one event. */
export function buildLatent(rng: Rng, p: ArchetypeParams): LatentTrace {
  const period = rng.fork("speed").range(12, 20);
  const phase = rng.fork("speed-phase").range(0, 2 * Math.PI);
  const laneWander = ar1(rng.fork("lane-wander"), 0.98, 0.01);
  const confBase = rng.fork("conf").range(0.8, 0.95);
  const confWander = ar1(rng.fork("conf-wander"), 0.995, 0.0015);
  const torqueAr = ar1(rng.fork("torque"), 0.95, 0.3 * Math.sqrt(1 - 0.95 * 0.95));
  const speed = new Float64Array(GRID_N);
  const accel = new Float64Array(GRID_N);
  const yaw = new Float64Array(GRID_N);
  const laneOffset = new Float64Array(GRID_N);
  const laneConf = new Float64Array(GRID_N);
  const torque = new Float64Array(GRID_N);
  const brake = new Float64Array(GRID_N);
  const ttc = new Float64Array(GRID_N);
  let lost = 0;
  for (let i = 0; i < GRID_N; i++) {
    const t = gridTime(i);
    const w = (2 * Math.PI) / period;
    const decel = archetypeDecel(p, t);
    lost += decel / GRID_HZ;
    const v = Math.max(0, p.v0 + 0.3 * Math.sin(w * t + phase) - lost);
    speed[i] = v;
    accel[i] = v > 0 ? 0.3 * w * Math.cos(w * t + phase) - decel : 0;
    yaw[i] = archetypeYaw(p, t, v);
    laneOffset[i] = (laneWander[i] ?? 0) + archetypeLane(p, t);
    laneConf[i] = clamp(archetypeLaneConf(p, t, confBase + (confWander[i] ?? 0)), 0, 1);
    torque[i] = (torqueAr[i] ?? 0) + archetypeTorque(p, t);
    brake[i] = p.archetype === "LC-B" ? p.brakePedal * pulse(t, 0, 5, 0.2) : 0;
    ttc[i] = archetypeTtc(p, t);
  }
  return { speed, accel, yaw, laneOffset, laneConf, torque, brake, ttc };
}

/** Reads a grid signal at relative time t by linear interpolation (clamped at the ends). */
export function sampleGrid(g: Float64Array, t: number): number {
  const x = clamp((t + CSV_PRE_S) * GRID_HZ, 0, GRID_N - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = g[i] ?? 0;
  const b = g[Math.min(GRID_N - 1, i + 1)] ?? a;
  return a + (b - a) * f;
}

/** Raw telemetry samples, ready for the CSV writer. */
export interface RawTelemetry {
  readonly hz: number;
  /** Sample times relative to the latent takeover (s). */
  readonly tau: Float64Array;
  /** Session-relative time of τ = 0, i.e. CSV `t` = tOffset + τ. */
  readonly tOffset: number;
  /** Flag rising edge relative to τ = 0 (jitter ±0.15 s). */
  readonly flagJitter: number;
  readonly values: Readonly<Record<NumericChannel, Float64Array>>;
}

/** Samples the latent trace at the vehicle's rate, adds white noise (§8.2) and quantises. */
export function sampleRaw(rng: Rng, latent: LatentTrace, hz: number, jitter: number): RawTelemetry {
  const n = (CSV_PRE_S + CSV_POST_S) * hz + 1;
  const dt = 1 / hz;
  const timing = rng.fork("timing");
  const tOffset = Math.round(timing.range(300, 3000) * 100) / 100 + CSV_PRE_S;
  const flagJitter = timing.range(-0.15, 0.15);
  const tau = new Float64Array(n);
  for (let i = 0; i < n; i++) tau[i] = -CSV_PRE_S + i * dt + (jitter > 0 && i > 0 && i < n - 1 ? timing.range(-jitter, jitter) * dt : 0);
  const noise = (ch: string): Rng => rng.fork(`noise:${ch}`);
  const ns = noise("speed"), ny = noise("yaw"), nl = noise("lane"), nt = noise("torque"), nc = noise("conf"), nk = noise("ttc"), na = noise("accel");
  const yawBias = 0.002 * ny.normal();
  const values = Object.fromEntries(NUMERIC_CHANNELS.map((c) => [c, new Float64Array(n)])) as Record<NumericChannel, Float64Array>;
  let held = 0;
  for (let i = 0; i < n; i++) {
    const t = tau[i] ?? 0;
    const conf = sampleGrid(latent.laneConf, t);
    let lane = sampleGrid(latent.laneOffset, t) + 0.02 * nl.normal();
    if (conf < 0.3) {
      lane += 0.08 * nl.normal();
      if (i > 0 && nl.chance(0.1)) lane = held;
    }
    held = lane;
    const ttc = sampleGrid(latent.ttc, t);
    values.speed[i] = quantize(Math.max(0, sampleGrid(latent.speed, t) + 0.05 * ns.normal()), QUANT.speed);
    values.yaw_rate[i] = quantize(sampleGrid(latent.yaw, t) + yawBias + 0.003 * ny.normal(), QUANT.yaw_rate);
    values.lane_offset[i] = quantize(lane, QUANT.lane_offset);
    values.steer_torque[i] = quantize(sampleGrid(latent.torque, t) + 0.05 * nt.normal(), QUANT.steer_torque);
    values.brake[i] = quantize(sampleGrid(latent.brake, t), QUANT.brake);
    values.ttc[i] = quantize(ttc >= TTC_NO_TARGET ? TTC_NO_TARGET : clamp(ttc + 0.05 * nk.normal(), 0, TTC_NO_TARGET), QUANT.ttc);
    values.lane_conf[i] = quantize(clamp(conf + 0.02 * nc.normal(), 0, 1), QUANT.lane_conf);
    values.takeover[i] = t >= flagJitter ? 1 : 0;
    values.accel_x[i] = quantize(sampleGrid(latent.accel, t) + 0.2 * na.normal(), QUANT.accel_x);
  }
  return { hz, tau, tOffset, flagJitter, values };
}
