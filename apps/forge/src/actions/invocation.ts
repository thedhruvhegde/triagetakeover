/**
 * What an action invocation carries, read defensively (SPIKE-A2).
 *
 * Forge calls an action function as `handler(payload, context)`. The inputs are flat keys of
 * `payload`; Rovo adds `payload.context` (cloudId, moduleKey and, on an issue, `jira.issueKey`,
 * `jira.projectKey`, `jira.url`). Where the accountId lives, and what Automation and MCP calls
 * put in `payload.context`, is unverified. This module accepts every shape we expect, and the
 * contract tests pin each one with a fixture in `test/fixtures/contexts/`.
 *
 * Identity comes only from the invocation (never from an input, §14). The issue in focus
 * comes from `payload.context.jira`; an `issueKey` input is an explicit override that the
 * services authorise with an asUser read.
 */
import { isRecord } from "@tt/engine";
import { readActionContext, type ActionContext } from "../validation/actions";
import { PROJECT_KEY_PATTERN } from "../validation/inputs";
import type { Invocation } from "../context";

const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;
/** Only Atlassian Cloud site origins are trusted as a citation base. */
const SITE_ORIGIN_PATTERN = /^https:\/\/[a-z0-9][a-z0-9-]{0,62}\.(atlassian\.net|jira\.com)(?=\/|$)/;

export interface ActionInvocation extends ActionContext {
  /** `https://<site>.atlassian.net`, when the call told us; used to absolutise evidence URLs. */
  readonly siteBase?: string;
}

function at(u: unknown, ...path: string[]): unknown {
  let cur = u;
  for (const p of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function siteBaseOf(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const m = SITE_ORIGIN_PATTERN.exec(c.trim());
    if (m !== null) return m[0];
  }
  return undefined;
}

/**
 * SPIKE-A2: the accountId is read, in order, from `context.principal.accountId`,
 * `context.accountId` (both the function's second argument) and `payload.context.accountId`.
 */
export function readInvocation(payload: unknown, invocationContext?: unknown): ActionInvocation {
  const base = readActionContext(payload, invocationContext);
  const topLevel = at(invocationContext, "accountId");
  const accountId = base.accountId ?? (typeof topLevel === "string" && ACCOUNT_ID_PATTERN.test(topLevel) ? topLevel : undefined);
  const siteBase = siteBaseOf(at(payload, "context", "jira", "url"), at(payload, "context", "siteUrl"), at(invocationContext, "siteUrl"));
  return {
    ...base,
    ...(accountId !== undefined ? { accountId } : {}),
    ...(siteBase !== undefined ? { siteBase } : {}),
  };
}

/** The service-layer invocation for an action call. */
export function toServiceInvocation(a: ActionInvocation): Invocation {
  return {
    ...(a.accountId !== undefined ? { accountId: a.accountId } : {}),
    ...(a.cloudId !== undefined ? { cloudId: a.cloudId } : {}),
    ...(a.focusIssueKey !== undefined ? { focusIssueKey: a.focusIssueKey } : {}),
    ...(a.focusProjectKey !== undefined ? { focusProjectKey: a.focusProjectKey } : {}),
  };
}

const BOOLEAN_INPUTS = new Set(["userConfirmed", "includePartial"]);

/**
 * Normalises the input part of a payload (SPIKE-A2):
 * - inputs nested under `payload.inputs` (seen in some MCP bridges) are lifted to the top
 *   level when the top level does not already carry them;
 * - boolean inputs sent as strings in any letter case (`"True"`, `" false "`) become
 *   `"true"` / `"false"`, which the decoders accept.
 * `payload.context` is left untouched; the input parser ignores it.
 */
export function normalizeInputs(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) return {};
  const out: Record<string, unknown> = {};
  const nested = payload["inputs"];
  if (isRecord(nested)) for (const [k, v] of Object.entries(nested)) out[k] = v;
  for (const [k, v] of Object.entries(payload)) if (k !== "inputs") out[k] = v;
  for (const k of BOOLEAN_INPUTS) {
    const v = out[k];
    if (typeof v === "string" && /^\s*(true|false)\s*$/i.test(v)) out[k] = v.trim().toLowerCase();
  }
  return out;
}

export function isProjectKey(s: string): boolean {
  return PROJECT_KEY_PATTERN.test(s);
}
