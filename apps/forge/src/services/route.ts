/**
 * Routing (PRD US-15, ARCHITECTURE §5.11, §11): the first matching admin rule names a team
 * ref, which is resolved to people through the Teamwork Graph (as the user) and, when TWG is
 * unavailable, errors or is empty, the component lead and then project-role actors. The
 * result always says which rule matched and which source was used.
 *
 * TWG is called only here (resolvers/actions with a user), never in consumers (§8). An empty
 * TWG answer is reported as "possibly a missing scope or no data" (missing scopes fail
 * silently). A failure trips a per-invocation breaker and a 10-minute `diag:twg` KVS status so
 * repeated calls are skipped.
 */
import {
  TAKEOVER_TYPES,
  evaluateRules,
  isRecord,
  suggestRoute,
  type Result,
  type RouteSuggestion,
  type RoutingRule,
  type RoutingSources,
  type RoutingSubject,
  type TakeoverType,
  type TwgTeamLookup,
} from "@tt/engine";
import type { RouteView, TriageActionResult, TwgStatusName } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import type { JiraIssue, JiraUserPort } from "../ports/jira";
import { PROPERTY_KEYS } from "../ports/properties";
import { KvsKeys, KVS_TTL_SECONDS } from "../ports/storage";
import { TWG_MEMBERS_FIRST } from "../ports/twg";
import { readIssueAsUser, requireAccount, requireBrowse, userPort } from "./auth";
import { loadProjectConfig, type ProjectConfig } from "./config";
import { done, fail, fromPortError, type ServiceError, type ServiceResult } from "./errors";
import { confidence, issueEvidence, ruleEvidence } from "./evidence";
import { invalidateBoard } from "./index-store";
import { clusterPropOf, isClusterIssue } from "./jira-io";
import { pushUndo, type UndoRecord } from "./undo";

export const TWG_EMPTY_TEXT = "possibly a missing scope or no data";
const BREAKER = "twg:breaker";

const SOURCE_LABEL: Readonly<Record<RouteSuggestion["source"], string>> = {
  twg: "Atlassian Team (Teamwork Graph)",
  component: "component lead",
  "project-role": "project role actors",
  none: "no source resolved",
};

interface TwgDiag {
  readonly status: string;
  readonly message: string;
  readonly at: string;
}

async function twgRecentlyFailed(ctx: ServiceContext): Promise<TwgDiag | null> {
  if (ctx.memo.has(BREAKER)) return ctx.memo.get(BREAKER) as TwgDiag;
  const r = await ctx.ports.storage.get(KvsKeys.diagTwg());
  if (!r.ok || !isRecord(r.value)) return null;
  const v = r.value;
  return v["status"] === "error" || v["status"] === "not-permitted" ? { status: String(v["status"]), message: String(v["message"] ?? ""), at: String(v["at"] ?? "") } : null;
}

async function tripBreaker(ctx: ServiceContext, status: "error" | "not-permitted", message: string): Promise<void> {
  const d: TwgDiag = { status, message, at: ctx.ports.clock.nowIso() };
  ctx.memo.set(BREAKER, d);
  await ctx.ports.storage.set(KvsKeys.diagTwg(), d, { ttlSeconds: KVS_TTL_SECONDS.diagTwg });
}

/** TWG source for the engine, or undefined (skipped) with the reason. */
async function twgSource(ctx: ServiceContext): Promise<{ source?: RoutingSources["twgTeam"]; skipped?: string }> {
  const twg = ctx.ports.twg;
  if (twg === undefined) return { skipped: "TWG is not available in this context" };
  const recent = await twgRecentlyFailed(ctx);
  if (recent !== null) return { skipped: `TWG skipped: it failed recently (${recent.status}${recent.message !== "" ? `: ${recent.message}` : ""}); retried after 10 minutes` };
  return {
    source: async (teamAri: string): Promise<TwgTeamLookup> => {
      const o = await twg.teamMembers(teamAri, { first: TWG_MEMBERS_FIRST });
      switch (o.status) {
        case "ok":
          // The adapter uses the ARI as the name when TWG returns no display name; then let the
          // engine fall back to the admin's rule label (engine: teamName ?? label ?? ari).
          return o.value.team.name === "" || o.value.team.name.startsWith("ari:")
            ? { status: "ok", memberAccountIds: o.value.memberAccountIds }
            : { status: "ok", teamName: o.value.team.name, memberAccountIds: o.value.memberAccountIds };
        case "empty":
          return { status: "empty", message: TWG_EMPTY_TEXT };
        case "not-permitted":
          await tripBreaker(ctx, "not-permitted", o.message);
          return { status: "not-permitted", message: o.message };
        case "error":
          await tripBreaker(ctx, "error", o.message);
          return { status: "error", message: o.message };
      }
    },
  };
}

