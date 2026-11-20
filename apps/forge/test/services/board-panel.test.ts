import { describe, expect, it } from "vitest";
import { getBoard, listNovelSince, markTriaged, buildRegressionCheck, listCoverageGapsFor } from "../../src/services/board.js";
import { getPanel } from "../../src/services/panel.js";
import { acceptMatch, splitEvent } from "../../src/services/triage.js";
import { createScenarioStub, previewScenarioStub } from "../../src/services/coverage.js";
import { ENGINE_VERSION } from "@tt/engine";
import type { PanelEventView } from "../../src/contract/ui-api.js";
import { ENGINEER, OUTSIDER, drainRecluster, farLaneLoss, fileEvent, jsonSafe, laneLoss, must, serviceWorld, value, type ServiceWorld } from "./helpers.js";

async function clusterWorld(): Promise<{ sw: ServiceWorld; clusterKey: string; clusterId: string; members: { key: string; id: string }[] }> {
  const sw = serviceWorld();
  const a = await fileEvent(sw, laneLoss(0, { build: "4.11.3", occurredAt: "2026-11-01T10:00:00Z" }));
  const s = value(await splitEvent(sw.ctx(), a.key));
  const b = await fileEvent(sw, laneLoss(1, { build: "4.12.0", occurredAt: "2026-11-02T10:00:00Z" }));
  value(await acceptMatch(sw.ctx(), b.key, s.cluster?.key ?? ""));
  return { sw, clusterKey: s.cluster?.key ?? "", clusterId: s.cluster?.id ?? "", members: [a, b] };
}

