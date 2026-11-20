/**
 * The `tt-seed` consumer steps (ARCHITECTURE §9 step 3, SEED_DATA §15.1 S2–S10). Each step runs
 * asApp inside one queue invocation and returns the next chain position.
 *
 * Idempotency (every step may be re-run after a crash, a retry or a duplicate delivery):
 * - Entity and property writes are upserts / overwrites with deterministic values.
 * - Issue creates go through {@link ensureIssues}: the manifest is consulted first; items that
 *   may have had a create in flight (`manifest.pending`) trigger a search of the project's
 *   `tt-synthetic` issues, which adopts this seed's issues by `tt.seed.itemId`, or, when the
 *   crash hit between create and
 *   the `tt.seed` write, by the item marker in the description. Only then are the remaining
 *   items created (bulk, ≤ 50 per call), each immediately tagged with `tt.seed`.
 * - Links check the event's existing links and `tt.triage` first; an already accepted member
 *   is only re-indexed, so the triage history never gets a duplicate entry.
 * - The history clustering is computed once and frozen in the manifest (`clusterPlan`).
 *
 * Honesty: everything created here is SYNTHETIC-labelled (summary prefix, banner, label
 * `tt-synthetic`, `synthetic: true`), the clusters come from the engine's own proposal over the
 * historical events (never from ground truth, S6), and the Monday batch is left unassigned.
 */
import {
  PARAMS_VERSION,
  bucketId,
  clusterNameFor,
  parseTtEvent,
  parseTtTriage,
  proposeClusters,
  type BucketKey,
  type ConditionChip,
  type TakeoverType,
  type TtEvent,
} from "@tt/engine";
import { GENERATOR_VERSION, type EventSpec, type FleetPlanOutput, type SeedConfig } from "@tt/seedgen";
import type { ServiceContext } from "../../context";
import { nowEpochSeconds } from "../../ports/clock";
import type { ClusterRow, EventRow } from "../../ports/entities";
import type { Ports } from "../../ports/index";
import { BULK_CREATE_MAX, type CreateIssueInput, type IssueRef, type JiraIssue, type JiraPort } from "../../ports/jira";
import { LABELS, PROPERTY_KEYS } from "../../ports/properties";
import { ok, portErr, type PortResult } from "../../ports/result";
import { KvsKeys } from "../../ports/storage";
import { createClusterIssue, linkMember } from "../clusters";
import { indexEvent, prepareEventForWrite, writeEventProperties } from "../commit";
import { clusterParamsOf, type ProjectConfig } from "../config";
import { clusterInputOf, loadProjectEvents, rowChips, UNASSIGNED, withMembership, type Keyed } from "../index-store";
import { fillMissingProperties, resolveLinkType } from "../jira-io";
import { reclusterProject } from "../recluster";
import { adfToText, itemMarker, parseItemMarker, type EventGenerator, type GeneratedEvent } from "./generate";
import { buildSeedReport } from "./report";
import { SEED_REPORT_KEY, writeManifest, type ClusterPlanEntry, type SeedItemRef, type SeedJobRecord, type SeedManifest, type SeedStep } from "./state";

export type MutableManifest = { -readonly [K in keyof SeedManifest]: SeedManifest[K] };

export interface StepDeps {
  readonly generate: EventGenerator;
  /** Monotonic-enough wall clock for the per-invocation budget (`Date.now` in production). */
  readonly nowMs: () => number;
  /** Stop starting new work after this many ms (the consumer timeout is 600 s). */
  readonly budgetMs: number;
  /** Events generated + written per invocation (SEED_DATA §15.1 S4: about 8). */
  readonly eventsPerStep: number;
  /** Events whose raw files are uploaded per invocation (each has 1 CSV + 1–4 JPEGs). */
  readonly attachmentEventsPerStep: number;
}

export interface StepContext {
  readonly ports: Ports;
  readonly jira: JiraPort;
  readonly sctx: ServiceContext;
  readonly cfg: SeedConfig;
  readonly plan: FleetPlanOutput;
  readonly config: ProjectConfig;
  readonly m: MutableManifest;
  readonly job: SeedJobRecord;
  readonly deps: StepDeps;
  readonly startedMs: number;
  readonly warnings: string[];
  /** Generation results of this invocation (the same event may be needed twice). */
  readonly generated: Map<string, GeneratedEvent>;
}

