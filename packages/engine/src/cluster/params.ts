/**
 * Clustering parameters (ARCHITECTURE §5.8, frozen as `params-v1`).
 */
import { AMBIGUITY_RATIO, DEFAULT_K, DEFAULT_TAU, VOTE_EPSILON } from "../schema/index.js";
import { assertDistanceParams, DEFAULT_DISTANCE_PARAMS, type DistanceParams } from "../similarity/index.js";

export interface ClusterParams {
  /** Novelty threshold τ (> 0). */
  readonly tau: number;
  /** Number of nearest accepted neighbours in the vote (integer ≥ 1). */
  readonly k: number;
  /** ε in the vote score Σ 1/(d + ε) (> 0). */
  readonly voteEpsilon: number;
  /** Runner-up score ≥ ratio × winner score flags `ambiguous`. */
  readonly ambiguityRatio: number;
  readonly distance: DistanceParams;
}

export const DEFAULT_CLUSTER_PARAMS: ClusterParams = {
  tau: DEFAULT_TAU,
  k: DEFAULT_K,
  voteEpsilon: VOTE_EPSILON,
  ambiguityRatio: AMBIGUITY_RATIO,
  distance: DEFAULT_DISTANCE_PARAMS,
};

/** Throws a RangeError for unusable parameters (config error). */
export function assertClusterParams(p: ClusterParams): void {
  if (!(Number.isFinite(p.tau) && p.tau > 0)) throw new RangeError(`tau must be finite and > 0, got ${p.tau}`);
  if (!(Number.isInteger(p.k) && p.k >= 1)) throw new RangeError(`k must be an integer >= 1, got ${p.k}`);
  if (!(Number.isFinite(p.voteEpsilon) && p.voteEpsilon > 0)) throw new RangeError(`voteEpsilon must be > 0, got ${p.voteEpsilon}`);
  if (!(p.ambiguityRatio >= 0 && p.ambiguityRatio <= 1)) throw new RangeError(`ambiguityRatio must be in [0, 1], got ${p.ambiguityRatio}`);
  assertDistanceParams(p.distance);
}
