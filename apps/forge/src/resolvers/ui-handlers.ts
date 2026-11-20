/**
 * Thin UI resolver handlers: validate the untrusted payload, build the service context,
 * call one service, map the result onto the contract's {@link ApiResponse} envelope.
 *
 * Kept free of `@forge/*` so tests drive it with the in-memory factory; `ui-resolver.ts`
 * registers these with `@forge/resolver`.
 */
import { isRecord, object, oneOf, run, str, type Decoder } from "@tt/engine";
import type { ApiError, ApiResponse, UiMethod, UiResult } from "../contract/ui-api";
import type { Invocation, ServiceContext, ServiceContextFactory } from "../context";
import * as S from "../services/index";
import { detailsOf, fail, type ServiceResult } from "../services/errors";
import { freeText, issueKey, projectKey, seed, ISSUE_KEY_PATTERN, PROJECT_KEY_PATTERN } from "../validation/inputs";

type Handler<M extends UiMethod> = (payload: Record<string, unknown>, ctx: ServiceContext) => Promise<ServiceResult<UiResult<M>>>;

/** Decodes the payload or returns an `invalid-input` failure. */
function decode<T>(d: Decoder<T>, payload: unknown): { ok: true; value: T } | { ok: false; error: ReturnType<typeof fail>["error"] } {
  const r = run(d, payload);
  return r.ok ? r : fail("invalid-input", "The request is not valid.", detailsOf(r.error));
}

/** Fills `issueKey` / `projectKey` from the module context when the payload omits them. */
function withFocus(payload: Record<string, unknown>, ctx: ServiceContext): Record<string, unknown> {
  const out = { ...payload };
  if (out["issueKey"] === undefined && ctx.invocation.focusIssueKey !== undefined) out["issueKey"] = ctx.invocation.focusIssueKey;
  if (out["projectKey"] === undefined && ctx.invocation.focusProjectKey !== undefined) out["projectKey"] = ctx.invocation.focusProjectKey;
  return out;
}

const projectReq = object({ projectKey });
const issueReq = object({ issueKey });
const clusterReq = object({ clusterKey: issueKey });

const H: { readonly [M in UiMethod]: Handler<M> } = {
  getBoard: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.getBoard(ctx, d.value.projectKey) : d;
  },
  markTriaged: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.markTriaged(ctx, d.value.projectKey) : d;
  },
  requestResync: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.requestResync(ctx, d.value.projectKey) : d;
  },
  getResyncStatus: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.getResyncStatus(ctx, d.value.projectKey) : d;
  },
  buildRegressionCheck: async (p, ctx) => {
    const d = decode(object({ projectKey }, { clusterKey: issueKey, build: str({ pattern: /^[0-9A-Za-z.+_-]{1,40}$/ }) }), withFocus(p, ctx));
    return d.ok ? S.buildRegressionCheck(ctx, d.value.projectKey, { ...(d.value.clusterKey !== undefined ? { clusterKey: d.value.clusterKey } : {}), ...(d.value.build !== undefined ? { build: d.value.build } : {}) }) : d;
  },
  getPanel: async (p, ctx) => {
    const d = decode(issueReq, withFocus(p, ctx));
    return d.ok ? S.getPanel(ctx, d.value.issueKey) : d;
  },
  triageNow: async (p, ctx) => {
    const d = decode(issueReq, withFocus(p, ctx));
    return d.ok ? S.triageNow(ctx, d.value.issueKey) : d;
  },
  explainMatch: async (p, ctx) => {
    const d = decode(object({ issueKey }, { clusterKey: issueKey }), withFocus(p, ctx));
    return d.ok ? S.explainMatch(ctx, d.value.issueKey, d.value.clusterKey) : d;
  },
  acceptMatch: async (p, ctx) => {
    const d = decode(object({ issueKey, clusterKey: issueKey }), withFocus(p, ctx));
    return d.ok ? S.acceptMatch(ctx, d.value.issueKey, d.value.clusterKey) : d;
  },
  splitEvent: async (p, ctx) => {
    const d = decode(object({ issueKey }, { name: freeText(80) }), withFocus(p, ctx));
    return d.ok ? S.splitEvent(ctx, d.value.issueKey, d.value.name) : d;
  },
  suggestOwner: async (p, ctx) => {
    const d = decode(clusterReq, p);
    return d.ok ? S.suggestOwner(ctx, d.value.clusterKey, { includeMembers: true }) : d;
  },
  applyRoute: async (p, ctx) => {
    const d = decode(object({ issueKey, clusterKey: issueKey }), withFocus(p, ctx));
    return d.ok ? S.applyRoute(ctx, d.value.issueKey, d.value.clusterKey) : d;
  },
  undoLast: async (p, ctx) => {
    const d = decode(issueReq, withFocus(p, ctx));
    return d.ok ? S.undoLast(ctx, d.value.issueKey) : d;
  },
  previewScenarioStub: async (p, ctx) => {
    const d = decode(clusterReq, p);
    return d.ok ? S.previewScenarioStub(ctx, d.value.clusterKey) : d;
  },
  createScenarioStub: async (p, ctx) => {
    const d = decode(clusterReq, p);
    return d.ok ? S.createScenarioStub(ctx, d.value.clusterKey) : d;
  },
  getIntakeContext: async (p, ctx) => {
    const d = decode(object({}, { projectKey, issueKey }), withFocus(p, ctx));
    return d.ok ? S.getIntakeContext(ctx, d.value) : d;
  },
  createTakeoverIssue: async (p, ctx) => {
    const d = decode(object({ projectKey, summary: str({ minLength: 1, maxLength: 255 }) }, { description: str({ maxLength: 20_000 }) }), withFocus(p, ctx));
    return d.ok ? S.createTakeoverIssue(ctx, d.value) : d;
  },
  uploadAttachment: async (p, ctx) => {
    const d = decode(object({ issueKey, filename: str({ minLength: 1, maxLength: 120 }), mimeType: str({ minLength: 1, maxLength: 40 }), dataBase64: str({ minLength: 4, maxLength: 600_000 }) }), withFocus(p, ctx));
    return d.ok ? S.uploadAttachmentFallback(ctx, d.value) : d;
  },
  commitEvent: async (p, ctx) => S.commitEvent(ctx, withFocus(p, ctx)),
  saveMappingPreset: async (p, ctx) => {
    const q = withFocus(p, ctx);
    const d = decode(object({ projectKey, id: str({ minLength: 1, maxLength: 40 }) }), q);
    return d.ok ? S.saveMappingPreset(ctx, { ...d.value, preset: q["preset"] }) : d;
  },
  getAdminState: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.getAdminState(ctx, d.value.projectKey) : d;
  },
  saveProjectConfig: async (p, ctx) => {
    const q = withFocus(p, ctx);
    const d = decode(projectReq, q);
    if (!d.ok) return d;
    if (!isRecord(q["config"])) return fail("invalid-input", "config must be an object.", [{ path: "config", message: "expected object" }]);
    return S.saveProjectConfig(ctx, d.value.projectKey, q["config"]);
  },
  runDiagnostics: async (p, ctx) => {
    const d = decode(object({ projectKey }, { issueKey }), withFocus(p, ctx));
    return d.ok ? S.runDiagnostics(ctx, d.value.projectKey, d.value.issueKey) : d;
  },
  listMyTeams: async (_p, ctx) => S.listMyTeams(ctx),
  startSeed: async (p, ctx) => {
    const d = decode(object({ projectKey, seed }, { mode: oneOf(["start", "keep", "reset"]), frames: oneOf(["full", "fast"]) }), withFocus(p, ctx));
    return d.ok ? S.startSeed(ctx, d.value) : d;
  },
  getSeedReport: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.getSeedReport(ctx, d.value) : d;
  },
  getSeedJob: async (p, ctx) => {
    const d = decode(object({ jobId: str({ pattern: /^[A-Za-z0-9_-]{1,64}$/ }) }), p);
    return d.ok ? S.getSeedJob(ctx, d.value) : d;
  },
  removeDemoData: async (p, ctx) => {
    const d = decode(projectReq, withFocus(p, ctx));
    return d.ok ? S.removeDemoData(ctx, d.value) : d;
  },
};

