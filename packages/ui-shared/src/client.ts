/**
 * A typed, never-throwing wrapper around `invoke(method, payload)`.
 *
 * Generic over the API map so this package does not import the app's contract (ARCHITECTURE §4:
 * nothing imports `apps/*`). The Custom UI apps instantiate it with the `UiApi` contract type:
 * `createUiClient<UiApi>(invoke)`.
 */

/** Envelope error (mirrors the contract's `ApiError`). */
export interface ClientError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: readonly { readonly path?: string; readonly message: string }[];
}

export type CallResult<T> =
  | { readonly ok: true; readonly data: T; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: ClientError };

/** Shape every API map must have: one `{req, res}` pair per method. */
export type ApiShape<A> = { readonly [K in keyof A]: { readonly req: unknown; readonly res: unknown } };

/** The transport: `@forge/bridge` `invoke` in production, a fake in tests. */
export type InvokeFn = (method: string, payload: unknown) => Promise<unknown>;

export interface UiClient<A extends ApiShape<A>> {
  call<M extends keyof A & string>(method: M, req: A[M]["req"]): Promise<CallResult<A[M]["res"]>>;
}

/** Message shown when the transport itself fails (network, iframe bridge, resolver crash). */
export const TRANSPORT_ERROR_MESSAGE = "Could not reach the Takeover Triage backend. Try again in a moment.";

function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null && !Array.isArray(u);
}

/** Checks the envelope shape; anything else becomes an `error` result (never trusted blindly). */
export function readEnvelope<T>(raw: unknown): CallResult<T> {
  if (isRecord(raw) && raw["ok"] === true && "data" in raw) {
    const warnings = Array.isArray(raw["warnings"]) ? raw["warnings"].filter((w): w is string => typeof w === "string") : [];
    return { ok: true, data: raw["data"] as T, warnings };
  }
  if (isRecord(raw) && raw["ok"] === false && isRecord(raw["error"])) {
    const e = raw["error"];
    const details = Array.isArray(e["details"])
      ? e["details"].filter(isRecord).map((d) => ({
          ...(typeof d["path"] === "string" ? { path: d["path"] } : {}),
          message: typeof d["message"] === "string" ? d["message"] : "",
        }))
      : undefined;
    return {
      ok: false,
      error: {
        code: typeof e["code"] === "string" ? e["code"] : "error",
        message: typeof e["message"] === "string" ? e["message"] : "Something went wrong.",
        retryable: e["retryable"] === true,
        ...(details !== undefined ? { details } : {}),
      },
    };
  }
  return { ok: false, error: { code: "error", message: "The backend sent an unexpected response.", retryable: true } };
}

export function createUiClient<A extends ApiShape<A>>(invoke: InvokeFn): UiClient<A> {
  return {
    async call(method, req) {
      try {
        return readEnvelope(await invoke(method, req));
      } catch {
        return { ok: false, error: { code: "unavailable", message: TRANSPORT_ERROR_MESSAGE, retryable: true } };
      }
    },
  };
}

/** A recorded call of a {@link createFakeClient} client. */
export interface RecordedCall {
  readonly method: string;
  readonly req: unknown;
}

/** Handler map for tests and the dev harness: method → data (or a CallResult, or a function). */
export type FakeHandlers<A extends ApiShape<A>> = {
  readonly [M in keyof A]?: (req: A[M]["req"]) => CallResult<A[M]["res"]> | A[M]["res"] | Promise<CallResult<A[M]["res"]> | A[M]["res"]>;
};

function looksLikeResult(u: unknown): u is CallResult<unknown> {
  return isRecord(u) && (u["ok"] === true || u["ok"] === false) && ("data" in u || "error" in u);
}

/**
 * An in-memory client for tests and the jsdom dev harness. Unhandled methods answer
 * `not-implemented`, so a test sees exactly which calls an app makes.
 */
export function createFakeClient<A extends ApiShape<A>>(handlers: FakeHandlers<A>): UiClient<A> & { readonly calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async call(method, req) {
      calls.push({ method, req });
      const h = handlers[method];
      if (h === undefined) return { ok: false, error: { code: "not-implemented", message: `fake: ${method} not handled`, retryable: false } };
      const out = await h(req);
      return looksLikeResult(out) ? (out as CallResult<never>) : { ok: true, data: out as never, warnings: [] };
    },
  };
}