export interface StepDone {
  /** `null` = the chain is finished. */
  readonly next: { readonly step: SeedStep; readonly cursor: number } | null;
  /** Absolute progress values (set, not added, so re-runs never double count). */
  readonly counts: Readonly<Record<string, number>>;
  readonly patch?: Partial<Pick<SeedJobRecord, "boardReady" | "boardReadyAt" | "attachments" | "state" | "message">>;
}

export type StepResult = PortResult<StepDone>;

// ------------------------------------------------------------------ helpers

const budgetLeft = (sc: StepContext): boolean => sc.deps.nowMs() - sc.startedMs < sc.deps.budgetMs;

export async function saveManifest(sc: StepContext): Promise<PortResult<void>> {
  return writeManifest(sc.ports.storage, sc.m);
}

export function historyEvents(plan: FleetPlanOutput): EventSpec[] {
  return plan.events.filter((e) => !e.monday);
}

export function mondayEvents(plan: FleetPlanOutput): EventSpec[] {
  return plan.events.filter((e) => e.monday);
}

function seedProperty(sc: StepContext, itemId: string): Record<string, unknown> {
  return { v: 1, seed: sc.m.seed, gen: GENERATOR_VERSION, itemId, jobId: sc.m.jobId };
}

function generated(sc: StepContext, spec: EventSpec): GeneratedEvent {
  const hit = sc.generated.get(spec.eventId);
  if (hit !== undefined) return hit;
  const g = sc.deps.generate(sc.cfg, sc.plan, spec, { ruleThresholds: sc.config.ruleThresholds, chipThresholds: sc.config.chipThresholds });
  sc.generated.set(spec.eventId, g);
  return g;
}

function setItem(sc: StepContext, itemId: string, ref: SeedItemRef): void {
  sc.m.items = { ...sc.m.items, [itemId]: { id: ref.id, key: ref.key } };
}

/** `tt.seed` of an issue, when it belongs to this seed. */
function seedItemOf(issue: JiraIssue, seed: number): string | null {
  const p = issue.properties[PROPERTY_KEYS.seed];
  if (typeof p !== "object" || p === null) return null;
  const r = p as Record<string, unknown>;
  return r["seed"] === seed && typeof r["itemId"] === "string" ? r["itemId"] : null;
}

/** Finds this seed's issues for `wanted` item ids among the project's `tt-synthetic` issues. */
async function adoptExisting(sc: StepContext, wanted: ReadonlySet<string>): Promise<PortResult<number>> {
  let token: string | undefined;
  let adopted = 0;
  do {
    const r = await sc.jira.searchJql({ jql: `project = ${sc.m.projectKey} AND labels = ${LABELS.synthetic}`, properties: [PROPERTY_KEYS.seed], maxResults: 100, ...(token !== undefined ? { nextPageToken: token } : {}) });
    if (!r.ok) return r;
    const filled = await fillMissingProperties(sc.jira, r.value.issues, [PROPERTY_KEYS.seed]);
    if (!filled.ok) return filled;
    const sorted = [...filled.value].sort((a, b) => Number(a.id) - Number(b.id));
    for (const issue of sorted) {
      let itemId = seedItemOf(issue, sc.m.seed);
      if (itemId === null && !(PROPERTY_KEYS.seed in issue.properties)) {
        // Crash between create and the tt.seed write: the description marker names the item.
        const full = issue.description !== undefined ? issue : await readIssue(sc, issue.id);
        if (full === null) continue;
        const mk = parseItemMarker(full.description);
        if (mk === null || mk.seed !== sc.m.seed || !wanted.has(mk.itemId) || sc.m.items[mk.itemId] !== undefined) continue;
        const w = await sc.jira.setIssueProperty(issue.id, PROPERTY_KEYS.seed, seedProperty(sc, mk.itemId));
        if (!w.ok) return w;
        itemId = mk.itemId;
      }
      if (itemId === null || !wanted.has(itemId) || sc.m.items[itemId] !== undefined) continue;
      setItem(sc, itemId, { id: issue.id, key: issue.key });
      adopted++;
    }
    token = r.value.nextPageToken;
  } while (token !== undefined);
  return ok(adopted);
}

async function readIssue(sc: StepContext, id: string): Promise<JiraIssue | null> {
  const r = await sc.jira.getIssue(id);
  return r.ok ? r.value : null;
}

