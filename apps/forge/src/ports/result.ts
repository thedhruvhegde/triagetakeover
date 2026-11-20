/**
 * Error and result types shared by every port (ARCHITECTURE §4 "ports", §15 failure modes).
 *
 * Ports never throw for expected platform failures (404, 403, 429, size limits, invalid
 * JQL). They return the engine's `Result` shape with a {@link PortError}, so services can map
 * failures to user-facing states (`forbidden-or-not-found`, "waiting (rate limit)", ...)
 * without try/catch. Programming errors (bugs) may still throw.
 */
import { err, ok, type Result } from "@tt/engine";

export { ok, err };

/**
 * Failure classes. Adapters map HTTP status / platform errors onto these:
 * - `not-found` 404 (Jira also answers 404 for issues the user may not see)
 * - `forbidden` 403
 * - `unauthorized` 401, or asUser consent not granted yet (SPIKE-A1)
 * - `bad-request` 400 other than the cases below (e.g. invalid JQL, unknown issue type)
 * - `property-too-large` entity property value over 32,768 bytes (VERIFIED limit)
 * - `value-too-large` storage value, queue payload or other size limit exceeded
 * - `conflict` 409 or a `FAIL_IF_EXISTS` key policy hit
 * - `rate-limited` 429 (`retryAfterSeconds` when the platform said so)
 * - `timeout` the adapter's own deadline (e.g. TWG 4 s)
 * - `unavailable` 5xx / platform outage
 * - `not-permitted` TWG "User is not permitted to query this organization"
 * - `invalid-response` the remote answered but the body failed validation
 * - `unknown` anything else
 */
export type PortErrorKind =
  | "not-found"
  | "forbidden"
  | "unauthorized"
  | "bad-request"
  | "property-too-large"
  | "value-too-large"
  | "conflict"
  | "rate-limited"
  | "timeout"
  | "unavailable"
  | "not-permitted"
  | "invalid-response"
  | "unknown";

export interface PortError {
  readonly kind: PortErrorKind;
  /** Developer-facing message. Never shown verbatim to end users for 403/404 (no leaks, §10.3). */
  readonly message: string;
  /** HTTP status when the failure came from an HTTP call. */
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  /** Which port operation failed, e.g. `jira.getIssue`. */
  readonly op?: string;
}

/** Result of a port call. */
export type PortResult<T> = Result<T, PortError>;

/** Builds a failed {@link PortResult}. */
export function portErr(kind: PortErrorKind, message: string, extra: Omit<PortError, "kind" | "message"> = {}): { readonly ok: false; readonly error: PortError } {
  return err({ kind, message, ...extra });
}

/**
 * True for errors that must be reported to the caller as `FORBIDDEN_OR_NOT_FOUND` without
 * saying which (§10.3: an asUser 404 or 403 leaks nothing).
 */
export function isForbiddenOrNotFound(e: PortError): boolean {
  return e.kind === "not-found" || e.kind === "forbidden" || e.kind === "unauthorized";
}

/** True for transient errors worth retrying with back-off (queue `delayInSeconds`, §15 #15). */
export function isRetryable(e: PortError): boolean {
  return e.kind === "rate-limited" || e.kind === "timeout" || e.kind === "unavailable";
}

/** Maps an HTTP status to a {@link PortErrorKind} (shared by the real adapters). */
export function kindForStatus(status: number): PortErrorKind {
  if (status === 400) return "bad-request";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 413) return "value-too-large";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "unavailable";
  return "unknown";
}
