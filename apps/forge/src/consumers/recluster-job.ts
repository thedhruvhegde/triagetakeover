/**
 * The `tt-recluster` job logic without Forge wiring (testable with the fakes).
 *
 * - `resync` jobs run the chunked §7.5 rebuild (which ends with a full recluster).
 * - Every other reason (`intake`, `accept`, `split`, `undo`, `panel-lazy`, `seed`) runs the
 *   bucket (or project) re-proposal: kNN suggestions, HAC groups, novel flags, nnDist and the
 *   cluster profile caches (services/recluster.ts).
 * - After either finishes, the per-cluster onset cache is refreshed for the whole project
 *   (Holm runs across all clusters, so a bucket-scoped job still refreshes every row). A
 *   failing cache refresh never fails the job: the board computes onset per request anyway.
 */
import type { Ports } from "../ports/index";
import { isRetryable } from "../ports/result";
import { reclusterProject, type ReclusterCounts } from "../services/recluster";
import { runResync, type ResyncOptions, type ResyncRunResult } from "../services/resync";
import { parseReclusterJob } from "../validation/payloads";
import { refreshOnsetCaches } from "./onset-cache";

export type ReclusterOutcome =
  | { readonly kind: "recluster"; readonly counts: ReclusterCounts }
  | { readonly kind: "resync"; readonly result: ResyncRunResult }
  /** A malformed or stale job: dropped without retry (consumers must survive bad bodies). */
  | { readonly kind: "dropped"; readonly reason: string }
  /** A transient failure: the platform should retry after `retryAfterSeconds`. */
  | { readonly kind: "retry"; readonly retryAfterSeconds: number; readonly reason: string };

export async function runReclusterJob(ports: Ports, body: unknown, opts: ResyncOptions = {}): Promise<ReclusterOutcome> {
  const job = parseReclusterJob(body);
  if (!job.ok) return { kind: "dropped", reason: job.error.map((e) => `${e.path ?? ""}: ${e.message}`).join("; ") };
  if (job.value.reason === "resync") {
    const r = await runResync(ports, job.value.projectKey, opts);
    if (!r.ok) return isRetryable(r.error) ? { kind: "retry", retryAfterSeconds: r.error.retryAfterSeconds ?? 30, reason: r.error.message } : { kind: "dropped", reason: r.error.message };
    if (!r.value.continued && r.value.state === "done") await refreshOnsetCachesQuietly(ports, job.value.projectKey);
    return { kind: "resync", result: r.value };
  }
  const r = await reclusterProject(ports, { projectKey: job.value.projectKey, ...(job.value.bucket !== undefined ? { bucket: job.value.bucket } : {}) });
  if (!r.ok) return isRetryable(r.error) ? { kind: "retry", retryAfterSeconds: r.error.retryAfterSeconds ?? 30, reason: r.error.message } : { kind: "dropped", reason: r.error.message };
  await refreshOnsetCachesQuietly(ports, job.value.projectKey);
  return { kind: "recluster", counts: r.value };
}

async function refreshOnsetCachesQuietly(ports: Ports, projectKey: string): Promise<void> {
  const r = await refreshOnsetCaches(ports, projectKey);
  if (!r.ok) console.warn("tt-recluster: onset cache not refreshed", r.error.kind);
}
