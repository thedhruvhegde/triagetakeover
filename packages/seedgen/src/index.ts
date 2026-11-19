/**
 * @tt/seedgen: deterministic procedural generator for the synthetic demo fleet (SEED_DATA.md).
 * Pure: no clock, no Math.random, no filesystem. Same config → same bytes (on the pinned Node).
 */
import { buildVehicles } from "./fleet/index.js";
import { planEvents } from "./events/index.js";
import { generateFrames } from "./render/frames.js";
import { Rng } from "./rng/index.js";
import { buildRouting } from "./routing/index.js";
import { buildScenarios } from "./scenarios/index.js";
import { planSessions } from "./sessions/index.js";
import { generateCsv } from "./telemetry/index.js";
import { truthFromPlan, type GroundTruth } from "./truth/index.js";
import { TRIAGE_MARK_OFFSET_DAYS, TRIAGE_MARK_SECONDS } from "./plan/profile.js";
import type { EventFiles, FleetPlanOutput, SeedConfig } from "./types.js";
import { epochSeconds, formatIsoDateTime, parseIsoDate } from "./util/dates.js";

export * from "./types.js";
export { GENERATOR_VERSION, PROFILE_ID, DEFAULT_SEED, BUILDS, CLUSTERS, VEHICLES, FRAME_SIZES } from "./plan/profile.js";
export { Rng, stream, splitmix32, fmix32, hashLabel } from "./rng/index.js";
export { renderFrame, toneCurve, watermarkLayout, horizonFraction, WATERMARK_BOX_LUMA, WATERMARK_TEXT_LUMA, type FrameRenderInput, type SunSpec } from "./render/scene.js";
export { EXPECTED_CHIPS, renderedFrameTimes, watermarkLines, frameFileName } from "./render/frames.js";
export { encodeJpeg, spliceComSegment, readComSegments, comText } from "./jpeg/index.js";
export { synthesizeTelemetry, writeTelemetryCsv, commentLine, csvFileName, NUMERIC_CHANNELS, type ArchetypeParams, type RawTelemetry } from "./telemetry/index.js";
export { isEligible, exposureKm, PLANTED, QUIRK_RULES } from "./events/index.js";
export { SHARED_NOTES, CLUSTER_NOTES, NOTE_DRIFTED_LEFT, NOTE_BRAKED_HARD, NOTE_STEERING_LIGHT } from "./text/index.js";
export { SCENARIO_ROWS, tagLabels } from "./scenarios/index.js";
export { routeType, EXPECTED_OWNER, COMPONENTS } from "./routing/index.js";
export { paramsHash, type GroundTruth, type TruthEvent, type TruthCluster, type TruthFrame } from "./truth/index.js";
export { sha256Hex } from "./util/sha256.js";
export { utf8Encode } from "./util/utf8.js";
export { parseIsoDate, formatIsoDate, formatIsoDateTime, weekday } from "./util/dates.js";

/** Validates a config; throws RangeError on a non-uint32 seed, bad anchor date or unknown profile. Returns the anchor day number. */
export function validateConfig(cfg: SeedConfig): number {
  if (!Number.isInteger(cfg.seed) || cfg.seed < 0 || cfg.seed > 0xffffffff) throw new RangeError(`seed must be a uint32, got ${cfg.seed}`);
  if (cfg.profile !== "demo-v1") throw new RangeError(`unknown profile ${String(cfg.profile)}`);
  if (cfg.frames !== "full" && cfg.frames !== "fast") throw new RangeError(`frames must be "full" or "fast"`);
  const day = parseIsoDate(cfg.anchorDate);
  if (day === null) throw new RangeError(`anchorDate must be YYYY-MM-DD, got ${cfg.anchorDate}`);
  return day;
}

interface InternalPlan {
  readonly plan: FleetPlanOutput;
  readonly sm3: "ok" | "degraded" | "missing";
}

function planInternal(cfg: SeedConfig): InternalPlan {
  const anchorDay = validateConfig(cfg);
  const root = new Rng(cfg.seed);
  const vehicles = buildVehicles(anchorDay);
  const driveSessions = planSessions(root.fork("fleet"), anchorDay);
  const { events, quirksUnassigned, sm3 } = planEvents(root, driveSessions, vehicles);
  const plan: FleetPlanOutput = {
    vehicles, driveSessions, events, scenarios: buildScenarios(cfg.seed), routing: buildRouting(),
    triagedMark: formatIsoDateTime(epochSeconds(anchorDay + TRIAGE_MARK_OFFSET_DAYS, TRIAGE_MARK_SECONDS)), quirksUnassigned,
  };
  return { plan, sm3 };
}

/** Plans the fleet (vehicles, sessions, events with text, scenarios, routing). Cheap: no file bytes. */
export function planFleet(cfg: SeedConfig): FleetPlanOutput {
  return planInternal(cfg).plan;
}

/** Generates the CSV and JPEG frames of one event. Identical to generating it inside a full run. */
export function generateEventFiles(cfg: SeedConfig, eventId: string, plan: FleetPlanOutput = planFleet(cfg)): EventFiles {
  const e = plan.events.find((x) => x.eventId === eventId);
  if (e === undefined) throw new RangeError(`unknown event ${eventId}`);
  const vehicle = plan.vehicles.find((v) => v.vehicleId === e.vehicleId);
  if (vehicle === undefined) throw new RangeError(`unknown vehicle ${e.vehicleId}`);
  const root = new Rng(cfg.seed);
  return { csv: generateCsv(root, cfg.seed, e, vehicle), frames: generateFrames(root, cfg, e) };
}

/** Ground truth for a config (§14). Pure and cheap. */
export function buildTruth(cfg: SeedConfig): GroundTruth {
  const { plan, sm3 } = planInternal(cfg);
  return truthFromPlan(cfg, plan, sm3);
}

/** Everything at once: plan, per-event files and truth. */
export function generateFleet(cfg: SeedConfig): { plan: FleetPlanOutput; files: Readonly<Record<string, EventFiles>>; truth: GroundTruth } {
  const { plan, sm3 } = planInternal(cfg);
  const files: Record<string, EventFiles> = {};
  for (const e of plan.events) files[e.eventId] = generateEventFiles(cfg, e.eventId, plan);
  return { plan, files, truth: truthFromPlan(cfg, plan, sm3) };
}
