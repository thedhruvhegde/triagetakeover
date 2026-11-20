/**
 * Demo seed resolver services (ARCHITECTURE §9 steps 1–2 and 5, PRD US-01, US-02 AC3).
 *
 * - {@link startSeed}: admin only, asUser. Detects an existing demo (manifest, or leftover
 *   `tt-synthetic` issues when the app's storage was reset, §15 #24) and answers with a
 *   Keep/Reset choice; creates project `TTDEMO` when it does not exist (SPIKE-S1: refused →
 *   the admin picks an existing project and the seed types everything by labels), creates the
 *   components (lead = the admin; no fake users), writes the routing config, the manifest and
 *   the job record, and queues step 0 of the `tt-seed` chain. A failed job is resumed from its
 *   failed position; a running one is reported (clicks are deduped).
 * - {@link getSeedJob}: progress for the admin page (polled every second).
 * - {@link removeDemoData}: deletes only issues that are labelled `tt-synthetic` AND that the
 *   seed created (listed in the manifest or carrying this app's `tt.seed` property), their
 *   index rows, the seeded vehicle and drive-session rows, the `seed:*` and job keys, and the
 *   seeded config / triage mark only if they are unchanged since seeding. The project and its
 *   components are kept (the app never deletes projects; the JiraPort has no component delete).
 * - {@link getSeedReport}: the admin-only seed report (ARI against regenerated truth).
 */
import { isRecord } from "@tt/engine";
import { planFleet, PROFILE_ID, type SeedConfig } from "@tt/seedgen";
import type { RoutingRuleInput, SeedJobView } from "../../contract/ui-api";
import type { ServiceContext } from "../../context";
import type { JiraIssue, JiraUserPort } from "../../ports/jira";
import { LABELS, PROPERTY_KEYS } from "../../ports/properties";
import { KvsKeys } from "../../ports/storage";
import { requireAccount, requireProjectAdmin, userPort } from "../auth";
import { loadGlobalConfig, loadProjectConfig, saveProjectConfig } from "../config";
import { done, fail, fromPortError, type ServiceResult } from "../errors";
import { loadProjectClusters, loadProjectEvents } from "../index-store";
import { fillMissingProperties } from "../jira-io";
import { type SeedReport } from "./report";
import {
  DEMO_PROJECT_DESCRIPTION,
  DEMO_PROJECT_KEY,
  DEMO_PROJECT_NAME,
  SEED_REPORT_KEY,
  SEED_STEPS,
  SEED_STEP_LABELS,
  isActive,
  isStale,
  mondayOnOrBefore,
  readJobRecord,
  readManifest,
  writeJobRecord,
  writeManifest,
  type SeedJobRecord,
  type SeedManifest,
} from "./state";

/** Frames used by the in-app seed. SPIKE-G2/S2: "full" (1280x720 q85) may be too slow on a site; then "fast". */
export const DEFAULT_SEED_FRAMES: "full" | "fast" = "full";

export type StartSeedMode = "start" | "keep" | "reset";

export interface StartSeedInput {
  readonly projectKey: string;
  readonly seed: number;
  /** What to do when demo data already exists: report it (default), keep it, or remove and reload. */
  readonly mode?: StartSeedMode;
  readonly frames?: "full" | "fast";
}

/** {@link SeedJobView} plus the detail the admin page shows (extra fields are additive). */
export interface SeedJobDetail extends SeedJobView {
  readonly projectKey: string;
  readonly cursor: number;
  readonly stepLabel: string;
  /** 0-based index of the step in the chain and the chain length. */
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly message: string;
  readonly boardReady: boolean;
  /** `uploading` = "raw files uploading"; `skipped` = SPIKE-I2 refused, thumbnails remain. */
  readonly attachments: SeedJobRecord["attachments"];
  readonly warnings: readonly string[];
  readonly anchorDate: string;
  readonly frames: "full" | "fast";
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly boardReadyAt?: string;
  readonly finishedAt?: string;
  readonly stats: SeedJobRecord["stats"];
  readonly report?: SeedReport;
}

