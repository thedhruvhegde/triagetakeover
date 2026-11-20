/**
 * The derived index (custom entities, §7.3) as the services see it: paged loads, row
 * builders, the `proposalId` encoding and conversion to engine `ClusterInput`s.
 *
 * Jira is the source of truth (D3); everything here can be rebuilt by Re-sync (§7.5).
 *
 * `status` / `proposalId` encoding (engine MembershipState + where the proposal points):
 * - `accepted`   clusterId = the cluster issue id (a human linked it).
 * - `proposed`   proposalId `c:<clusterIssueId>`: kNN suggests an existing cluster (not linked),
 *                or `p:<seedKey>`: HAC groups it with other unassigned events (new cluster idea).
 * - `novel`      proposalId `n:<clusterIssueId>`: nearest cluster exceeded τ,
 *                or `f:`: first of its kind in the bucket (fewer than 2 accepted events).
 * - `unassigned` written but not yet matched.
 */
import {
  ENGINE_VERSION,
  bucketId,
  chipsToMask,
  issueNumberOf,
  maskToChips,
  parseIsoSeconds,
  type ClusterInput,
  type ConditionChip,
  type MembershipState,
  type TakeoverType,
  type TtEvent,
  TAKEOVER_TYPES,
} from "@tt/engine";
import type { ClusterRef, ConditionChipName, EventSummary, TakeoverTypeName } from "../contract/ui-api";
import { nowEpochSeconds, type Clock } from "../ports/clock";
import type { ClusterRow, DriveSessionRow, EntityName, EntityRows, EventRow } from "../ports/entities";
import { KvsKeys, STORAGE_QUERY_MAX_LIMIT, type EntityQuery, type StoragePort } from "../ports/storage";
import type { PortResult } from "../ports/result";
import { ok } from "../ports/result";
import { issueUrl } from "./evidence";

export const EVENT_STATES: readonly MembershipState[] = ["accepted", "proposed", "novel", "unassigned"];

/** Safety cap on paged loads (≤ 5,000 events per project, §13 data envelope). */
export const MAX_PAGES = 200;

export interface Keyed<T> {
  readonly key: string;
  readonly value: T;
}

/** Loads every page of an entity query. */
export async function queryAll<E extends EntityName>(storage: StoragePort, entity: E, query: Omit<EntityQuery, "cursor" | "limit">): Promise<PortResult<Keyed<EntityRows[E]>[]>> {
  const out: Keyed<EntityRows[E]>[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await storage.queryEntities(entity, { ...query, limit: STORAGE_QUERY_MAX_LIMIT, ...(cursor !== undefined ? { cursor } : {}) });
    if (!r.ok) return r;
    out.push(...r.value.items);
    cursor = r.value.nextCursor;
    if (cursor === undefined) break;
  }
  return ok(out);
}

/** All event rows of a project (four `by-status` partitions; there is no by-project index). */
export async function loadProjectEvents(storage: StoragePort, projectKey: string): Promise<PortResult<Keyed<EventRow>[]>> {
  const all: Keyed<EventRow>[] = [];
  for (const status of EVENT_STATES) {
    const r = await queryAll(storage, "event", { index: "by-status", partition: [projectKey, status] });
    if (!r.ok) return r;
    all.push(...r.value);
  }
  return ok(sortRows(all));
}

export async function loadBucketEvents(storage: StoragePort, projectKey: string, bucket: string): Promise<PortResult<Keyed<EventRow>[]>> {
  const r = await queryAll(storage, "event", { index: "by-bucket", partition: [projectKey, bucket] });
  return r.ok ? ok(sortRows(r.value)) : r;
}

export async function loadProjectClusters(storage: StoragePort, projectKey: string): Promise<PortResult<Keyed<ClusterRow>[]>> {
  const r = await queryAll(storage, "cluster", { index: "by-project", partition: [projectKey] });
  return r.ok ? ok([...r.value].sort((a, b) => compareKeys(a.value.issueKey, b.value.issueKey))) : r;
}

