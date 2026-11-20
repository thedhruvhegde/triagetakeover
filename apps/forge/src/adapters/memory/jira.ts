/**
 * In-memory Jira site for service tests: a faithful-enough model of the REST behaviour the
 * app depends on (permissions, 404-for-hidden, 32,768-byte property limit, JQL subset with
 * the manifest's property aliases, deterministic ids and keys, link types, attachments as
 * bytes). It also records every call with its principal, so tests can assert that writes
 * happened asUser (§14) and can inject faults for the §15 failure modes.
 *
 * Usage:
 *   const site = new MemoryJiraSite({ clock });
 *   site.addUser({ accountId: "u-admin", displayName: "Admin", globalAdmin: true });
 *   site.addProject({ key: "TTDEMO", name: "Takeover Triage Demo [SYNTHETIC]", leadAccountId: "u-admin" });
 *   const jira = site.gateway({ accountId: "u-admin" });   // resolver/action invocation
 *   const consumerJira = site.gateway({});                 // consumer: asUser() is unavailable
 */
import { PROPERTY_LIMIT_BYTES, utf8ByteLength } from "@tt/engine";
import type { Clock } from "../../ports/clock";
import {
  BULK_CREATE_MAX,
  PROPERTY_KEY_MAX_LENGTH,
  SEARCH_DEFAULT_MAX_RESULTS,
  SEARCH_MAX_RESULTS,
  SUMMARY_MAX_LENGTH,
  type AttachmentInfo,
  type BulkCreateResult,
  type CommentInfo,
  type ComponentInfo,
  type CreateComponentInput,
  type CreateIssueInput,
  type CreateProjectInput,
  type GetIssueOptions,
  type IssueIdOrKey,
  type IssueLink,
  type IssueLinkType,
  type IssueRef,
  type JiraGateway,
  type JiraIssue,
  type JiraPermissionKey,
  type JiraUser,
  type JiraUserPort,
  type MyPermissionsInput,
  type ProjectInfo,
  type ProjectRoleInfo,
  type ProjectRoleRef,
  type SearchInput,
  type SearchPage,
  type UpdateIssueInput,
  type UploadAttachmentInput,
} from "../../ports/jira";
import { PROPERTY_INDEXES, type PropertyIndexDef } from "../../ports/properties";
import { ok, portErr, type PortError, type PortErrorKind, type PortResult } from "../../ports/result";
import { compileJql, parseJqlDate, type JqlFieldDef, type JqlFields } from "./jql";

// ---------------------------------------------------------------- options and records

export type Principal = { readonly kind: "user"; readonly accountId: string } | { readonly kind: "app" };

/** accountId used for app-authored comments and attachments. */
export const APP_ACCOUNT_ID = "app:takeover-triage";

export const DEFAULT_ISSUE_TYPES = ["Task", "Bug", "Story", "Epic", "Subtask"] as const;

export const DEFAULT_LINK_TYPES: readonly Omit<IssueLinkType, "id">[] = [
  { name: "Blocks", inward: "is blocked by", outward: "blocks" },
  { name: "Cloners", inward: "is cloned by", outward: "clones" },
  { name: "Duplicate", inward: "is duplicated by", outward: "duplicates" },
  { name: "Relates", inward: "relates to", outward: "relates to" },
];

export interface MemoryJiraOptions {
  readonly clock: Clock;
  /** Property indexes (JQL aliases). Default: the manifest's {@link PROPERTY_INDEXES}. */
  readonly propertyIndexes?: readonly PropertyIndexDef[];
  /** SPIKE-E1 simulation: `false` makes the aliases unknown fields (JQL 400). Default true. */
  readonly aliasesIndexed?: boolean;
  /** SPIKE-E3 simulation: `false` drops `properties` from search results. Default true. */
  readonly searchReturnsProperties?: boolean;
  /** SPIKE-S1 simulation: who may create projects. Default "admins" (global admins and the app). */
  readonly projectCreation?: "admins" | "nobody";
  /** SPIKE-I2 simulation: who may upload attachments. Default "everyone". */
  readonly attachmentUpload?: "everyone" | "users-only" | "app-only" | "nobody";
  /** Max attachment size; Jira's default is 10 MiB. */
  readonly maxAttachmentBytes?: number;
  /** Link types on the site. Default {@link DEFAULT_LINK_TYPES}. */
  readonly linkTypes?: readonly Omit<IssueLinkType, "id">[];
}

interface UserRec {
  readonly accountId: string;
  readonly displayName: string;
}

interface RoleRec {
  readonly id: string;
  readonly name: string;
  readonly actors: Set<string>;
}

interface ProjectRec {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly leadAccountId?: string;
  readonly issueTypes: { readonly id: string; readonly name: string }[];
  readonly simplified: boolean;
  readonly roles: RoleRec[];
  readonly admins: Set<string>;
  readonly browseDenied: Set<string>;
  readonly editDenied: Set<string>;
  appDenied: boolean;
  nextIssueNumber: number;
}

interface IssueRec {
  readonly id: string;
  readonly key: string;
  readonly number: number;
  readonly projectKey: string;
  summary: string;
  readonly issueType: string;
  labels: string[];
  componentIds: string[];
  readonly created: string;
  updated: string;
  readonly description?: string;
  readonly reporterAccountId: string;
  /** Stored as JSON text, like Jira: values are always re-parsed on read. */
  readonly properties: Map<string, string>;
  readonly fields: Map<string, unknown>;
}

interface LinkRec {
  readonly id: string;
  readonly typeId: string;
  readonly inwardId: string;
  readonly outwardId: string;
}

interface AttachmentRec {
  readonly info: AttachmentInfo;
  readonly bytes: Uint8Array;
}

/** One recorded port call. */
export interface JiraCall {
  readonly principal: "app" | `user:${string}`;
  readonly op: string;
  /** Issue / project the call targeted, when there is one. */
  readonly target?: string;
}

const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

// ---------------------------------------------------------------- the site

