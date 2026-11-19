import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { binomialCdf, binomialUpperTail, clopperPearson, holm, logGamma } from "../src/stats/index.js";

// Reference values computed with scipy.stats (binom.sf, beta.ppf).
describe("stats: reference values", () => {
  it("logGamma matches factorials", () => {
    expect(Math.exp(logGamma(1))).toBeCloseTo(1, 12);
    expect(Math.exp(logGamma(6))).toBeCloseTo(120, 9);
    expect(logGamma(101)).toBeCloseTo(363.73937555556347, 9); // ln(100!)
  });

  it("binomial upper tail matches scipy", () => {
    expect(binomialUpperTail(8, 8, 2400 / 5500)).toBeCloseTo(0.0013145842289154321, 14);
    expect(binomialUpperTail(30, 100, 0.2)).toBeCloseTo(0.011248978720991648, 12);
    expect(binomialUpperTail(5, 12, 0.3)).toBeCloseTo(0.2763445304699998, 12);
  });

  it("Clopper-Pearson matches scipy beta.ppf", () => {
    const ci = clopperPearson(3, 10);
    expect(ci.lower).toBeCloseTo(0.06673951117773447, 9);
    expect(ci.upper).toBeCloseTo(0.6524528500599973, 9);
    expect(clopperPearson(0, 10).lower).toBe(0);
    expect(clopperPearson(10, 10).upper).toBe(1);
  });

  it("Holm adjusts step-down and stays monotone", () => {
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]);
    expect(holm([])).toEqual([]);
  });
});

describe("stats: properties", () => {
  const binArgs = fc.record({
    n: fc.integer({ min: 0, max: 200 }),
    p: fc.double({ min: 0, max: 1, noNaN: true }),
  });

  it("tail is in [0,1] and non-increasing in k", () => {
    fc.assert(
      fc.property(binArgs, ({ n, p }) => {
        let prev = 1;
        for (let k = 0; k <= n + 1; k++) {
          const t = binomialUpperTail(k, n, p);
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(1);
          expect(t).toBeLessThanOrEqual(prev + 1e-12);
          prev = t;
        }
      }),
    );
  });

  it("CDF + upper tail = 1", () => {
    fc.assert(
      fc.property(binArgs, fc.nat(250), ({ n, p }, k0) => {
        const k = k0 % (n + 1);
        expect(binomialCdf(k, n, p) + binomialUpperTail(k + 1, n, p)).toBeCloseTo(1, 10);
      }),
    );
  });

  it("Clopper-Pearson interval contains the point estimate", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 150 }), fc.nat(150), (n, k0) => {
        const k = k0 % (n + 1);
        const { lower, upper } = clopperPearson(k, n);
        expect(lower).toBeLessThanOrEqual(k / n + 1e-12);
        expect(upper).toBeGreaterThanOrEqual(k / n - 1e-12);
      }),
    );
  });

  it("Holm never decreases a p-value and caps at 1", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 30 }), (ps) => {
        const adj = holm(ps);
        adj.forEach((a, i) => {
          expect(a).toBeGreaterThanOrEqual(ps[i] as number);
          expect(a).toBeLessThanOrEqual(1);
        });
      }),
    );
  });
});
