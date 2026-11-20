/**
 * "Re-sync now" (ARCHITECTURE §7.5 reconcile, D12): the index is rebuilt from Jira, which is
 * the source of truth.
 *
 * - `requestResync` (resolver, asUser Browse check) writes `resync:<projectKey>` = pending and
 *   queues `tt-recluster {reason: "resync"}`. A pending or running re-sync younger than 30
 *   minutes is reused (clicks are deduped).
 * - `runResync` (consumer, asApp) works in phases — clusters → events → orphans → recluster —
 *   and stops at a time/page budget, saving its cursor in the same KVS record and re-queueing
 *   itself, so a 5,000-event project fits the 900 s consumer limit across invocations.
 */
import { isRecord, parseTtCluster } from "@tt/engine";
import type { ResyncStatus } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { nowEpochSeconds } from "../ports/clock";
import type { Ports } from "../ports/index";
import type { ClusterRow } from "../ports/entities";
import type { JiraIssue } from "../ports/jira";
import { JQL_ALIASES, LABELS, PROPERTY_KEYS } from "../ports/properties";
import { ok, type PortResult } from "../ports/result";
import { KvsKeys } from "../ports/storage";
import { requireBrowse } from "./auth";
import { indexEvent } from "./commit";
import { loadProjectConfig, type ProjectConfig } from "./config";
import { done, fromPortError, type ServiceResult } from "./errors";
import { loadProjectClusters, loadProjectEvents, UNASSIGNED } from "./index-store";
import { fillMissingProperties, membershipFromLinks, triageOf } from "./jira-io";
import { reclusterProject } from "./recluster";
import { readResyncRecord, statusOf, writeResyncRecord, type ResyncPhase, type ResyncRecord } from "./resync-state";
import { verifyEvent } from "./verify";

export const RESYNC_DEDUPE_MS = 30 * 60 * 1000;
/** Stop well before the 900 s consumer timeout and continue in a new invocation. */
export const RESYNC_BUDGET_MS = 780 * 1000;
export const RESYNC_PAGE_SIZE = 100;
/** Completed seed job records older than this are purged (§7.5 step 4). */
export const JOB_RETENTION_MS = 7 * 86_400_000;

export async function requestResync(ctx: ServiceContext, projectKey: string): Promise<ServiceResult<ResyncStatus>> {
  const browse = await requireBrowse(ctx, projectKey);
  if (!browse.ok) return browse;
  const { storage, clock, queue } = ctx.ports;
  const current = await readResyncRecord(storage, projectKey);
  const now = clock.nowMs();
  if (current !== null && (current.state === "pending" || current.state === "running") && current.requestedAt !== undefined && now - Date.parse(current.requestedAt) < RESYNC_DEDUPE_MS) {
    return done(statusOf(projectKey, current), ["A re-sync is already queued or running; showing its progress."]);
  }
  const rec: ResyncRecord = { v: 1, state: "pending", requestedAt: clock.nowIso(), ...(ctx.accountId !== undefined ? { requestedBy: ctx.accountId } : {}), phase: "clusters", seenClusters: [], seenEvents: [], counts: {}, runs: 0 };
  if (!(await writeResyncRecord(storage, projectKey, rec))) return fromPortError({ kind: "unavailable", message: "storage write failed" }, "Starting the re-sync");
  const pushed = await queue.pushRecluster({ projectKey, reason: "resync", requestedAt: rec.requestedAt ?? clock.nowIso(), ...(ctx.accountId !== undefined ? { requestedBy: ctx.accountId } : {}) });
  if (!pushed.ok) {
    await writeResyncRecord(storage, projectKey, { ...rec, state: "failed", message: "The re-sync could not be queued." });
    return fromPortError(pushed.error, "Queueing the re-sync");
  }
  return done(statusOf(projectKey, rec));
}

export async function getResyncStatus(ctx: ServiceContext, projectKey: string): Promise<ServiceResult<ResyncStatus>> {
  const browse = await requireBrowse(ctx, projectKey);
  if (!browse.ok) return browse;
  return done(statusOf(projectKey, await readResyncRecord(ctx.ports.storage, projectKey)));
}

export interface ResyncOptions {
  /** Wall-clock budget for this invocation (default {@link RESYNC_BUDGET_MS}). */
  readonly budgetMs?: number;
  /** Page budget for this invocation (tests use it to force chunking). */
  readonly maxPages?: number;
  /** Monotonic time source for the budget (defaults to the port clock). */
  readonly nowMs?: () => number;
}

