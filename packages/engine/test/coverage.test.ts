import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  COVERAGE_DIMENSIONS,
  TAKEOVER_TYPES,
  SIGNAL_CHIPS,
  tagsFromLabels,
  type ConditionChip,
  type ConditionSignature,
  type CoverageDimension,
  type ScenarioTags,
} from "../src/schema/index.js";
import {
  compareIssueKeysNatural,
  conditionSignature,
  coverageVerdict,
  dimensionCovers,
  effectiveChips,
  gapGrid,
  listCoverageGaps,
  scenarioJqlCandidates,
  scenarioTestFromIssue,
  signatureText,
  verdictRank,
  type ScenarioTest,
  type SignatureMember,
} from "../src/coverage/index.js";

/** SEED_DATA §11 scenario tests as labels (SCN-07 via property). */
const lbl = (type: string, variant: string | null, cond: string[], odd: string[]): string[] => [
  "tt-synthetic",
  "tt-scenario",
  `type:${type}`,
  ...(variant === null ? [] : [`variant:${variant}`]),
  ...cond.map((c) => `cond:${c}`),
  ...odd.map((o) => `odd:${o}`),
];
const SEED_TESTS: ScenarioTest[] = [
  scenarioTestFromIssue({ key: "SCN-01", labels: lbl("late-brake", "cam-A", ["night"], ["urban"]) }).test,
  scenarioTestFromIssue({ key: "SCN-02", labels: lbl("late-brake", "any", ["normal"], ["highway"]) }).test,
  scenarioTestFromIssue({ key: "SCN-03", labels: lbl("phantom-brake", "cam-A", ["normal"], ["highway"]) }).test,
  scenarioTestFromIssue({ key: "SCN-04", labels: lbl("lateral-drift", "any", ["normal"], ["rural"]) }).test,
  scenarioTestFromIssue({ key: "SCN-05", labels: lbl("lane-loss", "cam-A", ["blur-rain"], ["rural"]) }).test,
  scenarioTestFromIssue({ key: "SCN-06", labels: lbl("lane-loss", null, ["night"], ["urban"]) }).test,
  scenarioTestFromIssue({
    key: "SCN-07",
    labels: ["tt-scenario"],
    property: { v: 1, type: "cut-in-response", variant: "cam-B", cond: ["normal"], odd: ["highway"] },
  }).test,
  scenarioTestFromIssue({ key: "SCN-08", labels: lbl("lateral-drift", "cam-B", ["normal"], ["highway"]) }).test,
  scenarioTestFromIssue({ key: "SCN-09", labels: lbl("phantom-brake", "cam-B", ["low-sun-glare"], ["highway"]) }).test,
  scenarioTestFromIssue({ key: "SCN-10", labels: lbl("late-brake", "cam-A", ["night", "blur-rain"], ["urban"]) }).test,
];

const LC_A: ConditionSignature = { type: "lane-loss", variant: "cam-B", chips: ["low-sun-glare"], odd: ["highway"] };
const LC_B: ConditionSignature = { type: "late-brake", variant: "cam-A", chips: ["night"], odd: ["urban"] };
const LC_C: ConditionSignature = { type: "lateral-drift", variant: "cam-B", chips: [], odd: ["rural"] };
const LC_D: ConditionSignature = { type: "phantom-brake", variant: "cam-A", chips: [], odd: ["highway"] };

