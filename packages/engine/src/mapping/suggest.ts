/**
 * Header synonym mapping with suggested unit multipliers (ARCHITECTURE §5.1).
 */
import { matchHeader, normalizeHeader, type CanonicalChannel, type MappingPreset } from "../schema/index.js";

/**
 * Multipliers implied by a unit-carrying synonym (SEED_DATA §8.4: `speed_kph` → 1/3.6,
 * `time_ms` → ×0.001). Keys are normalised headers.
 */
export const SYNONYM_MULTIPLIERS: Readonly<Record<string, number>> = {
  [normalizeHeader("time_ms")]: 0.001,
  [normalizeHeader("speed_kph")]: 1 / 3.6,
  [normalizeHeader("yaw_rate_deg")]: Math.PI / 180,
  [normalizeHeader("offset_cm")]: 0.01,
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Suggests a mapping preset for a header row. The first header matching a channel wins;
 * later duplicates are ignored. Unit-carrying synonyms get their multiplier, `ad_active`
 * gets `invert.takeover = true`, and `brakeUnit` defaults to `"ratio"`.
 */
export function suggestMapping(headers: readonly string[]): MappingPreset {
  const columns: Mutable<MappingPreset["columns"]> = {};
  const multipliers: Mutable<MappingPreset["multipliers"]> = {};
  const invert: Mutable<MappingPreset["invert"]> = {};
  for (const header of headers) {
    const m = matchHeader(header);
    if (m === null || columns[m.channel] !== undefined) continue;
    const ch: CanonicalChannel = m.channel;
    columns[ch] = header;
    const mult = SYNONYM_MULTIPLIERS[normalizeHeader(header)];
    if (mult !== undefined) multipliers[ch] = mult;
    if (m.inverted) invert[ch] = true;
  }
  return { columns, multipliers, invert, brakeUnit: "ratio" };
}
