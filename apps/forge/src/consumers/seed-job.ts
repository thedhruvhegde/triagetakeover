/**
 * The `tt-seed` job logic without Forge wiring (testable with the fakes). One invocation runs
 * one chain position `(step, cursor)` (ARCHITECTURE §8: `{jobId, step, cursor, seed}`).
 *
 * At-least-once safety:
 * 1. A message behind the job record's position is a duplicate delivery and is dropped.
 * 2. The step's work is idempotent (services/seed/steps.ts).
 * 3. The next message is pushed BEFORE the job record moves forward. A crash between the two
 *    re-runs this position (idempotent) and may push the next message twice; the second copy
 *    is then behind the record and dropped. A message ahead of the record is accepted: it can
 *    only exist once every earlier position's work finished.
 * 4. Retryable failures (429, 5xx, timeouts) re-queue the same position with a delay
 *    (`delayInSeconds`, §15 #15) and show "waiting"; other failures mark the job failed, and
 *    "Load demo data" resumes it from the failed position (PRD US-01 AC3).
 *
 * Chunking: event and attachment steps process a bounded number of items per invocation and
 * stop early at a wall-clock budget well inside the 600 s consumer timeout.
 */
import { PROFILE_ID, planFleet, type SeedConfig } from "@tt/seedgen";
import { createServiceContext } from "../context";
import type { Ports } from "../ports/index";
import { isRetryable, type PortError } from "../ports/result";
import { QUEUE_MAX_DELAY_SECONDS } from "../ports/queue";
import { loadProjectConfig } from "../services/config";
import { CallCounter, countingPorts } from "../services/seed/counting";
import { defaultGenerator } from "../services/seed/generate";
import {
  SEED_STEP_LABELS,
  isSeedStep,
  positionOf,
  readJobRecord,
  readManifest,
  writeJobRecord,
  type SeedJobRecord,
  type SeedStep,
  type StepStats,
} from "../services/seed/state";
import {
  stepAttachments,
  stepBoard,
  stepClusters,
  stepHistory,
  stepMonday,
  stepRegistry,
  stepReport,
  stepScenarios,
  type MutableManifest,
  type StepContext,
  type StepDeps,
  type StepResult,
} from "../services/seed/steps";
import { parseSeedJob } from "../validation/payloads";
import { refreshOnsetCaches } from "./onset-cache";

export type SeedOutcome =
  | { readonly kind: "advanced"; readonly step: SeedStep; readonly next: { readonly step: SeedStep; readonly cursor: number } }
  | { readonly kind: "done"; readonly step: SeedStep }
  /** Malformed, stale or duplicate message: nothing was done. */
  | { readonly kind: "dropped"; readonly reason: string }
  /** Retryable failure: the same position was re-queued with a delay. */
  | { readonly kind: "waiting"; readonly step: SeedStep; readonly delaySeconds: number; readonly reason: string }
  /** The queue itself failed: the platform should redeliver this message. */
  | { readonly kind: "retry"; readonly retryAfterSeconds: number; readonly reason: string }
  | { readonly kind: "failed"; readonly step: SeedStep; readonly reason: string };

/** Production defaults (SEED_DATA §15.1, ARCHITECTURE §13). SPIKE-S2/G2: tune on a real site. */
export const DEFAULT_STEP_DEPS: StepDeps = {
  generate: defaultGenerator,
  nowMs: () => Date.now(),
  budgetMs: 420_000,
  eventsPerStep: 8,
  attachmentEventsPerStep: 6,
};

/** Consecutive retryable failures at one position before the job is marked failed. */
export const SEED_MAX_ATTEMPTS = 8;

export interface SeedRunOptions extends Partial<StepDeps> {
  readonly maxAttempts?: number;
}

const STEP_IMPL: Readonly<Record<SeedStep, (sc: StepContext, cursor: number) => Promise<StepResult>>> = {
  registry: (sc) => stepRegistry(sc),
  scenarios: (sc) => stepScenarios(sc),
  history: (sc, c) => stepHistory(sc, c),
  clusters: (sc, c) => stepClusters(sc, c),
  monday: (sc, c) => stepMonday(sc, c),
  board: (sc) => stepBoard(sc),
  attachments: (sc, c) => stepAttachments(sc, c),
  report: (sc) => stepReport(sc),
};

/** Back-off for a retryable failure: the platform's Retry-After, else 5 s doubling, ≤ 900 s. */
export function backoffSeconds(e: PortError, attempt: number): number {
  const base = e.retryAfterSeconds ?? 5 * 2 ** Math.max(0, attempt - 1);
  return Math.max(1, Math.min(QUEUE_MAX_DELAY_SECONDS, Math.ceil(base)));
}

function mergeStats(prev: Readonly<Record<string, StepStats>>, step: SeedStep, ms: number, calls: Readonly<Record<string, number>>): Record<string, StepStats> {
  const p = prev[step] ?? { runs: 0, ms: 0, calls: {} };
  const merged: Record<string, number> = { ...p.calls };
  for (const [k, v] of Object.entries(calls)) merged[k] = (merged[k] ?? 0) + v;
  return { ...prev, [step]: { runs: p.runs + 1, ms: p.ms + ms, calls: merged } };
}

const uniqueCapped = (xs: readonly string[], cap = 50): string[] => [...new Set(xs)].slice(-cap);

