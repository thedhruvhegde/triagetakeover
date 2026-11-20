/**
 * `commitEvent` (ARCHITECTURE §1.1 steps 16–24) and the shared event write path.
 *
 * Order (§7.5): validate → recompute `sig` from `tel` (D2) → size check → PUT `tt.event`
 * (+ `tt.thumbs`) → upsert the `event` row → match synchronously → queue `tt-recluster`
 * (`reason: "intake"`). The property is written before the entity, so a failed entity write is
 * repaired by lazy panel re-processing or Re-sync.
 *
 * {@link writeEventProperties} + {@link indexEvent} are also what the demo seed uses (asApp),
 * so seeded and real events take the same server path (PRD US-01 AC2).
 */
import { PROPERTY_LIMIT_BYTES, TT_EVENT_TARGET_BYTES, bucketId, checkPropertySize, serializedSize, type TtEvent, type TtThumbs } from "@tt/engine";
import type { AttachmentReport, CommitResult } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import type { Clock } from "../ports/clock";
import type { EventRow } from "../ports/entities";
import type { JiraPort } from "../ports/jira";
import { LABELS, PROPERTY_KEYS } from "../ports/properties";
import { ok, type PortResult } from "../ports/result";
import type { StoragePort } from "../ports/storage";
import { parseCommitDraft } from "../validation/payloads";
import { userPort } from "./auth";
import { loadProjectConfig, type ProjectConfig } from "./config";
import { detailsOf, done, fail, fromPortError, type ServiceResult } from "./errors";
import { eventRowOf, invalidateBoard, UNASSIGNED, type IssueIdentity, type MembershipFields } from "./index-store";
import { computeMatch, loadEventContext, matchInputsOf, stripExtras } from "./match";
import { refreshRow } from "./refresh";
import { verifyEvent, type VerifiedEvent } from "./verify";

export const ATTACHMENT_DIAG_KEY = "diag:attachments";

/** Writes `tt.event` (recomputed sig) and optionally `tt.thumbs`. Returns their byte sizes. */
export async function writeEventProperties(jira: JiraPort, issueId: string, event: TtEvent, thumbs: TtThumbs | undefined): Promise<PortResult<{ event: number; thumbs: number | null }>> {
  const size = serializedSize(event);
  const eventBytes = size.ok ? size.value : PROPERTY_LIMIT_BYTES + 1;
  const w = await jira.setIssueProperty(issueId, PROPERTY_KEYS.event, event);
  if (!w.ok) return w;
  let thumbBytes: number | null = null;
  if (thumbs !== undefined) {
    const t = await jira.setIssueProperty(issueId, PROPERTY_KEYS.thumbs, thumbs);
    if (!t.ok) return t;
    const ts = serializedSize(thumbs);
    thumbBytes = ts.ok ? ts.value : null;
  }
  return ok({ event: eventBytes, thumbs: thumbBytes });
}

/** Upserts the index row for a verified event with the given membership. */
export async function indexEvent(storage: StoragePort, clock: Clock, issue: IssueIdentity, verified: VerifiedEvent, membership: MembershipFields = UNASSIGNED): Promise<PortResult<EventRow>> {
  const row = eventRowOf(issue, verified.event, membership, clock);
  const w = await storage.putEntity("event", issue.id, row);
  return w.ok ? ok(row) : w;
}

/**
 * Verifies an untrusted `tt.event` value for writing: schema, recomputed signature and the
 * hard 32,768-byte limit (the 12 KB design target is enforced by `parseCommitDraft`).
 */
export function prepareEventForWrite(raw: unknown, config: Pick<ProjectConfig, "ruleThresholds">): { ok: true; verified: VerifiedEvent } | { ok: false; message: string; details: { path?: string; message: string }[] } {
  const v = verifyEvent(raw, config);
  if (!v.ok) return { ok: false, message: "The signal data is not valid.", details: detailsOf(v.error, "event") };
  const size = checkPropertySize(v.value.event, PROPERTY_LIMIT_BYTES);
  if (!size.ok) return { ok: false, message: "Signal data could not be stored: it is larger than Jira's 32,768-byte property limit.", details: detailsOf(size.error, "event") };
  return { ok: true, verified: v.value };
}

const NOT_ATTACHED = "Raw files were not attached; the signature, metrics and thumbnails are stored.";

