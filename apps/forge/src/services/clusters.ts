/**
 * Cluster issues and their derived caches.
 *
 * - A cluster is a Jira issue labelled `tt-cluster` with a `tt.cluster` property (§6.1, US-09
 *   AC6). Its `cluster` entity row caches profile, medoid, condition signature and onset.
 * - Membership is a Jira link plus `tt.triage` on the event (truth), mirrored in the index.
 * - {@link createClusterIssue} and {@link linkMember} are the single write path used by Split
 *   (asUser, resolver) and by the demo seed's engine-proposal step (asApp, consumer, §9 S6).
 */
import {
  PARAMS_VERSION,
  TRIAGE_HISTORY_MAX,
  bucketId,
  clusterNameFor,
  conditionSignature,
  distance,
  featureProfile,
  isRecord,
  majorityChips,
  medoidOf,
  parseTtEvent,
  type BucketKey,
  type ClusterInput,
  type ConditionChip,
  type ConditionSignature,
  type FeatureFlags,
  type FeatureVector,
  type TtEvent,
  type TtTriage,
} from "@tt/engine";
import type { Clock } from "../ports/clock";
import { nowEpochSeconds } from "../ports/clock";
import type { ClusterRow, EventRow } from "../ports/entities";
import type { IssueRef, JiraPort } from "../ports/jira";
import { LABELS, PROPERTY_KEYS, SYNTHETIC_SUMMARY_PREFIX } from "../ports/properties";
import { ok, type PortResult } from "../ports/result";
import type { StoragePort } from "../ports/storage";
import { readIssuesByKey } from "./jira-io";
import { clusterInputOf, compareKeys, eventRowOf, UNASSIGNED, withMembership, type IssueIdentity, type Keyed } from "./index-store";

// ------------------------------------------------------------------ cache

/** JSON cached in `cluster.profile` (rebuilt by recluster; validated on read). */
export interface ClusterCache {
  readonly v: 1;
  /** Sorted accepted member keys the cache was computed from. */
  readonly memberKeys: readonly string[];
  readonly profile: FeatureVector;
  readonly flags: FeatureFlags;
  readonly medoidKey: string | null;
  readonly signature: ConditionSignature;
  readonly builds: readonly string[];
  /** User-chosen name from Split (`create-cluster.name`); absent = deterministic name. */
  readonly displayName?: string;
}

export function parseClusterCache(u: unknown): ClusterCache | null {
  if (!isRecord(u) || u["v"] !== 1 || !Array.isArray(u["memberKeys"]) || !isRecord(u["signature"]) || !isRecord(u["profile"])) return null;
  const sig = u["signature"];
  if (typeof sig["type"] !== "string" || typeof sig["variant"] !== "string" || !Array.isArray(sig["chips"]) || !Array.isArray(sig["odd"])) return null;
  return u as unknown as ClusterCache;
}

/** The user-chosen display name kept in the cache JSON, if any. */
export function storedDisplayName(row: Pick<ClusterRow, "profile">): string | undefined {
  const p = row.profile;
  return isRecord(p) && typeof p["displayName"] === "string" ? p["displayName"] : undefined;
}

/** What the signature needs from a member beyond the row: its ODD tags (from `tt.event.ctx.odd`). */
export interface MemberExtra {
  readonly odd: readonly string[];
  readonly event?: TtEvent;
}

export function computeClusterCache(bucket: BucketKey, members: readonly ClusterInput[], extras: ReadonlyMap<string, MemberExtra>, builds: readonly string[], displayName?: string): ClusterCache {
  const { profile, flags } = featureProfile(members);
  const medoid = medoidOf(members);
  const signature = conditionSignature(
    bucket,
    members.map((m) => ({ chips: m.chips, odd: extras.get(m.key)?.odd ?? [] })),
  );
  return {
    v: 1,
    memberKeys: members.map((m) => m.key).sort(compareKeys),
    profile,
    flags,
    medoidKey: medoid?.key ?? null,
    signature,
    builds,
    ...(displayName !== undefined ? { displayName } : {}),
  };
}

export function bucketOfRow(row: Pick<ClusterRow, "bucket">): BucketKey {
  const [type, variant] = row.bucket.split("|");
  return { type: (type ?? "unknown") as BucketKey["type"], variant: variant ?? "" };
}

