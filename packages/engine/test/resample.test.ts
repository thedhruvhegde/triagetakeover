import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { MappedSeries } from "../src/mapping/index.js";
import {
  channelWindow,
  detectTakeover,
  flagRisingEdge,
  heuristicOnset,
  interpolateAt,
  resampleChannel,
  resampleWindow,
} from "../src/resample/index.js";
import { WINDOW_N, WINDOW_ZERO_INDEX, windowTime, type SignalChannel } from "../src/schema/index.js";

/** Builds a raw series sampled at `hz` over [t0, t1] from channel functions. */
function series(
  fns: { [K in SignalChannel]?: (t: number) => number },
  opts: { hz?: number; t0?: number; t1?: number; brakeUnit?: "ratio" | "bar" } = {},
): MappedSeries {
  const hz = opts.hz ?? 100;
  const t0 = opts.t0 ?? 0;
  const n = Math.round(((opts.t1 ?? 30) - t0) * hz) + 1;
  const t = Array.from({ length: n }, (_, i) => t0 + i / hz);
  const channels: { [K in SignalChannel]?: number[] } = {};
  for (const [k, f] of Object.entries(fns) as [SignalChannel, (t: number) => number][]) channels[k] = t.map(f);
  return { t, channels, brakeUnit: opts.brakeUnit ?? "ratio", lines: t.map((_, i) => i + 2), warnings: [] };
}

describe("resample: takeover time", () => {
  it("prefers the flag rising edge", () => {
    const s = series({ takeover: (t) => (t >= 20 ? 1 : 0), steer_torque: (t) => (t > 10 ? 5 : 0) });
    expect(detectTakeover(s, 12)).toEqual({ ok: true, value: { tTo: 20, source: "flag", confidence: "high" } });
  });

  it("ignores a flag that starts high (no rising edge) and skips NaN samples", () => {
    expect(flagRisingEdge([0, 1, 2], [1, 1, 1])).toBeNull();
    expect(flagRisingEdge([0, 1, 2, 3], [0, NaN, NaN, 1])).toBe(3);
  });

  it("uses the manual time when there is no edge", () => {
    const s = series({ takeover: () => 0 });
    expect(detectTakeover(s, 17.5)).toEqual({ ok: true, value: { tTo: 17.5, source: "manual", confidence: "high" } });
  });

  it("falls back to the torque or brake heuristic with low confidence", () => {
    const torque = series({ steer_torque: (t) => (t >= 21 && t < 21.5 ? 4 : 0.5) });
    const r = detectTakeover(torque);
    expect(r.ok && r.value.source).toBe("heuristic");
    expect(r.ok && r.value.confidence).toBe("low");
    expect(r.ok && r.value.tTo).toBeCloseTo(21, 9);
    const bar = series({ brake: (t) => (t >= 18 ? 6 : 0) }, { brakeUnit: "bar" });
    const rb = detectTakeover(bar);
    expect(rb.ok && rb.value.tTo).toBeCloseTo(18, 9);
    const ratioTooLow = series({ brake: (t) => (t >= 18 ? 4 : 0) }, { brakeUnit: "bar" });
    expect(detectTakeover(ratioTooLow).ok).toBe(false);
  });

  it("requires ≥ 0.2 s hold and ≥ 2 s quiet before", () => {
    const t = Array.from({ length: 100 }, (_, i) => i / 10);
    // Short blip at 3.0–3.1 s (0.1 s) is ignored; quiet only 1 s before 4 s; real onset at 7 s.
    const active = t.map((x) => (x >= 3 && x < 3.15) || (x >= 4 && x < 4.5) || x >= 7);
    expect(heuristicOnset(t, active)).toBe(7);
  });

  it("returns E_NO_TAKEOVER otherwise", () => {
    const r = detectTakeover(series({ speed: () => 20 }));
    expect(!r.ok && r.error[0]?.code).toBe("E_NO_TAKEOVER");
  });
});

