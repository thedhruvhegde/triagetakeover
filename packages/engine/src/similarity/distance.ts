/**
 * Normalised weighted distance between two events (ARCHITECTURE §5.7).
 *
 *   zᵢ     = clamp((aᵢ − bᵢ)/sᵢ, −Z, Z)            over A = features present in both
 *   D_sig  = sqrt( Σ_A wᵢ zᵢ² / Σ_A wᵢ )
 *   D_cond = λ · |chips(a) XOR chips(b)| / 3        (signal chips only; "normal" ignored)
 *   d      = D_sig + D_cond, or +∞ when Σ_A wᵢ < minOverlap · Σ_all wᵢ
 *
 * Features are always visited in FEATURE_IDS order, so results are bit-identical
 * across runs and exactly symmetric (a − b is the exact negation of b − a in IEEE 754).
 */
import {
  FEATURE_IDS,
  FEATURE_SPECS,
  SIGNAL_CHIPS,
  type ConditionChip,
  type FeatureFlags,
  type FeatureId,
  type FeatureVector,
} from "../schema/index.js";
import { DEFAULT_DISTANCE_PARAMS, type DistanceParams } from "./params.js";

/** The parts of an event (or a cluster profile) the distance looks at. */
export interface SimilarityOperand {
  readonly features: FeatureVector;
  readonly chips: readonly ConditionChip[];
  /** Why a feature is missing or clamped; only used for why-row notes. */
  readonly flags?: FeatureFlags;
}

