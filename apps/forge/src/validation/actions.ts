/**
 * Action input parsing (ARCHITECTURE §10.3). Inputs are flat and typed in the manifest, but
 * the handler still treats them as untrusted: they come from an LLM (Rovo) or an external MCP
 * client. Identity never comes from inputs; the issue in focus comes from
 * `payload.context.jira.issueKey` when present.
 *
 * SPIKE-A2: the exact shape of `payload.context` (Rovo chat vs automation vs MCP) and where
 * the accountId lives are unverified; {@link readActionContext} reads them defensively.
 */
import { err, ok, object, refine, run, type Decoder, type EngineError, type Result } from "@tt/engine";
import { build, clampedInt, freeText, issueKey, isoInstant, looseBool, projectKey, NAME_MAX_LENGTH, ISSUE_KEY_PATTERN, PROJECT_KEY_PATTERN } from "./inputs";

export const ACTION_KEYS = [
  "get-cluster-for-event",
  "explain-match",
  "build-regression-check",
  "list-novel-since",
  "list-coverage-gaps",
  "suggest-owner",
  "link-event",
  "create-cluster",
  "create-scenario-stub",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** Parsed inputs per action, with §10.3 defaults applied. Optional keys stay absent when not given. */
export interface ActionInputs {
  "get-cluster-for-event": { readonly issueKey?: string };
  "explain-match": { readonly issueKey?: string; readonly clusterKey?: string };
  "build-regression-check": { readonly clusterKey?: string; readonly build?: string; readonly projectKey?: string };
  "list-novel-since": { readonly since?: string; readonly projectKey?: string; readonly limit: number };
  "list-coverage-gaps": { readonly projectKey?: string; readonly minEvents: number; readonly includePartial: boolean; readonly limit: number };
  "suggest-owner": { readonly clusterKey: string };
  "link-event": { readonly issueKey: string; readonly clusterKey: string; readonly userConfirmed: boolean };
  "create-cluster": { readonly issueKey: string; readonly name?: string; readonly userConfirmed: boolean };
  "create-scenario-stub": { readonly clusterKey: string; readonly userConfirmed: boolean };
}

/** §10.3 limits. */
export const ACTION_LIMITS = {
  novelDefault: 10,
  novelMax: 25,
  gapsDefault: 25,
  gapsMax: 25,
  minEventsDefault: 2,
} as const;

/** One problem with one input, safe to echo back in an `invalid-input` envelope. */
export interface InputIssue {
  readonly input: string;
  readonly message: string;
}

const confirmed = looseBool;

const DECODERS: { readonly [K in ActionKey]: Decoder<unknown> } = {
  "get-cluster-for-event": object({}, { issueKey }),
  "explain-match": object({}, { issueKey, clusterKey: issueKey }),
  "build-regression-check": refine(object({}, { clusterKey: issueKey, build, projectKey }), (v) =>
    v.clusterKey === undefined && v.build === undefined ? "one of clusterKey or build is required" : null,
  ),
  "list-novel-since": object({}, { since: isoInstant, projectKey, limit: clampedInt(1, ACTION_LIMITS.novelMax) }),
  "list-coverage-gaps": object({}, { projectKey, minEvents: clampedInt(1, 100_000), includePartial: looseBool, limit: clampedInt(1, ACTION_LIMITS.gapsMax) }),
  "suggest-owner": object({ clusterKey: issueKey }),
  "link-event": object({ issueKey, clusterKey: issueKey }, { userConfirmed: confirmed }),
  "create-cluster": object({ issueKey }, { name: freeText(NAME_MAX_LENGTH), userConfirmed: confirmed }),
  "create-scenario-stub": object({ clusterKey: issueKey }, { userConfirmed: confirmed }),
};

function toIssues(errs: readonly EngineError[]): InputIssue[] {
  return errs.map((e) => ({ input: e.path === undefined || e.path === "" ? "(inputs)" : e.path, message: e.message }));
}

/** Drops `null`, `undefined` and empty-string inputs, which LLM callers send for "not given". */
function compact(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "context" || v === null || v === undefined || (typeof v === "string" && v.trim() === "")) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Parses one action's inputs from the raw payload. Unknown inputs are ignored. A missing or
 * non-true `userConfirmed` is NOT an input error: it yields `userConfirmed: false`, which the
 * service turns into `status: needs-confirmation` with nothing written (§10.3).
 */
export function parseActionInputs<K extends ActionKey>(key: K, payload: unknown): Result<ActionInputs[K], readonly InputIssue[]> {
  const r = run(DECODERS[key], compact(payload));
  if (!r.ok) return err(toIssues(r.error));
  const v = r.value as Record<string, unknown>;
  switch (key) {
    case "list-novel-since":
      return ok({ ...v, limit: v["limit"] ?? ACTION_LIMITS.novelDefault } as ActionInputs[K]);
    case "list-coverage-gaps":
      return ok({
        ...v,
        minEvents: v["minEvents"] ?? ACTION_LIMITS.minEventsDefault,
        includePartial: v["includePartial"] ?? true,
        limit: v["limit"] ?? ACTION_LIMITS.gapsDefault,
      } as ActionInputs[K]);
    case "link-event":
    case "create-cluster":
    case "create-scenario-stub":
      return ok({ ...v, userConfirmed: v["userConfirmed"] === true } as ActionInputs[K]);
    default:
      return ok(v as ActionInputs[K]);
  }
}

/** What an action invocation knows about its caller and focus. */
export interface ActionContext {
  /** From the invocation context only, never from inputs (§14). */
  readonly accountId?: string;
  readonly cloudId?: string;
  /** `payload.context.jira.issueKey`, when the chat is on an issue. */
  readonly focusIssueKey?: string;
  readonly focusProjectKey?: string;
}

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function at(u: unknown, ...path: string[]): unknown {
  let cur = u;
  for (const p of path) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function pick(u: unknown, re: RegExp, upper = false): string | undefined {
  if (typeof u !== "string") return undefined;
  const s = upper ? u.trim().toUpperCase() : u.trim();
  return re.test(s) ? s : undefined;
}

/**
 * Reads identity and focus from an action invocation (SPIKE-A2). `payload.context.jira` holds
 * the focused issue/project; the accountId is read from the function's second argument
 * (`context.principal.accountId`) or, failing that, `payload.context.accountId`. Anything that
 * fails its pattern is dropped.
 */
export function readActionContext(payload: unknown, invocationContext?: unknown): ActionContext {
  // Trusted platform sources first (the function's second argument); `payload.context` is part of
  // the caller-supplied payload (an MCP client controls it), so it is only the last resort
  // (SPIKE-A2). The write itself always runs as the platform's user (`api.asUser()`); this id is
  // what `tt.triage.by` records.
  const accountId = pick(at(invocationContext, "principal", "accountId"), ACCOUNT_ID_PATTERN) ?? pick(at(invocationContext, "accountId"), ACCOUNT_ID_PATTERN) ?? pick(at(payload, "context", "accountId"), ACCOUNT_ID_PATTERN);
  const cloudId = pick(at(payload, "context", "cloudId"), /^[A-Za-z0-9-]{1,64}$/) ?? pick(at(invocationContext, "installContext"), /^ari:cloud:[A-Za-z0-9:/._-]{1,200}$/);
  const focusIssueKey = pick(at(payload, "context", "jira", "issueKey"), ISSUE_KEY_PATTERN, true);
  const focusProjectKey = pick(at(payload, "context", "jira", "projectKey"), PROJECT_KEY_PATTERN, true) ?? (focusIssueKey !== undefined ? focusIssueKey.replace(/-\d+$/, "") : undefined);
  return {
    ...(accountId !== undefined ? { accountId } : {}),
    ...(cloudId !== undefined ? { cloudId } : {}),
    ...(focusIssueKey !== undefined ? { focusIssueKey } : {}),
    ...(focusProjectKey !== undefined ? { focusProjectKey } : {}),
  };
}
