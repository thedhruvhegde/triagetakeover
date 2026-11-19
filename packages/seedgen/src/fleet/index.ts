/**
 * Vehicle registry (SEED_DATA §5.1). No VINs, plates, OEM names or GPS fields.
 */
import { RADAR_CALIBRATION_AGE_DAYS, VEHICLES } from "../plan/profile.js";
import type { VehicleRecord } from "../types.js";
import { formatIsoDate } from "../util/dates.js";

/** Builds the 3 vehicle records for an anchor day number. */
export function buildVehicles(anchorDay: number): VehicleRecord[] {
  return VEHICLES.map((v) => ({
    vehicleId: v.vehicleId,
    label: `SYN test vehicle ${v.vehicleId.slice(2)}`,
    variant: v.variant,
    camera: v.camera,
    rateHz: v.rateHz,
    sensors: ["camera-front", "radar-front", "imu"],
    calibration: {
      "camera-front": formatIsoDate(anchorDay - v.calibrationAgeDays),
      "radar-front": formatIsoDate(anchorDay - RADAR_CALIBRATION_AGE_DAYS),
    },
    routes: v.variant === "cam-A" ? ["highway", "urban"] : ["highway", "rural"],
    synthetic: true,
    source: "demo-seed",
  }));
}