export function seedJobView(rec: SeedJobRecord, report?: SeedReport): SeedJobDetail {
  return {
    jobId: rec.jobId,
    state: rec.state,
    step: rec.step,
    counts: { ...rec.counts },
    errors: [...rec.errors],
    seed: rec.seed,
    projectKey: rec.projectKey,
    cursor: rec.cursor,
    stepLabel: SEED_STEP_LABELS[rec.step],
    stepIndex: SEED_STEPS.indexOf(rec.step),
    stepCount: SEED_STEPS.length,
    message: rec.message,
    boardReady: rec.boardReady,
    attachments: rec.attachments,
    warnings: [...rec.warnings],
    anchorDate: rec.anchorDate,
    frames: rec.frames,
    startedAt: rec.startedAt,
    updatedAt: rec.updatedAt,
    ...(rec.boardReadyAt !== undefined ? { boardReadyAt: rec.boardReadyAt } : {}),
    ...(rec.finishedAt !== undefined ? { finishedAt: rec.finishedAt } : {}),
    stats: rec.stats,
    ...(report !== undefined ? { report } : {}),
  };
}

const SPIKE_S1_REFUSED =
  "Creating the demo project TTDEMO was refused on this site (SPIKE-S1). Pick an existing project you administer and load the demo data there; seeded items are typed by labels (tt-takeover, tt-scenario, tt-cluster) and marked tt-synthetic.";

async function readReport(ctx: ServiceContext): Promise<SeedReport | undefined> {
  const r = await ctx.ports.storage.get(SEED_REPORT_KEY);
  return r.ok && isRecord(r.value) && r.value["v"] === 1 ? (r.value as unknown as SeedReport) : undefined;
}

/** Any `tt-synthetic` issue in the project (leftovers when the app's storage no longer lists them). */
async function hasSyntheticIssues(jira: JiraUserPort, projectKey: string): Promise<boolean> {
  const r = await jira.searchJql({ jql: `project = ${projectKey} AND labels = ${LABELS.synthetic}`, maxResults: 1 });
  return r.ok && r.value.issues.length > 0;
}

async function resumeJob(ctx: ServiceContext, rec: SeedJobRecord, warning: string): Promise<ServiceResult<SeedJobView>> {
  const resumed: SeedJobRecord = { ...rec, state: "running", attempts: 0, message: `Resuming: ${SEED_STEP_LABELS[rec.step]}…`, updatedAt: ctx.ports.clock.nowIso() };
  const w = await writeJobRecord(ctx.ports.storage, resumed);
  if (!w.ok) return fromPortError(w.error, "Saving the seed job");
  const pushed = await ctx.ports.queue.pushSeed({ jobId: rec.jobId, step: rec.step, cursor: rec.cursor, seed: rec.seed });
  if (!pushed.ok) {
    await writeJobRecord(ctx.ports.storage, { ...rec, state: "failed", message: "The seed step could not be queued; try again." });
    return fromPortError(pushed.error, "Queueing the seed step");
  }
  return done(seedJobView(resumed), [warning]);
}

