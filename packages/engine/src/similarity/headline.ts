/**
 * Deterministic headline rule texts for the why-table (ARCHITECTURE §5.7).
 * No Intl: numbers are formatted with Number.prototype.toFixed only.
 */
import { type BucketKey, type FeatureId } from "../schema/index.js";
import { topContributors, type ExplainedDistance } from "./distance.js";

/** Short human label per feature, used in headline text. */
export const FEATURE_SHORT_LABELS: Readonly<Record<FeatureId, string>> = {
  F1: "lateral offset",
  F2: "drift latency",
  F3: "TTC",
  F4: "brake-onset",
  F5: "deceleration",
  F6: "lane confidence",
  F7: "steer torque",
  F8: "speed",
  F9: "yaw rate",
  F10: "TTC drop rate",
};

/** Fixed-point formatting; +∞ renders as "∞". */
export function formatNumber(x: number, digits: number): string {
  if (x === Infinity) return "∞";
  if (x === -Infinity) return "-∞";
  // toFixed(-0) gives "0"; normalise "-0.00" for tiny negatives.
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** "Bucket: lane-loss x cam-B". */
export function bucketHeadline(b: BucketKey): string {
  return `Bucket: ${b.type} x ${b.variant}`;
}

/** "Nearest: ADAS-305 d=0.21 < τ=1.00" (the comparator reflects d vs τ). */
export function nearestHeadline(key: string, d: number, tau: number): string {
  const op = d < tau ? "<" : d === tau ? "=" : ">";
  return `Nearest: ${key} d=${formatNumber(d, 2)} ${op} τ=${formatNumber(tau, 2)}`;
}

/** Joins labels as "A", "A and B". */
function joinLabels(ids: readonly FeatureId[]): string {
  return ids.map((id) => FEATURE_SHORT_LABELS[id]).join(" and ");
}

/**
 * "Split: TTC and brake-onset distance 3.2x τ" — names the top-2 signal contributors
 * when d > τ. Returns null when d ≤ τ. Falls back to "conditions" when only the chip
 * term differs, and to "insufficient feature overlap" when d = +∞.
 */
export function splitHeadline(e: ExplainedDistance, tau: number): string | null {
  if (!(e.d > tau)) return null;
  if (e.insufficientOverlap) return "Split: insufficient feature overlap";
  const top = topContributors(e, 2);
  const what = top.length > 0 ? joinLabels(top) : "conditions";
  return `Split: ${what} distance ${formatNumber(e.d / tau, 1)}x τ`;
}
