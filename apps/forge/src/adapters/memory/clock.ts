/** Deterministic clock and id source for tests. */
import type { Clock, IdSource } from "../../ports/clock";

/** Default fake "now": Monday of the demo week, 09:00 UTC. */
export const FAKE_CLOCK_START = "2026-11-16T09:00:00.000Z";

export class FakeClock implements Clock {
  private ms: number;

  constructor(startIso: string = FAKE_CLOCK_START) {
    const t = Date.parse(startIso);
    if (!Number.isFinite(t)) throw new RangeError(`invalid start time ${startIso}`);
    this.ms = t;
  }

  nowIso(): string {
    return new Date(this.ms).toISOString();
  }

  nowMs(): number {
    return this.ms;
  }

  /** Moves time forward (negative values are rejected: time never goes back). */
  advance(opts: { readonly ms?: number; readonly seconds?: number; readonly minutes?: number; readonly hours?: number; readonly days?: number }): void {
    const delta = (opts.ms ?? 0) + (opts.seconds ?? 0) * 1e3 + (opts.minutes ?? 0) * 6e4 + (opts.hours ?? 0) * 3.6e6 + (opts.days ?? 0) * 8.64e7;
    if (delta < 0) throw new RangeError("FakeClock cannot go backwards");
    this.ms += delta;
  }

  /** Jumps to an absolute time (may not go backwards). */
  set(iso: string): void {
    const t = Date.parse(iso);
    if (!Number.isFinite(t) || t < this.ms) throw new RangeError(`cannot set FakeClock to ${iso}`);
    this.ms = t;
  }
}

/** `prefix-1`, `prefix-2`, … per prefix. */
export class SequentialIds implements IdSource {
  private readonly counters = new Map<string, number>();

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${n}`;
  }
}
