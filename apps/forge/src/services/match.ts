/**
 * Matching one event (ARCHITECTURE §5.8 step 2) and explaining it (§5.7): "Triage now",
 * intake results, the panel card and the `get-cluster-for-event` / `explain-match` actions.
 *
 * Everything is computed synchronously from the verified property (D2) and the bucket's
 * index rows. Accepted membership comes from Jira links (D3), never from the engine.
 */
import {
  assignEvent,
  bucketHeadline,
  bucketId,
  explainDistance,
  featureProfile,
  isUnknownBucket,
  issueNumberOf,
  nearestHeadline,
  splitHeadline,
  topContributors,
  type AssignmentResult,
  type ClusterInput,
  type ClusterParams,
  type SimilarityOperand,
  type TtTriage,
} from "@tt/engine";
import type { ClusterRef, ExplainView, MatchView, Neighbour as NeighbourView } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import type { EventRow } from "../ports/entities";
import type { JiraIssue } from "../ports/jira";
import { PROPERTY_KEYS } from "../ports/properties";
import { readIssueAsUser, requireBrowse } from "./auth";
import { profileChips } from "./clusters";
import { clusterParamsOf, loadProjectConfig, type ProjectConfig } from "./config";
import { done, fail, fromPortError, type ServiceError, type ServiceResult } from "./errors";
import { MATCH_CONFIDENCE_DEFINITION, confidence, dedupeEvidence, finiteOrNull, issueEvidence, propertyEvidence, whyRowView } from "./evidence";
import {
  acceptedCounts,
  clusterIndex,
  clusterInputOf,
  clusterRefOf,
  eventChips,
  eventSummaryOf,
  loadBucketEvents,
  loadProjectClusters,
  type ClusterIndex,
  type IssueIdentity,
  type Keyed,
  type MembershipFields,
} from "./index-store";
import { membershipFromLinks, triageOf, type LinkedCluster } from "./jira-io";
import { refreshRow } from "./refresh";
import { verifyEvent, type VerifiedEvent } from "./verify";
import type { Result } from "@tt/engine";

export const FIRST_OF_KIND_MESSAGE = "First of its kind in this bucket";
export const NOVEL_MESSAGE = "Proposed new cluster";
export const NO_SIGNAL_MESSAGE = "No signal data. Add telemetry to this issue to compute its signature.";

// ------------------------------------------------------------------ loading

/** Everything a per-event service needs, read once. */
export interface EventContext {
  readonly issue: JiraIssue;
  readonly identity: IssueIdentity;
  readonly verified: VerifiedEvent;
  readonly triage: TtTriage | null;
  readonly config: ProjectConfig;
  readonly clusters: ClusterIndex;
  readonly counts: Map<string, number>;
  readonly bucketRows: readonly Keyed<EventRow>[];
  /** Accepted membership from Jira links (truth). */
  readonly linked: LinkedCluster | null;
  readonly extraLinks: readonly LinkedCluster[];
  readonly warnings: readonly string[];
}

export type EventContextResult = Result<EventContext, ServiceError & { readonly noSignal?: boolean; readonly schemaErrors?: readonly { path?: string; message: string }[] }>;

