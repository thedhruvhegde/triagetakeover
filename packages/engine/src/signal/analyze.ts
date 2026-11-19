/**
 * Window → signal summary (features + type), the `sig` block of `tt.event` (§6.1).
 */
import {
  DEFAULT_SCALES,
  TYPE_DECIDING_CHANNELS,
  type BrakeUnit,
  type FeatureParams,
  type SignalSummary,
} from "../schema/index.js";
import type { SignalWindow } from "../resample/window.js";
import { computeFeatures } from "./features.js";
import { DEFAULT_RULE_THRESHOLDS, classifyType, type RuleThresholds } from "./rules.js";

/** `sig` plus the §5.1 footnote flag. */
export interface SignalAnalysis extends SignalSummary {
  /** None of lane_offset, ttc, brake is mapped: type is forced to `unknown` (§5.1). */
  readonly insufficientChannels: boolean;
}

export interface SignalAnalyzeOptions {
  readonly brakeUnit?: BrakeUnit;
  readonly thresholds?: RuleThresholds;
  readonly scales?: FeatureParams;
}

/** True when at least one of lane_offset, ttc, brake is mapped. */
export function hasTypeDecidingChannel(window: SignalWindow): boolean {
  return TYPE_DECIDING_CHANNELS.some((c) => window[c] !== undefined);
}

/** Computes features and the takeover type for a window. */
export function analyzeSignal(window: SignalWindow, options: SignalAnalyzeOptions = {}): SignalAnalysis {
  const { features, flags } = computeFeatures(window, options.brakeUnit ?? "ratio");
  const insufficientChannels = !hasTypeDecidingChannel(window);
  const cls = classifyType(features, flags, options.thresholds ?? DEFAULT_RULE_THRESHOLDS, options.scales ?? DEFAULT_SCALES);
  const summary = insufficientChannels ? { type: "unknown" as const, ruleId: "R-UN" as const, margins: cls.margins } : cls;
  return { ...summary, features, flags, insufficientChannels };
}