describe("conditionSignature", () => {
  const m = (chips: ConditionChip[] | undefined, odd: string[]): SignatureMember => ({ chips, odd });

  it("keeps chips and road types present in >= 50 % of members", () => {
    const sig = conditionSignature({ type: "lane-loss", variant: "cam-B" }, [
      m(["low-sun-glare"], ["highway", "low-sun", "dry"]),
      m(["low-sun-glare", "blur-rain"], ["highway", "low-sun"]),
      m(["normal"], ["rural", "low-sun"]),
      m(["low-sun-glare"], ["highway"]),
    ]);
    expect(sig).toEqual({ type: "lane-loss", variant: "cam-B", chips: ["low-sun-glare"], odd: ["highway"] });
    expect(signatureText(sig)).toBe("lane-loss x low-sun-glare x cam-B x highway");
  });

  it("counts exactly 50 % as a majority, never emits normal, and ignores n/a chips", () => {
    const sig = conditionSignature({ type: "late-brake", variant: "cam-A" }, [m(["night"], ["urban"]), m(["normal"], ["rural"]), m(undefined, [])]);
    expect(sig.chips).toEqual(["night"]);
    expect(sig.odd).toEqual(["rural", "urban"]);
    expect(conditionSignature({ type: "unknown", variant: "x" }, [m(["normal"], [])]).chips).toEqual([]);
    expect(conditionSignature({ type: "unknown", variant: "x" }, [])).toEqual({ type: "unknown", variant: "x", chips: [], odd: [] });
  });

  it("uses normal as the effective chip when no signal chip qualifies", () => {
    expect(effectiveChips(LC_C)).toEqual(["normal"]);
    expect(signatureText(LC_C)).toBe("lateral-drift x normal x cam-B x rural");
  });

  it("is invariant under member order (property)", () => {
    const member = fc.record({
      chips: fc.option(fc.subarray([...SIGNAL_CHIPS, "normal"] as ConditionChip[]), { nil: undefined }),
      odd: fc.subarray(["highway", "rural", "urban", "night", "dry"]),
    });
    fc.assert(
      fc.property(fc.array(member, { maxLength: 12 }), fc.integer(), (ms, seed) => {
        const shuffled = [...ms].sort((a, b) => (JSON.stringify(a) + seed < JSON.stringify(b) + seed ? -1 : 1));
        expect(conditionSignature({ type: "lane-loss", variant: "v" }, shuffled)).toEqual(conditionSignature({ type: "lane-loss", variant: "v" }, ms));
      }),
    );
  });
});

describe("scenario tags", () => {
  it("parses only prefixed labels, and a valid property wins", () => {
    expect(tagsFromLabels(["tt-scenario", "cond:night", "cond:blur-rain", "foo:bar", "type:late-brake"])).toEqual({
      type: ["late-brake"],
      cond: ["blur-rain", "night"],
    });
    const p = scenarioTestFromIssue({ key: "S-1", labels: ["type:lane-loss"], property: { v: 1, type: "any", variant: "cam-B", cond: [], odd: ["highway"] } });
    expect(p.source).toBe("property");
    expect(p.test.tags).toEqual({ type: ["any"], variant: ["cam-B"], odd: ["highway"] });
  });

  it("falls back to labels on an invalid property and reports the errors", () => {
    const p = scenarioTestFromIssue({ key: "S-2", labels: ["type:lane-loss"], property: { v: 1, type: "flying" } });
    expect(p.source).toBe("labels");
    expect(p.test.tags).toEqual({ type: ["lane-loss"] });
    expect(p.propertyErrors.length).toBeGreaterThan(0);
  });

  it("lists JQL candidates", () => {
    expect(scenarioJqlCandidates(undefined, false)).toEqual(["labels = tt-scenario"]);
    expect(scenarioJqlCandidates("  ", true)).toEqual(["labels = tt-scenario", "issuetype = Test"]);
    expect(scenarioJqlCandidates("project = X", true)).toEqual(["project = X"]);
  });
});

