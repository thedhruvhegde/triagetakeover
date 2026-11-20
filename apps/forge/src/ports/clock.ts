/**
 * Time and id sources. Services never call `Date` or `crypto` directly, so tests are
 * deterministic (FakeClock, sequential ids).
 */

export interface Clock {
  /** Current time as an ISO-8601 UTC string with milliseconds, e.g. `2026-11-20T09:00:00.000Z`. */
  nowIso(): string;
  /** Current time in epoch milliseconds. */
  nowMs(): number;
}

/** Opaque id generator (job ids, Undo tokens). */
export interface IdSource {
  /** A new unique id, prefixed, e.g. `seed-…`. Only `[A-Za-z0-9_-]` characters. */
  next(prefix: string): string;
}

/** Epoch seconds of a clock (entity attributes such as `indexedAt` are epoch seconds, §7.3). */
export function nowEpochSeconds(clock: Clock): number {
  return Math.floor(clock.nowMs() / 1000);
}
