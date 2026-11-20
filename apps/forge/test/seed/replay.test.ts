/**
 * At-least-once safety of the tt-seed chain: duplicate delivery of every message, a crash
 * (the invocation dies right after a write succeeded, then the platform redelivers) after
 * EVERY write of a clean run (Jira, storage and queue writes of every step), retryable
 * failures (429 → delayed re-queue), a non-retryable failure resumed by "Load demo data",
 * and time-budget chunking. Every variant must end in exactly the clean run's state.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { startSeed } from "../../src/services/seed/service.js";
import { ADMIN, CrashPlan, DEFAULT_SEED, driveSeed, loadDemo, seedWorld, snapshotState } from "./harness.js";

let clean: unknown;
let cleanLog: string[] = [];
let cleanDeliveries = 0;

beforeAll(async () => {
  const sw = seedWorld();
  const plan = new CrashPlan(0);
  const { chain } = await loadDemo(sw, {}, { crash: plan });
  clean = await snapshotState(sw);
  cleanLog = plan.log;
  cleanDeliveries = chain.deliveries;
}, 300_000);

describe("tt-seed chain under redelivery and crashes (SYNTHETIC seed)", () => {
  it("the clean run has writes in every step", () => {
    const steps = new Set(cleanLog.map((e) => e.split(":")[0]));
    expect([...steps]).toEqual(["registry", "scenarios", "history", "clusters", "monday", "board", "attachments", "report"]);
    expect(cleanDeliveries).toBeGreaterThan(8);
  });

  it("delivering every message twice gives the same final state", async () => {
    const sw = seedWorld();
    const { chain } = await loadDemo(sw, {}, { duplicate: true });
    expect(chain.outcomes.filter((o) => o.kind === "dropped").length).toBeGreaterThanOrEqual(cleanDeliveries - 1);
    expect(await snapshotState(sw)).toEqual(clean);
  }, 120_000);

  it("a crash after any single write of any step (then redelivery) gives the same final state", async () => {
    const failures: string[] = [];
    for (let at = 1; at <= cleanLog.length; at++) {
      const sw = seedWorld();
      const plan = new CrashPlan(at);
      const { chain } = await loadDemo(sw, {}, { crash: plan });
      expect(chain.crashes).toBe(1);
      const snap = await snapshotState(sw);
      if (JSON.stringify(snap) !== JSON.stringify(clean)) failures.push(`crash at write ${at} (${cleanLog[at - 1] ?? "?"})`);
    }
    expect(failures).toEqual([]);
  }, 600_000);

  it("a 429 re-queues the same position with the platform's delay, then finishes identically", async () => {
    const sw = seedWorld();
    let injected = false;
    const { chain } = await loadDemo(sw, {}, {
      before: (job) => {
        if (!injected && (job.body as { step: string }).step === "history") {
          sw.world.site.failNext("bulkCreateIssues", { kind: "rate-limited", message: "429", status: 429, retryAfterSeconds: 7 });
          injected = true;
        }
      },
    });
    const waiting = chain.outcomes.find((o) => o.kind === "waiting");
    expect(waiting).toMatchObject({ kind: "waiting", step: "history", delaySeconds: 7 });
    expect(sw.world.queue.pushed.some((j) => j.queue === "tt-seed" && j.delaySeconds === 7)).toBe(true);
    expect(await snapshotState(sw)).toEqual(clean);
  }, 120_000);

  it("a non-retryable failure marks the job failed; Load demo data resumes it to the same final state", async () => {
    const sw = seedWorld();
    let injected = false;
    await loadDemo(sw, {}, {
      before: (job) => {
        if (!injected && (job.body as { step: string }).step === "clusters") {
          sw.world.site.failNext("createIssueLink", "forbidden");
          injected = true;
        }
      },
    });
    const rec = (await sw.world.storage.get("job:seed:seed-1")) as { ok: true; value: { state: string; step: string; errors: string[] } };
    expect(rec.value.state).toBe("failed");
    expect(rec.value.step).toBe("clusters");
    expect(rec.value.errors[0]).toMatch(/Clusters from the engine's proposal failed/);
    const again = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast" });
    expect(again.ok && again.value.warnings[0]).toMatch(/Resuming/);
    await driveSeed(sw);
    // The failed attempt's error stays in the record history; everything else is identical.
    const strip = (s: unknown) => JSON.parse(JSON.stringify(s, (k, v: unknown) => (k === "job:seed:seed-1" || k === "counts" ? undefined : v))) as unknown;
    expect(strip(await snapshotState(sw))).toEqual(strip(clean));
  }, 120_000);

  it("chunking at a small time budget (one event per invocation) gives the same final state", async () => {
    const sw = seedWorld();
    let t = 0;
    const { chain } = await loadDemo(sw, {}, { budgetMs: 1, nowMs: () => (t += 5), eventsPerStep: 3, attachmentEventsPerStep: 2 });
    expect(chain.deliveries).toBeGreaterThan(cleanDeliveries * 2);
    expect(await snapshotState(sw)).toEqual(clean);
  }, 120_000);
});