describe("coverageVerdict on the seed (SEED_DATA §11)", () => {
  it("LC-A is the deliberate gap", () => {
    const r = coverageVerdict(LC_A, SEED_TESTS);
    expect(r.verdict).toBe("uncovered");
    expect(r.text).toBe("0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway");
    expect(r.tests).toEqual([]);
    expect(r.missing).toEqual(["type"]); // closest is SCN-09
  });

  it("LC-B is covered by SCN-01 and SCN-10 (set containment)", () => {
    expect(coverageVerdict(LC_B, SEED_TESTS)).toEqual({ verdict: "covered", tests: ["SCN-01", "SCN-10"], missing: [], text: "Covered by 2 scenario tests" });
  });

  it("LC-C is covered via the variant wildcard; LC-D by SCN-03", () => {
    expect(coverageVerdict(LC_C, SEED_TESTS).tests).toEqual(["SCN-04"]);
    expect(coverageVerdict(LC_D, SEED_TESTS).tests).toEqual(["SCN-03"]);
  });

  it("reports partial coverage with the best test and missing dimensions", () => {
    const sig: ConditionSignature = { ...LC_B, odd: ["highway"] };
    const r = coverageVerdict(sig, SEED_TESTS.filter((t) => t.key !== "SCN-01" && t.key !== "SCN-10"));
    expect(r).toEqual({ verdict: "partial", tests: ["SCN-02"], missing: ["cond"], text: "Partially covered by SCN-02 (missing: cond)" });
  });

  it("absent dimension does not cover (SCN-06)", () => {
    const sig: ConditionSignature = { type: "lane-loss", variant: "cam-B", chips: ["night"], odd: ["urban"] };
    const r = coverageVerdict(sig, SEED_TESTS);
    expect(r.verdict).toBe("partial");
    expect(r.missing).toEqual(["variant"]);
  });

  it("with no tests everything is missing", () => {
    expect(coverageVerdict(LC_A, []).missing).toEqual([...COVERAGE_DIMENSIONS]);
  });

  it("caps listed covering tests at 5 but counts all", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ key: `T-${7 - i}`, tags: { type: ["any"], variant: ["any"], cond: ["any"], odd: ["any"] } }));
    const r = coverageVerdict(LC_A, many);
    expect(r.tests).toEqual(["T-1", "T-2", "T-3", "T-4", "T-5"]);
    expect(r.text).toBe("Covered by 7 scenario tests");
  });
});

describe("listCoverageGaps", () => {
  const clusters = [
    { key: "TT-5", signature: LC_A, events: 14 },
    { key: "TT-6", signature: LC_B, events: 4 },
    { key: "TT-7", signature: { ...LC_B, odd: ["highway"] }, events: 3 },
    { key: "TT-8", signature: { ...LC_A, type: "unknown" as const }, events: 1 },
  ];
  it("orders uncovered first, filters by minEvents and partial", () => {
    const tests = SEED_TESTS.filter((t) => t.key !== "SCN-10");
    const gaps = listCoverageGaps(clusters, tests);
    expect(gaps.map((g) => [g.clusterKey, g.verdict, g.bestTest])).toEqual([
      ["TT-5", "uncovered", undefined],
      ["TT-7", "partial", "SCN-01"], // ties with SCN-02 on 3 dimensions; lower key wins
    ]);
    expect(listCoverageGaps(clusters, tests, { includePartial: false }).map((g) => g.clusterKey)).toEqual(["TT-5"]);
    expect(listCoverageGaps(clusters, tests, { minEvents: 1 }).map((g) => g.clusterKey)).toEqual(["TT-5", "TT-8", "TT-7"]);
    expect(listCoverageGaps(clusters, tests, { minEvents: 1, limit: 1 })).toHaveLength(1);
  });
});

describe("gapGrid", () => {
  const grid = gapGrid(
    [
      { signature: LC_A, events: 14 },
      { signature: LC_B, events: 4 },
      { signature: LC_C, events: 4 },
      { signature: LC_D, events: 3 },
    ],
    SEED_TESTS,
  );
  const cell = (dim: string, value: string, type: string) => grid.rows.find((r) => r.dimension === dim && r.value === value)?.cells.find((c) => c.type === type);

  it("shows exactly one red chip cell: low-sun-glare x lane-loss", () => {
    expect(cell("cond", "low-sun-glare", "lane-loss")).toEqual({ type: "lane-loss", events: 14, tests: 0, gap: true });
    expect(cell("cond", "low-sun-glare", "phantom-brake")?.tests).toBe(1);
    const red = grid.rows.filter((r) => r.dimension === "cond").flatMap((r) => r.cells.filter((c) => c.gap).map((c) => `${r.dimension}:${r.value}/${c.type}`));
    expect(red).toEqual(["cond:low-sun-glare/lane-loss"]);
  });

  it("has stable chip rows then sorted ODD rows, and normal-row counts", () => {
    expect(grid.columns).toEqual([...TAKEOVER_TYPES]);
    expect(grid.rows.map((r) => `${r.dimension}:${r.value}`)).toEqual(["cond:night", "cond:low-sun-glare", "cond:blur-rain", "cond:normal", "odd:highway", "odd:rural", "odd:urban"]);
    expect(cell("cond", "normal", "lateral-drift")).toEqual({ type: "lateral-drift", events: 4, tests: 2, gap: false });
    expect(cell("odd", "highway", "lane-loss")).toEqual({ type: "lane-loss", events: 14, tests: 0, gap: true });
  });
});

