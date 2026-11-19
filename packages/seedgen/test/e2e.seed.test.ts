/**
 * End-to-end on the default seed (SEED_DATA §13, §14.4 E1–E10): seedgen files → engine intake →
 * HAC over history accepted as at seed time → Monday batch assigned → onset, coverage, routing.
 */
import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { DEFAULT_SEED, planFleet } from "../src/index.js";
import {
  ACCURACY_MIN,
  ARI_MIN,
  ARI_NO_BOUNDARY_MIN,
  FALSE_NOVEL_MAX,
  adjustedRandIndex,
  clusterFor,
  demoCriteria,
  enoughHistory,
  runSeed,
  scoreSeed,
  seedConfig,
  type SeedMetrics,
  type SeedRun,
} from "./e2e/pipeline.js";


describe("adjustedRandIndex", () => {
  it("matches hand-computed values", () => {
    expect(adjustedRandIndex(["a", "a", "b", "b"], ["x", "x", "y", "y"])).toBe(1);
    // Hubert & Arabie's example: contingency [[1,1,0],[1,0,1],[0,0,2]] style partitions
    expect(adjustedRandIndex(["a", "a", "a", "b", "b", "b"], ["x", "x", "y", "y", "z", "z"])).toBeCloseTo(0.24242424, 6);
    expect(adjustedRandIndex(["a", "b", "c"], ["x", "y", "z"])).toBe(1);
  });

  it("is symmetric, 1 on identical partitions and invariant to renaming labels (property)", () => {
    const labels = fc.array(fc.constantFrom("p", "q", "r", "s"), { minLength: 2, maxLength: 30 });
    fc.assert(
      fc.property(labels, labels, (a, b0) => {
        const b = b0.length >= a.length ? b0.slice(0, a.length) : [...b0, ...a.slice(b0.length)];
        expect(adjustedRandIndex(a, a)).toBe(1);
        expect(adjustedRandIndex(a, b)).toBeCloseTo(adjustedRandIndex(b, a), 12);
        expect(adjustedRandIndex(a, b.map((x) => `renamed-${x}`))).toBeCloseTo(adjustedRandIndex(a, b), 12);
        expect(adjustedRandIndex(a, b)).toBeLessThanOrEqual(1 + 1e-12);
      }),
    );
  });
});

describe(`default seed ${DEFAULT_SEED} through the real engine path`, () => {
  let run: SeedRun;
  let m: SeedMetrics;
  beforeAll(async () => {
    run = await runSeed(DEFAULT_SEED);
    m = scoreSeed(run);
    console.log(`e2e seed ${DEFAULT_SEED}: ${JSON.stringify(m)}`);
  }, 180_000);

  it("processes every event and produces schema-valid tt.event properties", () => {
    expect(run.failures).toEqual([]);
    expect(run.events.length).toBe(run.plan.events.length);
    for (const e of run.events) {
      expect(e.event.synthetic).toBe(true);
      expect(e.event.img).toBeDefined();
      expect(JSON.stringify(e.event).length).toBeLessThan(12 * 1024); // G-T8: tt.event ≤ 12 KB
    }
  });

  it("recovers the latent clusters (E3 adjusted Rand index)", () => {
    expect(m.ari).toBeGreaterThanOrEqual(ARI_MIN);
    expect(m.ariNoBoundary).toBeGreaterThanOrEqual(ARI_NO_BOUNDARY_MIN);
    for (const l of ["LC-A", "LC-B", "LC-C", "LC-D"] as const) expect(clusterFor(run, l)?.purity).toBe(1);
  });

  it("types and chips clean events correctly (E5, E6)", () => {
    expect(m.typeAccuracyClean).toBeGreaterThanOrEqual(ACCURACY_MIN);
    expect(m.chipAccuracyClean).toBeGreaterThanOrEqual(ACCURACY_MIN);
  });

  it("splits the identical-text / different-signal pairs (E1, SM-2)", () => {
    expect(m.sameTextSplit).toEqual([true, true]);
    const byRole = (r: string): string | undefined => run.events.find((e) => e.roles.some((x) => x === r))?.label;
    expect(byRole("P1a")).toBe(clusterFor(run, "LC-A")?.key);
    expect(byRole("P1b")).toBe(clusterFor(run, "LC-C")?.key);
    expect(byRole("P3a")).toBe(clusterFor(run, "LC-B")?.key);
    expect(byRole("P3b")).toBe(clusterFor(run, "LC-D")?.key);
  });

  it("merges the different-text / same-signal pair (E2, SM-3)", () => {
    expect(run.truth.pairs.sm3).toBe("ok");
    expect(m.differentTextMerged).toBe(true);
  });

  it("flags NOVEL-1 as novel and nothing clean as novel (E4)", () => {
    expect(m.novel1Novel).toBe(true);
    expect(m.falseNovel).toBeLessThanOrEqual(FALSE_NOVEL_MAX);
  });

  it("onset says regression-likely at 4.12.0 for the lane-loss cluster, from the seeded drive km (E7)", () => {
    const la = clusterFor(run, "LC-A");
    expect(la?.verdict).toBe("regression-likely");
    expect(la?.onset.onsetBuild).toBe("4.12.0");
    expect(la?.onset.before.events).toBe(0);
    const camBKm = run.plan.driveSessions.filter((s) => s.variant === "cam-B").reduce((a, s) => a + s.km, 0);
    expect((la?.onset.before.km ?? 0) + (la?.onset.after.km ?? 0)).toBeCloseTo(camBKm, 6);
    expect(m.flatRegressionLikely).toBe(0);
  });

  it("detects the planted coverage gap and the covered clusters (§11, E8)", () => {
    expect(m.coverageMatches).toBe(true);
    expect(m.coverageMatchesOracle).toBe(true);
    expect(m.laCoverage).toBe("uncovered");
    expect(m.laGap).toBe("0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway");
    expect(run.gaps.map((g) => g.text)).toEqual([m.laGap]);
    for (const l of ["LC-B", "LC-C", "LC-D"] as const) expect(clusterFor(run, l)?.coverage.verdict).toBe("covered");
  });

  it("routes each cluster to its expected owner (E9)", () => {
    expect(m.routingMatches).toBe(true);
  });

  it("meets every §13.1 demo criterion (E10)", () => {
    expect(demoCriteria(run, m)).toEqual(Object.fromEntries(Object.keys(demoCriteria(run, m)).map((k) => [k, true])));
  });

  it("is the smallest seed ≥ 2026 that can (seeds below fail criterion 2 on the plan alone)", () => {
    for (let s = 2026; s < DEFAULT_SEED; s++) expect(enoughHistory(planFleet(seedConfig(s)))).toBe(false);
  });
});
