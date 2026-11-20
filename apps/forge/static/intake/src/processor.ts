/**
 * Runs the intake pipeline in a Web Worker, with the main thread as fallback.
 *
 * SPIKE-C3: Web Workers loaded from the same bundle are assumed to be allowed by the Custom UI
 * CSP (unverified). If the worker cannot be created, errors, or does not answer, the processor
 * switches to the main thread for this and every later call (ARCHITECTURE §15 row 23), yielding
 * to the browser before each heavy step so the progress text can paint.
 */
import type { InspectOutput, ProcessInput, ProcessOutput } from "./pipeline.js";

/** The main-thread fallback loads the engine pipeline lazily (keeps it out of the first load). */
const loadPipeline = (): Promise<typeof import("./pipeline.js")> => import("./pipeline.js");

export type WorkerJob = { readonly op: "inspect"; readonly csv: Uint8Array } | { readonly op: "process"; readonly input: ProcessInput };
export type WorkerRequest = WorkerJob & { readonly id: number };

export type WorkerResponse = { readonly id: number; readonly ok: true; readonly result: InspectOutput | ProcessOutput } | { readonly id: number; readonly ok: false; readonly message: string };

/** The subset of `Worker` the processor uses (so tests can pass a fake). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((ev: ErrorEvent | Event) => void) | null;
  onmessageerror?: ((ev: MessageEvent) => void) | null;
}

export type ProcessorMode = "worker" | "main-thread";

export interface Processor {
  inspect(csv: Uint8Array): Promise<InspectOutput>;
  process(input: ProcessInput): Promise<ProcessOutput>;
  mode(): ProcessorMode;
  dispose(): void;
}

/** Lets the browser paint between heavy synchronous steps on the main thread. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface ProcessorOptions {
  /** Creates the worker; returning null or throwing selects the main thread. */
  readonly createWorker?: () => WorkerLike | null;
  /** A call with no answer after this long is retried on the main thread. */
  readonly timeoutMs?: number;
  /** Called once when the processor falls back to the main thread. */
  readonly onFallback?: (reason: string) => void;
}

export function createProcessor(opts: ProcessorOptions = {}): Processor {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let worker: WorkerLike | null = null;
  let mode: ProcessorMode = "main-thread";
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: WorkerResponse) => void; timer: ReturnType<typeof setTimeout> }>();

  const fallBack = (reason: string): void => {
    if (worker === null && mode === "main-thread") return;
    try {
      worker?.terminate();
    } catch {
      // ignore
    }
    worker = null;
    mode = "main-thread";
    opts.onFallback?.(reason);
    for (const [id, p] of pending) {
      clearTimeout(p.timer);
      p.resolve({ id, ok: false, message: reason });
    }
    pending.clear();
  };

  try {
    worker = opts.createWorker?.() ?? null;
    if (worker !== null) {
      mode = "worker";
      worker.onmessage = (ev) => {
        const p = pending.get(ev.data.id);
        if (p === undefined) return;
        clearTimeout(p.timer);
        pending.delete(ev.data.id);
        p.resolve(ev.data);
      };
      worker.onerror = () => fallBack("the Web Worker failed (SPIKE-C3)");
      worker.onmessageerror = () => fallBack("the Web Worker could not exchange data (SPIKE-C3)");
    }
  } catch {
    worker = null;
    mode = "main-thread";
  }

  const viaWorker = (req: WorkerJob): Promise<WorkerResponse | null> => {
    const w = worker;
    if (w === null) return Promise.resolve(null);
    const id = nextId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        fallBack("the Web Worker did not answer (SPIKE-C3)");
        resolve(null);
      }, timeoutMs);
      pending.set(id, { resolve, timer });
      try {
        w.postMessage({ ...req, id });
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        fallBack("the Web Worker rejected the files (SPIKE-C3)");
        resolve(null);
      }
    });
  };

  return {
    async inspect(csv) {
      const r = await viaWorker({ op: "inspect", csv });
      if (r !== null && r.ok) return r.result as InspectOutput;
      await yieldToBrowser();
      return (await loadPipeline()).inspectCsv(csv);
    },
    async process(input) {
      const r = await viaWorker({ op: "process", input });
      if (r !== null && r.ok) return r.result as ProcessOutput;
      await yieldToBrowser();
      return (await loadPipeline()).processFiles(input);
    },
    mode: () => mode,
    dispose() {
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
}
