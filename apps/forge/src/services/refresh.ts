/**
 * Lazy re-processing (ARCHITECTURE §7.5, D12): when a panel opens (or "Triage now" runs), the
 * verified property and the Jira links are compared with the `event` index row. A missing or
 * stale row is upserted from the property (recomputed `sig`, D2); a membership mismatch is
 * fixed from the links (truth, §15 #12). Either case queues `tt-recluster` with
 * `reason: "panel-lazy"` for the bucket.
 */
import { bucketId } from "@tt/engine";
import type { ServiceContext } from "../context";
import type { EventRow } from "../ports/entities";
import { invalidateBoard, withMembership, type MembershipFields } from "./index-store";
import type { EventContext } from "./match";
import { propertyRow, rowIsStale } from "./verify";

export interface RefreshOutcome {
  readonly reprocessed: boolean;
  readonly reason?: string;
  readonly outOfSync: boolean;
  readonly warnings: readonly string[];
}

function sameMembership(row: EventRow, next: EventRow): boolean {
  return row.status === next.status && row.clusterId === next.clusterId && row.proposalId === next.proposalId && Math.abs(row.nnDist - next.nnDist) < 1e-9;
}

export async function refreshRow(ctx: ServiceContext, ec: EventContext, membership: MembershipFields): Promise<RefreshOutcome> {
  const { storage, queue, clock } = ctx.ports;
  const fromBucket = ec.bucketRows.find((r) => r.key === ec.identity.id)?.value;
  const existing = fromBucket ?? (await storage.getEntity("event", ec.identity.id).then((r) => (r.ok ? r.value : undefined)));
  const derived = propertyRow(ec.identity, ec.verified);
  const stale = rowIsStale(existing, ec.identity, derived);
  const rowAccepted = existing?.status === "accepted" ? existing.clusterId : null;
  const linkAccepted = ec.linked?.clusterId ?? null;
  const outOfSync = existing !== undefined && rowAccepted !== linkAccepted;
  const next = withMembership({ ...derived, nnDist: membership.nnDist }, membership, clock);
  const warnings: string[] = [];
  let reason: string | undefined;
  if (existing === undefined) reason = "the event was not indexed yet";
  else if (stale) reason = existing.engine !== next.engine ? `the index was computed with engine ${existing.engine}` : "the stored signal data changed";
  else if (outOfSync) reason = "the Jira links changed outside the app";
  if (stale || outOfSync || existing === undefined || !sameMembership(existing, next)) {
    const w = await storage.putEntity("event", ec.identity.id, next);
    if (!w.ok) warnings.push("The search index could not be updated; Re-sync will repair it.");
  }
  if (outOfSync) warnings.push("Out of sync: the Jira links differ from the index; the links are used (Re-sync repairs the rest).");
  if (reason !== undefined) {
    await invalidateBoard(storage, ec.identity.projectKey);
    const bucket = bucketId({ type: ec.verified.event.sig.type, variant: ec.verified.event.ctx.variant });
    const pushed = await queue.pushRecluster({ projectKey: ec.identity.projectKey, bucket, reason: "panel-lazy", requestedAt: clock.nowIso(), ...(ctx.accountId !== undefined ? { requestedBy: ctx.accountId } : {}) });
    if (!pushed.ok) warnings.push("Background re-clustering could not be queued; the board may lag until Re-sync.");
  }
  return { reprocessed: reason !== undefined, ...(reason !== undefined ? { reason } : {}), outOfSync, warnings };
}
