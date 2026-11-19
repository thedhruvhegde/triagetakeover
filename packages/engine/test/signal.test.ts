import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { channelWindow, type SignalWindow } from "../src/resample/index.js";
import {
  DEFAULT_RULE_THRESHOLDS,
  analyzeCsvSignal,
  analyzeSignal,
  brakeOnsetTtc,
  classifyType,
  computeFeatures,
  driftLatency,
  lowerMedian,
  movingAverage5,
  peakDecel,
  ttcDropRate,
} from "../src/signal/index.js";
import { formatCsv } from "../src/csv/index.js";
import { suggestMapping } from "../src/mapping/index.js";
import {
  DEFAULT_SCALES,
  FEATURE_IDS,
  FEATURE_SPECS,
  SIGNAL_CHANNELS,
  WINDOW_N,
  windowTime,
  type FeatureVector,
  type SignalChannel,
} from "../src/schema/index.js";

function must<T>(x: T | undefined | null): T {
  if (x === undefined || x === null) throw new Error("missing value");
  return x;
}

type Fns = { [K in SignalChannel]?: (tau: number) => number };
const grid = (f: (tau: number) => number): number[] => Array.from({ length: WINDOW_N }, (_, k) => f(windowTime(k)));
const win = (fns: Fns): SignalWindow => {
  const out: { [K in SignalChannel]?: ReturnType<typeof channelWindow> } = {};
  for (const [k, f] of Object.entries(fns) as [SignalChannel, (t: number) => number][]) out[k] = channelWindow(grid(f));
  return out;
};

/** Copy of a window without one channel (i.e. that channel unmapped). */
function without(w: SignalWindow, c: SignalChannel): SignalWindow {
  return Object.fromEntries(Object.entries(w).filter(([k]) => k !== c)) as SignalWindow;
}

const calm: Fns = {
  speed: () => 30,
  yaw_rate: () => 0,
  lane_offset: () => 0.05,
  steer_torque: () => 0.5,
  brake: () => 0,
  ttc: () => 10,
  lane_conf: () => 0.85,
  takeover: (t) => (t >= 0 ? 1 : 0),
};
const drift = (t: number): number => (t > -2 ? 0.05 + 0.375 * (t + 2) : 0.05);

const ARCHETYPES: Record<string, Fns> = {
  "lane-loss": { ...calm, lane_offset: drift, lane_conf: (t) => (t > -1.5 ? 0.2 : 0.85), steer_torque: (t) => (t >= 0 && t < 0.4 ? 4 : 0.5) },
  "lateral-drift": { ...calm, lane_offset: drift },
  "late-brake": { ...calm, ttc: (t) => (t < -5 ? 4 : 4 * 0.7 ** (Math.min(t, 0) + 5)), brake: (t) => (t >= -1 ? 0.6 : 0) },
  "cut-in-response": { ...calm, ttc: (t) => (t < -2 ? 8 : 2) },
  "phantom-brake": { ...calm, speed: (t) => (t < -1.2 ? 30 : 30 - 5 * (t + 1.2)) },
  unknown: calm,
};

describe("signal: feature helpers", () => {
  it("driftLatency measures from the last upward crossing of 0.30 m", () => {
    expect(driftLatency(grid(drift))).toBeCloseTo(1.3, 12); // crosses 0.30 m at −1.33 s; first sample above is −1.3 s
    expect(driftLatency(grid(() => 0.1))).toBe(0);
    expect(driftLatency(grid(() => -0.5))).toBe(15);
    expect(driftLatency(grid((t) => (t > -3 && t < -2 ? 0.5 : 0.1)))).toBe(0);
  });

  it("brakeOnsetTtc uses ratio or bar thresholds and 10 without braking", () => {
    const ttc = grid((t) => 5 + t);
    expect(brakeOnsetTtc(ttc, grid((t) => (t >= -1 ? 0.2 : 0)), "ratio")).toBeCloseTo(4, 12);
    expect(brakeOnsetTtc(ttc, grid(() => 0.05), "ratio")).toBe(10);
    expect(brakeOnsetTtc(ttc, grid((t) => (t >= -2 ? 4 : 1)), "bar")).toBeCloseTo(3, 12);
  });

  it("peakDecel is ≥ 0 and finds a constant decel", () => {
    expect(peakDecel(grid((t) => 30 - 5 * Math.max(0, t + 1)))).toBeCloseTo(5, 9);
    expect(peakDecel(grid((t) => 20 + t))).toBe(0);
  });

  it("ttcDropRate takes the max relative drop over 1 s", () => {
    expect(ttcDropRate(grid((t) => (t < -2 ? 8 : 2)))).toBeCloseTo(0.75, 12);
    expect(ttcDropRate(grid(() => 10))).toBe(0);
  });

  it("smoothing and medians", () => {
    expect(movingAverage5([1, 2, 3, 4, 5, 6])).toEqual([NaN, NaN, 3, 4, NaN, NaN]);
    expect(lowerMedian([4, 1, 3, 2])).toBe(2);
    expect(lowerMedian([])).toBeNaN();
  });
});

