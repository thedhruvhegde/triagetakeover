/**
 * Integration: the default SYNTHETIC seed (seedgen, DEFAULT_SEED, fast frames) through the
 * real engine intake path and the services, on the in-memory Jira/storage fakes.
 *
 * Mirrors the demo seed (SEED_DATA §15.1): vehicles + drive sessions → scenario issues →
 * historical events written asApp through the shared write path → the ENGINE's HAC proposal
 * over history becomes cluster issues (accepted "during demo seed"; ground truth is never used
 * to link) → the Monday batch goes through `commitEvent` asUser → recluster. Truth from the
 * generator is used only to check the outcome.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { processEventFiles, proposeClusters, type TtEvent } from "@tt/engine";
import { DEFAULT_SEED, generateEventFiles, planFleet, NOTE_BRAKED_HARD, NOTE_DRIFTED_LEFT, type EventSpec, type FleetPlanOutput, type SeedConfig } from "@tt/seedgen";
import { getBoard, listCoverageGapsFor, listNovelSince } from "../../src/services/board.js";
import { commitEvent, indexEvent, prepareEventForWrite, writeEventProperties } from "../../src/services/commit.js";
import { createClusterIssue, linkMember } from "../../src/services/clusters.js";
import { defaultProjectConfig, saveProjectConfig } from "../../src/services/config.js";
import { clusterInputOf, loadProjectClusters, loadProjectEvents } from "../../src/services/index-store.js";
import { explainMatch, triageNow } from "../../src/services/match.js";
import { getPanel } from "../../src/services/panel.js";
import { requestResync } from "../../src/services/resync.js";
import { suggestOwner } from "../../src/services/route.js";
import { acceptMatch, splitEvent, undoLast } from "../../src/services/triage.js";
import { runReclusterJob } from "../../src/consumers/recluster-job.js";
import type { BoardView, PanelEventView } from "../../src/contract/ui-api.js";
import { ADMIN, ENGINEER, drainRecluster, jsonSafe, must, serviceWorld, value, type ServiceWorld } from "./helpers.js";

const cfg: SeedConfig = { seed: DEFAULT_SEED, anchorDate: "2026-11-16", profile: "demo-v1", frames: "fast" };
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface Seeded {
  readonly sw: ServiceWorld;
  readonly plan: FleetPlanOutput;
  readonly keyOf: Map<string, string>;
  readonly specOfKey: Map<string, EventSpec>;
}

async function seed(): Promise<Seeded> {
  const sw = serviceWorld();
  const plan = planFleet(cfg);
  const adminJira = sw.ctx(ADMIN).ports.jira.asUser();
  const app = sw.world.site.gateway({}).asApp();
  const storage = sw.world.storage;
  const clock = sw.world.clock;

  // S1: components (lead = the admin; no fake users) and the routing rules (§12).
  const comp = new Map<string, string>();
  for (const c of plan.routing.components) comp.set(c.name, must(await adminJira.createComponent({ projectKey: "TTDEMO", name: c.name, leadAccountId: ADMIN })).id);
  const roles = must(await adminJira.getProjectRoles("TTDEMO"));
  const adminRole = roles.find((r) => r.name === "Administrators")?.id ?? "";
  const routing = plan.routing.rules.map((r) => ({
    match: r.match.type === undefined ? {} : { type: [...r.match.type] },
    team: "component" in r.team ? { componentId: comp.get(r.team.component) ?? "", label: r.team.component } : { projectRoleId: adminRole, label: "project lead" },
  }));
  value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { routing, scenarioIssueType: "Test" }));

  // S2: vehicles and drive sessions (custom entities).
  for (const v of plan.vehicles) must(await storage.putEntity("vehicle", v.vehicleId, { vehicleId: v.vehicleId, label: v.label, variant: v.variant, sensors: v.sensors, calibration: v.calibration, synthetic: true }));
  for (const s of plan.driveSessions) {
    must(await storage.putEntity("drive-session", s.sessionId, { sessionId: s.sessionId, vehicleId: s.vehicleId, variant: s.variant, build: s.build, date: s.startEpoch, km: s.km, odd: s.odd, source: "demo-seed", synthetic: true }));
  }

  // S3: scenario issues (labels; SCN-07 in the tt.scenario property).
  for (const s of plan.scenarios) {
    const ref = must(await app.createIssue({ projectKey: "TTDEMO", issueType: "Test", summary: s.summary, labels: [...s.labels] }));
    if (s.tagsInProperty && s.property !== null) must(await app.setIssueProperty(ref.id, "tt.scenario", s.property));
  }

  // S4/S5: every event through the real engine intake path; issues created in plan order.
  const keyOf = new Map<string, string>();
  const specOfKey = new Map<string, EventSpec>();
  const events = new Map<string, TtEvent>();
  const ids = new Map<string, string>();
  for (const e of plan.events) {
    await tick();
    const files = generateEventFiles(cfg, e.eventId, plan);
    const r = processEventFiles(
      { csv: files.csv.bytes, frames: files.frames.map((f) => f.bytes) },
      { ctx: { occurredAt: e.occurredAt, vehicleId: e.vehicleId, variant: e.variant, build: e.build, driveSessionId: e.sessionId, odd: e.odd }, synthetic: true },
    );
    if (!r.ok) throw new Error(`${e.eventId}: ${r.error.map((x) => x.code).join(",")}`);
    events.set(e.eventId, r.value.event);
    const jira = e.monday ? sw.ctx(ENGINEER).ports.jira.asUser() : app;
    const ref = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: e.summary, labels: ["tt-synthetic", "tt-takeover"], description: `Synthetic demo data. Driver note: ${e.note}` }));
    keyOf.set(e.eventId, ref.key);
    ids.set(e.eventId, ref.id);
    specOfKey.set(ref.key, e);
  }
  const config = defaultProjectConfig("TTDEMO");
  for (const e of plan.events.filter((x) => !x.monday)) {
    const prepared = prepareEventForWrite(events.get(e.eventId), config);
    if (!prepared.ok) throw new Error(prepared.message);
    const id = ids.get(e.eventId) ?? "";
    must(await writeEventProperties(app, id, prepared.verified.event, undefined));
    must(await indexEvent(storage, clock, { id, key: keyOf.get(e.eventId) ?? "", projectKey: "TTDEMO" }, prepared.verified));
  }

  // S6: the engine's HAC proposal over history becomes clusters (truth is not used).
  const rows = must(await loadProjectEvents(storage, "TTDEMO"));
  const proposal = proposeClusters(rows.map((r) => clusterInputOf(r.value, () => undefined)));
  const rowByKey = new Map(rows.map((r) => [r.value.issueKey, r]));
  for (const p of proposal.proposed) {
    const memberRows = p.members.map((k) => rowByKey.get(k));
    const chips = memberRows.map((r) => events.get(specOfKey.get(r?.value.issueKey ?? "")?.eventId ?? "")?.img?.chips ?? []);
    const created = must(await createClusterIssue(app, storage, clock, { projectKey: "TTDEMO", issueType: "Task", bucket: p.bucket, memberChips: chips, synthetic: true, createdBy: ADMIN, origin: "Created from the engine's proposal during demo seed." }));
    for (const k of p.members) {
      const spec = specOfKey.get(k);
      const r = rowByKey.get(k);
      if (spec === undefined || r === undefined) continue;
      must(await linkMember(app, storage, clock, { event: { id: r.key, key: k, projectKey: "TTDEMO" }, eventEvent: events.get(spec.eventId) as TtEvent, cluster: { id: created.ref.id, key: created.ref.key }, linkType: "Duplicate", prevTriage: null, by: ADMIN, action: "seed-accept" }));
    }
  }

  // S7: "Mark triaged" at the plan's Friday mark; the Monday batch goes through intake.
  must(await storage.set("triaged:TTDEMO", { at: plan.triagedMark, by: ADMIN }));
  for (const e of plan.events.filter((x) => x.monday)) {
    await tick();
    const r = await commitEvent(sw.ctx(ENGINEER), { issueKey: keyOf.get(e.eventId), event: events.get(e.eventId), attachments: { via: "none", status: "skipped" } });
    if (!r.ok) throw new Error(`commit ${e.eventId}: ${r.error.message}`);
  }
  // S8: recluster.
  await drainRecluster(sw);
  return { sw, plan, keyOf, specOfKey };
}

const keyForRole = (s: Seeded, role: string): string => {
  const e = s.plan.events.find((x) => x.roles.some((r) => r === role));
  return s.keyOf.get(e?.eventId ?? "") ?? "";
};

/** Latent cluster of a board row by majority of its members' generator archetype (scoring only). */
const latentOf = (s: Seeded, members: readonly string[]): string => {
  const counts = new Map<string, number>();
  for (const k of members) {
    const a = s.specOfKey.get(k)?.archetype ?? "?";
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "?";
};

describe(`seeded history (seed ${DEFAULT_SEED}, SYNTHETIC) through the services`, () => {
  let s: Seeded;
  let board: BoardView;
  const byLatent = new Map<string, BoardView["clusters"][number]>();

  beforeAll(async () => {
    s = await seed();
    board = value(await getBoard(s.sw.ctx(ENGINEER), "TTDEMO"));
    const memberKeys = async (clusterId: string) => must(await loadProjectEvents(s.sw.world.storage, "TTDEMO")).filter((e) => e.value.clusterId === clusterId).map((e) => e.value.issueKey);
    for (const row of board.clusters) byLatent.set(latentOf(s, await memberKeys(row.cluster.id)), row);
  }, 240_000);

  it("board shows the planted clusters with deterministic names", () => {
    expect(board.empty).toBe(false);
    expect(board.synthetic).toBe(true);
    expect(board.clusters.map((c) => c.cluster.name).sort()).toEqual(["Lane-loss · low sun · cam-B", "Late-brake · night · cam-A", "Lateral-drift · cam-B", "Phantom-brake · cam-A"]);
    expect([...byLatent.keys()].sort()).toEqual(["LC-A", "LC-B", "LC-C", "LC-D"]);
    expect(board.sinceLastTriage.source).toBe("mark-triaged");
    expect(board.sinceLastTriage.newEvents).toBe(s.plan.events.filter((e) => e.monday).length);
    expect(jsonSafe(board)).toBe(true);
  });

  it("LC-A is regression-likely at 4.12.0, from drive-session km, with Holm across the board", () => {
    const la = byLatent.get("LC-A");
    expect(la?.onset.verdict).toBe("regression-likely");
    expect(la?.onset.onsetBuild).toBe("4.12.0");
    expect(la?.onset.k1).toBe(0);
    expect(la?.onset.pHolm).toBeLessThan(0.01);
    expect(la?.onset.pHolm).toBeGreaterThanOrEqual(la?.onset.pScan ?? 1);
    expect(la?.onset.holmFamilySize).toBe(board.holmFamilySize);
    const camBKm = s.plan.driveSessions.filter((d) => d.variant === "cam-B").reduce((a, d) => a + d.km, 0);
    expect((la?.onset.e1Km ?? 0) + (la?.onset.e2Km ?? 0)).toBeCloseTo(camBKm, 0);
    for (const l of ["LC-B", "LC-C", "LC-D"]) expect(byLatent.get(l)?.onset.verdict).not.toBe("regression-likely");
  });

  it("coverage: LC-A has the planted gap text, the others are covered, the grid has the red cell", async () => {
    const la = byLatent.get("LC-A");
    expect(la?.coverage.verdict).toBe("uncovered");
    expect(la?.coverage.text).toBe("0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway");
    for (const l of ["LC-B", "LC-C", "LC-D"]) expect(byLatent.get(l)?.coverage.verdict).toBe("covered");
    const gaps = value(await listCoverageGapsFor(s.sw.ctx(ENGINEER), "TTDEMO", { minEvents: 2, includePartial: true, limit: 25 }));
    expect(gaps.gaps.map((g) => g.text)).toEqual(["0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway"]);
    expect(gaps.scenarioCount).toBe(10);
    const cell = board.gapGrid.rows.find((r) => r.value === "low-sun-glare")?.cells.find((c) => c.type === "lane-loss");
    expect(cell?.gap).toBe(true);
    expect(cell?.tests).toBe(0);
    expect(cell?.events).toBe(la?.acceptedCount);
  });

  it("NOVEL-1 is in the novel queue (and in list-novel-since)", async () => {
    const n1 = keyForRole(s, "N1");
    expect(board.novel.map((n) => n.event.key)).toContain(n1);
    expect(board.novel.find((n) => n.event.key === n1)?.reason).toBe("exceeds-tau");
    const since = value(await listNovelSince(s.sw.ctx(ENGINEER), "TTDEMO", { limit: 25 }));
    expect(since.sinceSource).toBe("mark-triaged");
    expect(since.events.map((e) => e.event.key)).toContain(n1);
  });

  it("two same-text tickets land in different clusters, and the why rows say why", async () => {
    const p1a = keyForRole(s, "P1a");
    const p1b = keyForRole(s, "P1b");
    expect(s.specOfKey.get(p1a)?.note).toBe(NOTE_DRIFTED_LEFT);
    expect(s.specOfKey.get(p1b)?.note).toBe(NOTE_DRIFTED_LEFT);
    const a = value(await triageNow(s.sw.ctx(ENGINEER), p1a));
    const b = value(await triageNow(s.sw.ctx(ENGINEER), p1b));
    expect(a.cluster?.key).toBe(byLatent.get("LC-A")?.cluster.key);
    expect(b.cluster?.key).toBe(byLatent.get("LC-C")?.cluster.key);
    expect(a.headlines[0]).toBe("Bucket: lane-loss x cam-B");
    expect(b.headlines[0]).toBe("Bucket: lateral-drift x cam-B");
    const x = value(await explainMatch(s.sw.ctx(ENGINEER), p1b, byLatent.get("LC-A")?.cluster.key));
    expect(x.sameBucket).toBe(false);
    expect(x.decision).toBe("exceeds-tau");
    expect(x.topContributors.slice(0, 2)).toContain("F6");
    expect(x.why.find((r) => r.feature === "F6")?.contribution ?? 0).toBeGreaterThan(0.2);

    const p3a = keyForRole(s, "P3a");
    const p3b = keyForRole(s, "P3b");
    expect(s.specOfKey.get(p3a)?.note).toBe(NOTE_BRAKED_HARD);
    expect(s.specOfKey.get(p3b)?.note).toBe(NOTE_BRAKED_HARD);
    const c = value(await triageNow(s.sw.ctx(ENGINEER), p3a));
    const d = value(await triageNow(s.sw.ctx(ENGINEER), p3b));
    expect(c.cluster?.key).toBe(byLatent.get("LC-B")?.cluster.key);
    expect(d.cluster?.key).toBe(byLatent.get("LC-D")?.cluster.key);
    const y = value(await explainMatch(s.sw.ctx(ENGINEER), p3a, byLatent.get("LC-D")?.cluster.key));
    expect(y.topContributors.slice(0, 2).some((f) => f === "F3" || f === "F4")).toBe(true);
  });

  it("history members show 'accepted during demo seed'; routing names the rule and source", async () => {
    const la = byLatent.get("LC-A");
    const anyMember = must(await loadProjectEvents(s.sw.world.storage, "TTDEMO")).find((e) => e.value.clusterId === la?.cluster.id);
    const p = value(await getPanel(s.sw.ctx(ENGINEER), anyMember?.value.issueKey ?? "")) as PanelEventView;
    expect(p.kind).toBe("event");
    expect(p.match.result).toBe("accepted");
    expect(p.triage.viaDemoSeed).toBe(true);
    const r = value(await suggestOwner(s.sw.ctx(ENGINEER), la?.cluster.key ?? ""));
    expect(r.rule.index).toBe(0);
    expect(r.team?.name).toBe("Perception");
    expect(r.source).toBe("component");
    expect(r.contact?.accountId).toBe(ADMIN);
    for (const [latent, comp] of [["LC-B", "Planning"], ["LC-C", "Controls"], ["LC-D", "Perception"]] as const) {
      expect(value(await suggestOwner(s.sw.ctx(ENGINEER), byLatent.get(latent)?.cluster.key ?? "")).team?.name).toBe(comp);
    }
  });

  it("accept → undo and split → undo round-trip back to the same board", async () => {
    const ctx = s.sw.ctx(ENGINEER);
    const before = value(await getBoard(ctx, "TTDEMO"));
    const p1a = keyForRole(s, "P1a");
    const la = byLatent.get("LC-A");
    const acc = value(await acceptMatch(ctx, p1a, la?.cluster.key ?? ""));
    expect(acc.created).toBe(true);
    await drainRecluster(s.sw);
    const mid = value(await getBoard(ctx, "TTDEMO"));
    expect(mid.clusters.find((c) => c.cluster.key === la?.cluster.key)?.acceptedCount).toBe((la?.acceptedCount ?? 0) + 1);
    value(await undoLast(ctx, p1a));
    const n1 = keyForRole(s, "N1");
    const split = value(await splitEvent(ctx, n1));
    expect(split.cluster?.name).toMatch(/^Lane-loss · .*cam-B$/);
    value(await undoLast(ctx, n1));
    await drainRecluster(s.sw);
    const after = value(await getBoard(ctx, "TTDEMO"));
    const strip = (b: BoardView) => ({ clusters: b.clusters.map((c) => ({ key: c.cluster.key, n: c.acceptedCount, onset: c.onset.pHolm, cov: c.coverage.text, pending: c.pendingSuggestions })), novel: b.novel.map((n) => n.event.key), groups: b.proposedGroups.map((g) => g.members), totals: b.totals });
    expect(strip(after)).toEqual(strip(before));
  });

  it("Re-sync rebuild from Jira equals the incremental index", async () => {
    const snap = async () => {
      const ev = must(await loadProjectEvents(s.sw.world.storage, "TTDEMO")).map((e) => ({ k: e.key, ...e.value, indexedAt: 0 }));
      const cl = must(await loadProjectClusters(s.sw.world.storage, "TTDEMO")).map((c) => ({ k: c.key, ...c.value, updatedAt: 0 }));
      return { ev: ev.sort((a, b) => a.k.localeCompare(b.k)), cl: cl.sort((a, b) => a.k.localeCompare(b.k)) };
    };
    s.sw.world.queue.take();
    const incremental = await snap();
    for (const e of incremental.ev) must(await s.sw.world.storage.deleteEntity("event", e.k));
    for (const c of incremental.cl) must(await s.sw.world.storage.deleteEntity("cluster", c.k));
    value(await requestResync(s.sw.ctx(ENGINEER), "TTDEMO"));
    for (let i = 0; i < 50; i++) {
      const jobs = s.sw.world.queue.take("tt-recluster");
      if (jobs.length === 0) break;
      for (const j of jobs) await runReclusterJob(s.sw.world.ports({}), j.body, { maxPages: 1 });
    }
    expect(await snap()).toEqual(incremental);
  });
});
