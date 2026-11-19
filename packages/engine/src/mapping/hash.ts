/**
 * Mapping preset hash (`mapping.hash`, ARCHITECTURE §5.1 / §6.1).
 */
import type { MappingPreset } from "../schema/index.js";
import { encodeUtf8 } from "../csv/utf8.js";
import { sha256Hex } from "./sha256.js";

/**
 * Canonical JSON: object keys sorted, `undefined` members dropped, no whitespace.
 * Numbers use JavaScript's shortest round-trip formatting.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).filter((k) => rec[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(",")}}`;
}

/** `"sha256:" + hex` of the preset's canonical JSON. Key order does not matter. */
export function presetHash(preset: MappingPreset): string {
  const normalised = {
    columns: preset.columns,
    multipliers: preset.multipliers,
    invert: preset.invert,
    brakeUnit: preset.brakeUnit,
  };
  return `sha256:${sha256Hex(encodeUtf8(canonicalJson(normalised)))}`;
}
