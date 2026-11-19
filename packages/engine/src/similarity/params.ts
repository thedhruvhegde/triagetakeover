/**
 * Distance parameters (ARCHITECTURE §5.7). Defaults come from the schema module.
 */
import {
  CHIP_LAMBDA,
  DEFAULT_SCALES,
  DEFAULT_WEIGHTS,
  FEATURE_IDS,
  MIN_WEIGHT_OVERLAP,
  Z_CLAMP,
  type FeatureParams,
} from "../schema/index.js";

/** Tunable inputs of `d(a, b)`. */
export interface DistanceParams {
  /** Per-feature scale sᵢ (> 0). */
  readonly scales: FeatureParams;
  /** Per-feature weight wᵢ (≥ 0, at least one > 0). */
  readonly weights: FeatureParams;
  /** Weight λ of the chip term. */
  readonly lambda: number;
  /** |zᵢ| is clamped to this bound. */
  readonly zClamp: number;
  /** Overlapping weight must be ≥ this fraction of total weight, else d = +∞. */
  readonly minOverlap: number;
}

/** The frozen `params-v1` distance parameters. */
export const DEFAULT_DISTANCE_PARAMS: DistanceParams = {
  scales: DEFAULT_SCALES,
  weights: DEFAULT_WEIGHTS,
  lambda: CHIP_LAMBDA,
  zClamp: Z_CLAMP,
  minOverlap: MIN_WEIGHT_OVERLAP,
};

/**
 * Throws a RangeError for parameters that would make the distance undefined
 * (non-positive scale, negative or all-zero weights, negative λ or clamp).
 * Invalid params are a programming/config error, not a data error.
 */
export function assertDistanceParams(p: DistanceParams): void {
  let total = 0;
  for (const id of FEATURE_IDS) {
    const s = p.scales[id];
    const w = p.weights[id];
    if (!(Number.isFinite(s) && s > 0)) throw new RangeError(`scale ${id} must be finite and > 0, got ${s}`);
    if (!(Number.isFinite(w) && w >= 0)) throw new RangeError(`weight ${id} must be finite and >= 0, got ${w}`);
    total += w;
  }
  if (!(total > 0)) throw new RangeError("at least one weight must be > 0");
  if (!(Number.isFinite(p.lambda) && p.lambda >= 0)) throw new RangeError(`lambda must be >= 0, got ${p.lambda}`);
  if (!(Number.isFinite(p.zClamp) && p.zClamp > 0)) throw new RangeError(`zClamp must be > 0, got ${p.zClamp}`);
  if (!(p.minOverlap >= 0 && p.minOverlap <= 1)) throw new RangeError(`minOverlap must be in [0, 1], got ${p.minOverlap}`);
}
