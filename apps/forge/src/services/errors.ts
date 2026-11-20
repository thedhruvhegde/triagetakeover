/**
 * Service results. Services return `Result<T, ServiceError>` (engine Result shape) plus
 * non-fatal warnings; they never throw for expected failures (§15). The resolver maps a
 * {@link ServiceError} onto the contract's {@link ApiError} 1:1.
 */
import { err, ok, type EngineError, type Result } from "@tt/engine";
import type { ApiErrorCode, ApiErrorDetail } from "../contract/ui-api";
import { isForbiddenOrNotFound, isRetryable, type PortError } from "../ports/result";

export interface ServiceError {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: readonly ApiErrorDetail[];
}

/** A value plus warnings that the UI shows as banners. */
export interface Outcome<T> {
  readonly value: T;
  readonly warnings: readonly string[];
}

export type ServiceResult<T> = Result<Outcome<T>, ServiceError>;

export { ok, err };

export function done<T>(value: T, warnings: readonly string[] = []): { readonly ok: true; readonly value: Outcome<T> } {
  return ok({ value, warnings });
}

export function fail(code: ApiErrorCode, message: string, details?: readonly ApiErrorDetail[]): { readonly ok: false; readonly error: ServiceError } {
  const retryable = code === "rate-limited" || code === "unavailable";
  return err({ code, message, retryable, ...(details !== undefined && details.length > 0 ? { details } : {}) });
}

/** The one message used for 403/404/401 on user reads: says nothing about existence (§10.3). */
export const FORBIDDEN_OR_NOT_FOUND_MESSAGE = "You don't have access to this project or issue, or it does not exist.";

/** Maps a port failure to a service error. `what` names the operation for the message. */
export function fromPortError(e: PortError, what: string): { readonly ok: false; readonly error: ServiceError } {
  if (isForbiddenOrNotFound(e)) return fail("forbidden-or-not-found", FORBIDDEN_OR_NOT_FOUND_MESSAGE);
  if (e.kind === "property-too-large") return fail("property-too-large", "Signal data could not be stored: the property is larger than Jira's 32,768-byte limit.");
  if (e.kind === "rate-limited") return fail("rate-limited", `Jira is rate limiting requests (${what}). Try again shortly.`);
  if (isRetryable(e)) return fail("unavailable", `${what} failed: the service is unavailable or timed out. Try again.`);
  if (e.kind === "bad-request") return fail("invalid-input", `${what} was rejected by Jira: ${e.message}`);
  if (e.kind === "conflict") return fail("conflict", `${what} conflicted with a concurrent change. Reload and retry.`);
  return fail("error", `${what} failed: ${e.message}`);
}

/** Engine validation errors → contract details. */
export function detailsOf(errors: readonly EngineError[], root?: string): ApiErrorDetail[] {
  return errors.slice(0, 20).map((e) => {
    const path = e.path === undefined || e.path === "" ? root : root === undefined ? e.path : `${root}.${e.path}`;
    return path === undefined ? { message: e.message } : { path, message: e.message };
  });
}

/** Unwraps a successful ServiceResult or returns the failure unchanged (for chaining). */
export function isFailure<T>(r: ServiceResult<T>): r is { readonly ok: false; readonly error: ServiceError } {
  return !r.ok;
}
