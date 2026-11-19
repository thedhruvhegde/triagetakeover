/**
 * Signal features F1..F10 (ARCHITECTURE §5.3) and takeover types (§5.4).
 */
import type { SignalChannel } from "./channels.js";

export const FEATURE_IDS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

/** Descriptive key per feature id (§5.3 "Feature" column). */
export const FEATURE_KEYS = {
  F1: "peakLatOffset",
  F2: "driftLatency",
  F3: "minTtc",
  F4: "brakeOnsetTtc",
  F5: "peakDecel",
  F6: "minLaneConf",
  F7: "torqueSpike",
  F8: "speedAtTakeover",
  F9: "yawRateDev",
  F10: "ttcDropRate",
} as const satisfies Record<FeatureId, string>;
/** Feature descriptive key (`peakLatOffset`, ...). */
export type FeatureKey = (typeof FEATURE_KEYS)[FeatureId];

/** Static description of one feature. */
export interface FeatureSpec {
  readonly id: FeatureId;
  /** Descriptive key used in UI and why-tables, e.g. `peakLatOffset`. */
  readonly key: FeatureKey;
  /** Engineering unit (`"-"` for dimensionless ratios). */
  readonly unit: string;
  /** Channels that must be usable for the feature to be computed. */
  readonly needs: readonly SignalChannel[];
  /** Default scale sᵢ: the size of a "meaningful" difference, in `unit`. */
  readonly scale: number;
  /** Default weight wᵢ in the distance. */
  readonly weight: number;
  /** Physical clamp range `[min, max]` in `unit`. */
  readonly range: readonly [number, number];
  readonly description: string;
}

/**
 * The §5.3 table. Clamp ranges are only exemplified in the spec (`peakLatOffset ∈ [0, 3]`,
 * `minTtc ∈ [0, 10]`); the others are chosen as generous physical bounds.
 */
export const FEATURE_SPECS: Readonly<Record<FeatureId, FeatureSpec>> = {
  F1: { id: "F1", key: "peakLatOffset", unit: "m", needs: ["lane_offset"], scale: 0.15, weight: 1.0, range: [0, 3],
    description: "max |lane_offset| over [-5 s, 0]" },
  F2: { id: "F2", key: "driftLatency", unit: "s", needs: ["lane_offset"], scale: 0.75, weight: 1.0, range: [0, 15],
    description: "time since |lane_offset| last crossed 0.30 m upward and stayed above it until 0; 0 if never" },
  F3: { id: "F3", key: "minTtc", unit: "s", needs: ["ttc"], scale: 0.75, weight: 1.0, range: [0, 10],
    description: "min ttc over [-5 s, 0], clamped to [0, 10]" },
  F4: { id: "F4", key: "brakeOnsetTtc", unit: "s", needs: ["ttc", "brake"], scale: 0.5, weight: 1.0, range: [0, 10],
    description: "ttc at the first sample in [-5 s, +2 s] with brake > 0.1 (or > 3 bar); 10 if no braking" },
  F5: { id: "F5", key: "peakDecel", unit: "m/s²", needs: ["speed"], scale: 1.0, weight: 0.75, range: [0, 15],
    description: "max of -d(speed)/dt over [-5 s, +2 s], >= 0" },
  F6: { id: "F6", key: "minLaneConf", unit: "0..1", needs: ["lane_conf"], scale: 0.1, weight: 1.0, range: [0, 1],
    description: "min lane_conf over [-3 s, 0]" },
  F7: { id: "F7", key: "torqueSpike", unit: "Nm", needs: ["steer_torque"], scale: 1.0, weight: 0.5, range: [0, 50],
    description: "max |steer_torque| over [-0.5 s, +0.5 s]" },
  F8: { id: "F8", key: "speedAtTakeover", unit: "m/s", needs: ["speed"], scale: 4.0, weight: 0.5, range: [0, 80],
    description: "speed at t = 0" },
  F9: { id: "F9", key: "yawRateDev", unit: "rad/s", needs: ["yaw_rate"], scale: 0.02, weight: 0.5, range: [0, 2],
    description: "max |yaw_rate - median(yaw_rate over [-15 s, -5 s])| over [-5 s, 0]" },
  F10: { id: "F10", key: "ttcDropRate", unit: "-", needs: ["ttc"], scale: 0.15, weight: 0.5, range: [0, 1],
    description: "max over 1 s windows in [-5 s, 0] of relative ttc drop, in [0, 1]" },
};

