import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  FEATURE_IDS,
  FEATURE_SPECS,
  SIGNAL_CHIPS,
  type ConditionChip,
  type FeatureId,
  type FeatureVector,
} from "../src/schema/index.js";
import {
  assertDistanceParams,
  bucketHeadline,
  chipDistance,
  chipXorCount,
  DEFAULT_DISTANCE_PARAMS,
  distance,
  explainDistance,
  formatNumber,
  nearestHeadline,
  signalDistance,
  splitHeadline,
  topContributors,
  type SimilarityOperand,
} from "../src/similarity/index.js";

/** Mid-range value of every feature. */
function mid(): Record<FeatureId, number> {
  const out = {} as Record<FeatureId, number>;
  for (const id of FEATURE_IDS) {
    const [lo, hi] = FEATURE_SPECS[id].range;
    out[id] = (lo + hi) / 2;
  }
  return out;
}

function op(features: FeatureVector, chips: readonly ConditionChip[] = ["normal"], flags?: SimilarityOperand["flags"]): SimilarityOperand {
  return flags === undefined ? { features, chips } : { features, chips, flags };
}

function omit(v: Record<FeatureId, number>, ids: readonly FeatureId[]): FeatureVector {
  return Object.fromEntries(Object.entries(v).filter(([k]) => !ids.includes(k as FeatureId))) as FeatureVector;
}

const TOTAL_W = FEATURE_IDS.reduce((s, id) => s + FEATURE_SPECS[id].weight, 0);

// ---------- arbitraries ----------
const valueArb = (id: FeatureId) => {
  const [lo, hi] = FEATURE_SPECS[id].range;
  return fc.double({ min: lo, max: hi, noNaN: true, noDefaultInfinity: true });
};
const fullFeaturesArb: fc.Arbitrary<FeatureVector> = fc
  .tuple(...FEATURE_IDS.map(valueArb))
  .map((vals) => Object.fromEntries(FEATURE_IDS.map((id, i) => [id, vals[i]])) as FeatureVector);
const partialFeaturesArb: fc.Arbitrary<FeatureVector> = fc
  .tuple(...FEATURE_IDS.map((id) => fc.option(valueArb(id), { nil: undefined })))
  .map((vals) => {
    const out: Partial<Record<FeatureId, number>> = {};
    FEATURE_IDS.forEach((id, i) => {
      const v = vals[i];
      if (v !== undefined) out[id] = v;
    });
    return out;
  });
const chipsArb: fc.Arbitrary<ConditionChip[]> = fc
  .subarray([...SIGNAL_CHIPS])
  .map((c): ConditionChip[] => (c.length === 0 ? ["normal"] : c));
const fullOpArb = fc.record({ features: fullFeaturesArb, chips: chipsArb });
const partialOpArb = fc.record({ features: partialFeaturesArb, chips: chipsArb });

