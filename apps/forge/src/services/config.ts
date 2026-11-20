/**
 * Project and global configuration (KVS `config:<projectKey>`, `config:global`; §7.4).
 *
 * Stored values are untrusted JSON: every load re-validates and falls back to defaults field
 * by field, reporting what was ignored. A missing config means "defaults": the app then works
 * on any issue that carries a `tt.event` property (PRD US-02 AC1).
 */
import {
  DEFAULT_CHIP_THRESHOLDS,
  DEFAULT_CLUSTER_PARAMS,
  DEFAULT_RULE_THRESHOLDS,
  DEFAULT_TAU,
  DEFAULT_K,
  PARAMS_VERSION,
  compareSemver,
  isRecord,
  parseRoutingRules,
  type ChipThresholds,
  type ClusterParams,
  type RoutingRule,
  type RuleThresholds,
} from "@tt/engine";
import type { ApiErrorDetail, ProjectConfigView, RoutingRuleInput } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { KvsKeys, type StoragePort } from "../ports/storage";
import { BUILD_PATTERN, PROJECT_KEY_PATTERN, sanitizeText } from "../validation/inputs";
import { requireProjectAdmin, userPort } from "./auth";
import { done, fail, fromPortError, type ServiceResult } from "./errors";

export interface ProjectConfig {
  readonly v: 1;
  readonly projectKey: string;
  readonly enabled: boolean;
  readonly eventIssueType: string;
  readonly clusterIssueType: string;
  readonly scenarioIssueType: string;
  /** Extra JQL that selects event issues for Re-sync; "" = the default selector (§7.5). */
  readonly eventJql: string;
  /** "" = the engine default candidates (`labels = tt-scenario`, then `issuetype = Test`). */
  readonly scenarioJql: string;
  readonly tau: number;
  readonly k: number;
  /** Preferred link type name; falls back to "Relates" when missing on the site (§15 #17). */
  readonly linkType: string;
  /** `component`, or a custom field id such as the Team field (SPIKE-R2). */
  readonly routeField: string;
  readonly routing: readonly RoutingRule[];
  readonly buildOrder: "semver" | readonly string[];
  readonly calibrationWindowDays: number;
  /** Project role used when the matching rule names none; "" = the project's Administrators role. */
  readonly fallbackProjectRoleId: string;
  /** Staging-only (§11). */
  readonly simulateTwgError: boolean;
  readonly ruleThresholds: RuleThresholds;
  readonly chipThresholds: ChipThresholds;
  readonly params: string;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export interface GlobalConfig {
  readonly v: 1;
  readonly projects: readonly string[];
  readonly demoProjectKey?: string;
}

export const DEFAULT_LINK_TYPE = "Duplicate";
export const FALLBACK_LINK_TYPE = "Relates";

export function defaultProjectConfig(projectKey: string): ProjectConfig {
  return {
    v: 1,
    projectKey,
    enabled: true,
    eventIssueType: "Task",
    clusterIssueType: "Task",
    scenarioIssueType: "Task",
    eventJql: "",
    scenarioJql: "",
    tau: DEFAULT_TAU,
    k: DEFAULT_K,
    linkType: DEFAULT_LINK_TYPE,
    routeField: "component",
    routing: [],
    buildOrder: "semver",
    calibrationWindowDays: 30,
    fallbackProjectRoleId: "",
    simulateTwgError: false,
    ruleThresholds: DEFAULT_RULE_THRESHOLDS,
    chipThresholds: DEFAULT_CHIP_THRESHOLDS,
    params: PARAMS_VERSION,
    updatedAt: null,
    updatedBy: null,
  };
}

// ------------------------------------------------------------------ field validators

type Checked<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
type Check<T> = (u: unknown) => Checked<T>;

const yes = <T>(value: T): Checked<T> => ({ ok: true, value });
const no = <T>(message: string): Checked<T> => ({ ok: false, message });

const ISSUE_TYPE_RE = /^[^\r\n]{1,60}$/;
const ROUTE_FIELD_RE = /^(component|customfield_\d{1,9})$/;
const ROLE_ID_RE = /^\d{0,18}$/;
const LINK_TYPE_RE = /^[^\r\n]{1,60}$/;

const text = (re: RegExp, what: string): Check<string> => (u) => (typeof u === "string" && re.test(u.trim()) ? yes(u.trim()) : no(`${what} is not valid`));
const jql: Check<string> = (u) => (typeof u === "string" && u.length <= 2000 && !/[\r\n]/.test(u) ? yes(u.trim()) : no("JQL must be one line of at most 2000 characters"));
const boolean: Check<boolean> = (u) => (typeof u === "boolean" ? yes(u) : no("expected true or false"));
const range = (min: number, max: number, integer = false): Check<number> => (u) =>
  typeof u === "number" && Number.isFinite(u) && u >= min && u <= max && (!integer || Number.isInteger(u)) ? yes(u) : no(`expected ${integer ? "an integer" : "a number"} in [${min}, ${max}]`);
const buildOrder: Check<"semver" | readonly string[]> = (u) => {
  if (u === "semver") return yes("semver");
  if (Array.isArray(u) && u.length <= 200 && u.every((b) => typeof b === "string" && BUILD_PATTERN.test(b))) return yes([...new Set(u as string[])]);
  return no('expected "semver" or a list of builds');
};

function thresholds<T extends object>(defaults: T): Check<T> {
  return (u) => {
    if (!isRecord(u)) return no("expected an object of numbers");
    const out: Record<string, number> = { ...(defaults as Record<string, number>) };
    for (const [k, v] of Object.entries(u)) {
      if (!(k in out)) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e6) return no(`${k} must be a non-negative number`);
      out[k] = v;
    }
    return yes(out as T);
  };
}

