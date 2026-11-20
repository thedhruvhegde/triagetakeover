/**
 * In-memory queues. Records pushes with the concurrency key the real adapter would set
 * (§8: projectKey for tt-recluster, jobId for tt-seed) and enforces the 100 KB payload and
 * 0..900 s delay limits. Tests pull jobs with `take()` and run consumers by hand.
 */
import { utf8ByteLength } from "@tt/engine";
import { ok, portErr, type PortError, type PortErrorKind, type PortResult } from "../../ports/result";
import {
  QUEUE_MAX_DELAY_SECONDS,
  QUEUE_NAMES,
  QUEUE_PAYLOAD_MAX_BYTES,
  type PushOptions,
  type QueueName,
  type QueuePort,
  type ReclusterJob,
  type SeedJob,
} from "../../ports/queue";

export interface QueuedJob {
  readonly queue: QueueName;
  readonly jobId: string;
  readonly body: ReclusterJob | SeedJob;
  readonly concurrencyKey: string;
  readonly delaySeconds: number;
}

export class MemoryQueue implements QueuePort {
  /** Every successful push, in order (never cleared by `take`). */
  readonly pushed: QueuedJob[] = [];
  private pending: QueuedJob[] = [];
  private seq = 0;
  private readonly faults: PortError[] = [];

  /** Makes the next `times` pushes fail. */
  failNext(error: PortErrorKind | PortError, times = 1): void {
    const e: PortError = typeof error === "string" ? { kind: error, message: `injected ${error}`, op: "queue.push" } : error;
    for (let i = 0; i < times; i++) this.faults.push(e);
  }

  pushRecluster(job: ReclusterJob, opts: PushOptions = {}): Promise<PortResult<{ readonly jobId: string }>> {
    return this.push(QUEUE_NAMES.recluster, job, job.projectKey, opts);
  }

  pushSeed(job: SeedJob, opts: PushOptions = {}): Promise<PortResult<{ readonly jobId: string }>> {
    return this.push(QUEUE_NAMES.seed, job, job.jobId, opts);
  }

  /** Removes and returns the pending jobs of a queue (all queues when omitted), in push order. */
  take(queue?: QueueName): QueuedJob[] {
    const out = this.pending.filter((j) => queue === undefined || j.queue === queue);
    this.pending = this.pending.filter((j) => !(queue === undefined || j.queue === queue));
    return out;
  }

  /** Pending (not yet taken) jobs. */
  peek(queue?: QueueName): readonly QueuedJob[] {
    return this.pending.filter((j) => queue === undefined || j.queue === queue);
  }

  private async push(queue: QueueName, body: ReclusterJob | SeedJob, concurrencyKey: string, opts: PushOptions): Promise<PortResult<{ readonly jobId: string }>> {
    await Promise.resolve();
    const fault = this.faults.shift();
    if (fault !== undefined) return { ok: false, error: fault };
    const delaySeconds = opts.delaySeconds ?? 0;
    if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > QUEUE_MAX_DELAY_SECONDS) {
      return portErr("bad-request", `delaySeconds must be 0-${QUEUE_MAX_DELAY_SECONDS}`, { op: "queue.push" });
    }
    const json = JSON.stringify(body);
    if (utf8ByteLength(json) > QUEUE_PAYLOAD_MAX_BYTES) return portErr("value-too-large", `payload exceeds ${QUEUE_PAYLOAD_MAX_BYTES} bytes`, { op: "queue.push" });
    const job: QueuedJob = { queue, jobId: `${queue}-job-${++this.seq}`, body: JSON.parse(json) as ReclusterJob | SeedJob, concurrencyKey, delaySeconds };
    this.pushed.push(job);
    this.pending.push(job);
    return ok({ jobId: job.jobId });
  }
}
