/**
 * End-to-end robustness on five evaluation seeds (SEED_DATA §14.4; seeds 1000–1004, never used for
 * tuning). Per-seed gates are the ones that must hold on every seed; LC-A's onset verdict is
 * reported, not gated (E7: power is a property of the generated data, ≈ 66 % over seeds 0–999).
 */
import { afterAll, describe, expect, it } from "vitest";
import { ACCURACY_MIN, ARI_MIN, ARI_NO_BOUNDARY_MIN, FALSE_NOVEL_MAX, clusterFor, runSeed, scoreSeed, type SeedMetrics } from "./e2e/pipeline.js";

const SEEDS = [1000, 1001, 1002, 1003, 1004] as const;
/** No single seed may fall far below E3's mean target (measured min over 1000–1019: 0.750). */
const ARI_PER_SEED_MIN = 0.7;

describe("e2e robustness across seeds", () => {
  const metrics: SeedMetrics[] = [];
  afterAll(() => {
    console.table(metrics.map((m) => ({
      seed: m.seed, events: m.events, clusters: m.historyClusters, ari: m.ari.toFixed(3), ariNoBoundary: m.ariNoBoundary.toFixed(3),
      type: m.typeAccuracyClean.toFixed(2), chips: m.chipAccuracyClean.toFixed(2), split: m.sameTextSplit.join("/"), sm3: m.differentTextMerged,
      novel1: m.novel1Novel, falseNovel: m.falseNovel, laVerdict: m.laVerdict, laPHolm: m.laPHolm?.toExponential(2) ?? null, laCoverage: m.laCoverage, oracle: m.coverageMatchesOracle, routing: m.routingMatches,
    })));
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}`, async () => {
      const run = await runSeed(seed);
      const m = scoreSeed(run);
      metrics.push(m);
      expect(run.failures).toEqual([]);
      expect(m.ari).toBeGreaterThanOrEqual(ARI_PER_SEED_MIN);
      expect(m.ariNoBoundary).toBeGreaterThanOrEqual(ARI_NO_BOUNDARY_MIN);
      expect(m.typeAccuracyClean).toBeGreaterThanOrEqual(ACCURACY_MIN);
      expect(m.chipAccuracyClean).toBeGreaterThanOrEqual(ACCURACY_MIN);
      expect(m.sameTextSplit).toEqual([true, true]);
      if (m.differentTextMerged !== null) expect(m.differentTextMerged).toBe(true);
      expect(m.novel1Novel).toBe(true);
      expect(m.falseNovel).toBeLessThanOrEqual(FALSE_NOVEL_MAX);
      expect(m.flatRegressionLikely).toBe(0);
      // E8: the engine agrees with the independent oracle on every realised signature. Against the
      // §11 table, B/C/D are covered; LC-A is uncovered on a highway majority and `partial` (SCN-05
      // matches type + odd) when most LC-A history is rural — see the note in e2e/pipeline.ts.
      expect(m.coverageMatchesOracle).toBe(true);
      for (const l of ["LC-B", "LC-C", "LC-D"] as const) {
        const c = clusterFor(run, l);
        if (c !== undefined) expect(c.coverage.verdict).toBe("covered");
      }
      expect(["uncovered", "partial"]).toContain(m.laCoverage);
      expect(m.routingMatches).toBe(true);
      // The lane-loss cluster always exists and is the uncovered gap; its onset build is 4.12.0 whenever tested.
      expect(clusterFor(run, "LC-A")).toBeDefined();
      expect(m.laGap).not.toBeNull();
      if (m.laVerdict !== "not-enough-data") expect(m.laOnsetBuild).toBe("4.12.0");
    }, 180_000);
  }

  it("meets E3's mean ARI over the seeds", () => {
    expect(metrics).toHaveLength(SEEDS.length);
    const mean = metrics.reduce((s, m) => s + m.ari, 0) / metrics.length;
    expect(mean).toBeGreaterThanOrEqual(ARI_MIN);
  });
});
