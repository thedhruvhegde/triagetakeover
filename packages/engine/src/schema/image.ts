/**
 * Image metrics M1..M7 and condition chips (ARCHITECTURE §5.5).
 */

/** Metric keys, in M1..M7 order (M2 contributes two keys). */
export const IMAGE_METRIC_KEYS = ["meanY", "p5", "p95", "glare", "sunBlob", "lapVar", "contrast", "darkFrac"] as const;
export type ImageMetricKey = (typeof IMAGE_METRIC_KEYS)[number];

/**
 * Per-frame (or per-event median) image statistics on the ≤ 640 px integer-downscaled luma.
 * Luma values are on the 0..255 scale.
 */
export interface ImageMetrics {
  /** M1: mean luma, 0..255. */
  readonly meanY: number;
  /** M2: 5th percentile of the 256-bin luma histogram, integer 0..255. */
  readonly p5: number;
  /** M2: 95th percentile, integer 0..255. */
  readonly p95: number;
  /** M3: fraction of pixels with Y ≥ 250, 0..1. */
  readonly glare: number;
  /** M4: area fraction of the largest 4-connected Y ≥ 250 blob touching the top 60 %, 0..1. */
  readonly sunBlob: number;
  /** M5: variance of the 4-neighbour Laplacian over interior pixels (blur proxy), ≥ 0, luma². */
  readonly lapVar: number;
  /** M6: standard deviation of luma (RMS contrast), 0..127.5. */
  readonly contrast: number;
  /** M7: fraction of pixels with Y < 30, 0..1. */
  readonly darkFrac: number;
}

/** Valid range `[min, max]` for each metric (used by the validator). */
export const IMAGE_METRIC_RANGES: Readonly<Record<ImageMetricKey, readonly [number, number]>> = {
  meanY: [0, 255],
  p5: [0, 255],
  p95: [0, 255],
  glare: [0, 1],
  sunBlob: [0, 1],
  // The 4-neighbour Laplacian 4Y - ΣN lies in [-1020, 1020], so its variance is ≤ 1020².
  lapVar: [0, 1020 ** 2],
  contrast: [0, 127.5],
  darkFrac: [0, 1],
};

/** Luma thresholds from §5.5. */
export const GLARE_LUMA_MIN = 250;
export const DARK_LUMA_MAX_EXCLUSIVE = 30;
/** Fraction of the frame height (from the top) a sun blob must touch. */
export const SUN_BLOB_TOP_FRACTION = 0.6;
/** Long side after downscale. */
export const DOWNSCALE_MAX_SIDE = 640;
/** Number of bins in the stored display histogram. */
export const HIST32_BINS = 32;

/** Condition chip ids. `normal` fires only when no other chip does. */
export const CONDITION_CHIPS = ["night", "low-sun-glare", "blur-rain", "normal"] as const;
export type ConditionChip = (typeof CONDITION_CHIPS)[number];

/** Chips that carry signal (used in D_cond, §5.7, and the index `chipsMask`). */
export const SIGNAL_CHIPS = ["night", "low-sun-glare", "blur-rain"] as const satisfies readonly ConditionChip[];
export type SignalChip = (typeof SIGNAL_CHIPS)[number];

/** Comparison operators a chip rule can use. */
export const CHIP_OPS = ["<", "<=", ">", ">="] as const;
export type ChipOp = (typeof CHIP_OPS)[number];

/** One tested condition that made a chip fire: `value op threshold` is true. */
export interface ChipRule {
  readonly chip: ConditionChip;
  readonly metric: ImageMetricKey;
  readonly op: ChipOp;
  readonly value: number;
  readonly threshold: number;
}

/** Default chip thresholds (§5.5; admin-configurable). */
export interface ChipThresholds {
  readonly nightMeanYBelow: number;
  readonly nightP95Below: number;
  readonly sunBlobAtLeast: number;
  readonly glareAtLeast: number;
  readonly blurLapVarBelow: number;
  readonly blurContrastBelow: number;
}
export const DEFAULT_CHIP_THRESHOLDS: ChipThresholds = {
  nightMeanYBelow: 45,
  nightP95Below: 160,
  sunBlobAtLeast: 0.004,
  glareAtLeast: 0.05,
  blurLapVarBelow: 60,
  blurContrastBelow: 40,
};

/** Bit mask of signal chips for the index (`chipsMask`): night=1, low-sun-glare=2, blur-rain=4. */
export function chipsToMask(chips: readonly ConditionChip[]): number {
  let mask = 0;
  SIGNAL_CHIPS.forEach((c, i) => {
    if (chips.includes(c)) mask |= 1 << i;
  });
  return mask;
}

/** Inverse of {@link chipsToMask}; an empty mask gives `["normal"]`. */
export function maskToChips(mask: number): readonly ConditionChip[] {
  const out: ConditionChip[] = SIGNAL_CHIPS.filter((_, i) => (mask & (1 << i)) !== 0);
  return out.length === 0 ? ["normal"] : out;
}
