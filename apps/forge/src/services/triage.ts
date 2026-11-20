/**
 * Accept / Split / Undo (PRD US-11, ARCHITECTURE §7.5). Every write is behind a click (or an
 * explicit, confirmed chat request) and runs asUser, so Jira's permissions and audit apply.
 * Order: Jira (link / issue) → `tt.triage` → index. Undo reverses in the same order.
 */
import { bucketId, assignEvent, issueNumberOf } from "@tt/engine";
import type { ClusterRef, TriageActionResult } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { PROPERTY_KEYS } from "../ports/properties";
import { popUndo, pushUndo, readUndoStack } from "./undo";
import { undoRoute } from "./route";
import { readIssueAsUser, requireAccount, userPort } from "./auth";
import { adjustMemberCount, createClusterIssue, linkMember, nextTriage } from "./clusters";
import { clusterParamsOf } from "./config";
import { done, fail, fromPortError, type ServiceResult } from "./errors";
import { issueEvidence } from "./evidence";
import { clusterInputOf, clusterRefOf, eventChips, invalidateBoard, withMembership, type Keyed } from "./index-store";
import { clusterPropOf, isClusterIssue, membershipFromLinks, resolveLinkType, triageOf } from "./jira-io";
import { loadEventContext, stripExtras, type EventContext } from "./match";
import type { EventRow } from "../ports/entities";
import { sanitizeText } from "../validation/inputs";

function result(partial: Omit<TriageActionResult, "proposedMembers" | "evidence" | "undoAvailable" | "alreadyDone" | "created"> & Partial<Pick<TriageActionResult, "proposedMembers" | "evidence" | "undoAvailable" | "alreadyDone" | "created">>): TriageActionResult {
  return { proposedMembers: [], evidence: [], undoAvailable: false, alreadyDone: false, created: false, ...partial };
}

async function pushRecluster(ctx: ServiceContext, projectKey: string, bucket: string, reason: "accept" | "split" | "undo"): Promise<string[]> {
  await invalidateBoard(ctx.ports.storage, projectKey);
  const r = await ctx.ports.queue.pushRecluster({ projectKey, bucket, reason, requestedAt: ctx.ports.clock.nowIso(), ...(ctx.accountId !== undefined ? { requestedBy: ctx.accountId } : {}) });
  return r.ok ? [] : ["Background re-clustering could not be queued; the board may lag until Re-sync."];
}

function bucketOf(ec: EventContext): string {
  return bucketId({ type: ec.verified.event.sig.type, variant: ec.verified.event.ctx.variant });
}

// ------------------------------------------------------------------ accept

