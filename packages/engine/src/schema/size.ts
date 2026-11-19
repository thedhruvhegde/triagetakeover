/**
 * Serialized-size checks for Jira entity properties (ARCHITECTURE §6.1, §7.2):
 * 32,768 bytes per property value (VERIFIED), with a 12 KB target for `tt.event`.
 */
import { err, ok, type Result } from "./result.js";

/** Hard Jira limit per entity property value, in bytes. */
export const PROPERTY_LIMIT_BYTES = 32_768;
/** Design target for `tt.event` and `tt.thumbs` (12 KB). */
export const TT_EVENT_TARGET_BYTES = 12 * 1024;
export const TT_THUMBS_TARGET_BYTES = 12 * 1024;
export const TT_TRIAGE_TARGET_BYTES = 3 * 1024;
export const TT_CLUSTER_TARGET_BYTES = 2 * 1024;
export const TT_SCENARIO_TARGET_BYTES = 1024;

/**
 * UTF-8 byte length of a JS string without TextEncoder. A lone surrogate counts as 3
 * bytes (it is encoded as U+FFFD by a UTF-8 encoder).
 */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** Size report for a serialized property value. */
export interface SizeReport {
  readonly bytes: number;
  readonly limit: number;
  /** `limit − bytes`; negative when over. */
  readonly headroom: number;
}

/**
 * UTF-8 size of `JSON.stringify(value)`, i.e. what is sent as the property body.
 * Fails with `E_SERIALIZE` for values JSON cannot represent (undefined, functions,
 * BigInt, cycles).
 */
export function serializedSize(value: unknown): Result<number> {
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch (e) {
    return err([{ code: "E_SERIALIZE", message: e instanceof Error ? e.message : "not serializable", path: "" }]);
  }
  if (json === undefined) return err([{ code: "E_SERIALIZE", message: "value is not JSON-serializable", path: "" }]);
  return ok(utf8ByteLength(json));
}

/**
 * Checks a value fits under `limit` bytes when serialized (default: the 32,768-byte
 * Jira limit). Over the limit gives `E_PROPERTY_TOO_LARGE`.
 */
export function checkPropertySize(value: unknown, limit: number = PROPERTY_LIMIT_BYTES): Result<SizeReport> {
  const size = serializedSize(value);
  if (!size.ok) return size;
  const report: SizeReport = { bytes: size.value, limit, headroom: limit - size.value };
  if (size.value > limit) {
    return err([{ code: "E_PROPERTY_TOO_LARGE", message: `serialized size ${size.value} B exceeds ${limit} B`, path: "" }]);
  }
  return ok(report);
}
