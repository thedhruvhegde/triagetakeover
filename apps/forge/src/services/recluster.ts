/**
 * The `tt-recluster` work (ARCHITECTURE §8): runs in the queue consumer, asApp, no TWG.
 *
 * Per bucket in scope: every non-accepted event is re-derived (kNN against accepted members,
 * then average-linkage HAC over the rest, §5.8 step 3); proposals go to the index only, never
 * to Jira. `nnDist` is recomputed for every row. Then each cluster's cache (profile, medoid,
 * signature, builds), member count, first build and owner rule text are refreshed, and the
 * board cache is invalidated. Accepted membership is never changed here.
 */
import {
  assignEvent,

  distance,
  proposeClusters,
  type ClusterInput,
} from "@tt/engine";
import { nowEpochSeconds } from "../ports/clock";
import type { Ports } from "../ports/index";
import type { ClusterRow, EventRow } from "../ports/entities";
import type { ReclusterJob } from "../ports/queue";
import { ok, type PortResult } from "../ports/result";
import { currentClusterCache } from "./clusters";
import { buildComparator, clusterParamsOf, loadProjectConfig } from "./config";
import {
  acceptedCounts,
  clusterIndex,
  clusterInputOf,
  encodeProposal,
  invalidateBoard,
  loadProjectClusters,
  loadProjectEvents,
  type Keyed,
  type Proposal,
} from "./index-store";
import { ownerHint } from "./route";

export interface ReclusterCounts {
  readonly buckets: number;
  readonly events: number;
  readonly suggested: number;
  readonly grouped: number;
  readonly novel: number;
  readonly rowsWritten: number;
  readonly clustersUpdated: number;
}

function sameRow(a: EventRow, b: EventRow): boolean {
  return a.status === b.status && a.clusterId === b.clusterId && a.proposalId === b.proposalId && Math.abs(a.nnDist - b.nnDist) < 1e-9;
}

/** Nearest accepted neighbour distance within the bucket (excluding the event); -1 when none or +∞. */
function nnDistOf(e: ClusterInput, accepted: readonly ClusterInput[], params: ReturnType<typeof clusterParamsOf>): number {
  let best = Infinity;
  for (const a of accepted) if (a.key !== e.key) best = Math.min(best, distance(e, a, params.distance));
  return Number.isFinite(best) ? best : -1;
}