export async function loadDriveSessions(storage: StoragePort, variant: string): Promise<PortResult<Keyed<DriveSessionRow>[]>> {
  return queryAll(storage, "drive-session", { index: "by-variant", partition: [variant] });
}

/** Issue-number order, then key (the engine's canonical order). */
export function compareKeys(a: string, b: string): number {
  const na = issueNumberOf(a) ?? Number.MAX_SAFE_INTEGER;
  const nb = issueNumberOf(b) ?? Number.MAX_SAFE_INTEGER;
  return na - nb || (a < b ? -1 : a > b ? 1 : 0);
}

function sortRows(rows: Keyed<EventRow>[]): Keyed<EventRow>[] {
  return [...rows].sort((a, b) => compareKeys(a.value.issueKey, b.value.issueKey));
}

// ------------------------------------------------------------------ proposal encoding

export type Proposal =
  | { readonly kind: "none" }
  | { readonly kind: "suggest"; readonly clusterId: string }
  | { readonly kind: "group"; readonly groupId: string }
  | { readonly kind: "novel"; readonly nearestClusterId: string }
  | { readonly kind: "first-of-kind" };

export function encodeProposal(p: Proposal): string {
  switch (p.kind) {
    case "none":
      return "";
    case "suggest":
      return `c:${p.clusterId}`;
    case "group":
      return `p:${p.groupId}`;
    case "novel":
      return `n:${p.nearestClusterId}`;
    case "first-of-kind":
      return "f:";
  }
}

export function decodeProposal(s: string): Proposal {
  if (s.startsWith("c:") && s.length > 2) return { kind: "suggest", clusterId: s.slice(2) };
  if (s.startsWith("p:") && s.length > 2) return { kind: "group", groupId: s.slice(2) };
  if (s.startsWith("n:") && s.length > 2) return { kind: "novel", nearestClusterId: s.slice(2) };
  if (s === "f:") return { kind: "first-of-kind" };
  return { kind: "none" };
}

// ------------------------------------------------------------------ rows

export interface IssueIdentity {
  readonly id: string;
  readonly key: string;
  readonly projectKey: string;
}

export interface MembershipFields {
  readonly status: MembershipState;
  readonly clusterId: string;
  readonly proposal: Proposal;
  readonly nnDist: number;
}

export const UNASSIGNED: MembershipFields = { status: "unassigned", clusterId: "", proposal: { kind: "none" }, nnDist: -1 };

export function occurredEpoch(event: TtEvent): number {
  const s = parseIsoSeconds(event.ctx.occurredAt);
  return Number.isFinite(s) ? Math.floor(s) : 0;
}

export function eventChips(event: TtEvent): readonly ConditionChip[] {
  return event.img?.chips ?? [];
}

/** Builds the `event` row for a verified event (features are the recomputed ones, D2). */
export function eventRowOf(issue: IssueIdentity, event: TtEvent, m: MembershipFields, clock: Clock): EventRow {
  return {
    issueKey: issue.key,
    projectKey: issue.projectKey,
    bucket: bucketId({ type: event.sig.type, variant: event.ctx.variant }),
    type: event.sig.type,
    variant: event.ctx.variant,
    build: event.ctx.build,
    occurredAt: occurredEpoch(event),
    status: m.status,
    clusterId: m.status === "accepted" ? m.clusterId : "",
    proposalId: m.status === "accepted" ? "" : encodeProposal(m.proposal),
    nnDist: Number.isFinite(m.nnDist) ? m.nnDist : -1,
    chipsMask: chipsToMask(eventChips(event)),
    features: event.sig.features,
    engine: ENGINE_VERSION,
    synthetic: event.synthetic,
    indexedAt: nowEpochSeconds(clock),
  };
}

export function withMembership(row: EventRow, m: MembershipFields, clock: Clock): EventRow {
  return {
    ...row,
    status: m.status,
    clusterId: m.status === "accepted" ? m.clusterId : "",
    proposalId: m.status === "accepted" ? "" : encodeProposal(m.proposal),
    nnDist: Number.isFinite(m.nnDist) ? m.nnDist : -1,
    indexedAt: nowEpochSeconds(clock),
  };
}

