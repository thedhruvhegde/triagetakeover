/**
 * Test doubles for the real Forge adapters: scripted `requestJira` responses that record the
 * exact request (path as produced by `route`, method, headers, body).
 */
import type { Requester, RetryPolicy } from "../../src/adapters/forge/http.js";

export type FakeResponse = Awaited<ReturnType<Requester>>;
export type RequestInitLike = NonNullable<Parameters<Requester>[1]>;

export function response(status: number, body: unknown = "", headers: Record<string, string> = {}): FakeResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: String(status),
    headers: {
      get: (n: string) => lower.get(n.toLowerCase()) ?? null,
      has: (n: string) => lower.has(n.toLowerCase()),
      append: () => undefined,
      delete: () => undefined,
      set: () => undefined,
      forEach: () => undefined,
    },
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text) as unknown),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer),
  };
}

export interface RecordedRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Parsed JSON body when the body was a JSON string; raw otherwise. */
  readonly body: unknown;
  readonly rawBody: RequestInitLike["body"];
}

type Handler = (req: RecordedRequest) => FakeResponse | Promise<FakeResponse> | Error;

/**
 * A requester answering from `routes` (matched by `"METHOD path"` exact string, or a function
 * fallback). Unmatched requests answer 599 so a test fails loudly.
 */
export function scriptedRequester(routes: Record<string, FakeResponse | FakeResponse[] | Handler | Error>, fallback?: Handler): { requester: Requester; calls: RecordedRequest[] } {
  const calls: RecordedRequest[] = [];
  const queues = new Map<string, FakeResponse[]>();
  const requester: Requester = async (path, init = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const raw = init.body;
    let body: unknown = raw;
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw) as unknown;
      } catch {
        body = raw;
      }
    }
    const req: RecordedRequest = { path: path.value, method, headers: { ...(init.headers ?? {}) }, body, rawBody: raw };
    calls.push(req);
    const key = `${method} ${path.value}`;
    const entry = routes[key];
    let out: FakeResponse | Error | undefined;
    if (Array.isArray(entry)) {
      const q = queues.get(key) ?? [...entry];
      queues.set(key, q);
      out = q.length > 1 ? q.shift() : q[0];
    } else if (typeof entry === "function") out = await entry(req);
    else if (entry !== undefined) out = entry;
    else if (fallback !== undefined) out = await fallback(req);
    if (out instanceof Error) throw out;
    return out ?? response(599, { errorMessages: [`unscripted ${key}`] });
  };
  return { requester, calls };
}

/** Retry policy with recorded, instant sleeps. */
export function instantPolicy(overrides: Partial<RetryPolicy> = {}): RetryPolicy & { readonly slept: number[] } {
  const slept: number[] = [];
  return {
    maxAttempts: 4,
    maxWaitMs: 5_000,
    budgetMs: 8_000,
    baseDelayMs: 500,
    sleep: (ms) => {
      slept.push(ms);
      return Promise.resolve();
    },
    random: () => 1,
    nowMs: () => Date.parse("2026-11-20T09:00:00.000Z"),
    ...overrides,
    slept,
  };
}