export async function runSeedStep(rawPorts: Ports, body: unknown, opts: SeedRunOptions = {}): Promise<SeedOutcome> {
  const deps: StepDeps = { ...DEFAULT_STEP_DEPS, ...opts };
  const maxAttempts = opts.maxAttempts ?? SEED_MAX_ATTEMPTS;
  const parsed = parseSeedJob(body);
  if (!parsed.ok) return { kind: "dropped", reason: "invalid job body" };
  const job = parsed.value;
  if (!isSeedStep(job.step)) return { kind: "dropped", reason: `unknown step ${job.step}` };
  const step = job.step;
  const { storage, clock } = rawPorts;

  const recR = await readJobRecord(storage, job.jobId);
  if (!recR.ok) return { kind: "retry", retryAfterSeconds: backoffSeconds(recR.error, 1), reason: recR.error.message };
  const rec = recR.value;
  if (rec === null) return { kind: "dropped", reason: "unknown job" };
  if (rec.state === "done" || rec.state === "failed") return { kind: "dropped", reason: `job is ${rec.state}` };
  if (rec.seed !== job.seed) return { kind: "dropped", reason: "seed mismatch" };
  if (positionOf(step, job.cursor) < positionOf(rec.step, rec.cursor)) return { kind: "dropped", reason: "duplicate delivery" };

  const mR = await readManifest(storage);
  if (!mR.ok) return { kind: "retry", retryAfterSeconds: backoffSeconds(mR.error, 1), reason: mR.error.message };
  const manifest = mR.value;
  if (manifest === null || manifest.jobId !== job.jobId) {
    await writeJobRecord(storage, { ...rec, state: "failed", errors: uniqueCapped([...rec.errors, "The demo seed state was removed while the job was running."]), updatedAt: clock.nowIso() });
    return { kind: "dropped", reason: "no manifest for this job" };
  }

  const counter = new CallCounter();
  const ports = countingPorts(rawPorts, counter);
  const cfg: SeedConfig = { seed: manifest.seed, anchorDate: manifest.anchorDate, profile: PROFILE_ID, frames: manifest.frames };
  const plan = planFleet(cfg);
  const { config } = await loadProjectConfig(ports.storage, manifest.projectKey);
  const m: MutableManifest = { ...manifest };
  const sc: StepContext = {
    ports,
    jira: ports.jira.asApp(),
    sctx: createServiceContext(ports, {}),
    cfg,
    plan,
    config,
    m,
    job: rec,
    deps,
    startedMs: deps.nowMs(),
    warnings: [],
    generated: new Map(),
  };

  const result = await STEP_IMPL[step](sc, job.cursor);
  if (result.ok && step === "board") {
    const oc = await refreshOnsetCaches(ports, manifest.projectKey);
    if (!oc.ok) sc.warnings.push("The onset cache could not be refreshed; the board computes onset on load.");
  }
  const elapsed = deps.nowMs() - sc.startedMs;

  if (!result.ok) {
    const e = result.error;
    const stats = mergeStats(rec.stats, step, elapsed, counter.snapshot());
    if (isRetryable(e) && rec.attempts + 1 < maxAttempts) {
      const attempts = rec.attempts + 1;
      const delaySeconds = backoffSeconds(e, attempts);
      const pushed = await rawPorts.queue.pushSeed({ jobId: job.jobId, step, cursor: job.cursor, seed: job.seed }, { delaySeconds });
      if (!pushed.ok) return { kind: "retry", retryAfterSeconds: delaySeconds, reason: pushed.error.message };
      const label = e.kind === "rate-limited" ? "waiting (rate limit)" : "waiting (Jira unavailable)";
      await writeJobRecord(storage, { ...rec, state: "waiting", attempts, stats, message: `${SEED_STEP_LABELS[step]}: ${label}, retrying in ${delaySeconds} s.`, warnings: uniqueCapped([...rec.warnings, ...sc.warnings]), updatedAt: clock.nowIso() });
      return { kind: "waiting", step, delaySeconds, reason: e.message };
    }
    const reason = `${SEED_STEP_LABELS[step]} failed: ${e.message}`;
    await writeJobRecord(storage, { ...rec, state: "failed", stats, errors: uniqueCapped([...rec.errors, reason]), warnings: uniqueCapped([...rec.warnings, ...sc.warnings]), message: `${reason} Click "Load demo data" to retry from this step.`, updatedAt: clock.nowIso() });
    return { kind: "failed", step, reason };
  }

  const done = result.value;
  if (done.next !== null) {
    const pushed = await ports.queue.pushSeed({ jobId: job.jobId, step: done.next.step, cursor: done.next.cursor, seed: job.seed });
    if (!pushed.ok) return { kind: "retry", retryAfterSeconds: backoffSeconds(pushed.error, 1), reason: pushed.error.message };
  }
  const stats = mergeStats(rec.stats, step, deps.nowMs() - sc.startedMs, counter.snapshot());
  const boardReady = done.patch?.boardReady ?? rec.boardReady;
  const resumedState: SeedJobRecord["state"] = boardReady && (done.patch?.attachments ?? rec.attachments) === "uploading" ? "uploading-raw-files" : "running";
  const next: SeedJobRecord = {
    ...rec,
    ...(done.patch ?? {}),
    state: done.next === null ? "done" : (done.patch?.state ?? resumedState),
    step: done.next?.step ?? step,
    cursor: done.next?.cursor ?? job.cursor,
    attempts: 0,
    counts: { ...rec.counts, ...done.counts },
    warnings: uniqueCapped([...rec.warnings, ...sc.warnings]),
    message: done.patch?.message ?? (done.next !== null ? `${SEED_STEP_LABELS[done.next.step]}…` : "Demo data loaded."),
    stats,
    updatedAt: clock.nowIso(),
    ...(done.next === null ? { finishedAt: clock.nowIso() } : {}),
  };
  await writeJobRecord(storage, next);
  return done.next === null ? { kind: "done", step } : { kind: "advanced", step, next: done.next };
}