/** Reads the members' `tt.event` to get ODD tags (and the events, for stubs). */
export async function readMemberExtras(jira: JiraPort, memberKeys: readonly string[]): Promise<PortResult<Map<string, MemberExtra>>> {
  const r = await readIssuesByKey(jira, memberKeys, [PROPERTY_KEYS.event]);
  if (!r.ok) return r;
  const out = new Map<string, MemberExtra>();
  for (const [key, issue] of r.value) {
    const p = parseTtEvent(issue.properties[PROPERTY_KEYS.event]);
    out.set(key, p.ok ? { odd: p.value.ctx.odd, event: p.value } : { odd: [] });
  }
  return ok(out);
}

/**
 * Current cache for a cluster: reuses the stored one when its member list is unchanged,
 * otherwise recomputes (reading member properties as the given principal).
 */
export async function currentClusterCache(
  jira: JiraPort,
  row: ClusterRow,
  members: readonly Keyed<EventRow>[],
  keyOf: (clusterId: string) => string | undefined,
  buildCompare: (a: string, b: string) => number,
): Promise<PortResult<{ cache: ClusterCache; fresh: boolean }>> {
  const stored = parseClusterCache(row.profile);
  const keys = members.map((m) => m.value.issueKey).sort(compareKeys);
  if (stored !== null && stored.memberKeys.length === keys.length && stored.memberKeys.every((k, i) => k === keys[i])) return ok({ cache: stored, fresh: false });
  const extras = await readMemberExtras(jira, keys);
  if (!extras.ok) return extras;
  const inputs = members.map((m) => clusterInputOf(m.value, keyOf));
  const builds = [...new Set(members.map((m) => m.value.build))].sort(buildCompare);
  const cache = computeClusterCache(bucketOfRow(row), inputs, extras.value, builds, storedDisplayName(row));
  return ok({ cache, fresh: true });
}

// ------------------------------------------------------------------ writes

export interface TriageWrite {
  readonly state: TtTriage["state"];
  readonly clusterKey?: string;
  readonly by: string;
  readonly at: string;
  /** History verb: `accept`, `split`, `undo-accept`, `seed-accept`, ... */
  readonly action: string;
}

/** New `tt.triage` value with the action appended (last {@link TRIAGE_HISTORY_MAX} kept). */
export function nextTriage(prev: TtTriage | null, w: TriageWrite): TtTriage {
  const entry = { action: w.action, by: w.by, at: w.at, ...(w.clusterKey !== undefined ? { clusterKey: w.clusterKey } : {}) };
  const history = [...(prev?.history ?? []), entry].slice(-TRIAGE_HISTORY_MAX);
  return { v: 1, state: w.state, by: w.by, at: w.at, history, ...(w.clusterKey !== undefined && w.state === "accepted" ? { clusterKey: w.clusterKey } : {}) };
}

export interface NewCluster {
  readonly projectKey: string;
  readonly issueType: string;
  readonly bucket: BucketKey;
  /** Chips of the seeding member(s); the deterministic name uses the majority chip. */
  readonly memberChips: readonly (readonly ConditionChip[])[];
  /** User-chosen display name (sanitised); absent = deterministic. */
  readonly name?: string;
  readonly synthetic: boolean;
  readonly createdBy: string;
  /** Extra description line, e.g. "Created from the engine's proposal during demo seed." */
  readonly origin: string;
}

export interface CreatedCluster {
  readonly ref: IssueRef;
  readonly nameDet: string;
  readonly displayName: string;
  readonly row: ClusterRow;
}

/** Deterministic description of a cluster issue (template only, US-21). */
export function clusterDescription(nameDet: string, bucket: BucketKey, origin: string, synthetic: boolean): string {
  const lines = [
    ...(synthetic ? ["Synthetic demo data. Generated by Takeover Triage. Not real vehicle, fleet or driver data.", ""] : []),
    `Takeover cluster "${nameDet}" (bucket ${bucket.type} x ${bucket.variant}).`,
    origin,
    "",
    "Members are the takeover events linked to this issue. Matching, onset and coverage are computed by the Takeover Triage engine; open the Takeover signature panel for the evidence.",
  ];
  return lines.join("\n");
}

/**
 * Creates the cluster issue, its `tt.cluster` property and its index row. Jira first, then
 * the property, then the index (§7.5). The row's memberCount starts at 0; {@link linkMember}
 * maintains it.
 */
