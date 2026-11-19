/**
 * Takeover events (SEED_DATA §7): Poisson counts per (cluster, build) against generated km,
 * km-weighted session assignment, the 7 planted events, the SM-3 note, frame counts and quirks.
 * Every draw comes from a stream labelled by the event's stable key, not its rank.
 */
import type { Rng } from "../rng/index.js";
import { fmix32, hashLabel } from "../rng/index.js";
import { BUILDS, CLUSTERS, FRAME_COUNT_PROBS, type ClusterPlan } from "../plan/profile.js";
import {
  drawNote, EVENT_LABELS, eventDescription, eventSummary, NOTE_BRAKED_HARD, NOTE_DRIFTED_LEFT, NOTE_STEERING_LIGHT,
} from "../text/index.js";
import type {
  Build, DriveSessionRecord, EventSpec, FrameCondition, LatentId, QuirkId, RoleId, Variant, VehicleRecord,
} from "../types.js";
import { formatIsoDateTime } from "../util/dates.js";

/** An event before ids, frames and text are attached. */
interface RawEvent {
  readonly key: string;
  readonly archetype: LatentId;
  readonly session: DriveSessionRecord;
  readonly occurredEpoch: number;
  readonly roles: readonly RoleId[];
}

/** True when a session satisfies a cluster's conditions (§7.1). */
export function isEligible(c: ClusterPlan, s: DriveSessionRecord): boolean {
  return s.variant === c.variant && c.routes.includes(s.route) && c.light.includes(s.light) && (!c.dryOnly || s.weather === "dry");
}

/** Sum of km per variant and build (the onset test's exposure). */
export function exposureKm(sessions: readonly DriveSessionRecord[], variant: Variant, build: Build): number {
  let km = 0;
  for (const s of sessions) if (s.variant === variant && s.build === build) km += s.km;
  return km;
}

function occurredIn(rng: Rng, s: DriveSessionRecord): number {
  return s.startEpoch + Math.floor(rng.range(0.1, 0.9) * s.durationMin * 60);
}

function pickByKm(rng: Rng, sessions: readonly DriveSessionRecord[]): DriveSessionRecord | undefined {
  if (sessions.length === 0) return undefined;
  return sessions[rng.weightedIndex(sessions.map((s) => s.km))];
}

/** Poisson-sampled events for every cluster and build. */
export function samplePoissonEvents(root: Rng, sessions: readonly DriveSessionRecord[]): RawEvent[] {
  const out: RawEvent[] = [];
  for (const c of CLUSTERS) {
    for (const build of BUILDS) {
      const lambda = (c.rates[build] * exposureKm(sessions, c.variant, build)) / 1000;
      const n = root.fork(`count:${c.id}:${c.variant}:${build}`).poisson(lambda);
      const eligible = sessions.filter((s) => s.build === build && isEligible(c, s));
      for (let k = 0; k < n; k++) {
        const rng = root.fork(`assign:${c.id}:${build}:${k}`);
        const session = pickByKm(rng, eligible);
        if (session === undefined) continue;
        out.push({ key: `poisson:${c.id}:${build}:${k}`, archetype: c.id, session, occurredEpoch: occurredIn(rng, session), roles: [] });
      }
    }
  }
  return out;
}

interface PlantedPlan {
  readonly role: RoleId;
  readonly archetype: LatentId;
  readonly fits: (s: DriveSessionRecord) => boolean;
}

const clusterById = (id: LatentId): ClusterPlan | undefined => CLUSTERS.find((c) => c.id === id);
const fitsCluster = (id: LatentId) => (s: DriveSessionRecord): boolean => {
  const c = clusterById(id);
  return c !== undefined && isEligible(c, s);
};

/** The 7 planted roles (§7.2). All sit on final-weekend sessions, so they are in the Monday batch. */
export const PLANTED: readonly PlantedPlan[] = [
  { role: "P1a", archetype: "LC-A", fits: fitsCluster("LC-A") },
  { role: "P1b", archetype: "LC-C", fits: fitsCluster("LC-C") },
  { role: "P3a", archetype: "LC-B", fits: fitsCluster("LC-B") },
  { role: "P3b", archetype: "LC-D", fits: fitsCluster("LC-D") },
  { role: "N1", archetype: "NOVEL-1", fits: (s) => s.variant === "cam-B" && s.light === "day" && s.weather === "dry" },
  { role: "AMB1", archetype: "LC-A", fits: fitsCluster("LC-A") },
  { role: "AMB2", archetype: "LC-B", fits: fitsCluster("LC-B") },
];

