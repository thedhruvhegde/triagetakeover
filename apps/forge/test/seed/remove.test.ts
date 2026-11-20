/**
 * "Remove demo data" (ARCHITECTURE §9 step 5, PRD US-01 AC6) and existing-demo detection
 * (US-01 AC3, §15 #24). Removal deletes only what the seed created; everything else stays.
 */
import { describe, expect, it } from "vitest";
import { LABELS } from "../../src/ports/properties.js";
import { loadProjectClusters, loadProjectEvents } from "../../src/services/index-store.js";
import { removeDemoData, startSeed } from "../../src/services/seed/service.js";
import { fileEvent, laneLoss, value } from "../services/helpers.js";
import { createServiceContext } from "../../src/context.js";
import { ADMIN, DEFAULT_SEED, ENGINEER, driveSeed, loadDemo, must, seedWorld, snapshotState, type SeedWorld } from "./harness.js";

async function syntheticIssues(sw: SeedWorld): Promise<string[]> {
  const r = must(await sw.world.site.gateway({}).asApp().searchJql({ jql: `project = TTDEMO AND labels = ${LABELS.synthetic}`, maxResults: 100 }));
  return r.issues.map((i) => i.key);
}

describe("Remove demo data", () => {
  it("removes every seed artefact and nothing else", async () => {
    const sw = seedWorld();
    // Something the admin had before the seed: a non-demo project with its own config.
    sw.world.site.addProject({ key: "OPS", name: "Operations", leadAccountId: ADMIN });
    must(await sw.world.storage.set("config:OPS", { enabled: true }));
    await loadDemo(sw);
    // A real (non-seed) takeover filed by an engineer into the demo project after seeding,
    // even labelled tt-synthetic by hand: not created by the seed, so it must survive.
    const sw2 = { world: sw.world, factory: (inv: { accountId?: string }) => createServiceContext(sw.world.ports(inv.accountId !== undefined ? { accountId: inv.accountId } : {}), inv), ctx: (a = ENGINEER) => createServiceContext(sw.world.ports({ accountId: a }), { accountId: a }), consumer: () => createServiceContext(sw.world.ports({}), {}) };
    const mine = await fileEvent(sw2, laneLoss(0, { synthetic: false }), ENGINEER, "Takeover on test track");
    const issuesBefore = sw.world.site.issueCount();

    const r = await removeDemoData(sw.ctx(ADMIN), { projectKey: "TTDEMO" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.value.removedIssues).toBe(issuesBefore - 1);
    expect(r.value.value.removedRows).toBeGreaterThan(40 + 3);
    expect(r.value.warnings.join(" ")).toMatch(/1 tt-synthetic issue\(s\) in TTDEMO were not created by the demo seed and were kept/);
    expect(r.value.warnings.join(" ")).toMatch(/Project TTDEMO was kept/);

    expect(await syntheticIssues(sw)).toEqual([mine.key]);
    expect(sw.world.site.issueCount()).toBe(1);
    const events = must(await loadProjectEvents(sw.world.storage, "TTDEMO"));
    expect(events.map((e) => e.value.issueKey)).toEqual([mine.key]);
    expect(must(await loadProjectClusters(sw.world.storage, "TTDEMO"))).toEqual([]);
    for (const v of ["cam-A", "cam-B"]) {
      expect(must(await sw.world.storage.queryEntities("vehicle", { index: "by-variant", partition: [v] })).items).toEqual([]);
      expect(must(await sw.world.storage.queryEntities("drive-session", { index: "by-variant", partition: [v] })).items).toEqual([]);
    }
    const keys = sw.world.storage.keys();
    expect(keys.filter((k) => k.startsWith("seed:") || k.startsWith("job:seed:") || k === "triaged:TTDEMO" || k === "config:TTDEMO" || k === "board:TTDEMO")).toEqual([]);
    expect(must(await sw.world.storage.get("config:OPS"))).toEqual({ enabled: true });
    expect(must(await sw.world.storage.get("config:global"))).not.toHaveProperty("demoProjectKey");
    // Removing again is a no-op.
    const again = await removeDemoData(sw.ctx(ADMIN), { projectKey: "TTDEMO" });
    expect(again.ok && again.value.value).toEqual({ removedIssues: 0, removedRows: 0 });
  }, 120_000);

  it("keeps settings an admin changed after seeding, and is admin-only", async () => {
    const sw = seedWorld();
    await loadDemo(sw);
    const cfg = must(await sw.world.storage.get("config:TTDEMO")) as Record<string, unknown>;
    must(await sw.world.storage.set("config:TTDEMO", { ...cfg, tau: 1.2 }));
    expect((await removeDemoData(sw.ctx(ENGINEER), { projectKey: "TTDEMO" })).ok).toBe(false);
    const r = await removeDemoData(sw.ctx(ADMIN), { projectKey: "TTDEMO" });
    expect(r.ok && r.value.warnings.join(" ")).toMatch(/settings were changed after seeding and were kept/);
    expect(must(await sw.world.storage.get("config:TTDEMO"))).toMatchObject({ tau: 1.2 });
  }, 120_000);

  it("stops at the resolver time budget and finishes on the next click", async () => {
    const sw = seedWorld();
    await loadDemo(sw);
    let t = 0;
    const first = await removeDemoData(sw.ctx(ADMIN), { projectKey: "TTDEMO" }, { nowMs: () => (t += 1000), budgetMs: 10_000 });
    expect(first.ok && first.value.warnings.join(" ")).toMatch(/click Remove demo data again/);
    expect(must(await sw.world.storage.get("seed:state"))).toBeDefined();
    const second = await removeDemoData(sw.ctx(ADMIN), { projectKey: "TTDEMO" });
    expect(second.ok).toBe(true);
    expect(await syntheticIssues(sw)).toEqual([]);
    expect(sw.world.storage.keys().filter((k) => k.startsWith("seed:"))).toEqual([]);
  }, 120_000);

  it("refuses while the seed is still loading", async () => {
    const sw = seedWorld();
    value(await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" }));
    const r = await removeDemoData(sw.ctx(ADMIN), { projectKey: "TTDEMO" });
    expect(!r.ok && r.error.code).toBe("conflict");
  });
});

describe("existing demo detection (Keep / Reset)", () => {
  it("a second Load reports the existing demo; Keep returns it; Reset reloads to the same state", async () => {
    const sw = seedWorld();
    await loadDemo(sw);
    const before = await snapshotState(sw);
    const again = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" });
    expect(!again.ok && again.error.code).toBe("conflict");
    expect(!again.ok && again.error.message).toMatch(/Choose Keep to use it, or Reset/);
    const keep = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, mode: "keep" });
    expect(keep.ok && keep.value.value.state).toBe("done");
    expect(sw.world.queue.peek("tt-seed")).toHaveLength(0);
    const reset = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, mode: "reset", frames: "fast" });
    expect(reset.ok).toBe(true);
    await driveSeed(sw);
    expect(await syntheticIssues(sw)).toHaveLength((before as { jira: unknown[] }).jira.length);
    expect(sw.world.site.issueCount()).toBe((before as { jira: unknown[] }).jira.length);
  }, 120_000);

  it("leftover synthetic issues without the app's seed state (storage reset) are detected", async () => {
    const sw = seedWorld();
    await loadDemo(sw);
    for (const k of sw.world.storage.keys()) if (k.startsWith("seed:") || k.startsWith("job:")) must(await sw.world.storage.delete(k));
    const r = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" });
    expect(!r.ok && r.error.message).toMatch(/earlier load were found in TTDEMO/);
    const reset = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, mode: "reset", frames: "fast" });
    expect(reset.ok).toBe(true);
    await driveSeed(sw);
    const count = sw.world.site.issueCount();
    expect(await syntheticIssues(sw)).toHaveLength(count);
  }, 120_000);

  it("a click while loading shows the running job instead of starting another", async () => {
    const sw = seedWorld();
    const a = value(await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" }));
    const b = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" });
    expect(b.ok && b.value.value.jobId).toBe(a.jobId);
    expect(sw.world.queue.peek("tt-seed")).toHaveLength(1);
  });

  it("demo data in another project must be removed there first", async () => {
    const sw = seedWorld();
    sw.world.site.addProject({ key: "OPS", name: "Operations", leadAccountId: ADMIN });
    value(await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" }));
    const r = await startSeed(sw.ctx(ADMIN), { projectKey: "OPS", seed: DEFAULT_SEED });
    expect(!r.ok && r.error.message).toMatch(/already loaded in project TTDEMO/);
  });
});