export interface ResyncRunResult {
  readonly state: ResyncStatus["state"];
  readonly phase: ResyncPhase;
  /** True when the run stopped at its budget and queued a continuation. */
  readonly continued: boolean;
  readonly counts: Readonly<Record<string, number>>;
}

/** JQL selecting the project's event issues (SPIKE-E1 property index; label fallback). */
export function eventSelectors(config: ProjectConfig): string[] {
  const p = `project = ${config.projectKey}`;
  if (config.eventJql !== "") return [`${p} AND (${config.eventJql})`];
  return [`${JQL_ALIASES.v} = 1 AND ${p}`, `${p} AND labels = ${LABELS.takeover}`];
}

function bump(counts: Record<string, number>, k: string, by = 1): void {
  counts[k] = (counts[k] ?? 0) + by;
}

/** One consumer invocation of the rebuild. */
export async function runResync(ports: Ports, projectKey: string, opts: ResyncOptions = {}): Promise<PortResult<ResyncRunResult>> {
  const { storage, clock } = ports;
  const jira = ports.jira.asApp();
  const now = opts.nowMs ?? (() => clock.nowMs());
  const started = now();
  const budget = opts.budgetMs ?? RESYNC_BUDGET_MS;
  const maxPages = opts.maxPages ?? Number.MAX_SAFE_INTEGER;
  let pages = 0;
  const outOfBudget = (): boolean => pages >= maxPages || now() - started >= budget;

  const prev = await readResyncRecord(storage, projectKey);
  let rec: ResyncRecord = prev ?? { v: 1, state: "pending", requestedAt: clock.nowIso(), phase: "clusters", seenClusters: [], seenEvents: [], counts: {}, runs: 0 };
  if (rec.state === "done" || rec.state === "failed" || rec.state === "idle") {
    // A fresh rebuild (e.g. the platform redelivering a job that failed): drop the previous
    // run's search cursor and selector (a nextPageToken from another phase/JQL is invalid) and
    // its timestamps (startedAt also bounds the orphan check below).
    rec = { v: 1, state: "pending", requestedAt: rec.requestedAt ?? clock.nowIso(), ...(rec.requestedBy !== undefined ? { requestedBy: rec.requestedBy } : {}), phase: "clusters", seenClusters: [], seenEvents: [], counts: {}, runs: 0 };
  }
  const { cursor: _c, ...base } = rec;
  void _c;
  rec = { ...base, ...(rec.cursor !== undefined ? { cursor: rec.cursor } : {}), state: "running", runs: rec.runs + 1, ...(rec.startedAt === undefined ? { startedAt: clock.nowIso() } : {}) };
  const counts: Record<string, number> = { ...rec.counts };
  const seenClusters = new Set(rec.seenClusters);
  const seenEvents = new Set(rec.seenEvents);
  const { config } = await loadProjectConfig(storage, projectKey);

  const save = async (patch: Partial<ResyncRecord>): Promise<void> => {
    rec = { ...rec, ...patch, counts: { ...counts }, seenClusters: [...seenClusters], seenEvents: [...seenEvents] };
    await writeResyncRecord(storage, projectKey, rec);
  };
  const continueLater = async (phase: ResyncPhase, cursor: string | undefined): Promise<PortResult<ResyncRunResult>> => {
    const { cursor: _old, ...rest } = rec;
    void _old;
    rec = { ...rest, ...(cursor !== undefined ? { cursor } : {}) };
    await save({ phase, state: "running" });
    const pushed = await ports.queue.pushRecluster({ projectKey, reason: "resync", requestedAt: rec.requestedAt ?? clock.nowIso(), ...(rec.requestedBy !== undefined ? { requestedBy: rec.requestedBy } : {}) });
    if (!pushed.ok) {
      await save({ state: "failed", message: "Could not queue the next re-sync step; click Re-sync now to resume." });
      return pushed;
    }
    return ok({ state: "running", phase, continued: true, counts: { ...counts } });
  };
  const failWith = async (message: string, e: { readonly ok: false; readonly error: import("../ports/result").PortError }): Promise<PortResult<ResyncRunResult>> => {
    await save({ state: "failed", message, finishedAt: clock.nowIso() });
    return e;
  };
  await save({});

  // Phase 1: cluster issues (rebuild rows; caches are refreshed by the recluster phase).
  if (rec.phase === "clusters") {
    let cursor = rec.cursor;
    do {
      if (outOfBudget()) return continueLater("clusters", cursor);
      const r = await jira.searchJql({ jql: `project = ${projectKey} AND labels = ${LABELS.cluster}`, properties: [PROPERTY_KEYS.cluster], maxResults: RESYNC_PAGE_SIZE, ...(cursor !== undefined ? { nextPageToken: cursor } : {}) });
      pages++;
      if (!r.ok) return failWith(`Reading cluster issues failed: ${r.error.message}`, r);
      const filled = await fillMissingProperties(jira, r.value.issues, [PROPERTY_KEYS.cluster]);
      if (!filled.ok) return failWith("Reading cluster properties failed", filled);
      for (const issue of filled.value) {
        const w = await rebuildClusterRow(ports, issue);
        if (w === "invalid") bump(counts, "invalidClusters");
        else {
          seenClusters.add(issue.id);
          bump(counts, "clusters");
        }
      }
      cursor = r.value.nextPageToken;
    } while (cursor !== undefined);
    const { cursor: _x, ...rest } = rec;
    void _x;
    rec = { ...rest, phase: "events" };
    await save({});
  }

  // Phase 2: event issues → verified rows; membership from links (truth).
  if (rec.phase === "events") {
    const selectors = rec.selector !== undefined ? [rec.selector] : eventSelectors(config);
    let selector = rec.selector;
    let cursor = rec.cursor;
    for (const candidate of selectors) {
      if (selector !== undefined && candidate !== selector) continue;
      if (candidate !== rec.selector) cursor = undefined;
      do {
        if (outOfBudget()) {
          rec = { ...rec, selector: candidate };
          return continueLater("events", cursor);
        }
        const r = await jira.searchJql({ jql: candidate, properties: [PROPERTY_KEYS.event, PROPERTY_KEYS.triage], fields: ["issuelinks"], maxResults: RESYNC_PAGE_SIZE, ...(cursor !== undefined ? { nextPageToken: cursor } : {}) });
        pages++;
        if (!r.ok) {
          if (r.error.kind === "bad-request" && selector === undefined && candidate !== selectors[selectors.length - 1]) break; // SPIKE-E1 fallback
          return failWith(`Reading event issues failed: ${r.error.message}`, r);
        }
        selector = candidate;
        const filled = await fillMissingProperties(jira, r.value.issues, [PROPERTY_KEYS.event, PROPERTY_KEYS.triage]);
        if (!filled.ok) return failWith("Reading event properties failed", filled);
        for (const issue of filled.value) await rebuildEventRow(ports, issue, config, seenClusters, seenEvents, counts);
        cursor = r.value.nextPageToken;
      } while (cursor !== undefined);
      if (selector !== undefined) break;
    }
    const { cursor: _y, ...rest } = rec;
    void _y;
    rec = { ...rest, ...(selector !== undefined ? { selector } : {}), phase: "orphans" };
    await save({});
  }

  // Phase 3: orphans and expired job records.
  if (rec.phase === "orphans") {
    // Rows written after this re-sync started (an intake commit or Split running in a resolver
    // while the rebuild ran, possibly not yet visible to JQL, SPIKE-E1) are not orphans.
    const startedSec = rec.startedAt !== undefined ? Math.floor(Date.parse(rec.startedAt) / 1000) : Number.POSITIVE_INFINITY;
    const ev = await loadProjectEvents(storage, projectKey);
    if (!ev.ok) return failWith("Reading the event index failed", ev);
    for (const e of ev.value) if (isOrphan(e.key, e.value.indexedAt, seenEvents, startedSec)) {
      await storage.deleteEntity("event", e.key);
      bump(counts, "orphanEventsDeleted");
    }
    const cl = await loadProjectClusters(storage, projectKey);
    if (!cl.ok) return failWith("Reading the cluster index failed", cl);
    for (const c of cl.value) if (isOrphan(c.key, c.value.updatedAt, seenClusters, startedSec)) {
      await storage.deleteEntity("cluster", c.key);
      bump(counts, "orphanClustersDeleted");
    }
    bump(counts, "expiredJobsDeleted", await purgeOldJobs(ports));
    await storage.delete(KvsKeys.board(projectKey));
    rec = { ...rec, phase: "recluster" };
    await save({});
  }

  // Phase 4: the normal recluster over every bucket.
  if (rec.phase === "recluster") {
    if (outOfBudget()) return continueLater("recluster", undefined);
    const r = await reclusterProject(ports, { projectKey });
    if (!r.ok) return failWith("Re-clustering failed", r);
    counts["proposalsRecomputed"] = r.value.events;
    await save({ phase: "done", state: "done", finishedAt: clock.nowIso(), message: `Re-sync finished: ${counts["events"] ?? 0} events, ${counts["clusters"] ?? 0} clusters.` });
  }
  return ok({ state: rec.state, phase: rec.phase ?? "done", continued: false, counts: { ...counts } });
}