/** Planted events on eligible weekend sessions; a role with no eligible session is skipped. */
export function plantEvents(root: Rng, sessions: readonly DriveSessionRecord[]): RawEvent[] {
  const out: RawEvent[] = [];
  for (const p of PLANTED) {
    const rng = root.fork(`planted:${p.role}`);
    const session = pickByKm(rng, sessions.filter((s) => s.weekend && p.fits(s)));
    if (session === undefined) continue;
    out.push({ key: `planted:${p.role}`, archetype: p.archetype, session, occurredEpoch: occurredIn(rng, session), roles: [p.role] });
  }
  return out;
}

/** Orders events by occurredAt, then by the hash of their key (§4.5). */
export function sortEvents<T extends { readonly key: string; readonly occurredEpoch: number }>(seed: number, events: readonly T[]): T[] {
  const tie = (e: T): number => fmix32(hashLabel(seed, e.key));
  return [...events].sort((a, b) => a.occurredEpoch - b.occurredEpoch || tie(a) - tie(b) || (a.key < b.key ? -1 : 1));
}

/** Frame times relative to the takeover for 1..4 frames (§7.4). */
export function frameTimesFor(count: number): number[] {
  const out: number[] = [];
  for (let k = count - 1; k >= 0; k--) out.push(k === 0 ? 0 : -k);
  return out;
}

/** Draws 1–4 frames per event, then forces at least one 1-frame and one 4-frame event. */
export function drawFrameCounts(root: Rng, keys: readonly string[]): number[] {
  const counts = keys.map((k) => 1 + root.fork(`event:${k}:frames:count`).weightedIndex(FRAME_COUNT_PROBS));
  if (counts.length >= 2 && !counts.includes(1)) {
    const i = counts.findIndex((c) => c !== 4);
    if (i >= 0) counts[i] = 1;
  }
  if (counts.length >= 2 && !counts.includes(4)) {
    let i = counts.length - 1;
    while (i >= 0 && counts[i] === 1) i--;
    if (i >= 0) counts[i] = 4;
  }
  return counts;
}

/** Rendering condition of an event's frames (§9.2, §9.4). */
export function frameConditionFor(archetype: LatentId, roles: readonly RoleId[], s: DriveSessionRecord): FrameCondition {
  if (s.light === "night") return s.weather === "rain" ? "night-rain" : "night";
  if (s.weather === "rain") return "rain";
  if (archetype === "NOVEL-1") return "overcast";
  if (s.light === "low-sun") {
    if (s.variant === "cam-A") return "low-sun-decoy";
    return roles.includes("AMB1") ? "low-sun-boundary" : "low-sun";
  }
  return "day";
}

interface QuirkRule {
  readonly id: QuirkId;
  readonly eligible: (e: { readonly archetype: LatentId; readonly monday: boolean }) => boolean;
}

/**
 * Quirk eligibility (§8.4), most constrained first so each quirk finds an event.
 * Deviation: Q5 is LC-A only, because LC-D has no torque or pedal signal the takeover
 * heuristic could find (§5.2 step 3), so a flagless LC-D file would be E_NO_TAKEOVER.
 */
export const QUIRK_RULES: readonly QuirkRule[] = [
  { id: "Q6", eligible: (e) => e.archetype === "LC-A" && e.monday },
  { id: "Q5", eligible: (e) => e.archetype === "LC-A" },
  ...(["Q1", "Q2", "Q3", "Q4", "Q7", "Q8", "Q9"] as const).map((id) => ({ id, eligible: () => true })),
];

