/**
 * Drive sessions (SEED_DATA §6): dates, km, route / light / weather tags, with the plan
 * constraints of §6.2 enforced by forcing specific slots (checked by G-T10).
 */
import { Rng } from "../rng/index.js";
import {
  BUILD_WINDOWS, BUILDS, HIGHWAY_SHARE, KM_RANGE, LAST_WEEKDAY_OFFSET, LIGHT_PROBS, MEAN_SPEED_KMH, RAIN_PROB,
  VEHICLES, WEEKEND_OFFSETS, type VehiclePlan,
} from "../plan/profile.js";
import type { Build, DriveSessionRecord, Light, Route, Weather } from "../types.js";
import { epochSeconds, formatIsoDate, formatIsoDateTime } from "../util/dates.js";
import { round } from "../util/num.js";

/** Tags forced onto one slot to satisfy a plan constraint. */
interface ForcedTags {
  readonly route: Route;
  readonly light: Light;
  readonly weather: Weather;
}

const NIGHT_URBAN: ForcedTags = { route: "urban", light: "night", weather: "dry" };
const DAY_HIGHWAY: ForcedTags = { route: "highway", light: "day", weather: "dry" };
const LOWSUN_HIGHWAY: ForcedTags = { route: "highway", light: "low-sun", weather: "dry" };
const DAY_RURAL: ForcedTags = { route: "rural", light: "day", weather: "dry" };

/**
 * Forced slots per vehicle and build. Index ≥ 0 counts from the first slot; weekend slots are
 * the last `weekendSessions` slots of 4.12.0 and are listed under `weekend`.
 */
const FORCED: Readonly<Record<string, { readonly weekday: Readonly<Record<Build, readonly ForcedTags[]>>; readonly weekend: readonly ForcedTags[] }>> = {
  "V-01": {
    weekday: { "4.11.0": [NIGHT_URBAN, DAY_HIGHWAY], "4.11.3": [NIGHT_URBAN, DAY_HIGHWAY], "4.12.0": [NIGHT_URBAN, DAY_HIGHWAY] },
    weekend: [NIGHT_URBAN, DAY_HIGHWAY],
  },
  "V-02": {
    weekday: { "4.11.0": [LOWSUN_HIGHWAY], "4.11.3": [LOWSUN_HIGHWAY], "4.12.0": [DAY_RURAL] },
    weekend: [LOWSUN_HIGHWAY, DAY_RURAL],
  },
  "V-03": {
    weekday: { "4.11.0": [DAY_RURAL], "4.11.3": [DAY_RURAL], "4.12.0": [LOWSUN_HIGHWAY] },
    weekend: [],
  },
};

const ROUTE_NAMES: Readonly<Record<Route, string>> = { highway: "Highway loop H", rural: "Rural loop R", urban: "Urban loop U" };

function drawLight(rng: Rng): Light {
  const lights: readonly Light[] = ["day", "low-sun", "night"];
  return lights[rng.weightedIndex(lights.map((l) => LIGHT_PROBS[l]))] ?? "day";
}

/** Start time in seconds of day, consistent with the light tag (§6.2). */
function drawStartSeconds(rng: Rng, light: Light): number {
  const minutes = (a: number, b: number): number => Math.round(rng.range(a, b)) * 60;
  if (light === "night") return minutes(18.5 * 60, 22 * 60);
  if (light === "day") return minutes(9 * 60, 15 * 60);
  return rng.chance(0.5) ? minutes(7 * 60, 8.5 * 60) : minutes(15.5 * 60, 17 * 60);
}

interface SlotDraft {
  /** Sort key: start time, then vehicle, build and slot. */
  readonly order: string;
  readonly record: Omit<DriveSessionRecord, "sessionId">;
}

function drawSlot(seedRng: Rng, anchorDay: number, v: VehiclePlan, build: Build, slot: number, forced: ForcedTags | undefined, weekend: boolean): SlotDraft {
  const rng = seedRng.fork(`session:${v.vehicleId}:${build}:${slot}`);
  const tags = rng.fork("tags");
  const route = forced?.route ?? (tags.chance(HIGHWAY_SHARE) ? "highway" : v.secondRoute);
  const light = forced?.light ?? drawLight(tags);
  const weather = forced?.weather ?? (tags.chance(RAIN_PROB) ? "rain" : "dry");
  const when = rng.fork("date");
  const [lo, hi] = BUILD_WINDOWS[build];
  const last = build === "4.12.0" ? LAST_WEEKDAY_OFFSET : hi;
  const offset = weekend ? when.pick(WEEKEND_OFFSETS) : lo + when.int(last - lo + 1);
  const day = anchorDay + offset;
  const startEpoch = epochSeconds(day, drawStartSeconds(when, light));
  const [kmLo, kmHi] = KM_RANGE[route];
  const km = round(rng.fork("km").range(kmLo, kmHi), 1);
  const durationMin = Math.round((km / MEAN_SPEED_KMH[route]) * 60);
  const loop = 1 + rng.fork("label").int(3);
  const record: Omit<DriveSessionRecord, "sessionId"> = {
    vehicleId: v.vehicleId, variant: v.variant, build, date: formatIsoDate(day), startUtc: formatIsoDateTime(startEpoch),
    startEpoch, durationMin, km, route, light, weather, odd: [route, light, weather],
    label: `${ROUTE_NAMES[route]}${loop} (synthetic)`, weekend, synthetic: true, source: "demo-seed",
  };
  return { order: `${String(startEpoch).padStart(12, "0")}|${v.vehicleId}|${build}|${String(slot).padStart(2, "0")}`, record };
}

/** Plans all 40 drive sessions, sorted by start time and numbered DS-0001…DS-0040. */
export function planSessions(seedRng: Rng, anchorDay: number): DriveSessionRecord[] {
  const drafts: SlotDraft[] = [];
  for (const v of VEHICLES) {
    const forced = FORCED[v.vehicleId];
    for (const build of BUILDS) {
      const n = v.sessions[build];
      const nWeekend = build === "4.12.0" ? v.weekendSessions : 0;
      for (let slot = 0; slot < n; slot++) {
        const weekendIndex = slot - (n - nWeekend);
        const weekend = weekendIndex >= 0;
        const f = weekend ? forced?.weekend[weekendIndex] : forced?.weekday[build][slot];
        drafts.push(drawSlot(seedRng, anchorDay, v, build, slot, f, weekend));
      }
    }
  }
  drafts.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  return drafts.map((d, i) => ({ sessionId: `DS-${String(i + 1).padStart(4, "0")}`, ...d.record }));
}
