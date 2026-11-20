/**
 * The in-app demo seed end to end on the in-memory fakes: startSeed (creates TTDEMO and the
 * components) → the tt-seed consumer chain → the board the services compute. Seed
 * DEFAULT_SEED, fast frames, SYNTHETIC data only. Ground truth (seedgen) is used ONLY to score
 * the outcome in assertions and in the seed report.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SEED, NOTE_DRIFTED_LEFT, PROFILE_ID, planFleet, type FleetPlanOutput } from "@tt/seedgen";
import type { BoardView, PanelEventView } from "../../src/contract/ui-api.js";
import { getBoard, listCoverageGapsFor } from "../../src/services/board.js";
import { loadProjectClusters, loadProjectEvents } from "../../src/services/index-store.js";
import { triageNow } from "../../src/services/match.js";
import { getPanel } from "../../src/services/panel.js";
import { suggestOwner } from "../../src/services/route.js";
import { getSeedJob, getSeedReport, type SeedJobDetail } from "../../src/services/seed/service.js";
import { parseManifest, mondayOnOrBefore, type SeedManifest } from "../../src/services/seed/state.js";
import type { SeedReport } from "../../src/services/seed/report.js";
import { ADMIN, ENGINEER, OUTSIDER, loadDemo, must, seedWorld, type SeedWorld } from "./harness.js";
import { value } from "../services/helpers.js";

interface Loaded {
  readonly sw: SeedWorld;
  readonly plan: FleetPlanOutput;
  readonly manifest: SeedManifest;
  readonly job: SeedJobDetail;
  readonly board: BoardView;
  readonly stepsSeen: readonly string[];
  readonly midStates: readonly string[];
}

let L: Loaded;

const keyOf = (eventId: string): string => L.manifest.items[eventId]?.key ?? "";
const roleKey = (role: string): string => keyOf(L.plan.events.find((e) => e.roles.some((r) => r === role))?.eventId ?? "");

beforeAll(async () => {
  const sw = seedWorld();
  const midStates: string[] = [];
  const { jobId, chain } = await loadDemo(sw, {}, {
    nowMs: () => performance.now(),
    before: async () => {
      const rec = sw.world.storage.keys().find((k) => k.startsWith("job:seed:"));
      if (rec !== undefined) midStates.push(String((must(await sw.world.storage.get(rec)) as Record<string, unknown>)["state"]));
    },
  });
  const manifest = parseManifest(must(await sw.world.storage.get("seed:state")));
  if (manifest === null) throw new Error("no manifest");
  const job = value(await getSeedJob(sw.ctx(ADMIN), { jobId })) as SeedJobDetail;
  const board = value(await getBoard(sw.ctx(ENGINEER), "TTDEMO"));
  const plan = planFleet({ seed: DEFAULT_SEED, anchorDate: manifest.anchorDate, profile: PROFILE_ID, frames: "fast" });
  L = { sw, plan, manifest, job, board, stepsSeen: chain.stepsSeen, midStates };
}, 300_000);

describe(`in-app demo seed (seed ${DEFAULT_SEED}, SYNTHETIC)`, () => {
  it("creates the demo project, components and every planned item exactly once", async () => {
    const app = L.sw.world.site.gateway({}).asApp();
    const project = must(await app.getProject("TTDEMO"));
    expect(project.name).toBe("Takeover Triage Demo [SYNTHETIC]");
    expect(must(await app.getProjectComponents("TTDEMO")).map((c) => [c.name, c.leadAccountId])).toEqual([["Perception", ADMIN], ["Planning", ADMIN], ["Controls", ADMIN]]);
    const clusters = L.manifest.clusterPlan ?? [];
    const expected = L.plan.scenarios.length + L.plan.events.length + clusters.length;
    expect(Object.keys(L.manifest.items)).toHaveLength(expected);
    expect(L.sw.world.site.issueCount()).toBe(expected);
    expect(L.job.state).toBe("done");
    expect(L.job.errors).toEqual([]);
    expect(L.job.counts).toMatchObject({ vehicles: 3, driveSessions: 40, scenarios: 10, historyEvents: L.plan.events.filter((e) => !e.monday).length, mondayEvents: L.plan.events.filter((e) => e.monday).length });
    expect(L.manifest.anchorDate).toBe(mondayOnOrBefore(L.sw.world.clock.nowIso()));
  });

  it("runs the chain in order and shows the board before the raw files finish", () => {
    const order = [...new Set(L.stepsSeen)];
    expect(order).toEqual(["registry", "scenarios", "history", "clusters", "monday", "board", "attachments", "report"]);
    expect(L.midStates).toContain("uploading-raw-files");
    expect(L.job.boardReady).toBe(true);
    expect(L.job.attachments).toBe("done");
  });

  it("labels every seeded issue SYNTHETIC in summary, description and label, with tt.seed", async () => {
    const app = L.sw.world.site.gateway({}).asApp();
    for (const [itemId, ref] of Object.entries(L.manifest.items)) {
      const i = must(await app.getIssue(ref.id, { properties: ["tt.seed", "tt.event"] }));
      expect(i.summary.startsWith("[SYNTHETIC]")).toBe(true);
      expect(i.labels).toContain("tt-synthetic");
      expect(i.description ?? "").toContain("Synthetic demo data.");
      expect(i.description ?? "").toContain(`(seed ${DEFAULT_SEED}, ${itemId})`);
      expect(i.properties["tt.seed"]).toMatchObject({ v: 1, seed: DEFAULT_SEED, itemId });
      expect(JSON.stringify(i)).not.toMatch(/LC-[ABCD]|NOVEL|archetype|ground truth/);
      if (itemId.startsWith("E-")) expect((i.properties["tt.event"] as { synthetic: boolean }).synthetic).toBe(true);
    }
    for (const v of ["cam-A", "cam-B"]) {
      const rows = must(await L.sw.world.storage.queryEntities("vehicle", { index: "by-variant", partition: [v] })).items;
      for (const r of rows) {
        expect(r.value.synthetic).toBe(true);
        expect(r.value.label).toMatch(/^SYN test vehicle/);
      }
    }
  });

  it("attaches the generated CSV and frames to every event (SYNTHETIC_ file names)", async () => {
    const app = L.sw.world.site.gateway({}).asApp();
    for (const e of L.plan.events) {
      const att = must(await app.getAttachments(L.manifest.items[e.eventId]?.id ?? ""));
      expect(att.length).toBeGreaterThanOrEqual(2);
      expect(att.filter((a) => a.mimeType === "text/csv")).toHaveLength(1);
      for (const a of att) expect(a.filename.startsWith("SYNTHETIC_")).toBe(true);
      expect(att.every((a) => a.authorAccountId === "app:takeover-triage")).toBe(true);
    }
  });

  it("the board matches the services' expectations for the default seed", () => {
    const b = L.board;
    expect(b.empty).toBe(false);
    expect(b.synthetic).toBe(true);
    expect(b.clusters.map((c) => c.cluster.name).sort()).toEqual(["Lane-loss · low sun · cam-B", "Late-brake · night · cam-A", "Lateral-drift · cam-B", "Phantom-brake · cam-A"]);
    const la = b.clusters.find((c) => c.cluster.name === "Lane-loss · low sun · cam-B");
    expect(la?.onset.verdict).toBe("regression-likely");
    expect(la?.onset.onsetBuild).toBe("4.12.0");
    expect(la?.coverage.text).toBe("0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway");
    for (const c of b.clusters.filter((x) => x !== la)) {
      expect(c.onset.verdict).not.toBe("regression-likely");
      expect(c.coverage.verdict).toBe("covered");
    }
    expect(b.sinceLastTriage.source).toBe("mark-triaged");
    expect(b.sinceLastTriage.newEvents).toBe(L.plan.events.filter((e) => e.monday).length);
    expect(b.novel.map((n) => n.event.key)).toContain(roleKey("N1"));
  });

  it("the Monday batch is unassigned in Jira: no links, no tt.triage", async () => {
    const app = L.sw.world.site.gateway({}).asApp();
    for (const e of L.plan.events.filter((x) => x.monday)) {
      const i = must(await app.getIssue(L.manifest.items[e.eventId]?.id ?? "", { properties: ["tt.triage"] }));
      expect(i.links).toEqual([]);
      expect(i.properties["tt.triage"]).toBeUndefined();
    }
    const rows = must(await loadProjectEvents(L.sw.world.storage, "TTDEMO"));
    const monday = new Set(L.plan.events.filter((x) => x.monday).map((e) => L.manifest.items[e.eventId]?.id));
    expect(rows.filter((r) => monday.has(r.key)).every((r) => r.value.status !== "accepted")).toBe(true);
  });

  it("same text, different clusters (P1a/P1b) and accepted-during-demo-seed provenance", async () => {
    const a = value(await triageNow(L.sw.ctx(ENGINEER), roleKey("P1a")));
    const b = value(await triageNow(L.sw.ctx(ENGINEER), roleKey("P1b")));
    expect(L.plan.events.find((e) => e.roles.includes("P1a"))?.note).toBe(NOTE_DRIFTED_LEFT);
    expect(a.cluster?.name).toBe("Lane-loss · low sun · cam-B");
    expect(b.cluster?.name).toBe("Lateral-drift · cam-B");
    const hist = must(await loadProjectEvents(L.sw.world.storage, "TTDEMO")).find((r) => r.value.status === "accepted");
    const p = value(await getPanel(L.sw.ctx(ENGINEER), hist?.value.issueKey ?? "")) as PanelEventView;
    expect(p.triage.viaDemoSeed).toBe(true);
    expect(p.triage.by).toBe(ADMIN);
  });

  it("routing uses the seeded rules and components (lead = the admin, no fake users)", async () => {
    for (const c of L.board.clusters) {
      const r = value(await suggestOwner(L.sw.ctx(ENGINEER), c.cluster.key));
      expect(r.source).toBe("component");
      expect(r.contact?.accountId).toBe(ADMIN);
    }
    const gaps = value(await listCoverageGapsFor(L.sw.ctx(ENGINEER), "TTDEMO", { minEvents: 2, includePartial: true, limit: 25 }));
    expect(gaps.scenarioCount).toBe(10);
  });

  it("the recluster consumer cached onset on the cluster rows", async () => {
    const rows = must(await loadProjectClusters(L.sw.world.storage, "TTDEMO"));
    const la = rows.find((r) => r.value.nameDet === "Lane-loss · low sun · cam-B");
    expect(la?.value.onset).toMatchObject({ v: 1, verdict: "regression-likely", onsetBuild: "4.12.0" });
  });

  it("the admin-only seed report scores the engine against regenerated truth", async () => {
    const r = value(await getSeedReport(L.sw.ctx(ADMIN), { projectKey: "TTDEMO" })) as SeedReport;
    expect(r.seed).toBe(DEFAULT_SEED);
    expect(r.isDefaultSeed).toBe(true);
    expect(r.accuracy.events).toBe(L.plan.events.length);
    expect(r.accuracy.ariAll).not.toBeNull();
    expect(r.accuracy.ariAll ?? 0).toBeGreaterThan(0.5);
    expect(r.accuracy.ariAll ?? 2).toBeLessThanOrEqual(1);
    expect(r.accuracy.ariHistoryProposal ?? 0).toBeGreaterThan(0.5);
    expect(r.planted.map((p) => p.role)).toEqual(expect.arrayContaining(["AMB1", "AMB2", "N1", "P1a", "P1b", "P3a", "P3b"]));
    expect(r.planted.every((p) => p.issueKey !== null)).toBe(true);
    expect(r.honesty.join(" ")).toMatch(/not against real fleets/);
    expect(r.defaultSeedRule).not.toMatch(/\d+ ?%/);
    expect(Object.keys(r.calls)).toEqual(expect.arrayContaining(["registry", "history", "attachments"]));
    // Only admins see it; the engineer is not a project admin.
    expect((await getSeedReport(L.sw.ctx(ENGINEER), { projectKey: "TTDEMO" })).ok).toBe(false);
    expect((await getSeedReport(L.sw.ctx(OUTSIDER), { projectKey: "TTDEMO" })).ok).toBe(false);
  });

  it("measures per-step time and port calls (SPIKE-S2 evidence; printed with TT_SEED_METRICS=1)", () => {
    const steps = Object.keys(L.job.stats);
    expect(steps).toEqual(["registry", "scenarios", "history", "clusters", "monday", "board", "attachments", "report"]);
    const jiraCalls = (name: string) => Object.entries(L.job.stats[name]?.calls ?? {}).filter(([k]) => k.startsWith("jira.")).reduce((a, [, v]) => a + v, 0);
    expect(jiraCalls("registry")).toBe(0);
    expect(L.job.stats["attachments"]?.calls["jira.uploadAttachment"]).toBeGreaterThanOrEqual(L.plan.events.length * 2);
    if (process.env["TT_SEED_METRICS"] === "1") {
      const table = Object.fromEntries(steps.map((n) => [n, { runs: L.job.stats[n]?.runs, ms: Math.round(L.job.stats[n]?.ms ?? 0), calls: L.job.stats[n]?.calls }]));
      console.info(JSON.stringify({ events: L.plan.events.length, boardReadyAt: L.job.boardReadyAt, table }, null, 1));
    }
  });

  it("truth never reaches Jira or the index: no latent ids in properties, rows or descriptions", async () => {
    const rows = must(await loadProjectEvents(L.sw.world.storage, "TTDEMO"));
    expect(JSON.stringify(rows)).not.toMatch(/LC-[ABCD]|NOVEL|archetype/);
    const clusters = must(await loadProjectClusters(L.sw.world.storage, "TTDEMO"));
    expect(JSON.stringify(clusters)).not.toMatch(/LC-[ABCD]|NOVEL|archetype/);
  });
});
