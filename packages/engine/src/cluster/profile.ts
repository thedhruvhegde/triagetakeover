/**
 * Cluster profile (per-feature median) and medoid (ARCHITECTURE §5.8 step 4).
 */
import {
  FEATURE_IDS,
  SIGNAL_CHIPS,
  type ClusterInput,
  type ClusterProfile,
  type ConditionChip,
  type FeatureId,
} from "../schema/index.js";
import { DEFAULT_DISTANCE_PARAMS, distance, type DistanceParams } from "../similarity/index.js";
import { isAcceptedMember, type AcceptedMember } from "./assign.js";
import { canonicalSort, compareNumbers } from "./order.js";

/**
 * Lower median: for an even count, the smaller of the two middle values, so the result
 * is always an actual member value (same rule as the image metrics, §5.5). null when empty.
 */
export function lowerMedianOrNull(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort(compareNumbers);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

/** Per-feature lower median; features no member has are left out and flagged "channel-unmapped". */
export function featureProfile(members: readonly Pick<ClusterInput, "features">[]): {
  profile: { [K in FeatureId]?: number };
  flags: { [K in FeatureId]?: "channel-unmapped" };
} {
  const profile: { [K in FeatureId]?: number } = {};
  const flags: { [K in FeatureId]?: "channel-unmapped" } = {};
  for (const id of FEATURE_IDS) {
    const vals = members.map((m) => m.features[id]).filter((v): v is number => v !== undefined);
    const med = lowerMedianOrNull(vals);
    if (med === null) flags[id] = "channel-unmapped";
    else profile[id] = med;
  }
  return { profile, flags };
}

/**
 * Medoid: the member with the minimum sum of distances to the others. +∞ distances make the
 * sum +∞. Ties → canonical order (lowest issue number, then key). null when empty.
 */
export function medoidOf<T extends ClusterInput>(members: readonly T[], params: DistanceParams = DEFAULT_DISTANCE_PARAMS): T | null {
  const sorted = canonicalSort(members);
  let best: T | null = null;
  let bestSum = Infinity;
  for (const m of sorted) {
    let sum = 0;
    for (const o of sorted) if (o !== m) sum += distance(m, o, params);
    if (best === null || sum < bestSum) {
      best = m;
      bestSum = sum;
    }
  }
  return best;
}

/**
 * Chip that a strict majority of members carry (most frequent; ties → SIGNAL_CHIPS order),
 * else "normal". Used for the cluster name.
 */
export function dominantChip(members: readonly Pick<ClusterInput, "chips">[]): ConditionChip {
  let best: ConditionChip = "normal";
  let bestCount = 0;
  for (const c of SIGNAL_CHIPS) {
    const count = members.filter((m) => m.chips.includes(c)).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return bestCount * 2 > members.length ? best : "normal";
}

/** Accepted members of `clusterKey`, in canonical order. */
export function membersOf(clusterKey: string, events: readonly ClusterInput[]): AcceptedMember[] {
  return canonicalSort(events.filter((e): e is AcceptedMember => isAcceptedMember(e) && e.clusterKey === clusterKey));
}

/** Profile and medoid of a cluster's accepted members; null when it has none. */
export function clusterProfile(
  clusterKey: string,
  events: readonly ClusterInput[],
  params: DistanceParams = DEFAULT_DISTANCE_PARAMS,
): ClusterProfile | null {
  const members = membersOf(clusterKey, events);
  const medoid = medoidOf(members, params);
  if (medoid === null) return null;
  const { profile, flags } = featureProfile(members);
  return { clusterKey, profile, flags, medoidKey: medoid.key, memberCount: members.length };
}