/**
 * A feature vector. A missing key means "n/a" (channel not mapped or unusable);
 * the reason is in the matching {@link FeatureFlags} entry. Present values are always
 * finite and within `FEATURE_SPECS[id].range`.
 */
export type FeatureVector = { readonly [K in FeatureId]?: number };

/** A feature vector where every feature is present (used by full-overlap properties). */
export type FullFeatureVector = { readonly [K in FeatureId]: number };

/** Why a feature is clamped or absent. */
export const FEATURE_FLAGS = ["clamped", "channel-unmapped", "channel-coverage"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlags = { readonly [K in FeatureId]?: FeatureFlag };

/** Per-feature weights or scales (admin-configurable, §5.3). */
export type FeatureParams = { readonly [K in FeatureId]: number };

/** Default scales sᵢ. */
export const DEFAULT_SCALES: FeatureParams = mapFeatures((id) => FEATURE_SPECS[id].scale);
/** Default weights wᵢ. */
export const DEFAULT_WEIGHTS: FeatureParams = mapFeatures((id) => FEATURE_SPECS[id].weight);

/** Builds a full per-feature record from a function of the id. */
export function mapFeatures<T>(f: (id: FeatureId) => T): { readonly [K in FeatureId]: T } {
  const out = {} as { [K in FeatureId]: T };
  for (const id of FEATURE_IDS) out[id] = f(id);
  return out;
}

/** Clamps `value` into the feature's range and reports whether clamping happened. NaN is not accepted. */
export function clampFeature(id: FeatureId, value: number): { readonly value: number; readonly clamped: boolean } {
  const [lo, hi] = FEATURE_SPECS[id].range;
  if (value < lo) return { value: lo, clamped: true };
  if (value > hi) return { value: hi, clamped: true };
  return { value, clamped: false };
}

// ---- Takeover types (§5.4) ----

/** Takeover types in rule order (first match wins); `unknown` is the fallback. */
export const TAKEOVER_TYPES = ["cut-in-response", "late-brake", "phantom-brake", "lane-loss", "lateral-drift", "unknown"] as const;
export type TakeoverType = (typeof TAKEOVER_TYPES)[number];

/** Rule ids in evaluation order. */
export const RULE_IDS = ["R-CI-1", "R-LB-1", "R-PB-1", "R-LL-1", "R-LD-1", "R-UN"] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** The type each rule assigns. */
export const RULE_TYPE: Readonly<Record<RuleId, TakeoverType>> = {
  "R-CI-1": "cut-in-response",
  "R-LB-1": "late-brake",
  "R-PB-1": "phantom-brake",
  "R-LL-1": "lane-loss",
  "R-LD-1": "lateral-drift",
  "R-UN": "unknown",
};

/** Signed distance of each tested quantity to its threshold, in units of sᵢ. */
export type RuleMargins = { readonly [K in FeatureId]?: number };

/** Output of type classification. */
export interface TypeClassification {
  readonly type: TakeoverType;
  readonly ruleId: RuleId;
  readonly margins: RuleMargins;
}

/** How the takeover time was found (§5.2). */
export const TAKEOVER_SOURCES = ["flag", "manual", "heuristic"] as const;
export type TakeoverSource = (typeof TAKEOVER_SOURCES)[number];
export const TAKEOVER_CONFIDENCES = ["high", "low"] as const;
export type TakeoverConfidence = (typeof TAKEOVER_CONFIDENCES)[number];