export interface WantedIssue {
  readonly itemId: string;
  readonly input: CreateIssueInput;
}

const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

/** Drops item ids from `pending` once they are recorded in `items`. */
function settlePending(sc: StepContext): void {
  sc.m.pending = sc.m.pending.filter((id) => sc.m.items[id] === undefined);
}

/**
 * Adopt-or-create for a set of seed items; returns the refs in `wanted` order. Item ids are
 * marked `pending` (saved) before their create call and cleared once recorded, so only a
 * retry after an interrupted create pays for the adoption search.
 */
export async function ensureIssues(sc: StepContext, wanted: readonly WantedIssue[]): Promise<PortResult<Map<string, SeedItemRef>>> {
  const missing = (): WantedIssue[] => wanted.filter((w) => sc.m.items[w.itemId] === undefined);
  if (missing().some((w) => sc.m.pending.includes(w.itemId))) {
    const a = await adoptExisting(sc, new Set(missing().map((w) => w.itemId)));
    if (!a.ok) return a;
    if (a.value > 0) {
      settlePending(sc);
      const s = await saveManifest(sc);
      if (!s.ok) return s;
    }
  }
  const todo = missing();
  if (todo.length > 0) {
    sc.m.pending = unique([...sc.m.pending, ...todo.map((w) => w.itemId)]);
    const s = await saveManifest(sc);
    if (!s.ok) return s;
  }
  for (let i = 0; i < todo.length; i += BULK_CREATE_MAX) {
    const chunk = todo.slice(i, i + BULK_CREATE_MAX);
    const r = await sc.jira.bulkCreateIssues(chunk.map((c) => c.input));
    if (!r.ok) return r;
    for (const [j, ref] of r.value.issues.entries()) {
      const w = chunk[j];
      if (ref === null || w === undefined) continue;
      const p = await sc.jira.setIssueProperty(ref.id, PROPERTY_KEYS.seed, seedProperty(sc, w.itemId));
      if (!p.ok) return p;
      setItem(sc, w.itemId, ref);
    }
    settlePending(sc);
    const s = await saveManifest(sc);
    if (!s.ok) return s;
    if (r.value.errors.length > 0) {
      const first = r.value.errors[0];
      return portErr("bad-request", `Jira rejected ${r.value.errors.length} of ${chunk.length} issue creates: ${first?.message ?? "unknown error"}`, { op: "jira.bulkCreateIssues" });
    }
  }
  const out = new Map<string, SeedItemRef>();
  for (const w of wanted) {
    const ref = sc.m.items[w.itemId];
    if (ref !== undefined) out.set(w.itemId, ref);
  }
  return ok(out);
}

// ------------------------------------------------------------------ S2 registry

export async function stepRegistry(sc: StepContext): Promise<StepResult> {
  const { storage } = sc.ports;
  for (const v of sc.plan.vehicles) {
    const w = await storage.putEntity("vehicle", v.vehicleId, { vehicleId: v.vehicleId, label: v.label, variant: v.variant, sensors: [...v.sensors], calibration: { ...v.calibration }, synthetic: true });
    if (!w.ok) return w;
  }
  for (const s of sc.plan.driveSessions) {
    const w = await storage.putEntity("drive-session", s.sessionId, { sessionId: s.sessionId, vehicleId: s.vehicleId, variant: s.variant, build: s.build, date: s.startEpoch, km: s.km, odd: [...s.odd], source: "demo-seed", synthetic: true });
    if (!w.ok) return w;
  }
  sc.m.registry = { vehicles: sc.plan.vehicles.map((v) => v.vehicleId), sessions: sc.plan.driveSessions.map((s) => s.sessionId) };
  const s = await saveManifest(sc);
  if (!s.ok) return s;
  return ok({ next: { step: "scenarios", cursor: 0 }, counts: { vehicles: sc.plan.vehicles.length, driveSessions: sc.plan.driveSessions.length } });
}

// ------------------------------------------------------------------ S3 scenarios