const routing: Check<readonly RoutingRule[]> = (u) => {
  const r = parseRoutingRules(u);
  return r.ok ? yes(r.value) : no(r.error.map((e) => `${e.path ?? ""}: ${e.message}`).join("; "));
};

const FIELDS: { readonly [K in keyof ProjectConfig]?: Check<ProjectConfig[K]> } = {
  enabled: boolean,
  eventIssueType: text(ISSUE_TYPE_RE, "issue type"),
  clusterIssueType: text(ISSUE_TYPE_RE, "issue type"),
  scenarioIssueType: text(ISSUE_TYPE_RE, "issue type"),
  eventJql: jql,
  scenarioJql: jql,
  tau: range(0.05, 10),
  k: range(1, 15, true),
  linkType: text(LINK_TYPE_RE, "link type"),
  routeField: text(ROUTE_FIELD_RE, "route field"),
  routing,
  buildOrder,
  calibrationWindowDays: range(1, 3650, true),
  fallbackProjectRoleId: text(ROLE_ID_RE, "project role id"),
  simulateTwgError: boolean,
  ruleThresholds: thresholds(DEFAULT_RULE_THRESHOLDS),
  chipThresholds: thresholds(DEFAULT_CHIP_THRESHOLDS),
};

/** Applies `patch` onto `base`, validating each field. Unknown fields are ignored. */
export function applyConfigPatch(base: ProjectConfig, patch: unknown): { config: ProjectConfig; problems: ApiErrorDetail[] } {
  const problems: ApiErrorDetail[] = [];
  if (!isRecord(patch)) return { config: base, problems: [{ message: "config must be an object" }] };
  const next: Record<string, unknown> = { ...base };
  for (const [key, check] of Object.entries(FIELDS) as [keyof ProjectConfig, Check<unknown>][]) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const v = check(patch[key]);
    if (v.ok) next[key] = v.value;
    else problems.push({ path: key, message: v.message });
  }
  return { config: next as unknown as ProjectConfig, problems };
}

/** Validates a stored config value; invalid fields fall back to defaults (reported). */
export function parseStoredConfig(projectKey: string, u: unknown): { config: ProjectConfig; ignored: string[] } {
  const base = defaultProjectConfig(projectKey);
  if (u === undefined) return { config: base, ignored: [] };
  const { config, problems } = applyConfigPatch(base, u);
  const r = isRecord(u) ? u : {};
  const meta = {
    updatedAt: typeof r["updatedAt"] === "string" ? r["updatedAt"] : null,
    updatedBy: typeof r["updatedBy"] === "string" ? r["updatedBy"] : null,
  };
  return { config: { ...config, ...meta, projectKey, v: 1, params: PARAMS_VERSION }, ignored: problems.map((p) => p.path ?? "(config)") };
}

export async function loadProjectConfig(storage: StoragePort, projectKey: string): Promise<{ config: ProjectConfig; warnings: string[] }> {
  const r = await storage.get(KvsKeys.config(projectKey));
  if (!r.ok) return { config: defaultProjectConfig(projectKey), warnings: ["Project settings could not be read; defaults are used."] };
  const { config, ignored } = parseStoredConfig(projectKey, r.value);
  return { config, warnings: ignored.length > 0 ? [`Ignored invalid settings: ${ignored.join(", ")}`] : [] };
}

