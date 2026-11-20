/**
 * The `resync:<projectKey>` KVS record (§7.4): latest "Re-sync now" request, its progress and
 * the resume cursor that lets the rebuild run in several consumer invocations (§8, 900 s).
 */
import { isRecord } from "@tt/engine";
import type { ResyncStatus } from "../contract/ui-api";
import { KvsKeys, type StoragePort } from "../ports/storage";

export type ResyncPhase = "clusters" | "events" | "orphans" | "recluster" | "done";

export interface ResyncRecord {
  readonly v: 1;
  readonly state: ResyncStatus["state"];
  readonly requestedBy?: string;
  readonly requestedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly phase?: ResyncPhase;
  /** Search `nextPageToken` within the current phase. */
  readonly cursor?: string;
  /** Selector actually used for events (property index or the label fallback, SPIKE-E1). */
  readonly selector?: string;
  readonly seenClusters: readonly string[];
  readonly seenEvents: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
  readonly message?: string;
  /** Consumer invocations used so far. */
  readonly runs: number;
}

const PHASES: readonly ResyncPhase[] = ["clusters", "events", "orphans", "recluster", "done"];
const STATES: readonly ResyncStatus["state"][] = ["idle", "pending", "running", "done", "failed"];

const strs = (u: unknown): string[] => (Array.isArray(u) ? u.filter((x): x is string => typeof x === "string") : []);

export function parseResyncRecord(u: unknown): ResyncRecord | null {
  if (!isRecord(u) || !STATES.includes(u["state"] as ResyncStatus["state"])) return null;
  const counts: Record<string, number> = {};
  if (isRecord(u["counts"])) for (const [k, v] of Object.entries(u["counts"])) if (typeof v === "number" && Number.isFinite(v)) counts[k] = v;
  const opt = (k: string): Record<string, string> => (typeof u[k] === "string" ? { [k]: u[k] } : {});
  return {
    v: 1,
    state: u["state"] as ResyncStatus["state"],
    ...opt("requestedBy"),
    ...opt("requestedAt"),
    ...opt("startedAt"),
    ...opt("finishedAt"),
    ...opt("cursor"),
    ...opt("selector"),
    ...opt("message"),
    ...(PHASES.includes(u["phase"] as ResyncPhase) ? { phase: u["phase"] as ResyncPhase } : {}),
    seenClusters: strs(u["seenClusters"]),
    seenEvents: strs(u["seenEvents"]),
    counts,
    runs: typeof u["runs"] === "number" ? u["runs"] : 0,
  };
}

export async function readResyncRecord(storage: StoragePort, projectKey: string): Promise<ResyncRecord | null> {
  const r = await storage.get(KvsKeys.resync(projectKey));
  return r.ok ? parseResyncRecord(r.value) : null;
}

export async function writeResyncRecord(storage: StoragePort, projectKey: string, rec: ResyncRecord): Promise<boolean> {
  const r = await storage.set(KvsKeys.resync(projectKey), rec);
  return r.ok;
}

export function statusOf(projectKey: string, rec: ResyncRecord | null): ResyncStatus {
  if (rec === null) return { projectKey, state: "idle", counts: {} };
  return {
    projectKey,
    state: rec.state,
    ...(rec.requestedBy !== undefined ? { requestedBy: rec.requestedBy } : {}),
    ...(rec.requestedAt !== undefined ? { requestedAt: rec.requestedAt } : {}),
    ...(rec.startedAt !== undefined ? { startedAt: rec.startedAt } : {}),
    ...(rec.finishedAt !== undefined ? { finishedAt: rec.finishedAt } : {}),
    ...(rec.phase !== undefined ? { phase: rec.phase } : {}),
    counts: rec.counts,
    ...(rec.message !== undefined ? { message: rec.message } : {}),
  };
}

export async function readResyncStatus(storage: StoragePort, projectKey: string): Promise<ResyncStatus> {
  return statusOf(projectKey, await readResyncRecord(storage, projectKey));
}