/** Accept: link the event to the cluster issue and record it (idempotent, §7.5; §15 #21). */
export async function acceptMatch(ctx: ServiceContext, issueKey: string, clusterKey: string): Promise<ServiceResult<TriageActionResult>> {
  const by = requireAccount(ctx);
  if (!by.ok) return by;
  const ecr = await loadEventContext(ctx, issueKey);
  if (!ecr.ok) return { ok: false, error: stripExtras(ecr.error) };
  const ec = ecr.value;
  const cluster = await readIssueAsUser(ctx, clusterKey, { properties: [PROPERTY_KEYS.cluster] });
  if (!cluster.ok) return cluster;
  if (!isClusterIssue(cluster.value)) return fail("invalid-input", `${clusterKey} is not a Takeover Triage cluster issue (label tt-cluster).`);
  if (cluster.value.projectKey !== ec.identity.projectKey) return fail("invalid-input", "The cluster must be in the same project as the event.");
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const clusterId = cluster.value.id;
  const warnings = [...ec.warnings];
  // Make sure the index knows the cluster (it may have been created by another tool).
  await ensureClusterRow(ctx, cluster.value.id, cluster.value.key, ec, clusterPropOf(cluster.value)?.bucket);
  const links = membershipFromLinks(ec.identity.id, ec.issue.links ?? [], (id) => id === clusterId || ec.clusters.byId.has(id), ec.triage);
  const toThis = links.all.find((l) => l.clusterId === clusterId);
  const other = links.all.find((l) => l.clusterId !== clusterId);
  if (other !== undefined) return fail("conflict", `${issueKey} is already accepted into ${other.clusterKey}. Undo that first, then accept into ${clusterKey}.`);
  const ref = clusterRefOf(clusterId, (await ctx.ports.storage.getEntity("cluster", clusterId).then((r) => (r.ok ? r.value : undefined))) ?? fallbackClusterRow(cluster.value.key, ec));
  if (toThis !== undefined && ec.triage?.state === "accepted" && ec.triage.clusterKey === clusterKey) {
    return done(
      result({
        action: "accept",
        summary: `Already linked to ${clusterKey} by ${ec.triage.by} at ${ec.triage.at}.`,
        alreadyDone: true,
        cluster: ref,
        evidence: [issueEvidence(issueKey, "Event"), issueEvidence(clusterKey, "Cluster", clusterId)],
      }),
      warnings,
    );
  }
  const lt = await resolveLinkType(ctx, jira.value, ec.config);
  if (lt === null) return fail("not-configured", "This site has no issue link types; an administrator must create one (e.g. Relates).");
  if (lt.fellBack) warnings.push(`Link type "${ec.config.linkType}" is not available; "${lt.name}" was used.`);
  if (bucketOf(ec) !== ref.bucket) warnings.push(`The event's bucket (${bucketOf(ec)}) differs from the cluster's (${ref.bucket}); matching only compares events within a bucket.`);
  const linked = await linkMember(jira.value, ctx.ports.storage, ctx.ports.clock, {
    event: ec.identity,
    eventEvent: ec.verified.event,
    cluster: { id: clusterId, key: clusterKey },
    linkType: lt.name,
    prevTriage: ec.triage,
    by: by.value,
    action: "accept",
    ...(toThis !== undefined ? { existingLinkId: toThis.linkId } : {}),
  });
  if (!linked.ok) return fromPortError(linked.error, "Accepting the match");
  const summary = linked.value.created ? `Linked ${issueKey} to cluster ${clusterKey} (${lt.name}) and recorded the acceptance.` : `${issueKey} was already linked to ${clusterKey}; recorded the acceptance.`;
  if (linked.value.created) {
    await pushUndo(ctx.ports.storage, issueKey, { action: "accept", by: by.value, at: ctx.ports.clock.nowIso(), eventId: ec.identity.id, eventKey: issueKey, clusterId, clusterKey, linkId: linked.value.linkId, createdCluster: false, summary });
  }
  warnings.push(...(await pushRecluster(ctx, ec.identity.projectKey, bucketOf(ec), "accept")));
  return done(
    result({
      action: "accept",
      summary,
      created: linked.value.created,
      alreadyDone: !linked.value.created,
      cluster: { ...ref, memberCount: ref.memberCount + (linked.value.created ? 1 : 0) },
      link: { id: linked.value.linkId, type: lt.name, inward: issueKey, outward: clusterKey },
      undoAvailable: linked.value.created,
      evidence: [issueEvidence(issueKey, "Event"), issueEvidence(clusterKey, "Cluster", clusterId)],
    }),
    warnings,
  );
}

function fallbackClusterRow(key: string, ec: EventContext) {
  return { issueKey: key, projectKey: ec.identity.projectKey, bucket: bucketOf(ec), nameDet: key, memberCount: 0, firstBuild: "", ownerRule: "", status: "active", profile: null, onset: null, coverage: null, updatedAt: 0, synthetic: false };
}

/** Creates the cluster row when a `tt-cluster` issue is not indexed yet. */
async function ensureClusterRow(ctx: ServiceContext, clusterId: string, clusterKey: string, ec: EventContext, bucket: string | undefined): Promise<void> {
  if (ec.clusters.byId.has(clusterId)) return;
  const existing = await ctx.ports.storage.getEntity("cluster", clusterId);
  if (existing.ok && existing.value !== undefined) return;
  await ctx.ports.storage.putEntity("cluster", clusterId, { ...fallbackClusterRow(clusterKey, ec), bucket: bucket ?? bucketOf(ec), updatedAt: Math.floor(ctx.ports.clock.nowMs() / 1000) });
}

// ------------------------------------------------------------------ split

/**
 * Split (US-11 AC2): a new cluster issue seeded with this event, with a deterministic name
 * (or the user's). Matching is re-run for the bucket's other unassigned events and the ones
 * that would now match are PROPOSED, never linked.
 */