function jiraSources(jira: JiraUserPort, projectKey: string): Omit<RoutingSources, "twgTeam"> {
  return {
    component: async (id) => {
      const r = await jira.getComponent(id);
      if (r.ok) return { name: r.value.name, ...(r.value.leadAccountId !== undefined ? { leadAccountId: r.value.leadAccountId } : {}) };
      if (r.error.kind === "not-found") return null;
      throw new Error(r.error.message);
    },
    projectRole: async (roleId) => {
      const r = await jira.getProjectRole(projectKey, roleId);
      if (r.ok) return { name: r.value.name, actorAccountIds: r.value.actorAccountIds };
      if (r.error.kind === "not-found") return null;
      throw new Error(r.error.message);
    },
  };
}

/** Rules to evaluate: the configured ones, or a default "project administrators" rule. */
async function effectiveRules(jira: JiraUserPort, config: ProjectConfig): Promise<{ rules: readonly RoutingRule[]; fallbackRoleId?: string; defaulted: boolean }> {
  let fallbackRoleId = config.fallbackProjectRoleId !== "" ? config.fallbackProjectRoleId : undefined;
  if (fallbackRoleId === undefined) {
    const roles = await jira.getProjectRoles(config.projectKey);
    if (roles.ok) fallbackRoleId = roles.value.find((r) => r.name.toLowerCase() === "administrators")?.id;
  }
  if (config.routing.length > 0) return { rules: config.routing, ...(fallbackRoleId !== undefined ? { fallbackRoleId } : {}), defaulted: false };
  if (fallbackRoleId === undefined) return { rules: [], defaulted: true };
  return { rules: [{ match: {}, team: { projectRoleId: fallbackRoleId, label: "project administrators (no routing rules configured)" } }], fallbackRoleId, defaulted: true };
}

function subjectOf(cluster: JiraIssue, bucket: string): RoutingSubject {
  const [type, variant] = bucket.split("|");
  const t = (TAKEOVER_TYPES as readonly string[]).includes(type ?? "") ? (type as TakeoverType) : "unknown";
  return { type: t, variant: variant ?? "", components: cluster.components.flatMap((c) => [c.name, c.id]) };
}

async function clusterBucket(ctx: ServiceContext, cluster: JiraIssue): Promise<string | null> {
  const prop = clusterPropOf(cluster);
  if (prop !== null) return prop.bucket;
  const row = await ctx.ports.storage.getEntity("cluster", cluster.id);
  return row.ok && row.value !== undefined ? row.value.bucket : null;
}

export interface SuggestOptions {
  /** Members are for the UI only; actions/MCP must pass false (D8). */
  readonly includeMembers: boolean;
}

