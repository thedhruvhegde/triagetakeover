/**
 * HTTP core of the real Jira adapter: one `requestJira` call with
 * - 429 retry honouring `Retry-After` (seconds or HTTP-date), else exponential back-off with
 *   jitter; 5xx retry only for idempotent methods (a retried POST could create twice);
 * - a total wait budget, so a resolver never sleeps past its own deadline (§15 #19): when the
 *   platform asks for a longer wait the call fails `rate-limited` with `retryAfterSeconds`,
 *   and consumers re-queue with `delayInSeconds` (§15 #15);
 * - mapping of HTTP status / thrown platform errors onto {@link PortError} kinds.
 *
 * Ports never throw for expected failures; this module never throws either (the body read and
 * the call itself are guarded).
 */
import { NeedsAuthenticationError, ProxyRequestError, type APIResponse, type RequestInit, type Route } from "@forge/api";
import { kindForStatus, ok, portErr, type PortErrorKind, type PortResult } from "../../ports/result";

/** `api.asUser().requestJira` / `api.asApp().requestJira`, bound late. */
export type Requester = (path: Route, init?: RequestInit) => Promise<APIResponse>;

export interface RetryPolicy {
  /** Attempts in total, including the first. */
  readonly maxAttempts: number;
  /** Longest single wait the adapter will sleep; a longer `Retry-After` fails fast. */
  readonly maxWaitMs: number;
  /** Total sleep budget across retries of one call. */
  readonly budgetMs: number;
  /** First back-off step without `Retry-After` (doubles per attempt). */
  readonly baseDelayMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  /** 0..1, for jitter. */
  readonly random: () => number;
  readonly nowMs: () => number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  maxWaitMs: 5_000,
  budgetMs: 8_000,
  baseDelayMs: 500,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: () => Math.random(),
  nowMs: () => Date.now(),
};

export interface HttpReply {
  readonly status: number;
  /** Raw body text ("" for 204). */
  readonly body: string;
  readonly header: (name: string) => string | null;
}

export interface HttpClient {
  /** `op` names the port operation for error reports, e.g. `jira.getIssue`. */
  send(op: string, path: Route, init?: RequestInit): Promise<PortResult<HttpReply>>;
}

const IDEMPOTENT = new Set(["GET", "PUT", "DELETE", "HEAD"]);

/** Parses `Retry-After` (delta seconds or an HTTP-date) into whole seconds ≥ 0. */
export function parseRetryAfter(value: string | null, nowMs: number): number | undefined {
  if (value === null) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const at = Date.parse(v);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

/** Jira error bodies: `{errorMessages: string[], errors: {field: message}}`; else the raw text. */
export function jiraErrorText(body: string, status: number): string {
  try {
    const j = JSON.parse(body) as unknown;
    if (typeof j === "object" && j !== null) {
      const r = j as Record<string, unknown>;
      const parts: string[] = [];
      if (Array.isArray(r["errorMessages"])) for (const m of r["errorMessages"]) if (typeof m === "string" && m !== "") parts.push(m);
      if (typeof r["errors"] === "object" && r["errors"] !== null && !Array.isArray(r["errors"])) {
        for (const [k, m] of Object.entries(r["errors"] as Record<string, unknown>)) if (typeof m === "string") parts.push(`${k}: ${m}`);
      }
      if (typeof r["message"] === "string") parts.push(r["message"]);
      if (parts.length > 0) return parts.join("; ").slice(0, 500);
    }
  } catch {
    // not JSON
  }
  const t = body.trim();
  return t === "" ? `HTTP ${status}` : t.slice(0, 200);
}

/** Classifies an exception thrown by `requestJira` (not an HTTP status). */
export function classifyThrown(e: unknown): { readonly kind: PortErrorKind; readonly message: string; readonly status?: number } {
  // SPIKE-A1: asUser without the user's consent throws NeedsAuthenticationError. The resolver
  // swallows exceptions, so it is reported as `unauthorized` (the UI shows "Allow access").
  if (e instanceof NeedsAuthenticationError || (e instanceof Error && e.name === "NeedsAuthenticationError")) {
    return { kind: "unauthorized", message: "The app needs your consent to act as you (Allow access).", status: 401 };
  }
  if (e instanceof ProxyRequestError) return { kind: kindForStatus(e.status), message: `Forge proxy error ${e.errorCode}`, status: e.status };
  if (e instanceof Error) return { kind: "unavailable", message: `request failed: ${e.message.slice(0, 200)}` };
  return { kind: "unknown", message: "request failed" };
}

export function createHttpClient(request: Requester, policy: RetryPolicy = DEFAULT_RETRY_POLICY): HttpClient {
  return {
    async send(op, path, init = {}) {
      const method = (init.method ?? "GET").toUpperCase();
      let slept = 0;
      for (let attempt = 1; ; attempt++) {
        let status: number;
        let body: string;
        let header: (name: string) => string | null;
        try {
          const res = await request(path, init);
          status = res.status;
          header = (name) => res.headers.get(name);
          body = await res.text();
        } catch (e) {
          const c = classifyThrown(e);
          return portErr(c.kind, c.message, { op, ...(c.status !== undefined ? { status: c.status } : {}) });
        }
        if (status >= 200 && status < 300) return ok({ status, body, header });

        const retryable = status === 429 || (status >= 500 && IDEMPOTENT.has(method));
        const retryAfter = parseRetryAfter(header("Retry-After"), policy.nowMs());
        if (retryable && attempt < policy.maxAttempts) {
          const backoff = policy.baseDelayMs * 2 ** (attempt - 1);
          const wait = retryAfter !== undefined ? retryAfter * 1000 : Math.round(backoff * (0.5 + policy.random() / 2));
          if (wait <= policy.maxWaitMs && slept + wait <= policy.budgetMs) {
            await policy.sleep(wait);
            slept += wait;
            continue;
          }
        }
        const kind = kindForStatus(status);
        return portErr(kind, jiraErrorText(body, status), {
          op,
          status,
          ...(kind === "rate-limited" || kind === "unavailable" ? { retryAfterSeconds: retryAfter ?? Math.max(1, Math.ceil((policy.baseDelayMs * 2 ** attempt) / 1000)) } : {}),
        });
      }
    },
  };
}

/** Parses a JSON reply body; `invalid-response` when it is not JSON. */
export function parseJson(reply: HttpReply, op: string): PortResult<unknown> {
  if (reply.body.trim() === "") return ok(undefined);
  try {
    return ok(JSON.parse(reply.body) as unknown);
  } catch {
    return portErr("invalid-response", "response body is not JSON", { op, status: reply.status });
  }
}

/** JSON request init. */
export function jsonInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}
