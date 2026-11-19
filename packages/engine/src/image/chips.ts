/**
 * Condition chips from image metrics (ARCHITECTURE §5.5). Chips are image statistics,
 * not scene understanding (PRD US-08 AC4).
 */
import {
  DEFAULT_CHIP_THRESHOLDS,
  type ChipOp,
  type ChipRule,
  type ChipThresholds,
  type ConditionChip,
  type ImageMetricKey,
  type ImageMetrics,
} from "../schema/index.js";

/** Chips that fired (in `CONDITION_CHIPS` order) and the conditions that made them fire. */
export interface ChipEvaluation {
  readonly chips: readonly ConditionChip[];
  readonly chipRules: readonly ChipRule[];
}

function compare(value: number, op: ChipOp, threshold: number): boolean {
  switch (op) {
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
  }
}

/** Builds the rule record for `metric op threshold`, or null when the comparison is false. */
function test(chip: ConditionChip, m: ImageMetrics, metric: ImageMetricKey, op: ChipOp, threshold: number): ChipRule | null {
  const value = m[metric];
  return compare(value, op, threshold) ? { chip, metric, op, value, threshold } : null;
}

function isRule(r: ChipRule | null): r is ChipRule {
  return r !== null;
}

/**
 * Applies the chip table:
 * - `night`: meanY < 45 and p95 < 160 (both conditions recorded)
 * - `low-sun-glare`: not night and (sunBlob ≥ 0.004 or glare ≥ 0.05) (each true condition recorded)
 * - `blur-rain`: lapVar < 60 and contrast < 40 (both recorded)
 * - `normal`: no other chip fired (no rules)
 */
export function evaluateChips(m: ImageMetrics, t: ChipThresholds = DEFAULT_CHIP_THRESHOLDS): ChipEvaluation {
  const chips: ConditionChip[] = [];
  const rules: ChipRule[] = [];
  const night = [test("night", m, "meanY", "<", t.nightMeanYBelow), test("night", m, "p95", "<", t.nightP95Below)];
  const isNight = night.every(isRule);
  if (isNight) {
    chips.push("night");
    rules.push(...night.filter(isRule));
  }
  const glare = [
    test("low-sun-glare", m, "sunBlob", ">=", t.sunBlobAtLeast),
    test("low-sun-glare", m, "glare", ">=", t.glareAtLeast),
  ].filter(isRule);
  if (!isNight && glare.length > 0) {
    chips.push("low-sun-glare");
    rules.push(...glare);
  }
  const blur = [test("blur-rain", m, "lapVar", "<", t.blurLapVarBelow), test("blur-rain", m, "contrast", "<", t.blurContrastBelow)];
  if (blur.every(isRule)) {
    chips.push("blur-rain");
    rules.push(...blur.filter(isRule));
  }
  if (chips.length === 0) chips.push("normal");
  return { chips, chipRules: rules };
}
