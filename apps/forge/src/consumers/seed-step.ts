/**
 * `seed-step` function: consumer of the `tt-seed` queue (manifest `tt-seed-consumer`,
 * timeout 600 s, concurrency key = jobId, limit 1). Runs asApp with no TWG (§8).
 *
 * The chain logic is `runSeedStep` (consumers/seed-job.ts). Only a failure of the queue itself
 * asks the platform to redeliver; rate limits re-queue the same step with a delay instead.
 * An unexpected exception (a bug or a crashed dependency) is also handed back to the platform
 * for redelivery: every step is idempotent, so a redelivered message is safe.
 *
 * SPIKE-M1: the consumer handler shape `(event: AsyncEvent)` with `event.body` follows
 * `@forge/events` 3.x types; unverified against a deployed app. SPIKE-S3: consumers creating
 * issues, properties and links asApp in a freshly created project is unverified.
 */
import { InvocationError, InvocationErrorCode, type AsyncEvent } from "@forge/events";
import { createForgePorts } from "../adapters/forge/index";
import { runSeedStep } from "./seed-job";

export async function seedStep(event: AsyncEvent): Promise<InvocationError | undefined> {
  try {
    const outcome = await runSeedStep(createForgePorts({}), event.body);
    if (outcome.kind === "retry") {
      return new InvocationError({ retryAfter: Math.max(1, Math.min(900, outcome.retryAfterSeconds)), retryReason: InvocationErrorCode.FUNCTION_UPSTREAM_RATE_LIMITED });
    }
    if (outcome.kind === "dropped") console.warn("tt-seed message dropped", outcome.reason);
    if (outcome.kind === "failed") console.warn("tt-seed job failed", outcome.step);
    return undefined;
  } catch (e) {
    console.error("tt-seed step crashed; asking for redelivery", e instanceof Error ? e.message : String(e));
    return new InvocationError({ retryAfter: 30, retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST });
  }
}