describe("signal: features", () => {
  it("computes the lane-loss archetype", () => {
    const { features, flags } = computeFeatures(win(must(ARCHETYPES["lane-loss"])));
    expect(features.F1).toBeCloseTo(0.8, 9);
    expect(features.F2).toBeCloseTo(1.3, 9);
    expect(features.F3).toBe(10);
    expect(features.F4).toBe(10);
    expect(features.F5).toBe(0);
    expect(features.F6).toBe(0.2);
    expect(features.F7).toBe(4);
    expect(features.F8).toBe(30);
    expect(features.F9).toBe(0);
    expect(features.F10).toBe(0);
    expect(flags).toEqual({});
  });

  it("flags unmapped, unusable and clamped features", () => {
    const w = without(win({ ...calm, ttc: () => 25 }), "yaw_rate");
    const lc = grid(() => 0.9).map((v, k) => (k % 3 === 0 ? NaN : v));
    const { features, flags } = computeFeatures({ ...w, lane_conf: channelWindow(lc) });
    expect(flags.F9).toBe("channel-unmapped");
    expect(flags.F6).toBe("channel-coverage");
    expect(flags.F3).toBe("clamped");
    expect(features.F3).toBe(10);
    expect(features.F9).toBeUndefined();
    expect(features.F6).toBeUndefined();
  });

  it("is n/a (coverage) when a sub-window is fully masked even if the channel is usable", () => {
    const v = grid(() => 30).map((x, k) => (k === 150 ? NaN : x));
    const { features, flags } = computeFeatures({ speed: channelWindow(v) });
    expect(features.F8).toBeUndefined();
    expect(flags.F8).toBe("channel-coverage");
  });
});

describe("signal: type rules", () => {
  it.each(Object.entries(ARCHETYPES))("classifies %s", (type, fns) => {
    expect(analyzeSignal(win(fns)).type).toBe(type);
  });

  it("R-LD-1 fires when lane_conf is unmapped (Q6), not when it is unusable", () => {
    const noConfWin = without(win(must(ARCHETYPES["lane-loss"])), "lane_conf");
    const r = analyzeSignal(noConfWin);
    expect(r.ruleId).toBe("R-LD-1");
    const bad = grid(() => 0.9).map((v, k) => (k % 2 ? NaN : v));
    expect(analyzeSignal({ ...noConfWin, lane_conf: channelWindow(bad) }).ruleId).toBe("R-UN");
  });

  it("first match wins: cut-in beats late-brake", () => {
    const f: FeatureVector = { F10: 0.6, F3: 1, F4: 0.5, F1: 0, F5: 0, F6: 0.9 };
    expect(classifyType(f).ruleId).toBe("R-CI-1");
    expect(classifyType({ ...f, F10: 0.4 }).ruleId).toBe("R-LB-1");
  });

  it("margins are (x − θ)/s for the evaluated tests", () => {
    const f: FeatureVector = { F1: 0.71, F3: 10, F4: 10, F5: 0.4, F6: 0.19, F10: 0 };
    const c = classifyType(f);
    expect(c.ruleId).toBe("R-LL-1");
    expect(c.margins.F6).toBeCloseTo(-2.1, 9);
    expect(c.margins.F1).toBeCloseTo(1.4, 9);
    expect(c.margins.F10).toBeCloseTo(-0.5 / 0.15, 9);
    expect(c.margins.F3).toBeCloseTo(6 / 0.75, 9); // nearest of thresholds 3, 2, 4
  });

  it("unknown without type-deciding channels, flagged insufficient", () => {
    const r = analyzeSignal(win({ speed: must(calm.speed), steer_torque: must(calm.steer_torque) }));
    expect(r).toMatchObject({ type: "unknown", ruleId: "R-UN", insufficientChannels: true });
    expect(classifyType({})).toEqual({ type: "unknown", ruleId: "R-UN", margins: {} });
  });

  it("honours custom thresholds", () => {
    const f: FeatureVector = { F1: 0.4, F6: 0.9 };
    expect(classifyType(f).ruleId).toBe("R-UN");
    expect(classifyType(f, {}, { ...DEFAULT_RULE_THRESHOLDS, ldLatOffset: 0.3 }).ruleId).toBe("R-LD-1");
  });
});