export const UI_HANDLERS = H;

function at(u: unknown, ...path: string[]): unknown {
  let cur = u;
  for (const p of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

const pick = (u: unknown, re: RegExp): string | undefined => (typeof u === "string" && re.test(u) ? u : undefined);

/**
 * Reads the caller from a resolver `context` (SPIKE-A2/M1: exact shape unverified; read
 * defensively). Identity comes only from here, never from the payload (§14).
 */
export function invocationFromContext(raw: unknown): Invocation {
  const accountId = pick(at(raw, "accountId"), /^[A-Za-z0-9:_-]{1,128}$/);
  const cloudId = pick(at(raw, "cloudId"), /^[A-Za-z0-9-]{1,64}$/);
  const focusIssueKey = pick(at(raw, "extension", "issue", "key"), ISSUE_KEY_PATTERN);
  const focusProjectKey = pick(at(raw, "extension", "project", "key"), PROJECT_KEY_PATTERN) ?? (focusIssueKey !== undefined ? focusIssueKey.replace(/-\d+$/, "") : undefined);
  return {
    ...(accountId !== undefined ? { accountId } : {}),
    ...(cloudId !== undefined ? { cloudId } : {}),
    ...(focusIssueKey !== undefined ? { focusIssueKey } : {}),
    ...(focusProjectKey !== undefined ? { focusProjectKey } : {}),
  };
}

const INTERNAL: ApiError = { code: "error", message: "Something went wrong on the server. Nothing further was changed; try again.", retryable: true };

/** Runs one method end to end. Never throws. */
export async function dispatchUi<M extends UiMethod>(method: M, payload: unknown, rawContext: unknown, factory: ServiceContextFactory): Promise<ApiResponse<UiResult<M>>> {
  try {
    const ctx = factory(invocationFromContext(rawContext));
    const handler = H[method] as Handler<M>;
    const r = await handler(isRecord(payload) ? payload : {}, ctx);
    if (!r.ok) return { ok: false, error: { code: r.error.code, message: r.error.message, retryable: r.error.retryable, ...(r.error.details !== undefined ? { details: r.error.details } : {}) } };
    return { ok: true, data: r.value.value, warnings: [...r.value.warnings] };
  } catch (e) {
    // Programming errors only (ports return values for expected failures). Keep the message out of the UI.
    console.error(`ui-resolver ${method} failed`, e instanceof Error ? e.message : String(e));
    return { ok: false, error: INTERNAL };
  }
}