/** The intake commit (create and attach modes). The issue already exists (created by the browser or `createTakeoverIssue`). */
export async function commitEvent(ctx: ServiceContext, payload: unknown): Promise<ServiceResult<CommitResult>> {
  const p = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const draft = parseCommitDraft({ issueKey: p["issueKey"], event: p["event"], ...(p["thumbs"] !== undefined ? { thumbs: p["thumbs"] } : {}) });
  if (!draft.ok) return fail("invalid-input", "The event draft is not valid.", detailsOf(draft.error));
  const attachments = attachmentReportOf(p["attachments"]);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const issue = await jira.value.getIssue(draft.value.issueKey, { properties: [PROPERTY_KEYS.event] });
  if (!issue.ok) return fromPortError(issue.error, `Reading ${draft.value.issueKey}`);
  const { config } = await loadProjectConfig(ctx.ports.storage, issue.value.projectKey);
  if (!config.enabled) return fail("not-configured", `Takeover Triage is disabled for project ${issue.value.projectKey}.`);
  const prepared = prepareEventForWrite(draft.value.event, config);
  if (!prepared.ok) return fail(prepared.message.includes("32,768") ? "property-too-large" : "invalid-input", prepared.message, prepared.details);
  const verified = prepared.verified;
  const warnings: string[] = [...verified.warnings];
  const sizeWarn = checkPropertySize(verified.event, TT_EVENT_TARGET_BYTES);
  if (!sizeWarn.ok) warnings.push("The signal data is larger than the 12 KB design target.");

  const written = await writeEventProperties(jira.value, issue.value.id, verified.event, draft.value.thumbs);
  if (!written.ok) return fromPortError(written.error, "Writing the signal data");
  if (!issue.value.labels.includes(LABELS.takeover)) {
    // Label typing is the Re-sync fallback selector (SPIKE-E1). Best effort.
    const l = await jira.value.updateIssue(issue.value.id, { labelsAdd: [LABELS.takeover] });
    if (!l.ok) warnings.push(`Could not add the ${LABELS.takeover} label; Re-sync can still find the event by its property index.`);
  }
  const identity: IssueIdentity = { id: issue.value.id, key: issue.value.key, projectKey: issue.value.projectKey };
  const indexed = await indexEvent(ctx.ports.storage, ctx.ports.clock, identity, verified);
  if (!indexed.ok) warnings.push("The search index could not be updated now; it is repaired when the panel opens or on Re-sync.");

  await recordAttachmentOutcome(ctx, attachments);
  if (attachments.status !== "uploaded") warnings.push(NOT_ATTACHED);

  // Match synchronously on the stored data (re-read so links and triage are included).
  const ec = await loadEventContext(ctx, identity.key);
  if (!ec.ok) return { ok: false, error: stripExtras(ec.error) };
  const m = computeMatch(matchInputsOf(ec.value));
  const refreshed = await refreshRow(ctx, ec.value, m.membership);
  await invalidateBoard(ctx.ports.storage, identity.projectKey);
  const bucket = bucketId({ type: verified.event.sig.type, variant: verified.event.ctx.variant });
  const pushed = await ctx.ports.queue.pushRecluster({ projectKey: identity.projectKey, bucket, reason: "intake", requestedAt: ctx.ports.clock.nowIso(), ...(ctx.accountId !== undefined ? { requestedBy: ctx.accountId } : {}) });
  if (!pushed.ok) warnings.push("Background re-clustering could not be queued; use Re-sync now if the board looks stale.");
  const all = [...new Set([...warnings, ...ec.value.warnings.filter((w) => !warnings.includes(w)), ...refreshed.warnings])];
  return done({ issueKey: identity.key, propertyBytes: written.value, recomputed: verified.tampered, match: m.view, attachments }, all);
}

export function attachmentReportOf(u: unknown): AttachmentReport {
  if (typeof u !== "object" || u === null) return { via: "none", status: "skipped" };
  const r = u as Record<string, unknown>;
  const via = r["via"] === "browser" || r["via"] === "backend" ? r["via"] : "none";
  const status = r["status"] === "uploaded" || r["status"] === "failed" ? r["status"] : "skipped";
  const error = typeof r["error"] === "string" ? r["error"].slice(0, 200) : undefined;
  return { via, status, ...(error !== undefined ? { error } : {}) };
}

/** Remembers the last attachment outcome per path for Diagnostics (SPIKE-I2 evidence). */
export async function recordAttachmentOutcome(ctx: ServiceContext, report: AttachmentReport): Promise<void> {
  if (report.via === "none") return;
  const prev = await ctx.ports.storage.get(ATTACHMENT_DIAG_KEY);
  const base = prev.ok && typeof prev.value === "object" && prev.value !== null ? (prev.value as Record<string, unknown>) : {};
  await ctx.ports.storage.set(ATTACHMENT_DIAG_KEY, { ...base, [report.via]: { status: report.status, at: ctx.ports.clock.nowIso(), ...(report.error !== undefined ? { error: report.error } : {}) } });
}