/** Assigns each quirk to exactly one non-planted event without a quirk; returns the unassigned ids. */
export function assignQuirks(
  root: Rng,
  events: readonly { readonly key: string; readonly archetype: LatentId; readonly monday: boolean; readonly planted: boolean }[],
): { byKey: Map<string, QuirkId>; unassigned: QuirkId[] } {
  const byKey = new Map<string, QuirkId>();
  const unassigned: QuirkId[] = [];
  for (const rule of QUIRK_RULES) {
    const pool = events.filter((e) => !e.planted && !byKey.has(e.key) && rule.eligible(e));
    if (pool.length === 0) {
      unassigned.push(rule.id);
      continue;
    }
    const chosen = root.fork(`quirk:${rule.id}`).pick(pool);
    byKey.set(chosen.key, rule.id);
  }
  return { byKey, unassigned };
}

const NOTE_BY_ROLE: Partial<Record<RoleId, string>> = {
  P1a: NOTE_DRIFTED_LEFT, P1b: NOTE_DRIFTED_LEFT, P3a: NOTE_BRAKED_HARD, P3b: NOTE_BRAKED_HARD,
};

export interface PlannedEvents {
  readonly events: EventSpec[];
  readonly quirksUnassigned: QuirkId[];
  /** "ok" when the SM-3 partner is historical, "degraded" when Monday, "missing" when no LC-C event exists. */
  readonly sm3: "ok" | "degraded" | "missing";
}

/** Full event plan: sampling, planting, ordering, ids, SM-3 role, frames, notes, quirks, text. */
export function planEvents(root: Rng, sessions: readonly DriveSessionRecord[], vehicles: readonly VehicleRecord[]): PlannedEvents {
  const raw = sortEvents(root.seed, [...samplePoissonEvents(root, sessions), ...plantEvents(root, sessions)]);
  const isPlanted = (e: RawEvent): boolean => e.key.startsWith("planted:");
  const lcc = raw.filter((e) => e.archetype === "LC-C" && !isPlanted(e));
  const historicalLcc = lcc.find((e) => !e.session.weekend);
  const sm3Event = historicalLcc ?? lcc[0];
  const sm3: PlannedEvents["sm3"] = historicalLcc !== undefined ? "ok" : sm3Event !== undefined ? "degraded" : "missing";
  const counts = drawFrameCounts(root, raw.map((e) => e.key));
  const { byKey, unassigned } = assignQuirks(root, raw.map((e) => ({ key: e.key, archetype: e.archetype, monday: e.session.weekend, planted: isPlanted(e) })));
  const events = raw.map((e, i): EventSpec => {
    const eventId = `E-${String(i + 1).padStart(3, "0")}`;
    const roles: RoleId[] = e === sm3Event ? [...e.roles, "SM3"] : [...e.roles];
    const plantedNote = roles.map((r) => (r === "SM3" ? NOTE_STEERING_LIGHT : NOTE_BY_ROLE[r])).find((n) => n !== undefined);
    const note = plantedNote ?? drawNote(root.fork(`event:${e.key}:text`), e.archetype, e.session);
    const vehicle = vehicles.find((v) => v.vehicleId === e.session.vehicleId);
    if (vehicle === undefined) throw new RangeError(`unknown vehicle ${e.session.vehicleId}`);
    const frameCount = counts[i] ?? 1;
    const occurredAt = formatIsoDateTime(e.occurredEpoch);
    const quirk = byKey.get(e.key);
    return {
      eventId, key: e.key, sessionId: e.session.sessionId, vehicleId: e.session.vehicleId, variant: e.session.variant,
      build: e.session.build, occurredAt, occurredEpoch: e.occurredEpoch, odd: e.session.odd, route: e.session.route,
      light: e.session.light, weather: e.session.weather, archetype: e.archetype, planted: isPlanted(e), roles,
      quirks: quirk === undefined ? [] : [quirk], frameCount, frameTimes: frameTimesFor(frameCount),
      frameCondition: frameConditionFor(e.archetype, roles, e.session), note,
      summary: eventSummary(note, vehicle, e.session.build),
      descriptionAdf: eventDescription({ seed: root.seed, eventId, note, vehicle, session: e.session, occurredAt }),
      labels: EVENT_LABELS, monday: e.session.weekend,
    };
  });
  return { events, quirksUnassigned: unassigned, sm3 };
}
