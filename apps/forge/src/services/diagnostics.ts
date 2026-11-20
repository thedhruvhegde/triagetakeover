/**
 * Diagnostics (PRD US-03, ARCHITECTURE §11, §15). Each check reports pass / fail / unknown /
 * skipped with a plain-language consequence. Anything the app cannot observe from the server
 * is reported as `unknown`, never as pass.
 */
import { isRecord } from "@tt/engine";
import type { DiagnosticCheck, DiagnosticsView } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { JQL_ALIASES, PROPERTY_KEYS } from "../ports/properties";
import { KvsKeys } from "../ports/storage";
import { requireProjectAdmin, userPort } from "./auth";
import { ATTACHMENT_DIAG_KEY } from "./commit";
import { done, type ServiceResult } from "./errors";
import { TWG_EMPTY_TEXT } from "./route";

const check = (c: DiagnosticCheck): DiagnosticCheck => c;

async function storageCheck(ctx: ServiceContext): Promise<DiagnosticCheck> {
  const key = `diag:probe:${ctx.ports.ids.next("probe")}`;
  const w = await ctx.ports.storage.set(key, { at: ctx.ports.clock.nowIso() }, { ttlSeconds: 60 });
  const r = w.ok ? await ctx.ports.storage.get(key) : null;
  await ctx.ports.storage.delete(key);
  const passed = w.ok && r !== null && r.ok && isRecord(r.value);
  return check({
    id: "storage",
    label: "App storage (KVS)",
    status: passed ? "pass" : "fail",
    consequence: passed ? "Index, settings and caches can be stored." : "App storage is not writable: the board, settings and Re-sync cannot work.",
  });
}

async function propertyCheck(ctx: ServiceContext, issueKey: string | undefined): Promise<DiagnosticCheck> {
  if (issueKey === undefined) {
    return check({ id: "property-write", label: "Entity property write", status: "unknown", consequence: "Pick an issue to test writing a property (a temporary tt.diag property is written and removed).", spike: "SPIKE-I1" });
  }
  const jira = ctx.ports.jira.asUser();
  const w = await jira.setIssueProperty(issueKey, "tt.diag", { v: 1, at: ctx.ports.clock.nowIso() });
  if (w.ok) await jira.deleteIssueProperty(issueKey, "tt.diag");
  return check({
    id: "property-write",
    label: "Entity property write",
    status: w.ok ? "pass" : "fail",
    consequence: w.ok ? "Signal data can be stored on issues." : "Signal data cannot be stored on this issue: check Edit permission.",
    ...(w.ok ? {} : { detail: w.error.message }),
    spike: "SPIKE-I1",
  });
}

async function jqlIndexChecks(ctx: ServiceContext, projectKey: string): Promise<DiagnosticCheck[]> {
  const jira = ctx.ports.jira.asUser();
  const r = await jira.searchJql({ jql: `${JQL_ALIASES.v} = 1 AND project = ${projectKey}`, properties: [PROPERTY_KEYS.event], maxResults: 1 });
  const index = check(
    !r.ok
      ? { id: "jql-index", label: "Property index for JQL (ttV, ttType, ...)", status: "fail", consequence: "JQL aliases are not indexed: Re-sync falls back to labels = tt-takeover.", detail: r.error.message, spike: "SPIKE-E1" }
      : r.value.issues.length === 0
        ? { id: "jql-index", label: "Property index for JQL (ttV, ttType, ...)", status: "unknown", consequence: "The query works but found no events yet (indexing may lag after writes).", spike: "SPIKE-E1" }
        : { id: "jql-index", label: "Property index for JQL (ttV, ttType, ...)", status: "pass", consequence: "Events can be found with JQL such as ttType = lane-loss.", spike: "SPIKE-E1" },
  );
  const first = r.ok ? r.value.issues[0] : undefined;
  const props = check(
    first === undefined
      ? { id: "search-properties", label: "Search returns properties", status: "unknown", consequence: "Not tested: no indexed event found.", spike: "SPIKE-E3" }
      : PROPERTY_KEYS.event in first.properties
        ? { id: "search-properties", label: "Search returns properties", status: "pass", consequence: "Re-sync reads signal data in bulk.", spike: "SPIKE-E3" }
        : { id: "search-properties", label: "Search returns properties", status: "fail", consequence: "Re-sync reads each property separately (slower, still correct).", spike: "SPIKE-E3" },
  );
  return [index, props];
}

