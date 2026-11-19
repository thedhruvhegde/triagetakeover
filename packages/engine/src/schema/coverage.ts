/**
 * Scenario coverage tags and verdicts (ARCHITECTURE §5.10).
 */
import type { ConditionChip } from "./image.js";
import type { TakeoverType } from "./features.js";

/** Label prefixes that carry scenario tags (`type:`, `variant:`, `cond:`, `odd:`). */
export const COVERAGE_DIMENSIONS = ["type", "variant", "cond", "odd"] as const;
export type CoverageDimension = (typeof COVERAGE_DIMENSIONS)[number];

/** Explicit wildcard value (`variant:any`). An absent dimension is "unspecified" and never covers. */
export const COVERAGE_WILDCARD = "any";

/** Label that marks scenario test issues (default JQL `labels = tt-scenario`). */
export const SCENARIO_LABEL = "tt-scenario";

/**
 * Tags of one scenario test, parsed from labels or the `tt.scenario` property.
 * Each dimension holds all values found (a test may have several `cond:` labels).
 * A missing key means the dimension is unspecified.
 */
export type ScenarioTags = { readonly [K in CoverageDimension]?: readonly string[] };

/** Condition signature of a cluster (§5.10). */
export interface ConditionSignature {
  readonly type: TakeoverType;
  readonly variant: string;
  /** Chips present in ≥ 50 % of members (excluding `normal`). */
  readonly chips: readonly ConditionChip[];
  /** Road-type tags present in ≥ 50 % of members. */
  readonly odd: readonly string[];
}

export const COVERAGE_VERDICTS = ["covered", "partial", "uncovered"] as const;
export type CoverageVerdict = (typeof COVERAGE_VERDICTS)[number];

/** Coverage result for one cluster. */
export interface CoverageResult {
  readonly verdict: CoverageVerdict;
  /** Covering test keys (≤ 5) when covered; the best test when partial. */
  readonly tests: readonly string[];
  /** Dimensions the best test is missing (partial / uncovered). */
  readonly missing: readonly CoverageDimension[];
  /** Deterministic sentence, e.g. "0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway". */
  readonly text: string;
}

/**
 * Parses scenario tags from issue labels. Only `type:`, `variant:`, `cond:`, `odd:`
 * prefixes count (case-sensitive, values kept verbatim); other labels are ignored.
 * Values are de-duplicated and sorted for determinism.
 */
export function tagsFromLabels(labels: readonly string[]): ScenarioTags {
  const acc: Partial<Record<CoverageDimension, Set<string>>> = {};
  for (const label of labels) {
    const i = label.indexOf(":");
    if (i <= 0) continue;
    const dim = label.slice(0, i);
    const value = label.slice(i + 1);
    if (value === "" || !(COVERAGE_DIMENSIONS as readonly string[]).includes(dim)) continue;
    const set = (acc[dim as CoverageDimension] ??= new Set<string>());
    set.add(value);
  }
  const out: { [K in CoverageDimension]?: readonly string[] } = {};
  for (const dim of COVERAGE_DIMENSIONS) {
    const set = acc[dim];
    if (set !== undefined) out[dim] = [...set].sort();
  }
  return out;
}