export async function loadGlobalConfig(storage: StoragePort): Promise<GlobalConfig> {
  const r = await storage.get(KvsKeys.configGlobal());
  const u = r.ok ? r.value : undefined;
  if (!isRecord(u)) return { v: 1, projects: [] };
  const projects = Array.isArray(u["projects"]) ? (u["projects"] as unknown[]).filter((p): p is string => typeof p === "string" && PROJECT_KEY_PATTERN.test(p)) : [];
  const demo = typeof u["demoProjectKey"] === "string" && PROJECT_KEY_PATTERN.test(u["demoProjectKey"]) ? u["demoProjectKey"] : undefined;
  return { v: 1, projects: [...new Set(projects)].sort(), ...(demo !== undefined ? { demoProjectKey: demo } : {}) };
}

export function clusterParamsOf(config: ProjectConfig): ClusterParams {
  return { ...DEFAULT_CLUSTER_PARAMS, tau: config.tau, k: config.k };
}

/** Build ordering: semver by default, or the configured registry order (unknown builds last, semver). */
export function buildComparator(config: ProjectConfig): (a: string, b: string) => number {
  if (config.buildOrder === "semver") return compareSemver;
  const order = config.buildOrder;
  return (a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return compareSemver(a, b);
  };
}

function ruleInput(r: RoutingRule): RoutingRuleInput {
  return { match: { ...r.match }, team: { ...r.team } };
}

export function configView(c: ProjectConfig): ProjectConfigView {
  return {
    projectKey: c.projectKey,
    enabled: c.enabled,
    eventIssueType: c.eventIssueType,
    clusterIssueType: c.clusterIssueType,
    scenarioIssueType: c.scenarioIssueType,
    eventJql: c.eventJql,
    scenarioJql: c.scenarioJql,
    tau: c.tau,
    k: c.k,
    linkType: c.linkType,
    routeField: c.routeField,
    routing: c.routing.map(ruleInput),
    buildOrder: c.buildOrder,
    calibrationWindowDays: c.calibrationWindowDays,
    fallbackProjectRoleId: c.fallbackProjectRoleId,
    simulateTwgError: c.simulateTwgError,
    ruleThresholds: { ...c.ruleThresholds },
    chipThresholds: { ...c.chipThresholds },
    params: c.params,
    updatedAt: c.updatedAt,
    updatedBy: c.updatedBy,
  };
}

/**
 * Saves a config patch (admin only). Issue types must exist in the project and the link type
 * on the site, so a typo fails here rather than at the first Accept.
 */
export async function saveProjectConfig(ctx: ServiceContext, projectKey: string, patch: unknown): Promise<ServiceResult<ProjectConfigView>> {
  const admin = await requireProjectAdmin(ctx, projectKey);
  if (!admin.ok) return admin;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { config: current } = await loadProjectConfig(ctx.ports.storage, projectKey);
  const { config, problems } = applyConfigPatch(current, patch);
  const project = await jira.value.getProject(projectKey);
  if (!project.ok) return fromPortError(project.error, "Reading the project");
  const types = project.value.issueTypes.map((t) => t.name.toLowerCase());
  for (const f of ["eventIssueType", "clusterIssueType", "scenarioIssueType"] as const) {
    if (!types.includes(config[f].toLowerCase())) problems.push({ path: f, message: `issue type "${config[f]}" does not exist in ${projectKey}` });
  }
  const linkTypes = await jira.value.getIssueLinkTypes();
  if (linkTypes.ok && !linkTypes.value.some((t) => t.name.toLowerCase() === config.linkType.toLowerCase())) {
    problems.push({ path: "linkType", message: `link type "${sanitizeText(config.linkType, 60)}" does not exist on this site` });
  }
  if (problems.length > 0) return fail("invalid-input", "Some settings are not valid.", problems);
  const saved: ProjectConfig = { ...config, updatedAt: ctx.ports.clock.nowIso(), updatedBy: ctx.accountId ?? null };
  const w = await ctx.ports.storage.set(KvsKeys.config(projectKey), saved);
  if (!w.ok) return fromPortError(w.error, "Saving settings");
  const global = await loadGlobalConfig(ctx.ports.storage);
  if (!global.projects.includes(projectKey)) {
    await ctx.ports.storage.set(KvsKeys.configGlobal(), { ...global, projects: [...global.projects, projectKey].sort() });
  }
  await ctx.ports.storage.delete(KvsKeys.board(projectKey));
  return done(configView(saved));
}