export class MemoryJiraSite {
  readonly calls: JiraCall[] = [];

  private readonly clock: Clock;
  private readonly opts: Required<Omit<MemoryJiraOptions, "clock">>;
  private readonly users = new Map<string, UserRec>();
  private readonly globalAdmins = new Set<string>();
  private readonly projects = new Map<string, ProjectRec>();
  private readonly issues = new Map<string, IssueRec>();
  private readonly issueKeys = new Map<string, string>();
  private readonly components = new Map<string, ComponentInfo>();
  private readonly linkTypes: IssueLinkType[];
  private readonly links = new Map<string, LinkRec>();
  private readonly comments = new Map<string, CommentInfo[]>();
  private readonly attachments = new Map<string, AttachmentRec[]>();
  private readonly faults = new Map<string, PortError[]>();
  private readonly seq = { project: 10000, issue: 20000, component: 30000, link: 40000, comment: 50000, attachment: 60000, role: 10001, issueType: 10000 };

  constructor(options: MemoryJiraOptions) {
    this.clock = options.clock;
    this.opts = {
      propertyIndexes: options.propertyIndexes ?? PROPERTY_INDEXES,
      aliasesIndexed: options.aliasesIndexed ?? true,
      searchReturnsProperties: options.searchReturnsProperties ?? true,
      projectCreation: options.projectCreation ?? "admins",
      attachmentUpload: options.attachmentUpload ?? "everyone",
      maxAttachmentBytes: options.maxAttachmentBytes ?? 10 * 1024 * 1024,
      linkTypes: options.linkTypes ?? DEFAULT_LINK_TYPES,
    };
    this.linkTypes = this.opts.linkTypes.map((t, i) => ({ id: String(10000 + i), ...t }));
  }

  // ------------------------------------------------------------ test setup

  addUser(u: { readonly accountId: string; readonly displayName: string; readonly globalAdmin?: boolean }): void {
    this.users.set(u.accountId, { accountId: u.accountId, displayName: u.displayName });
    if (u.globalAdmin === true) this.globalAdmins.add(u.accountId);
  }

  /** Adds a project directly (no permission checks). */
  addProject(p: {
    readonly key: string;
    readonly name: string;
    readonly leadAccountId?: string;
    readonly issueTypes?: readonly string[];
    readonly simplified?: boolean;
    readonly admins?: readonly string[];
  }): ProjectInfo {
    if (!PROJECT_KEY_RE.test(p.key)) throw new RangeError(`invalid project key ${p.key}`);
    if (this.projects.has(p.key)) throw new RangeError(`project ${p.key} exists`);
    const rec: ProjectRec = {
      id: String(++this.seq.project),
      key: p.key,
      name: p.name,
      ...(p.leadAccountId !== undefined ? { leadAccountId: p.leadAccountId } : {}),
      issueTypes: (p.issueTypes ?? DEFAULT_ISSUE_TYPES).map((name) => ({ id: String(++this.seq.issueType), name })),
      simplified: p.simplified ?? false,
      roles: [
        { id: String(++this.seq.role), name: "Administrators", actors: new Set(p.leadAccountId !== undefined ? [p.leadAccountId] : []) },
        { id: String(++this.seq.role), name: "Developers", actors: new Set() },
      ],
      admins: new Set([...(p.admins ?? []), ...(p.leadAccountId !== undefined ? [p.leadAccountId] : [])]),
      browseDenied: new Set(),
      editDenied: new Set(),
      appDenied: false,
      nextIssueNumber: 1,
    };
    this.projects.set(rec.key, rec);
    return projectInfo(rec);
  }

  /** The user cannot see the project (issues read as 404, JQL silently excludes them). */
  denyBrowse(accountId: string, projectKey: string): void {
    this.project(projectKey).browseDenied.add(accountId);
  }
  /** The user can see but not edit issues in the project (writes give 403). */
  denyEdit(accountId: string, projectKey: string): void {
    this.project(projectKey).editDenied.add(accountId);
  }
  /** The app user has no access to the project (SPIKE-S3). */
  denyApp(projectKey: string): void {
    this.project(projectKey).appDenied = true;
  }
  addRoleActor(projectKey: string, roleName: string, accountId: string): void {
    const role = this.project(projectKey).roles.find((r) => r.name === roleName);
    if (role === undefined) throw new RangeError(`no role ${roleName}`);
    role.actors.add(accountId);
  }

  /**
   * Makes the next `times` calls of `op` (method name, e.g. `setIssueProperty`, or `*`) fail.
   * Faults fire before permission checks and are consumed in order.
   */
  failNext(op: string, error: PortErrorKind | PortError, times = 1): void {
    const e: PortError = typeof error === "string" ? { kind: error, message: `injected ${error}`, op: `jira.${op}` } : error;
    const list = this.faults.get(op) ?? [];
    for (let i = 0; i < times; i++) list.push(e);
    this.faults.set(op, list);
  }

  /** A JiraGateway for one invocation. Without `accountId` (consumers), `asUser()` calls fail `unauthorized` (SPIKE-A1). */
  gateway(ctx: { readonly accountId?: string }): JiraGateway {
    return {
      asUser: () => new MemoryJiraPort(this, ctx.accountId === undefined ? null : { kind: "user", accountId: ctx.accountId }),
      asApp: () => new MemoryJiraPort(this, { kind: "app" }),
    };
  }

  // ------------------------------------------------------------ inspection (tests only)

  /** Raw stored bytes of an uploaded attachment (the app itself can never read these, D1). */
  attachmentBytes(attachmentId: string): Uint8Array | undefined {
    for (const list of this.attachments.values()) {
      const a = list.find((x) => x.info.id === attachmentId);
      if (a !== undefined) return a.bytes.slice();
    }
    return undefined;
  }
  /** Stored JSON text of a property, bypassing permissions. */
  rawProperty(issue: IssueIdOrKey, key: string): string | undefined {
    const rec = this.findIssue(issue);
    return rec?.properties.get(key);
  }
  issueCount(): number {
    return this.issues.size;
  }
  /** Writes recorded for a principal (ops that change state). */
  writesBy(principal: JiraCall["principal"]): JiraCall[] {
    return this.calls.filter((c) => c.principal === principal && WRITE_OPS.has(c.op));
  }

