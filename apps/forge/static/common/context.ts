/**
 * Defensive readers for the Forge view context (`view.getContext()`).
 *
 * SPIKE-A2 / SPIKE-C2: the exact context shape for a `jira:projectPage`, `jira:issuePanel`,
 * `jira:issueAction` and a bridge `Modal` opened with `context` is taken from the Forge docs but
 * not verified on a live site. Every field is optional here; callers show an honest error when
 * the key they need is missing.
 */

export type IntakeMode = "create" | "attach";

export interface ViewTarget {
  readonly projectKey?: string;
  readonly issueKey?: string;
  /** Intake only: `create` from the board, `attach` from "Add telemetry". */
  readonly mode?: IntakeMode;
  /** Set when this resource is running inside a bridge `Modal`. */
  readonly inModal: boolean;
  readonly moduleKey?: string;
}

function rec(u: unknown): Record<string, unknown> {
  return typeof u === "object" && u !== null && !Array.isArray(u) ? (u as Record<string, unknown>) : {};
}

function str(u: unknown): string | undefined {
  return typeof u === "string" && u.trim() !== "" ? u : undefined;
}

/** Reads project / issue keys and the intake mode from a Forge `FullContext`-like value. */
export function readViewTarget(context: unknown): ViewTarget {
  const c = rec(context);
  const ext = rec(c["extension"]);
  // A bridge Modal passes our `context` object through as `extension.modal` (SPIKE-C2).
  const modal = rec(ext["modal"]);
  const inModal = Object.keys(modal).length > 0;
  const projectKey = str(modal["projectKey"]) ?? str(rec(ext["project"])["key"]);
  const issueKey = str(modal["issueKey"]) ?? str(rec(ext["issue"])["key"]);
  const rawMode = str(modal["mode"]);
  const mode: IntakeMode | undefined = rawMode === "create" || rawMode === "attach" ? rawMode : issueKey !== undefined ? "attach" : projectKey !== undefined ? "create" : undefined;
  const moduleKey = str(c["moduleKey"]);
  return {
    inModal,
    ...(projectKey !== undefined ? { projectKey } : {}),
    ...(issueKey !== undefined ? { issueKey } : {}),
    ...(mode !== undefined ? { mode } : {}),
    ...(moduleKey !== undefined ? { moduleKey } : {}),
  };
}

/** The context object the board / panel pass to the intake `Modal`. */
export interface IntakeModalContext {
  readonly mode: IntakeMode;
  readonly projectKey?: string;
  readonly issueKey?: string;
}