/** asUser issue read → verify → config → index rows. */
export async function loadEventContext(ctx: ServiceContext, issueKey: string, extraProperties: readonly string[] = []): Promise<EventContextResult> {
  const read = await readIssueAsUser(ctx, issueKey, { properties: [PROPERTY_KEYS.event, PROPERTY_KEYS.triage, ...extraProperties] });
  if (!read.ok) return read;
  const issue = read.value;
  const browse = await requireBrowse(ctx, issue.projectKey);
  if (!browse.ok) return browse;
  const raw = issue.properties[PROPERTY_KEYS.event];
  if (raw === undefined) return { ok: false, error: { code: "invalid-input", message: NO_SIGNAL_MESSAGE, retryable: false, noSignal: true } };
  const { config, warnings: cw } = await loadProjectConfig(ctx.ports.storage, issue.projectKey);
  const verified = verifyEvent(raw, config);
  if (!verified.ok) {
    const schemaErrors = verified.error.slice(0, 20).map((e) => ({ ...(e.path !== undefined ? { path: e.path } : {}), message: e.message }));
    return { ok: false, error: { code: "invalid-input", message: "The tt.event property on this issue is not valid signal data.", retryable: false, schemaErrors } };
  }
  const identity: IssueIdentity = { id: issue.id, key: issue.key, projectKey: issue.projectKey };
  const clusterRows = await loadProjectClusters(ctx.ports.storage, issue.projectKey);
  if (!clusterRows.ok) return fromPortError(clusterRows.error, "Reading the cluster index");
  const clusters = clusterIndex(clusterRows.value);
  const bucket = bucketId({ type: verified.value.event.sig.type, variant: verified.value.event.ctx.variant });
  const bucketRows = await loadBucketEvents(ctx.ports.storage, issue.projectKey, bucket);
  if (!bucketRows.ok) return fromPortError(bucketRows.error, "Reading the event index");
  const triage = triageOf(issue);
  const { chosen, all } = membershipFromLinks(issue.id, issue.links ?? [], (id) => clusters.byId.has(id), triage);
  const warnings = [...cw, ...verified.value.warnings];
  if (all.length > 1) warnings.push(`This event is linked to ${all.length} clusters (${all.map((c) => c.clusterKey).join(", ")}); ${chosen?.clusterKey ?? "the first"} is used.`);
  const counts = acceptedCounts(bucketRows.value);
  return {
    ok: true,
    value: { issue, identity, verified: verified.value, triage, config, clusters, counts, bucketRows: bucketRows.value, linked: chosen, extraLinks: all.filter((c) => c !== chosen), warnings },
  };
}

// ------------------------------------------------------------------ pure matching

export interface MatchInputs {
  readonly identity: IssueIdentity;
  readonly verified: VerifiedEvent;
  readonly bucketRows: readonly Keyed<EventRow>[];
  readonly clusters: ClusterIndex;
  readonly counts: ReadonlyMap<string, number>;
  readonly params: ClusterParams;
  readonly linked: LinkedCluster | null;
}

export interface MatchComputation {
  readonly view: MatchView;
  readonly membership: MembershipFields;
  readonly assignment: AssignmentResult | null;
}

export function eventOperand(v: VerifiedEvent): SimilarityOperand & { readonly key: string } {
  return { key: "", features: v.event.sig.features, chips: eventChips(v.event), flags: v.event.sig.flags };
}

function eventInput(identity: IssueIdentity, v: VerifiedEvent): ClusterInput {
  return {
    key: identity.key,
    issueNumber: issueNumberOf(identity.key) ?? 0,
    bucket: { type: v.event.sig.type, variant: v.event.ctx.variant },
    features: v.event.sig.features,
    chips: eventChips(v.event),
    state: "unassigned",
  };
}

/** Engine inputs for the bucket, excluding the event itself. */
function bucketInputs(inp: MatchInputs): ClusterInput[] {
  return inp.bucketRows.filter((r) => r.key !== inp.identity.id && r.value.issueKey !== inp.identity.key).map((r) => clusterInputOf(r.value, (id) => inp.clusters.keyOf(id)));
}

function refFor(inp: MatchInputs, clusterKey: string): ClusterRef | undefined {
  const id = inp.clusters.idByKey.get(clusterKey);
  const row = id === undefined ? undefined : inp.clusters.byId.get(id);
  return id === undefined || row === undefined ? undefined : clusterRefOf(id, row, inp.counts.get(id) ?? row.memberCount);
}

/** Profile operand of a cluster's accepted members within the inputs (the event excluded). */
function profileOperand(members: readonly ClusterInput[]): SimilarityOperand {
  const { profile, flags } = featureProfile(members);
  return { features: profile, chips: profileChips(members), flags };
}

function neighbourViews(ns: readonly { key: string; clusterKey: string; d: number }[]): NeighbourView[] {
  return ns.map((n) => ({ key: n.key, clusterKey: n.clusterKey, d: finiteOrNull(n.d) }));
}

