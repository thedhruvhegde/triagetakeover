/**
 * The common action response envelope (ARCHITECTURE §10.3) and its builders.
 *
 * Every action, from every caller (Rovo chat, Automation, MCP), answers with an
 * {@link ActionEnvelope}. The builders enforce the schema's caps (headline ≤ 300 chars,
 * why ≤ 12 rows, evidence ≤ 30 items, response ≤ 50 KB) so a handler cannot emit an
 * out-of-contract response by accident.
 */
import type { ApiErrorCode, Confidence, Evidence, WhyRowView } from "../contract/ui-api";
import type { ServiceError } from "../services/errors";
import { NO_SIGNAL_MESSAGE } from "../services/match";

export const ACTION_SCHEMA_VERSION = "1";

export const ACTION_STATUSES = ["ok", "not-enough-data", "no-signal-data", "novel", "ambiguous", "forbidden-or-not-found", "invalid-input", "needs-confirmation", "error"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** §10.3 `whyRow`. `contribution` is always a number (0 with a note where it is n/a). */
export interface ActionWhyRow {
  readonly feature: string;
  readonly label: string;
  readonly unit: string;
  readonly eventValue: number | null;
  readonly referenceValue: number | null;
  readonly z: number | null;
  readonly contribution: number;
  readonly note: string;
}

export interface ActionError {
  /** A contract error code (`ApiErrorCode`) or one of the action-only codes below. */
  readonly code: ApiErrorCode | "no-user" | "missing-input";
  readonly message: string;
  readonly retryable: boolean;
}

export interface ActionEnvelope<D = Record<string, unknown>> {
  readonly schemaVersion: typeof ACTION_SCHEMA_VERSION;
  readonly ok: boolean;
  readonly status: ActionStatus;
  /** Deterministic one-sentence summary built from the numbers in `data`. */
  readonly headline: string;
  readonly data?: D;
  readonly confidence?: Confidence;
  readonly why?: readonly ActionWhyRow[];
  readonly evidence: readonly Evidence[];
  readonly caveats?: readonly string[];
  readonly nextSteps?: readonly string[];
  readonly warnings: readonly string[];
  readonly error?: ActionError;
}

export const LIMITS = { headline: 300, why: 12, evidence: 30, bytes: 50_000 } as const;

/** Undo hint used by every write (§10.1: mention Undo in the issue panel). */
export const UNDO_HINT = "Use Undo in the Takeover signature issue panel.";

export function capText(s: string, max: number): string {
  const chars = [...s.replace(/\s+/g, " ").trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("")}…`;
}

/** Service why-row → envelope why-row; sorted by contribution, capped at 12. */
export function whyRows(rows: readonly WhyRowView[]): ActionWhyRow[] {
  return rows
    .map((r) => ({
      feature: r.feature,
      label: r.label,
      unit: r.unit,
      eventValue: r.eventValue,
      referenceValue: r.referenceValue,
      z: r.z,
      contribution: r.contribution ?? 0,
      note: r.contribution === null && r.note === "" ? "n/a" : r.note,
    }))
    .sort((a, b) => b.contribution - a.contribution || a.feature.localeCompare(b.feature, "en", { numeric: true }))
    .slice(0, LIMITS.why);
}

/** De-duplicates evidence (kind + key + label) and caps at 30. */
export function evidenceList(items: readonly Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const e of items) {
    const id = `${e.kind}|${e.key ?? ""}|${e.label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
    if (out.length >= LIMITS.evidence) break;
  }
  return out;
}

function dedupeStrings(xs: readonly string[]): string[] {
  return [...new Set(xs.filter((x) => x.trim() !== ""))];
}

export interface EnvelopeParts<D> {
  readonly status?: ActionStatus;
  readonly headline: string;
  readonly data: D;
  readonly confidence?: Confidence;
  readonly why?: readonly ActionWhyRow[];
  readonly evidence?: readonly Evidence[];
  readonly caveats?: readonly string[];
  readonly nextSteps?: readonly string[];
  readonly warnings?: readonly string[];
}

/** A successful envelope (`ok: true`). */
export function success<D>(p: EnvelopeParts<D>): ActionEnvelope<D> {
  return {
    schemaVersion: ACTION_SCHEMA_VERSION,
    ok: true,
    status: p.status ?? "ok",
    headline: capText(p.headline, LIMITS.headline),
    data: p.data,
    ...(p.confidence !== undefined ? { confidence: p.confidence } : {}),
    ...(p.why !== undefined ? { why: p.why.slice(0, LIMITS.why) } : {}),
    evidence: evidenceList(p.evidence ?? []),
    ...(p.caveats !== undefined && p.caveats.length > 0 ? { caveats: dedupeStrings(p.caveats) } : {}),
    ...(p.nextSteps !== undefined && p.nextSteps.length > 0 ? { nextSteps: dedupeStrings(p.nextSteps) } : {}),
    warnings: dedupeStrings(p.warnings ?? []),
  };
}

export interface FailureParts {
  readonly status: Exclude<ActionStatus, "ok" | "novel" | "ambiguous">;
  readonly error: ActionError;
  readonly headline?: string;
  readonly data?: Record<string, unknown>;
  readonly evidence?: readonly Evidence[];
  readonly nextSteps?: readonly string[];
  readonly warnings?: readonly string[];
}

/** A failed or withheld envelope (`ok: false`). Nothing was written. */
export function failure(p: FailureParts): ActionEnvelope {
  return {
    schemaVersion: ACTION_SCHEMA_VERSION,
    ok: false,
    status: p.status,
    headline: capText(p.headline ?? p.error.message, LIMITS.headline),
    ...(p.data !== undefined ? { data: p.data } : {}),
    evidence: evidenceList(p.evidence ?? []),
    ...(p.nextSteps !== undefined && p.nextSteps.length > 0 ? { nextSteps: dedupeStrings(p.nextSteps) } : {}),
    warnings: dedupeStrings(p.warnings ?? []),
    error: p.error,
  };
}

/** Next steps per service error code: specific, actionable, never revealing hidden issues. */
const NEXT_STEPS: { readonly [K in ApiErrorCode]?: readonly string[] } = {
  "forbidden-or-not-found": ["Check the issue or project key, and that you can open it in Jira."],
  "not-configured": ["Ask a project administrator to finish the setup on the Takeover Triage admin page."],
  conflict: ["Open the issue's Takeover signature panel to see its current cluster; use Undo there first if it should move."],
  "rate-limited": ["Jira is rate limiting requests. Try again in a minute."],
  unavailable: ["A Jira or Forge service did not answer. Try again in a minute."],
  "not-implemented": ["This part of Takeover Triage is not available in this build."],
  error: ["Try again. If it keeps failing, run Diagnostics on the Takeover Triage admin page."],
};

/** Maps a service failure onto the envelope (status, error, next steps). */
export function fromServiceError(e: ServiceError, warnings: readonly string[] = []): ActionEnvelope {
  if (e.code === "invalid-input" && e.message === NO_SIGNAL_MESSAGE) {
    return failure({
      status: "no-signal-data",
      error: { code: "invalid-input", message: e.message, retryable: false },
      headline: "No signal data on this issue, so the engine has nothing to compare.",
      nextSteps: ["Open the issue and use Add telemetry in the Takeover signature panel (CSV log plus optional camera frames)."],
      warnings,
    });
  }
  const status: FailureParts["status"] = e.code === "invalid-input" ? "invalid-input" : e.code === "forbidden-or-not-found" ? "forbidden-or-not-found" : "error";
  const details = (e.details ?? []).map((d) => (d.path !== undefined ? `${d.path}: ${d.message}` : d.message));
  return failure({
    status,
    error: { code: e.code, message: e.message, retryable: e.retryable },
    ...(details.length > 0 ? { headline: `${e.message} (${details.slice(0, 3).join("; ")})` } : {}),
    nextSteps: [...(NEXT_STEPS[e.code] ?? [])],
    warnings,
  });
}

/** Invalid or missing inputs. `inputs` lists every problem; `hint` says how to fix it. */
export function invalidInput(problems: readonly { readonly input: string; readonly message: string }[], hint?: string): ActionEnvelope {
  const text = problems.map((p) => `${p.input}: ${p.message}`).join("; ");
  return failure({
    status: "invalid-input",
    error: { code: problems.some((p) => p.message.startsWith("required")) ? "missing-input" : "invalid-input", message: `Invalid input. ${text}`, retryable: false },
    data: { problems: problems.map((p) => ({ input: p.input, message: p.message })) },
    nextSteps: hint !== undefined ? [hint] : [],
  });
}

export const NO_USER_MESSAGE = "This action needs a signed-in Jira user, and the call carried no user identity (for example an automation rule without an actor). Nothing was read or written.";

export function noUser(): ActionEnvelope {
  return failure({
    status: "forbidden-or-not-found",
    error: { code: "no-user", message: NO_USER_MESSAGE, retryable: false },
    nextSteps: ["Ask from Rovo chat or an MCP client signed in as a Jira user."],
  });
}

export const INTERNAL_ERROR_MESSAGE = "Something went wrong in Takeover Triage. Nothing further was changed; try again.";

export function internalError(): ActionEnvelope {
  return failure({ status: "error", error: { code: "error", message: INTERNAL_ERROR_MESSAGE, retryable: true }, nextSteps: [...(NEXT_STEPS.error ?? [])] });
}

/** UTF-8 byte length of the JSON form. */
export function jsonBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

/**
 * Enforces the 50 KB response budget (§10.3). Over budget, `why` and `data` are dropped and a
 * warning says so; the headline and evidence keys (the citations) are kept.
 */
export function withinBudget(env: ActionEnvelope<unknown>): ActionEnvelope<unknown> {
  if (jsonBytes(env) <= LIMITS.bytes) return env;
  const { why: _why, data: _data, ...rest } = env;
  void _why;
  void _data;
  const trimmed: ActionEnvelope<unknown> = { ...rest, data: { truncated: true }, warnings: [...env.warnings, "The full result was larger than 50 KB and was trimmed; open the evidence issues for the details."] };
  if (jsonBytes(trimmed) <= LIMITS.bytes) return trimmed;
  return { ...trimmed, evidence: trimmed.evidence.slice(0, 10), caveats: [], nextSteps: [] };
}

/**
 * Makes site-relative evidence URLs absolute when the invocation told us the site's base URL
 * (SPIKE-A2: Rovo puts `context.jira.url` on issue-scoped calls). Absolute links let Rovo and
 * MCP clients render citations; site-relative ones are kept when the base is unknown.
 */
export function absolutize(env: ActionEnvelope<unknown>, siteBase: string | undefined): ActionEnvelope<unknown> {
  if (siteBase === undefined) return env;
  const fix = (e: Evidence): Evidence => (e.url.startsWith("/") ? { ...e, url: `${siteBase}${e.url}` } : e);
  return { ...env, evidence: env.evidence.map(fix) };
}
