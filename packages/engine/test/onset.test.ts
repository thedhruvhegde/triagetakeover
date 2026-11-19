import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { applyHolm, compareSemver, onsetScan, type BuildExposure } from "../src/onset/index.js";

describe("onsetScan", () => {
  it("reproduces the ARCHITECTURE §5.9 worked example", () => {
    const r = onsetScan([
      { build: "4.11.x", events: 0, km: 3100 },
      { build: "4.12.0", events: 8, km: 2400 },
    ]);
    expect(r.pRaw).toBeCloseTo(0.0013145842289154321, 14);
    expect(r.pScan).toBeCloseTo(0.0013145842289154321, 14); // m = 1
    expect(r.onsetBuild).toBe("4.12.0");
    expect(r.verdict).toBe("regression-likely");
    expect(r.rateRatio).toBe(Infinity);
    expect(r.rateRatioCi95?.upper).toBe(Infinity);
  });

  it("Bonferroni-corrects over boundaries and picks the best split", () => {
    const r = onsetScan([
      { build: "4.11.0", events: 0, km: 1500 },
      { build: "4.11.3", events: 0, km: 1600 },
      { build: "4.12.0", events: 8, km: 2400 },
    ]);
    expect(r.onsetBuild).toBe("4.12.0");
    expect(r.pScan).toBeCloseTo(2 * (r.pRaw as number), 14);
  });

  it("returns not-enough-data for thin input and excludes zero-exposure builds", () => {
    expect(onsetScan([]).verdict).toBe("not-enough-data");
    expect(onsetScan([{ build: "a", events: 5, km: 10 }]).verdict).toBe("not-enough-data");
    const r = onsetScan([
      { build: "a", events: 1, km: 100 },
      { build: "b", events: 1, km: 100 },
    ]);
    expect(r.verdict).toBe("not-enough-data");
    const z = onsetScan([
      { build: "a", events: 0, km: 0 },
      { build: "b", events: 2, km: 100 },
      { build: "c", events: 2, km: 100 },
    ]);
    expect(z.excludedBuilds).toEqual(["a"]);
  });

  it("finds no evidence when rates are equal", () => {
    const r = onsetScan([
      { build: "1", events: 10, km: 1000 },
      { build: "2", events: 10, km: 1000 },
    ]);
    expect(r.verdict).toBe("no-evidence");
  });

  it("rejects invalid input", () => {
    expect(() => onsetScan([{ build: "x", events: -1, km: 1 }])).toThrow(RangeError);
    expect(() => onsetScan([{ build: "x", events: 1, km: Number.NaN }])).toThrow(RangeError);
  });

  const buildsArb = fc.array(
    fc.record({ events: fc.nat(30), km: fc.double({ min: 0, max: 5000, noNaN: true }) }),
    { minLength: 0, maxLength: 8 },
  ).map((xs) => xs.map((x, i): BuildExposure => ({ build: `b${i}`, ...x })));

  it("property: p-values are valid probabilities and segments partition the data", () => {
    fc.assert(
      fc.property(buildsArb, (builds) => {
        const r = onsetScan(builds);
        if (r.verdict === "not-enough-data") return;
        for (const b of r.boundaries) {
          expect(b.pValue).toBeGreaterThanOrEqual(0);
          expect(b.pValue).toBeLessThanOrEqual(1);
        }
        expect(r.pScan as number).toBeGreaterThanOrEqual(r.pRaw as number);
        const used = builds.filter((b) => b.km > 0);
        expect(r.before.events + r.after.events).toBe(used.reduce((s, b) => s + b.events, 0));
      }),
    );
  });

  it("property: adding events after the onset never weakens the signal (m = 1)", () => {
    fc.assert(
      fc.property(
        fc.nat(10), fc.nat(10), fc.integer({ min: 1, max: 5 }),
        fc.double({ min: 10, max: 5000, noNaN: true }), fc.double({ min: 10, max: 5000, noNaN: true }),
        (k1, k2, extra, e1, e2) => {
          const base = onsetScan([{ build: "a", events: k1, km: e1 }, { build: "b", events: k2, km: e2 }]);
          const more = onsetScan([{ build: "a", events: k1, km: e1 }, { build: "b", events: k2 + extra, km: e2 }]);
          if (base.pRaw === null || more.pRaw === null) return;
          expect(more.pRaw).toBeLessThanOrEqual(base.pRaw + 1e-12);
        },
      ),
    );
  });
});

describe("applyHolm", () => {
  it("adjusts across clusters and recomputes verdicts", () => {
    const a = { id: "A", onset: onsetScan([{ build: "1", events: 0, km: 3100 }, { build: "2", events: 8, km: 2400 }]) };
    const b = { id: "B", onset: onsetScan([{ build: "1", events: 10, km: 1000 }, { build: "2", events: 10, km: 1000 }]) };
    const c = { id: "C", onset: onsetScan([]) };
    const out = applyHolm([a, b, c]);
    expect(out[0]?.pHolm).toBeCloseTo(2 * (a.onset.pScan as number), 12);
    expect(out[0]?.verdict).toBe("regression-likely");
    expect(out[2]?.pHolm).toBeNull();
    expect(out[2]?.verdict).toBe("not-enough-data");
  });
});

describe("compareSemver", () => {
  it("orders numeric parts numerically", () => {
    expect(["4.12.0", "4.11.3", "4.11.0", "4.2.9"].sort(compareSemver)).toEqual(["4.2.9", "4.11.0", "4.11.3", "4.12.0"]);
    expect(compareSemver("1.0", "1.0.0")).toBe(0);
  });
});
