/**
 * Telemetry for one event: archetype parameters → latent trace → raw samples → CSV bytes.
 */
import type { Rng } from "../rng/index.js";
import type { EventSpec, VehicleRecord } from "../types.js";
import { VEHICLES } from "../plan/profile.js";
import { csvFileName, writeTelemetryCsv } from "./csv.js";
import { buildLatent, drawArchetypeParams, sampleRaw, type ArchetypeParams, type RawTelemetry } from "./model.js";

export * from "./model.js";
export * from "./csv.js";

/** Draws parameters and raw samples for an event (exposed for conformance tests). */
export function synthesizeTelemetry(root: Rng, e: EventSpec, vehicle: VehicleRecord): { params: ArchetypeParams; raw: RawTelemetry } {
  const rng = root.fork(`event:${e.key}:telemetry`);
  const params = drawArchetypeParams(rng.fork("params"), e.archetype, e.roles, e.route);
  const latent = buildLatent(rng.fork("latent"), params);
  const jitter = VEHICLES.find((v) => v.vehicleId === vehicle.vehicleId)?.jitter ?? 0;
  return { params, raw: sampleRaw(rng.fork("raw"), latent, vehicle.rateHz, jitter) };
}

/** CSV file for an event. */
export function generateCsv(root: Rng, seed: number, e: EventSpec, vehicle: VehicleRecord): { name: string; bytes: Uint8Array } {
  const { raw } = synthesizeTelemetry(root, e, vehicle);
  const bytes = writeTelemetryCsv({ seed, eventId: e.eventId, raw, quirks: e.quirks, rng: root.fork(`event:${e.key}:quirk`) });
  return { name: csvFileName(e.eventId), bytes };
}