export async function reclusterProject(ports: Ports, job: Pick<ReclusterJob, "projectKey" | "bucket">): Promise<PortResult<ReclusterCounts>> {
  const { storage, clock } = ports;
  const jira = ports.jira.asApp();
  const { config } = await loadProjectConfig(storage, job.projectKey);
  const params = clusterParamsOf(config);
  const clusterRows = await loadProjectClusters(storage, job.projectKey);
  if (!clusterRows.ok) return clusterRows;
  const events = await loadProjectEvents(storage, job.projectKey);
  if (!events.ok) return events;
  const idx = clusterIndex(clusterRows.value);
  const byKey = new Map(events.value.map((e) => [e.value.issueKey, e]));
  const scope = events.value.filter((e) => job.bucket === undefined || e.value.bucket === job.bucket);
  const inputs = scope.map((e) => clusterInputOf(e.value, (id) => idx.keyOf(id)));
  const proposal = proposeClusters(inputs, params);

  const next = new Map<string, { proposal: Proposal; status: EventRow["status"] }>();
  for (const a of proposal.assigned) next.set(a.key, { status: "proposed", proposal: { kind: "suggest", clusterId: idx.idByKey.get(a.result.clusterKey) ?? "" } });
  for (const p of proposal.proposed) for (const m of p.members) next.set(m, { status: "proposed", proposal: { kind: "group", groupId: p.id } });
  const acceptedByBucket = new Map<string, ClusterInput[]>();
  for (const i of inputs) if (i.state === "accepted") acceptedByBucket.set(`${i.bucket.type}|${i.bucket.variant}`, [...(acceptedByBucket.get(`${i.bucket.type}|${i.bucket.variant}`) ?? []), i]);
  for (const key of proposal.novel) {
    const me = inputs.find((i) => i.key === key);
    if (me === undefined) continue;
    const a = assignEvent(me, acceptedByBucket.get(`${me.bucket.type}|${me.bucket.variant}`) ?? [], params);
    next.set(key, { status: "novel", proposal: a.kind === "novel" ? { kind: "novel", nearestClusterId: idx.idByKey.get(a.nearestClusterKey) ?? "" } : { kind: "first-of-kind" } });
  }

  let rowsWritten = 0;
  for (const input of inputs) {
    const entry = byKey.get(input.key);
    if (entry === undefined) continue;
    const row = entry.value;
    const nn = nnDistOf(input, acceptedByBucket.get(`${input.bucket.type}|${input.bucket.variant}`) ?? [], params);
    let updated: EventRow;
    if (input.state === "accepted") updated = { ...row, nnDist: nn };
    else {
      const n = next.get(input.key) ?? { status: "unassigned" as const, proposal: { kind: "none" as const } };
      updated = { ...row, status: n.status, clusterId: "", proposalId: encodeProposal(n.proposal), nnDist: nn };
    }
    if (!sameRow(row, updated)) {
      const w = await storage.putEntity("event", entry.key, { ...updated, indexedAt: nowEpochSeconds(clock) });
      if (!w.ok) return w;
      rowsWritten++;
    }
  }

  // Cluster rows: counts, caches, first build, owner rule.
  const fresh = await loadProjectEvents(storage, job.projectKey);
  if (!fresh.ok) return fresh;
  const counts = acceptedCounts(fresh.value);
  const compare = buildComparator(config);
  let clustersUpdated = 0;
  for (const c of clusterRows.value) {
    if (job.bucket !== undefined && c.value.bucket !== job.bucket) continue;
    const members = fresh.value.filter((e) => e.value.status === "accepted" && e.value.clusterId === c.key);
    const r = await refreshClusterRow(ports, c, members, (id) => idx.keyOf(id), compare, counts.get(c.key) ?? 0, config);
    if (!r.ok) return r;
    if (r.value) clustersUpdated++;
  }
  await invalidateBoard(storage, job.projectKey);
  const buckets = new Set(scope.map((e) => e.value.bucket)).size;
  return ok({ buckets, events: scope.length, suggested: proposal.assigned.length, grouped: proposal.proposed.reduce((s, p) => s + p.members.length, 0), novel: proposal.novel.length, rowsWritten, clustersUpdated });

  async function refreshClusterRow(
    p: Ports,
    c: Keyed<ClusterRow>,
    members: readonly Keyed<EventRow>[],
    keyOf: (id: string) => string | undefined,
    cmp: (a: string, b: string) => number,
    memberCount: number,
    cfg: typeof config,
  ): Promise<PortResult<boolean>> {
    const cache = members.length > 0 ? await currentClusterCache(jira, c.value, members, keyOf, cmp) : ok({ cache: null, fresh: false });
    if (!cache.ok) return cache;
    const builds = [...new Set(members.map((m) => m.value.build))].sort(cmp);
    const owner = ownerHint(cfg, c.value.bucket);
    const row: ClusterRow = {
      ...c.value,
      memberCount,
      status: memberCount > 0 ? "active" : c.value.status === "retired" ? "retired" : "empty",
      firstBuild: builds[0] ?? "",
      ownerRule: owner?.ruleText ?? "",
      profile: cache.value.cache ?? c.value.profile,
    };
    const changed = JSON.stringify(row) !== JSON.stringify(c.value);
    if (!changed) return ok(false);
    const w = await p.storage.putEntity("cluster", c.key, { ...row, updatedAt: nowEpochSeconds(p.clock) });
    return w.ok ? ok(true) : w;
  }
}