describe("resample: window", () => {
  it("has 201 samples with sample 150 at t_to", () => {
    const s = series({ speed: (t) => t });
    const w = resampleWindow(s, 20);
    expect(w.speed?.values).toHaveLength(WINDOW_N);
    expect(w.speed?.values[WINDOW_ZERO_INDEX]).toBeCloseTo(20, 9);
    expect(w.speed?.values[0]).toBeCloseTo(5, 9);
    expect(w.speed?.usable).toBe(true);
    expect(w.lane_offset).toBeUndefined();
  });

  it("interpolates linearly and masks across gaps > 0.5 s", () => {
    expect(interpolateAt([0, 0.4], [0, 10], 0.1)).toBe(2.5);
    expect(interpolateAt([0, 1], [0, 10], 0.25)).toBeNaN();
    expect(interpolateAt([0, 0.5], [0, 10], 0.25)).toBe(5);
    expect(interpolateAt([0, 0.6], [0, 10], 0.3)).toBeNaN();
    expect(interpolateAt([0, 0.6], [0, 10], 0.6)).toBe(10);
    expect(interpolateAt([0, 0.4], [0, 10], -0.1)).toBeNaN();
    expect(interpolateAt([0, 0.4], [0, 10], 0.5)).toBeNaN();
  });

  it("a 0.7 s raw gap masks ~7 samples and the channel stays usable (Q7)", () => {
    const s = series({ speed: () => 25 });
    const keep = s.t.map((t) => !(t > 10 && t < 10.7));
    const t = s.t.filter((_, i) => keep[i]);
    const v = (s.channels.speed ?? []).filter((_, i) => keep[i]);
    const out = channelWindow(resampleChannel(t, v, 20));
    expect(out.values.filter(Number.isNaN).length).toBe(6);
    expect(out.usable).toBe(true);
  });

  it("NaN raw cells become gaps", () => {
    const t = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const v = [1, NaN, NaN, NaN, NaN, NaN, NaN, 1];
    expect(interpolateAt(t.filter((_, i) => !Number.isNaN(v[i])), [1, 1], 0.3)).toBeNaN();
    expect(resampleChannel(t, v, 15.3).every(Number.isNaN)).toBe(true);
  });

  it("marks channels below 80 % coverage unusable", () => {
    const s = series({ speed: () => 1 }, { t0: 0, t1: 30 });
    expect(resampleWindow(s, 5).speed?.usable).toBe(false); // window starts at −10 s: 100/201 missing
    expect(resampleWindow(s, 13).speed?.usable).toBe(true); // 20/201 missing
    expect(resampleWindow(s, 15).speed?.usable).toBe(true);
    expect(channelWindow([]).coverage).toBe(0);
  });
});

describe("resample: properties", () => {
  const rawTimes = fc
    .uniqueArray(fc.integer({ min: 0, max: 30_000 }), { minLength: 2, maxLength: 400 })
    .map((xs) => [...xs].sort((a, b) => a - b).map((x) => x / 1000));

  it("a constant signal resamples to the same constant", () => {
    fc.assert(
      fc.property(rawTimes, fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.double({ min: 0, max: 30, noNaN: true }), (t, c, tTo) => {
        for (const v of resampleChannel(t, t.map(() => c), tTo)) if (!Number.isNaN(v)) expect(v).toBe(c);
      }),
    );
  });

  it("a linear signal is reproduced at grid points (within ε)", () => {
    fc.assert(
      fc.property(rawTimes, fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: -10, max: 10, noNaN: true }), fc.double({ min: 0, max: 30, noNaN: true }), (t, a, b, tTo) => {
        const out = resampleChannel(t, t.map((x) => a * x + b), tTo);
        out.forEach((v, k) => {
          if (!Number.isNaN(v)) expect(Math.abs(v - (a * (tTo + windowTime(k)) + b))).toBeLessThan(1e-9 * (1 + Math.abs(a) * 50 + Math.abs(b)));
        });
      }),
    );
  });

  it("no output sample interpolates across a > 0.5 s gap", () => {
    fc.assert(
      fc.property(rawTimes, fc.double({ min: 0, max: 30, noNaN: true }), (t, tTo) => {
        const out = resampleChannel(t, t.map(() => 1), tTo);
        out.forEach((v, k) => {
          const x = tTo + windowTime(k);
          const exact = t.includes(x);
          const lo = [...t].reverse().find((r) => r <= x);
          const hi = t.find((r) => r >= x);
          const bridged = lo !== undefined && hi !== undefined && hi - lo <= 0.5;
          if (!Number.isNaN(v)) expect(exact || bridged).toBe(true);
          else expect(exact).toBe(false);
        });
      }),
      { numRuns: 300 },
    );
  });
});
