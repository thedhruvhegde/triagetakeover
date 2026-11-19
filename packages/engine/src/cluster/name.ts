/**
 * Deterministic cluster names (ARCHITECTURE §5.8 step 5, PRD US-21). Template only, no LLM:
 * `<Type> · <top chip, if not normal> · <variant>`, e.g. "Lane-loss · low sun · cam-B".
 */
import { type BucketKey, type ClusterInput, type ConditionChip, type TakeoverType } from "../schema/index.js";
import { dominantChip } from "./profile.js";

/** Display label per chip as used in names. */
export const CHIP_NAME_LABELS: Readonly<Record<ConditionChip, string>> = {
  night: "night",
  "low-sun-glare": "low sun",
  "blur-rain": "blur/rain",
  normal: "normal",
};

/** Separator between name parts. */
export const NAME_SEPARATOR = " · ";

/** "lane-loss" → "Lane-loss". */
export function typeLabel(type: TakeoverType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/** Builds the name from its parts; the chip part is omitted for "normal". */
export function clusterName(type: TakeoverType, chip: ConditionChip, variant: string): string {
  const parts = [typeLabel(type)];
  if (chip !== "normal") parts.push(CHIP_NAME_LABELS[chip]);
  parts.push(variant);
  return parts.join(NAME_SEPARATOR);
}

/** Name for a bucket's group of events, using the majority chip ({@link dominantChip}). */
export function clusterNameFor(bucket: BucketKey, members: readonly Pick<ClusterInput, "chips">[]): string {
  return clusterName(bucket.type, dominantChip(members), bucket.variant);
}
