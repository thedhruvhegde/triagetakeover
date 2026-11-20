/**
 * The cluster board (PRD US-12, US-14, US-17) and the project-level reads the Rovo actions
 * share: novel since last triage, build regression check, coverage gaps.
 *
 * Index-derived data is returned only after an asUser Browse check (§14). Coverage is computed
 * per request with the caller's own scenario-test search, so nobody sees test keys they could
 * not see in Jira. The board is computed from the index rows on every request (§7.4's
 * `board:` cache key is invalidated by writes but not populated; SPIKE-P1 decides whether the
 * cache is needed).
 */
import {
  clusterNameFor,
  distance,
  listCoverageGaps,
  type ConditionSignature,
} from "@tt/engine";
import type {
  BoardClusterRow,
  BoardView,
  ClusterRef,
  CoverageView,
  NovelQueueItem,
  OnsetView,
  ProposedGroup,
  ResyncStatus,
} from "../contract/ui-api";
import { NOT_A_SAFETY_TOOL } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import type { ClusterRow, DriveSessionRow, EventRow } from "../ports/entities";
import { KvsKeys } from "../ports/storage";
import { requireBrowse, userPort } from "./auth";
import { currentClusterCache, memberInputs, type ClusterCache } from "./clusters";
import { buildComparator, clusterParamsOf, loadProjectConfig, type ProjectConfig } from "./config";
import { coverageView, gapGridView, loadScenarioTests, signatureView, type ScenarioTestSet } from "./coverage";
import { done, fail, fromPortError, type ServiceResult } from "./errors";
import { confidence, dedupeEvidence, finiteOrNull, issueEvidence } from "./evidence";
import {
  clusterIndex,
  clusterRefOf,
  compareKeys,
  decodeProposal,
  eventSummaryOfRow,
  loadDriveSessions,
  loadProjectClusters,
  loadProjectEvents,
  rowChips,
  type ClusterIndex,
  type Keyed,
} from "./index-store";
import { ONSET_CAVEATS, onsetViews, sessionsOf, type OnsetSubject } from "./onset";
import { ownerHint } from "./route";
import { readResyncStatus } from "./resync-state";
import { isRecord } from "@tt/engine";

// ------------------------------------------------------------------ snapshot

export interface ClusterSnapshot {
  readonly id: string;
  readonly row: ClusterRow;
  readonly ref: ClusterRef;
  readonly members: readonly Keyed<EventRow>[];
  readonly cache: ClusterCache;
  readonly onset: OnsetView;
}

export interface ProjectSnapshot {
  readonly projectKey: string;
  readonly config: ProjectConfig;
  readonly clusters: readonly ClusterSnapshot[];
  readonly index: ClusterIndex;
  readonly events: readonly Keyed<EventRow>[];
  readonly triaged: { readonly at: string; readonly by: string } | null;
  readonly holmFamilySize: number;
  readonly warnings: readonly string[];
}

export async function readTriagedMark(ctx: ServiceContext, projectKey: string): Promise<{ at: string; by: string } | null> {
  const r = await ctx.ports.storage.get(KvsKeys.triaged(projectKey));
  if (!r.ok || !isRecord(r.value) || typeof r.value["at"] !== "string" || !Number.isFinite(Date.parse(r.value["at"]))) return null;
  return { at: r.value["at"], by: typeof r.value["by"] === "string" ? r.value["by"] : "" };
}

/** Index rows + cluster caches + onset (Holm across every cluster with members). */
export async function loadProjectSnapshot(ctx: ServiceContext, projectKey: string): Promise<ServiceResult<ProjectSnapshot>> {
  const browse = await requireBrowse(ctx, projectKey);
  if (!browse.ok) return browse;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { config, warnings } = await loadProjectConfig(ctx.ports.storage, projectKey);
  const clusterRows = await loadProjectClusters(ctx.ports.storage, projectKey);
  if (!clusterRows.ok) return fromPortError(clusterRows.error, "Reading the cluster index");
  const events = await loadProjectEvents(ctx.ports.storage, projectKey);
  if (!events.ok) return fromPortError(events.error, "Reading the event index");
  const index = clusterIndex(clusterRows.value);
  const membersOf = new Map<string, Keyed<EventRow>[]>();
  for (const e of events.value) {
    if (e.value.status !== "accepted" || !index.byId.has(e.value.clusterId)) continue;
    const list = membersOf.get(e.value.clusterId) ?? [];
    list.push(e);
    membersOf.set(e.value.clusterId, list);
  }
  const compare = buildComparator(config);
  const active = clusterRows.value.filter((c) => (membersOf.get(c.key)?.length ?? 0) > 0);
  const variants = [...new Set(active.map((c) => c.value.bucket.split("|")[1] ?? ""))];
  const sessionsByVariant = new Map<string, DriveSessionRow[]>();
  for (const v of variants) {
    const s = await loadDriveSessions(ctx.ports.storage, v);
    if (!s.ok) return fromPortError(s.error, "Reading drive sessions");
    sessionsByVariant.set(v, sessionsOf(s.value));
  }
  const subjects: OnsetSubject[] = active.map((c) => ({ clusterId: c.key, clusterKey: c.value.issueKey, variant: c.value.bucket.split("|")[1] ?? "", members: membersOf.get(c.key) ?? [] }));
  const onset = onsetViews(subjects, sessionsByVariant, compare);
  const clusters: ClusterSnapshot[] = [];
  for (const c of active) {
    const members = membersOf.get(c.key) ?? [];
    const cache = await currentClusterCache(jira.value, c.value, members, (id) => index.keyOf(id), compare);
    if (!cache.ok) return fromPortError(cache.error, "Reading member events");
    const o = onset.get(c.key);
    if (o === undefined) continue;
    clusters.push({ id: c.key, row: c.value, ref: clusterRefOf(c.key, c.value, members.length), members, cache: cache.value.cache, onset: o });
  }
  const triaged = await readTriagedMark(ctx, projectKey);
  const holmFamilySize = clusters.filter((c) => c.onset.pScan !== null).length;
  return done({ projectKey, config, clusters, index, events: events.value, triaged, holmFamilySize, warnings }, warnings);
}

