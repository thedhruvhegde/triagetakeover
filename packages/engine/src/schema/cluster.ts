/**
 * Distance explanation, clustering and assignment result shapes
 * (ARCHITECTURE §5.7, §5.8).
 */
import type { ConditionChip } from "./image.js";
import type { FeatureFlags, FeatureId, FeatureVector, TakeoverType } from "./features.js";

/** Default clustering parameters (§5.8, frozen as `params-v1`). */
export const DEFAULT_TAU = 1.0;
export const DEFAULT_K = 3;
/** Additive smoothing in the kNN vote `Σ 1/(d + ε)`. */
export const VOTE_EPSILON = 0.05;
/** Runner-up score ≥ this × winner score flags `ambiguous`. */
export const AMBIGUITY_RATIO = 0.8;
/** Weight λ of the chip term in the distance (§5.7). */
export const CHIP_LAMBDA = 0.5;
/** z-scores are clamped to ±this (§5.7). */
export const Z_CLAMP = 5;
/** Minimum fraction of total weight that must overlap, else d = +∞ (§5.7). */
export const MIN_WEIGHT_OVERLAP = 0.5;

/** Membership state of an event in its bucket. `accepted` is human ground truth. */
export const MEMBERSHIP_STATES = ["accepted", "proposed", "novel", "unassigned"] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

/** Bucket = takeover type × sensor variant (D5). */
export interface BucketKey {
  readonly type: TakeoverType;
  readonly variant: string;
}

/** Canonical string form `"<type>|<variant>"`, as stored in the index (§7.3). */
export function bucketId(b: BucketKey): string {
  return `${b.type}|${b.variant}`;
}

/** What clustering needs to know about one event. */
export interface ClusterInput {
  /** Issue key or id; the sort key for deterministic tie-breaks. */
  readonly key: string;
  /** Issue number used for tie-breaks ("lowest issue number"). */
  readonly issueNumber: number;
  readonly bucket: BucketKey;
  readonly features: FeatureVector;
  readonly chips: readonly ConditionChip[];
  readonly state: MembershipState;
  /** Cluster key for `accepted` (and `proposed`) events. */
  readonly clusterKey?: string;
}

/** One row of the why-table (§5.7). */
export interface WhyRow {
  readonly feature: FeatureId;
  readonly unit: string;
  readonly eventValue: number | null;
  readonly referenceValue: number | null;
  /** Clamped z; null when the feature is not present in both. */
  readonly z: number | null;
  /** Share of the signal distance, sums to 1 over present features. */
  readonly contribution: number | null;
  /** e.g. "n/a (channel not mapped)", "clamped", or "". */
  readonly note: string;
}

/** Distance between two events with its explanation. */
export interface DistanceResult {
  /** d = D_sig + D_cond; `Infinity` when overlap is insufficient. */
  readonly d: number;
  readonly dSig: number;
  readonly dCond: number;
  readonly insufficientOverlap: boolean;
  readonly rows: readonly WhyRow[];
}

/** A neighbour that took part in the kNN vote. */
export interface Neighbour {
  readonly key: string;
  readonly clusterKey: string;
  readonly d: number;
}

/** A cluster's kNN vote score. */
export interface ClusterVote {
  readonly clusterKey: string;
  readonly score: number;
}

/** Result of assigning one event (§5.8 step 2). Discriminate on `kind`. */
export type AssignmentResult =
  | {
      readonly kind: "match";
      readonly clusterKey: string;
      /** Distance to the nearest member of the winning cluster. */
      readonly dStar: number;
      readonly tau: number;
      /** clamp(1 − dStar / tau, 0, 1). */
      readonly confidence: number;
      readonly ambiguous: boolean;
      /** Present when `ambiguous`. */
      readonly runnerUp?: ClusterVote;
      readonly votes: readonly ClusterVote[];
      readonly neighbours: readonly Neighbour[];
    }
  | {
      /** d* > τ: "Proposed new cluster". */
      readonly kind: "novel";
      readonly dStar: number;
      readonly tau: number;
      readonly nearestClusterKey: string;
      readonly votes: readonly ClusterVote[];
      readonly neighbours: readonly Neighbour[];
    }
  | {
      /** Fewer than 2 accepted events in the bucket: "First of its kind in this bucket". */
      readonly kind: "first-of-kind";
    };

/** A batch proposal group of ≥ 2 unassigned events (§5.8 step 3). */
export interface ProposedCluster {
  /** Deterministic id: the smallest member key. */
  readonly id: string;
  readonly bucket: BucketKey;
  /** Member keys, sorted canonically. */
  readonly members: readonly string[];
}

/** Result of the batch propose step. */
export interface ProposeResult {
  /** Unassigned events matched to an existing cluster in step 1. */
  readonly assigned: readonly { readonly key: string; readonly result: AssignmentResult & { readonly kind: "match" } }[];
  readonly proposed: readonly ProposedCluster[];
  /** Singletons left after HAC. */
  readonly novel: readonly string[];
}

/** Cluster profile and representative (§5.8 step 4). */
export interface ClusterProfile {
  readonly clusterKey: string;
  /** Per-feature median over accepted members; absent when no member has it. */
  readonly profile: FeatureVector;
  readonly flags: FeatureFlags;
  /** Member with the minimum sum of distances (ties → lowest key). */
  readonly medoidKey: string;
  readonly memberCount: number;
}