/** Per-feature intermediate values, in FEATURE_IDS order. */
interface SignalTerms {
  /** Clamped z for features in A, else null. */
  readonly z: readonly (number | null)[];
  /** True where |raw z| exceeded the clamp. */
  readonly zClamped: readonly boolean[];
  /** Σ_A wᵢ zᵢ². */
  readonly sumWz2: number;
  /** Σ_A wᵢ. */
  readonly overlapWeight: number;
  /** Σ_all wᵢ. */
  readonly totalWeight: number;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function signalTerms(a: FeatureVector, b: FeatureVector, p: DistanceParams): SignalTerms {
  const z: (number | null)[] = [];
  const zClamped: boolean[] = [];
  let sumWz2 = 0;
  let overlapWeight = 0;
  let totalWeight = 0;
  for (const id of FEATURE_IDS) {
    const w = p.weights[id];
    totalWeight += w;
    const av = a[id];
    const bv = b[id];
    if (av === undefined || bv === undefined) {
      z.push(null);
      zClamped.push(false);
      continue;
    }
    const raw = (av - bv) / p.scales[id];
    const zi = clamp(raw, -p.zClamp, p.zClamp);
    z.push(zi);
    zClamped.push(zi !== raw);
    sumWz2 += w * zi * zi;
    overlapWeight += w;
  }
  return { z, zClamped, sumWz2, overlapWeight, totalWeight };
}

function hasSufficientOverlap(t: SignalTerms, p: DistanceParams): boolean {
  return t.overlapWeight > 0 && t.overlapWeight >= p.minOverlap * t.totalWeight;
}

function sigFromTerms(t: SignalTerms, p: DistanceParams): number {
  return hasSufficientOverlap(t, p) ? Math.sqrt(t.sumWz2 / t.overlapWeight) : Infinity;
}

/** Number of signal chips (night, low-sun-glare, blur-rain) present in exactly one of the two sets. */
export function chipXorCount(a: readonly ConditionChip[], b: readonly ConditionChip[]): number {
  let n = 0;
  for (const c of SIGNAL_CHIPS) if (a.includes(c) !== b.includes(c)) n++;
  return n;
}

/** D_cond = λ · |a XOR b| / 3. */
export function chipDistance(
  a: readonly ConditionChip[],
  b: readonly ConditionChip[],
  params: DistanceParams = DEFAULT_DISTANCE_PARAMS,
): number {
  return (params.lambda * chipXorCount(a, b)) / SIGNAL_CHIPS.length;
}

/** D_sig, or +∞ when the overlapping weight is insufficient. */
export function signalDistance(
  a: FeatureVector,
  b: FeatureVector,
  params: DistanceParams = DEFAULT_DISTANCE_PARAMS,
): number {
  return sigFromTerms(signalTerms(a, b, params), params);
}

/** d(a, b) = D_sig + D_cond (fast path, no explanation). */
export function distance(
  a: SimilarityOperand,
  b: SimilarityOperand,
  params: DistanceParams = DEFAULT_DISTANCE_PARAMS,
): number {
  return signalDistance(a.features, b.features, params) + chipDistance(a.chips, b.chips, params);
}

/** A why-row plus its additive share of the distance. */
export interface ExplainedWhyRow {
  readonly feature: FeatureId;
  readonly unit: string;
  readonly eventValue: number | null;
  readonly referenceValue: number | null;
  readonly z: number | null;
  /** cᵢ = wᵢ zᵢ² / Σ_A wⱼ zⱼ² (sums to 1 when D_sig > 0; all 0 when D_sig = 0). */
  readonly contribution: number | null;
  /** cᵢ · D_sig: the additive part of d owed to this feature (null when d = +∞). */
  readonly distanceShare: number | null;
  readonly note: string;
}

/** {@link DistanceResult}-compatible explanation with additive shares. */
export interface ExplainedDistance {
  readonly d: number;
  readonly dSig: number;
  readonly dCond: number;
  readonly insufficientOverlap: boolean;
  /** Σ_A wᵢ / Σ_all wᵢ. */
  readonly overlapFraction: number;
  /** Signal chips present in exactly one side, in SIGNAL_CHIPS order. */
  readonly chipDiff: readonly ConditionChip[];
  readonly rows: readonly ExplainedWhyRow[];
}

function missingNote(side: "event" | "reference", flags: FeatureFlags | undefined, id: FeatureId): string {
  const flag = flags?.[id];
  if (flag === "channel-unmapped") return side === "event" ? "n/a (channel not mapped)" : "n/a (reference: channel not mapped)";
  if (flag === "channel-coverage") return side === "event" ? "n/a (channel coverage too low)" : "n/a (reference: channel coverage too low)";
  return side === "event" ? "n/a (missing)" : "n/a (reference missing)";
}

function rowNote(a: SimilarityOperand, b: SimilarityOperand, id: FeatureId, zClamped: boolean): string {
  if (a.features[id] === undefined) return missingNote("event", a.flags, id);
  if (b.features[id] === undefined) return missingNote("reference", b.flags, id);
  const notes: string[] = [];
  if (a.flags?.[id] === "clamped" || b.flags?.[id] === "clamped") notes.push("clamped");
  if (zClamped) notes.push("z clamped");
  return notes.join("; ");
}

/**
 * d(a, b) with a why-row per feature (FEATURE_IDS order). `a` is the event,
 * `b` the reference (a neighbour or a cluster profile). `d` is identical to {@link distance}.
 */
export function explainDistance(
  a: SimilarityOperand,
  b: SimilarityOperand,
  params: DistanceParams = DEFAULT_DISTANCE_PARAMS,
): ExplainedDistance {
  const t = signalTerms(a.features, b.features, params);
  const dSig = sigFromTerms(t, params);
  const dCond = chipDistance(a.chips, b.chips, params);
  const d = dSig + dCond;
  const rows = FEATURE_IDS.map((id, i): ExplainedWhyRow => {
    const z = t.z[i] ?? null;
    const contribution = z === null ? null : t.sumWz2 > 0 ? (params.weights[id] * z * z) / t.sumWz2 : 0;
    return {
      feature: id,
      unit: FEATURE_SPECS[id].unit,
      eventValue: a.features[id] ?? null,
      referenceValue: b.features[id] ?? null,
      z,
      contribution,
      distanceShare: contribution === null || !Number.isFinite(dSig) ? null : contribution * dSig,
      note: rowNote(a, b, id, t.zClamped[i] ?? false),
    };
  });
  return {
    d,
    dSig,
    dCond,
    insufficientOverlap: !hasSufficientOverlap(t, params),
    overlapFraction: t.overlapWeight / t.totalWeight,
    chipDiff: SIGNAL_CHIPS.filter((c) => a.chips.includes(c) !== b.chips.includes(c)),
    rows,
  };
}

/** The ids of the features with the largest contribution (desc; ties → FEATURE_IDS order). */
export function topContributors(e: ExplainedDistance, n: number): FeatureId[] {
  return e.rows
    .filter((r) => r.contribution !== null && r.contribution > 0)
    .map((r, i) => ({ id: r.feature, c: r.contribution ?? 0, i }))
    .sort((x, y) => y.c - x.c || x.i - y.i)
    .slice(0, n)
    .map((x) => x.id);
}