export function rowType(row: EventRow): TakeoverType {
  return (TAKEOVER_TYPES as readonly string[]).includes(row.type) ? (row.type as TakeoverType) : "unknown";
}

export function rowChips(row: EventRow): readonly ConditionChip[] {
  return maskToChips(row.chipsMask);
}

/**
 * Engine input for a row. `clusterKeyOf` maps cluster issue ids to keys (the engine breaks
 * ties by cluster issue number, so it needs keys). Accepted rows whose cluster is unknown are
 * passed as unassigned.
 */
export function clusterInputOf(row: EventRow, clusterKeyOf: (clusterId: string) => string | undefined): ClusterInput {
  const base = {
    key: row.issueKey,
    issueNumber: issueNumberOf(row.issueKey) ?? 0,
    bucket: { type: rowType(row), variant: row.variant },
    features: row.features,
    chips: rowChips(row),
  };
  if (row.status === "accepted") {
    const ck = clusterKeyOf(row.clusterId);
    if (ck !== undefined) return { ...base, state: "accepted", clusterKey: ck };
    return { ...base, state: "unassigned" };
  }
  return { ...base, state: row.status };
}

/** Lookup tables over a project's cluster rows. */
export interface ClusterIndex {
  readonly byId: ReadonlyMap<string, ClusterRow>;
  readonly idByKey: ReadonlyMap<string, string>;
  keyOf(clusterId: string): string | undefined;
}

export function clusterIndex(rows: readonly Keyed<ClusterRow>[]): ClusterIndex {
  const byId = new Map(rows.map((r) => [r.key, r.value]));
  const idByKey = new Map(rows.map((r) => [r.value.issueKey, r.key]));
  return { byId, idByKey, keyOf: (id) => byId.get(id)?.issueKey };
}

/** Accepted member count per cluster id. */
export function acceptedCounts(rows: readonly Keyed<EventRow>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.value.status === "accepted" && r.value.clusterId !== "") m.set(r.value.clusterId, (m.get(r.value.clusterId) ?? 0) + 1);
  return m;
}

/** Display name stored in the cluster cache (user-chosen on Split), else the deterministic one. */
export function clusterDisplayName(row: ClusterRow): string {
  const p = row.profile;
  if (typeof p === "object" && p !== null && typeof (p as Record<string, unknown>)["displayName"] === "string") return (p as Record<string, string>)["displayName"] as string;
  return row.nameDet;
}

export function clusterRefOf(id: string, row: ClusterRow, memberCount?: number): ClusterRef {
  return { key: row.issueKey, id, name: clusterDisplayName(row), bucket: row.bucket, memberCount: memberCount ?? row.memberCount, url: issueUrl(row.issueKey) };
}

export function eventSummaryOfRow(id: string, row: EventRow): EventSummary {
  return {
    key: row.issueKey,
    id,
    type: rowType(row) as TakeoverTypeName,
    variant: row.variant,
    build: row.build,
    bucket: row.bucket,
    chips: rowChips(row) as readonly ConditionChipName[],
    occurredAt: new Date(row.occurredAt * 1000).toISOString(),
    vehicleId: "",
    synthetic: row.synthetic,
    tampered: false,
    engine: row.engine,
  };
}

export function eventSummaryOf(issue: IssueIdentity, event: TtEvent, tampered: boolean): EventSummary {
  return {
    key: issue.key,
    id: issue.id,
    type: event.sig.type,
    variant: event.ctx.variant,
    build: event.ctx.build,
    bucket: bucketId({ type: event.sig.type, variant: event.ctx.variant }),
    chips: eventChips(event),
    occurredAt: event.ctx.occurredAt,
    vehicleId: event.ctx.vehicleId,
    synthetic: event.synthetic,
    tampered,
    engine: event.engine,
  };
}

/** Drops the cached board (§7.4: invalidated by writes). Failures are ignored (TTL 60 s). */
export async function invalidateBoard(storage: StoragePort, projectKey: string): Promise<void> {
  await storage.delete(KvsKeys.board(projectKey));
}