  // ------------------------------------------------------------ internals used by the port

  /** @internal */
  enter(principal: Principal | null, op: string, target?: string): PortError | null {
    this.calls.push({ principal: principal === null ? "user:<none>" : principal.kind === "app" ? "app" : `user:${principal.accountId}`, op, ...(target !== undefined ? { target } : {}) });
    const list = this.faults.get(op) ?? this.faults.get("*");
    if (list !== undefined && list.length > 0) return list.shift() ?? null;
    if (principal === null) return { kind: "unauthorized", message: "asUser() is not available in this context (SPIKE-A1)", status: 401, op: `jira.${op}` };
    if (principal.kind === "user" && !this.users.has(principal.accountId)) return { kind: "unauthorized", message: "unknown user", status: 401, op: `jira.${op}` };
    return null;
  }

  private project(key: string): ProjectRec {
    const p = this.projects.get(key);
    if (p === undefined) throw new RangeError(`no project ${key}`);
    return p;
  }

  private findIssue(idOrKey: IssueIdOrKey): IssueRec | undefined {
    const id = this.issueKeys.get(idOrKey.toUpperCase()) ?? idOrKey;
    return this.issues.get(id);
  }

  private findProject(keyOrId: string): ProjectRec | undefined {
    const byKey = this.projects.get(keyOrId.toUpperCase());
    if (byKey !== undefined) return byKey;
    for (const p of this.projects.values()) if (p.id === keyOrId) return p;
    return undefined;
  }

  private canBrowse(pr: Principal, p: ProjectRec): boolean {
    return pr.kind === "app" ? !p.appDenied : !p.browseDenied.has(pr.accountId);
  }
  private canEdit(pr: Principal, p: ProjectRec): boolean {
    return this.canBrowse(pr, p) && (pr.kind === "app" || !p.editDenied.has(pr.accountId));
  }
  private isProjectAdmin(pr: Principal, p: ProjectRec): boolean {
    return pr.kind === "app" ? !p.appDenied : this.globalAdmins.has(pr.accountId) || p.admins.has(pr.accountId);
  }
  private actorId(pr: Principal): string {
    return pr.kind === "app" ? APP_ACCOUNT_ID : pr.accountId;
  }
  private now(): string {
    return this.clock.nowIso();
  }

  /** Visible issue or a 404 (Jira does not distinguish "missing" from "hidden"). */
  private visibleIssue(pr: Principal, idOrKey: IssueIdOrKey, op: string): PortResult<IssueRec> {
    const rec = this.findIssue(idOrKey);
    const p = rec === undefined ? undefined : this.projects.get(rec.projectKey);
    if (rec === undefined || p === undefined || !this.canBrowse(pr, p)) {
      return portErr("not-found", "Issue does not exist or you do not have permission to see it.", { status: 404, op: `jira.${op}` });
    }
    return ok(rec);
  }

  private editableIssue(pr: Principal, idOrKey: IssueIdOrKey, op: string): PortResult<IssueRec> {
    const r = this.visibleIssue(pr, idOrKey, op);
    if (!r.ok) return r;
    const p = this.project(r.value.projectKey);
    if (!this.canEdit(pr, p)) return portErr("forbidden", "You do not have permission to edit this issue.", { status: 403, op: `jira.${op}` });
    return r;
  }

  private toIssue(rec: IssueRec, pr: Principal, propertyKeys: readonly string[], withLinks: boolean, extraFields: readonly string[]): JiraIssue {
    const p = this.project(rec.projectKey);
    const properties: Record<string, unknown> = {};
    for (const k of propertyKeys) {
      const raw = rec.properties.get(k);
      if (raw !== undefined) properties[k] = JSON.parse(raw) as unknown;
    }
    const fields: Record<string, unknown> = {};
    for (const f of extraFields) if (rec.fields.has(f)) fields[f] = structuredClone(rec.fields.get(f));
    return {
      id: rec.id,
      key: rec.key,
      projectId: p.id,
      projectKey: rec.projectKey,
      summary: rec.summary,
      issueType: rec.issueType,
      labels: [...rec.labels],
      components: rec.componentIds.map((id) => ({ id, name: this.components.get(id)?.name ?? id })),
      created: rec.created,
      updated: rec.updated,
      ...(rec.description !== undefined ? { description: rec.description } : {}),
      properties,
      ...(withLinks ? { links: this.linksOf(rec, pr) } : {}),
      ...(extraFields.length > 0 ? { fields } : {}),
    };
  }

  private linksOf(rec: IssueRec, pr: Principal): IssueLink[] {
    const out: IssueLink[] = [];
    for (const l of this.links.values()) {
      if (l.inwardId !== rec.id && l.outwardId !== rec.id) continue;
      const a = this.issues.get(l.inwardId);
      const b = this.issues.get(l.outwardId);
      const t = this.linkTypes.find((x) => x.id === l.typeId);
      if (a === undefined || b === undefined || t === undefined) continue;
      const other = a.id === rec.id ? b : a;
      if (!this.canBrowse(pr, this.project(other.projectKey))) continue; // Jira hides links to issues you cannot see
      out.push({ id: l.id, type: { ...t }, inwardIssue: { id: a.id, key: a.key }, outwardIssue: { id: b.id, key: b.key } });
    }
    return out.sort((x, y) => Number(x.id) - Number(y.id));
  }

