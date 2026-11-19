import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  FEATURE_IDS,
  FEATURE_SPECS,
  type BucketKey,
  type ClusterInput,
  type ConditionChip,
  type FeatureId,
  type MembershipState,
} from "../src/schema/index.js";
import { distance } from "../src/similarity/index.js";
import {
  acceptedCountInBucket,
  assertClusterParams,
  assignEvent,
  averageLinkageHac,
  bucketOf,
  clusterName,
  clusterNameFor,
  clusterProfile,
  compareIssueKeys,
  confidenceOf,
  DEFAULT_CLUSTER_PARAMS,
  dominantChip,
  groupByBucket,
  isUnknownBucket,
  lowerMedianOrNull,
  medoidOf,
  proposeClusters,
  typeLabel,
} from "../src/cluster/index.js";

const LL_B: BucketKey = { type: "lane-loss", variant: "cam-B" };

/** Feature vector at relative position x ∈ [0, 1] of every feature range (plus per-feature offsets). */
function at(x: number, offsets: Partial<Record<FeatureId, number>> = {}): Record<FeatureId, number> {
  const out = {} as Record<FeatureId, number>;
  for (const id of FEATURE_IDS) {
    const [lo, hi] = FEATURE_SPECS[id].range;
    const v = lo + (hi - lo) * x + (offsets[id] ?? 0) * FEATURE_SPECS[id].scale;
    out[id] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

interface EvOpts {
  state?: MembershipState;
  clusterKey?: string;
  chips?: ConditionChip[];
  bucket?: BucketKey;
}

function ev(n: number, features: ClusterInput["features"], o: EvOpts = {}): ClusterInput {
  return {
    key: `ADAS-${n}`,
    issueNumber: n,
    bucket: o.bucket ?? LL_B,
    features,
    chips: o.chips ?? ["normal"],
    state: o.state ?? "unassigned",
    ...(o.clusterKey !== undefined ? { clusterKey: o.clusterKey } : {}),
  };
}
const acc = (n: number, x: number, clusterKey: string, offsets: Partial<Record<FeatureId, number>> = {}) =>
  ev(n, at(x, offsets), { state: "accepted", clusterKey });

describe("cluster: ordering and buckets", () => {
  it("orders keys by trailing issue number", () => {
    expect(["ADAS-10", "ADAS-9", "X", "ADAS-100"].sort(compareIssueKeys)).toEqual(["ADAS-9", "ADAS-10", "ADAS-100", "X"]);
  });

  it("groups by type × variant, ignoring build", () => {
    const evs = [
      ev(1, at(0.5), { bucket: bucketOf("lane-loss", "cam-B") }),
      ev(2, at(0.5), { bucket: bucketOf("late-brake", "cam-A") }),
      ev(3, at(0.5), { bucket: bucketOf("lane-loss", "cam-B") }),
    ];
    const g = groupByBucket(evs);
    expect(g.map((x) => x.id)).toEqual(["lane-loss|cam-B", "late-brake|cam-A"]);
    expect(g[0]?.items.map((e) => e.key)).toEqual(["ADAS-1", "ADAS-3"]);
    expect(isUnknownBucket(bucketOf("unknown", "cam-A"))).toBe(true);
  });

  it("validates params", () => {
    expect(() => assertClusterParams(DEFAULT_CLUSTER_PARAMS)).not.toThrow();
    expect(() => assertClusterParams({ ...DEFAULT_CLUSTER_PARAMS, tau: 0 })).toThrow(RangeError);
    expect(() => assertClusterParams({ ...DEFAULT_CLUSTER_PARAMS, k: 1.5 })).toThrow(RangeError);
  });
});

describe("cluster: assignEvent", () => {
  const members = [acc(10, 0.2, "ADAS-1"), acc(11, 0.2, "ADAS-1", { F1: 0.3 }), acc(20, 0.8, "ADAS-2"), acc(21, 0.8, "ADAS-2", { F8: 0.5 })];

  it("is first-of-kind with fewer than 2 accepted members in the bucket", () => {
    const e = ev(30, at(0.2));
    expect(assignEvent(e, [])).toEqual({ kind: "first-of-kind" });
    expect(assignEvent(e, [acc(10, 0.2, "ADAS-1")])).toEqual({ kind: "first-of-kind" });
    const other = { ...acc(11, 0.2, "ADAS-1"), bucket: bucketOf("late-brake", "cam-B") };
    expect(assignEvent(e, [acc(10, 0.2, "ADAS-1"), other, ev(12, at(0.2))])).toEqual({ kind: "first-of-kind" });
    expect(acceptedCountInBucket(LL_B, [acc(10, 0.2, "ADAS-1"), other])).toBe(1);
  });

  it("matches the nearest cluster with confidence 1 − d*/τ", () => {
    const e = ev(30, at(0.2, { F2: 0.5 }));
    const r = assignEvent(e, members);
    expect(r.kind).toBe("match");
    if (r.kind !== "match") return;
    expect(r.clusterKey).toBe("ADAS-1");
    expect(r.dStar).toBeCloseTo(distance(e, members[0] as ClusterInput), 15);
    expect(r.confidence).toBeCloseTo(1 - r.dStar / 1, 15);
    expect(r.ambiguous).toBe(false);
    expect(r.runnerUp).toBeUndefined();
    expect(r.neighbours.map((n) => n.key)).toEqual(["ADAS-10", "ADAS-11", "ADAS-20"]);
    expect(r.votes[0]?.clusterKey).toBe("ADAS-1");
  });

  it("is novel when d* > τ", () => {
    const r = assignEvent(ev(30, at(0.5)), members);
    expect(r.kind).toBe("novel");
    if (r.kind !== "novel") return;
    expect(r.dStar).toBeGreaterThan(1);
    expect(r.tau).toBe(1);
  });

  it("is novel when every neighbour is at +∞ (no feature overlap)", () => {
    const r = assignEvent(ev(30, { F1: 0.5 }), members);
    expect(r.kind).toBe("novel");
    if (r.kind === "novel") {
      expect(r.dStar).toBe(Infinity);
      expect(r.nearestClusterKey).toBe("ADAS-1"); // all scores 0 → lowest cluster issue number
    }
  });

  it("flags ambiguity and breaks distance ties by lowest issue number", () => {
    const tie = [acc(10, 0.5, "ADAS-7", { F1: 1 }), acc(11, 0.5, "ADAS-3", { F1: -1 }), acc(12, 0.5, "ADAS-7", { F1: 5 })];
    const r = assignEvent(ev(30, at(0.5)), tie);
    expect(r.kind).toBe("match");
    if (r.kind !== "match") return;
    expect(r.neighbours.map((n) => n.key)).toEqual(["ADAS-10", "ADAS-11", "ADAS-12"]);
    expect(r.clusterKey).toBe("ADAS-7");
    expect(r.ambiguous).toBe(true);
    expect(r.runnerUp?.clusterKey).toBe("ADAS-3");

    const twoWay = [acc(10, 0.5, "ADAS-7", { F1: 1 }), acc(11, 0.5, "ADAS-3", { F1: -1 })];
    const r2 = assignEvent(ev(30, at(0.5)), twoWay);
    expect(r2.kind === "match" && r2.clusterKey).toBe("ADAS-3"); // equal scores → lowest cluster number
  });

  it("never matches the event against itself", () => {
    const self = acc(10, 0.2, "ADAS-1");
    const r = assignEvent(self, [self, acc(11, 0.8, "ADAS-2"), acc(12, 0.8, "ADAS-2")]);
    expect(r.kind === "novel" || r.kind === "match").toBe(true);
    if (r.kind !== "first-of-kind") expect(r.neighbours.map((n) => n.key)).not.toContain("ADAS-10");
  });

  it("confidence is clamped to [0, 1]", () => {
    expect(confidenceOf(0, 1)).toBe(1);
    expect(confidenceOf(2, 1)).toBe(0);
    expect(confidenceOf(0.25, 1)).toBe(0.75);
  });
});

describe("cluster: HAC", () => {
  const line = (xs: number[]) => (i: number, j: number) => Math.abs((xs[i] ?? 0) - (xs[j] ?? 0));

  it("merges while average linkage ≤ τ", () => {
    expect(averageLinkageHac(5, line([0, 0.1, 0.2, 5, 5.3]), 1)).toEqual([[0, 1, 2], [3, 4]]);
    expect(averageLinkageHac(3, line([0, 2, 4]), 1)).toEqual([[0], [1], [2]]);
    expect(averageLinkageHac(0, line([]), 1)).toEqual([]);
  });

  it("uses average (not single) linkage", () => {
    // 0–1 at 0.9 merge; then {0,1}–2: single 0.9, average (1.8+0.9)/2 = 1.35 > τ.
    expect(averageLinkageHac(3, line([0, 0.9, 1.8]), 1)).toEqual([[0, 1], [2]]);
  });

  it("breaks linkage ties toward the lexicographically smallest pair", () => {
    // 0–1 and 1–2 both at 1: merge (0,1) first, then {0,1}–2 averages 1.5 > τ.
    expect(averageLinkageHac(3, line([0, 1, 2]), 1)).toEqual([[0, 1], [2]]);
  });

  it("never merges +∞ pairs", () => {
    expect(averageLinkageHac(2, () => Infinity, 1e9)).toEqual([[0], [1]]);
  });
});

describe("cluster: proposeClusters", () => {
  it("assigns, proposes and leaves singletons novel; never outputs accepted events", () => {
    const evs = [
      acc(1, 0.2, "ADAS-100"),
      acc(2, 0.2, "ADAS-100", { F1: 0.5 }),
      ev(3, at(0.2, { F2: 0.3 })), // matches ADAS-100
      ev(5, at(0.6)),
      ev(4, at(0.6, { F1: 0.2 })), // 4 + 5 propose
      ev(6, at(0.9)), // novel
      ev(7, at(0.6), { bucket: bucketOf("late-brake", "cam-A") }), // alone in its bucket → novel
    ];
    const r = proposeClusters(evs);
    expect(r.assigned.map((a) => [a.key, a.result.clusterKey])).toEqual([["ADAS-3", "ADAS-100"]]);
    expect(r.proposed).toEqual([{ id: "ADAS-4", bucket: LL_B, members: ["ADAS-4", "ADAS-5"] }]);
    expect(r.novel).toEqual(["ADAS-6", "ADAS-7"]);
  });

  it("rejects duplicate keys", () => {
    expect(() => proposeClusters([ev(1, at(0.5)), ev(1, at(0.5))])).toThrow(RangeError);
  });
});

describe("cluster: profile, medoid, name", () => {
  it("lower median picks an actual value", () => {
    expect(lowerMedianOrNull([])).toBeNull();
    expect(lowerMedianOrNull([3, 1, 2])).toBe(2);
    expect(lowerMedianOrNull([4, 1, 3, 2])).toBe(2);
  });

  it("profiles accepted members only and finds the medoid", () => {
    const evs = [
      acc(1, 0.2, "ADAS-9"),
      acc(2, 0.2, "ADAS-9", { F1: 1 }),
      acc(3, 0.2, "ADAS-9", { F1: 3 }),
      ev(4, at(0.9), { clusterKey: "ADAS-9", state: "proposed" }),
      { ...acc(5, 0.2, "ADAS-9"), features: { F1: 2.9 } },
    ];
    const p = clusterProfile("ADAS-9", evs);
    expect(p?.memberCount).toBe(4);
    expect(p?.profile.F1).toBe(at(0.2, { F1: 1 }).F1);
    expect(p?.profile.F8).toBe(at(0.2).F8);
    expect(p?.medoidKey).toBe("ADAS-1"); // ADAS-5 is +∞ from everyone; ADAS-1 and ADAS-2 tie-ish, lowest wins
    expect(clusterProfile("ADAS-404", evs)).toBeNull();
    const none = clusterProfile("X", [
      { ...acc(1, 0.2, "X"), features: { F1: 1 } },
      { ...acc(2, 0.2, "X"), features: { F1: 2 } },
    ]);
    expect(none?.flags.F3).toBe("channel-unmapped");
    expect(none?.profile.F3).toBeUndefined();
  });

  it("medoid ties go to the lowest issue number", () => {
    const m = medoidOf([acc(7, 0.5, "C"), acc(3, 0.5, "C")]);
    expect(m?.key).toBe("ADAS-3");
  });

  it("names clusters from the template", () => {
    expect(clusterName("lane-loss", "low-sun-glare", "cam-B")).toBe("Lane-loss · low sun · cam-B");
    expect(clusterName("phantom-brake", "normal", "cam-A")).toBe("Phantom-brake · cam-A");
    expect(typeLabel("unknown")).toBe("Unknown");
    expect(dominantChip([{ chips: ["night"] }, { chips: ["night", "blur-rain"] }, { chips: ["normal"] }])).toBe("night");
    expect(dominantChip([{ chips: ["night"] }, { chips: ["normal"] }])).toBe("normal");
    expect(clusterNameFor(LL_B, [{ chips: ["low-sun-glare"] }])).toBe("Lane-loss · low sun · cam-B");
  });
});

// ---------- properties ----------

const CENTERS = [0.15, 0.45, 0.75];
const offsetsArb = fc.dictionary(
  fc.constantFrom(...FEATURE_IDS),
  fc.double({ min: -4, max: 4, noNaN: true }),
  { maxKeys: 4 },
) as fc.Arbitrary<Partial<Record<FeatureId, number>>>;
const chipArb = fc.constantFrom<ConditionChip[]>(["normal"], ["night"], ["low-sun-glare"]);
const protoArb = fc.record({
  center: fc.integer({ min: 0, max: 2 }),
  offsets: offsetsArb,
  chips: chipArb,
  accepted: fc.boolean(),
  variant: fc.constantFrom("cam-A", "cam-B"),
});

/** Builds a world: accepted events belong to the cluster of their center. */
function world(protos: readonly { center: number; offsets: Partial<Record<FeatureId, number>>; chips: ConditionChip[]; accepted: boolean; variant: string }[]): ClusterInput[] {
  return protos.map((p, i) =>
    ev(i + 1, at(CENTERS[p.center] ?? 0.5, p.offsets), {
      chips: p.chips,
      bucket: bucketOf("lane-loss", p.variant),
      ...(p.accepted ? { state: "accepted" as const, clusterKey: `CL-${p.center + 1}` } : {}),
    }),
  );
}

const worldArb = fc.array(protoArb, { minLength: 1, maxLength: 18 }).map((ps) => world(ps));
const shuffled = <T>(xs: readonly T[]) => fc.shuffledSubarray([...xs], { minLength: xs.length, maxLength: xs.length });

describe("cluster: properties", () => {
  it("assignment is invariant to candidate order", () => {
    fc.assert(fc.property(worldArb.chain((w) => fc.tuple(fc.constant(w), shuffled(w))), ([w, perm]) => {
      for (const e of w) expect(assignEvent(e, perm)).toEqual(assignEvent(e, w));
    }), { numRuns: 60 });
  });

  it("batch proposal is invariant to input permutation and deterministic", () => {
    fc.assert(fc.property(worldArb.chain((w) => fc.tuple(fc.constant(w), shuffled(w))), ([w, perm]) => {
      expect(proposeClusters(perm)).toEqual(proposeClusters(w));
    }), { numRuns: 80 });
  });

  it("is idempotent when its own output states are fed back", () => {
    fc.assert(fc.property(worldArb, (w) => {
      const r1 = proposeClusters(w);
      const proposedOf = new Map<string, string>();
      for (const p of r1.proposed) for (const m of p.members) proposedOf.set(m, p.id);
      for (const a of r1.assigned) proposedOf.set(a.key, a.result.clusterKey);
      const novel = new Set(r1.novel);
      const fed = w.map((e): ClusterInput => {
        if (e.state === "accepted") return e;
        const ck = proposedOf.get(e.key);
        if (ck !== undefined) return { ...e, state: "proposed", clusterKey: ck };
        return novel.has(e.key) ? { ...e, state: "novel" } : e;
      });
      expect(proposeClusters(fed)).toEqual(r1);
    }), { numRuns: 60 });
  });

  it("never outputs or alters accepted events, and covers every other event exactly once", () => {
    fc.assert(fc.property(worldArb, (w) => {
      const before = JSON.stringify(w);
      const r = proposeClusters(w);
      expect(JSON.stringify(w)).toBe(before);
      const out = [...r.assigned.map((a) => a.key), ...r.proposed.flatMap((p) => p.members), ...r.novel];
      const expected = w.filter((e) => e.state !== "accepted").map((e) => e.key);
      expect([...out].sort()).toEqual([...expected].sort());
    }), { numRuns: 80 });
  });

  it("an exact duplicate of an accepted event matches its cluster with d* = 0", () => {
    fc.assert(fc.property(worldArb, fc.nat(), (w, pick) => {
      const accepted = w.filter((e) => e.state === "accepted");
      const src = accepted[pick % Math.max(1, accepted.length)];
      if (src === undefined) return;
      const dup: ClusterInput = { ...src, key: "DUP-1", issueNumber: 10_000, state: "unassigned" };
      const sameBucket = accepted.filter((e) => e.bucket.variant === src.bucket.variant);
      const r = assignEvent(dup, w);
      if (sameBucket.length < 2) {
        expect(r.kind).toBe("first-of-kind");
        return;
      }
      expect(r.kind).toBe("match");
      if (r.kind === "match") {
        expect(r.clusterKey).toBe(src.clusterKey);
        expect(r.dStar).toBe(0);
        expect(r.confidence).toBe(1);
      }
    }), { numRuns: 100 });
  });

  it("novelty is monotone in τ (raising τ never makes an event novel)", () => {
    fc.assert(fc.property(worldArb, fc.double({ min: 0.05, max: 3, noNaN: true }), fc.double({ min: 0, max: 3, noNaN: true }), (w, tau, extra) => {
      const lo = { ...DEFAULT_CLUSTER_PARAMS, tau };
      const hi = { ...DEFAULT_CLUSTER_PARAMS, tau: tau + extra };
      for (const e of w) {
        if (e.state === "accepted") continue;
        const a = assignEvent(e, w, lo);
        const b = assignEvent(e, w, hi);
        if (a.kind !== "novel") expect(b.kind).not.toBe("novel");
        if (a.kind === "match" && b.kind === "match") expect(b.clusterKey).toBe(a.clusterKey);
      }
    }), { numRuns: 60 });
  });

  it("HAC groups partition the input and are permutation-invariant via canonical order", () => {
    fc.assert(fc.property(fc.array(fc.double({ min: 0, max: 10, noNaN: true }), { maxLength: 15 }), fc.double({ min: 0, max: 3, noNaN: true }), (xs, tau) => {
      const groups = averageLinkageHac(xs.length, (i, j) => Math.abs((xs[i] ?? 0) - (xs[j] ?? 0)), tau);
      expect(groups.flat().sort((a, b) => a - b)).toEqual(xs.map((_, i) => i));
      for (let g = 1; g < groups.length; g++) expect((groups[g]?.[0] ?? 0) > (groups[g - 1]?.[0] ?? 0)).toBe(true);
    }));
  });
});