describe("board", () => {
  it("empty project: empty state, never an error (US-02 AC2)", async () => {
    const sw = serviceWorld();
    const b = value(await getBoard(sw.ctx(), "TTDEMO"));
    expect(b.empty).toBe(true);
    expect(b.clusters).toEqual([]);
    expect(b.scenarioCount).toBe(0);
    expect(b.disclaimer).toMatch(/not a safety tool/);
    expect(jsonSafe(b)).toBe(true);
  });

  it("requires Browse (index data is app-wide, §14)", async () => {
    const { sw } = await clusterWorld();
    const r = await getBoard(sw.ctx(OUTSIDER), "TTDEMO");
    expect(!r.ok && r.error.code).toBe("forbidden-or-not-found");
  });

  it("lists clusters with onset, coverage, builds, pending suggestions, novel queue and proposed groups", async () => {
    const { sw, clusterKey, clusterId } = await clusterWorld();
    const c = await fileEvent(sw, laneLoss(-1, { occurredAt: "2026-11-15T10:00:00Z" }));
    const f1 = await fileEvent(sw, farLaneLoss(0, { occurredAt: "2026-11-15T11:00:00Z" }));
    const f2 = await fileEvent(sw, farLaneLoss(1, { occurredAt: "2026-11-15T12:00:00Z" }));
    await drainRecluster(sw);
    const b = value(await getBoard(sw.ctx(), "TTDEMO"));
    expect(b.empty).toBe(false);
    expect(b.clusters).toHaveLength(1);
    const row = b.clusters[0];
    expect(row?.cluster).toMatchObject({ key: clusterKey, id: clusterId, name: "Lane-loss · cam-B", memberCount: 2 });
    expect(row?.buildsSeen).toEqual(["4.11.3", "4.12.0"]);
    expect(row?.pendingSuggestions).toEqual([c.key]);
    expect(row?.onset.verdict).toBe("not-enough-data");
    expect(row?.onset.message).toBe("Exposure unknown. Add drive sessions.");
    expect(row?.coverage.text).toBe("No scenario tests found (looked for: labels = tt-scenario OR issuetype = Test)");
    expect(b.proposedGroups).toHaveLength(1);
    expect(b.proposedGroups[0]?.members).toEqual([f1.key, f2.key]);
    expect(b.proposedGroups[0]?.confidence.value).toBeGreaterThan(0);
    expect(b.totals).toMatchObject({ events: 5, accepted: 2, proposed: 3, clusters: 1 });
    expect(jsonSafe(b)).toBe(true);
  });

  it("novel queue and list-novel-since use the Mark triaged timestamp", async () => {
    const { sw } = await clusterWorld();
    sw.world.clock.set("2026-11-16T09:00:00.000Z");
    const mark = value(await markTriaged(sw.ctx(), "TTDEMO"));
    expect(mark.by).toBe(ENGINEER);
    const novel = await fileEvent(sw, farLaneLoss(0, { occurredAt: "2026-11-16T10:00:00Z" }));
    await fileEvent(sw, farLaneLoss(0, { occurredAt: "2026-11-10T10:00:00Z", build: "4.11.3" }));
    const b = value(await getBoard(sw.ctx(), "TTDEMO"));
    expect(b.sinceLastTriage).toMatchObject({ at: mark.at, source: "mark-triaged", newEvents: 1 });
    const since = value(await listNovelSince(sw.ctx(), "TTDEMO", { limit: 10 }));
    expect(since.sinceSource).toBe("mark-triaged");
    expect(since.events.map((e) => e.event.key)).toEqual([novel.key]);
    expect(since.events[0]?.reason).toBe("exceeds-tau");
    expect(since.events[0]?.nearestCluster).toBeDefined();
    expect(since.events[0]?.message).toMatch(/^Proposed new cluster: nearest TTDEMO-\d+ at d=\d/);
  });

  it("onset uses drive-session km of the variant and is filterable by build", async () => {
    const { sw, clusterKey } = await clusterWorld();
    for (const [build, km] of [["4.11.3", 3100], ["4.12.0", 2400]] as const) {
      must(await sw.world.storage.putEntity("drive-session", `DS-${build}`, { sessionId: `DS-${build}`, vehicleId: "V-01", variant: "cam-B", build, date: 0, km, odd: ["highway"], source: "test", synthetic: true }));
    }
    const r = value(await buildRegressionCheck(sw.ctx(), "TTDEMO", { clusterKey }));
    expect(r.scope).toBe("cluster");
    expect(r.results[0]?.onset.builds).toEqual([
      { build: "4.11.3", events: 1, km: 3100 },
      { build: "4.12.0", events: 1, km: 2400 },
    ]);
    expect(r.results[0]?.onset.message).toMatch(/at least 3 accepted members/);
    expect((await buildRegressionCheck(sw.ctx(), "TTDEMO", {})).ok).toBe(false);
  });

  it("coverage gaps and scenario stub (preview, create, idempotent)", async () => {
    const { sw, clusterKey, members } = await clusterWorld();
    must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Test", summary: "SCN", labels: ["tt-scenario", "type:lane-loss", "variant:cam-A"] }));
    const gaps = value(await listCoverageGapsFor(sw.ctx(), "TTDEMO", { minEvents: 2, includePartial: true, limit: 25 }));
    expect(gaps.gaps.map((g) => g.cluster.key)).toEqual([clusterKey]);
    expect(gaps.gaps[0]?.verdict).toBe("uncovered");
    expect(gaps.gaps[0]?.text).toBe("0 scenario tests cover lane-loss x normal x cam-B x highway");
    const preview = value(await previewScenarioStub(sw.ctx(), clusterKey));
    expect(preview.created).toBeUndefined();
    expect(preview.summary).toBe(`[SYNTHETIC] Scenario: Lane-loss · cam-B (from ${clusterKey})`);
    expect(preview.labels).toEqual(expect.arrayContaining(["tt-scenario", "type:lane-loss", "variant:cam-B", "cond:normal", "odd:highway", "tt-synthetic"]));
    expect([...preview.linkedEvents].sort()).toEqual(members.map((m) => m.key).sort());
    expect(preview.narrativeSource).toBe("template");
    const before = sw.world.site.issueCount();
    const created = value(await createScenarioStub(sw.ctx(), clusterKey));
    expect(created.created?.key).toMatch(/^TTDEMO-\d+$/);
    expect(sw.world.site.issueCount()).toBe(before + 1);
    const stub = must(await sw.ctx().ports.jira.asUser().getIssue(created.created?.key ?? "", { properties: ["tt.scenario"] }));
    expect(stub.properties["tt.scenario"]).toMatchObject({ v: 1, type: "lane-loss", variant: "cam-B", cond: ["normal"], odd: ["highway"] });
    expect(stub.links?.length).toBe(3);
    // the stub now covers the cluster
    const after = value(await listCoverageGapsFor(sw.ctx(), "TTDEMO", { minEvents: 2, includePartial: true, limit: 25 }));
    expect(after.gaps).toEqual([]);
    const again = await createScenarioStub(sw.ctx(), clusterKey);
    expect(again.ok && again.value.value.created?.key).toBe(created.created?.key);
    expect(sw.world.site.issueCount()).toBe(before + 1);
  });
});