  private jqlFields(): JqlFields<IssueRec> {
    const fields: Record<string, JqlFieldDef<IssueRec>> = {
      project: { type: "text-ci", get: (i) => [i.projectKey, this.project(i.projectKey).id] },
      issuetype: { type: "text-ci", get: (i) => [i.issueType] },
      type: { type: "text-ci", get: (i) => [i.issueType] },
      labels: { type: "text", get: (i) => i.labels },
      key: { type: "text-ci", get: (i) => [i.key], sortKey: (i) => [i.projectKey, i.number] },
      issuekey: { type: "text-ci", get: (i) => [i.key], sortKey: (i) => [i.projectKey, i.number] },
      id: { type: "number", get: (i) => [Number(i.id)] },
      summary: { type: "text", get: (i) => [i.summary] },
      text: { type: "text", get: (i) => [i.summary, ...(i.description !== undefined ? [i.description] : [])] },
      component: { type: "text-ci", get: (i) => i.componentIds.flatMap((id) => [id, this.components.get(id)?.name ?? id]) },
      reporter: { type: "text", get: (i) => [i.reporterAccountId] },
      created: { type: "date", get: (i) => [Date.parse(i.created)] },
      updated: { type: "date", get: (i) => [Date.parse(i.updated)] },
    };
    if (this.opts.aliasesIndexed) {
      for (const def of this.opts.propertyIndexes) {
        fields[def.alias.toLowerCase()] = aliasField(def, this.clock.nowMs());
      }
    }
    return fields;
  }

  // ------------------------------------------------------------ operations (called by the port)

  /** @internal */
  createIssue(pr: Principal, input: CreateIssueInput): PortResult<IssueRef> {
    const p = this.findProject(input.projectKey);
    if (p === undefined || !this.canBrowse(pr, p)) return portErr("bad-request", "project: valid project is required", { status: 400, op: "jira.createIssue" });
    if (!this.canEdit(pr, p)) return portErr("forbidden", "You do not have permission to create issues in this project.", { status: 403, op: "jira.createIssue" });
    const type = p.issueTypes.find((t) => t.name.toLowerCase() === input.issueType.toLowerCase());
    if (type === undefined) return portErr("bad-request", `issuetype: '${input.issueType}' is not valid for project ${p.key}`, { status: 400, op: "jira.createIssue" });
    if (input.summary.trim() === "" || input.summary.length > SUMMARY_MAX_LENGTH || /[\r\n]/.test(input.summary)) {
      return portErr("bad-request", "summary: must be 1-255 characters on one line", { status: 400, op: "jira.createIssue" });
    }
    const labels = input.labels ?? [];
    if (labels.some((l) => l === "" || /\s/.test(l) || l.length > 255)) return portErr("bad-request", "labels: label cannot contain spaces", { status: 400, op: "jira.createIssue" });
    const comps = input.componentIds ?? [];
    if (comps.some((c) => this.components.get(c)?.projectKey !== p.key)) return portErr("bad-request", "components: unknown component", { status: 400, op: "jira.createIssue" });
    if (input.reporterAccountId !== undefined && !this.users.has(input.reporterAccountId)) {
      return portErr("bad-request", "reporter: user does not exist", { status: 400, op: "jira.createIssue" });
    }
    const id = String(++this.seq.issue);
    const number = p.nextIssueNumber++;
    const key = `${p.key}-${number}`;
    const now = this.now();
    const rec: IssueRec = {
      id,
      key,
      number,
      projectKey: p.key,
      summary: input.summary,
      issueType: type.name,
      labels: [...new Set(labels)],
      componentIds: [...new Set(comps)],
      created: now,
      updated: now,
      ...(input.description !== undefined && input.description !== "" ? { description: input.description } : {}),
      reporterAccountId: input.reporterAccountId ?? this.actorId(pr),
      properties: new Map(),
      fields: new Map(),
    };
    this.issues.set(id, rec);
    this.issueKeys.set(key, id);
    return ok({ id, key });
  }

  /** @internal */
  bulkCreate(pr: Principal, inputs: readonly CreateIssueInput[]): PortResult<BulkCreateResult> {
    if (inputs.length === 0 || inputs.length > BULK_CREATE_MAX) return portErr("bad-request", `bulk create takes 1-${BULK_CREATE_MAX} issues`, { status: 400, op: "jira.bulkCreateIssues" });
    const issues: (IssueRef | null)[] = [];
    const errors: { index: number; message: string }[] = [];
    inputs.forEach((input, index) => {
      const r = this.createIssue(pr, input);
      if (r.ok) issues.push(r.value);
      else {
        issues.push(null);
        errors.push({ index, message: r.error.message });
      }
    });
    return ok({ issues, errors });
  }

  /** @internal */
  getIssue(pr: Principal, idOrKey: IssueIdOrKey, opts: GetIssueOptions): PortResult<JiraIssue> {
    const r = this.visibleIssue(pr, idOrKey, "getIssue");
    return r.ok ? ok(this.toIssue(r.value, pr, opts.properties ?? [], true, opts.extraFields ?? [])) : r;
  }

  /** @internal */
  updateIssue(pr: Principal, idOrKey: IssueIdOrKey, input: UpdateIssueInput): PortResult<void> {
    const r = this.editableIssue(pr, idOrKey, "updateIssue");
    if (!r.ok) return r;
    const rec = r.value;
    if (input.summary !== undefined) {
      if (input.summary.trim() === "" || input.summary.length > SUMMARY_MAX_LENGTH) return portErr("bad-request", "summary: must be 1-255 characters", { status: 400, op: "jira.updateIssue" });
    }
    const add = input.labelsAdd ?? [];
    if (add.some((l) => l === "" || /\s/.test(l))) return portErr("bad-request", "labels: label cannot contain spaces", { status: 400, op: "jira.updateIssue" });
    if (input.componentIds !== undefined && input.componentIds.some((c) => this.components.get(c)?.projectKey !== rec.projectKey)) {
      return portErr("bad-request", "components: unknown component", { status: 400, op: "jira.updateIssue" });
    }
    if (input.summary !== undefined) rec.summary = input.summary;
    const remove = new Set(input.labelsRemove ?? []);
    rec.labels = [...new Set([...rec.labels.filter((l) => !remove.has(l)), ...add])];
    if (input.componentIds !== undefined) rec.componentIds = [...new Set(input.componentIds)];
    for (const [k, v] of Object.entries(input.fields ?? {})) rec.fields.set(k, structuredClone(v));
    rec.updated = this.now();
    return ok(undefined);
  }