/**
 * An index row is an orphan when the rebuild did not see its issue AND it was last written no
 * later than the second this re-sync started (epoch seconds). Rows written afterwards belong to
 * concurrent resolver writes and are kept; the next re-sync re-checks them.
 */
export function isOrphan(key: string, writtenAtSec: number, seen: ReadonlySet<string>, startedSec: number): boolean {
  if (seen.has(key)) return false;
  return !(Number.isFinite(writtenAtSec) && writtenAtSec > startedSec);
}

async function rebuildClusterRow(ports: Ports, issue: JiraIssue): Promise<"ok" | "invalid"> {
  const prop = parseTtCluster(issue.properties[PROPERTY_KEYS.cluster]);
  if (!prop.ok) return "invalid";
  const existing = await ports.storage.getEntity("cluster", issue.id);
  const prev = existing.ok ? existing.value : undefined;
  // A user-chosen name (Split `name`) lives in the issue summary; recover it from Jira (D3).
  const fromSummary = displayNameFromSummary(issue.summary);
  const named = prev?.profile ?? (fromSummary !== null && fromSummary !== prop.value.nameDet ? { v: 0, displayName: fromSummary } : null);
  const row: ClusterRow = {
    issueKey: issue.key,
    projectKey: issue.projectKey,
    bucket: prop.value.bucket,
    nameDet: prop.value.nameDet,
    memberCount: prev?.memberCount ?? 0,
    firstBuild: prev?.firstBuild ?? "",
    ownerRule: prev?.ownerRule ?? "",
    status: prev?.status ?? "active",
    profile: named,
    onset: prev?.onset ?? null,
    coverage: prev?.coverage ?? null,
    updatedAt: nowEpochSeconds(ports.clock),
    synthetic: issue.labels.includes(LABELS.synthetic),
  };
  const w = await ports.storage.putEntity("cluster", issue.id, row);
  return w.ok ? "ok" : "invalid";
}