describe("similarity: distance examples", () => {
  it("identical events are at distance 0", () => {
    const a = op(mid());
    expect(distance(a, a)).toBe(0);
    const e = explainDistance(a, a);
    expect(e.d).toBe(0);
    expect(e.rows.every((r) => r.contribution === 0 && r.z === 0)).toBe(true);
  });

  it("one-scale difference in F1 gives sqrt(w1 / Σw)", () => {
    const a = mid();
    const b = { ...a, F1: a.F1 + FEATURE_SPECS.F1.scale };
    const e = explainDistance(op(a), op(b));
    expect(e.dSig).toBeCloseTo(Math.sqrt(1 / TOTAL_W), 12);
    expect(e.dCond).toBe(0);
    const row = e.rows.find((r) => r.feature === "F1");
    expect(row?.z).toBeCloseTo(-1, 12);
    expect(row?.contribution).toBeCloseTo(1, 12);
    expect(row?.unit).toBe("m");
    expect(topContributors(e, 2)).toEqual(["F1"]);
  });

  it("chip term is λ · |XOR| / 3 and ignores 'normal'", () => {
    expect(chipXorCount(["normal"], ["night"])).toBe(1);
    expect(chipXorCount(["night", "blur-rain"], ["low-sun-glare"])).toBe(3);
    expect(chipDistance(["normal"], ["night"])).toBeCloseTo(0.5 / 3, 15);
    const a = mid();
    expect(distance(op(a, ["night"]), op(a, ["normal"]))).toBeCloseTo(0.5 / 3, 15);
    expect(explainDistance(op(a, ["night"]), op(a, ["blur-rain"])).chipDiff).toEqual(["night", "blur-rain"]);
  });

  it("z is clamped to ±5 and noted", () => {
    const a = mid();
    const b = { ...a, F8: a.F8 + 100 * FEATURE_SPECS.F8.scale };
    const row = explainDistance(op(a), op(b)).rows.find((r) => r.feature === "F8");
    expect(row?.z).toBe(-5);
    expect(row?.note).toBe("z clamped");
  });

  it("renormalises over shared features and gives +∞ below 50 % overlap", () => {
    const a = mid();
    const sparse = omit(a, ["F1", "F2", "F3", "F4", "F6"]); // drops weight 5 of 7.75
    expect(signalDistance(sparse, a)).toBe(Infinity);
    const e = explainDistance(op(sparse), op(a));
    expect(e.insufficientOverlap).toBe(true);
    expect(e.d).toBe(Infinity);
    expect(e.rows.every((r) => r.distanceShare === null)).toBe(true);

    const enough = omit(a, ["F1", "F2"]); // drops weight 2 of 7.75
    const e2 = explainDistance(op({ ...enough, F3: a.F3 + FEATURE_SPECS.F3.scale }), op(a));
    expect(e2.insufficientOverlap).toBe(false);
    expect(e2.dSig).toBeCloseTo(Math.sqrt(1 / (TOTAL_W - 2)), 12);
    expect(e2.overlapFraction).toBeCloseTo((TOTAL_W - 2) / TOTAL_W, 12);
  });

  it("exactly 50 % overlap is sufficient", () => {
    const params = { ...DEFAULT_DISTANCE_PARAMS, weights: { ...DEFAULT_DISTANCE_PARAMS.weights, F1: 1, F2: 1, F3: 1, F4: 1, F5: 1, F6: 1, F7: 1, F8: 1, F9: 1, F10: 1 } };
    const a = mid();
    const half = omit(a, ["F1", "F2", "F3", "F4", "F5"]);
    expect(signalDistance(half, a, params)).toBe(0);
  });

  it("why-row notes explain missing and clamped features", () => {
    const a = mid();
    const noConf = omit(a, ["F6"]);
    const e = explainDistance(op(noConf, ["normal"], { F6: "channel-unmapped", F3: "clamped" }), op(a));
    const byId = new Map(e.rows.map((r) => [r.feature, r]));
    expect(byId.get("F6")?.note).toBe("n/a (channel not mapped)");
    expect(byId.get("F6")?.z).toBeNull();
    expect(byId.get("F6")?.eventValue).toBeNull();
    expect(byId.get("F3")?.note).toBe("clamped");
    const e2 = explainDistance(op(a), op(noConf, ["normal"], { F6: "channel-coverage" }));
    expect(e2.rows.find((r) => r.feature === "F6")?.note).toBe("n/a (reference: channel coverage too low)");
    const e3 = explainDistance(op(a), op(noConf));
    expect(e3.rows.find((r) => r.feature === "F6")?.note).toBe("n/a (reference missing)");
  });

  it("rejects invalid parameters", () => {
    expect(() => assertDistanceParams(DEFAULT_DISTANCE_PARAMS)).not.toThrow();
    expect(() => assertDistanceParams({ ...DEFAULT_DISTANCE_PARAMS, scales: { ...DEFAULT_DISTANCE_PARAMS.scales, F1: 0 } })).toThrow(RangeError);
    expect(() => assertDistanceParams({ ...DEFAULT_DISTANCE_PARAMS, weights: { ...DEFAULT_DISTANCE_PARAMS.weights, F2: -1 } })).toThrow(RangeError);
    expect(() => assertDistanceParams({ ...DEFAULT_DISTANCE_PARAMS, lambda: -0.1 })).toThrow(RangeError);
  });
});