/** Matches one event and builds the {@link MatchView} with why-rows, confidence and evidence. */
export function computeMatch(inp: MatchInputs): MatchComputation {
  const v = inp.verified;
  const ev = eventInput(inp.identity, v);
  const op = eventOperand(v);
  const tau = inp.params.tau;
  const others = bucketInputs(inp);
  const summary = eventSummaryOf(inp.identity, v.event, v.tampered);
  const headlines = [bucketHeadline(ev.bucket)];
  if (isUnknownBucket(ev.bucket)) headlines.push("Type unknown: matched only against other unknown-type events (warning)");
  const baseEvidence = [issueEvidence(inp.identity.key, "This event"), propertyEvidence(inp.identity.key, PROPERTY_KEYS.event, `tt.event v${v.event.v} (engine ${v.event.engine})`)];

  // Accepted (linked by a human): show that cluster, its fit and the neighbours inside it.
  if (inp.linked !== null) {
    const ref = refFor(inp, inp.linked.clusterKey) ?? { key: inp.linked.clusterKey, id: inp.linked.clusterId, name: inp.linked.clusterKey, bucket: summary.bucket, memberCount: inp.counts.get(inp.linked.clusterId) ?? 0, url: `/browse/${inp.linked.clusterKey}` };
    const members = others.filter((o) => o.state === "accepted" && o.clusterKey === inp.linked?.clusterKey);
    const ns = members
      .map((m) => ({ key: m.key, clusterKey: ref.key, d: explainDistance(op, m, inp.params.distance).d }))
      .sort((a, b) => a.d - b.d || (issueNumberOf(a.key) ?? 0) - (issueNumberOf(b.key) ?? 0))
      .slice(0, inp.params.k);
    const dStar = ns[0]?.d ?? null;
    const why = members.length > 0 ? explainDistance(op, profileOperand(members), inp.params.distance).rows.map(whyRowView) : [];
    if (ns[0] !== undefined) headlines.push(nearestHeadline(ns[0].key, ns[0].d, tau));
    const conf =
      dStar === null
        ? confidence(1, "Accepted by a person; no other member to compare with.")
        : confidence(1 - dStar / tau, MATCH_CONFIDENCE_DEFINITION, { dStar, tau });
    return {
      view: {
        event: summary,
        result: "accepted",
        cluster: ref,
        alternatives: [],
        dStar: finiteOrNull(dStar),
        tau,
        confidence: conf,
        neighbours: neighbourViews(ns),
        why,
        headlines: [...headlines, `Accepted into ${ref.key}`],
        evidence: dedupeEvidence([...baseEvidence, issueEvidence(ref.key, `Cluster: ${ref.name}`, ref.id), ...ns.map((n) => issueEvidence(n.key, "Nearest member"))]),
        message: `Accepted into ${ref.name}`,
      },
      membership: { status: "accepted", clusterId: inp.linked.clusterId, proposal: { kind: "none" }, nnDist: dStar ?? -1 },
      assignment: null,
    };
  }

  const a = assignEvent(ev, others, inp.params);
  if (a.kind === "first-of-kind") {
    return {
      view: {
        event: summary,
        result: "first-of-kind",
        alternatives: [],
        dStar: null,
        tau,
        confidence: confidence(0, "No match is made: the bucket has fewer than 2 accepted events (US-13 AC2)."),
        neighbours: [],
        why: [],
        headlines: [...headlines, `${FIRST_OF_KIND_MESSAGE}: fewer than 2 accepted events`],
        evidence: dedupeEvidence(baseEvidence),
        message: FIRST_OF_KIND_MESSAGE,
      },
      membership: { status: "novel", clusterId: "", proposal: { kind: "first-of-kind" }, nnDist: -1 },
      assignment: a,
    };
  }

  const targetKey = a.kind === "match" ? a.clusterKey : a.nearestClusterKey;
  const target = refFor(inp, targetKey);
  const members = others.filter((o) => o.state === "accepted" && o.clusterKey === targetKey);
  const explained = explainDistance(op, profileOperand(members), inp.params.distance);
  const why = explained.rows.map(whyRowView);
  const nearest = a.neighbours.find((n) => n.clusterKey === targetKey);
  if (nearest !== undefined) headlines.push(nearestHeadline(nearest.key, nearest.d, tau));
  const neighbourEvidence = a.neighbours.map((n) => issueEvidence(n.key, `Neighbour in ${n.clusterKey}`));
  const kVote = a.votes.find((x) => x.clusterKey === targetKey)?.score ?? 0;

  if (a.kind === "novel") {
    const split = splitHeadline(explained, tau);
    if (split !== null) headlines.push(split);
    return {
      view: {
        event: summary,
        result: "novel",
        alternatives: target !== undefined ? [target] : [],
        dStar: finiteOrNull(a.dStar),
        tau,
        confidence: confidence(0, MATCH_CONFIDENCE_DEFINITION, { dStar: a.dStar, tau, kVote }),
        neighbours: neighbourViews(a.neighbours),
        why,
        headlines,
        evidence: dedupeEvidence([...baseEvidence, ...(target !== undefined ? [issueEvidence(target.key, `Nearest cluster: ${target.name}`, target.id)] : []), ...neighbourEvidence]),
        message: `${NOVEL_MESSAGE}: nearest cluster ${targetKey} is beyond τ`,
      },
      membership: { status: "novel", clusterId: "", proposal: { kind: "novel", nearestClusterId: inp.clusters.idByKey.get(targetKey) ?? "" }, nnDist: a.dStar },
      assignment: a,
    };
  }

  const runner = a.runnerUp !== undefined ? refFor(inp, a.runnerUp.clusterKey) : undefined;
  if (a.ambiguous && a.runnerUp !== undefined) headlines.push(`Ambiguous: ${a.runnerUp.clusterKey} scores ${(a.runnerUp.score / (a.votes[0]?.score ?? 1)).toFixed(2)}x the winner`);
  return {
    view: {
      event: summary,
      result: a.ambiguous ? "ambiguous" : "match",
      ...(target !== undefined ? { cluster: target } : {}),
      alternatives: runner !== undefined ? [runner] : [],
      dStar: finiteOrNull(a.dStar),
      tau,
      confidence: confidence(a.confidence, MATCH_CONFIDENCE_DEFINITION, { dStar: a.dStar, tau, kVote }),
      neighbours: neighbourViews(a.neighbours),
      why,
      headlines,
      evidence: dedupeEvidence([...baseEvidence, ...(target !== undefined ? [issueEvidence(target.key, `Suggested cluster: ${target.name}`, target.id)] : []), ...(runner !== undefined ? [issueEvidence(runner.key, `Also close: ${runner.name}`, runner.id)] : []), ...neighbourEvidence]),
      message: a.ambiguous ? `Ambiguous between ${targetKey} and ${a.runnerUp?.clusterKey ?? "another cluster"}` : `Suggested cluster: ${target?.name ?? targetKey}`,
    },
    membership: { status: "proposed", clusterId: "", proposal: { kind: "suggest", clusterId: inp.clusters.idByKey.get(targetKey) ?? "" }, nnDist: a.dStar },
    assignment: a,
  };
}

