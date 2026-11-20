/**
 * `recluster` function: consumer of the `tt-recluster` queue (manifest
 * `tt-recluster-consumer`, timeout 900 s). Runs asApp with no TWG (§8).
 *
 * SPIKE-M1: the consumer handler shape `(event: AsyncEvent, context)` with `event.body` follows
 * `@forge/events` 3.x types; unverified against a deployed app.
 */
import { InvocationError, InvocationErrorCode, type AsyncEvent } from "@forge/events";
import { createForgePorts } from "../adapters/forge/index";
import { runReclusterJob } from "./recluster-job";

export async function recluster(event: AsyncEvent): Promise<InvocationError | undefined> {
  try {
    const ports = createForgePorts({});
    const outcome = await runReclusterJob(ports, event.body);
    if (outcome.kind === "retry") {
      return new InvocationError({ retryAfter: Math.max(1, Math.min(900, outcome.retryAfterSeconds)), retryReason: InvocationErrorCode.FUNCTION_UPSTREAM_RATE_LIMITED });
    }
    if (outcome.kind === "dropped") console.warn("tt-recluster job dropped", outcome.reason);
    return undefined;
  } catch (e) {
    // Recluster and resync chunks are recomputed from Jira and the index, so a redelivery is safe.
    console.error("tt-recluster job crashed; asking for redelivery", e instanceof Error ? e.message : String(e));
    return new InvocationError({ retryAfter: 30, retryReason: InvocationErrorCode.FUNCTION_RETRY_REQUEST });
  }
}
