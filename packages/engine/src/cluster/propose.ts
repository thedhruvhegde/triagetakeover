/**
 * Batch proposal for the `tt-recluster` consumer (ARCHITECTURE §5.8 step 3).
 *
 * Per bucket: every non-accepted event (states `unassigned`, `proposed`, `novel` — the
 * engine's own earlier outputs are re-derived) is first run through {@link assignEvent}.
 * Matches are reported; the rest is grouped by average-linkage HAC. Groups of ≥ 2 become
 * proposed clusters, singletons become novel. Accepted events are never in the output.
 * Input is canonically sorted first, so the result is invariant to input order.
 */
import { type AssignmentResult, type ClusterInput, type ProposeResult, type ProposedCluster } from "../schema/index.js";
import { distance } from "../similarity/index.js";
import { assignEvent, isAcceptedMember } from "./assign.js";
import { groupByBucket, type BucketGroup } from "./bucket.js";
import { averageLinkageHac } from "./hac.js";
import { canonicalSort, compareKeyed, compareStrings } from "./order.js";
import { assertClusterParams, DEFAULT_CLUSTER_PARAMS, type ClusterParams } from "./params.js";

type Match = AssignmentResult & { readonly kind: "match" };

/** Mutable accumulator for {@link ProposeResult}. */
interface Acc {
  assigned: { key: string; issueNumber: number; result: Match }[];
  proposed: (ProposedCluster & { first: ClusterInput })[];
  novel: ClusterInput[];
}

function proposeBucket(group: BucketGroup<ClusterInput>, params: ClusterParams, acc: Acc): void {
  const events = canonicalSort(group.items);
  const accepted = events.filter(isAcceptedMember);
  const rest: ClusterInput[] = [];
  for (const e of events) {
    if (e.state === "accepted") continue;
    const r = assignEvent(e, accepted, params);
    if (r.kind === "match") acc.assigned.push({ key: e.key, issueNumber: e.issueNumber, result: r });
    else rest.push(e);
  }
  const groups = averageLinkageHac(
    rest.length,
    (i, j) => distance(rest[i] as ClusterInput, rest[j] as ClusterInput, params.distance),
    params.tau,
  );
  for (const g of groups) {
    const members = g.map((i) => rest[i] as ClusterInput);
    const first = members[0];
    if (first === undefined) continue;
    if (members.length === 1) acc.novel.push(first);
    else acc.proposed.push({ id: first.key, bucket: group.bucket, members: members.map((m) => m.key), first });
  }
}

/**
 * Runs step 1 (kNN) and step 3 (HAC) over every bucket. Pure: proposals are returned,
 * nothing is written. Output lists are in canonical (issue number, key) order;
 * proposed clusters are ordered by their first member.
 * Throws RangeError on invalid params, or on duplicate keys.
 */
export function proposeClusters(
  events: readonly ClusterInput[],
  params: ClusterParams = DEFAULT_CLUSTER_PARAMS,
): ProposeResult {
  assertClusterParams(params);
  assertUniqueKeys(events);
  const acc: Acc = { assigned: [], proposed: [], novel: [] };
  for (const group of groupByBucket(events)) proposeBucket(group, params, acc);
  return {
    assigned: acc.assigned.sort(compareKeyed).map(({ key, result }) => ({ key, result })),
    proposed: acc.proposed
      .sort((a, b) => compareKeyed(a.first, b.first) || compareStrings(a.id, b.id))
      .map(({ id, bucket, members }) => ({ id, bucket, members })),
    novel: canonicalSort(acc.novel).map((e) => e.key),
  };
}

function assertUniqueKeys(events: readonly ClusterInput[]): void {
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.key)) throw new RangeError(`duplicate event key ${e.key}`);
    seen.add(e.key);
  }
}
