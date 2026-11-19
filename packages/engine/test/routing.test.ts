import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { TAKEOVER_TYPES, type TakeoverType } from "../src/schema/index.js";
import {
  evaluateRules,
  parseRoutingRules,
  ruleMatches,
  ruleText,
  suggestRoute,
  type RoutingRule,
  type RoutingSources,
  type TwgTeamLookup,
} from "../src/routing/index.js";

/** SEED_DATA §12 rules: components 10001 Perception, 10002 Planning, 10003 Controls; default role 10100. */
const SEED_RULES: RoutingRule[] = [
  { match: { type: "lane-loss" }, team: { componentId: "10001", label: "Perception" } },
  { match: { type: "phantom-brake" }, team: { componentId: "10001", label: "Perception" } },
  { match: { type: ["late-brake", "cut-in-response"] }, team: { componentId: "10002", label: "Planning" } },
  { match: { type: "lateral-drift" }, team: { componentId: "10003", label: "Controls" } },
  { match: {}, team: { projectRoleId: "10100", label: "project lead" } },
];

const COMPONENTS: Record<string, { name: string; leadAccountId?: string }> = {
  "10001": { name: "Perception", leadAccountId: "acc-admin" },
  "10002": { name: "Planning", leadAccountId: "acc-admin" },
  "10003": { name: "Controls" },
};

function fakeSources(twg?: (ari: string) => TwgTeamLookup | Promise<TwgTeamLookup>, calls: string[] = []): RoutingSources {
  return {
    ...(twg === undefined
      ? {}
      : {
          twgTeam: (ari: string) => {
            calls.push(`twg:${ari}`);
            return twg(ari);
          },
        }),
    component: async (id) => {
      calls.push(`component:${id}`);
      return COMPONENTS[id] ?? null;
    },
    projectRole: (id) => {
      calls.push(`role:${id}`);
      return id === "10100" ? { name: "Administrators", actorAccountIds: ["acc-admin", "acc-2"] } : null;
    },
  };
}

describe("evaluateRules (first match wins)", () => {
  it("routes the seed clusters to their expected owners (SEED_DATA §12 truth)", () => {
    const owner = (type: TakeoverType) => evaluateRules(SEED_RULES, { type, variant: "cam-B" })?.teamRef.label;
    expect(owner("lane-loss")).toBe("Perception");
    expect(owner("late-brake")).toBe("Planning");
    expect(owner("cut-in-response")).toBe("Planning");
    expect(owner("lateral-drift")).toBe("Controls");
    expect(owner("phantom-brake")).toBe("Perception");
    expect(evaluateRules(SEED_RULES, { type: "unknown", variant: "x" })).toEqual({ ruleIndex: 4, ruleText: "default -> project lead", teamRef: SEED_RULES[4]?.team });
  });

  it("renders deterministic rule text", () => {
    expect(ruleText(SEED_RULES[2] as RoutingRule)).toBe("type in {late-brake, cut-in-response} -> Planning");
    expect(ruleText({ match: { type: "lane-loss", component: "Perception", variant: ["cam-A"] }, team: { teamAri: "ari:team/1" } })).toBe(
      "type = lane-loss and component = Perception and variant = cam-A -> team ari:team/1",
    );
  });

  it("matches on component and variant", () => {
    const rule: RoutingRule = { match: { component: ["Perception", "Vision"], variant: "cam-B" }, team: { componentId: "1" } };
    expect(ruleMatches(rule, { type: "unknown", variant: "cam-B", components: ["Vision"] })).toBe(true);
    expect(ruleMatches(rule, { type: "unknown", variant: "cam-B" })).toBe(false);
    expect(ruleMatches(rule, { type: "unknown", variant: "cam-A", components: ["Vision"] })).toBe(false);
  });

  it("returns null when nothing matches", () => {
    expect(evaluateRules(SEED_RULES.slice(0, 1), { type: "unknown", variant: "x" })).toBeNull();
  });

  it("the result is the first matching index, and appending rules never changes a match (property)", () => {
    const ruleArb: fc.Arbitrary<RoutingRule> = fc.record({
      match: fc.record({ type: fc.subarray([...TAKEOVER_TYPES], { minLength: 1 }), variant: fc.constantFrom("cam-A", "cam-B") }, { requiredKeys: [] }),
      team: fc.record({ componentId: fc.constantFrom("1", "2") }),
    });
    fc.assert(
      fc.property(fc.array(ruleArb, { maxLength: 8 }), fc.array(ruleArb, { maxLength: 3 }), fc.constantFrom(...TAKEOVER_TYPES), fc.constantFrom("cam-A", "cam-B"), (rules, extra, type, variant) => {
        const subject = { type, variant };
        const r = evaluateRules(rules, subject);
        const expected = rules.findIndex((x) => ruleMatches(x, subject));
        expect(r?.ruleIndex ?? -1).toBe(expected);
        if (r !== null) expect(evaluateRules([...rules, ...extra], subject)).toEqual(r);
      }),
    );
  });
});