describe("coverage properties (§16.2)", () => {
  const value = (pool: readonly string[]) => fc.constantFrom(...pool, "any");
  const tagsArb: fc.Arbitrary<ScenarioTags> = fc.record(
    {
      type: fc.array(value(TAKEOVER_TYPES), { minLength: 1, maxLength: 2 }),
      variant: fc.array(value(["cam-A", "cam-B"]), { minLength: 1, maxLength: 2 }),
      cond: fc.array(value(["night", "low-sun-glare", "blur-rain", "normal"]), { minLength: 1, maxLength: 3 }),
      odd: fc.array(value(["highway", "rural", "urban"]), { minLength: 1, maxLength: 3 }),
    },
    { requiredKeys: [] },
  );
  const sigArb: fc.Arbitrary<ConditionSignature> = fc.record({
    type: fc.constantFrom(...TAKEOVER_TYPES),
    variant: fc.constantFrom("cam-A", "cam-B"),
    chips: fc.subarray([...SIGNAL_CHIPS] as ConditionChip[]),
    odd: fc.subarray(["highway", "rural", "urban"]),
  });
  const testsArb = fc.array(fc.record({ key: fc.integer({ min: 1, max: 99 }).map((n) => `T-${n}`), tags: tagsArb }), { maxLength: 8 });
  const dimArb = fc.constantFrom<CoverageDimension>(...COVERAGE_DIMENSIONS);

  it("adding a test never decreases coverage", () => {
    fc.assert(
      fc.property(sigArb, testsArb, fc.record({ key: fc.constant("T-100"), tags: tagsArb }), (sig, tests, extra) => {
        expect(verdictRank(coverageVerdict(sig, [...tests, extra]).verdict)).toBeGreaterThanOrEqual(verdictRank(coverageVerdict(sig, tests).verdict));
      }),
    );
  });

  it("a wildcard covers its dimension", () => {
    fc.assert(
      fc.property(sigArb, tagsArb, dimArb, (sig, tags, dim) => {
        expect(dimensionCovers(sig, { ...tags, [dim]: ["any"] }, dim)).toBe(true);
      }),
    );
  });

  it("an absent dimension never covers", () => {
    fc.assert(
      fc.property(sigArb, tagsArb, dimArb, (sig, tags, dim) => {
        const without: ScenarioTags = Object.fromEntries(Object.entries(tags).filter(([k]) => k !== dim));
        expect(dimensionCovers(sig, without, dim)).toBe(false);
        expect(coverageVerdict(sig, [{ key: "T-1", tags: without }]).verdict).not.toBe("covered");
      }),
    );
  });

  it("verdict does not depend on test order", () => {
    fc.assert(
      fc.property(sigArb, testsArb, (sig, tests) => {
        expect(coverageVerdict(sig, [...tests].reverse())).toEqual(coverageVerdict(sig, tests));
      }),
    );
  });
});

describe("compareIssueKeysNatural", () => {
  it("orders naturally", () => {
    expect(["SCN-10", "SCN-9", "ABC-2", "x"].sort(compareIssueKeysNatural)).toEqual(["ABC-2", "SCN-9", "SCN-10", "x"]);
  });
});
