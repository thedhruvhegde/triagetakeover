import { describe, expect, it } from "vitest";
import { compareSemver, conditionSignature } from "@tt/engine";
import type { DriveSessionRow, EventRow } from "../../src/ports/entities.js";
import { EXPOSURE_UNKNOWN, exposureFor, onsetViews } from "../../src/services/onset.js";
import { coverageView, gapGridView, loadScenarioTests } from "../../src/services/coverage.js";
import { defaultProjectConfig, saveProjectConfig } from "../../src/services/config.js";
import { createMemoryWorld } from "../../src/adapters/memory/index.js";
import { ADMIN, jsonSafe, must, serviceWorld, value } from "./helpers.js";

const session = (build: string, km: number, variant = "cam-B"): DriveSessionRow => ({ sessionId: `DS-${build}-${km}`, vehicleId: "V-01", variant, build, date: 0, km, odd: ["highway"], source: "test", synthetic: true });
const member = (key: string, build: string): { key: string; value: EventRow } => ({
  key,
  value: { issueKey: key, projectKey: "TTDEMO", bucket: "lane-loss|cam-B", type: "lane-loss", variant: "cam-B", build, occurredAt: 0, status: "accepted", clusterId: "c1", proposalId: "", nnDist: 0, chipsMask: 0, features: {}, engine: "1.0.0", synthetic: true, indexedAt: 0 },
});

describe("onset", () => {
  it("aggregates km per build and orders builds", () => {
    const x = exposureFor([session("4.12.0", 100), session("4.11.0", 50), session("4.12.0", 20)], ["4.12.0", "4.12.0", "4.11.3"], compareSemver);
    expect(x).toEqual([
      { build: "4.11.0", events: 0, km: 50 },
      { build: "4.11.3", events: 1, km: 0 },
      { build: "4.12.0", events: 2, km: 120 },
    ]);
  });

  it("reproduces the PRD worked example (0 in 3,100 km vs 8 in 2,400 km, m = 1)", () => {
    const members = Array.from({ length: 8 }, (_, i) => member(`TTDEMO-${i + 1}`, "4.12.0"));
    const views = onsetViews([{ clusterId: "c1", clusterKey: "TTDEMO-100", variant: "cam-B", members }], new Map([["cam-B", [session("4.11.3", 3100), session("4.12.0", 2400)]]]), compareSemver);
    const v = views.get("c1");
    expect(v?.verdict).toBe("regression-likely");
    expect(v?.onsetBuild).toBe("4.12.0");
    expect(v?.pRaw).toBeCloseTo(0.0013146, 6);
    expect(v?.pHolm).toBeCloseTo(0.0013146, 6);
    expect(v?.rateRatio).toBe("∞");
    expect(v?.rrCi95?.[1]).toBe("∞");
    expect(v?.k1).toBe(0);
    expect(v?.k2).toBe(8);
    expect(v?.exposureFilter).toBe("Exposure filtered to cam-B vehicles");
    expect(v?.caveats).toContain("Screening signal, not a causal attribution.");
    expect(v?.confidence.definition).toMatch(/not the probability that the build caused/);
    expect(v?.evidence[0]?.kind).toBe("driveSessions");
    expect(jsonSafe(v)).toBe(true);
  });

  it("applies Holm across the clusters in view", () => {
    const strong = Array.from({ length: 8 }, (_, i) => member(`TTDEMO-${i + 1}`, "4.12.0"));
    const flat = [member("TTDEMO-20", "4.11.3"), member("TTDEMO-21", "4.12.0"), member("TTDEMO-22", "4.11.3")];
    const sessions = new Map([["cam-B", [session("4.11.3", 3100), session("4.12.0", 2400)]]]);
    const views = onsetViews(
      [
        { clusterId: "a", clusterKey: "TTDEMO-100", variant: "cam-B", members: strong },
        { clusterId: "b", clusterKey: "TTDEMO-101", variant: "cam-B", members: flat },
      ],
      sessions,
      compareSemver,
    );
    expect(views.get("a")?.pHolm).toBeCloseTo(2 * 0.0013146, 6);
    expect(views.get("a")?.holmFamilySize).toBe(2);
    // The caveat names the real family (the project's tested clusters), not "this view".
    expect(views.get("a")?.caveats.join(" ")).toContain("Holm correction across the 2 tested cluster(s) of this project");
    expect(views.get("a")?.caveats.join(" ")).not.toContain("in this view");
    expect(views.get("b")?.verdict).toBe("no-evidence");
  });

  it("says 'Exposure unknown' without drive sessions and shows no p-value (US-13 AC3)", () => {
    const members = Array.from({ length: 5 }, (_, i) => member(`TTDEMO-${i + 1}`, "4.12.0"));
    const v = onsetViews([{ clusterId: "c", clusterKey: "TTDEMO-9", variant: "cam-A", members }], new Map(), compareSemver).get("c");
    expect(v?.verdict).toBe("not-enough-data");
    expect(v?.message).toBe(EXPOSURE_UNKNOWN);
    expect(v?.pRaw).toBeNull();
    expect(v?.confidence.value).toBe(0);
  });

  it("says how many events are missing when n < 3", () => {
    const v = onsetViews([{ clusterId: "c", clusterKey: "TTDEMO-9", variant: "cam-B", members: [member("TTDEMO-1", "4.12.0")] }], new Map([["cam-B", [session("4.11.0", 10), session("4.12.0", 10)]]]), compareSemver).get("c");
    expect(v?.message).toMatch(/at least 3 accepted members \(have 1\)/);
  });
});