export async function stepScenarios(sc: StepContext): Promise<StepResult> {
  const wanted: WantedIssue[] = sc.plan.scenarios.map((s) => ({
    itemId: s.id,
    input: { projectKey: sc.m.projectKey, issueType: sc.config.scenarioIssueType, summary: s.summary, description: adfToText(s.descriptionAdf), labels: [...s.labels] },
  }));
  const refs = await ensureIssues(sc, wanted);
  if (!refs.ok) return refs;
  for (const s of sc.plan.scenarios) {
    const ref = refs.value.get(s.id);
    if (ref === undefined || !s.tagsInProperty || s.property === null) continue;
    const w = await sc.jira.setIssueProperty(ref.id, PROPERTY_KEYS.scenario, s.property);
    if (!w.ok) return w;
  }
  return ok({ next: { step: "history", cursor: 0 }, counts: { scenarios: refs.value.size } });
}

// ------------------------------------------------------------------ S4/S5 events

function eventIssueInput(sc: StepContext, e: EventSpec): CreateIssueInput {
  return { projectKey: sc.m.projectKey, issueType: sc.config.eventIssueType, summary: e.summary, description: adfToText(e.descriptionAdf), labels: [...e.labels] };
}

/** Creates (or adopts), generates, computes and writes one chunk of events; all left unassigned. */
async function writeEventChunk(sc: StepContext, all: readonly EventSpec[], cursor: number): Promise<PortResult<number>> {
  const chunk = all.slice(cursor, cursor + sc.deps.eventsPerStep);
  const refs = await ensureIssues(sc, chunk.map((e) => ({ itemId: e.eventId, input: eventIssueInput(sc, e) })));
  if (!refs.ok) return refs;
  let doneCount = 0;
  for (const e of chunk) {
    if (doneCount > 0 && !budgetLeft(sc)) break;
    const ref = refs.value.get(e.eventId);
    if (ref === undefined) return portErr("unknown", `no issue for ${e.eventId}`);
    const g = generated(sc, e);
    if (!g.event.ok) {
      if (!sc.m.failedEvents.includes(e.eventId)) sc.m.failedEvents = [...sc.m.failedEvents, e.eventId];
      sc.warnings.push(`${ref.key}: the engine rejected the generated files (${g.event.error.map((x) => x.code).join(", ")}); the issue has no signal data.`);
      doneCount++;
      continue;
    }
    const prepared = prepareEventForWrite(g.event.value, sc.config);
    if (!prepared.ok) {
      if (!sc.m.failedEvents.includes(e.eventId)) sc.m.failedEvents = [...sc.m.failedEvents, e.eventId];
      sc.warnings.push(`${ref.key}: ${prepared.message}`);
      doneCount++;
      continue;
    }
    const w = await writeEventProperties(sc.jira, ref.id, prepared.verified.event, g.thumbs);
    if (!w.ok) return w;
    const ix = await indexEvent(sc.ports.storage, sc.ports.clock, { id: ref.id, key: ref.key, projectKey: sc.m.projectKey }, prepared.verified, UNASSIGNED);
    if (!ix.ok) return ix;
    doneCount++;
  }
  if (sc.m.failedEvents.length > 0) {
    const s = await saveManifest(sc);
    if (!s.ok) return s;
  }
  return ok(cursor + doneCount);
}

export async function stepHistory(sc: StepContext, cursor: number): Promise<StepResult> {
  const all = historyEvents(sc.plan);
  const next = await writeEventChunk(sc, all, cursor);
  if (!next.ok) return next;
  const counts = { historyEvents: Math.min(next.value, all.length), historyTotal: all.length };
  return ok({ next: next.value < all.length ? { step: "history", cursor: next.value } : { step: "clusters", cursor: 0 }, counts });
}

export async function stepMonday(sc: StepContext, cursor: number): Promise<StepResult> {
  const all = mondayEvents(sc.plan);
  const next = await writeEventChunk(sc, all, cursor);
  if (!next.ok) return next;
  const counts = { mondayEvents: Math.min(next.value, all.length), mondayTotal: all.length };
  return ok({ next: next.value < all.length ? { step: "monday", cursor: next.value } : { step: "board", cursor: 0 }, counts });
}

// ------------------------------------------------------------------ S6 clusters