// ------------------------------------------------------------------ board

function verdictRank(o: OnsetView): number {
  return o.verdict === "regression-likely" ? 0 : o.verdict === "inconclusive" ? 1 : o.verdict === "no-evidence" ? 2 : 3;
}

function novelItems(s: ProjectSnapshot): NovelQueueItem[] {
  const tau = s.config.tau;
  return s.events
    .filter((e) => e.value.status === "novel")
    .map((e): NovelQueueItem => {
      const p = decodeProposal(e.value.proposalId);
      const nearestId = p.kind === "novel" ? p.nearestClusterId : undefined;
      const nearestRow = nearestId === undefined ? undefined : s.index.byId.get(nearestId);
      const firstOfKind = p.kind === "first-of-kind";
      const dStar = finiteOrNull(e.value.nnDist >= 0 ? e.value.nnDist : null);
      const message = firstOfKind ? "First of its kind in this bucket" : `Proposed new cluster: nearest ${nearestRow?.issueKey ?? "cluster"} at d=${dStar?.toFixed(2) ?? "∞"} > τ=${tau.toFixed(2)}`;
      return {
        event: eventSummaryOfRow(e.key, e.value),
        reason: firstOfKind ? "first-of-kind" : "exceeds-tau",
        ...(nearestRow !== undefined && nearestId !== undefined ? { nearestCluster: clusterRefOf(nearestId, nearestRow) } : {}),
        dStar,
        tau,
        message,
        evidence: [issueEvidence(e.value.issueKey, "Novel event"), ...(nearestRow !== undefined ? [issueEvidence(nearestRow.issueKey, "Nearest cluster")] : [])],
      };
    })
    .sort((a, b) => (a.event.occurredAt < b.event.occurredAt ? 1 : a.event.occurredAt > b.event.occurredAt ? -1 : compareKeys(a.event.key, b.event.key)));
}

function proposedGroups(s: ProjectSnapshot): ProposedGroup[] {
  const groups = new Map<string, Keyed<EventRow>[]>();
  for (const e of s.events) {
    if (e.value.status !== "proposed") continue;
    const p = decodeProposal(e.value.proposalId);
    if (p.kind !== "group") continue;
    const list = groups.get(p.groupId) ?? [];
    list.push(e);
    groups.set(p.groupId, list);
  }
  const tau = s.config.tau;
  const params = clusterParamsOf(s.config);
  return [...groups.entries()]
    .sort(([a], [b]) => compareKeys(a, b))
    .map(([id, rows]): ProposedGroup => {
      const first = rows[0]?.value;
      const bucket = first?.bucket ?? "";
      const [type, variant] = bucket.split("|");
      const inputs = memberInputs(rows, (cid) => s.index.keyOf(cid));
      let sum = 0;
      let n = 0;
      for (let i = 0; i < inputs.length; i++) for (let j = i + 1; j < inputs.length; j++) {
        sum += distance(inputs[i] as (typeof inputs)[number], inputs[j] as (typeof inputs)[number], params.distance);
        n++;
      }
      const mean = n > 0 ? sum / n : 0;
      return {
        id,
        bucket,
        name: clusterNameFor({ type: (type ?? "unknown") as never, variant: variant ?? "" }, rows.map((r) => ({ chips: rowChips(r.value) }))),
        members: rows.map((r) => r.value.issueKey),
        why: [`Grouped by average-linkage clustering within bucket ${bucket.replace("|", " x ")}: mean pairwise d=${Number.isFinite(mean) ? mean.toFixed(2) : "∞"} ≤ τ=${tau.toFixed(2)}`, "Not linked: Split one of them to create the cluster, then Accept the others."],
        evidence: rows.map((r) => issueEvidence(r.value.issueKey, "Proposed member")),
        confidence: confidence(1 - mean / tau, "clamp(1 − mean pairwise distance / τ, 0, 1) over the proposed members", { meanDistance: mean, tau }),
      };
    });
}