describe("coverage", () => {
  const sig = conditionSignature({ type: "lane-loss", variant: "cam-B" }, [{ chips: ["low-sun-glare"], odd: ["highway"] }, { chips: ["low-sun-glare"], odd: ["highway"] }]);

  it("no scenario tests → the US-13 AC4 message", () => {
    const v = coverageView(sig, { jql: "labels = tt-scenario", state: "no-scenario-tests", tests: [] });
    expect(v.text).toBe("No scenario tests found (looked for: labels = tt-scenario)");
    expect(v.verdict).toBeNull();
  });

  it("uncovered gives the engine's deterministic sentence", () => {
    const v = coverageView(sig, { jql: "labels = tt-scenario", state: "ok", tests: [{ key: "TTDEMO-50", tags: { type: ["lane-loss"], variant: ["cam-A"], cond: ["blur-rain"], odd: ["rural"] } }] });
    expect(v.verdict).toBe("uncovered");
    expect(v.text).toBe("0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway");
    expect(v.confidence.value).toBe(0.25);
  });

  it("covered lists the covering tests as evidence", () => {
    const v = coverageView(sig, { jql: "j", state: "ok", tests: [{ key: "TTDEMO-51", tags: { type: ["lane-loss"], variant: ["any"], cond: ["low-sun-glare"], odd: ["highway"] } }] });
    expect(v.verdict).toBe("covered");
    expect(v.text).toBe("Covered by 1 test(s): TTDEMO-51");
    expect(v.evidence[0]).toMatchObject({ kind: "scenario", key: "TTDEMO-51", url: "/browse/TTDEMO-51" });
  });

  it("gap grid marks the red cell", () => {
    const g = gapGridView([{ signature: sig, events: 14 }], { jql: "j", state: "ok", tests: [{ key: "T-1", tags: { type: ["phantom-brake"], cond: ["low-sun-glare"] } }] });
    const row = g.rows.find((r) => r.dimension === "cond" && r.value === "low-sun-glare");
    expect(row?.cells.find((c) => c.type === "lane-loss")).toEqual({ type: "lane-loss", events: 14, tests: 0, gap: true });
    expect(row?.cells.find((c) => c.type === "phantom-brake")?.tests).toBe(1);
  });

  it("loads tests by label and by the tt.scenario property, also when search omits properties (SPIKE-E3)", async () => {
    for (const searchReturnsProperties of [true, false]) {
      const w = createMemoryWorld({ jira: { searchReturnsProperties } });
      w.site.addUser({ accountId: ADMIN, displayName: "Admin", globalAdmin: true });
      w.site.addProject({ key: "TTDEMO", name: "Demo", leadAccountId: ADMIN });
      const jira = w.site.gateway({ accountId: ADMIN }).asUser();
      must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "SCN-1", labels: ["tt-scenario", "type:lane-loss", "cond:night"] }));
      const p = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "SCN-7", labels: ["tt-scenario"] }));
      must(await jira.setIssueProperty(p.key, "tt.scenario", { v: 1, type: "cut-in-response", variant: "cam-B", cond: ["normal"], odd: ["highway"] }));
      const set = await loadScenarioTests(jira, defaultProjectConfig("TTDEMO"));
      expect(set.state).toBe("ok");
      expect(set.tests.map((t) => t.tags.type)).toEqual([["lane-loss"], ["cut-in-response"]]);
    }
  });

  it("reports a rejected configured JQL instead of pretending there are no tests", async () => {
    const sw = serviceWorld();
    value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { scenarioJql: "nonsense ~~ (" }));
    const set = await loadScenarioTests(sw.ctx().ports.jira.asUser(), { ...defaultProjectConfig("TTDEMO"), scenarioJql: "nonsense ~~ (" });
    expect(set.state).toBe("jql-error");
    expect(coverageView(sig, set).text).toMatch(/rejected/);
  });
});
