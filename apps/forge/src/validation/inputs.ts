/**
 * Validators for untrusted resolver and action input (ARCHITECTURE §10.3 "Validation", §14).
 *
 * Built on the engine's zero-dependency decoders (`str`, `num`, `object`, `run`, ...), so
 * they collect every problem instead of throwing and strip unknown keys.
 */
import { INVALID, parseIsoSeconds, str, num, type Decoder, type EngineError } from "@tt/engine";

/** `^[A-Z][A-Z0-9_]{1,9}-\d{1,9}$` (§10.3). */
export const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,9}-\d{1,9}$/;
/** Jira project keys as the app accepts them. */
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,9}$/;
/** `^[0-9A-Za-z.+_-]{1,40}$` (§10.3). */
export const BUILD_PATTERN = /^[0-9A-Za-z.+_-]{1,40}$/;
/** Strict ISO-8601 date-time with `T` and a zone (`Z` or `±HH:MM`). */
export const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
/** Plain calendar date, read as 00:00 UTC. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Numeric Jira ids (issue id, component id, role id). */
export const JIRA_ID_PATTERN = /^\d{1,18}$/;
/** Engine bucket id `"<type>|<variant>"`. */
export const BUCKET_PATTERN = /^[^|\s]{1,64}\|[^|\s]{1,64}$/;
/** Free-text cluster name cap (§10.3 `create-cluster.name`). */
export const NAME_MAX_LENGTH = 80;

function push(errs: EngineError[], path: string, message: string): typeof INVALID {
  errs.push({ code: "E_SCHEMA_INVALID", message, path });
  return INVALID;
}

/** Issue key; lower-case input is upper-cased first (Jira keys are case-insensitive). */
export const issueKey: Decoder<string> = (u, path, errs) => {
  if (typeof u !== "string") return push(errs, path, "expected an issue key");
  const k = u.trim().toUpperCase();
  return ISSUE_KEY_PATTERN.test(k) ? k : push(errs, path, "not a valid issue key (e.g. TTDEMO-12)");
};

export const projectKey: Decoder<string> = (u, path, errs) => {
  if (typeof u !== "string") return push(errs, path, "expected a project key");
  const k = u.trim().toUpperCase();
  return PROJECT_KEY_PATTERN.test(k) ? k : push(errs, path, "not a valid project key (e.g. TTDEMO)");
};

export const build: Decoder<string> = str({ pattern: BUILD_PATTERN });
export const jiraId: Decoder<string> = str({ pattern: JIRA_ID_PATTERN });
export const bucket: Decoder<string> = str({ pattern: BUCKET_PATTERN });

/**
 * Strict ISO-8601 instant (`2026-11-14T17:00:00Z`, `…+01:00`) or a plain date (`2026-11-14`,
 * read as 00:00 UTC). Calendar validity is checked (no 2026-02-30). Output is normalised to
 * `YYYY-MM-DDTHH:MM:SS(.fff)Z`.
 */
export const isoInstant: Decoder<string> = (u, path, errs) => {
  if (typeof u !== "string") return push(errs, path, "expected an ISO-8601 date-time");
  const s = u.trim();
  const text = ISO_DATE_PATTERN.test(s) ? `${s}T00:00:00Z` : s;
  if (!ISO_DATETIME_PATTERN.test(text)) return push(errs, path, "expected ISO-8601 like 2026-11-14T17:00:00Z");
  const secs = parseIsoSeconds(text);
  if (!Number.isFinite(secs)) return push(errs, path, "not a valid calendar date-time");
  return new Date(Math.round(secs * 1000)).toISOString();
};

/** Removes control characters (incl. bidi controls), collapses whitespace, trims and caps length. */
export function sanitizeText(s: string, maxLength: number): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = s.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  return [...cleaned].slice(0, maxLength).join("").trim();
}

/** Free text (e.g. a cluster name): sanitised; empty after sanitising is an error. */
export function freeText(maxLength: number = NAME_MAX_LENGTH): Decoder<string> {
  return (u, path, errs) => {
    if (typeof u !== "string") return push(errs, path, "expected text");
    const t = sanitizeText(u, maxLength);
    return t === "" ? push(errs, path, "must not be empty") : t;
  };
}

/** uint32 seed for the demo generator. */
export const seed: Decoder<number> = num({ integer: true, min: 0, max: 0xffffffff });

/**
 * An integer clamped into `[min, max]`. Numeric strings are accepted because the exact
 * types Rovo/MCP send for `integer` inputs are not verified (SPIKE-A2).
 */
export function clampedInt(min: number, max: number): Decoder<number> {
  return (u, path, errs) => {
    const n = typeof u === "string" && /^-?\d{1,15}$/.test(u.trim()) ? Number(u.trim()) : u;
    if (typeof n !== "number" || !Number.isInteger(n)) return push(errs, path, "expected an integer");
    return Math.min(max, Math.max(min, n));
  };
}

/** A boolean; `"true"`/`"false"` strings accepted for the same reason (SPIKE-A2). */
export const looseBool: Decoder<boolean> = (u, path, errs) => {
  if (typeof u === "boolean") return u;
  if (u === "true") return true;
  if (u === "false") return false;
  return push(errs, path, "expected true or false");
};
