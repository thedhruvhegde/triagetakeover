/**
 * Real QueuePort over `@forge/events` `Queue` (ARCHITECTURE §8).
 *
 * - `tt-recluster`: concurrency key = projectKey, limit 1 (serialises index writes per project).
 * - `tt-seed`: concurrency key = jobId, limit 1.
 * Limits are checked before pushing (100 KB payload VERIFIED, delay 0..900 s), mirroring the
 * in-memory fake. SPIKE-M1: the `concurrency` push option (key + limit) is taken from the
 * `@forge/events` 3.x types and is unverified on a deployed app.
 */
import {
  InternalServerError,
  InvalidPushSettingsError,
  InvalidQueueNameError,
  InvocationLimitReachedError,
  PayloadTooBigError,
  Queue,
  RateLimitError,
  TooManyEventsError,
} from "@forge/events";
import { utf8ByteLength } from "@tt/engine";
import { QUEUE_MAX_DELAY_SECONDS, QUEUE_NAMES, QUEUE_PAYLOAD_MAX_BYTES, type PushOptions, type QueueName, type QueuePort, type ReclusterJob, type SeedJob } from "../../ports/queue";
import { ok, portErr, type PortErrorKind, type PortResult } from "../../ports/result";

/** The part of `Queue` this adapter uses. */
export interface QueueClient {
  push(event: { body: Record<string, unknown>; delayInSeconds?: number; concurrency?: { key: string; limit: number } }): Promise<{ jobId: string }>;
}

export type QueueFactory = (name: QueueName) => QueueClient;

export const defaultQueueFactory: QueueFactory = (name) => new Queue({ key: name });

/** Concurrency keys: keep to a conservative charset (SPIKE-M1: platform rules unverified). */
export function concurrencyKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

export function classifyQueueError(e: unknown): { readonly kind: PortErrorKind; readonly message: string } {
  const message = e instanceof Error ? e.message.slice(0, 300) : "queue push failed";
  if (e instanceof PayloadTooBigError || e instanceof TooManyEventsError) return { kind: "value-too-large", message };
  if (e instanceof RateLimitError || e instanceof InvocationLimitReachedError) return { kind: "rate-limited", message };
  if (e instanceof InvalidPushSettingsError || e instanceof InvalidQueueNameError) return { kind: "bad-request", message };
  if (e instanceof InternalServerError) return { kind: "unavailable", message };
  return { kind: "unknown", message };
}

export class ForgeQueue implements QueuePort {
  private readonly queues = new Map<QueueName, QueueClient>();

  constructor(private readonly factory: QueueFactory = defaultQueueFactory) {}

  pushRecluster(job: ReclusterJob, opts: PushOptions = {}): Promise<PortResult<{ readonly jobId: string }>> {
    return this.push(QUEUE_NAMES.recluster, { ...job }, job.projectKey, opts);
  }

  pushSeed(job: SeedJob, opts: PushOptions = {}): Promise<PortResult<{ readonly jobId: string }>> {
    return this.push(QUEUE_NAMES.seed, { ...job }, job.jobId, opts);
  }

  private queue(name: QueueName): QueueClient {
    let q = this.queues.get(name);
    if (q === undefined) {
      q = this.factory(name);
      this.queues.set(name, q);
    }
    return q;
  }

  private async push(name: QueueName, body: Record<string, unknown>, key: string, opts: PushOptions): Promise<PortResult<{ readonly jobId: string }>> {
    const delay = opts.delaySeconds ?? 0;
    if (!Number.isInteger(delay) || delay < 0 || delay > QUEUE_MAX_DELAY_SECONDS) return portErr("bad-request", `delaySeconds must be 0-${QUEUE_MAX_DELAY_SECONDS}`, { op: "queue.push" });
    if (utf8ByteLength(JSON.stringify(body)) > QUEUE_PAYLOAD_MAX_BYTES) return portErr("value-too-large", `payload exceeds ${QUEUE_PAYLOAD_MAX_BYTES} bytes`, { op: "queue.push" });
    try {
      const res = await this.queue(name).push({
        body,
        ...(delay > 0 ? { delayInSeconds: delay } : {}),
        concurrency: { key: concurrencyKey(key), limit: 1 },
      });
      return ok({ jobId: res.jobId });
    } catch (e) {
      const c = classifyQueueError(e);
      return portErr(c.kind, c.message, { op: "queue.push", ...(c.kind === "rate-limited" ? { retryAfterSeconds: 30 } : {}) });
    }
  }
}
