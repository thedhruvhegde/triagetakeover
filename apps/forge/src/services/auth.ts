/**
 * Authorisation helpers (ARCHITECTURE §14). Forge storage is app-wide and not permission
 * filtered, so every service that returns index-derived data first checks the caller's
 * Browse permission asUser (cached per invocation). Issue-specific calls do an asUser read.
 */
import { memoize, type ServiceContext } from "../context";
import type { GetIssueOptions, JiraIssue, JiraUserPort } from "../ports/jira";
import { fail, FORBIDDEN_OR_NOT_FOUND_MESSAGE, fromPortError, ok, type ServiceError } from "./errors";
import type { Result } from "@tt/engine";

type Fail = { readonly ok: false; readonly error: ServiceError };

/** The user-bound Jira port, or a failure when the invocation has no user (consumers). */
export function userPort(ctx: ServiceContext): Result<JiraUserPort, ServiceError> {
  if (ctx.accountId === undefined) return fail("forbidden-or-not-found", FORBIDDEN_OR_NOT_FOUND_MESSAGE);
  return ok(ctx.ports.jira.asUser());
}

/** The caller's accountId, required for writes that record who did them. */
export function requireAccount(ctx: ServiceContext): Result<string, ServiceError> {
  return ctx.accountId === undefined ? fail("forbidden-or-not-found", FORBIDDEN_OR_NOT_FOUND_MESSAGE) : ok(ctx.accountId);
}

/** Browse permission on the project (asUser `mypermissions`, cached per invocation). */
export async function requireBrowse(ctx: ServiceContext, projectKey: string): Promise<Result<true, ServiceError>> {
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const r = await memoize(ctx, `browse:${projectKey}`, async () => jira.value.getMyPermissions({ permissions: ["BROWSE_PROJECTS"], projectKey }));
  // A transient failure or a missing asUser consent ("Allow access", SPIKE-A1) is reported as
  // such, not as "no access": only a 403/404 or a false permission means forbidden.
  if (!r.ok) return fromPortError(r.error, "Permission check");
  return r.value.BROWSE_PROJECTS ? ok(true) : fail("forbidden-or-not-found", FORBIDDEN_OR_NOT_FOUND_MESSAGE);
}

/** Project admin (ADMINISTER_PROJECTS) or Jira admin (ADMINISTER), for the admin page (§14). */
export async function requireProjectAdmin(ctx: ServiceContext, projectKey: string): Promise<Result<true, ServiceError>> {
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const r = await memoize(ctx, `admin:${projectKey}`, async () => jira.value.getMyPermissions({ permissions: ["ADMINISTER_PROJECTS", "ADMINISTER", "BROWSE_PROJECTS"], projectKey }));
  if (!r.ok) return fromPortError(r.error, "Permission check");
  if (!r.value.BROWSE_PROJECTS) return fail("forbidden-or-not-found", FORBIDDEN_OR_NOT_FOUND_MESSAGE);
  if (r.value.ADMINISTER_PROJECTS || r.value.ADMINISTER) return ok(true);
  return fail("forbidden-or-not-found", "Only project or Jira administrators can change Takeover Triage settings.");
}

/** asUser issue read: authorises issue-specific data. 404 and 403 are reported identically. */
export async function readIssueAsUser(ctx: ServiceContext, issueKey: string, opts: GetIssueOptions = {}): Promise<Result<JiraIssue, ServiceError>> {
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const r = await jira.value.getIssue(issueKey, opts);
  if (!r.ok) return fromPortError(r.error, `Reading ${issueKey}`) as Fail;
  return ok(r.value);
}
