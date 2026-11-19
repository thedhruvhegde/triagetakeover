/**
 * The `demo-v1` profile: every PRE-REGISTERED number from SEED_DATA §5–§12 in one place.
 * `paramsHash` in the truth file is the SHA-256 of this object's JSON.
 */
import type { Build, ComponentName, LatentId, Light, Route, TakeoverType, Variant } from "../types.js";

export const GENERATOR_VERSION = "1.0.0";
export const PROFILE_ID = "demo-v1";
/**
 * Default demo seed (SEED_DATA §13.1): the smallest seed ≥ 2026 that meets every demo criterion
 * with these parameters and the engine defaults. 2026 and 2028 have one historical LC-B event and
 * 2027 one historical LC-C event (criterion 2). Verified by `test/e2e.seed.test.ts`; recompute it
 * whenever the profile or the engine defaults change.
 */
export const DEFAULT_SEED = 2029;

export const BUILDS: readonly Build[] = ["4.11.0", "4.11.3", "4.12.0"];

/** Build windows as day offsets from the anchor, inclusive (§5.2). */
export const BUILD_WINDOWS: Readonly<Record<Build, readonly [number, number]>> = {
  "4.11.0": [-42, -29],
  "4.11.3": [-28, -15],
  "4.12.0": [-14, -1],
};

/** Last weekday a non-weekend 4.12.0 session may use, so no history lands after the Friday mark. */
export const LAST_WEEKDAY_OFFSET = -4;
/** Final weekend (Sat, Sun) day offsets. */
export const WEEKEND_OFFSETS: readonly number[] = [-2, -1];
/** "Mark triaged": anchor − 3 d at 17:00 UTC (§7.5). */
export const TRIAGE_MARK_OFFSET_DAYS = -3;
export const TRIAGE_MARK_SECONDS = 17 * 3600;

export interface VehiclePlan {
  readonly vehicleId: string;
  readonly variant: Variant;
  readonly camera: string;
  readonly rateHz: number;
  readonly calibrationAgeDays: number;
  readonly secondRoute: Route;
  readonly sessions: Readonly<Record<Build, number>>;
  /** Number of 4.12.0 sessions placed on the final weekend. */
  readonly weekendSessions: number;
  /** Timestamp jitter ±fraction of dt (V-02 only, §8.1). */
  readonly jitter: number;
}

export const VEHICLES: readonly VehiclePlan[] = [
  {
    vehicleId: "V-01", variant: "cam-A", camera: "Cam-A 1.2 MP, 52° HFOV, wide dynamic range (fictional)",
    rateHz: 100, calibrationAgeDays: 62, secondRoute: "urban",
    sessions: { "4.11.0": 4, "4.11.3": 4, "4.12.0": 5 }, weekendSessions: 2, jitter: 0,
  },
  {
    vehicleId: "V-02", variant: "cam-B", camera: "Cam-B 1.2 MP, 60° HFOV, narrower dynamic range (fictional)",
    rateHz: 50, calibrationAgeDays: 17, secondRoute: "rural",
    sessions: { "4.11.0": 4, "4.11.3": 4, "4.12.0": 6 }, weekendSessions: 2, jitter: 0.02,
  },
  {
    vehicleId: "V-03", variant: "cam-B", camera: "Cam-B 1.2 MP, 60° HFOV, narrower dynamic range (fictional)",
    rateHz: 200, calibrationAgeDays: 50, secondRoute: "rural",
    sessions: { "4.11.0": 4, "4.11.3": 4, "4.12.0": 5 }, weekendSessions: 1, jitter: 0,
  },
];

export const RADAR_CALIBRATION_AGE_DAYS = 40;
export const HIGHWAY_SHARE = 0.6;
export const LIGHT_PROBS: Readonly<Record<Light, number>> = { day: 0.45, "low-sun": 0.35, night: 0.2 };
export const RAIN_PROB = 0.2;
export const KM_RANGE: Readonly<Record<Route, readonly [number, number]>> = {
  highway: [140, 260], rural: [60, 140], urban: [60, 140],
};
export const MEAN_SPEED_KMH: Readonly<Record<Route, number>> = { highway: 95, rural: 65, urban: 40 };
/** Route speed means for telemetry, m/s (§8.2). */
export const ROUTE_SPEED: Readonly<Record<Route, readonly [number, number]>> = {
  highway: [27, 33], rural: [18, 24], urban: [12, 16],
};

export interface ClusterPlan {
  readonly id: Exclude<LatentId, "NOVEL-1">;
  readonly expectedType: TakeoverType;
  readonly variant: Variant;
  readonly rates: Readonly<Record<Build, number>>;
  readonly routes: readonly Route[];
  readonly light: readonly Light[];
  /** When false, rainy sessions are also eligible. */
  readonly dryOnly: boolean;
  readonly owner: ComponentName;
  readonly coverage: "covered" | "uncovered";
  readonly chips: readonly string[];
  readonly odd: Route;
}

/** Latent clusters (§7.1). Rates are per 1,000 km of the variant's exposure. */
export const CLUSTERS: readonly ClusterPlan[] = [
  {
    id: "LC-A", expectedType: "lane-loss", variant: "cam-B", rates: { "4.11.0": 0.1, "4.11.3": 0.1, "4.12.0": 8.0 },
    routes: ["highway", "rural"], light: ["low-sun"], dryOnly: true, owner: "Perception", coverage: "uncovered",
    chips: ["low-sun-glare"], odd: "highway",
  },
  {
    id: "LC-B", expectedType: "late-brake", variant: "cam-A", rates: { "4.11.0": 1.8, "4.11.3": 1.8, "4.12.0": 1.8 },
    routes: ["urban"], light: ["night"], dryOnly: false, owner: "Planning", coverage: "covered",
    chips: ["night"], odd: "urban",
  },
  {
    id: "LC-C", expectedType: "lateral-drift", variant: "cam-B", rates: { "4.11.0": 1.0, "4.11.3": 1.0, "4.12.0": 1.0 },
    routes: ["rural"], light: ["day"], dryOnly: true, owner: "Controls", coverage: "covered",
    chips: [], odd: "rural",
  },
  {
    id: "LC-D", expectedType: "phantom-brake", variant: "cam-A", rates: { "4.11.0": 1.5, "4.11.3": 1.5, "4.12.0": 1.5 },
    routes: ["highway"], light: ["day"], dryOnly: true, owner: "Perception", coverage: "covered",
    chips: [], odd: "highway",
  },
];

/** Frame-count distribution for 1..4 frames (§7.4). */
export const FRAME_COUNT_PROBS: readonly number[] = [0.15, 0.4, 0.3, 0.15];

/** Raw CSV window around t_to, seconds (§8.1). */
export const CSV_PRE_S = 22;
export const CSV_POST_S = 8;

/** Frame sizes and JPEG qualities (§3.1, §9.1). */
export const FRAME_SIZES = {
  full: { width: 1280, height: 720, quality: 85 },
  fast: { width: 960, height: 540, quality: 80 },
} as const;
