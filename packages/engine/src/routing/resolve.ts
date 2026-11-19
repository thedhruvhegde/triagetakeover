/**
 * Owner resolution with injected data sources (ARCHITECTURE §5.11, §11; PRD US-15 AC2–AC4).
 *
 * The chain is: Teamwork Graph team (as the user) -> component lead -> project role actors
 * -> none. The engine never does I/O itself: the service injects the lookups (TwgPort and
 * JiraPort adapters, or fakes in tests). Later hops are only called when earlier ones fail.
 * Every result names the rule, the source used, the TWG status and the evidence of each hop.
 */
import { evaluateRules, type RoutingRule, type RoutingSubject, type TeamRef } from "./rules.js";

/** TwgPort classification (§11). */
export type TwgLookupStatus = "ok" | "empty" | "not-permitted" | "error";

export interface TwgTeamLookup {
  readonly status: TwgLookupStatus;
  readonly teamName?: string;
  /** Member accountIds, first page only (§11). Shown in the UI only, never through actions (D8). */
  readonly memberAccountIds?: readonly string[];
  /** Error text, e.g. "User is not permitted to query this organization". */
  readonly message?: string;
}

export interface ComponentLookup {
  readonly name: string;
  readonly leadAccountId?: string;
}

export interface ProjectRoleLookup {
  readonly name: string;
  readonly actorAccountIds: readonly string[];
}

type MaybePromise<T> = T | Promise<T>;

/** Injected data sources. A missing `twgTeam` means TWG is unavailable (skipped). */
export interface RoutingSources {
  readonly twgTeam?: (teamAri: string) => MaybePromise<TwgTeamLookup>;
  /** Returns null when the component does not exist. */
  readonly component: (componentId: string) => MaybePromise<ComponentLookup | null>;
  /** Returns null when the role does not exist. */
  readonly projectRole: (roleId: string) => MaybePromise<ProjectRoleLookup | null>;
}

export interface RouteOptions {
  /** Project role used when the matched rule names none (e.g. the project's Administrators role id). */
  readonly fallbackProjectRoleId?: string;
  /** Staging-only "Simulate TWG error" toggle (§11): TWG is not called and reports `error`. */
  readonly simulateTwgError?: boolean;
}

export type RouteSource = "twg" | "component" | "project-role" | "none";
/** Action-level TWG status (§10.3): `not-permitted` is reported as `error`. */
export type TwgStatus = "ok" | "empty" | "error" | "skipped";

export type HopOutcome = "used" | "empty" | "not-permitted" | "error" | "unavailable" | "not-found" | "no-lead" | "no-actors";

export interface RouteEvidence {
  readonly step: Exclude<RouteSource, "none">;
  readonly ref: string;
  readonly outcome: HopOutcome;
  /** Plain-language sentence for the UI. */
  readonly detail: string;
}

export interface RouteSuggestion {
  /** The matching rule; index -1 when no rule matched. */
  readonly rule: { readonly index: number; readonly text: string };
  readonly source: RouteSource;
  readonly team?: { readonly name: string; readonly ref: string; readonly source: Exclude<RouteSource, "none"> };
  readonly contact?: { readonly accountId: string; readonly source: Exclude<RouteSource, "none"> };
  /** TWG members (UI only; actions must drop this, D8). */
  readonly members?: readonly string[];
  readonly twgStatus: TwgStatus;
  readonly evidence: readonly RouteEvidence[];
  /** Why the primary source was not used, when a hop failed before the one used. */
  readonly fallbackReason?: string;
}

type Hop = { readonly evidence: RouteEvidence; readonly found?: Omit<RouteSuggestion, "rule" | "twgStatus" | "evidence" | "fallbackReason"> };

/** Runs a lookup and turns a throw into an error message. */
async function attempt<T>(f: () => MaybePromise<T>): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

function twgOutcome(r: TwgTeamLookup): HopOutcome {
  if (r.status === "ok") return (r.memberAccountIds?.length ?? 0) > 0 ? "used" : "empty";
  return r.status;
}

async function twgHop(teamAri: string, team: TeamRef, sources: RoutingSources, opts: RouteOptions): Promise<Hop> {
  const ev = (outcome: HopOutcome, detail: string): RouteEvidence => ({ step: "twg", ref: teamAri, outcome, detail });
  if (opts.simulateTwgError === true) return { evidence: ev("error", "TWG error (simulated)") };
  const lookup = sources.twgTeam;
  if (lookup === undefined) return { evidence: ev("unavailable", "TWG unavailable") };
  const r = await attempt(() => lookup(teamAri));
  if (!r.ok) return { evidence: ev("error", `TWG error: ${r.message}`) };
  const outcome = twgOutcome(r.value);
  if (outcome !== "used") {
    const msg = r.value.message !== undefined ? `: ${r.value.message}` : "";
    const detail =
      outcome === "empty" ? "TWG returned no team members (possibly a missing scope or no data)" : outcome === "not-permitted" ? `TWG not permitted${msg}` : `TWG error${msg}`;
    return { evidence: ev(outcome, detail) };
  }
  const members = r.value.memberAccountIds ?? [];
  const name = r.value.teamName ?? team.label ?? teamAri;
  const found = {
    source: "twg" as const,
    team: { name, ref: teamAri, source: "twg" as const },
    ...(members[0] !== undefined ? { contact: { accountId: members[0], source: "twg" as const } } : {}),
    members,
  };
  return { evidence: ev("used", `Atlassian Team "${name}" (Teamwork Graph)`), found };
}

