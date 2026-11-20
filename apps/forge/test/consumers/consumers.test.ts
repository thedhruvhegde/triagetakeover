/**
 * Consumer logic without Forge wiring: tt-seed message validation and the tt-recluster onset
 * cache (bucket re-proposal and resync are covered by test/services/*). SYNTHETIC inputs only.
 */
import { describe, expect, it } from "vitest";
import { runSeedStep } from "../../src/consumers/seed-job.js";
import { refreshOnsetCaches } from "../../src/consumers/onset-cache.js";
import { runReclusterJob } from "../../src/consumers/recluster-job.js";
import { loadProjectClusters } from "../../src/services/index-store.js";
import { splitEvent, acceptMatch } from "../../src/services/triage.js";
import { startSeed } from "../../src/services/seed/service.js";
import { ADMIN, DEFAULT_SEED, FAST, seedWorld } from "../seed/harness.js";
import { drainRecluster, fileEvent, laneLoss, must, serviceWorld, value } from "../services/helpers.js";

describe("tt-seed consumer: message validation", () => {
  it("drops malformed, unknown, stale and mismatched messages without writing", async () => {
    const sw = seedWorld();
    const ports = sw.world.ports({});
    expect((await runSeedStep(ports, "nope", FAST)).kind).toBe("dropped");
    expect((await runSeedStep(ports, { jobId: "x", step: "bogus", cursor: 0, seed: 1 }, FAST))).toEqual({ kind: "dropped", reason: "unknown step bogus" });
    expect((await runSeedStep(ports, { jobId: "x", step: "registry", cursor: 0, seed: 1 }, FAST))).toEqual({ kind: "dropped", reason: "unknown job" });
    const s = value(await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" }));
    const writesBefore = sw.world.storage.calls.filter((c) => c.op === "set" || c.op === "putEntity").length;
    expect((await runSeedStep(ports, { jobId: s.jobId, step: "registry", cursor: 0, seed: 99 }, FAST)).kind).toBe("dropped");
    expect(sw.world.storage.calls.filter((c) => c.op === "set" || c.op === "putEntity").length).toBe(writesBefore);
    const first = await runSeedStep(ports, { jobId: s.jobId, step: "registry", cursor: 0, seed: DEFAULT_SEED }, FAST);
    expect(first).toEqual({ kind: "advanced", step: "registry", next: { step: "scenarios", cursor: 0 } });
    expect(await runSeedStep(ports, { jobId: s.jobId, step: "registry", cursor: 0, seed: DEFAULT_SEED }, FAST)).toEqual({ kind: "dropped", reason: "duplicate delivery" });
  });

  it("a job whose seed state was removed is marked failed", async () => {
    const sw = seedWorld();
    const s = value(await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" }));
    must(await sw.world.storage.delete("seed:state"));
    expect((await runSeedStep(sw.world.ports({}), { jobId: s.jobId, step: "registry", cursor: 0, seed: DEFAULT_SEED }, FAST)).kind).toBe("dropped");
    expect(must(await sw.world.storage.get(`job:seed:${s.jobId}`))).toMatchObject({ state: "failed" });
  });

  it("a storage outage on the job record asks the platform to redeliver", async () => {
    const sw = seedWorld();
    sw.world.storage.failNext("get", "unavailable");
    expect((await runSeedStep(sw.world.ports({}), { jobId: "seed-1", step: "registry", cursor: 0, seed: 1 }, FAST)).kind).toBe("retry");
  });
});

describe("tt-recluster consumer: onset cache", () => {
  it("stores a compact onset summary per cluster, idempotently", async () => {
    const sw = serviceWorld();
    const a = await fileEvent(sw, laneLoss(0));
    const split = value(await splitEvent(sw.ctx(), a.key));
    for (const j of [1, -1]) {
      const e = await fileEvent(sw, laneLoss(j));
      value(await acceptMatch(sw.ctx(), e.key, split.cluster?.key ?? ""));
    }
    await drainRecluster(sw);
    const rows = must(await loadProjectClusters(sw.world.storage, "TTDEMO"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.value.onset).toMatchObject({ v: 1, verdict: "not-enough-data", members: 3 });
    expect(JSON.stringify(rows[0]?.value.onset)).not.toMatch(/url|evidence/);
    expect(must(await refreshOnsetCaches(sw.world.ports({}), "TTDEMO"))).toBe(0);
  });

  it("a bucket-scoped recluster still refreshes the onset of every cluster", async () => {
    const sw = serviceWorld();
    const a = await fileEvent(sw, laneLoss(0));
    value(await splitEvent(sw.ctx(), a.key));
    sw.world.queue.take();
    const [c] = must(await loadProjectClusters(sw.world.storage, "TTDEMO"));
    if (c === undefined) throw new Error("no cluster");
    must(await sw.world.storage.putEntity("cluster", c.key, { ...c.value, onset: null }));
    const o = await runReclusterJob(sw.world.ports({}), { projectKey: "TTDEMO", bucket: "late-brake|cam-A", reason: "intake", requestedAt: "2026-11-16T09:00:00Z" });
    expect(o.kind).toBe("recluster");
    expect(must(await loadProjectClusters(sw.world.storage, "TTDEMO"))[0]?.value.onset).toMatchObject({ v: 1, members: 1 });
  });
});