export function matchInputsOf(ec: EventContext): MatchInputs {
  return { identity: ec.identity, verified: ec.verified, bucketRows: ec.bucketRows, clusters: ec.clusters, counts: ec.counts, params: clusterParamsOf(ec.config), linked: ec.linked };
}

// ------------------------------------------------------------------ services

/** "Triage now" (US-09): match synchronously and refresh the event's index row. */
export async function triageNow(ctx: ServiceContext, issueKey: string): Promise<ServiceResult<MatchView>> {
  const ec = await loadEventContext(ctx, issueKey);
  if (!ec.ok) return { ok: false, error: stripExtras(ec.error) };
  const m = computeMatch(matchInputsOf(ec.value));
  const r = await refreshRow(ctx, ec.value, m.membership);
  return done(m.view, [...ec.value.warnings, ...r.warnings]);
}

/** Why this event does or does not fit `clusterKey` (default: accepted, else best match). */
export async function explainMatch(ctx: ServiceContext, issueKey: string, clusterKey?: string): Promise<ServiceResult<ExplainView>> {
  const ec = await loadEventContext(ctx, issueKey);
  if (!ec.ok) return { ok: false, error: stripExtras(ec.error) };
  const e = ec.value;
  const params = clusterParamsOf(e.config);
  const chosenKey = clusterKey ?? e.linked?.clusterKey ?? defaultTarget(e, params);
  if (chosenKey === undefined) return fail("invalid-input", "There is no cluster to compare with yet (first of its kind in this bucket). Pass a cluster key.");
  const clusterId = e.clusters.idByKey.get(chosenKey);
  const row = clusterId === undefined ? undefined : e.clusters.byId.get(clusterId);
  if (clusterId === undefined || row === undefined) return fail("invalid-input", `${chosenKey} is not a known Takeover Triage cluster in this project.`);
  const clusterRead = await readIssueAsUser(ctx, chosenKey);
  if (!clusterRead.ok) return clusterRead;
  const memberRows = await ctx.ports.storage.queryEntities("event", { index: "by-cluster", partition: [clusterId], limit: 100 });
  if (!memberRows.ok) return fromPortError(memberRows.error, "Reading cluster members");
  const members = memberRows.value.items
    .filter((r) => r.value.status === "accepted" && r.value.issueKey !== e.identity.key)
    .map((r) => clusterInputOf(r.value, (id) => e.clusters.keyOf(id)));
  const op = eventOperand(e.verified);
  const explained = explainDistance(op, profileOperand(members), params.distance);
  const tau = params.tau;
  const sameBucket = row.bucket === bucketId({ type: e.verified.event.sig.type, variant: e.verified.event.ctx.variant });
  const within = explained.d <= tau;
  const bucketRule = sameBucket ? bucketHeadline({ type: e.verified.event.sig.type, variant: e.verified.event.ctx.variant }) : `Different bucket: event ${e.verified.event.sig.type} x ${e.verified.event.ctx.variant}, cluster ${row.bucket.replace("|", " x ")}`;
  const headline = within ? `Within τ: d=${explained.d.toFixed(2)} ≤ τ=${tau.toFixed(2)}${sameBucket ? "" : " (but the bucket differs, so kNN never compares them)"}` : (splitHeadline(explained, tau) ?? `d exceeds τ=${tau.toFixed(2)}`);
  const ref = clusterRefOf(clusterId, row, members.length + (e.linked?.clusterKey === chosenKey ? 1 : 0));
  return done(
    {
      event: eventSummaryOf(e.identity, e.verified.event, e.verified.tampered),
      cluster: ref,
      bucketRule,
      sameBucket,
      dSig: finiteOrNull(explained.dSig),
      dCond: explained.dCond,
      d: finiteOrNull(explained.d),
      tau,
      decision: within ? "within-tau" : "exceeds-tau",
      topContributors: topContributors(explained, 3),
      chipDifference: explained.chipDiff,
      why: explained.rows.map(whyRowView),
      headline,
      evidence: dedupeEvidence([issueEvidence(e.identity.key, "This event"), issueEvidence(ref.key, `Cluster: ${ref.name}`, ref.id), ...members.slice(0, 10).map((m) => issueEvidence(m.key, "Cluster member"))]),
      confidence: confidence(1 - explained.d / tau, "clamp(1 − d/τ, 0, 1) with d the distance to the cluster profile (per-feature median of accepted members)", { d: explained.d, tau }),
    },
    e.warnings,
  );
}

function defaultTarget(e: EventContext, params: ClusterParams): string | undefined {
  const m = computeMatch({ ...matchInputsOf(e), params });
  return m.view.cluster?.key ?? m.view.alternatives[0]?.key;
}

export function stripExtras(e: ServiceError & { readonly noSignal?: boolean; readonly schemaErrors?: readonly { path?: string; message: string }[] }): ServiceError {
  const details = e.schemaErrors ?? e.details;
  return { code: e.code, message: e.message, retryable: e.retryable, ...(details !== undefined && details.length > 0 ? { details } : {}) };
}
