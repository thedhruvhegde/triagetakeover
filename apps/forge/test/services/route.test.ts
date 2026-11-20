import { describe, expect, it } from "vitest";
import { saveProjectConfig } from "../../src/services/config.js";
import { applyRoute, listMyTeams, suggestOwner } from "../../src/services/route.js";
import { splitEvent, undoLast } from "../../src/services/triage.js";
import { ADMIN, ENGINEER, fileEvent, laneLoss, must, serviceWorld, value } from "./helpers.js";

const TEAM = "ari:cloud:identity::team/11111111-2222-3333-4444-555555555555";

async function setup(rules: (componentId: string) => unknown[]) {
  const sw = serviceWorld();
  sw.world.site.addUser({ accountId: "acc-member", displayName: "Team Member" });
  const comp = must(await sw.ctx(ADMIN).ports.jira.asUser().createComponent({ projectKey: "TTDEMO", name: "Perception", leadAccountId: ADMIN }));
  value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { routing: rules(comp.id) }));
  const ev = await fileEvent(sw, laneLoss());
  const split = value(await splitEvent(sw.ctx(), ev.key));
  return { sw, comp, ev, clusterKey: split.cluster?.key ?? "" };
}

const componentRule = (id: string) => [{ match: { type: "lane-loss" }, team: { componentId: id, label: "Perception" } }];
const twgRule = (id: string) => [{ match: { type: "lane-loss" }, team: { teamAri: TEAM, componentId: id, label: "Perception" } }];

describe("suggestOwner", () => {
  it("component lead: names the rule and the source", async () => {
    const { sw, clusterKey } = await setup(componentRule);
    const r = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(r.source).toBe("component");
    expect(r.contact).toMatchObject({ accountId: ADMIN, displayName: "Site Admin", source: "component" });
    expect(r.why[0]).toBe("Rule #1 (type = lane-loss -> Perception) matched");
    expect(r.why).toContain("Owner from component lead");
    expect(r.twgStatus).toBe("skipped");
    expect(r.confidence.value).toBe(1);
    expect(r.evidence.map((e) => e.kind)).toEqual(["issue", "rule"]);
  });

  it("TWG team with members (UI only; members dropped for actions)", async () => {
    const { sw, clusterKey } = await setup(twgRule);
    sw.world.twg.addTeam({ ari: TEAM, name: "Perception squad", members: ["acc-member", ENGINEER] });
    const ui = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(ui.source).toBe("twg");
    expect(ui.team).toMatchObject({ name: "Perception squad", source: "twg" });
    expect(ui.members?.map((m) => m.accountId)).toEqual(["acc-engineer", "acc-member"]);
    expect(ui.twgStatus).toBe("ok");
    const action = value(await suggestOwner(sw.ctx(), clusterKey, { includeMembers: false }));
    expect(action.members).toBeUndefined();
    expect(sw.world.twg.calls.every((c) => c.as === ENGINEER)).toBe(true);
  });

  it("empty TWG (missing scope) falls back to the component lead and says why", async () => {
    const { sw, clusterKey } = await setup(twgRule);
    sw.world.twg.setMode("scopes-missing");
    const r = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(r.source).toBe("component");
    expect(r.twgStatus).toBe("empty");
    expect(r.why.some((w) => w.includes("possibly a missing scope or no data"))).toBe(true);
    expect(r.confidence.value).toBe(0.5);
  });

  it("TWG error falls back and trips the 10-minute breaker", async () => {
    const { sw, clusterKey } = await setup(twgRule);
    sw.world.twg.setMode("not-permitted");
    const first = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(first.twgStatus).toBe("error");
    expect(first.source).toBe("component");
    sw.world.twg.setMode("normal");
    sw.world.twg.addTeam({ ari: TEAM, name: "Perception squad", members: ["acc-member"] });
    const calls = sw.world.twg.calls.length;
    const second = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(sw.world.twg.calls.length).toBe(calls);
    expect(second.twgStatus).toBe("skipped");
    expect(second.why.some((w) => /TWG skipped: it failed recently \(not-permitted/.test(w))).toBe(true);
    sw.world.clock.advance({ minutes: 11 });
    expect(value(await suggestOwner(sw.ctx(), clusterKey)).twgStatus).toBe("ok");
  });

  it("simulated TWG error (staging setting) is labelled as simulated", async () => {
    const { sw, clusterKey } = await setup(twgRule);
    value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { simulateTwgError: true }));
    const r = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(r.twgStatus).toBe("error");
    expect(r.why).toContain("TWG error is SIMULATED (staging setting)");
  });

  it("without rules routes to the project administrators role", async () => {
    const { sw, clusterKey } = await setup(() => []);
    const r = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(r.source).toBe("project-role");
    expect(r.contact?.accountId).toBe(ADMIN);
    expect(r.why.some((w) => /No routing rules are configured/.test(w))).toBe(true);
  });

  it("rejects non-cluster issues", async () => {
    const { sw, ev } = await setup(componentRule);
    const r = await suggestOwner(sw.ctx(), ev.key);
    expect(!r.ok && r.error.code).toBe("invalid-input");
  });
});

