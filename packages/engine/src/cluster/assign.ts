/**
 * kNN assignment of one event against the accepted members of its bucket
 * (ARCHITECTURE §5.8 step 2). Accepted membership is read, never changed.
 */
import {
  bucketId,
  type AssignmentResult,
  type ClusterInput,
  type ClusterVote,
  type Neighbour,
} from "../schema/index.js";
import { distance } from "../similarity/index.js";
import { sameBucket } from "./bucket.js";
import { canonicalSort, compareIssueKeys, compareKeyed, compareNumbers } from "./order.js";
import { assertClusterParams, DEFAULT_CLUSTER_PARAMS, type ClusterParams } from "./params.js";

/** An accepted event that belongs to a cluster. */
export type AcceptedMember = ClusterInput & { readonly state: "accepted"; readonly clusterKey: string };

/** Type guard for accepted events that carry a cluster key. */
export function isAcceptedMember(e: ClusterInput): e is AcceptedMember {
  return e.state === "accepted" && e.clusterKey !== undefined;
}

/**
 * The accepted members of `event`'s bucket (excluding the event itself), in canonical order.
 * Events of other buckets are ignored, so callers may pass the whole index.
 */
export function acceptedMembersFor(event: ClusterInput, candidates: readonly ClusterInput[]): AcceptedMember[] {
  return canonicalSort(
    candidates.filter((c): c is AcceptedMember => isAcceptedMember(c) && c.key !== event.key && sameBucket(c.bucket, event.bucket)),
  );
}

/** Sorts neighbours by distance, then lowest issue number (then key). */
function nearest(event: ClusterInput, members: readonly AcceptedMember[], k: number, params: ClusterParams) {
  return members
    .map((m) => ({ m, d: distance(event, m, params.distance) }))
    .sort((a, b) => compareNumbers(a.d, b.d) || compareKeyed(a.m, b.m))
    .slice(0, k);
}

/** Vote scores Σ 1/(d + ε) per cluster; desc by score, ties → lowest cluster issue number. */
function tallyVotes(neighbours: readonly Neighbour[], epsilon: number): ClusterVote[] {
  const scores = new Map<string, number>();
  for (const n of neighbours) scores.set(n.clusterKey, (scores.get(n.clusterKey) ?? 0) + 1 / (n.d + epsilon));
  return [...scores.entries()]
    .map(([clusterKey, score]) => ({ clusterKey, score }))
    .sort((a, b) => compareNumbers(b.score, a.score) || compareIssueKeys(a.clusterKey, b.clusterKey));
}

/** confidence = clamp(1 − d* / τ, 0, 1). */
export function confidenceOf(dStar: number, tau: number): number {
  const c = 1 - dStar / tau;
  return c < 0 ? 0 : c > 1 ? 1 : c;
}

/**
 * Assigns one event. `candidates` may contain anything; only accepted members of the
 * event's bucket are used, and their input order does not matter.
 *
 * - fewer than 2 accepted members → `first-of-kind`
 * - d* > τ → `novel` (also when every neighbour is at d = +∞)
 * - otherwise `match`, `ambiguous` when runner-up score ≥ ratio × winner score
 */
export function assignEvent(
  event: ClusterInput,
  candidates: readonly ClusterInput[],
  params: ClusterParams = DEFAULT_CLUSTER_PARAMS,
): AssignmentResult {
  assertClusterParams(params);
  const members = acceptedMembersFor(event, candidates);
  if (members.length < 2) return { kind: "first-of-kind" };

  const neighbours: Neighbour[] = nearest(event, members, params.k, params).map(({ m, d }) => ({
    key: m.key,
    clusterKey: m.clusterKey,
    d,
  }));
  const votes = tallyVotes(neighbours, params.voteEpsilon);
  const winner = votes[0];
  const winnerNearest = neighbours.find((n) => n.clusterKey === winner?.clusterKey);
  if (winner === undefined || winnerNearest === undefined) return { kind: "first-of-kind" }; // unreachable: k ≥ 1, members ≥ 2
  const dStar = winnerNearest.d;
  const tau = params.tau;

  if (!(dStar <= tau)) {
    return { kind: "novel", dStar, tau, nearestClusterKey: winner.clusterKey, votes, neighbours };
  }
  const runnerUp = votes[1];
  const ambiguous = runnerUp !== undefined && runnerUp.score >= params.ambiguityRatio * winner.score;
  return {
    kind: "match",
    clusterKey: winner.clusterKey,
    dStar,
    tau,
    confidence: confidenceOf(dStar, tau),
    ambiguous,
    ...(ambiguous && runnerUp !== undefined ? { runnerUp } : {}),
    votes,
    neighbours,
  };
}

/** Number of accepted members in `bucket` (for "first of its kind" checks in the UI). */
export function acceptedCountInBucket(bucket: ClusterInput["bucket"], events: readonly ClusterInput[]): number {
  const id = bucketId(bucket);
  return events.filter((e) => isAcceptedMember(e) && bucketId(e.bucket) === id).length;
}