/** The engine's HAC proposal over the historical events only, all treated as unassigned. Truth is not used. */
export function historyClusterPlan(historyRows: readonly Keyed<EventRow>[], eventIdOfIssue: ReadonlyMap<string, string>, config: ProjectConfig): ClusterPlanEntry[] {
  const inputs = historyRows.map((r) => {
    const { clusterKey: _ck, ...base } = clusterInputOf(r.value, () => undefined);
    void _ck;
    return { ...base, state: "unassigned" as const };
  });
  const proposal = proposeClusters(inputs, clusterParamsOf(config));
  const eventIdOfKey = new Map(historyRows.map((r) => [r.value.issueKey, eventIdOfIssue.get(r.key) ?? ""]));
  return proposal.proposed.map((p) => {
    const members = p.members.map((k) => eventIdOfKey.get(k) ?? "").filter((x) => x !== "");
    return { itemId: `CL-${members[0] ?? p.id}`, bucket: bucketId(p.bucket), members };
  });
}

function bucketKeyOf(bucket: string): BucketKey {
  const [type, variant] = bucket.split("|");
  return { type: (type ?? "unknown") as TakeoverType, variant: variant ?? "" };
}

const ORIGIN = "Created from the engine's proposal during demo seed.";

/** Finishes a cluster issue whose create succeeded in an earlier, interrupted run (tt.cluster + row). */
async function completeClusterIssue(sc: StepContext, ref: SeedItemRef, entry: ClusterPlanEntry, chips: readonly (readonly ConditionChip[])[]): Promise<PortResult<void>> {
  const bucket = bucketKeyOf(entry.bucket);
  const nameDet = clusterNameFor(bucket, chips.map((c) => ({ chips: c })));
  const prop = await sc.jira.getIssueProperty(ref.id, PROPERTY_KEYS.cluster);
  if (!prop.ok) return prop;
  if (prop.value === null) {
    const w = await sc.jira.setIssueProperty(ref.id, PROPERTY_KEYS.cluster, { v: 1, bucket: entry.bucket, nameDet, createdBy: sc.m.by, createdAt: sc.ports.clock.nowIso(), params: PARAMS_VERSION });
    if (!w.ok) return w;
  }
  const row = await sc.ports.storage.getEntity("cluster", ref.id);
  if (!row.ok) return row;
  if (row.value === undefined) {
    const fresh: ClusterRow = { issueKey: ref.key, projectKey: sc.m.projectKey, bucket: entry.bucket, nameDet, memberCount: 0, firstBuild: "", ownerRule: "", status: "active", profile: null, onset: null, coverage: null, updatedAt: nowEpochSeconds(sc.ports.clock), synthetic: true };
    const w = await sc.ports.storage.putEntity("cluster", ref.id, fresh);
    if (!w.ok) return w;
  }
  return ok(undefined);
}

async function ensureClusterIssue(sc: StepContext, entry: ClusterPlanEntry, chips: readonly (readonly ConditionChip[])[]): Promise<PortResult<SeedItemRef>> {
  let ref = sc.m.items[entry.itemId];
  const wasPending = sc.m.pending.includes(entry.itemId);
  if (ref === undefined && wasPending) {
    const a = await adoptExisting(sc, new Set([entry.itemId]));
    if (!a.ok) return a;
    ref = sc.m.items[entry.itemId];
  }
  if (ref !== undefined) {
    // An earlier, interrupted run created it: finish its property and index row.
    const c = await completeClusterIssue(sc, ref, entry, chips);
    if (!c.ok) return c;
    if (wasPending) {
      settlePending(sc);
      const s = await saveManifest(sc);
      if (!s.ok) return s;
    }
    return ok(ref);
  }
  sc.m.pending = unique([...sc.m.pending, entry.itemId]);
  const pend = await saveManifest(sc);
  if (!pend.ok) return pend;
  const created = await createClusterIssue(sc.jira, sc.ports.storage, sc.ports.clock, {
    projectKey: sc.m.projectKey,
    issueType: sc.config.clusterIssueType,
    bucket: bucketKeyOf(entry.bucket),
    memberChips: chips,
    synthetic: true,
    createdBy: sc.m.by,
    origin: `${ORIGIN} ${itemMarker(sc.m.seed, entry.itemId)}.`,
  });
  if (!created.ok) return created;
  const p = await sc.jira.setIssueProperty(created.value.ref.id, PROPERTY_KEYS.seed, seedProperty(sc, entry.itemId));
  if (!p.ok) return p;
  setItem(sc, entry.itemId, created.value.ref);
  settlePending(sc);
  const s = await saveManifest(sc);
  if (!s.ok) return s;
  return ok(created.value.ref);
}