describe("applyRoute + undo", () => {
  it("sets the component, comments with a mention, and undo restores the components", async () => {
    const { sw, comp, ev, clusterKey } = await setup(componentRule);
    const r = value(await applyRoute(sw.ctx(), ev.key, clusterKey));
    expect(r.summary).toMatch(/added component Perception, added a routing comment/);
    const cluster = must(await sw.ctx().ports.jira.asUser().getIssue(clusterKey));
    expect(cluster.components.map((c) => c.id)).toEqual([comp.id]);
    const comments = must(await sw.ctx().ports.jira.asUser().getComments(clusterKey));
    expect(comments[0]?.body).toMatch(/Suggested contact: \[~accountid:acc-admin\]/);
    expect(comments[0]?.authorAccountId).toBe(ENGINEER);
    const u = value(await undoLast(sw.ctx(), ev.key));
    expect(u.summary).toMatch(/Reverted the route/);
    expect(must(await sw.ctx().ports.jira.asUser().getIssue(clusterKey)).components).toEqual([]);
  });

  it("writes the configured Team field when the source is TWG (SPIKE-R2)", async () => {
    const { sw, ev, clusterKey } = await setup(twgRule);
    sw.world.twg.addTeam({ ari: TEAM, name: "Perception squad", members: ["acc-member"] });
    value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { routeField: "customfield_10001" }));
    const r = value(await applyRoute(sw.ctx(), ev.key, clusterKey));
    expect(r.summary).toMatch(/set customfield_10001 to team Perception squad/);
    const cluster = must(await sw.ctx().ports.jira.asUser().getIssue(clusterKey, { extraFields: ["customfield_10001"] }));
    expect(cluster.fields?.["customfield_10001"]).toBe(TEAM);
    value(await undoLast(sw.ctx(), ev.key));
    const reverted = must(await sw.ctx().ports.jira.asUser().getIssue(clusterKey, { extraFields: ["customfield_10001"] }));
    expect(reverted.fields?.["customfield_10001"]).toBeNull();
  });
});

describe("listMyTeams", () => {
  it("reports empty honestly", async () => {
    const sw = serviceWorld();
    const r = value(await listMyTeams(sw.ctx()));
    expect(r.status).toBe("empty");
    expect(r.message).toMatch(/possibly a missing scope or no data/);
  });
  it("lists teams of the caller", async () => {
    const sw = serviceWorld();
    sw.world.twg.addTeam({ ari: TEAM, name: "Perception squad", members: [ENGINEER] });
    expect(value(await listMyTeams(sw.ctx())).teams).toEqual([{ ari: TEAM, name: "Perception squad" }]);
  });
});