  /** @internal */
  deleteIssue(pr: Principal, idOrKey: IssueIdOrKey): PortResult<void> {
    const r = this.editableIssue(pr, idOrKey, "deleteIssue");
    if (!r.ok) return r;
    const rec = r.value;
    this.issues.delete(rec.id);
    this.issueKeys.delete(rec.key);
    for (const [id, l] of this.links) if (l.inwardId === rec.id || l.outwardId === rec.id) this.links.delete(id);
    this.comments.delete(rec.id);
    this.attachments.delete(rec.id);
    return ok(undefined);
  }

  /** @internal */
  search(pr: Principal, input: SearchInput): PortResult<SearchPage> {
    const compiled = compileJql(input.jql, {
      fields: this.jqlFields(),
      nowMs: this.clock.nowMs(),
      defaultOrder: (a, b) => Number(a.id) - Number(b.id),
    });
    if (!compiled.ok) return portErr("bad-request", compiled.error, { status: 400, op: "jira.searchJql" });
    const max = Math.min(Math.max(1, Math.floor(input.maxResults ?? SEARCH_DEFAULT_MAX_RESULTS)), SEARCH_MAX_RESULTS);
    let offset = 0;
    if (input.nextPageToken !== undefined) {
      const m = /^o:(\d+)$/.exec(input.nextPageToken);
      if (m === null) return portErr("bad-request", "invalid nextPageToken", { status: 400, op: "jira.searchJql" });
      offset = Number(m[1]);
    }
    const hits = [...this.issues.values()]
      .filter((i) => this.canBrowse(pr, this.project(i.projectKey)))
      .filter(compiled.value.matches)
      .sort(compiled.value.compare);
    const page = hits.slice(offset, offset + max);
    const props = this.opts.searchReturnsProperties ? (input.properties ?? []) : [];
    const fields = input.fields ?? [];
    const issues = page.map((i) => this.toIssue(i, pr, props, fields.includes("issuelinks"), fields.filter((f) => f !== "issuelinks")));
    const next = offset + max < hits.length ? `o:${offset + max}` : undefined;
    return ok({ issues, ...(next !== undefined ? { nextPageToken: next } : {}) });
  }

  /** @internal */
  getProperty(pr: Principal, idOrKey: IssueIdOrKey, key: string): PortResult<{ readonly value: unknown } | null> {
    const r = this.visibleIssue(pr, idOrKey, "getIssueProperty");
    if (!r.ok) return r;
    const raw = r.value.properties.get(key);
    return ok(raw === undefined ? null : { value: JSON.parse(raw) as unknown });
  }

  /** @internal */
  setProperty(pr: Principal, idOrKey: IssueIdOrKey, key: string, value: unknown): PortResult<void> {
    const r = this.editableIssue(pr, idOrKey, "setIssueProperty");
    if (!r.ok) return r;
    if (key === "" || key.length > PROPERTY_KEY_MAX_LENGTH) return portErr("bad-request", "The property key must be 1-255 characters.", { status: 400, op: "jira.setIssueProperty" });
    let json: string | undefined;
    try {
      json = JSON.stringify(value);
    } catch {
      json = undefined;
    }
    if (json === undefined) return portErr("bad-request", "The property value must be valid JSON.", { status: 400, op: "jira.setIssueProperty" });
    const bytes = utf8ByteLength(json);
    if (bytes > PROPERTY_LIMIT_BYTES) {
      return portErr("property-too-large", `The property value is ${bytes} bytes; the limit is ${PROPERTY_LIMIT_BYTES} bytes.`, { status: 400, op: "jira.setIssueProperty" });
    }
    r.value.properties.set(key, json);
    r.value.updated = this.now();
    return ok(undefined);
  }

  /** @internal */
  deleteProperty(pr: Principal, idOrKey: IssueIdOrKey, key: string): PortResult<void> {
    const r = this.editableIssue(pr, idOrKey, "deleteIssueProperty");
    if (!r.ok) return r;
    r.value.properties.delete(key);
    return ok(undefined);
  }

  /** @internal */
  getLinkTypes(): PortResult<readonly IssueLinkType[]> {
    return ok(this.linkTypes.map((t) => ({ ...t })));
  }

  /** @internal */
  getLinks(pr: Principal, idOrKey: IssueIdOrKey): PortResult<readonly IssueLink[]> {
    const r = this.visibleIssue(pr, idOrKey, "getIssueLinks");
    return r.ok ? ok(this.linksOf(r.value, pr)) : r;
  }

  /** @internal Jira does not create a second identical link; it returns the existing one. */
  createLink(pr: Principal, input: { readonly type: string; readonly inwardIssue: IssueIdOrKey; readonly outwardIssue: IssueIdOrKey }): PortResult<{ readonly id: string }> {
    const t = this.linkTypes.find((x) => x.name.toLowerCase() === input.type.toLowerCase() || x.id === input.type);
    if (t === undefined) return portErr("not-found", `No issue link type with name '${input.type}' found.`, { status: 404, op: "jira.createIssueLink" });
    const a = this.editableIssue(pr, input.inwardIssue, "createIssueLink");
    if (!a.ok) return a;
    const b = this.visibleIssue(pr, input.outwardIssue, "createIssueLink");
    if (!b.ok) return b;
    if (a.value.id === b.value.id) return portErr("bad-request", "You cannot link an issue to itself.", { status: 400, op: "jira.createIssueLink" });
    for (const l of this.links.values()) {
      if (l.typeId === t.id && l.inwardId === a.value.id && l.outwardId === b.value.id) return ok({ id: l.id });
    }
    const id = String(++this.seq.link);
    this.links.set(id, { id, typeId: t.id, inwardId: a.value.id, outwardId: b.value.id });
    a.value.updated = b.value.updated = this.now();
    return ok({ id });
  }