/** Link one historical member, recorded as accepted during demo seed (`seed-accept`, by the admin). */
async function ensureMember(sc: StepContext, eventRef: SeedItemRef, cluster: IssueRef, linkType: string, rows: ReadonlyMap<string, EventRow>): Promise<PortResult<"linked" | "already">> {
  const issue = await sc.jira.getIssue(eventRef.id, { properties: [PROPERTY_KEYS.event, PROPERTY_KEYS.triage] });
  if (!issue.ok) return issue;
  const tri = parseTtTriage(issue.value.properties[PROPERTY_KEYS.triage]);
  const triage = tri.ok ? tri.value : null;
  const link = (issue.value.links ?? []).find((l) => (l.inwardIssue.id === eventRef.id && l.outwardIssue.id === cluster.id) || (l.outwardIssue.id === eventRef.id && l.inwardIssue.id === cluster.id));
  const row = rows.get(eventRef.id);
  if (triage !== null && triage.state === "accepted" && triage.clusterKey === cluster.key && link !== undefined) {
    if (row !== undefined && (row.status !== "accepted" || row.clusterId !== cluster.id)) {
      const w = await sc.ports.storage.putEntity("event", eventRef.id, withMembership(row, { status: "accepted", clusterId: cluster.id, proposal: { kind: "none" }, nnDist: row.nnDist }, sc.ports.clock));
      if (!w.ok) return w;
    }
    return ok("already");
  }
  const ev = parseTtEvent(issue.value.properties[PROPERTY_KEYS.event]);
  if (!ev.ok) return portErr("invalid-response", `${eventRef.key} has no valid tt.event`);
  const l = await linkMember(sc.jira, sc.ports.storage, sc.ports.clock, {
    event: { id: eventRef.id, key: eventRef.key, projectKey: sc.m.projectKey },
    eventEvent: ev.value as TtEvent,
    cluster: { id: cluster.id, key: cluster.key },
    linkType,
    prevTriage: triage,
    by: sc.m.by,
    action: "seed-accept",
    ...(link !== undefined ? { existingLinkId: link.id } : {}),
  });
  return l.ok ? ok("linked") : l;
}

export async function stepClusters(sc: StepContext, cursor: number): Promise<StepResult> {
  const rowsR = await loadProjectEvents(sc.ports.storage, sc.m.projectKey);
  if (!rowsR.ok) return rowsR;
  const eventIdOfIssue = new Map<string, string>();
  for (const e of historyEvents(sc.plan)) {
    const ref = sc.m.items[e.eventId];
    if (ref !== undefined) eventIdOfIssue.set(ref.id, e.eventId);
  }
  if (sc.m.clusterPlan === null) {
    const historyRows = rowsR.value.filter((r) => eventIdOfIssue.has(r.key));
    sc.m.clusterPlan = historyClusterPlan(historyRows, eventIdOfIssue, sc.config);
    const s = await saveManifest(sc);
    if (!s.ok) return s;
  }
  const plan = sc.m.clusterPlan;
  const rows = new Map(rowsR.value.map((r) => [r.key, r.value]));
  const lt = await resolveLinkType(sc.sctx, sc.jira, sc.config);
  if (lt === null) return portErr("bad-request", "No issue link type is available on this site.");
  let i = cursor;
  for (; i < plan.length; i++) {
    if (i > cursor && !budgetLeft(sc)) break;
    const entry = plan[i];
    if (entry === undefined) continue;
    const memberRefs = entry.members.map((id) => sc.m.items[id]).filter((r): r is SeedItemRef => r !== undefined);
    const chips = memberRefs.map((r) => {
      const row = rows.get(r.id);
      return row === undefined ? [] : rowChips(row);
    });
    const cluster = await ensureClusterIssue(sc, entry, chips);
    if (!cluster.ok) return cluster;
    for (const m of memberRefs) {
      const r = await ensureMember(sc, m, cluster.value, lt.name, rows);
      if (!r.ok) return r;
    }
  }
  const links = plan.slice(0, i).reduce((a, e) => a + e.members.length, 0);
  const counts = { clusters: Math.min(i, plan.length), clustersTotal: plan.length, links };
  return ok({ next: i < plan.length ? { step: "clusters", cursor: i } : { step: "monday", cursor: 0 }, counts });
}

// ------------------------------------------------------------------ S7/S8 board