function pendingFor(s: ProjectSnapshot, clusterId: string): string[] {
  return s.events
    .filter((e) => e.value.status === "proposed" && decodeProposal(e.value.proposalId).kind === "suggest" && (decodeProposal(e.value.proposalId) as { clusterId: string }).clusterId === clusterId)
    .map((e) => e.value.issueKey);
}

function rowFor(s: ProjectSnapshot, c: ClusterSnapshot, coverage: CoverageView, markSec: number | null): BoardClusterRow {
  const pending = pendingFor(s, c.id);
  const pendingRows = s.events.filter((e) => pending.includes(e.value.issueKey));
  const newSince = markSec === null ? 0 : [...c.members, ...pendingRows].filter((m) => m.value.occurredAt > markSec).length;
  const [type, variant] = c.row.bucket.split("|");
  return {
    cluster: c.ref,
    type: (type ?? "unknown") as BoardClusterRow["type"],
    variant: variant ?? "",
    conditions: signatureView(c.cache.signature).chips,
    buildsSeen: c.cache.builds,
    acceptedCount: c.members.length,
    newSinceTriage: newSince,
    pendingSuggestions: pending,
    onset: c.onset,
    coverage,
    owner: s.config.routing.length > 0 ? ownerHint(s.config, c.row.bucket) : null,
    status: c.row.status,
    medoidKey: c.cache.medoidKey,
  };
}

export async function getBoard(ctx: ServiceContext, projectKey: string): Promise<ServiceResult<BoardView>> {
  const snap = await loadProjectSnapshot(ctx, projectKey);
  if (!snap.ok) return snap;
  const s = snap.value.value;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const tests = await loadScenarioTests(jira.value, s.config);
  const markSec = s.triaged === null ? null : Math.floor(Date.parse(s.triaged.at) / 1000);
  const rows = s.clusters
    .map((c) => rowFor(s, c, coverageView(c.cache.signature, tests), markSec))
    .sort((a, b) => verdictRank(a.onset) - verdictRank(b.onset) || (a.onset.pHolm ?? 1) - (b.onset.pHolm ?? 1) || b.acceptedCount - a.acceptedCount || compareKeys(a.cluster.key, b.cluster.key));
  const count = (st: EventRow["status"]): number => s.events.filter((e) => e.value.status === st).length;
  const resync: ResyncStatus = await readResyncStatus(ctx.ports.storage, projectKey);
  const view: BoardView = {
    projectKey,
    empty: s.events.length === 0,
    clusters: rows,
    novel: novelItems(s),
    proposedGroups: proposedGroups(s),
    unassignedCount: count("unassigned"),
    sinceLastTriage: {
      at: s.triaged?.at ?? null,
      by: s.triaged?.by ?? null,
      newEvents: markSec === null ? 0 : s.events.filter((e) => e.value.occurredAt > markSec).length,
      source: s.triaged === null ? "none" : "mark-triaged",
    },
    gapGrid: gapGridView(s.clusters.map((c) => ({ signature: c.cache.signature, events: c.members.length })), tests),
    scenarioJql: tests.jql,
    scenarioCount: tests.tests.length,
    holmFamilySize: s.holmFamilySize,
    resync,
    totals: { events: s.events.length, accepted: count("accepted"), proposed: count("proposed"), novel: count("novel"), clusters: s.clusters.length },
    synthetic: s.events.some((e) => e.value.synthetic),
    caveats: [...ONSET_CAVEATS, `p-values are a screening signal: Holm correction runs across the ${s.holmFamilySize} cluster(s) with a test on this board.`],
    disclaimer: NOT_A_SAFETY_TOOL,
    builtAt: ctx.ports.clock.nowIso(),
  };
  const warnings = [...snap.value.warnings];
  if (tests.state === "jql-error") warnings.push(tests.message ?? "The scenario JQL was rejected.");
  return done(view, warnings);
}

/** "Mark triaged" (US-12 AC3): a team-wide timestamp. */
export async function markTriaged(ctx: ServiceContext, projectKey: string): Promise<ServiceResult<{ at: string; by: string }>> {
  const browse = await requireBrowse(ctx, projectKey);
  if (!browse.ok) return browse;
  const by = ctx.accountId ?? "";
  const at = ctx.ports.clock.nowIso();
  const w = await ctx.ports.storage.set(KvsKeys.triaged(projectKey), { at, by });
  if (!w.ok) return fromPortError(w.error, "Saving the triage mark");
  await ctx.ports.storage.delete(KvsKeys.board(projectKey));
  return done({ at, by });
}