/** The owner suggestion for a cluster (US-15). */
export async function suggestOwner(ctx: ServiceContext, clusterKey: string, opts: SuggestOptions = { includeMembers: true }): Promise<ServiceResult<RouteView>> {
  const read = await readIssueAsUser(ctx, clusterKey, { properties: [PROPERTY_KEYS.cluster] });
  if (!read.ok) return read;
  const cluster = read.value;
  const browse = await requireBrowse(ctx, cluster.projectKey);
  if (!browse.ok) return browse;
  if (!isClusterIssue(cluster)) return fail("invalid-input", `${clusterKey} is not a Takeover Triage cluster issue.`);
  const bucket = await clusterBucket(ctx, cluster);
  if (bucket === null) return fail("invalid-input", `${clusterKey} has no cluster metadata (tt.cluster); run Re-sync.`);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { config, warnings } = await loadProjectConfig(ctx.ports.storage, cluster.projectKey);
  const { rules, fallbackRoleId, defaulted } = await effectiveRules(jira.value, config);
  const twg = await twgSource(ctx);
  const sources: RoutingSources = { ...jiraSources(jira.value, cluster.projectKey), ...(twg.source !== undefined ? { twgTeam: twg.source } : {}) };
  const s = await suggestRoute(rules, subjectOf(cluster, bucket), sources, { ...(fallbackRoleId !== undefined ? { fallbackProjectRoleId: fallbackRoleId } : {}), simulateTwgError: config.simulateTwgError });
  const ids = [...new Set([...(s.contact !== undefined ? [s.contact.accountId] : []), ...(opts.includeMembers ? (s.members ?? []) : [])])];
  const users = ids.length > 0 ? await jira.value.getUsers(ids) : undefined;
  const nameOf = (id: string): string | undefined => (users?.ok === true ? users.value.find((u) => u.accountId === id)?.displayName : undefined);
  const why: string[] = [];
  if (s.rule.index >= 0) why.push(`Rule #${s.rule.index + 1} (${s.rule.text}) matched`);
  else why.push(rules.length === 0 ? "No routing rules are configured and the project has no Administrators role" : "No routing rule matched");
  if (defaulted && rules.length > 0) why.push("No routing rules are configured: the default routes to the project administrators");
  why.push(`Owner from ${SOURCE_LABEL[s.source]}`);
  for (const h of s.evidence) if (h.outcome !== "used") why.push(h.detail);
  if (twg.skipped !== undefined && rules.some((r) => r.team.teamAri !== undefined)) why.push(twg.skipped);
  if (config.simulateTwgError) why.push("TWG error is SIMULATED (staging setting)");
  const firstUsed = s.evidence[0]?.outcome === "used";
  const conf = confidence(
    s.source === "none" ? 0 : firstUsed ? 1 : 0.5,
    "1 = the matching rule's first target resolved to a person; 0.5 = resolved through a fallback hop; 0 = nobody resolved. Routing is rule-based, not learned.",
  );
  const team = s.team;
  const ruleTeam = s.rule.index >= 0 ? rules[s.rule.index]?.team : undefined;
  const componentId = s.source === "component" ? team?.ref : ruleTeam?.componentId;
  const fieldId = config.routeField !== "component" && ruleTeam?.teamAri !== undefined ? config.routeField : undefined;
  const view: RouteView = {
    clusterKey,
    rule: s.rule,
    source: s.source,
    ...(team !== undefined ? { team } : {}),
    ...(s.contact !== undefined ? { contact: { ...s.contact, ...(nameOf(s.contact.accountId) !== undefined ? { displayName: nameOf(s.contact.accountId) as string } : {}) } } : {}),
    ...(opts.includeMembers && s.members !== undefined ? { members: s.members.map((id) => ({ accountId: id, ...(nameOf(id) !== undefined ? { displayName: nameOf(id) as string } : {}) })) } : {}),
    twgStatus: (twg.skipped !== undefined && s.twgStatus === "skipped" ? "skipped" : s.twgStatus) as TwgStatusName,
    hops: s.evidence.map((h) => ({ step: h.step, ref: h.ref, outcome: h.outcome, detail: h.detail })),
    ...(s.fallbackReason !== undefined ? { fallbackReason: s.fallbackReason } : {}),
    why,
    confidence: conf,
    evidence: [issueEvidence(clusterKey, "Cluster", cluster.id), ruleEvidence(s.rule.index >= 0 ? `Routing rule #${s.rule.index + 1}: ${s.rule.text}` : s.rule.text)],
    ...(componentId !== undefined || fieldId !== undefined ? { applies: { ...(componentId !== undefined ? { componentId } : {}), ...(fieldId !== undefined ? { fieldId } : {}) } } : {}),
  };
  return done(view, warnings);
}

/** Pure rule evaluation for board rows (no people lookups, no network). */
export function ownerHint(config: ProjectConfig, bucket: string, components: readonly string[] = []): { ruleIndex: number; ruleText: string; team: string } | null {
  const [type, variant] = bucket.split("|");
  const t = (TAKEOVER_TYPES as readonly string[]).includes(type ?? "") ? (type as TakeoverType) : "unknown";
  const e = evaluateRules(config.routing, { type: t, variant: variant ?? "", components });
  if (e === null) return null;
  return { ruleIndex: e.ruleIndex, ruleText: e.ruleText, team: e.teamRef.label ?? e.ruleText.split(" -> ")[1] ?? "" };
}

/**
 * Route (US-11 AC3): on confirm, sets the component (or the configured Team field, SPIKE-R2,
 * falling back to the component) on the cluster issue and adds a comment that mentions the
 * suggested contact. The mention is written as `[~accountid:<id>]`; the Forge adapter turns
 * it into an ADF mention node.
 */