export async function stepBoard(sc: StepContext): Promise<StepResult> {
  const mark = { at: sc.plan.triagedMark, by: sc.m.by, via: "demo-seed" };
  const w = await sc.ports.storage.set(KvsKeys.triaged(sc.m.projectKey), mark);
  if (!w.ok) return w;
  const r = await reclusterProject(sc.ports, { projectKey: sc.m.projectKey });
  if (!r.ok) return r;
  return ok({
    next: { step: "attachments", cursor: 0 },
    counts: { reclusteredEvents: r.value.events },
    patch: { boardReady: true, boardReadyAt: sc.ports.clock.nowIso(), attachments: "uploading", state: "uploading-raw-files", message: "Board ready. Raw files uploading in the background." },
  });
}

// ------------------------------------------------------------------ S9 attachments

export const SPIKE_I2_SKIPPED = "Raw files were not attached: the app may not upload attachments on this site (SPIKE-I2). Signatures, metrics and thumbnails are stored.";

export async function stepAttachments(sc: StepContext, cursor: number): Promise<StepResult> {
  // SPIKE-I2: backend multipart upload via asApp().requestJira is unverified; on refusal the
  // phase is skipped (thumbnails remain) instead of failing the whole seed.
  const all = sc.plan.events;
  const end = Math.min(all.length, cursor + sc.deps.attachmentEventsPerStep);
  let i = cursor;
  for (; i < end; i++) {
    if (i > cursor && !budgetLeft(sc)) break;
    const e = all[i];
    if (e === undefined) continue;
    const ref = sc.m.items[e.eventId];
    if (ref === undefined) continue;
    const existing = await sc.jira.getAttachments(ref.id);
    if (!existing.ok) return existing;
    const have = new Set(existing.value.map((a) => a.filename));
    const g = generated(sc, e);
    const files = [{ name: g.files.csv.name, bytes: g.files.csv.bytes, mimeType: "text/csv" }, ...g.files.frames.map((f) => ({ name: f.name, bytes: f.bytes, mimeType: "image/jpeg" }))];
    let present = 0;
    for (const f of files) {
      if (have.has(f.name)) {
        present++;
        continue;
      }
      const u = await sc.jira.uploadAttachment(ref.id, { filename: f.name, mimeType: f.mimeType, bytes: f.bytes });
      if (!u.ok) {
        if (u.error.kind === "forbidden" || u.error.kind === "unauthorized") {
          return ok({ next: { step: "report", cursor: 0 }, counts: { attachmentEvents: i }, patch: { attachments: "skipped", state: "running", message: SPIKE_I2_SKIPPED } });
        }
        if (u.error.kind === "value-too-large" || u.error.kind === "bad-request") {
          sc.warnings.push(`${ref.key}: ${f.name} was not attached (${u.error.message}).`);
          continue;
        }
        return u;
      }
      present++;
    }
    sc.m.attachmentFiles = { ...sc.m.attachmentFiles, [e.eventId]: present };
  }
  const s = await saveManifest(sc);
  if (!s.ok) return s;
  const files = Object.values(sc.m.attachmentFiles).reduce((a, b) => a + b, 0);
  if (i < all.length) return ok({ next: { step: "attachments", cursor: i }, counts: { attachmentEvents: i, attachmentFiles: files } });
  return ok({ next: { step: "report", cursor: 0 }, counts: { attachmentEvents: i, attachmentFiles: files }, patch: { attachments: "done", state: "running", message: "Raw files attached." } });
}

// ------------------------------------------------------------------ S10 report

export async function stepReport(sc: StepContext): Promise<StepResult> {
  const rows = await loadProjectEvents(sc.ports.storage, sc.m.projectKey);
  if (!rows.ok) return rows;
  const report = buildSeedReport({ manifest: sc.m, job: sc.job, rows: rows.value });
  const w = await sc.ports.storage.set(SEED_REPORT_KEY, report);
  if (!w.ok) return w;
  // The final recluster (ARCHITECTURE §9 step 3.6) runs in its own consumer, serialised per project.
  const pushed = await sc.ports.queue.pushRecluster({ projectKey: sc.m.projectKey, reason: "seed", requestedAt: sc.ports.clock.nowIso(), requestedBy: sc.m.by });
  if (!pushed.ok) sc.warnings.push("The final re-cluster could not be queued; use Re-sync now if the board looks stale.");
  return ok({ next: null, counts: {}, patch: { state: "done", message: "Demo data loaded." } });
}