async function twgChecks(ctx: ServiceContext): Promise<DiagnosticCheck[]> {
  const twg = ctx.ports.twg;
  if (twg === undefined || ctx.accountId === undefined) {
    return [check({ id: "twg-user-teams", label: "Teamwork Graph: user → teams", status: "skipped", consequence: "TWG is not available in this context; routing uses components and project roles." })];
  }
  const teams = await twg.teamsOfUser(ctx.accountId);
  const hop1 = check(
    teams.status === "ok"
      ? { id: "twg-user-teams", label: "Teamwork Graph: user → teams", status: "pass", consequence: `${teams.value.length} team(s) found; the admin team picker works.`, spike: "SPIKE-T1" }
      : teams.status === "empty"
        ? { id: "twg-user-teams", label: "Teamwork Graph: user → teams", status: "unknown", consequence: `No teams returned (${TWG_EMPTY_TEXT}). An organization admin may need to grant read:graph:user:atlassian.`, spike: "SPIKE-T1" }
        : { id: "twg-user-teams", label: "Teamwork Graph: user → teams", status: "fail", consequence: "TWG unavailable: routing uses project components, then project roles.", detail: teams.message, spike: "SPIKE-T1" },
  );
  if (teams.status !== "ok" || teams.value[0] === undefined) {
    return [hop1, check({ id: "twg-team-members", label: "Teamwork Graph: team → members", status: "skipped", consequence: "Not tested because the first hop returned no team." })];
  }
  const members = await twg.teamMembers(teams.value[0].ari, { first: 5 });
  const hop2 = check(
    members.status === "ok"
      ? { id: "twg-team-members", label: "Teamwork Graph: team → members", status: "pass", consequence: "Routing can name team members (shown in the app only, never through Rovo/MCP).", spike: "SPIKE-T1" }
      : members.status === "empty"
        ? { id: "twg-team-members", label: "Teamwork Graph: team → members", status: "unknown", consequence: `No members returned (${TWG_EMPTY_TEXT}). Routing falls back to the component lead.`, spike: "SPIKE-T1" }
        : { id: "twg-team-members", label: "Teamwork Graph: team → members", status: "fail", consequence: "Team members unavailable: routing falls back to the component lead.", detail: members.message, spike: "SPIKE-T1" },
  );
  return [hop1, hop2];
}

async function attachmentCheck(ctx: ServiceContext): Promise<DiagnosticCheck> {
  const r = await ctx.ports.storage.get(ATTACHMENT_DIAG_KEY);
  const v = r.ok && isRecord(r.value) ? r.value : {};
  const browser = isRecord(v["browser"]) ? v["browser"] : undefined;
  const backend = isRecord(v["backend"]) ? v["backend"] : undefined;
  const last = browser ?? backend;
  if (last === undefined) return check({ id: "attachments", label: "Attachment upload (raw files)", status: "unknown", consequence: "Not observed yet: the result of the first intake upload is recorded here.", spike: "SPIKE-I2" });
  const ok = last["status"] === "uploaded";
  const path = browser !== undefined ? "browser" : "backend fallback";
  return check({
    id: "attachments",
    label: "Attachment upload (raw files)",
    status: ok ? "pass" : "fail",
    consequence: ok ? `The last upload via the ${path} succeeded.` : `The last upload via the ${path} failed: events are still stored, with thumbnails, but without the raw files.`,
    ...(typeof last["at"] === "string" ? { detail: `Last attempt ${last["at"]}` } : {}),
    spike: "SPIKE-I2",
  });
}

/** Runs every check (admin only) and stores the result in `diag:last`. */
export async function runDiagnostics(ctx: ServiceContext, projectKey: string, issueKey?: string): Promise<ServiceResult<DiagnosticsView>> {
  const admin = await requireProjectAdmin(ctx, projectKey);
  if (!admin.ok) return admin;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const checks: DiagnosticCheck[] = [await storageCheck(ctx), await propertyCheck(ctx, issueKey), ...(await jqlIndexChecks(ctx, projectKey)), ...(await twgChecks(ctx)), await attachmentCheck(ctx)];
  checks.push(
    check({ id: "rovo", label: "Rovo agent (informational)", status: "unknown", consequence: "The app cannot detect whether Rovo is enabled on this site. Everything except chat works without it." }),
    check({
      id: "mcp",
      label: "MCP tools exposure (informational)",
      status: "unknown",
      consequence: "The app cannot see this setting. A site admin enables it under Admin › Apps › Sites › Connected apps › Takeover Triage › Tools.",
    }),
    check({ id: "project-create", label: "Demo project creation", status: "unknown", consequence: "Tested when you click Load demo data; if refused, the seed uses a project you pick.", spike: "SPIKE-S1" }),
  );
  const view: DiagnosticsView = { ranAt: ctx.ports.clock.nowIso(), checks };
  await ctx.ports.storage.set(KvsKeys.diagLast(), view);
  return done(view);
}

export async function lastDiagnostics(ctx: ServiceContext): Promise<DiagnosticsView | null> {
  const r = await ctx.ports.storage.get(KvsKeys.diagLast());
  if (!r.ok || !isRecord(r.value) || typeof r.value["ranAt"] !== "string" || !Array.isArray(r.value["checks"])) return null;
  return r.value as unknown as DiagnosticsView;
}