export async function startSeed(ctx: ServiceContext, input: StartSeedInput): Promise<ServiceResult<SeedJobView>> {
  const account = requireAccount(ctx);
  if (!account.ok) return account;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { storage, clock } = ctx.ports;
  const pk = input.projectKey;
  const mode = input.mode ?? "start";
  const warnings: string[] = [];

  // S0: an existing demo anywhere on the site (one demo at a time; `seed:state` is app-wide).
  const existing = await readManifest(storage);
  if (!existing.ok) return fromPortError(existing.error, "Reading the demo seed state");
  if (existing.value !== null) {
    const m = existing.value;
    if (m.projectKey !== pk) return fail("conflict", `Demo data (seed ${m.seed}) is already loaded in project ${m.projectKey}. Remove it there first.`, [{ path: "projectKey", message: m.projectKey }]);
    const admin = await requireProjectAdmin(ctx, pk);
    if (!admin.ok) return admin;
    const jr = await readJobRecord(storage, m.jobId);
    if (!jr.ok) return fromPortError(jr.error, "Reading the seed job");
    const rec = jr.value;
    if (rec !== null && isActive(rec) && !isStale(rec, clock.nowMs())) return done(seedJobView(rec), ["Demo data is already loading; showing its progress."]);
    if (rec !== null && rec.state !== "done" && mode !== "reset") {
      if (rec.seed !== input.seed) return fail("conflict", `A demo seed (seed ${rec.seed}) stopped at "${SEED_STEP_LABELS[rec.step]}". Load it again with seed ${rec.seed} to resume, or choose Reset to remove it and load seed ${input.seed}.`, [{ path: "mode", message: "reset" }]);
      return resumeJob(ctx, rec, `Resuming the demo seed from "${SEED_STEP_LABELS[rec.step]}".`);
    }
    if (mode === "keep" && rec !== null) return done(seedJobView(rec, await readReport(ctx)), ["Kept the existing demo data."]);
    if (mode !== "reset") return fail("conflict", `Demo data (seed ${m.seed}) is already loaded in ${pk}. Choose Keep to use it, or Reset to remove it and load again.`, [{ path: "mode", message: "keep or reset" }]);
    const removed = await removeDemoData(ctx, { projectKey: pk });
    if (!removed.ok) return removed;
    const still = await readManifest(storage);
    if (still.ok && still.value !== null) return fail("unavailable", "Removing the previous demo data did not finish; click Reset again to continue.");
    warnings.push(`Removed the previous demo data (${removed.value.value.removedIssues} issues).`);
  }

  // S1: the project. Create TTDEMO when it does not exist (SPIKE-S1), else use the picked project.
  let projectCreated = false;
  const project = await jira.value.getProject(pk);
  if (!project.ok) {
    if (project.error.kind !== "not-found" || pk !== DEMO_PROJECT_KEY) return fromPortError(project.error, `Reading project ${pk}`);
    // SPIKE-S1: needs manage:jira-project and a template that works on the judge's site; unverified.
    const created = await jira.value.createProject({ key: DEMO_PROJECT_KEY, name: DEMO_PROJECT_NAME, leadAccountId: account.value, description: DEMO_PROJECT_DESCRIPTION, projectTypeKey: "software" });
    if (!created.ok) {
      if (created.error.kind === "forbidden" || created.error.kind === "unauthorized" || created.error.kind === "bad-request") return fail("forbidden-or-not-found", SPIKE_S1_REFUSED, [{ path: "projectKey", message: "project-creation-refused" }]);
      return fromPortError(created.error, "Creating the demo project");
    }
    projectCreated = true;
  }
  const admin = await requireProjectAdmin(ctx, pk);
  if (!admin.ok) return admin;
  if (existing.value === null && (await hasSyntheticIssues(jira.value, pk))) {
    if (mode !== "reset") return fail("conflict", `Synthetic demo issues from an earlier load were found in ${pk}, but the app's storage no longer lists them. Choose Reset to remove them and load again.`, [{ path: "mode", message: "reset" }]);
    const removed = await removeDemoData(ctx, { projectKey: pk });
    if (!removed.ok) return removed;
    if (await hasSyntheticIssues(jira.value, pk)) warnings.push(`Some tt-synthetic issues in ${pk} were not created by this app's seed and were kept.`);
  }

  const frames = input.frames ?? DEFAULT_SEED_FRAMES;
  const anchorDate = mondayOnOrBefore(clock.nowIso());
  const cfg: SeedConfig = { seed: input.seed, anchorDate, profile: PROFILE_ID, frames };
  const plan = planFleet(cfg);

  // Components (lead = the admin; the only real person involved, SEED_DATA §12).
  const comps = await jira.value.getProjectComponents(pk);
  if (!comps.ok) return fromPortError(comps.error, "Reading components");
  const componentIds = new Map(comps.value.map((c) => [c.name, c.id]));
  const componentsCreated: string[] = [];
  for (const c of plan.routing.components) {
    if (componentIds.has(c.name)) continue;
    const r = await jira.value.createComponent({ projectKey: pk, name: c.name, leadAccountId: account.value, description: "Created by the Takeover Triage demo seed (synthetic demo data)." });
    if (!r.ok) {
      warnings.push(`Component ${c.name} could not be created; routing to it falls back to the project role.`);
      continue;
    }
    componentIds.set(c.name, r.value.id);
    componentsCreated.push(c.name);
  }

  // Routing config (SEED_DATA §12). An existing project keeps routing rules it already has.
  const before = await storage.get(KvsKeys.config(pk));
  if (!before.ok) return fromPortError(before.error, "Reading settings");
  const { config: current } = await loadProjectConfig(storage, pk);
  const roles = await jira.value.getProjectRoles(pk);
  const leadRole = roles.ok ? (roles.value.find((r) => r.name === "Administrators") ?? roles.value[0]) : undefined;
  const routing = plan.routing.rules.flatMap((r): RoutingRuleInput[] => {
    const match = r.match.type === undefined ? {} : { type: [...r.match.type] };
    if ("component" in r.team) {
      const id = componentIds.get(r.team.component);
      if (id !== undefined) return [{ match, team: { componentId: id, label: r.team.component } }];
    }
    return leadRole !== undefined ? [{ match, team: { projectRoleId: leadRole.id, label: "project lead" } }] : [];
  });
  const info = project.ok ? project : await jira.value.getProject(pk);
  if (!info.ok) return fromPortError(info.error, `Reading project ${pk}`);
  const types = info.value.issueTypes.map((t) => t.name);
  const has = (t: string): boolean => types.some((x) => x.toLowerCase() === t.toLowerCase());
  const fallbackType = has("Task") ? "Task" : (types.find((t) => !/^(epic|sub-?task)$/i.test(t)) ?? types[0] ?? "Task");
  const patch: Record<string, unknown> = {};
  if (current.routing.length === 0) patch["routing"] = routing;
  else warnings.push(`${pk} already has routing rules; they were kept.`);
  for (const f of ["eventIssueType", "clusterIssueType", "scenarioIssueType"] as const) if (!has(current[f])) patch[f] = fallbackType;
  if (has("Test") && current.scenarioIssueType === "Task") patch["scenarioIssueType"] = "Test";
  const saved = await saveProjectConfig(ctx, pk, patch);
  if (!saved.ok) warnings.push(`The demo routing settings could not be saved (${saved.error.message}); routing uses the project defaults.`);
  const seededConfig = await storage.get(KvsKeys.config(pk));
  const triagedBefore = await storage.get(KvsKeys.triaged(pk));
  const global = await loadGlobalConfig(storage);
  await storage.set(KvsKeys.configGlobal(), { ...global, demoProjectKey: pk });

  // Manifest + job record, then step 0 (S2).
  const jobId = ctx.ports.ids.next("seed");
  const now = clock.nowIso();
  const manifest: SeedManifest = {
    v: 1,
    projectKey: pk,
    seed: input.seed,
    anchorDate,
    frames,
    jobId,
    by: account.value,
    createdAt: now,
    projectCreated,
    componentsCreated,
    config: { before: before.value ?? null, seeded: seededConfig.ok ? (seededConfig.value ?? null) : null },
    triagedBefore: triagedBefore.ok ? (triagedBefore.value ?? null) : null,
    items: {},
    pending: [],
    clusterPlan: null,
    registry: { vehicles: [], sessions: [] },
    attachmentFiles: {},
    failedEvents: [],
  };
  const mw = await writeManifest(storage, manifest);
  if (!mw.ok) return fromPortError(mw.error, "Saving the demo seed state");
  const rec: SeedJobRecord = {
    v: 1,
    jobId,
    projectKey: pk,
    seed: input.seed,
    anchorDate,
    frames,
    state: "queued",
    step: "registry",
    cursor: 0,
    attempts: 0,
    counts: {},
    errors: [],
    warnings: [],
    message: "Queued.",
    boardReady: false,
    attachments: "pending",
    startedAt: now,
    updatedAt: now,
    stats: {},
  };
  const jw = await writeJobRecord(storage, rec);
  if (!jw.ok) return fromPortError(jw.error, "Saving the seed job");
  const pushed = await ctx.ports.queue.pushSeed({ jobId, step: "registry", cursor: 0, seed: input.seed });
  if (!pushed.ok) {
    await writeJobRecord(storage, { ...rec, state: "failed", message: "The seed could not be queued; click Load demo data again." });
    return fromPortError(pushed.error, "Queueing the demo seed");
  }
  if (projectCreated) warnings.push(`Created project ${pk} "${DEMO_PROJECT_NAME}".`);
  return done(seedJobView(rec), warnings);
}