describe("panel", () => {
  it("no tt.event → honest no-signal state; cluster issue → cluster view", async () => {
    const { sw, clusterKey } = await clusterWorld();
    const plain = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    expect(value(await getPanel(sw.ctx(), plain.key))).toEqual({ kind: "no-signal-data", issueKey: plain.key, message: "No signal data." });
    const c = value(await getPanel(sw.ctx(), clusterKey));
    expect(c.kind).toBe("cluster");
    if (c.kind === "cluster") expect(c.members).toHaveLength(2);
  });

  it("event view: plot data for event + neighbours, features, chips, triage, evidence", async () => {
    const { sw, members } = await clusterWorld();
    const c = await fileEvent(sw, laneLoss(-1, { chips: ["low-sun-glare"] }));
    const p = value(await getPanel(sw.ctx(), c.key)) as PanelEventView;
    expect(p.kind).toBe("event");
    expect(p.telemetry.channels["lane_offset"]).toHaveLength(201);
    expect(p.neighbourTelemetry.map((n) => n.key).sort()).toEqual(members.map((m) => m.key).sort());
    expect(p.features.map((f) => f.feature)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]);
    expect(p.chips).toEqual([{ chip: "low-sun-glare", rules: ["sunBlob 0.01 >= 0.004"] }]);
    expect(p.imageNote).toMatch(/not scene understanding/);
    expect(p.propertyVersion).toEqual({ v: 1, engine: ENGINE_VERSION, app: "1.0.0", currentEngine: ENGINE_VERSION });
    expect(p.index.reprocessed).toBe(false);
    expect(p.triage.state).toBe("none");
    expect(jsonSafe(p)).toBe(true);
    const accepted = value(await getPanel(sw.ctx(), members[1]?.key ?? "")) as PanelEventView;
    expect(accepted.match.result).toBe("accepted");
    expect(accepted.undo.available).toBe(true);
    expect(accepted.triage.history.map((h) => h.action)).toEqual(["accept"]);
  });

  it("lazily indexes an event written by another tool (§7.5, §15 #11)", async () => {
    const { sw } = await clusterWorld();
    const app = sw.world.site.gateway({}).asApp();
    const ref = must(await app.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "written elsewhere" }));
    must(await app.setIssueProperty(ref.key, "tt.event", laneLoss(2)));
    expect(must(await sw.world.storage.getEntity("event", ref.id))).toBeUndefined();
    sw.world.queue.take();
    const p = value(await getPanel(sw.ctx(), ref.key)) as PanelEventView;
    expect(p.index).toMatchObject({ reprocessed: true, reason: "the event was not indexed yet" });
    expect(must(await sw.world.storage.getEntity("event", ref.id))?.status).toBe("proposed");
    expect(sw.world.queue.peek("tt-recluster").map((j) => (j.body as { reason: string }).reason)).toContain("panel-lazy");
    const again = value(await getPanel(sw.ctx(), ref.key)) as PanelEventView;
    expect(again.index.reprocessed).toBe(false);
  });

  it("re-processes rows computed with another engine version (§15 #26)", async () => {
    const { sw, members } = await clusterWorld();
    const id = members[0]?.id ?? "";
    const row = must(await sw.world.storage.getEntity("event", id));
    if (row === undefined) throw new Error("row");
    must(await sw.world.storage.putEntity("event", id, { ...row, engine: "0.9.0" }));
    const p = value(await getPanel(sw.ctx(), members[0]?.key ?? "")) as PanelEventView;
    expect(p.index.reason).toBe("the index was computed with engine 0.9.0");
    expect(must(await sw.world.storage.getEntity("event", id))?.engine).toBe(ENGINE_VERSION);
  });

  it("uses Jira links as truth when they were edited by hand (§15 #12)", async () => {
    const { sw, members, clusterKey } = await clusterWorld();
    const key = members[1]?.key ?? "";
    const links = must(await sw.ctx().ports.jira.asUser().getIssueLinks(key));
    must(await sw.ctx().ports.jira.asUser().deleteIssueLink(links[0]?.id ?? ""));
    const p = value(await getPanel(sw.ctx(), key)) as PanelEventView;
    expect(p.index.outOfSync).toBe(true);
    expect(p.warnings.some((w) => /Out of sync/.test(w))).toBe(true);
    // Only one accepted member is left in the bucket, so this is honestly "first of its kind".
    expect(p.match.result).toBe("first-of-kind");
    expect(must(await sw.world.storage.getEntity("event", members[1]?.id ?? ""))).toMatchObject({ status: "novel", clusterId: "" });
    void clusterKey;
  });

  it("flags tampered signal data and shows the recomputed values", async () => {
    const { sw } = await clusterWorld();
    const app = sw.world.site.gateway({}).asApp();
    const ref = must(await app.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "tampered" }));
    const e = laneLoss(0);
    must(await app.setIssueProperty(ref.key, "tt.event", { ...e, sig: { ...e.sig, features: { ...e.sig.features, F6: 0.95 } } }));
    const p = value(await getPanel(sw.ctx(), ref.key)) as PanelEventView;
    expect(p.match.event.tampered).toBe(true);
    expect(p.warnings.some((w) => /modified outside the app/.test(w))).toBe(true);
    expect(p.features.find((f) => f.feature === "F6")?.eventValue).toBe(e.sig.features.F6);
  });

  it("invalid tt.event → invalid-signal-data with paths", async () => {
    const { sw } = await clusterWorld();
    const app = sw.world.site.gateway({}).asApp();
    const ref = must(await app.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "bad" }));
    must(await app.setIssueProperty(ref.key, "tt.event", { v: 1, engine: "x" }));
    const p = value(await getPanel(sw.ctx(), ref.key));
    expect(p.kind).toBe("invalid-signal-data");
    if (p.kind === "invalid-signal-data") expect(p.errors.length).toBeGreaterThan(0);
  });
});