export async function applyRoute(ctx: ServiceContext, issueKey: string, clusterKey: string): Promise<ServiceResult<TriageActionResult>> {
  const by = requireAccount(ctx);
  if (!by.ok) return by;
  const panelIssue = await readIssueAsUser(ctx, issueKey);
  if (!panelIssue.ok) return panelIssue;
  const s = await suggestOwner(ctx, clusterKey, { includeMembers: false });
  if (!s.ok) return s;
  const route = s.value.value;
  const warnings = [...s.value.warnings];
  if (route.source === "none" && route.applies === undefined) return fail("not-configured", `No owner could be resolved for ${clusterKey}: ${route.fallbackReason ?? "no rule matched"}. Configure routing rules on the admin page.`);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const fieldId = route.applies?.fieldId;
  const cluster = await jira.value.getIssue(clusterKey, fieldId !== undefined ? { extraFields: [fieldId] } : {});
  if (!cluster.ok) return fromPortError(cluster.error, `Reading ${clusterKey}`);
  const prevComponentIds = cluster.value.components.map((c) => c.id);
  const written: string[] = [];
  let fieldWritten = false;
  if (fieldId !== undefined && route.team?.source === "twg") {
    const f = await jira.value.updateIssue(cluster.value.id, { fields: { [fieldId]: route.team.ref } });
    if (f.ok) {
      fieldWritten = true;
      written.push(`set ${fieldId} to team ${route.team.name}`);
    } else warnings.push(`The team field ${fieldId} could not be set (SPIKE-R2); the component and a comment are used instead.`);
  }
  const componentId = route.applies?.componentId;
  if (!fieldWritten && componentId !== undefined && !prevComponentIds.includes(componentId)) {
    const c = await jira.value.updateIssue(cluster.value.id, { componentIds: [...prevComponentIds, componentId] });
    if (!c.ok) return fromPortError(c.error, "Setting the component");
    written.push(`added component ${route.team?.source === "component" ? route.team.name : componentId}`);
  }
  const contact = route.contact;
  const lines = [
    `Takeover Triage routing suggestion: ${route.team?.name ?? "no team"} (source: ${SOURCE_LABEL[route.source]}; ${route.rule.index >= 0 ? `rule #${route.rule.index + 1}: ${route.rule.text}` : route.rule.text}).`,
    ...(contact !== undefined ? [`Suggested contact: [~accountid:${contact.accountId}]`] : []),
    `Routed by [~accountid:${by.value}] from the Takeover signature panel of ${issueKey}.`,
  ];
  const comment = await jira.value.addComment(cluster.value.id, lines.join("\n"));
  if (comment.ok) written.push("added a routing comment");
  else warnings.push("The routing comment could not be added.");
  if (written.length === 0) return fail("conflict", `${clusterKey} already has that component; nothing was changed.`);
  const summary = `Routed ${clusterKey}: ${written.join(", ")}.`;
  const rec: UndoRecord = {
    action: "route",
    by: by.value,
    at: ctx.ports.clock.nowIso(),
    clusterId: cluster.value.id,
    clusterKey,
    prevComponentIds,
    ...(fieldWritten && fieldId !== undefined ? { fieldId, prevFieldValue: cluster.value.fields?.[fieldId] ?? null } : {}),
    summary,
  };
  await pushUndo(ctx.ports.storage, issueKey, rec);
  await invalidateBoard(ctx.ports.storage, cluster.value.projectKey);
  return done(
    { action: "route", summary, created: true, alreadyDone: false, proposedMembers: [], undoAvailable: true, evidence: [...route.evidence, issueEvidence(issueKey, "Routed from")] },
    warnings,
  );
}

/** Reverts a Route: restores the component list / field. The comment stays (Jira history). */
export async function undoRoute(ctx: ServiceContext, rec: Extract<UndoRecord, { action: "route" }>): Promise<Result<string, ServiceError>> {
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const u = await jira.value.updateIssue(rec.clusterId, {
    componentIds: [...rec.prevComponentIds],
    ...(rec.fieldId !== undefined ? { fields: { [rec.fieldId]: rec.prevFieldValue ?? null } } : {}),
  });
  if (!u.ok) return fromPortError(u.error, "Reverting the route");
  return { ok: true, value: `Reverted the route on ${rec.clusterKey} (components restored${rec.fieldId !== undefined ? `, ${rec.fieldId} restored` : ""}). The routing comment stays in the issue history.` };
}

/** TWG team picker for the admin page (asUser). */
export async function listMyTeams(ctx: ServiceContext): Promise<ServiceResult<{ status: TwgStatusName | "not-permitted"; teams: { ari: string; name: string }[]; message: string }>> {
  if (ctx.accountId === undefined || ctx.ports.twg === undefined) return done({ status: "skipped", teams: [], message: "TWG is not available in this context." });
  const o = await ctx.ports.twg.teamsOfUser(ctx.accountId);
  switch (o.status) {
    case "ok":
      return done({ status: "ok", teams: o.value.map((t) => ({ ari: t.ari, name: t.name })), message: `${o.value.length} team(s) found.` });
    case "empty":
      return done({ status: "empty", teams: [], message: `No teams returned (${TWG_EMPTY_TEXT}). You can still paste a team ARI or route by component.` });
    case "not-permitted":
      return done({ status: "not-permitted", teams: [], message: `${o.message}. Routing uses components and project roles.` });
    case "error":
      return done({ status: "error", teams: [], message: `Teamwork Graph error: ${o.message}. Routing uses components and project roles.` });
  }
}