// ------------------------------------------------------------------ action-shaped reads

export interface NovelSince {
  readonly since: string;
  readonly sinceSource: "mark-triaged" | "input" | "7d-default";
  readonly events: readonly NovelQueueItem[];
}

/** `list-novel-since`: novel events that occurred after `since` (default: last Mark triaged, else 7 days). */
export async function listNovelSince(ctx: ServiceContext, projectKey: string, opts: { since?: string; limit: number }): Promise<ServiceResult<NovelSince>> {
  const snap = await loadProjectSnapshot(ctx, projectKey);
  if (!snap.ok) return snap;
  const s = snap.value.value;
  const source: NovelSince["sinceSource"] = opts.since !== undefined ? "input" : s.triaged !== null ? "mark-triaged" : "7d-default";
  const since = opts.since ?? s.triaged?.at ?? new Date(ctx.ports.clock.nowMs() - 7 * 86_400_000).toISOString();
  const sinceSec = Math.floor(Date.parse(since) / 1000);
  const events = novelItems(s).filter((n) => Date.parse(n.event.occurredAt) / 1000 > sinceSec).slice(0, Math.max(1, Math.min(25, opts.limit)));
  return done({ since, sinceSource: source, events }, snap.value.warnings);
}

/** `build-regression-check` / board filter: one cluster, or all clusters whose onset build is `build`. */
export async function buildRegressionCheck(ctx: ServiceContext, projectKey: string, opts: { clusterKey?: string; build?: string }): Promise<ServiceResult<{ scope: "cluster" | "build"; results: { cluster: ClusterRef; onset: OnsetView }[]; holmFamilySize: number }>> {
  if (opts.clusterKey === undefined && opts.build === undefined) return fail("invalid-input", "Give a cluster key or a build.");
  const snap = await loadProjectSnapshot(ctx, projectKey);
  if (!snap.ok) return snap;
  const s = snap.value.value;
  const pick = opts.clusterKey !== undefined ? s.clusters.filter((c) => c.ref.key === opts.clusterKey) : s.clusters.filter((c) => c.onset.onsetBuild === opts.build);
  if (opts.clusterKey !== undefined && pick.length === 0) return fail("invalid-input", `${opts.clusterKey} is not a cluster with accepted members in ${projectKey}.`);
  const results = pick
    .map((c) => ({ cluster: c.ref, onset: c.onset }))
    .sort((a, b) => (a.onset.pHolm ?? 2) - (b.onset.pHolm ?? 2) || compareKeys(a.cluster.key, b.cluster.key))
    .slice(0, 25);
  return done({ scope: opts.clusterKey !== undefined ? "cluster" : "build", results, holmFamilySize: s.holmFamilySize }, snap.value.warnings);
}

export interface CoverageGapView {
  readonly cluster: ClusterRef;
  readonly signature: CoverageView["signature"];
  readonly verdict: "uncovered" | "partial";
  readonly missingDims: readonly string[];
  readonly bestTest?: string;
  readonly text: string;
  readonly evidence: CoverageView["evidence"];
}

/** `list-coverage-gaps`: uncovered first, then partial (engine ranking). */
export async function listCoverageGapsFor(ctx: ServiceContext, projectKey: string, opts: { minEvents: number; includePartial: boolean; limit: number }): Promise<ServiceResult<{ scenarioJql: string; scenarioCount: number; state: CoverageView["state"]; gaps: CoverageGapView[] }>> {
  const snap = await loadProjectSnapshot(ctx, projectKey);
  if (!snap.ok) return snap;
  const s = snap.value.value;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const tests: ScenarioTestSet = await loadScenarioTests(jira.value, s.config);
  const byKey = new Map(s.clusters.map((c) => [c.ref.key, c]));
  const gaps = tests.state !== "ok" ? [] : listCoverageGaps(s.clusters.map((c) => ({ key: c.ref.key, signature: c.cache.signature as ConditionSignature, events: c.members.length })), tests.tests, opts);
  return done(
    {
      scenarioJql: tests.jql,
      scenarioCount: tests.tests.length,
      state: tests.state,
      gaps: gaps.flatMap((g) => {
        const c = byKey.get(g.clusterKey);
        if (c === undefined) return [];
        const view = coverageView(c.cache.signature, tests);
        return [{ cluster: c.ref, signature: view.signature, verdict: g.verdict, missingDims: g.missing, ...(g.bestTest !== undefined ? { bestTest: g.bestTest } : {}), text: g.text, evidence: dedupeEvidence([issueEvidence(c.ref.key, "Cluster"), ...view.evidence]) }];
      }),
    },
    snap.value.warnings,
  );
}

