/**
 * Versioning constants (ARCHITECTURE §5 "semantic version stored with every event",
 * §6.1 `v`, §15 row 26 "engine version change").
 */

/** Schema version of the `tt.event` property and its companions. */
export const EVENT_SCHEMA_VERSION = 1;

/** Semantic version of the engine, stored as `tt.event.engine`. */
export const ENGINE_VERSION = "1.0.0";

/** Frozen default parameter set tag (§5.8). */
export const PARAMS_VERSION = "params-v1";

/** Strict `MAJOR.MINOR.PATCH` (optional `-prerelease`), as stored in `engine` and `app`. */
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

/**
 * True when a stored event was computed by a different engine version than this one,
 * meaning features must be recomputed lazily from telemetry (§15 row 26).
 */
export function needsRecompute(storedEngine: string, current: string = ENGINE_VERSION): boolean {
  return storedEngine !== current;
}
