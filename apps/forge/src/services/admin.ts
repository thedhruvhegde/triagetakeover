/**
 * Admin page reads (UI Kit). Admin only (project admin or Jira admin, §14).
 */
import type { AdminState } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { requireProjectAdmin, userPort } from "./auth";
import { configView, loadGlobalConfig, loadProjectConfig } from "./config";
import { lastDiagnostics } from "./diagnostics";
import { done, fromPortError, type ServiceResult } from "./errors";
import { readResyncStatus } from "./resync-state";

export async function getAdminState(ctx: ServiceContext, projectKey: string): Promise<ServiceResult<AdminState>> {
  const admin = await requireProjectAdmin(ctx, projectKey);
  if (!admin.ok) return admin;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { config, warnings } = await loadProjectConfig(ctx.ports.storage, projectKey);
  const project = await jira.value.getProject(projectKey);
  if (!project.ok) return fromPortError(project.error, "Reading the project");
  const components = await jira.value.getProjectComponents(projectKey);
  const roles = await jira.value.getProjectRoles(projectKey);
  const global = await loadGlobalConfig(ctx.ports.storage);
  return done(
    {
      config: configView(config),
      projects: global.projects,
      resync: await readResyncStatus(ctx.ports.storage, projectKey),
      diagnostics: await lastDiagnostics(ctx),
      components: components.ok ? components.value.map((c) => ({ id: c.id, name: c.name, ...(c.leadAccountId !== undefined ? { leadAccountId: c.leadAccountId } : {}) })) : [],
      roles: roles.ok ? roles.value.map((r) => ({ id: r.id, name: r.name })) : [],
      issueTypes: project.value.issueTypes.map((t) => t.name),
    },
    warnings,
  );
}