describe("similarity: headlines", () => {
  it("formats the spec examples", () => {
    expect(bucketHeadline({ type: "lane-loss", variant: "cam-B" })).toBe("Bucket: lane-loss x cam-B");
    expect(nearestHeadline("ADAS-305", 0.21, 1)).toBe("Nearest: ADAS-305 d=0.21 < τ=1.00");
    expect(nearestHeadline("ADAS-1", 1.5, 1)).toBe("Nearest: ADAS-1 d=1.50 > τ=1.00");
    expect(nearestHeadline("ADAS-1", Infinity, 1)).toBe("Nearest: ADAS-1 d=∞ > τ=1.00");
    expect(formatNumber(-0.0001, 2)).toBe("0.00");
  });

  it("names the top-2 contributors when d > τ", () => {
    const a = mid();
    const b = { ...a, F3: a.F3 + 5 * FEATURE_SPECS.F3.scale, F4: a.F4 + 4 * FEATURE_SPECS.F4.scale, F1: a.F1 + 0.5 * FEATURE_SPECS.F1.scale };
    const e = explainDistance(op(a), op(b));
    const text = splitHeadline(e, 1);
    expect(text).toBe(`Split: TTC and brake-onset distance ${(e.d / 1).toFixed(1)}x τ`);
    expect(splitHeadline(explainDistance(op(a), op(a)), 1)).toBeNull();
    expect(splitHeadline(explainDistance(op(a, ["night", "blur-rain", "low-sun-glare"]), op(a)), 0.1)).toBe("Split: conditions distance 5.0x τ");
  });
});

describe("similarity: properties", () => {
  it("is exactly symmetric", () => {
    fc.assert(fc.property(partialOpArb, partialOpArb, (a, b) => {
      expect(distance(a, b)).toBe(distance(b, a));
    }));
  });

  it("d(a, a) = 0 whenever overlap is sufficient, and d ≥ 0 always", () => {
    fc.assert(fc.property(partialOpArb, partialOpArb, (a, b) => {
      const self = explainDistance(a, a);
      if (!self.insufficientOverlap) expect(self.d).toBe(0);
      const d = distance(a, b);
      expect(d >= 0).toBe(true);
      expect(Number.isNaN(d)).toBe(false);
    }));
  });

  it("satisfies the triangle inequality on fully observed vectors", () => {
    fc.assert(fc.property(fullOpArb, fullOpArb, fullOpArb, (a, b, c) => {
      expect(distance(a, c)).toBeLessThanOrEqual(distance(a, b) + distance(b, c) + 1e-9);
    }));
  });

  it("contributions sum to 1 and distance shares sum to the distance", () => {
    fc.assert(fc.property(partialOpArb, partialOpArb, (a, b) => {
      const e = explainDistance(a, b);
      if (e.insufficientOverlap) return;
      const present = e.rows.filter((r) => r.contribution !== null);
      const sumC = present.reduce((s, r) => s + (r.contribution ?? 0), 0);
      if (e.dSig > 0) expect(Math.abs(sumC - 1)).toBeLessThanOrEqual(1e-12);
      else expect(sumC).toBe(0);
      const sumShare = present.reduce((s, r) => s + (r.distanceShare ?? 0), 0);
      expect(Math.abs(sumShare + e.dCond - e.d)).toBeLessThanOrEqual(1e-12 * Math.max(1, e.d));
    }));
  });

  it("explainDistance agrees with distance bit for bit and is deterministic", () => {
    fc.assert(fc.property(partialOpArb, partialOpArb, (a, b) => {
      expect(explainDistance(a, b).d).toBe(distance(a, b));
      expect(explainDistance(a, b)).toEqual(explainDistance(a, b));
    }));
  });
});