export async function splitEvent(ctx: ServiceContext, issueKey: string, name?: string): Promise<ServiceResult<TriageActionResult>> {
  const by = requireAccount(ctx);
  if (!by.ok) return by;
  const ecr = await loadEventContext(ctx, issueKey);
  if (!ecr.ok) return { ok: false, error: stripExtras(ecr.error) };
  const ec = ecr.value;
  if (ec.linked !== null) return fail("conflict", `${issueKey} is already accepted into ${ec.linked.clusterKey}. Undo that first, then split.`);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const lt = await resolveLinkType(ctx, jira.value, ec.config);
  if (lt === null) return fail("not-configured", "This site has no issue link types; an administrator must create one (e.g. Relates).");
  const warnings = [...ec.warnings];
  const cleanName = name === undefined ? undefined : sanitizeText(name, 80);
  const bucket = { type: ec.verified.event.sig.type, variant: ec.verified.event.ctx.variant };
  const created = await createClusterIssue(jira.value, ctx.ports.storage, ctx.ports.clock, {
    projectKey: ec.identity.projectKey,
    issueType: ec.config.clusterIssueType,
    bucket,
    memberChips: [eventChips(ec.verified.event)],
    ...(cleanName !== undefined && cleanName !== "" ? { name: cleanName } : {}),
    synthetic: ec.verified.event.synthetic,
    createdBy: by.value,
    origin: `Created by Split from ${issueKey}.`,
  });
  if (!created.ok) return fromPortError(created.error, "Creating the cluster issue");
  const clusterId = created.value.ref.id;
  const clusterKey = created.value.ref.key;
  const linked = await linkMember(jira.value, ctx.ports.storage, ctx.ports.clock, {
    event: ec.identity,
    eventEvent: ec.verified.event,
    cluster: { id: clusterId, key: clusterKey },
    linkType: lt.name,
    prevTriage: ec.triage,
    by: by.value,
    action: "split",
  });
  if (!linked.ok) {
    warnings.push(`Cluster ${clusterKey} was created, but linking ${issueKey} failed. Accept it into ${clusterKey} or delete ${clusterKey}.`);
    return fromPortError(linked.error, "Linking the event to the new cluster");
  }
  const proposedMembers = await proposeForNewCluster(ctx, ec, clusterId, clusterKey);
  const summary = `Created cluster ${clusterKey} "${created.value.displayName}" from ${issueKey} and linked it (${lt.name}).${proposedMembers.length > 0 ? ` Proposed (not linked): ${proposedMembers.join(", ")}.` : ""}`;
  await pushUndo(ctx.ports.storage, issueKey, { action: "split", by: by.value, at: ctx.ports.clock.nowIso(), eventId: ec.identity.id, eventKey: issueKey, clusterId, clusterKey, linkId: linked.value.linkId, createdCluster: true, summary });
  warnings.push(...(await pushRecluster(ctx, ec.identity.projectKey, bucketOf(ec), "split")));
  const ref: ClusterRef = { key: clusterKey, id: clusterId, name: created.value.displayName, bucket: created.value.row.bucket, memberCount: 1, url: `/browse/${clusterKey}` };
  return done(
    result({
      action: "split",
      summary,
      created: true,
      cluster: ref,
      link: { id: linked.value.linkId, type: lt.name, inward: issueKey, outward: clusterKey },
      proposedMembers,
      nameSource: cleanName !== undefined && cleanName !== "" ? "user" : "deterministic",
      undoAvailable: true,
      evidence: [issueEvidence(issueKey, "Seed event"), issueEvidence(clusterKey, "New cluster", clusterId), ...proposedMembers.map((k) => issueEvidence(k, "Proposed member (not linked)"))],
    }),
    warnings,
  );
}

/** Re-runs kNN for the bucket's non-accepted events; marks those now matching the new cluster as proposed. */
async function proposeForNewCluster(ctx: ServiceContext, ec: EventContext, clusterId: string, clusterKey: string): Promise<string[]> {
  const keyOf = (id: string): string | undefined => (id === clusterId ? clusterKey : ec.clusters.keyOf(id));
  const rows: Keyed<EventRow>[] = ec.bucketRows.map((r) => (r.key === ec.identity.id ? { key: r.key, value: { ...r.value, status: "accepted", clusterId } } : r));
  if (!rows.some((r) => r.key === ec.identity.id)) {
    const own = await ctx.ports.storage.getEntity("event", ec.identity.id);
    if (own.ok && own.value !== undefined) rows.push({ key: ec.identity.id, value: own.value });
  }
  const inputs = rows.map((r) => clusterInputOf(r.value, keyOf));
  const params = clusterParamsOf(ec.config);
  const out: string[] = [];
  for (const r of rows) {
    if (r.value.status === "accepted" || r.key === ec.identity.id) continue;
    const me = clusterInputOf(r.value, keyOf);
    const a = assignEvent(me, inputs, params);
    if (a.kind === "match" && a.clusterKey === clusterKey) {
      out.push(r.value.issueKey);
      await ctx.ports.storage.putEntity("event", r.key, withMembership(r.value, { status: "proposed", clusterId: "", proposal: { kind: "suggest", clusterId }, nnDist: a.dStar }, ctx.ports.clock));
    }
  }
  return out.sort((a, b) => (issueNumberOf(a) ?? 0) - (issueNumberOf(b) ?? 0));
}

