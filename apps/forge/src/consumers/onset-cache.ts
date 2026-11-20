/**
 * Onset cache (ARCHITECTURE §7.1 "cluster caches", §8 "onset scan per cluster"): after a
 * recluster, the consumer stores a compact onset summary on every cluster row with accepted
 * members, computed with the same service code as the board (Holm across the project's
 * clusters). The board still computes onset per request (services deviation P1: correct after
 * any write without waiting for the queue); this cache is for readers that want the
 * precomputed screen, and it is cleared on clusters that lost all members.
 *
 * Idempotent: a row is written only when its summary changed.
 */
import { nowEpochSeconds } from "../ports/clock";
import type { DriveSessionRow, EventRow } from "../ports/entities";
import type { Ports } from "../ports/index";
import { ok, type PortResult } from "../ports/result";
import type { OnsetView } from "../contract/ui-api";
import { buildComparator, loadProjectConfig } from "../services/config";
import { clusterIndex, loadDriveSessions, loadProjectClusters, loadProjectEvents, type Keyed } from "../services/index-store";
import { onsetViews, sessionsOf, type OnsetSubject } from "../services/onset";

/** What is cached in `cluster.onset` (no evidence URLs, no timestamps: the row's updatedAt says when). */
export interface OnsetCache {
  readonly v: 1;
  readonly verdict: OnsetView["verdict"];
  readonly onsetBuild: string | null;
  readonly k1: number;
  readonly e1Km: number;
  readonly k2: number;
  readonly e2Km: number;
  readonly pRaw: number | null;
  readonly pScan: number | null;
  readonly pHolm: number | null;
  readonly holmFamilySize: number;
  readonly members: number;
  readonly headline: string;
}

export function onsetCacheOf(view: OnsetView, members: number): OnsetCache {
  return {
    v: 1,
    verdict: view.verdict,
    onsetBuild: view.onsetBuild,
    k1: view.k1,
    e1Km: view.e1Km,
    k2: view.k2,
    e2Km: view.e2Km,
    pRaw: view.pRaw,
    pScan: view.pScan,
    pHolm: view.pHolm,
    holmFamilySize: view.holmFamilySize,
    members,
    headline: view.headline,
  };
}

/** Recomputes and stores the onset cache of every cluster row of the project. Returns rows written. */
export async function refreshOnsetCaches(ports: Ports, projectKey: string): Promise<PortResult<number>> {
  const { storage, clock } = ports;
  const { config } = await loadProjectConfig(storage, projectKey);
  const clusters = await loadProjectClusters(storage, projectKey);
  if (!clusters.ok) return clusters;
  const events = await loadProjectEvents(storage, projectKey);
  if (!events.ok) return events;
  const index = clusterIndex(clusters.value);
  const membersOf = new Map<string, Keyed<EventRow>[]>();
  for (const e of events.value) {
    if (e.value.status !== "accepted" || !index.byId.has(e.value.clusterId)) continue;
    membersOf.set(e.value.clusterId, [...(membersOf.get(e.value.clusterId) ?? []), e]);
  }
  const active = clusters.value.filter((c) => (membersOf.get(c.key)?.length ?? 0) > 0);
  const sessionsByVariant = new Map<string, DriveSessionRow[]>();
  for (const v of new Set(active.map((c) => c.value.bucket.split("|")[1] ?? ""))) {
    const s = await loadDriveSessions(storage, v);
    if (!s.ok) return s;
    sessionsByVariant.set(v, sessionsOf(s.value));
  }
  const subjects: OnsetSubject[] = active.map((c) => ({ clusterId: c.key, clusterKey: c.value.issueKey, variant: c.value.bucket.split("|")[1] ?? "", members: membersOf.get(c.key) ?? [] }));
  const views = onsetViews(subjects, sessionsByVariant, buildComparator(config));
  let written = 0;
  for (const c of clusters.value) {
    const view = views.get(c.key);
    const next = view === undefined ? null : onsetCacheOf(view, membersOf.get(c.key)?.length ?? 0);
    if (JSON.stringify(next) === JSON.stringify(c.value.onset ?? null)) continue;
    const w = await storage.putEntity("cluster", c.key, { ...c.value, onset: next, updatedAt: nowEpochSeconds(clock) });
    if (!w.ok) return w;
    written++;
  }
  return ok(written);
}
