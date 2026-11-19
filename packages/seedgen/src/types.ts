/**
 * Record types produced by the generator (SEED_DATA §3.1, §5–§12, §14).
 * Engine vocabulary (TakeoverType, ConditionChip) is imported type-only from `@tt/engine`, so the
 * generator and the engine cannot drift apart; no engine runtime code is pulled in.
 */
import type { ConditionChip, TakeoverType } from "@tt/engine";

export type { ConditionChip, TakeoverType };

export type Variant = "cam-A" | "cam-B";
export type Build = "4.11.0" | "4.11.3" | "4.12.0";
export type Route = "highway" | "rural" | "urban";
export type Light = "day" | "low-sun" | "night";
export type Weather = "dry" | "rain";
export type LatentId = "LC-A" | "LC-B" | "LC-C" | "LC-D" | "NOVEL-1";
export type RoleId = "P1a" | "P1b" | "P3a" | "P3b" | "N1" | "AMB1" | "AMB2" | "SM3";
export type QuirkId = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6" | "Q7" | "Q8" | "Q9";
export type ComponentName = "Perception" | "Planning" | "Controls";
/** Rendering condition of a frame (§9.2). `low-sun-decoy` is cam-A low sun; `overcast` is NOVEL-1. */
export type FrameCondition = "day" | "overcast" | "low-sun" | "low-sun-decoy" | "low-sun-boundary" | "night" | "rain" | "night-rain";

export interface SeedConfig {
  /** uint32 seed. */
  readonly seed: number;
  /** ISO date (YYYY-MM-DD) of the demo Monday; passed in, never read from a clock. */
  readonly anchorDate: string;
  readonly profile: "demo-v1";
  /** full = 1280x720 q85; fast = 960x540 q80, at most 2 frames per Monday event. */
  readonly frames: "full" | "fast";
}

export interface VehicleRecord {
  readonly vehicleId: string;
  readonly label: string;
  readonly variant: Variant;
  readonly camera: string;
  readonly rateHz: number;
  readonly sensors: readonly string[];
  /** sensor → ISO date of last calibration. */
  readonly calibration: Readonly<Record<string, string>>;
  readonly routes: readonly Route[];
  readonly synthetic: true;
  readonly source: "demo-seed";
}

export interface DriveSessionRecord {
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly variant: Variant;
  readonly build: Build;
  /** ISO date (UTC). */
  readonly date: string;
  /** ISO timestamp of the session start (UTC). */
  readonly startUtc: string;
  readonly startEpoch: number;
  readonly durationMin: number;
  readonly km: number;
  readonly route: Route;
  readonly light: Light;
  readonly weather: Weather;
  /** `[route, light, weather]`, e.g. `["highway","low-sun","dry"]`. */
  readonly odd: readonly string[];
  readonly label: string;
  /** True for the final-weekend sessions whose events form the Monday batch. */
  readonly weekend: boolean;
  readonly synthetic: true;
  readonly source: "demo-seed";
}

/** ADF node (Atlassian Document Format), the minimal shape the templates produce. */
export interface AdfNode {
  readonly type: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean>>;
  readonly content?: readonly AdfNode[];
  readonly text?: string;
  readonly marks?: readonly { readonly type: string }[];
}

export interface AdfDoc {
  readonly type: "doc";
  readonly version: 1;
  readonly content: readonly AdfNode[];
}

/** Event metadata and text (§7.4). `archetype`, `roles`, `params` stay inside the generator. */
export interface EventSpec {
  readonly eventId: string;
  /** Stable generator key (stream label root), independent of the event's rank. */
  readonly key: string;
  readonly sessionId: string;
  readonly vehicleId: string;
  readonly variant: Variant;
  readonly build: Build;
  readonly occurredAt: string;
  readonly occurredEpoch: number;
  readonly odd: readonly string[];
  readonly route: Route;
  readonly light: Light;
  readonly weather: Weather;
  readonly archetype: LatentId;
  readonly planted: boolean;
  readonly roles: readonly RoleId[];
  readonly quirks: readonly QuirkId[];
  readonly frameCount: number;
  readonly frameTimes: readonly number[];
  readonly frameCondition: FrameCondition;
  readonly note: string;
  readonly summary: string;
  readonly descriptionAdf: AdfDoc;
  readonly labels: readonly string[];
  readonly monday: boolean;
}

export interface ScenarioTagsSeed {
  readonly type: TakeoverType;
  /** Absent means unspecified (SCN-06). */
  readonly variant?: string;
  readonly cond: readonly string[];
  readonly odd: readonly string[];
}

/** `tt.scenario` property value as written (`v` is the schema version, 1). */
export type ScenarioPropertySeed = Readonly<Record<string, number | string | readonly string[]>>;

export interface ScenarioIssueSpec {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly labels: readonly string[];
  readonly tags: ScenarioTagsSeed;
  /** True when tags live in the `tt.scenario` property instead of labels (SCN-07). */
  readonly tagsInProperty: boolean;
  /** `tt.scenario` property value when `tagsInProperty`. */
  readonly property: ScenarioPropertySeed | null;
  readonly intendedCovers: readonly LatentId[];
  readonly descriptionAdf: AdfDoc;
}

export interface RoutingRuleSeed {
  /** Matches when the event type is one of these; absent = default rule. */
  readonly match: { readonly type?: readonly TakeoverType[] };
  readonly team: { readonly component: ComponentName } | { readonly projectLead: true };
  readonly text: string;
}

export interface RoutingSeed {
  readonly components: readonly { readonly name: ComponentName; readonly lead: "admin" }[];
  readonly rules: readonly RoutingRuleSeed[];
}

export interface FleetPlanOutput {
  readonly vehicles: readonly VehicleRecord[];
  readonly driveSessions: readonly DriveSessionRecord[];
  readonly events: readonly EventSpec[];
  readonly scenarios: readonly ScenarioIssueSpec[];
  readonly routing: RoutingSeed;
  /** ISO timestamp of "Mark triaged" (anchor − 3 d, 17:00 UTC). */
  readonly triagedMark: string;
  /** Quirks that had no eligible event on this seed. */
  readonly quirksUnassigned: readonly QuirkId[];
}

export interface GeneratedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface EventFiles {
  readonly csv: GeneratedFile;
  readonly frames: readonly (GeneratedFile & { readonly tRel: number })[];
}