  /** @internal */
  deleteLink(pr: Principal, linkId: string): PortResult<void> {
    const l = this.links.get(linkId);
    if (l === undefined) return portErr("not-found", "No issue link with that id exists.", { status: 404, op: "jira.deleteIssueLink" });
    const a = this.editableIssue(pr, l.inwardId, "deleteIssueLink");
    if (!a.ok) return a;
    this.links.delete(linkId);
    return ok(undefined);
  }

  /** @internal */
  projectComponents(pr: Principal, projectKey: string): PortResult<readonly ComponentInfo[]> {
    const p = this.findProject(projectKey);
    if (p === undefined || !this.canBrowse(pr, p)) return portErr("not-found", "No project could be found.", { status: 404, op: "jira.getProjectComponents" });
    return ok([...this.components.values()].filter((c) => c.projectKey === p.key).map((c) => ({ ...c })));
  }

  /** @internal */
  component(pr: Principal, id: string): PortResult<ComponentInfo> {
    const c = this.components.get(id);
    const p = c === undefined ? undefined : this.projects.get(c.projectKey);
    if (c === undefined || p === undefined || !this.canBrowse(pr, p)) return portErr("not-found", "The component does not exist.", { status: 404, op: "jira.getComponent" });
    return ok({ ...c });
  }

  /** @internal */
  createComponent(pr: Principal, input: CreateComponentInput): PortResult<ComponentInfo> {
    const p = this.findProject(input.projectKey);
    if (p === undefined || !this.canBrowse(pr, p)) return portErr("not-found", "No project could be found.", { status: 404, op: "jira.createComponent" });
    if (!this.isProjectAdmin(pr, p)) return portErr("forbidden", "You must be a project administrator to create components.", { status: 403, op: "jira.createComponent" });
    if (input.name.trim() === "" || input.name.length > 255) return portErr("bad-request", "name: required, at most 255 characters", { status: 400, op: "jira.createComponent" });
    if ([...this.components.values()].some((c) => c.projectKey === p.key && c.name.toLowerCase() === input.name.toLowerCase())) {
      return portErr("bad-request", `A component with the name ${input.name} already exists in this project.`, { status: 400, op: "jira.createComponent" });
    }
    if (input.leadAccountId !== undefined && !this.users.has(input.leadAccountId)) return portErr("bad-request", "leadAccountId: user does not exist", { status: 400, op: "jira.createComponent" });
    const c: ComponentInfo = { id: String(++this.seq.component), name: input.name, projectKey: p.key, ...(input.leadAccountId !== undefined ? { leadAccountId: input.leadAccountId } : {}) };
    this.components.set(c.id, c);
    return ok({ ...c });
  }

  /** @internal */
  addComment(pr: Principal, idOrKey: IssueIdOrKey, body: string): PortResult<{ readonly id: string }> {
    const r = this.visibleIssue(pr, idOrKey, "addComment");
    if (!r.ok) return r;
    if (pr.kind === "user" && this.project(r.value.projectKey).editDenied.has(pr.accountId)) {
      return portErr("forbidden", "You do not have permission to comment on this issue.", { status: 403, op: "jira.addComment" });
    }
    if (body.trim() === "") return portErr("bad-request", "Comment body can not be empty!", { status: 400, op: "jira.addComment" });
    const c: CommentInfo = { id: String(++this.seq.comment), authorAccountId: this.actorId(pr), body, created: this.now() };
    const list = this.comments.get(r.value.id) ?? [];
    list.push(c);
    this.comments.set(r.value.id, list);
    return ok({ id: c.id });
  }

  /** @internal */
  getComments(pr: Principal, idOrKey: IssueIdOrKey): PortResult<readonly CommentInfo[]> {
    const r = this.visibleIssue(pr, idOrKey, "getComments");
    return r.ok ? ok((this.comments.get(r.value.id) ?? []).map((c) => ({ ...c }))) : r;
  }

  /** @internal */
  getAttachments(pr: Principal, idOrKey: IssueIdOrKey): PortResult<readonly AttachmentInfo[]> {
    const r = this.visibleIssue(pr, idOrKey, "getAttachments");
    return r.ok ? ok((this.attachments.get(r.value.id) ?? []).map((a) => ({ ...a.info }))) : r;
  }

  /** @internal */
  upload(pr: Principal, idOrKey: IssueIdOrKey, file: UploadAttachmentInput): PortResult<AttachmentInfo> {
    const mode = this.opts.attachmentUpload;
    const allowed = mode === "everyone" || (mode === "users-only" && pr.kind === "user") || (mode === "app-only" && pr.kind === "app");
    if (!allowed) return portErr("forbidden", "Attachment upload refused (SPIKE-I2 simulation).", { status: 403, op: "jira.uploadAttachment" });
    const r = this.editableIssue(pr, idOrKey, "uploadAttachment");
    if (!r.ok) return r;
    if (file.filename.trim() === "") return portErr("bad-request", "filename is required", { status: 400, op: "jira.uploadAttachment" });
    if (file.bytes.byteLength > this.opts.maxAttachmentBytes) {
      return portErr("value-too-large", `The file is larger than ${this.opts.maxAttachmentBytes} bytes.`, { status: 413, op: "jira.uploadAttachment" });
    }
    const info: AttachmentInfo = {
      id: String(++this.seq.attachment),
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.bytes.byteLength,
      created: this.now(),
      authorAccountId: this.actorId(pr),
    };
    const list = this.attachments.get(r.value.id) ?? [];
    list.push({ info, bytes: file.bytes.slice() });
    this.attachments.set(r.value.id, list);
    return ok({ ...info });
  }

