import { describe, expect, it } from "vitest";
import { createFakeClient, createUiClient, readEnvelope } from "../src/client.js";
import { formatInstant, formatKm, formatNumber, formatP, formatPercent, groupThousands, onsetVerdictLabel, pValueInWords, plural } from "../src/format.js";
import { channelDomain, describeChannel, displayChannels, linePath, sharedDomain, summariseChannel, timeTicks } from "../src/plot-math.js";

describe("format", () => {
  it("formats numbers, percents, km and p-values deterministically", () => {
    expect(formatNumber(1.23456, 2)).toBe("1.23");
    expect(formatNumber(null)).toBe("–");
    expect(formatNumber(Number.NaN)).toBe("–");
    expect(formatPercent(0.785)).toBe("79%");
    expect(formatPercent(1.4)).toBe("100%");
    expect(groupThousands(1234567)).toBe("1,234,567");
    expect(formatKm(2560.4)).toBe("2,560 km");
    expect(formatP(0.0013)).toBe("0.0013");
    expect(formatP(0.00031)).toBe("3.1e-4");
    expect(formatP(0.41)).toBe("0.41");
    expect(formatP(1e-15)).toBe("< 1e-12");
    expect(formatP(null)).toBe("–");
  });

  it("puts p-values in plain words without causal language", () => {
    expect(pValueInWords(0.0025)).toBe("If the rate had not changed, a rise at least this large would happen by chance about 1 time in 400.");
    expect(pValueInWords(0.04)).toContain("1 time in 25");
    expect(pValueInWords(0.7)).toContain("common by chance");
    expect(pValueInWords(null)).toContain("not enough data");
    for (const p of [0.5, 0.01, 0.0001, 0]) expect(pValueInWords(p)).not.toMatch(/caused|probability that/i);
  });

  it("labels onset verdicts as the PRD does", () => {
    expect(onsetVerdictLabel("regression-likely")).toBe("Regression likely (p < 0.01)");
    expect(onsetVerdictLabel("not-enough-data")).toBe("Not enough data");
  });

  it("formats instants without the Date object", () => {
    expect(formatInstant("2026-11-14T09:12:33Z")).toBe("2026-11-14 09:12 UTC");
    expect(formatInstant("2026-11-14T09:12:33.5+01:00")).toBe("2026-11-14 09:12 UTC+01:00");
    expect(formatInstant(null)).toBe("–");
    expect(plural(1, "event")).toBe("1 event");
    expect(plural(1200, "event")).toBe("1,200 events");
  });
});

describe("plot math", () => {
  const s = { key: "K", hz: 10, tStart: -15, channels: { lane_conf: [0.9, 0.5, null, 0.2], speed: [null, null, null, null] } };

  it("pads domains and gives flat or empty channels a usable range", () => {
    const [lo, hi] = channelDomain([0, 10]);
    expect(lo).toBeCloseTo(-0.5);
    expect(hi).toBeCloseTo(10.5);
    expect(channelDomain([2, 2])).toEqual([1.5, 2.5]);
    expect(channelDomain([null, Number.NaN])).toEqual([0, 1]);
    const shared = sharedDomain([s, { ...s, channels: { lane_conf: [0, 1] } }], "lane_conf");
    expect(shared[0]).toBeLessThan(0);
    expect(shared[1]).toBeGreaterThan(1);
  });

  it("breaks the line at masked samples", () => {
    const d = linePath(s, s.channels.lane_conf, (t) => t, (v) => v);
    expect(d.match(/M/g)?.length).toBe(2);
    expect(d.startsWith("M-15.0 0.9")).toBe(true);
  });

  it("lists only channels with data and describes them for screen readers", () => {
    expect(displayChannels(s)).toEqual(["lane_conf"]);
    expect(summariseChannel(s, "lane_conf")).toMatchObject({ min: 0.2, max: 0.9, missing: 1 });
    expect(describeChannel(s, "lane_conf")).toBe("Lane confidence (0..1): min 0.20 at -14.7 s, max 0.90 at -15.0 s, 1 missing samples.");
    expect(describeChannel(s, "speed")).toBe("Speed: no data.");
    expect(timeTicks(-15, 5)).toEqual([-15, -10, -5, 0, 5]);
  });
});

describe("client", () => {
  it("passes envelopes through and never throws", async () => {
    const ok = createUiClient<{ m: { req: { a: number }; res: string } }>(async () => ({ ok: true, data: "x", warnings: ["w", 3] }));
    expect(await ok.call("m", { a: 1 })).toEqual({ ok: true, data: "x", warnings: ["w"] });
    const thrown = createUiClient<{ m: { req: null; res: string } }>(async () => {
      throw new Error("bridge down");
    });
    const r = await thrown.call("m", null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "unavailable", retryable: true });
  });

  it("turns malformed responses into errors", () => {
    expect(readEnvelope("nope")).toMatchObject({ ok: false, error: { code: "error" } });
    expect(readEnvelope({ ok: false, error: { code: "conflict", message: "undo first", retryable: false, details: [{ path: "a", message: "b" }, 3] } })).toEqual({
      ok: false,
      error: { code: "conflict", message: "undo first", retryable: false, details: [{ path: "a", message: "b" }] },
    });
  });

  it("fake client records calls and answers not-implemented for unknown methods", async () => {
    const c = createFakeClient<{ a: { req: number; res: number }; b: { req: number; res: number } }>({ a: (n) => n * 2 });
    expect(await c.call("a", 2)).toEqual({ ok: true, data: 4, warnings: [] });
    expect((await c.call("b", 1)).ok).toBe(false);
    expect(c.calls.map((x) => x.method)).toEqual(["a", "b"]);
  });
});
