/**
 * Demo seed state in KVS (ARCHITECTURE §7.4, §8, §9; SEED_DATA §15.1).
 *
 * - `seed:state` is the **manifest**: which project the demo lives in, the seed, and every Jira
 *   issue the seed created (`items`: generator item id → issue id/key). "Remove demo data" only
 *   deletes what this manifest (or an issue's own `tt.seed` property) says the seed created.
 * - `job:seed:<jobId>` is the **job record**: the chain position (`step`, `cursor`), progress
 *   counts, errors and per-step measurements. The admin page polls it through `getSeedJob`.
 * - `seed:report` is the admin-only seed report. It holds aggregate accuracy numbers computed
 *   against the generator's ground truth; truth itself is never stored, and nothing the engine
 *   or the board reads looks at `seed:*` (SEED_DATA §14.1).
 *
 * Values read back are untrusted JSON: they are re-validated field by field here.
 */
import { isRecord } from "@tt/engine";
import { KvsKeys, type StoragePort } from "../../ports/storage";
import { ok, type PortResult } from "../../ports/result";

/** The project the in-app seed creates (SPIKE-S1: may be refused; then the admin picks one). */
export const DEMO_PROJECT_KEY = "TTDEMO";
export const DEMO_PROJECT_NAME = "Takeover Triage Demo [SYNTHETIC]";
export const DEMO_PROJECT_DESCRIPTION = "Synthetic demo data for Takeover Triage. Not real vehicle, fleet or driver data.";

export const SEED_REPORT_KEY = "seed:report";

/** The consumer chain, in order (SEED_DATA §15.1 S2–S10). */
export const SEED_STEPS = ["registry", "scenarios", "history", "clusters", "monday", "board", "attachments", "report"] as const;
export type SeedStep = (typeof SEED_STEPS)[number];

export const SEED_STEP_LABELS: Readonly<Record<SeedStep, string>> = {
  registry: "Vehicles and drive sessions",
  scenarios: "Scenario-test issues",
  history: "Historical takeover events",
  clusters: "Clusters from the engine's proposal",
  monday: "Monday batch (left unassigned)",
  board: "Re-cluster: board ready",
  attachments: "Raw files uploading",
  report: "Seed report",
};

export function isSeedStep(s: string): s is SeedStep {
  return (SEED_STEPS as readonly string[]).includes(s);
}

/** Total order of chain positions: a message behind the job record is a duplicate delivery. */
export function positionOf(step: SeedStep, cursor: number): number {
  return SEED_STEPS.indexOf(step) * 1_000_000 + cursor;
}

export interface SeedItemRef {
  readonly id: string;
  readonly key: string;
}

/** One cluster issue the seed creates from the engine's HAC proposal over history (S6). */
export interface ClusterPlanEntry {
  /** `CL-<first member's eventId>`. */
  readonly itemId: string;
  /** `"<type>|<variant>"`. */
  readonly bucket: string;
  /** Generator event ids of the members, in the engine's canonical order. */
  readonly members: readonly string[];
}

export interface SeedManifest {
  readonly v: 1;
  readonly projectKey: string;
  readonly seed: number;
  readonly anchorDate: string;
  readonly frames: "full" | "fast";
  readonly jobId: string;
  /** accountId of the admin who clicked "Load demo data" (component lead, `tt.triage.by`). */
  readonly by: string;
  readonly createdAt: string;
  /** True when the seed created the project itself (S1). The project is never deleted by the app. */
  readonly projectCreated: boolean;
  /** Component names the seed created (kept on removal: the JiraPort has no component delete). */
  readonly componentsCreated: readonly string[];
  /** `config:<projectKey>` before the seed and as the seed left it (restored on removal only if unchanged). */
  readonly config: { readonly before: unknown; readonly seeded: unknown };
  /** `triaged:<projectKey>` before the seed (the seeded value is derived from the plan). */
  readonly triagedBefore: unknown;
  /** Generator item id (`SCN-01`, `E-001`, `CL-E-004`) → the issue the seed created for it. */
  readonly items: Readonly<Record<string, SeedItemRef>>;
  /** Item ids whose create call may be in flight (a retry then searches before creating). */
  readonly pending: readonly string[];
  /** Frozen on first computation so a retried step links exactly the same proposal. */
  readonly clusterPlan: readonly ClusterPlanEntry[] | null;
  readonly registry: { readonly vehicles: readonly string[]; readonly sessions: readonly string[] };
  /** Generator event id → number of raw files present on the issue after the attachments step. */
  readonly attachmentFiles: Readonly<Record<string, number>>;
  /** Generator event ids whose files the engine rejected (left without signal data, reported). */
  readonly failedEvents: readonly string[];
}

