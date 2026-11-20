/// <reference lib="webworker" />
/**
 * Intake Web Worker (SPIKE-C3): runs the engine off the main thread. Bundled by Vite as a
 * same-origin module worker (`new Worker(new URL("./worker.ts", import.meta.url))`).
 */
import { inspectCsv, processFiles } from "./pipeline.js";
import type { WorkerRequest, WorkerResponse } from "./processor.js";

const scope = self as unknown as { onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null; postMessage: (m: WorkerResponse) => void };

scope.onmessage = (ev) => {
  const req = ev.data;
  try {
    const result = req.op === "inspect" ? inspectCsv(req.csv) : processFiles(req.input);
    scope.postMessage({ id: req.id, ok: true, result });
  } catch (e) {
    scope.postMessage({ id: req.id, ok: false, message: e instanceof Error ? e.message : String(e) });
  }
};
