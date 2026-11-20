/**
 * Mapping coverage helpers. Kept apart from `pipeline.ts` so the main bundle can use them
 * without pulling in the engine's CSV/JPEG processing (that loads in the worker, or lazily).
 */
import { CANONICAL_CHANNELS, CHANNEL_SPECS, TYPE_DECIDING_CHANNELS, type CanonicalChannel, type MappingPreset } from "@tt/engine";

export interface MappingCoverage {
  /** Required channels (only `t`) the mapping does not cover. */
  readonly missingRequired: readonly CanonicalChannel[];
  /** True when at least one of lane_offset / ttc / brake is mapped (else the type is `unknown`). */
  readonly typeDeciding: boolean;
  /** Number of mapped signal channels (excluding `t` and `takeover_time`). */
  readonly mappedSignals: number;
}

/** What a mapping covers; drives whether the mapping step is shown. */
export function mappingStatus(preset: MappingPreset): MappingCoverage {
  const missingRequired = CANONICAL_CHANNELS.filter((c) => CHANNEL_SPECS[c].required && preset.columns[c] === undefined);
  const typeDeciding = TYPE_DECIDING_CHANNELS.some((c) => preset.columns[c] !== undefined);
  const mappedSignals = CANONICAL_CHANNELS.filter((c) => c !== "t" && c !== "takeover_time" && preset.columns[c] !== undefined).length;
  return { missingRequired, typeDeciding, mappedSignals };
}

/** The mapping step opens when the headers are not recognised well enough to proceed blindly. */
export function needsMappingStep(i: MappingCoverage): boolean {
  return i.missingRequired.length > 0 || !i.typeDeciding || i.mappedSignals < 2;
}

/** Does a saved preset fit these headers (every mapped column exists)? */
export function presetFits(preset: MappingPreset, headers: readonly string[]): boolean {
  const cols = Object.values(preset.columns).filter((c): c is string => typeof c === "string");
  return cols.length > 0 && cols.every((c) => headers.includes(c));
}

