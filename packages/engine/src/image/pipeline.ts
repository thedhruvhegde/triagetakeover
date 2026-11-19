/**
 * Per-frame pipeline and per-event aggregation (ARCHITECTURE §5.5):
 * decodeJpeg → downscale (≤ 640 px) → luma → M1..M7; per event, the lower median of each metric.
 */
import {
  DOWNSCALE_MAX_SIDE,
  IMAGE_METRIC_KEYS,
  ok,
  type ChipThresholds,
  type ImageMetrics,
  type ImageSummary,
  type Result,
} from "../schema/index.js";
import { evaluateChips } from "./chips.js";
import { decodeJpeg, type DecodeJpegOptions } from "./decode.js";
import { downscale } from "./downscale.js";
import { toLuma } from "./luma.js";
import { computeImageMetrics, type FrameMetrics } from "./metrics.js";
import { imageError, type RgbaImage } from "./raster.js";

/** Result of analysing one frame. */
export interface FrameAnalysis extends FrameMetrics {
  /** Source dimensions (before downscale). */
  readonly width: number;
  readonly height: number;
  /** Dimensions the metrics were computed on. */
  readonly scaledWidth: number;
  readonly scaledHeight: number;
}

export interface ImageAnalyzeOptions extends DecodeJpegOptions {
  /** Long-side limit before metrics (default 640). */
  readonly maxSide?: number;
}

/** Downscale → luma → metrics on an already decoded RGBA raster. */
export function analyzeRgba(img: RgbaImage, opts: ImageAnalyzeOptions = {}): Result<FrameAnalysis> {
  const small = downscale(img, opts.maxSide ?? DOWNSCALE_MAX_SIDE);
  if (!small.ok) return small;
  const luma = toLuma(small.value);
  if (!luma.ok) return luma;
  const m = computeImageMetrics(luma.value);
  if (!m.ok) return m;
  return ok({
    ...m.value,
    width: img.width,
    height: img.height,
    scaledWidth: small.value.width,
    scaledHeight: small.value.height,
  });
}

/** Full per-frame pipeline from JPEG bytes. */
export function analyzeJpeg(bytes: Uint8Array, opts: ImageAnalyzeOptions = {}): Result<FrameAnalysis> {
  const rgba = decodeJpeg(bytes, opts);
  return rgba.ok ? analyzeRgba(rgba.value, opts) : rgba;
}

/** Index of the lower median of `values` (ties broken by lowest index). */
function lowerMedianIndex(values: readonly number[]): number {
  const order = values.map((_, i) => i).sort((a, b) => (values[a] as number) - (values[b] as number) || a - b);
  return order[Math.floor((order.length - 1) / 2)] as number;
}

/** Per-metric lower median across frames (always an actual frame value). Requires ≥ 1 frame. */
export function medianMetrics(frames: readonly ImageMetrics[]): Result<ImageMetrics> {
  if (frames.length === 0) return imageError("E_IMAGE_NO_FRAMES", "no frames to aggregate");
  const out = {} as Record<(typeof IMAGE_METRIC_KEYS)[number], number>;
  for (const key of IMAGE_METRIC_KEYS) {
    const values = frames.map((f) => f[key]);
    out[key] = values[lowerMedianIndex(values)] as number;
  }
  return ok(out);
}

/**
 * Builds the `tt.event.img` block from analysed frames. The "median frame" whose hist32 is stored
 * is the frame holding the lower-median `meanY`. Fails with E_IMAGE_NO_FRAMES when empty.
 */
export function summarizeFrames(frames: readonly FrameMetrics[], thresholds?: ChipThresholds): Result<ImageSummary> {
  const median = medianMetrics(frames.map((f) => f.metrics));
  if (!median.ok) return median;
  const medianFrame = frames[lowerMedianIndex(frames.map((f) => f.metrics.meanY))] as FrameMetrics;
  const { chips, chipRules } = evaluateChips(median.value, thresholds);
  return ok({ attested: "client", median: median.value, hist32: [...medianFrame.hist32], chips, chipRules });
}

/** Per-frame results plus the event summary (null when no frame decoded; §15 row 3). */
export interface EventImageAnalysis {
  readonly frames: readonly Result<FrameAnalysis>[];
  readonly summary: ImageSummary | null;
}

/** Analyses every frame; failed frames are skipped for the summary but reported per frame. */
export function analyzeEventFrames(
  jpegs: readonly Uint8Array[],
  opts: ImageAnalyzeOptions & { readonly thresholds?: ChipThresholds } = {},
): EventImageAnalysis {
  const frames = jpegs.map((b) => analyzeJpeg(b, opts));
  const good = frames.flatMap((r) => (r.ok ? [r.value] : []));
  const summary = summarizeFrames(good, opts.thresholds);
  return { frames, summary: summary.ok ? summary.value : null };
}
