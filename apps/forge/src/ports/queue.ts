/**
 * QueuePort: async jobs for the two consumers (ARCHITECTURE §8).
 *
 * - `tt-recluster`: concurrency key = projectKey, limit 1 (serialises index writes).
 * - `tt-seed`: concurrency key = jobId, limit 1.
 * Payloads are at most 100 KB (VERIFIED). The adapter sets the concurrency options; callers
 * only choose the job and an optional delay (429 back-off, §15 #15).
 */
import type { PortResult } from "./result";

export const QUEUE_NAMES = { recluster: "tt-recluster", seed: "tt-seed" } as const;
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Max queue payload (JSON bytes). */
export const QUEUE_PAYLOAD_MAX_BYTES = 100 * 1024;
/** Forge `delayInSeconds` upper bound. */
export const QUEUE_MAX_DELAY_SECONDS = 900;

export const RECLUSTER_REASONS = ["intake", "accept", "split", "undo", "panel-lazy", "resync", "seed"] as const;
export type ReclusterReason = (typeof RECLUSTER_REASONS)[number];

export interface ReclusterJob {
  readonly projectKey: string;
  /** `"<type>|<variant>"`; absent = every bucket of the project (always absent for `resync`). */
  readonly bucket?: string;
  readonly reason: ReclusterReason;
  /** ISO-8601. */
  readonly requestedAt: string;
  /** accountId of the human who caused it (Re-sync dedupe display); never used for auth. */
  readonly requestedBy?: string;
}

export interface SeedJob {
  readonly jobId: string;
  /** Step name or index of the seed chain (SEED_DATA §15.1 S2..S10). */
  readonly step: string;
  /** Step-local resume cursor (e.g. next event index). */
  readonly cursor: number;
  readonly seed: number;
}

export interface PushOptions {
  /** 0..900 seconds. */
  readonly delaySeconds?: number;
}

export interface QueuePort {
  pushRecluster(job: ReclusterJob, opts?: PushOptions): Promise<PortResult<{ readonly jobId: string }>>;
  pushSeed(job: SeedJob, opts?: PushOptions): Promise<PortResult<{ readonly jobId: string }>>;
}
