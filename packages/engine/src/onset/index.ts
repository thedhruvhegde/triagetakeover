/**
 * Build-onset regression screen (ARCHITECTURE §5.9).
 *
 * Given per-build event counts and drive exposure (km) for one cluster, scan every
 * build boundary with an exact conditional Poisson test (binomial on the split of
 * events given total), pick the most significant boundary, and Bonferroni-correct
 * for the number of boundaries tested. Holm across clusters is applied by the caller
 * via {@link applyHolm}.
 */
import { binomialUpperTail, clopperPearson, holm } from "../stats/index.js";

export interface BuildExposure {
  /** Build identifier, already in release order (see {@link compareSemver}). */
  readonly build: string;
  /** Event count attributed to this build for the cluster. */
  readonly events: number;
  /** Drive exposure in km for the relevant vehicles on this build. */
  readonly km: number;
}

export type OnsetVerdict = "regression-likely" | "inconclusive" | "no-evidence" | "not-enough-data";

export interface BoundaryResult {
  /** Index j: builds[0..j] are "before", builds[j+1..] are "after". */
  readonly boundary: number;
  readonly pValue: number;
}

export interface OnsetResult {
  readonly verdict: OnsetVerdict;
  /** First build of the "after" segment, or null when not enough data. */
  readonly onsetBuild: string | null;
  readonly before: { readonly events: number; readonly km: number };
  readonly after: { readonly events: number; readonly km: number };
  /** Best boundary p-value before multiplicity correction. */
  readonly pRaw: number | null;
  /** p after Bonferroni over boundaries. */
  readonly pScan: number | null;
  /** Rate ratio after/before; Infinity when no events before. */
  readonly rateRatio: number | null;
  readonly rateRatioCi95: { readonly lower: number; readonly upper: number } | null;
  readonly boundaries: readonly BoundaryResult[];
  /** Builds dropped because they have no drive exposure. */
  readonly excludedBuilds: readonly string[];
}

const NOT_ENOUGH = (excluded: string[], boundaries: BoundaryResult[] = []): OnsetResult => ({
  verdict: "not-enough-data",
  onsetBuild: null,
  before: { events: 0, km: 0 },
  after: { events: 0, km: 0 },
  pRaw: null,
  pScan: null,
  rateRatio: null,
  rateRatioCi95: null,
  boundaries,
  excludedBuilds: excluded,
});

/** Verdict thresholds on the (Holm-)adjusted p-value. */
export function verdictFor(p: number): Exclude<OnsetVerdict, "not-enough-data"> {
  if (p < 0.01) return "regression-likely";
  if (p < 0.1) return "inconclusive";
  return "no-evidence";
}

function validate(b: BuildExposure): void {
  if (!Number.isInteger(b.events) || b.events < 0) throw new RangeError(`events must be a non-negative integer (${b.build})`);
  if (!(Number.isFinite(b.km) && b.km >= 0)) throw new RangeError(`km must be finite and >= 0 (${b.build})`);
}

export function onsetScan(builds: readonly BuildExposure[]): OnsetResult {
  builds.forEach(validate);
  const excluded = builds.filter((b) => b.km === 0).map((b) => b.build);
  const used = builds.filter((b) => b.km > 0);
  const m = used.length - 1;
  const n = used.reduce((s, b) => s + b.events, 0);
  if (m < 1 || n < 3) return NOT_ENOUGH(excluded);

  const totalKm = used.reduce((s, b) => s + b.km, 0);
  const boundaries: BoundaryResult[] = [];
  let k1 = 0;
  let e1 = 0;
  for (let j = 0; j < m; j++) {
    const b = used[j] as BuildExposure;
    k1 += b.events;
    e1 += b.km;
    const k2 = n - k1;
    const pi0 = (totalKm - e1) / totalKm;
    boundaries.push({ boundary: j, pValue: binomialUpperTail(k2, n, pi0) });
  }

  // argmin, ties -> earliest boundary
  let best = boundaries[0] as BoundaryResult;
  for (const r of boundaries) if (r.pValue < best.pValue) best = r;

  const before = used.slice(0, best.boundary + 1);
  const after = used.slice(best.boundary + 1);
  const bk = before.reduce((s, b) => s + b.events, 0);
  const bkm = before.reduce((s, b) => s + b.km, 0);
  const ak = n - bk;
  const akm = totalKm - bkm;

  const pScan = Math.min(1, m * best.pValue);
  const rr = bk === 0 ? Infinity : ak / akm / (bk / bkm);
  const { lower, upper } = clopperPearson(ak, n);
  const toRR = (pi: number): number => (pi >= 1 ? Infinity : (pi / (1 - pi)) * (bkm / akm));

  return {
    verdict: verdictFor(pScan),
    onsetBuild: (after[0] as BuildExposure).build,
    before: { events: bk, km: bkm },
    after: { events: ak, km: akm },
    pRaw: best.pValue,
    pScan,
    rateRatio: rr,
    rateRatioCi95: { lower: toRR(lower), upper: toRR(upper) },
    boundaries,
    excludedBuilds: excluded,
  };
}

/**
 * Apply Holm across clusters in the current view and recompute verdicts on p_holm.
 * Clusters without a p-value pass through unchanged.
 */
export function applyHolm<T extends { readonly onset: OnsetResult }>(
  clusters: readonly T[],
): (T & { readonly pHolm: number | null; readonly verdict: OnsetVerdict })[] {
  const idx = clusters.flatMap((c, i) => (c.onset.pScan === null ? [] : [i]));
  const adj = holm(idx.map((i) => (clusters[i] as T).onset.pScan as number));
  return clusters.map((c, i) => {
    const k = idx.indexOf(i);
    if (k === -1) return { ...c, pHolm: null, verdict: c.onset.verdict };
    const pHolm = adj[k] as number;
    return { ...c, pHolm, verdict: verdictFor(pHolm) };
  });
}

/** Compare dotted numeric versions like "4.11.3" vs "4.12.0". Non-numeric parts compare lexically. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "0";
    const y = pb[i] ?? "0";
    const nx = Number(x);
    const ny = Number(y);
    const c = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x < y ? -1 : x > y ? 1 : 0;
    if (c !== 0) return Math.sign(c);
  }
  return 0;
}