async function componentHop(componentId: string, sources: RoutingSources): Promise<Hop> {
  const ev = (outcome: HopOutcome, detail: string): RouteEvidence => ({ step: "component", ref: componentId, outcome, detail });
  const r = await attempt(() => sources.component(componentId));
  if (!r.ok) return { evidence: ev("error", `component ${componentId} lookup failed: ${r.message}`) };
  if (r.value === null) return { evidence: ev("not-found", `component ${componentId} not found`) };
  const { name, leadAccountId } = r.value;
  if (leadAccountId === undefined) return { evidence: ev("no-lead", `component ${name} has no lead`) };
  return {
    evidence: ev("used", `lead of component ${name}`),
    found: { source: "component", team: { name, ref: componentId, source: "component" }, contact: { accountId: leadAccountId, source: "component" } },
  };
}

async function roleHop(roleId: string, sources: RoutingSources): Promise<Hop> {
  const ev = (outcome: HopOutcome, detail: string): RouteEvidence => ({ step: "project-role", ref: roleId, outcome, detail });
  const r = await attempt(() => sources.projectRole(roleId));
  if (!r.ok) return { evidence: ev("error", `project role ${roleId} lookup failed: ${r.message}`) };
  if (r.value === null) return { evidence: ev("not-found", `project role ${roleId} not found`) };
  const { name, actorAccountIds } = r.value;
  const first = actorAccountIds[0];
  if (first === undefined) return { evidence: ev("no-actors", `project role ${name} has no actors`) };
  return {
    evidence: ev("used", `actor of project role ${name}`),
    found: { source: "project-role", team: { name, ref: roleId, source: "project-role" }, contact: { accountId: first, source: "project-role" } },
  };
}

/** Maps the TWG hop outcome to the action-level status. */
function toTwgStatus(hop: Hop | undefined): TwgStatus {
  if (hop === undefined || hop.evidence.outcome === "unavailable") return "skipped";
  const o = hop.evidence.outcome;
  return o === "used" ? "ok" : o === "empty" ? "empty" : "error";
}

/**
 * Suggests the owner of a subject: evaluates the rules, then walks the fallback chain of
 * the matching rule's team ref until a hop yields a contact.
 */
export async function suggestRoute(rules: readonly RoutingRule[], subject: RoutingSubject, sources: RoutingSources, opts: RouteOptions = {}): Promise<RouteSuggestion> {
  const evaluation = evaluateRules(rules, subject);
  if (evaluation === null) {
    return { rule: { index: -1, text: "no routing rule matched" }, source: "none", twgStatus: "skipped", evidence: [], fallbackReason: "no routing rule matched" };
  }
  const team = evaluation.teamRef;
  const rule = { index: evaluation.ruleIndex, text: evaluation.ruleText };
  const hops: Hop[] = [];
  let twg: Hop | undefined;
  const steps: (() => Promise<Hop>)[] = [];
  if (team.teamAri !== undefined) {
    const ari = team.teamAri;
    steps.push(async () => (twg = await twgHop(ari, team, sources, opts)));
  }
  if (team.componentId !== undefined) {
    const id = team.componentId;
    steps.push(() => componentHop(id, sources));
  }
  const roleId = team.projectRoleId ?? opts.fallbackProjectRoleId;
  if (roleId !== undefined) steps.push(() => roleHop(roleId, sources));

  for (const step of steps) {
    const hop = await step();
    hops.push(hop);
    if (hop.found !== undefined) break;
  }
  const evidence = hops.map((h) => h.evidence);
  const used = hops.find((h) => h.found !== undefined);
  const failed = evidence.filter((e) => e.outcome !== "used").map((e) => e.detail);
  const base = { rule, twgStatus: toTwgStatus(twg), evidence };
  const reason = failed.length > 0 ? { fallbackReason: failed.join("; ") } : {};
  if (used?.found === undefined) return { ...base, source: "none", fallbackReason: failed.length > 0 ? failed.join("; ") : "rule has no resolvable target" };
  return { ...base, ...used.found, ...reason };
}