describe("parseRoutingRules", () => {
  it("accepts the seed rules", () => {
    const r = parseRoutingRules(SEED_RULES);
    expect(r.ok && r.value).toEqual(SEED_RULES);
  });

  it("rejects a default rule that is not last, a rule without a target and bad types", () => {
    const r = parseRoutingRules([{ match: {}, team: { componentId: "1" } }, { match: { type: "flying" }, team: {} }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const paths = r.error.map((e) => e.path);
      expect(paths).toContain("[1].match.type");
      expect(parseRoutingRules([{ match: {}, team: { componentId: "1" } }, { match: { type: "lane-loss" }, team: {} }]).ok).toBe(false);
    }
    const order = parseRoutingRules([{ match: {}, team: { componentId: "1" } }, { match: { type: "lane-loss" }, team: { componentId: "2" } }]);
    expect(!order.ok && order.error.map((e) => [e.code, e.path])).toEqual([["E_ROUTING_RULE", "[0].match"]]);
    const noTarget = parseRoutingRules([{ match: {}, team: { label: "x" } }]);
    expect(!noTarget.ok && noTarget.error.map((e) => e.path)).toEqual(["[0].team"]);
    expect(parseRoutingRules({}).ok).toBe(false);
  });
});

describe("suggestRoute", () => {
  const bound: RoutingRule[] = [{ match: { type: "lane-loss" }, team: { teamAri: "ari:team/perc", componentId: "10001", label: "Perception" } }, ...SEED_RULES.slice(1)];
  const laneLoss = { type: "lane-loss" as const, variant: "cam-B" };

  it("uses the component lead when no team is bound (source: component)", async () => {
    const calls: string[] = [];
    const r = await suggestRoute(SEED_RULES, laneLoss, fakeSources(undefined, calls));
    expect(r).toEqual({
      rule: { index: 0, text: "type = lane-loss -> Perception" },
      twgStatus: "skipped",
      evidence: [{ step: "component", ref: "10001", outcome: "used", detail: "lead of component Perception" }],
      source: "component",
      team: { name: "Perception", ref: "10001", source: "component" },
      contact: { accountId: "acc-admin", source: "component" },
    });
    expect(calls).toEqual(["component:10001"]);
  });

  it("uses TWG when bound and ok, without calling fallbacks", async () => {
    const calls: string[] = [];
    const r = await suggestRoute(bound, laneLoss, fakeSources(() => ({ status: "ok", teamName: "Perception squad", memberAccountIds: ["acc-7", "acc-8"] }), calls));
    expect(r.source).toBe("twg");
    expect(r.twgStatus).toBe("ok");
    expect(r.team).toEqual({ name: "Perception squad", ref: "ari:team/perc", source: "twg" });
    expect(r.contact).toEqual({ accountId: "acc-7", source: "twg" });
    expect(r.members).toEqual(["acc-7", "acc-8"]);
    expect(r.fallbackReason).toBeUndefined();
    expect(calls).toEqual(["twg:ari:team/perc"]);
  });

  it("falls back on not-permitted, empty, thrown and simulated TWG errors", async () => {
    const notPermitted = await suggestRoute(bound, laneLoss, fakeSources(() => ({ status: "not-permitted", message: "User is not permitted to query this organization" })));
    expect(notPermitted.source).toBe("component");
    expect(notPermitted.twgStatus).toBe("error");
    expect(notPermitted.fallbackReason).toBe("TWG not permitted: User is not permitted to query this organization");

    const empty = await suggestRoute(bound, laneLoss, fakeSources(() => ({ status: "ok", teamName: "P", memberAccountIds: [] })));
    expect([empty.source, empty.twgStatus]).toEqual(["component", "empty"]);
    expect(empty.fallbackReason).toContain("possibly a missing scope");

    const thrown = await suggestRoute(
      bound,
      laneLoss,
      fakeSources(() => Promise.reject(new Error("timeout after 4 s"))),
    );
    expect([thrown.source, thrown.twgStatus, thrown.fallbackReason]).toEqual(["component", "error", "TWG error: timeout after 4 s"]);

    const calls: string[] = [];
    const sim = await suggestRoute(bound, laneLoss, fakeSources(() => ({ status: "ok", memberAccountIds: ["a"] }), calls), { simulateTwgError: true });
    expect([sim.source, sim.twgStatus]).toEqual(["component", "error"]);
    expect(calls).toEqual(["component:10001"]);

    const unavailable = await suggestRoute(bound, laneLoss, fakeSources());
    expect([unavailable.twgStatus, unavailable.fallbackReason]).toEqual(["skipped", "TWG unavailable"]);
  });

  it("falls back to the project role when the component has no lead", async () => {
    const r = await suggestRoute(SEED_RULES, { type: "lateral-drift", variant: "cam-B" }, fakeSources(), { fallbackProjectRoleId: "10100" });
    expect(r.source).toBe("project-role");
    expect(r.contact).toEqual({ accountId: "acc-admin", source: "project-role" });
    expect(r.team).toEqual({ name: "Administrators", ref: "10100", source: "project-role" });
    expect(r.fallbackReason).toBe("component Controls has no lead");
    expect(r.evidence.map((e) => e.outcome)).toEqual(["no-lead", "used"]);
  });

  it("reports none with the reasons when every hop fails", async () => {
    const r = await suggestRoute(SEED_RULES, { type: "lateral-drift", variant: "cam-B" }, fakeSources(), { fallbackProjectRoleId: "999" });
    expect(r.source).toBe("none");
    expect(r.team).toBeUndefined();
    expect(r.fallbackReason).toBe("component Controls has no lead; project role 999 not found");
    const none = await suggestRoute([], laneLoss, fakeSources());
    expect(none).toEqual({ rule: { index: -1, text: "no routing rule matched" }, source: "none", twgStatus: "skipped", evidence: [], fallbackReason: "no routing rule matched" });
  });

  it("routes the default rule to project-role actors", async () => {
    const r = await suggestRoute(SEED_RULES, { type: "unknown", variant: "cam-A" }, fakeSources());
    expect([r.rule.index, r.source, r.contact?.accountId]).toEqual([4, "project-role", "acc-admin"]);
  });

  it("a source that throws synchronously is an error hop, not a crash", async () => {
    const sources: RoutingSources = {
      component: () => {
        throw new Error("403");
      },
      projectRole: () => null,
    };
    const r = await suggestRoute(SEED_RULES, laneLoss, sources);
    expect(r.evidence).toEqual([{ step: "component", ref: "10001", outcome: "error", detail: "component 10001 lookup failed: 403" }]);
    expect(r.source).toBe("none");
  });
});
