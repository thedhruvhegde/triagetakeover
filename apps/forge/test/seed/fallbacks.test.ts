/**
 * SPIKE fallbacks of the demo seed on the fakes: project creation refused (SPIKE-S1, seed into
 * an admin-picked project with label typing), attachment upload refused for the app (SPIKE-I2,
 * thumbnails only), search without properties (SPIKE-E3), the app without access to the
 * project (SPIKE-S3) and non-admin callers.
 */
import { describe, expect, it } from "vitest";
import { getBoard } from "../../src/services/board.js";
import { getSeedJob, startSeed, type SeedJobDetail } from "../../src/services/seed/service.js";
import { SPIKE_I2_SKIPPED } from "../../src/services/seed/steps.js";
import { parseManifest } from "../../src/services/seed/state.js";
import { value } from "../services/helpers.js";
import { ADMIN, CrashPlan, DEFAULT_SEED, ENGINEER, driveSeed, loadDemo, must, seedWorld } from "./harness.js";

describe("seed fallbacks", () => {
  it("SPIKE-S1: project creation refused → honest message; the seed then runs in a picked project", async () => {
    const sw = seedWorld({ jira: { projectCreation: "nobody" } });
    const r = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("forbidden-or-not-found");
    expect(r.error.message).toMatch(/SPIKE-S1/);
    expect(r.error.details).toEqual([{ path: "projectKey", message: "project-creation-refused" }]);
    expect(sw.world.storage.keys()).toEqual([]);

    sw.world.site.addProject({ key: "OPS", name: "Vehicle operations", leadAccountId: ADMIN, issueTypes: ["Task", "Bug"] });
    const s = await startSeed(sw.ctx(ADMIN), { projectKey: "OPS", seed: DEFAULT_SEED, frames: "fast" });
    expect(s.ok).toBe(true);
    await driveSeed(sw);
    const board = value(await getBoard(sw.ctx(ENGINEER), "OPS"));
    expect(board.clusters).toHaveLength(4);
    const app = sw.world.site.gateway({}).asApp();
    const takeovers = must(await app.searchJql({ jql: "project = OPS AND labels = tt-takeover", maxResults: 100 }));
    const scenarios = must(await app.searchJql({ jql: "project = OPS AND labels = tt-scenario", maxResults: 100 }));
    const clusters = must(await app.searchJql({ jql: "project = OPS AND labels = tt-cluster", maxResults: 100 }));
    expect(scenarios.issues).toHaveLength(10);
    expect(clusters.issues).toHaveLength(4);
    expect(takeovers.issues.length).toBeGreaterThan(20);
    const m = parseManifest(must(await sw.world.storage.get("seed:state")));
    expect(m?.projectCreated).toBe(false);
  }, 120_000);

  it("SPIKE-I2: the app may not upload attachments → phase skipped, seed done, thumbnails stored", async () => {
    const sw = seedWorld({ jira: { attachmentUpload: "users-only" } });
    const { jobId } = await loadDemo(sw);
    const job = value(await getSeedJob(sw.ctx(ADMIN), { jobId })) as SeedJobDetail;
    expect(job.state).toBe("done");
    expect(job.attachments).toBe("skipped");
    expect(job.boardReady).toBe(true);
    const m = parseManifest(must(await sw.world.storage.get("seed:state")));
    const anyEvent = Object.entries(m?.items ?? {}).find(([k]) => k.startsWith("E-"));
    const app = sw.world.site.gateway({}).asApp();
    expect(must(await app.getAttachments(anyEvent?.[1].id ?? ""))).toEqual([]);
    expect(must(await app.getIssueProperty(anyEvent?.[1].id ?? "", "tt.thumbs"))).not.toBeNull();
    expect(SPIKE_I2_SKIPPED).toMatch(/SPIKE-I2/);
  }, 120_000);

  it("SPIKE-E3: search without properties still adopts after a crash (per-issue property reads), no duplicates", async () => {
    const sw = seedWorld({ jira: { searchReturnsProperties: false } });
    // Crash right after the first bulk create of history events (before their tt.seed writes).
    const probe = seedWorld();
    const plan = new CrashPlan(0);
    await loadDemo(probe, {}, { crash: plan });
    const at = plan.log.findIndex((e) => e === "history:jira.bulkCreateIssues") + 1;
    const { chain } = await loadDemo(sw, {}, { crash: new CrashPlan(at) });
    expect(chain.crashes).toBe(1);
    expect(sw.world.site.issueCount()).toBe(probe.world.site.issueCount());
    const m = parseManifest(must(await sw.world.storage.get("seed:state")));
    expect(Object.keys(m?.items ?? {})).toHaveLength(probe.world.site.issueCount());
  }, 120_000);

  it("SPIKE-S3: the app has no access to the project → the job fails with a message, nothing half-claimed", async () => {
    const sw = seedWorld();
    sw.world.site.addProject({ key: "OPS", name: "Vehicle operations", leadAccountId: ADMIN });
    sw.world.site.denyApp("OPS");
    const s = value(await startSeed(sw.ctx(ADMIN), { projectKey: "OPS", seed: DEFAULT_SEED, frames: "fast" }));
    const chain = await driveSeed(sw);
    expect(chain.outcomes.at(-1)?.kind).toBe("failed");
    const job = value(await getSeedJob(sw.ctx(ADMIN), { jobId: s.jobId })) as SeedJobDetail;
    expect(job.state).toBe("failed");
    expect(job.step).toBe("scenarios");
    expect(job.errors[0]).toMatch(/Scenario-test issues failed/);
    expect(sw.world.site.issueCount()).toBe(0);
  });

  it("only project or Jira admins can load demo data", async () => {
    const sw = seedWorld();
    sw.world.site.addProject({ key: "OPS", name: "Vehicle operations", leadAccountId: ADMIN });
    const r = await startSeed(sw.ctx(ENGINEER), { projectKey: "OPS", seed: DEFAULT_SEED });
    expect(!r.ok && r.error.code).toBe("forbidden-or-not-found");
    const t = await startSeed(sw.ctx(ENGINEER), { projectKey: "TTDEMO", seed: DEFAULT_SEED });
    expect(t.ok).toBe(false);
    const c = await startSeed(sw.ctx(ENGINEER), { projectKey: "NOPE", seed: DEFAULT_SEED });
    expect(!c.ok && c.error.code).toBe("forbidden-or-not-found");
    expect(sw.world.storage.keys()).toEqual([]);
    expect((await getSeedJob(sw.ctx(ENGINEER), { jobId: "seed-1" })).ok).toBe(false);
  });

  it("a different seed produces a different but complete SYNTHETIC fleet", async () => {
    const sw = seedWorld();
    const { jobId } = await loadDemo(sw, { seed: 7 });
    const job = value(await getSeedJob(sw.ctx(ADMIN), { jobId })) as SeedJobDetail;
    expect(job.state).toBe("done");
    expect(job.seed).toBe(7);
    expect(job.report?.isDefaultSeed).toBe(false);
    expect(job.report?.accuracy.ariAll).not.toBeNull();
  }, 180_000);
});