export async function getSeedJob(ctx: ServiceContext, input: { readonly jobId: string }): Promise<ServiceResult<SeedJobView>> {
  const r = await readJobRecord(ctx.ports.storage, input.jobId);
  if (!r.ok) return fromPortError(r.error, "Reading the seed job");
  if (r.value === null) return fail("forbidden-or-not-found", "No demo seed job with that id.");
  const admin = await requireProjectAdmin(ctx, r.value.projectKey);
  if (!admin.ok) return admin;
  return done(seedJobView(r.value, r.value.state === "done" ? await readReport(ctx) : undefined));
}

export async function getSeedReport(ctx: ServiceContext, input: { readonly projectKey: string }): Promise<ServiceResult<SeedReport>> {
  const admin = await requireProjectAdmin(ctx, input.projectKey);
  if (!admin.ok) return admin;
  const report = await readReport(ctx);
  if (report === undefined || report.projectKey !== input.projectKey) return fail("not-configured", "No seed report: demo data has not finished loading in this project.");
  return done(report);
}

/** Resolver time guard (25 s limit, §15 #19): stop deleting and ask for another click. */
export const REMOVE_BUDGET_MS = 18_000;

export interface RemoveOptions {
  readonly nowMs?: () => number;
  readonly budgetMs?: number;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function removeDemoData(ctx: ServiceContext, input: { readonly projectKey: string }, opts: RemoveOptions = {}): Promise<ServiceResult<{ removedIssues: number; removedRows: number }>> {
  const pk = input.projectKey;
  const admin = await requireProjectAdmin(ctx, pk);
  if (!admin.ok) return admin;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { storage, clock } = ctx.ports;
  const nowMs = opts.nowMs ?? (() => Date.now());
  const started = nowMs();
  const budget = opts.budgetMs ?? REMOVE_BUDGET_MS;
  const mR = await readManifest(storage);
  if (!mR.ok) return fromPortError(mR.error, "Reading the demo seed state");
  const m = mR.value;
  if (m !== null && m.projectKey !== pk) return fail("conflict", `The demo data lives in project ${m.projectKey}, not ${pk}.`, [{ path: "projectKey", message: m.projectKey }]);
  if (m !== null) {
    const jr = await readJobRecord(storage, m.jobId);
    if (jr.ok && jr.value !== null && isActive(jr.value) && !isStale(jr.value, clock.nowMs())) {
      return fail("conflict", `Demo data is still loading ("${SEED_STEP_LABELS[jr.value.step]}"). Wait for it to finish, then remove it.`);
    }
  }
  const warnings: string[] = [];
  const manifestIds = new Set(Object.values(m?.items ?? {}).map((r) => r.id));

  // Issues: labelled tt-synthetic in this project AND created by the seed (manifest or tt.seed).
  const toDelete: JiraIssue[] = [];
  let kept = 0;
  let token: string | undefined;
  do {
    const r = await jira.value.searchJql({ jql: `project = ${pk} AND labels = ${LABELS.synthetic}`, properties: [PROPERTY_KEYS.seed], maxResults: 100, ...(token !== undefined ? { nextPageToken: token } : {}) });
    if (!r.ok) return fromPortError(r.error, "Searching the demo issues");
    const filled = await fillMissingProperties(jira.value, r.value.issues, [PROPERTY_KEYS.seed]);
    if (!filled.ok) return fromPortError(filled.error, "Reading the demo issues");
    for (const issue of filled.value) {
      const p = issue.properties[PROPERTY_KEYS.seed];
      const fromSeed = manifestIds.has(issue.id) || (isRecord(p) && typeof p["itemId"] === "string" && typeof p["seed"] === "number");
      if (fromSeed) toDelete.push(issue);
      else kept++;
    }
    token = r.value.nextPageToken;
  } while (token !== undefined);
  if (kept > 0) warnings.push(`${kept} tt-synthetic issue(s) in ${pk} were not created by the demo seed and were kept.`);

  let removedIssues = 0;
  const deletedIds = new Set<string>();
  let unfinished = false;
  // Clusters last is not needed (Jira deletes the links with the issue); delete in id order.
  for (const issue of [...toDelete].sort((a, b) => Number(a.id) - Number(b.id))) {
    if (removedIssues > 0 && nowMs() - started >= budget) {
      unfinished = true;
      break;
    }
    const d = await jira.value.deleteIssue(issue.id);
    if (!d.ok && d.error.kind !== "not-found") {
      if (d.error.kind === "rate-limited" || d.error.kind === "unavailable" || d.error.kind === "timeout") {
        unfinished = true;
        break;
      }
      return fromPortError(d.error, `Deleting ${issue.key}`);
    }
    deletedIds.add(issue.id);
    removedIssues++;
  }

  // Index rows of the deleted (or already gone) seed issues.
  let removedRows = 0;
  const gone = new Set([...deletedIds, ...(unfinished ? [] : manifestIds)]);
  const events = await loadProjectEvents(storage, pk);
  if (events.ok) for (const e of events.value) if (gone.has(e.key)) {
    await storage.deleteEntity("event", e.key);
    removedRows++;
  }
  const clusters = await loadProjectClusters(storage, pk);
  if (clusters.ok) for (const c of clusters.value) if (gone.has(c.key)) {
    await storage.deleteEntity("cluster", c.key);
    removedRows++;
  }
  if (unfinished) {
    await storage.delete(KvsKeys.board(pk));
    return done({ removedIssues, removedRows }, [...warnings, `Removed ${removedIssues} of ${toDelete.length} demo issues; click Remove demo data again to finish.`]);
  }

  // Registry rows the seed wrote (synthetic only).
  for (const id of m?.registry.vehicles ?? []) {
    const r = await storage.getEntity("vehicle", id);
    if (r.ok && r.value !== undefined && r.value.synthetic) {
      await storage.deleteEntity("vehicle", id);
      removedRows++;
    }
  }
  for (const id of m?.registry.sessions ?? []) {
    const r = await storage.getEntity("drive-session", id);
    if (r.ok && r.value !== undefined && r.value.synthetic && r.value.source === "demo-seed") {
      await storage.deleteEntity("drive-session", id);
      removedRows++;
    }
  }

  // KVS: seeded config and triage mark only if unchanged since seeding; then the seed keys.
  if (m !== null) {
    const cfgNow = await storage.get(KvsKeys.config(pk));
    if (cfgNow.ok && m.config.seeded !== null && sameJson(cfgNow.value, m.config.seeded)) {
      if (m.config.before === null) await storage.delete(KvsKeys.config(pk));
      else await storage.set(KvsKeys.config(pk), m.config.before);
    } else if (cfgNow.ok && m.config.seeded !== null) warnings.push(`The project settings were changed after seeding and were kept.`);
    const tNow = await storage.get(KvsKeys.triaged(pk));
    if (tNow.ok && isRecord(tNow.value) && tNow.value["via"] === "demo-seed") {
      if (m.triagedBefore === null) await storage.delete(KvsKeys.triaged(pk));
      else await storage.set(KvsKeys.triaged(pk), m.triagedBefore);
    }
    await storage.delete(KvsKeys.seedJob(m.jobId));
    if (m.projectCreated) warnings.push(`Project ${pk} was kept; delete it in Jira settings if you no longer need it.`);
    if (m.componentsCreated.length > 0) warnings.push(`Components ${m.componentsCreated.join(", ")} were kept.`);
  }
  const global = await loadGlobalConfig(storage);
  if (global.demoProjectKey === pk) {
    const { demoProjectKey: _d, ...rest } = global;
    void _d;
    await storage.set(KvsKeys.configGlobal(), rest);
  }
  await storage.delete(SEED_REPORT_KEY);
  await storage.delete(KvsKeys.board(pk));
  await storage.delete(KvsKeys.seedState());
  return done({ removedIssues, removedRows }, warnings);
}
