/**
 * Ordered takeover type rules, first match wins (ARCHITECTURE §5.4).
 */
import {
  DEFAULT_SCALES,
  RULE_TYPE,
  type FeatureFlags,
  type FeatureId,
  type FeatureParams,
  type FeatureVector,
  type RuleId,
  type RuleMargins,
  type TypeClassification,
} from "../schema/index.js";

/** Configurable rule thresholds (§5.4 defaults). */
export interface RuleThresholds {
  /** R-CI-1: F10 ≥ ciDropRate and F3 < ciMinTtc. */
  readonly ciDropRate: number;
  readonly ciMinTtc: number;
  /** R-LB-1: F3 < lbMinTtc and F4 < lbBrakeOnsetTtc. */
  readonly lbMinTtc: number;
  readonly lbBrakeOnsetTtc: number;
  /** R-PB-1: F5 ≥ pbDecel and F3 ≥ pbMinTtc. */
  readonly pbDecel: number;
  readonly pbMinTtc: number;
  /** R-LL-1: F6 < llLaneConf and F1 ≥ llLatOffset. */
  readonly llLaneConf: number;
  readonly llLatOffset: number;
  /** R-LD-1: F1 ≥ ldLatOffset and (F6 ≥ ldLaneConf or lane_conf unmapped). */
  readonly ldLatOffset: number;
  readonly ldLaneConf: number;
}

export const DEFAULT_RULE_THRESHOLDS: RuleThresholds = {
  ciDropRate: 0.5,
  ciMinTtc: 3.0,
  lbMinTtc: 2.0,
  lbBrakeOnsetTtc: 1.5,
  pbDecel: 3.0,
  pbMinTtc: 4.0,
  llLaneConf: 0.4,
  llLatOffset: 0.5,
  ldLatOffset: 0.5,
  ldLaneConf: 0.4,
};

/** One threshold test `F op θ`. */
interface Test {
  readonly id: FeatureId;
  readonly op: ">=" | "<";
  readonly threshold: number;
}

/** A rule: all `all` tests hold, and (when `any` is given) at least one `any` alternative holds. */
interface Rule {
  readonly ruleId: Exclude<RuleId, "R-UN">;
  readonly all: readonly Test[];
  /** Disjunction: a test, or the literal "lane_conf unmapped". */
  readonly any?: readonly (Test | "lane-conf-unmapped")[];
}

const t = (id: FeatureId, op: Test["op"], threshold: number): Test => ({ id, op, threshold });

/** The §5.4 rule list for the given thresholds, in evaluation order. */
export function buildRules(th: RuleThresholds): readonly Rule[] {
  return [
    { ruleId: "R-CI-1", all: [t("F10", ">=", th.ciDropRate), t("F3", "<", th.ciMinTtc)] },
    { ruleId: "R-LB-1", all: [t("F3", "<", th.lbMinTtc), t("F4", "<", th.lbBrakeOnsetTtc)] },
    { ruleId: "R-PB-1", all: [t("F5", ">=", th.pbDecel), t("F3", ">=", th.pbMinTtc)] },
    { ruleId: "R-LL-1", all: [t("F6", "<", th.llLaneConf), t("F1", ">=", th.llLatOffset)] },
    { ruleId: "R-LD-1", all: [t("F1", ">=", th.ldLatOffset)], any: [t("F6", ">=", th.ldLaneConf), "lane-conf-unmapped"] },
  ];
}

/** Does the test hold? A missing (n/a) feature never satisfies a test. */
function holds(test: Test, f: FeatureVector): boolean {
  const x = f[test.id];
  if (x === undefined) return false;
  return test.op === ">=" ? x >= test.threshold : x < test.threshold;
}

function ruleMatches(rule: Rule, f: FeatureVector, flags: FeatureFlags): boolean {
  if (!rule.all.every((x) => holds(x, f))) return false;
  if (rule.any === undefined) return true;
  return rule.any.some((a) => (a === "lane-conf-unmapped" ? f.F6 === undefined && flags.F6 === "channel-unmapped" : holds(a, f)));
}

/**
 * Adds `(x − θ) / sᵢ` for every test of `rule` whose feature is present, keeping per
 * feature the margin closest to zero (the binding threshold).
 */
function addMargins(rule: Rule, f: FeatureVector, scales: FeatureParams, out: { [K in FeatureId]?: number }): void {
  const tests = [...rule.all, ...(rule.any ?? [])].filter((x): x is Test => x !== "lane-conf-unmapped");
  for (const test of tests) {
    const x = f[test.id];
    if (x === undefined) continue;
    const m = (x - test.threshold) / scales[test.id];
    const prev = out[test.id];
    if (prev === undefined || Math.abs(m) < Math.abs(prev)) out[test.id] = m;
  }
}

/**
 * Classifies a feature vector. Rules are tried in order and the first match wins;
 * otherwise `unknown` (R-UN). `margins` holds `(x − θ)/sᵢ` for every quantity tested
 * by the rules evaluated (all earlier rules plus the matching one, or all rules for
 * R-UN); for a feature tested against several thresholds the one nearest zero is kept.
 * So when every |margin| > 1, perturbations below 1 sᵢ cannot change the type.
 */
export function classifyType(
  features: FeatureVector,
  flags: FeatureFlags = {},
  thresholds: RuleThresholds = DEFAULT_RULE_THRESHOLDS,
  scales: FeatureParams = DEFAULT_SCALES,
): TypeClassification {
  const margins: { [K in FeatureId]?: number } = {};
  for (const rule of buildRules(thresholds)) {
    addMargins(rule, features, scales, margins);
    if (ruleMatches(rule, features, flags)) return { type: RULE_TYPE[rule.ruleId], ruleId: rule.ruleId, margins: margins as RuleMargins };
  }
  return { type: RULE_TYPE["R-UN"], ruleId: "R-UN", margins: margins as RuleMargins };
}