export type SeedJobState = "queued" | "running" | "waiting" | "uploading-raw-files" | "done" | "failed";

export interface StepStats {
  /** Invocations that executed this step (> 1 on retries, re-deliveries and chunking). */
  readonly runs: number;
  /** Wall-clock milliseconds spent in the step, summed over runs. */
  readonly ms: number;
  /** Port calls by `port.op`, summed over runs (Jira REST, storage, queue). */
  readonly calls: Readonly<Record<string, number>>;
}

export interface SeedJobRecord {
  readonly v: 1;
  readonly jobId: string;
  readonly projectKey: string;
  readonly seed: number;
  readonly anchorDate: string;
  readonly frames: "full" | "fast";
  readonly state: SeedJobState;
  readonly step: SeedStep;
  readonly cursor: number;
  /** Consecutive retryable failures at the current position. */
  readonly attempts: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly message: string;
  readonly boardReady: boolean;
  readonly attachments: "pending" | "uploading" | "done" | "skipped";
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly boardReadyAt?: string;
  readonly finishedAt?: string;
  readonly stats: Readonly<Record<string, StepStats>>;
}

// ------------------------------------------------------------------ validation

const str = (u: unknown): u is string => typeof u === "string";
const int = (u: unknown): u is number => typeof u === "number" && Number.isInteger(u) && u >= 0;
const strings = (u: unknown): string[] => (Array.isArray(u) ? u.filter(str) : []);
const numbers = (u: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isRecord(u)) return out;
  for (const [k, v] of Object.entries(u)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
};
const framesOf = (u: unknown): "full" | "fast" => (u === "full" ? "full" : "fast");

function itemsOf(u: unknown): Record<string, SeedItemRef> {
  const out: Record<string, SeedItemRef> = {};
  if (!isRecord(u)) return out;
  for (const [k, v] of Object.entries(u)) if (isRecord(v) && str(v["id"]) && str(v["key"])) out[k] = { id: v["id"], key: v["key"] };
  return out;
}

function clusterPlanOf(u: unknown): ClusterPlanEntry[] | null {
  if (!Array.isArray(u)) return null;
  const out: ClusterPlanEntry[] = [];
  for (const e of u) {
    if (!isRecord(e) || !str(e["itemId"]) || !str(e["bucket"])) return null;
    out.push({ itemId: e["itemId"], bucket: e["bucket"], members: strings(e["members"]) });
  }
  return out;
}

export function parseManifest(u: unknown): SeedManifest | null {
  if (!isRecord(u) || u["v"] !== 1 || !str(u["projectKey"]) || !int(u["seed"]) || !str(u["jobId"]) || !str(u["anchorDate"]) || !str(u["by"])) return null;
  const config = isRecord(u["config"]) ? u["config"] : {};
  const registry = isRecord(u["registry"]) ? u["registry"] : {};
  return {
    v: 1,
    projectKey: u["projectKey"],
    seed: u["seed"],
    anchorDate: u["anchorDate"],
    frames: framesOf(u["frames"]),
    jobId: u["jobId"],
    by: u["by"],
    createdAt: str(u["createdAt"]) ? u["createdAt"] : "",
    projectCreated: u["projectCreated"] === true,
    componentsCreated: strings(u["componentsCreated"]),
    config: { before: config["before"] ?? null, seeded: config["seeded"] ?? null },
    triagedBefore: u["triagedBefore"] ?? null,
    items: itemsOf(u["items"]),
    pending: strings(u["pending"]),
    clusterPlan: clusterPlanOf(u["clusterPlan"]),
    registry: { vehicles: strings(registry["vehicles"]), sessions: strings(registry["sessions"]) },
    attachmentFiles: numbers(u["attachmentFiles"]),
    failedEvents: strings(u["failedEvents"]),
  };
}

