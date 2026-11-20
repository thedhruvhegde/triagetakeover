import { describe, expect, it } from "vitest";
import { requestResync, getResyncStatus, runResync } from "../../src/services/resync.js";
import { loadProjectClusters, loadProjectEvents } from "../../src/services/index-store.js";
import { acceptMatch, splitEvent } from "../../src/services/triage.js";
import { runReclusterJob } from "../../src/consumers/recluster-job.js";
import { ADMIN, OUTSIDER, drainRecluster, farLaneLoss, fileEvent, laneLoss, lateralDrift, must, serviceWorld, value, type ServiceWorld } from "./helpers.js";

/** Index content without the timestamps that legitimately differ. */
async function snapshot(sw: ServiceWorld): Promise<unknown> {
  const ev = must(await loadProjectEvents(sw.world.storage, "TTDEMO"));
  const cl = must(await loadProjectClusters(sw.world.storage, "TTDEMO"));
  return {
    events: ev.map((e) => ({ key: e.key, ...e.value, indexedAt: 0 })).sort((a, b) => a.key.localeCompare(b.key)),
    clusters: cl.map((c) => ({ key: c.key, ...c.value, updatedAt: 0 })).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

async function wipeIndex(sw: ServiceWorld): Promise<void> {
  for (const e of must(await loadProjectEvents(sw.world.storage, "TTDEMO"))) must(await sw.world.storage.deleteEntity("event", e.key));
  for (const c of must(await loadProjectClusters(sw.world.storage, "TTDEMO"))) must(await sw.world.storage.deleteEntity("cluster", c.key));
}

async function populated(opts: Parameters<typeof serviceWorld>[0] = {}): Promise<ServiceWorld> {
  const sw = serviceWorld(opts);
  const a = await fileEvent(sw, laneLoss(0));
  const s = value(await splitEvent(sw.ctx(), a.key));
  for (const j of [1, -1, 2]) {
    const e = await fileEvent(sw, laneLoss(j));
    value(await acceptMatch(sw.ctx(), e.key, s.cluster?.key ?? ""));
  }
  const d = await fileEvent(sw, lateralDrift(0));
  value(await splitEvent(sw.ctx(), d.key, "Curve drift"));
  await fileEvent(sw, lateralDrift(1));
  await fileEvent(sw, laneLoss(3));
  await fileEvent(sw, farLaneLoss(0));
  await fileEvent(sw, farLaneLoss(1));
  await drainRecluster(sw);
  return sw;
}

/** Runs queued resync jobs until done (each run limited to `maxPages`). */
async function drainResync(sw: ServiceWorld, maxPages: number): Promise<number> {
  let runs = 0;
  for (let guard = 0; guard < 100; guard++) {
    const jobs = sw.world.queue.take("tt-recluster");
    if (jobs.length === 0) break;
    for (const j of jobs) {
      const o = await runReclusterJob(sw.world.ports({}), j.body, { maxPages });
      if (o.kind === "resync") runs++;
    }
  }
  return runs;
}

describe("Re-sync now (§7.5)", () => {
  it("rebuilding from Jira equals the incremental index state, in several chunked runs", async () => {
    const sw = await populated();
    const incremental = await snapshot(sw);
    await wipeIndex(sw);
    sw.world.queue.take();
    const req = value(await requestResync(sw.ctx(), "TTDEMO"));
    expect(req.state).toBe("pending");
    const runs = await drainResync(sw, 1);
    expect(runs).toBeGreaterThan(2);
    expect(await snapshot(sw)).toEqual(incremental);
    const status = value(await getResyncStatus(sw.ctx(), "TTDEMO"));
    expect(status.state).toBe("done");
    expect(status.counts).toMatchObject({ clusters: 2, events: 9, accepted: 5 });
    expect(sw.world.site.writesBy("app")).toEqual([]);
  });

  it("dedupes clicks while a re-sync is pending, and allows a new one after it finished", async () => {
    const sw = await populated();
    sw.world.queue.take();
    value(await requestResync(sw.ctx(), "TTDEMO"));
    const second = await requestResync(sw.ctx(ADMIN), "TTDEMO");
    expect(second.ok && second.value.warnings[0]).toMatch(/already queued/);
    expect(sw.world.queue.peek("tt-recluster")).toHaveLength(1);
    await drainResync(sw, 1000);
    value(await requestResync(sw.ctx(), "TTDEMO"));
    expect(sw.world.queue.peek("tt-recluster")).toHaveLength(1);
  });

  it("works when the property index is not active (SPIKE-E1) and search omits properties (SPIKE-E3)", async () => {
    const sw = await populated({ jira: { aliasesIndexed: false, searchReturnsProperties: false } });
    const incremental = await snapshot(sw);
    await wipeIndex(sw);
    sw.world.queue.take();
    value(await requestResync(sw.ctx(), "TTDEMO"));
    await drainResync(sw, 1000);
    expect(await snapshot(sw)).toEqual(incremental);
    expect(value(await getResyncStatus(sw.ctx(), "TTDEMO")).state).toBe("done");
  });

  it("deletes orphan rows and follows hand-edited links", async () => {
    const sw = await populated();
    const events = must(await loadProjectEvents(sw.world.storage, "TTDEMO"));
    const accepted = events.find((e) => e.value.status === "accepted" && e.value.nnDist >= 0);
    if (accepted === undefined) throw new Error("no accepted event");
    must(await sw.world.storage.putEntity("event", "99999", { ...accepted.value, issueKey: "TTDEMO-999" }));
    const links = must(await sw.ctx().ports.jira.asUser().getIssueLinks(accepted.value.issueKey));
    must(await sw.ctx().ports.jira.asUser().deleteIssueLink(links[0]?.id ?? ""));
    sw.world.queue.take();
    value(await requestResync(sw.ctx(), "TTDEMO"));
    await drainResync(sw, 1000);
    expect(must(await sw.world.storage.getEntity("event", "99999"))).toBeUndefined();
    expect(must(await sw.world.storage.getEntity("event", accepted.key))?.status).not.toBe("accepted");
    expect(value(await getResyncStatus(sw.ctx(), "TTDEMO")).counts["orphanEventsDeleted"]).toBe(1);
  });

  it("keeps index rows written after the re-sync started (concurrent intake), deletes older orphans", async () => {
    const sw = await populated();
    const events = must(await loadProjectEvents(sw.world.storage, "TTDEMO"));
    const template = events[0];
    if (template === undefined) throw new Error("no event");
    must(await sw.world.storage.putEntity("event", "99990", { ...template.value, issueKey: "TTDEMO-990" }));
    sw.world.queue.take();
    value(await requestResync(sw.ctx(), "TTDEMO"));
    // First invocation stops at its page budget (startedAt is recorded).
    const first = sw.world.queue.take("tt-recluster")[0];
    await runReclusterJob(sw.world.ports({}), first?.body, { maxPages: 0 });
    // A resolver commits while the rebuild is in flight; JQL may not return it yet (SPIKE-E1).
    sw.world.clock.advance({ seconds: 30 });
    must(await sw.world.storage.putEntity("event", "99991", { ...template.value, issueKey: "TTDEMO-991", indexedAt: Math.floor(sw.world.clock.nowMs() / 1000) }));
    await drainResync(sw, 1000);
    expect(must(await sw.world.storage.getEntity("event", "99990"))).toBeUndefined();
    expect(must(await sw.world.storage.getEntity("event", "99991"))).toBeDefined();
    expect(value(await getResyncStatus(sw.ctx(), "TTDEMO")).state).toBe("done");
  });

  it("restarts cleanly after a failed run: a stale cursor and timestamps from that run are dropped", async () => {
    const sw = await populated();
    const incremental = await snapshot(sw);
    sw.world.queue.take();
    must(await sw.world.storage.set("resync:TTDEMO", { v: 1, state: "failed", requestedAt: "2026-11-01T09:00:00.000Z", startedAt: "2026-11-01T09:00:01.000Z", finishedAt: "2026-11-01T09:05:00.000Z", phase: "events", cursor: "stale-token-from-events", selector: "project = TTDEMO AND labels = tt-takeover", seenClusters: [], seenEvents: [], counts: { events: 3 }, runs: 4, message: "Reading event issues failed" }));
    const r = must(await runResync(sw.world.ports({}), "TTDEMO"));
    expect(r.state).toBe("done");
    expect(await snapshot(sw)).toEqual(incremental);
    const status = value(await getResyncStatus(sw.ctx(), "TTDEMO"));
    expect(status.startedAt).toBe(sw.world.clock.nowIso());
    expect(status.counts["events"]).toBe(9);
  });

  it("records a failure honestly when Jira fails, and can be retried", async () => {
    const sw = await populated();
    sw.world.queue.take();
    value(await requestResync(sw.ctx(), "TTDEMO"));
    sw.world.site.failNext("searchJql", "unavailable");
    const job = sw.world.queue.take("tt-recluster")[0];
    const o = await runReclusterJob(sw.world.ports({}), job?.body);
    expect(o.kind).toBe("retry");
    expect(value(await getResyncStatus(sw.ctx(), "TTDEMO")).state).toBe("failed");
    const r = must(await runResync(sw.world.ports({}), "TTDEMO"));
    expect(r.state).toBe("done");
  });

  it("requires Browse to request or read the status", async () => {
    const sw = serviceWorld();
    expect((await requestResync(sw.ctx(OUTSIDER), "TTDEMO")).ok).toBe(false);
    expect((await getResyncStatus(sw.ctx(OUTSIDER), "TTDEMO")).ok).toBe(false);
  });

  it("drops malformed recluster jobs without throwing", async () => {
    const sw = serviceWorld();
    expect((await runReclusterJob(sw.world.ports({}), { projectKey: "TTDEMO", reason: "resync", bucket: "lane-loss|cam-B", requestedAt: "2026-11-16T09:00:00Z" })).kind).toBe("dropped");
    expect((await runReclusterJob(sw.world.ports({}), "nope")).kind).toBe("dropped");
  });
});