export async function createClusterIssue(jira: JiraPort, storage: StoragePort, clock: Clock, input: NewCluster): Promise<PortResult<CreatedCluster>> {
  const nameDet = clusterNameFor(input.bucket, input.memberChips.map((chips) => ({ chips })));
  const displayName = input.name ?? nameDet;
  const prefix = input.synthetic ? `${SYNTHETIC_SUMMARY_PREFIX} ` : "";
  const created = await jira.createIssue({
    projectKey: input.projectKey,
    issueType: input.issueType,
    summary: `${prefix}Cluster: ${displayName}`.slice(0, 255),
    description: clusterDescription(nameDet, input.bucket, input.origin, input.synthetic),
    labels: input.synthetic ? [LABELS.cluster, LABELS.synthetic] : [LABELS.cluster],
  });
  if (!created.ok) return created;
  const prop = { v: 1, bucket: bucketId(input.bucket), nameDet, createdBy: input.createdBy, createdAt: clock.nowIso(), params: PARAMS_VERSION };
  const w = await jira.setIssueProperty(created.value.id, PROPERTY_KEYS.cluster, prop);
  if (!w.ok) return w;
  const row: ClusterRow = {
    issueKey: created.value.key,
    projectKey: input.projectKey,
    bucket: bucketId(input.bucket),
    nameDet,
    memberCount: 0,
    firstBuild: "",
    ownerRule: "",
    status: "active",
    profile: input.name !== undefined ? { v: 0, displayName: input.name } : null,
    onset: null,
    coverage: null,
    updatedAt: nowEpochSeconds(clock),
    synthetic: input.synthetic,
  };
  const e = await storage.putEntity("cluster", created.value.id, row);
  if (!e.ok) return e;
  return ok({ ref: created.value, nameDet, displayName, row });
}

export interface LinkMemberInput {
  readonly event: IssueIdentity;
  readonly eventEvent: TtEvent;
  readonly cluster: { readonly id: string; readonly key: string };
  readonly linkType: string;
  readonly prevTriage: TtTriage | null;
  readonly by: string;
  readonly action: string;
  /** Existing link id between the two (idempotence, §7.5); then no new link is created. */
  readonly existingLinkId?: string;
}

/**
 * Accept write path: link (Jira) → `tt.triage` → index (event row accepted, cluster count).
 * Returns the link id and whether a new link was created.
 */
export async function linkMember(jira: JiraPort, storage: StoragePort, clock: Clock, input: LinkMemberInput): Promise<PortResult<{ linkId: string; created: boolean; triage: TtTriage }>> {
  let linkId = input.existingLinkId;
  let created = false;
  if (linkId === undefined) {
    const l = await jira.createIssueLink({ type: input.linkType, inwardIssue: input.event.id, outwardIssue: input.cluster.id });
    if (!l.ok) return l;
    linkId = l.value.id;
    created = true;
  }
  const triage = nextTriage(input.prevTriage, { state: "accepted", clusterKey: input.cluster.key, by: input.by, at: clock.nowIso(), action: input.action });
  const t = await jira.setIssueProperty(input.event.id, PROPERTY_KEYS.triage, triage);
  if (!t.ok) return t;
  const prevRow = await storage.getEntity("event", input.event.id);
  const base = prevRow.ok && prevRow.value !== undefined ? prevRow.value : eventRowOf(input.event, input.eventEvent, UNASSIGNED, clock);
  const row = withMembership(base, { status: "accepted", clusterId: input.cluster.id, proposal: { kind: "none" }, nnDist: base.nnDist }, clock);
  const e = await storage.putEntity("event", input.event.id, row);
  if (!e.ok) return e;
  await adjustMemberCount(storage, clock, input.cluster.id, +1);
  return ok({ linkId, created, triage });
}

/** memberCount += delta on the cluster row (best effort; recluster recomputes it). */
export async function adjustMemberCount(storage: StoragePort, clock: Clock, clusterId: string, delta: number): Promise<void> {
  const r = await storage.getEntity("cluster", clusterId);
  if (!r.ok || r.value === undefined) return;
  const memberCount = Math.max(0, r.value.memberCount + delta);
  await storage.putEntity("cluster", clusterId, { ...r.value, memberCount, status: memberCount > 0 ? "active" : "empty", updatedAt: nowEpochSeconds(clock) });
}

/** Distance of each member to the medoid (for stubs and representative events). */
export function distancesToMedoid(members: readonly ClusterInput[], medoidKey: string | null): Map<string, number> {
  const medoid = members.find((m) => m.key === medoidKey);
  const out = new Map<string, number>();
  for (const m of members) out.set(m.key, medoid === undefined ? Infinity : m === medoid ? 0 : distance(m, medoid));
  return out;
}

/** Majority chips of a member set, as the profile operand's chips. */
export function profileChips(members: readonly Pick<ClusterInput, "chips">[]): ConditionChip[] {
  return majorityChips(members.map((m) => ({ chips: m.chips, odd: [] })));
}

export function memberInputs(rows: readonly Keyed<EventRow>[], keyOf: (id: string) => string | undefined): ClusterInput[] {
  return rows.map((r) => clusterInputOf(r.value, keyOf));
}

