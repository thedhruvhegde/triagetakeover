/**
 * Shared result and error types (ARCHITECTURE §5: "All functions are total. They return
 * `Result<T, EngineError[]>` and never throw on bad input").
 */

/** Error codes the spec names explicitly. Any other code must still start with `E_`. */
export type KnownErrorCode =
  | "E_SCHEMA_INVALID"
  | "E_SCHEMA_VERSION"
  | "E_SERIALIZE"
  | "E_PROPERTY_TOO_LARGE"
  | "E_TIME_NONMONOTONIC_GAP"
  | "E_NO_TAKEOVER";

/** An engine error code. Known codes are listed; modules may add their own `E_*` codes. */
export type EngineErrorCode = KnownErrorCode | `E_${string}`;

/** A single structured error. `path` is a JSON-pointer-like path such as `sig.features.F3`. */
export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
  /** Dotted path into the validated value (`""` is the root; array items are `[i]`). */
  readonly path?: string;
  /** 1-based row number for CSV errors. */
  readonly row?: number;
  /** Column header for CSV errors. */
  readonly column?: string;
}

/** Success or failure. Narrow with `r.ok`. */
export type Result<T, E = readonly EngineError[]> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Wraps a success value. */
export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

/** Wraps a failure value. */
export function err<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}