  /** @internal */
  createProject(pr: Principal, input: CreateProjectInput): PortResult<{ readonly id: string; readonly key: string }> {
    const allowed = this.opts.projectCreation === "admins" && (pr.kind === "app" || this.globalAdmins.has(pr.accountId));
    if (!allowed) return portErr("forbidden", "You do not have permission to create projects.", { status: 403, op: "jira.createProject" });
    if (!PROJECT_KEY_RE.test(input.key)) return portErr("bad-request", "key: Project keys must start with an uppercase letter, followed by 1-9 uppercase letters or digits.", { status: 400, op: "jira.createProject" });
    if (this.projects.has(input.key)) return portErr("bad-request", `key: A project with key '${input.key}' already exists.`, { status: 400, op: "jira.createProject" });
    if ([...this.projects.values()].some((p) => p.name.toLowerCase() === input.name.toLowerCase())) {
      return portErr("bad-request", "name: A project with that name already exists.", { status: 400, op: "jira.createProject" });
    }
    if (!this.users.has(input.leadAccountId)) return portErr("bad-request", "leadAccountId: user does not exist", { status: 400, op: "jira.createProject" });
    const info = this.addProject({ key: input.key, name: input.name, leadAccountId: input.leadAccountId, ...(pr.kind === "user" ? { admins: [pr.accountId] } : {}) });
    return ok({ id: info.id, key: info.key });
  }

  /** @internal */
  getProject(pr: Principal, keyOrId: string): PortResult<ProjectInfo> {
    const p = this.findProject(keyOrId);
    if (p === undefined || !this.canBrowse(pr, p)) return portErr("not-found", "No project could be found.", { status: 404, op: "jira.getProject" });
    return ok(projectInfo(p));
  }

  /** @internal */
  projectRoles(pr: Principal, projectKey: string): PortResult<readonly ProjectRoleRef[]> {
    const p = this.findProject(projectKey);
    if (p === undefined || !this.canBrowse(pr, p)) return portErr("not-found", "No project could be found.", { status: 404, op: "jira.getProjectRoles" });
    return ok(p.roles.map((r) => ({ id: r.id, name: r.name })));
  }

  /** @internal */
  projectRole(pr: Principal, projectKey: string, roleId: string): PortResult<ProjectRoleInfo> {
    const p = this.findProject(projectKey);
    if (p === undefined || !this.canBrowse(pr, p)) return portErr("not-found", "No project could be found.", { status: 404, op: "jira.getProjectRole" });
    const r = p.roles.find((x) => x.id === roleId);
    if (r === undefined) return portErr("not-found", "Project role does not exist.", { status: 404, op: "jira.getProjectRole" });
    return ok({ id: r.id, name: r.name, actorAccountIds: [...r.actors].sort() });
  }

  /** @internal */
  getUsers(ids: readonly string[]): PortResult<readonly JiraUser[]> {
    const out: JiraUser[] = [];
    for (const id of new Set(ids)) {
      const u = this.users.get(id);
      if (u !== undefined) out.push({ ...u });
    }
    return ok(out);
  }

  /** @internal */
  myPermissions(pr: { readonly kind: "user"; readonly accountId: string }, input: MyPermissionsInput): PortResult<Readonly<Record<JiraPermissionKey, boolean>>> {
    let p: ProjectRec | undefined;
    if (input.issueKey !== undefined) {
      const r = this.visibleIssue(pr, input.issueKey, "getMyPermissions");
      if (!r.ok) return r;
      p = this.project(r.value.projectKey);
    } else if (input.projectKey !== undefined) {
      p = this.findProject(input.projectKey);
      if (p === undefined) return portErr("not-found", "No project could be found.", { status: 404, op: "jira.getMyPermissions" });
    }
    const admin = this.globalAdmins.has(pr.accountId);
    const scope = p === undefined ? [...this.projects.values()] : [p];
    const any = (f: (q: ProjectRec) => boolean): boolean => scope.some(f);
    const browse = any((q) => this.canBrowse(pr, q));
    const edit = any((q) => this.canEdit(pr, q));
    const out: Record<JiraPermissionKey, boolean> = {
      BROWSE_PROJECTS: browse,
      CREATE_ISSUES: edit,
      EDIT_ISSUES: edit,
      LINK_ISSUES: edit,
      ADD_COMMENTS: edit,
      CREATE_ATTACHMENTS: edit,
      ADMINISTER_PROJECTS: any((q) => this.canBrowse(pr, q) && this.isProjectAdmin(pr, q)),
      ADMINISTER: admin,
    };
    for (const k of Object.keys(out) as JiraPermissionKey[]) if (!input.permissions.includes(k)) out[k] = false;
    return ok(out);
  }

  /** @internal */
  myself(pr: { readonly kind: "user"; readonly accountId: string }): PortResult<JiraUser> {
    const u = this.users.get(pr.accountId);
    return u === undefined ? portErr("unauthorized", "unknown user", { status: 401, op: "jira.getMyself" }) : ok({ ...u });
  }
}

const WRITE_OPS = new Set([
  "createIssue",
  "bulkCreateIssues",
  "updateIssue",
  "deleteIssue",
  "setIssueProperty",
  "deleteIssueProperty",
  "createIssueLink",
  "deleteIssueLink",
  "createComponent",
  "addComment",
  "uploadAttachment",
  "createProject",
]);

function projectInfo(p: ProjectRec): ProjectInfo {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    ...(p.leadAccountId !== undefined ? { leadAccountId: p.leadAccountId } : {}),
    issueTypes: p.issueTypes.map((t) => ({ ...t })),
    simplified: p.simplified,
  };
}

/** Reads `path` (dotted) from a JSON value. */
function atPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** JQL field over an indexed entity property path (`jira:entityProperty`). Arrays index every element. */
function aliasField(def: PropertyIndexDef, nowMs: number): JqlFieldDef<IssueRec> {
  const read = (i: IssueRec): unknown[] => {
    const raw = i.properties.get(def.propertyKey);
    if (raw === undefined) return [];
    const v = atPath(JSON.parse(raw) as unknown, def.path);
    return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
  };
  switch (def.type) {
    case "number":
      return { type: "number", get: (i) => read(i).filter((v): v is number => typeof v === "number" && Number.isFinite(v)) };
    case "date":
      return {
        type: "date",
        get: (i) =>
          read(i)
            .filter((v): v is string => typeof v === "string")
            .map((v) => parseJqlDate(v, nowMs))
            .filter((v): v is number => v !== null),
      };
    case "text":
      return { type: "text", get: (i) => read(i).filter((v): v is string => typeof v === "string") };
    case "string":
    case "user":
      return { type: "text", ordered: true, get: (i) => read(i).filter((v): v is string => typeof v === "string") };
  }
}