// ------------------------------------------------------------------ undo

/** Undo the newest Accept / Split / Route started from this issue (US-11 AC4). */
export async function undoLast(ctx: ServiceContext, issueKey: string): Promise<ServiceResult<TriageActionResult>> {
  const by = requireAccount(ctx);
  if (!by.ok) return by;
  const read = await readIssueAsUser(ctx, issueKey, { properties: [PROPERTY_KEYS.triage] });
  if (!read.ok) return read;
  const stack = await readUndoStack(ctx.ports.storage, issueKey);
  const rec = stack[stack.length - 1];
  if (rec === undefined) return fail("invalid-input", "There is nothing to undo for this issue.");
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const warnings: string[] = [];
  if (rec.action === "route") {
    const r = await undoRoute(ctx, rec);
    if (!r.ok) return r;
    await popUndo(ctx.ports.storage, issueKey);
    return done(result({ action: "undo", summary: r.value, created: false, evidence: [issueEvidence(rec.clusterKey, "Cluster")] }), warnings);
  }
  // Jira first: delete the link (it may already be gone if someone removed it by hand).
  const links = read.value.links ?? [];
  const link = links.find((l) => l.id === rec.linkId) ?? links.find((l) => l.inwardIssue.id === rec.clusterId || l.outwardIssue.id === rec.clusterId);
  if (link !== undefined) {
    const d = await jira.value.deleteIssueLink(link.id);
    if (!d.ok && d.error.kind !== "not-found") return fromPortError(d.error, "Removing the link");
  } else warnings.push("The link was already removed in Jira.");
  // Then tt.triage.
  const t = nextTriage(triageOf(read.value), { state: "none", by: by.value, at: ctx.ports.clock.nowIso(), action: `undo-${rec.action}`, clusterKey: rec.clusterKey });
  const tw = await jira.value.setIssueProperty(read.value.id, PROPERTY_KEYS.triage, t);
  if (!tw.ok) return fromPortError(tw.error, "Recording the undo");
  // Then the index.
  const row = await ctx.ports.storage.getEntity("event", read.value.id);
  if (row.ok && row.value !== undefined) {
    await ctx.ports.storage.putEntity("event", read.value.id, withMembership(row.value, { status: "unassigned", clusterId: "", proposal: { kind: "none" }, nnDist: -1 }, ctx.ports.clock));
  }
  await adjustMemberCount(ctx.ports.storage, ctx.ports.clock, rec.clusterId, -1);
  let summary = `Removed the link from ${issueKey} to ${rec.clusterKey}.`;
  if (rec.action === "split" && rec.createdCluster) summary += await retireSplitCluster(ctx, rec.clusterId, rec.clusterKey, warnings);
  await popUndo(ctx.ports.storage, issueKey);
  const bucket = row.ok && row.value !== undefined ? row.value.bucket : undefined;
  if (bucket !== undefined) warnings.push(...(await pushRecluster(ctx, read.value.projectKey, bucket, "undo")));
  else await invalidateBoard(ctx.ports.storage, read.value.projectKey);
  return done(result({ action: "undo", summary, created: false, evidence: [issueEvidence(issueKey, "Event"), issueEvidence(rec.clusterKey, "Cluster")] }), warnings);
}

/** After undoing a Split: delete the new cluster issue if nothing else links to it, else keep it empty. */
async function retireSplitCluster(ctx: ServiceContext, clusterId: string, clusterKey: string, warnings: string[]): Promise<string> {
  const jira = ctx.ports.jira.asUser();
  const c = await jira.getIssue(clusterId);
  if (!c.ok) return "";
  if ((c.value.links ?? []).length === 0) {
    const d = await jira.deleteIssue(clusterId);
    if (d.ok) {
      await ctx.ports.storage.deleteEntity("cluster", clusterId);
      return ` Deleted the empty cluster issue ${clusterKey}.`;
    }
    warnings.push(`Could not delete ${clusterKey} (no delete permission); it is kept with no members.`);
  } else warnings.push(`${clusterKey} has other links, so it was kept.`);
  const r = await ctx.ports.storage.getEntity("cluster", clusterId);
  if (r.ok && r.value !== undefined) await ctx.ports.storage.putEntity("cluster", clusterId, { ...r.value, status: "empty", memberCount: 0 });
  return ` Kept ${clusterKey} with no members.`;
}

