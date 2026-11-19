/**
 * Ground-truth labels (SEED_DATA §14.1–§14.2). Pure and regenerable from the config; never
 * written into Jira. The engine must never import this module.
 */
import { BUILDS, CLUSTERS, GENERATOR_VERSION, PROFILE_ID, VEHICLES } from "../plan/profile.js";
import { EXPECTED_CHIPS, renderedFrameTimes } from "../render/frames.js";
import { EXPECTED_OWNER } from "../routing/index.js";
import { SCENARIO_ROWS } from "../scenarios/index.js";
import type { ConditionChip, EventSpec, FleetPlanOutput, FrameCondition, LatentId, QuirkId, RoleId, SeedConfig, TakeoverType } from "../types.js";
import { sha256Hex } from "../util/sha256.js";
import { utf8Encode } from "../util/utf8.js";

export interface TruthCluster {
  readonly id: LatentId;
  readonly expectedType: TakeoverType;
  readonly variant: string;
  readonly chips: readonly string[];
  readonly odd: string | null;
  readonly ratesPer1000km: Readonly<Record<string, number>> | null;
  readonly trueOnsetBuild: string | null;
  readonly owner: string;
  readonly coverage: "covered" | "uncovered" | null;
  readonly calibrationCausal: false;
}

export interface TruthFrame {
  readonly k: number;
  readonly tRel: number;
  readonly condition: FrameCondition;
  readonly expectedChips: readonly ConditionChip[];
}

export interface TruthEvent {
  readonly eventId: string;
  readonly latent: LatentId;
  readonly planted: boolean;
  readonly monday: boolean;
  readonly roles: readonly RoleId[];
  readonly boundary: readonly string[];
  readonly quirks: readonly QuirkId[];
  readonly expectedMismatch: "type" | null;
  readonly expectedType: TakeoverType;
  readonly expectedChips: readonly ConditionChip[];
  readonly frames: readonly TruthFrame[];
  readonly note: string;
  readonly sessionId: string;
}

export interface GroundTruth {
  readonly v: 1;
  readonly generator: string;
  readonly profile: string;
  readonly seed: number;
  readonly anchorDate: string;
  readonly paramsHash: string;
  readonly clusters: readonly TruthCluster[];
  readonly events: readonly TruthEvent[];
  readonly pairs: {
    readonly sameTextDifferentSignal: readonly (readonly [string, string])[];
    readonly differentTextSameSignal: readonly (readonly [string, string])[];
    readonly sm3: "ok" | "degraded" | "missing";
  };
  /** Role id → event id for the planted and SM-3 roles present on this seed. */
  readonly roles: Readonly<Partial<Record<RoleId, string>>>;
  readonly sessions: readonly { sessionId: string; vehicleId: string; build: string; km: number; odd: readonly string[] }[];
  readonly scenarios: readonly { id: string; tags: unknown; intendedCovers: readonly LatentId[] }[];
  readonly expectedCoverage: Readonly<Record<string, "covered" | "uncovered">>;
  readonly expectedOwner: Readonly<Record<string, string>>;
  readonly quirksUnassigned: readonly QuirkId[];
}

/** `sha256:` hash of the PRE-REGISTERED profile parameters. */
export function paramsHash(): string {
  const json = JSON.stringify({ profile: PROFILE_ID, vehicles: VEHICLES, clusters: CLUSTERS, builds: BUILDS });
  return `sha256:${sha256Hex(utf8Encode(json))}`;
}

const BOUNDARY: Partial<Record<RoleId, readonly string[]>> = {
  AMB1: ["R-LL-1", "chip:low-sun-glare"],
  AMB2: ["R-LB-1", "R-CI-1"],
};

function expectedTypeOf(latent: LatentId): TakeoverType {
  return latent === "NOVEL-1" ? "lane-loss" : (CLUSTERS.find((c) => c.id === latent)?.expectedType ?? "unknown");
}

function truthEvent(cfg: SeedConfig, e: EventSpec): TruthEvent {
  const chips = EXPECTED_CHIPS[e.frameCondition];
  return {
    eventId: e.eventId, latent: e.archetype, planted: e.planted, monday: e.monday, roles: e.roles,
    boundary: e.roles.flatMap((r) => BOUNDARY[r] ?? []), quirks: e.quirks, expectedMismatch: e.quirks.includes("Q6") ? "type" : null,
    expectedType: expectedTypeOf(e.archetype), expectedChips: chips,
    frames: renderedFrameTimes(cfg, e).map((tRel, i) => ({ k: i + 1, tRel, condition: e.frameCondition, expectedChips: chips })),
    note: e.note, sessionId: e.sessionId,
  };
}

/** Builds the truth file from a plan (see `buildTruth` in the package root for the config entry point). */
export function truthFromPlan(cfg: SeedConfig, plan: FleetPlanOutput, sm3: "ok" | "degraded" | "missing"): GroundTruth {
  const roles: Partial<Record<RoleId, string>> = {};
  for (const e of plan.events) for (const r of e.roles) roles[r] = e.eventId;
  const pair = (a: RoleId, b: RoleId): [string, string][] => {
    const x = roles[a], y = roles[b];
    return x !== undefined && y !== undefined ? [[x, y]] : [];
  };
  const clusters: TruthCluster[] = [
    ...CLUSTERS.map((c): TruthCluster => ({
      id: c.id, expectedType: c.expectedType, variant: c.variant, chips: c.chips, odd: c.odd, ratesPer1000km: c.rates,
      trueOnsetBuild: c.rates["4.12.0"] > c.rates["4.11.3"] ? "4.12.0" : null, owner: c.owner, coverage: c.coverage, calibrationCausal: false,
    })),
    {
      id: "NOVEL-1", expectedType: "lane-loss", variant: "cam-B", chips: [], odd: null, ratesPer1000km: null, trueOnsetBuild: null,
      owner: EXPECTED_OWNER["NOVEL-1"], coverage: null, calibrationCausal: false,
    },
  ];
  return {
    v: 1, generator: GENERATOR_VERSION, profile: cfg.profile, seed: cfg.seed, anchorDate: cfg.anchorDate, paramsHash: paramsHash(),
    clusters,
    events: plan.events.map((e) => truthEvent(cfg, e)),
    pairs: { sameTextDifferentSignal: [...pair("P1a", "P1b"), ...pair("P3a", "P3b")], differentTextSameSignal: pair("P1b", "SM3"), sm3 },
    roles,
    sessions: plan.driveSessions.map((s) => ({ sessionId: s.sessionId, vehicleId: s.vehicleId, build: s.build, km: s.km, odd: s.odd })),
    scenarios: SCENARIO_ROWS.map((s) => ({ id: s.id, tags: s.tags, intendedCovers: s.intendedCovers })),
    expectedCoverage: Object.fromEntries(CLUSTERS.map((c) => [c.id, c.coverage])),
    expectedOwner: Object.fromEntries(CLUSTERS.map((c) => [c.id, EXPECTED_OWNER[c.id]])),
    quirksUnassigned: plan.quirksUnassigned,
  };
}