/** `[SYNTHETIC] Cluster: <name>` → `<name>`; null when the summary is not in that form. */
export function displayNameFromSummary(summary: string): string | null {
  const m = /^(?:\[SYNTHETIC\]\s+)?Cluster:\s+(.+)$/.exec(summary.trim());
  return m?.[1] !== undefined ? m[1].trim() : null;
}

async function rebuildEventRow(ports: Ports, issue: JiraIssue, config: ProjectConfig, clusters: ReadonlySet<string>, seen: Set<string>, counts: Record<string, number>): Promise<void> {
  const raw = issue.properties[PROPERTY_KEYS.event];
  if (raw === undefined) {
    bump(counts, "withoutSignalData");
    return;
  }
  const v = verifyEvent(raw, config);
  if (!v.ok) {
    bump(counts, "invalidEvents");
    return;
  }
  if (v.value.tampered) bump(counts, "recomputed");
  const triage = triageOf(issue);
  const { chosen } = membershipFromLinks(issue.id, issue.links ?? [], (id) => clusters.has(id), triage);
  const membership = chosen === null ? UNASSIGNED : { status: "accepted" as const, clusterId: chosen.clusterId, proposal: { kind: "none" as const }, nnDist: -1 };
  const w = await indexEvent(ports.storage, ports.clock, { id: issue.id, key: issue.key, projectKey: issue.projectKey }, v.value, membership);
  if (!w.ok) {
    bump(counts, "indexWriteFailures");
    return;
  }
  seen.add(issue.id);
  bump(counts, "events");
  if (chosen !== null) bump(counts, "accepted");
}

async function purgeOldJobs(ports: Ports): Promise<number> {
  const r = await ports.storage.queryByPrefix("job:", { limit: 100 });
  if (!r.ok) return 0;
  let n = 0;
  for (const kv of r.value.items) {
    const v = kv.value;
    if (!isRecord(v)) continue;
    const finished = v["state"] === "done" || v["state"] === "failed";
    const t = typeof v["updatedAt"] === "string" ? Date.parse(v["updatedAt"]) : NaN;
    if (finished && Number.isFinite(t) && ports.clock.nowMs() - t > JOB_RETENTION_MS) {
      await ports.storage.delete(kv.key);
      n++;
    }
  }
  return n;
}


