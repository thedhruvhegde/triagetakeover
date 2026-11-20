/**
 * Typed `invoke` client for the UI Kit screens (admin, triage). Request and response types come
 * from the ui-resolver contract (contract/ui-api.ts); only types are imported from it, plus the
 * dependency-free disclaimer constant.
 *
 * The resolver never throws to the UI (it answers an envelope); a rejected `invoke` (network,
 * platform) becomes a retryable `unavailable` envelope here, so screens handle one shape.
 */
import { invoke } from "@forge/bridge";
import type { ApiResponse, UiMethod, UiRequest, UiResult } from "../contract/ui-api";

export type Caller = <M extends UiMethod>(method: M, req: UiRequest<M>) => Promise<ApiResponse<UiResult<M>>>;

function isEnvelope(u: unknown): u is ApiResponse<unknown> {
  if (typeof u !== "object" || u === null) return false;
  const r = u as Record<string, unknown>;
  return (r["ok"] === true && "data" in r) || (r["ok"] === false && typeof r["error"] === "object" && r["error"] !== null);
}

export const UNREACHABLE: ApiResponse<never> = {
  ok: false,
  error: { code: "unavailable", message: "Could not reach the Takeover Triage backend. Try again.", retryable: true },
};

/** Calls one ui-resolver method. Never rejects. */
export const callResolver: Caller = async (method, req) => {
  try {
    const r: unknown = await invoke(method, req as Record<string, unknown>);
    return isEnvelope(r) ? (r as ApiResponse<UiResult<typeof method>>) : { ok: false, error: { code: "error", message: "The backend answered in an unexpected format.", retryable: true } };
  } catch {
    return UNREACHABLE;
  }
};
