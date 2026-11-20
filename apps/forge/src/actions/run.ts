/**
 * One entry point for every action invocation: normalise and validate the inputs, read the
 * caller from the invocation, build the service context, run the handler, enforce the
 * envelope budget. Never throws; kept free of `@forge/*` so tests drive it with the
 * in-memory factory.
 */
import type { ServiceContextFactory } from "../context";
import { parseActionInputs, ACTION_KEYS, type ActionKey } from "../validation/actions";
import { absolutize, internalError, invalidInput, noUser, withinBudget, type ActionEnvelope } from "./envelope";
import { ACTION_HANDLERS, type ActionHandler } from "./handlers";
import { normalizeInputs, readInvocation, toServiceInvocation, type ActionInvocation } from "./invocation";

const HINTS: { readonly [K in ActionKey]: string } = {
  "get-cluster-for-event": "Inputs: issueKey (optional when asked from the issue).",
  "explain-match": "Inputs: issueKey (optional when asked from the issue), clusterKey (optional).",
  "build-regression-check": "Inputs: clusterKey or build (one is required, e.g. build 4.12.0), projectKey (optional).",
  "list-novel-since": "Inputs: since (ISO-8601, e.g. 2026-11-14T17:00:00Z; optional), projectKey (optional), limit (1-25).",
  "list-coverage-gaps": "Inputs: projectKey (optional), minEvents (integer), includePartial (true/false), limit (1-25).",
  "suggest-owner": "Inputs: clusterKey (the cluster issue key, e.g. TTDEMO-40).",
  "link-event": "Inputs: issueKey, clusterKey, userConfirmed (true only after the user agreed).",
  "create-cluster": "Inputs: issueKey (seed event), name (optional, up to 80 characters), userConfirmed (true only after the user agreed).",
  "create-scenario-stub": "Inputs: clusterKey, userConfirmed (true only after the user agreed).",
};

/** Required key inputs that may default to the issue in context. */
const FOCUS_DEFAULTS: { readonly [K in ActionKey]?: "issueKey" | "clusterKey" } = {
  "link-event": "issueKey",
  "create-cluster": "issueKey",
  "suggest-owner": "clusterKey",
  "create-scenario-stub": "clusterKey",
};

function prefill(key: ActionKey, inputs: Record<string, unknown>, inv: ActionInvocation): { inputs: Record<string, unknown>; warning?: string } {
  const field = FOCUS_DEFAULTS[key];
  const empty = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
  if (field === undefined || inv.focusIssueKey === undefined || !empty(inputs[field])) return { inputs };
  return { inputs: { ...inputs, [field]: inv.focusIssueKey }, warning: `${field} was not given; used the issue in context, ${inv.focusIssueKey}.` };
}

function finish(env: ActionEnvelope<unknown>, inv: ActionInvocation, extraWarning?: string): ActionEnvelope<unknown> {
  const withWarning = extraWarning === undefined ? env : { ...env, warnings: [extraWarning, ...env.warnings] };
  return withinBudget(absolutize(withWarning, inv.siteBase));
}

/** Runs one action end to end. `payload` and `rawContext` are the two Forge handler arguments. */
export async function runAction(key: ActionKey, payload: unknown, rawContext: unknown, factory: ServiceContextFactory): Promise<ActionEnvelope<unknown>> {
  try {
    const inv = readInvocation(payload, rawContext);
    const { inputs, warning } = prefill(key, normalizeInputs(payload), inv);
    const parsed = parseActionInputs(key, inputs);
    if (!parsed.ok) return finish(invalidInput(parsed.error, HINTS[key]), inv);
    if (inv.accountId === undefined) return finish(noUser(), inv);
    const ctx = factory(toServiceInvocation(inv));
    const handler = ACTION_HANDLERS[key] as ActionHandler<typeof key>;
    const env = await handler(parsed.value, inv, ctx);
    return finish(env, inv, warning);
  } catch (e) {
    // Programming or adapter errors only (services return values for expected failures).
    console.error(`action ${key} failed`, e instanceof Error ? e.message : String(e));
    return internalError();
  }
}

export type ForgeActionHandler = (payload: unknown, context?: unknown) => Promise<ActionEnvelope<unknown>>;

/** The nine Forge function handlers over a context factory (production: the Forge adapters). */
export function buildActionHandlers(factory: ServiceContextFactory): { readonly [K in ActionKey]: ForgeActionHandler } {
  const out = {} as Record<ActionKey, ForgeActionHandler>;
  for (const key of ACTION_KEYS) out[key] = (payload, context) => runAction(key, payload, context, factory);
  return out;
}
