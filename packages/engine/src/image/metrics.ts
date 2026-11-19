/**
 * Image metrics M1..M7 on a luma raster (ARCHITECTURE §5.5).
 *
 * All statistics are derived from integer histograms (luma and Laplacian), so the floating-point
 * work is a fixed, short sequence of IEEE operations: identical input gives identical output, and
 * a uniform image gives exactly zero variance.
 */
import {
  DARK_LUMA_MAX_EXCLUSIVE,
  GLARE_LUMA_MIN,
  HIST32_BINS,
  ok,
  type ImageMetrics,
  type Result,
} from "../schema/index.js";
import { checkRaster, type LumaImage } from "./raster.js";

/** `SUN_BLOB_TOP_FRACTION` (0.6) as an exact ratio: a row y is in the top band when 5y < 3H. */
const TOP_NUM = 3;
const TOP_DEN = 5;
/** The 4-neighbour Laplacian 4Y − ΣN lies in [−1020, 1020]. */
const LAP_MAX = 1020;

/** 256-bin luma histogram (pixel counts). */
export function lumaHistogram(luma: LumaImage): Uint32Array {
  const hist = new Uint32Array(256);
  const d = luma.data;
  for (let i = 0; i < d.length; i++) {
    const v = d[i] as number;
    hist[v] = (hist[v] as number) + 1;
  }
  return hist;
}

/** Nearest-rank percentile (`pct` in 0..100, integer) from a histogram with `total` > 0 samples. */
export function histogramPercentile(hist: ArrayLike<number>, total: number, pct: number): number {
  const rank = Math.max(1, Math.ceil((pct * total) / 100));
  let cum = 0;
  for (let v = 0; v < hist.length; v++) {
    cum += hist[v] as number;
    if (cum >= rank) return v;
  }
  return hist.length - 1;
}

/** Mean and population variance of a histogram whose bin i holds value `i + offset`. */
function histMoments(hist: ArrayLike<number>, offset: number, total: number): { mean: number; variance: number } {
  let sum = 0;
  for (let i = 0; i < hist.length; i++) sum += (hist[i] as number) * (i + offset);
  const mean = sum / total;
  let ss = 0;
  for (let i = 0; i < hist.length; i++) {
    const c = hist[i] as number;
    if (c !== 0) {
      const d = i + offset - mean;
      ss += c * d * d;
    }
  }
  return { mean, variance: ss / total };
}

/** M5: population variance of the 4-neighbour Laplacian over interior pixels (0 if none). */
export function laplacianVariance(luma: LumaImage): number {
  const { width: w, height: h, data: y } = luma;
  if (w < 3 || h < 3) return 0;
  const hist = new Uint32Array(2 * LAP_MAX + 1);
  for (let r = 1; r < h - 1; r++) {
    let i = r * w + 1;
    for (let c = 1; c < w - 1; c++, i++) {
      const lap = 4 * (y[i] as number) - (y[i - 1] as number) - (y[i + 1] as number) - (y[i - w] as number) - (y[i + w] as number);
      const b = lap + LAP_MAX;
      hist[b] = (hist[b] as number) + 1;
    }
  }
  return histMoments(hist, -LAP_MAX, (w - 2) * (h - 2)).variance;
}

/** Union-find root with path halving. */
function find(parent: Int32Array, a: number): number {
  let x = a;
  while (parent[x] !== x) {
    const gp = parent[parent[x] as number] as number;
    parent[x] = gp;
    x = gp;
  }
  return x;
}

/** Joins two labels; the smaller root wins, so the labelling is order-deterministic. */
function union(parent: Int32Array, a: number, b: number): number {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra === rb) return ra;
  const lo = Math.min(ra, rb);
  parent[Math.max(ra, rb)] = lo;
  return lo;
}

/**
 * M4: area fraction of the largest 4-connected component of {Y ≥ 250} that has at least one
 * pixel in the top 60 % of rows. Two-pass union-find in raster order; only two label rows are kept.
 */
export function sunBlobFraction(luma: LumaImage): number {
  const { width: w, height: h, data: y } = luma;
  const maxLabels = Math.ceil((w * h) / 2) + 2; // a checkerboard is the worst case
  const parent = new Int32Array(maxLabels);
  const size = new Float64Array(maxLabels);
  const top = new Uint8Array(maxLabels);
  let prev = new Int32Array(w); // labels of the previous row (0 = background)
  let cur = new Int32Array(w);
  let next = 1;
  for (let r = 0; r < h; r++) {
    const inTop = TOP_DEN * r < TOP_NUM * h ? 1 : 0;
    for (let c = 0; c < w; c++) {
      if ((y[r * w + c] as number) < GLARE_LUMA_MIN) {
        cur[c] = 0;
        continue;
      }
      const left = c > 0 ? (cur[c - 1] as number) : 0;
      const up = prev[c] as number;
      let label: number;
      if (left === 0 && up === 0) {
        label = next++;
        parent[label] = label;
      } else if (left !== 0 && up !== 0) {
        label = union(parent, left, up);
      } else {
        label = left !== 0 ? left : up;
      }
      cur[c] = label;
      size[label] = (size[label] as number) + 1;
      if (inTop) top[label] = 1;
    }
    [prev, cur] = [cur, prev];
  }
  // Second pass: fold provisional labels into their roots.
  for (let l = next - 1; l >= 1; l--) {
    const root = find(parent, l);
    if (root !== l) {
      size[root] = (size[root] as number) + (size[l] as number);
      if (top[l]) top[root] = 1;
    }
  }
  let best = 0;
  for (let l = 1; l < next; l++) {
    if (parent[l] === l && top[l] && (size[l] as number) > best) best = size[l] as number;
  }
  return best / (w * h);
}

/** Sums a 256-bin histogram into 32 bins of 8 luma levels (pixel counts). */
export function toHist32(hist256: ArrayLike<number>): number[] {
  const width = 256 / HIST32_BINS;
  const out = new Array<number>(HIST32_BINS).fill(0);
  for (let v = 0; v < 256; v++) {
    const b = Math.floor(v / width);
    out[b] = (out[b] as number) + (hist256[v] as number);
  }
  return out;
}

/** Metrics of one analysed frame plus the histogram needed for display. */
export interface FrameMetrics {
  readonly metrics: ImageMetrics;
  /** 32-bin luma histogram (pixel counts) of the analysed (downscaled) luma. */
  readonly hist32: readonly number[];
}

/** Computes M1..M7 on a luma raster. Fails with E_IMAGE_INVALID on a malformed raster. */
export function computeImageMetrics(luma: LumaImage): Result<FrameMetrics> {
  const checked = checkRaster(luma, 1);
  if (!checked.ok) return checked;
  const n = luma.width * luma.height;
  const hist = lumaHistogram(luma);
  const { mean, variance } = histMoments(hist, 0, n);
  let glare = 0;
  for (let v = GLARE_LUMA_MIN; v < 256; v++) glare += hist[v] as number;
  let dark = 0;
  for (let v = 0; v < DARK_LUMA_MAX_EXCLUSIVE; v++) dark += hist[v] as number;
  const metrics: ImageMetrics = {
    meanY: mean,
    p5: histogramPercentile(hist, n, 5),
    p95: histogramPercentile(hist, n, 95),
    glare: glare / n,
    sunBlob: sunBlobFraction(luma),
    lapVar: laplacianVariance(luma),
    contrast: Math.min(127.5, Math.sqrt(variance)),
    darkFrac: dark / n,
  };
  return ok({ metrics, hist32: toHist32(hist) });
}