// ---------------------------------------------------------------- the port

class MemoryJiraPort implements JiraUserPort {
  constructor(
    private readonly site: MemoryJiraSite,
    private readonly principal: Principal | null,
  ) {}

  private async call<T>(op: string, target: string | undefined, f: (pr: Principal) => PortResult<T>): Promise<PortResult<T>> {
    await Promise.resolve(); // always async, like the real adapter
    const fault = this.site.enter(this.principal, op, target);
    if (fault !== null) return { ok: false, error: fault };
    return f(this.principal as Principal);
  }

  private userOnly(op: string): PortResult<{ readonly kind: "user"; readonly accountId: string }> {
    return this.principal !== null && this.principal.kind === "user"
      ? ok(this.principal)
      : portErr("unauthorized", `${op} is only available on the asUser() port`, { status: 401, op: `jira.${op}` });
  }

  createIssue(input: CreateIssueInput) {
    return this.call("createIssue", input.projectKey, (pr) => this.site.createIssue(pr, input));
  }
  bulkCreateIssues(inputs: readonly CreateIssueInput[]) {
    return this.call("bulkCreateIssues", undefined, (pr) => this.site.bulkCreate(pr, inputs));
  }
  getIssue(issue: IssueIdOrKey, opts: GetIssueOptions = {}) {
    return this.call("getIssue", issue, (pr) => this.site.getIssue(pr, issue, opts));
  }
  updateIssue(issue: IssueIdOrKey, input: UpdateIssueInput) {
    return this.call("updateIssue", issue, (pr) => this.site.updateIssue(pr, issue, input));
  }
  deleteIssue(issue: IssueIdOrKey) {
    return this.call("deleteIssue", issue, (pr) => this.site.deleteIssue(pr, issue));
  }
  searchJql(input: SearchInput) {
    return this.call("searchJql", undefined, (pr) => this.site.search(pr, input));
  }
  getIssueProperty(issue: IssueIdOrKey, key: string) {
    return this.call("getIssueProperty", issue, (pr) => this.site.getProperty(pr, issue, key));
  }
  setIssueProperty(issue: IssueIdOrKey, key: string, value: unknown) {
    return this.call("setIssueProperty", issue, (pr) => this.site.setProperty(pr, issue, key, value));
  }
  deleteIssueProperty(issue: IssueIdOrKey, key: string) {
    return this.call("deleteIssueProperty", issue, (pr) => this.site.deleteProperty(pr, issue, key));
  }
  getIssueLinkTypes() {
    return this.call("getIssueLinkTypes", undefined, () => this.site.getLinkTypes());
  }
  getIssueLinks(issue: IssueIdOrKey) {
    return this.call("getIssueLinks", issue, (pr) => this.site.getLinks(pr, issue));
  }
  createIssueLink(input: { readonly type: string; readonly inwardIssue: IssueIdOrKey; readonly outwardIssue: IssueIdOrKey }) {
    return this.call("createIssueLink", input.inwardIssue, (pr) => this.site.createLink(pr, input));
  }
  deleteIssueLink(linkId: string) {
    return this.call("deleteIssueLink", linkId, (pr) => this.site.deleteLink(pr, linkId));
  }
  getProjectComponents(projectKey: string) {
    return this.call("getProjectComponents", projectKey, (pr) => this.site.projectComponents(pr, projectKey));
  }
  getComponent(componentId: string) {
    return this.call("getComponent", componentId, (pr) => this.site.component(pr, componentId));
  }
  createComponent(input: CreateComponentInput) {
    return this.call("createComponent", input.projectKey, (pr) => this.site.createComponent(pr, input));
  }
  addComment(issue: IssueIdOrKey, bodyText: string) {
    return this.call("addComment", issue, (pr) => this.site.addComment(pr, issue, bodyText));
  }
  getComments(issue: IssueIdOrKey) {
    return this.call("getComments", issue, (pr) => this.site.getComments(pr, issue));
  }
  getAttachments(issue: IssueIdOrKey) {
    return this.call("getAttachments", issue, (pr) => this.site.getAttachments(pr, issue));
  }
  uploadAttachment(issue: IssueIdOrKey, file: UploadAttachmentInput) {
    return this.call("uploadAttachment", issue, (pr) => this.site.upload(pr, issue, file));
  }
  createProject(input: CreateProjectInput) {
    return this.call("createProject", input.key, (pr) => this.site.createProject(pr, input));
  }
  getProject(projectKeyOrId: string) {
    return this.call("getProject", projectKeyOrId, (pr) => this.site.getProject(pr, projectKeyOrId));
  }
  getProjectRoles(projectKey: string) {
    return this.call("getProjectRoles", projectKey, (pr) => this.site.projectRoles(pr, projectKey));
  }
  getProjectRole(projectKey: string, roleId: string) {
    return this.call("getProjectRole", projectKey, (pr) => this.site.projectRole(pr, projectKey, roleId));
  }
  getUsers(accountIds: readonly string[]) {
    return this.call("getUsers", undefined, () => this.site.getUsers(accountIds));
  }
  getMyPermissions(input: MyPermissionsInput) {
    return this.call("getMyPermissions", input.issueKey ?? input.projectKey, () => {
      const u = this.userOnly("getMyPermissions");
      return u.ok ? this.site.myPermissions(u.value, input) : u;
    });
  }
  getMyself() {
    return this.call("getMyself", undefined, () => {
      const u = this.userOnly("getMyself");
      return u.ok ? this.site.myself(u.value) : u;
    });
  }
}
