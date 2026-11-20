/**
 * Coverage verdict per cluster (ARCHITECTURE §5.10, PRD US-17 AC3).
 *
 * A test matches a dimension when it carries `any` for it, or when the cluster's values are
 * a subset of the test's values (set containment; single-valued `type` / `variant` are the
 * one-element case). An absent dimension never matches.
 */
import { COVERAGE_DIMENSIONS, COVERAGE_WILDCARD } from "../schema/index.js";
import type { ConditionSignature, CoverageDimension, CoverageResult, CoverageVerdict, ScenarioTags } from "../schema/index.js";
import { effectiveChips, signatureText } from "./signature.js";
import type { ScenarioTest } from "./tags.js";

/** Covering test keys listed in a `covered` result. */
export const MAX_COVERING_TESTS = 5;

/** Cluster values for one dimension, as matching sees them. */
export function signatureValues(sig: ConditionSignature, dim: CoverageDimension): readonly string[] {
  switch (dim) {
    case "type":
      return [sig.type];
    case "variant":
      return [sig.variant];
    case "cond":
      return effectiveChips(sig);
    case "odd":
      return sig.odd;
  }
}

/** True when `tags` covers `sig` on dimension `dim`. */
export function dimensionCovers(sig: ConditionSignature, tags: ScenarioTags, dim: CoverageDimension): boolean {
  const values = tags[dim];
  if (values === undefined || values.length === 0) return false;
  if (values.includes(COVERAGE_WILDCARD)) return true;
  return signatureValues(sig, dim).every((v) => values.includes(v));
}

/** Dimensions on which `tags` covers `sig`, in {@link COVERAGE_DIMENSIONS} order. */
export function matchedDimensions(sig: ConditionSignature, tags: ScenarioTags): CoverageDimension[] {
  return COVERAGE_DIMENSIONS.filter((d) => dimensionCovers(sig, tags, d));
}

/**
 * Orders issue keys naturally: project prefix as a string, then the number numerically
 * (`SCN-9` before `SCN-10`). Keys without a numeric suffix compare as plain strings.
 */
export function compareIssueKeysNatural(a: string, b: string): number {
  const ma = /^(.*)-(\d+)$/.exec(a);
  const mb = /^(.*)-(\d+)$/.exec(b);
  if (ma !== null && mb !== null) {
    const [, pa = "", na = ""] = ma;
    const [, pb = "", nb = ""] = mb;
    if (pa !== pb) return pa < pb ? -1 : 1;
    const d = Number(na) - Number(nb);
    if (d !== 0) return d;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

interface Scored {
  readonly key: string;
  readonly matched: readonly CoverageDimension[];
}

/** Total order for ties: lowest key, then the matched dimensions in canonical order. */
function compareScored(a: Scored, b: Scored): number {
  const byKey = compareIssueKeysNatural(a.key, b.key);
  if (byKey !== 0) return byKey;
  const sa = COVERAGE_DIMENSIONS.filter((d) => a.matched.includes(d)).join(",");
  const sb = COVERAGE_DIMENSIONS.filter((d) => b.matched.includes(d)).join(",");
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Best of `xs`: most matched dimensions, then lowest key. The same key can appear twice (e.g.
 * overlapping JQL pages), so equal keys are ordered by their matched dimensions: the result
 * never depends on input order.
 */
function best(xs: readonly Scored[]): Scored | undefined {
  let top: Scored | undefined;
  for (const x of xs) {
    if (top === undefined || x.matched.length > top.matched.length || (x.matched.length === top.matched.length && compareScored(x, top) < 0)) {
      top = x;
    }
  }
  return top;
}

function missingOf(s: Scored | undefined): CoverageDimension[] {
  return COVERAGE_DIMENSIONS.filter((d) => s === undefined || !s.matched.includes(d));
}

/**
 * Coverage verdict for one cluster signature against the scenario tests.
 * - `covered`: at least one test matches every dimension (up to 5 keys listed).
 * - `partial`: a test matches `type` and at least one other dimension (best test listed).
 * - `uncovered`: otherwise; `missing` names what the closest test lacks.
 */
export function coverageVerdict(sig: ConditionSignature, tests: readonly ScenarioTest[]): CoverageResult {
  const scored: Scored[] = tests.map((t) => ({ key: t.key, matched: matchedDimensions(sig, t.tags) }));
  const full = scored.filter((s) => s.matched.length === COVERAGE_DIMENSIONS.length).map((s) => s.key);
  if (full.length > 0) {
    const keys = [...new Set(full)].sort(compareIssueKeysNatural);
    const n = keys.length;
    return { verdict: "covered", tests: keys.slice(0, MAX_COVERING_TESTS), missing: [], text: `Covered by ${n} scenario test${n === 1 ? "" : "s"}` };
  }
  const partial = best(scored.filter((s) => s.matched.includes("type") && s.matched.length >= 2));
  if (partial !== undefined) {
    const missing = missingOf(partial);
    return { verdict: "partial", tests: [partial.key], missing, text: `Partially covered by ${partial.key} (missing: ${missing.join(", ")})` };
  }
  return { verdict: "uncovered", tests: [], missing: missingOf(best(scored)), text: `0 scenario tests cover ${signatureText(sig)}` };
}

/** Verdict rank for ordering: higher is better covered. */
export function verdictRank(v: CoverageVerdict): number {
  return v === "covered" ? 2 : v === "partial" ? 1 : 0;
}

/** One cluster as the coverage listing sees it. */
export interface CoverageCluster {
  readonly key: string;
  readonly signature: ConditionSignature;
  /** Member event count. */
  readonly events: number;
}

export interface CoverageGap {
  readonly clusterKey: string;
  readonly signature: ConditionSignature;
  readonly events: number;
  readonly verdict: "uncovered" | "partial";
  readonly missing: readonly CoverageDimension[];
  /** Best partially matching test (partial only). */
  readonly bestTest?: string;
  readonly text: string;
}

export interface GapListOptions {
  /** Clusters with fewer events are skipped (default 2). */
  readonly minEvents?: number;
  /** Include partial verdicts (default true). */
  readonly includePartial?: boolean;
  /** Maximum gaps returned, clamped to 1..25 (default 25). */
  readonly limit?: number;
}

/** Hard cap on gaps returned (the `list-coverage-gaps` action limit). */
export const MAX_GAPS = 25;

/**
 * Lists coverage gaps (`list-coverage-gaps`, §10.3): uncovered first, then partial; within a
 * verdict by event count descending, then cluster key.
 */
export function listCoverageGaps(clusters: readonly CoverageCluster[], tests: readonly ScenarioTest[], opts: GapListOptions = {}): CoverageGap[] {
  const minEvents = opts.minEvents ?? 2;
  const includePartial = opts.includePartial ?? true;
  const limit = Math.max(1, Math.min(MAX_GAPS, Math.floor(opts.limit ?? MAX_GAPS)));
  const gaps: CoverageGap[] = [];
  for (const c of clusters) {
    if (c.events < minEvents) continue;
    const r = coverageVerdict(c.signature, tests);
    if (r.verdict === "covered" || (r.verdict === "partial" && !includePartial)) continue;
    const base = { clusterKey: c.key, signature: c.signature, events: c.events, verdict: r.verdict, missing: r.missing, text: r.text };
    const bestTest = r.verdict === "partial" ? r.tests[0] : undefined;
    gaps.push(bestTest === undefined ? base : { ...base, bestTest });
  }
  gaps.sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict) || b.events - a.events || compareIssueKeysNatural(a.clusterKey, b.clusterKey));
  return gaps.slice(0, limit);
}