const JOB_STATES: readonly SeedJobState[] = ["queued", "running", "waiting", "uploading-raw-files", "done", "failed"];

function statsOf(u: unknown): Record<string, StepStats> {
  const out: Record<string, StepStats> = {};
  if (!isRecord(u)) return out;
  for (const [k, v] of Object.entries(u)) {
    if (!isRecord(v)) continue;
    out[k] = { runs: int(v["runs"]) ? v["runs"] : 0, ms: typeof v["ms"] === "number" && Number.isFinite(v["ms"]) ? v["ms"] : 0, calls: numbers(v["calls"]) };
  }
  return out;
}

export function parseJobRecord(u: unknown): SeedJobRecord | null {
  if (!isRecord(u) || u["v"] !== 1 || !str(u["jobId"]) || !str(u["projectKey"]) || !int(u["seed"]) || !str(u["step"]) || !isSeedStep(u["step"]) || !int(u["cursor"])) return null;
  const state = JOB_STATES.find((s) => s === u["state"]) ?? "failed";
  const att = u["attachments"];
  return {
    v: 1,
    jobId: u["jobId"],
    projectKey: u["projectKey"],
    seed: u["seed"],
    anchorDate: str(u["anchorDate"]) ? u["anchorDate"] : "",
    frames: framesOf(u["frames"]),
    state,
    step: u["step"],
    cursor: u["cursor"],
    attempts: int(u["attempts"]) ? u["attempts"] : 0,
    counts: numbers(u["counts"]),
    errors: strings(u["errors"]),
    warnings: strings(u["warnings"]),
    message: str(u["message"]) ? u["message"] : "",
    boardReady: u["boardReady"] === true,
    attachments: att === "uploading" || att === "done" || att === "skipped" ? att : "pending",
    startedAt: str(u["startedAt"]) ? u["startedAt"] : "",
    updatedAt: str(u["updatedAt"]) ? u["updatedAt"] : "",
    ...(str(u["boardReadyAt"]) ? { boardReadyAt: u["boardReadyAt"] } : {}),
    ...(str(u["finishedAt"]) ? { finishedAt: u["finishedAt"] } : {}),
    stats: statsOf(u["stats"]),
  };
}

// ------------------------------------------------------------------ IO

export async function readManifest(storage: StoragePort): Promise<PortResult<SeedManifest | null>> {
  const r = await storage.get(KvsKeys.seedState());
  return r.ok ? ok(parseManifest(r.value)) : r;
}

export async function writeManifest(storage: StoragePort, m: SeedManifest): Promise<PortResult<void>> {
  return storage.set(KvsKeys.seedState(), m);
}

export async function readJobRecord(storage: StoragePort, jobId: string): Promise<PortResult<SeedJobRecord | null>> {
  const r = await storage.get(KvsKeys.seedJob(jobId));
  return r.ok ? ok(parseJobRecord(r.value)) : r;
}

export async function writeJobRecord(storage: StoragePort, rec: SeedJobRecord): Promise<PortResult<void>> {
  return storage.set(KvsKeys.seedJob(rec.jobId), rec);
}

/** A job that is still moving through the chain. */
export function isActive(rec: SeedJobRecord): boolean {
  return rec.state === "queued" || rec.state === "running" || rec.state === "waiting" || rec.state === "uploading-raw-files";
}

/** An active job that has not moved for this long is treated as stalled (a click resumes it). */
export const STALE_JOB_MS = 20 * 60 * 1000;

export function isStale(rec: SeedJobRecord, nowMs: number): boolean {
  const t = Date.parse(rec.updatedAt);
  return !Number.isFinite(t) || nowMs - t > STALE_JOB_MS;
}

/** Monday on or before `iso` (UTC date), as YYYY-MM-DD (SEED_DATA §4.4: computed in the resolver). */
export function mondayOnOrBefore(iso: string): string {
  const t = Date.parse(iso);
  const day = Math.floor(t / 86_400_000);
  // 1970-01-01 was a Thursday: weekday index with Monday = 0 is (day + 3) mod 7.
  const back = (((day + 3) % 7) + 7) % 7;
  return new Date((day - back) * 86_400_000).toISOString().slice(0, 10);
}