describe("signal: pipeline", () => {
  it("runs CSV → sig/tel with comment line and decoys", () => {
    const fns = must(ARCHETYPES["lane-loss"]);
    const rows: (number | string)[][] = [];
    for (let i = 0; i <= 3000; i++) {
      const t = 1834.2 + i / 100;
      const tau = t - (1834.2 + 22);
      rows.push([t, ...SIGNAL_CHANNELS.map((c) => must(fns[c])(tau)), tau < 0 ? "ON" : "OFF"]);
    }
    const csv = "# SYNTHETIC DATA - test\n" + formatCsv(["t", ...SIGNAL_CHANNELS, "ad_mode"], rows);
    const r = analyzeCsvSignal(csv, suggestMapping(["t", ...SIGNAL_CHANNELS, "ad_mode"]));
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.takeover).toEqual({ source: "flag", confidence: "high" });
    expect(r.value.tTo).toBeCloseTo(1856.2, 6);
    expect(r.value.sig.type).toBe("lane-loss");
    expect(r.value.tel.data).toHaveLength(4288);
    expect(r.value.table.nanCounts.at(-1)).toBe(3001);
  });

  it("propagates stage errors", () => {
    const r = analyzeCsvSignal("t,speed\n0,1\n0.1,1\n", suggestMapping(["t", "speed"]));
    expect(!r.ok && r.error[0]?.code).toBe("E_NO_TAKEOVER");
  });
});

describe("signal: properties", () => {
  const sample = fc.oneof(
    { weight: 8, arbitrary: fc.double({ min: -1e4, max: 1e4, noNaN: true }) },
    { weight: 1, arbitrary: fc.constant(NaN) },
  );
  const channel = fc.array(sample, { minLength: WINDOW_N, maxLength: WINDOW_N }).map(channelWindow);
  const window = fc.record(
    Object.fromEntries(SIGNAL_CHANNELS.map((c) => [c, channel])) as Record<SignalChannel, fc.Arbitrary<ReturnType<typeof channelWindow>>>,
    { requiredKeys: [] },
  );

  it("features are never NaN/Infinity and stay within clamp ranges", () => {
    fc.assert(
      fc.property(window, fc.constantFrom("ratio" as const, "bar" as const), (w, unit) => {
        const { features, flags } = computeFeatures(w, unit);
        for (const id of FEATURE_IDS) {
          const v = features[id];
          if (v === undefined) {
            expect(flags[id]).toMatch(/^channel-/);
            continue;
          }
          const [lo, hi] = FEATURE_SPECS[id].range;
          expect(Number.isFinite(v) && v >= lo && v <= hi).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(window, (w) => {
        expect(analyzeSignal(w)).toEqual(analyzeSignal(w));
      }),
      { numRuns: 100 },
    );
  });

  it("sub-threshold noise (|δ| < 0.1·sᵢ) does not change type when every |margin| > 1", () => {
    const vec = fc.record(
      Object.fromEntries(FEATURE_IDS.map((id) => [id, fc.double({ min: FEATURE_SPECS[id].range[0], max: FEATURE_SPECS[id].range[1], noNaN: true })])) as Record<
        (typeof FEATURE_IDS)[number],
        fc.Arbitrary<number>
      >,
      { requiredKeys: [] },
    );
    const noise = fc.array(fc.double({ min: -0.0999, max: 0.0999, noNaN: true }), { minLength: 10, maxLength: 10 });
    fc.assert(
      fc.property(vec, noise, (f, d) => {
        const c = classifyType(f);
        fc.pre(Object.values(c.margins).every((m) => Math.abs(m) > 1));
        const g: Record<string, number> = {};
        FEATURE_IDS.forEach((id, i) => {
          const v = f[id];
          if (v !== undefined) g[id] = v + (d[i] as number) * DEFAULT_SCALES[id];
        });
        expect(classifyType(g).type).toBe(c.type);
      }),
      { numRuns: 1000 },
    );
  });
});
