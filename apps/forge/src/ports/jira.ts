/**
 * JiraPort: the subset of Jira Cloud REST v3 the app uses (ARCHITECTURE §1, §3, §7, §9, §14).
 *
 * Auth is explicit. A {@link JiraGateway} hands out a port bound to one principal:
 * - `asUser()` for everything a human triggers in a resolver or action: issue reads that
 *   authorise index-derived data, permission checks, Accept/Split/Route writes, project
 *   creation for the seed (§9 step 1). Jira's permissions and audit trail then apply.
 *   SPIKE-A1: asUser needs per-user consent; asUser is assumed unavailable in consumers.
 * - `asApp()` for queue consumers (seed steps, Re-sync) and for the documented SPIKE-A1
 *   fallback (asApp write + `tt.triage.by = accountId` + an "on behalf of" comment).
 *
 * Only the user-bound port exposes `getMyPermissions` / `getMyself`, because an app-scoped
 * permission check would authorise nothing (§14 "Authorisation").
 *
 * The server never downloads attachment content (D1): there is deliberately no method for it.
 */
import type { PortResult } from "./result";

// ---------------------------------------------------------------- shared shapes

/** `{id, key}` of an issue, as returned by create calls. */
export interface IssueRef {
  readonly id: string;
  readonly key: string;
}

/** An issue id (`"10001"`) or key (`"TTDEMO-1"`). */
export type IssueIdOrKey = string;

export interface ComponentRef {
  readonly id: string;
  readonly name: string;
}

export interface IssueLinkType {
  readonly id: string;
  /** e.g. `Duplicate`, `Relates`. */
  readonly name: string;
  /** e.g. `is duplicated by`. */
  readonly inward: string;
  /** e.g. `duplicates`. */
  readonly outward: string;
}

/**
 * An issue link with BOTH ends filled in. (Jira's issue `issuelinks` field only names the
 * other end; the adapter fills in the issue that was read, so services never have to care
 * which side they read from.) Semantics follow `POST /rest/api/3/issueLink`.
 */
export interface IssueLink {
  readonly id: string;
  readonly type: IssueLinkType;
  readonly inwardIssue: IssueRef;
  readonly outwardIssue: IssueRef;
}

export interface JiraIssue {
  readonly id: string;
  readonly key: string;
  readonly projectId: string;
  readonly projectKey: string;
  readonly summary: string;
  /** Issue type name, e.g. `Task`. */
  readonly issueType: string;
  readonly labels: readonly string[];
  readonly components: readonly ComponentRef[];
  /** ISO-8601. */
  readonly created: string;
  readonly updated: string;
  /** Plain-text rendering of the description (adapters flatten ADF). Absent when empty. */
  readonly description?: string;
  /**
   * Entity properties that were requested (`properties` option) and exist on the issue.
   * Values are untrusted: parse with the engine `parseTt*` decoders before use (§6.1).
   */
  readonly properties: Readonly<Record<string, unknown>>;
  /** Present when links were requested (always for `getIssue`; for search via `fields: ["issuelinks"]`). */
  readonly links?: readonly IssueLink[];
  /** Extra raw fields that were requested by id (e.g. a Team custom field, SPIKE-R2). */
  readonly fields?: Readonly<Record<string, unknown>>;
}

export interface GetIssueOptions {
  /** Entity property keys to include, e.g. `["tt.event", "tt.triage"]`. Default none. */
  readonly properties?: readonly string[];
  /** Extra raw field ids to include in `fields` (e.g. `customfield_10001`). */
  readonly extraFields?: readonly string[];
}

export interface CreateIssueInput {
  readonly projectKey: string;
  /** Issue type NAME (e.g. `Task`); the adapter resolves the id. */
  readonly issueType: string;
  /** Max 255 characters (Jira limit). */
  readonly summary: string;
  /** Plain text; the adapter converts it to ADF paragraphs. */
  readonly description?: string;
  readonly labels?: readonly string[];
  readonly componentIds?: readonly string[];
  /** Set the reporter only where permitted; otherwise Jira uses the caller (SEED_DATA §10.2). */
  readonly reporterAccountId?: string;
}

export interface BulkCreateResult {
  /** One entry per input, in input order; `null` where that input failed. */
  readonly issues: readonly (IssueRef | null)[];
  readonly errors: readonly { readonly index: number; readonly message: string }[];
}

export interface UpdateIssueInput {
  readonly summary?: string;
  readonly labelsAdd?: readonly string[];
  readonly labelsRemove?: readonly string[];
  /** Replaces the component list. */
  readonly componentIds?: readonly string[];
  /** Raw field writes by field id (e.g. the Team field, SPIKE-R2). */
  readonly fields?: Readonly<Record<string, unknown>>;
}

export interface SearchInput {
  /**
   * JQL. The in-memory fake implements the subset the specs use (see
   * adapters/memory/jql.ts); write queries inside that subset.
   */
  readonly jql: string;
  /** Entity property keys to return with each issue (SPIKE-E3). */
  readonly properties?: readonly string[];
  /** Include `issuelinks` (`["issuelinks"]`) and/or raw extra field ids. */
  readonly fields?: readonly string[];
  /** Page size; default 50, capped at 100. */
  readonly maxResults?: number;
  /** Opaque token from the previous page (enhanced search `/rest/api/3/search/jql`). */
  readonly nextPageToken?: string;
}

export interface SearchPage {
  readonly issues: readonly JiraIssue[];
  /** Absent on the last page. */
  readonly nextPageToken?: string;
}

export interface ComponentInfo {
  readonly id: string;
  readonly name: string;
  readonly projectKey: string;
  readonly leadAccountId?: string;
}

export interface CreateComponentInput {
  readonly projectKey: string;
  readonly name: string;
  readonly leadAccountId?: string;
  readonly description?: string;
}

export interface CommentInfo {
  readonly id: string;
  readonly authorAccountId: string;
  /** Plain text. */
  readonly body: string;
  readonly created: string;
}

export interface AttachmentInfo {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly created: string;
  readonly authorAccountId: string;
}

export interface UploadAttachmentInput {
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface IssueTypeInfo {
  readonly id: string;
  readonly name: string;
}

export interface ProjectInfo {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly leadAccountId?: string;
  readonly issueTypes: readonly IssueTypeInfo[];
  /** `true` for team-managed projects (SPIKE-S1). */
  readonly simplified: boolean;
}

export interface CreateProjectInput {
  /** 2–10 chars, `^[A-Z][A-Z0-9]{1,9}$`. */
  readonly key: string;
  readonly name: string;
  readonly leadAccountId: string;
  readonly description?: string;
  /** SPIKE-S1: which template works on judge sites. */
  readonly projectTypeKey?: "software" | "business";
  readonly projectTemplateKey?: string;
}

export interface ProjectRoleRef {
  readonly id: string;
  readonly name: string;
}

export interface ProjectRoleInfo extends ProjectRoleRef {
  /** accountIds of user actors (group actors are not expanded). */
  readonly actorAccountIds: readonly string[];
}

export interface JiraUser {
  readonly accountId: string;
  readonly displayName: string;
}

/** Jira permission keys the app checks (§14). */
export type JiraPermissionKey =
  | "BROWSE_PROJECTS"
  | "CREATE_ISSUES"
  | "EDIT_ISSUES"
  | "LINK_ISSUES"
  | "ADD_COMMENTS"
  | "CREATE_ATTACHMENTS"
  | "ADMINISTER_PROJECTS"
  | "ADMINISTER";

export interface MyPermissionsInput {
  readonly permissions: readonly JiraPermissionKey[];
  readonly projectKey?: string;
  readonly issueKey?: string;
}

// ---------------------------------------------------------------- the port

export interface JiraPort {
  // Issues
  createIssue(input: CreateIssueInput): Promise<PortResult<IssueRef>>;
  /** At most 50 inputs per call (Jira bulk create limit; SPIKE-S2). */
  bulkCreateIssues(inputs: readonly CreateIssueInput[]): Promise<PortResult<BulkCreateResult>>;
  getIssue(issue: IssueIdOrKey, opts?: GetIssueOptions): Promise<PortResult<JiraIssue>>;
  updateIssue(issue: IssueIdOrKey, input: UpdateIssueInput): Promise<PortResult<void>>;
  /** Used only by "Remove demo data" on `tt-synthetic` issues (§9 step 5). */
  deleteIssue(issue: IssueIdOrKey): Promise<PortResult<void>>;
  searchJql(input: SearchInput): Promise<PortResult<SearchPage>>;

  // Entity properties. Values are JSON; a value over 32,768 bytes fails with `property-too-large`.
  /** `null` when the issue exists but has no such property; `not-found` when the issue is missing or hidden. */
  getIssueProperty(issue: IssueIdOrKey, key: string): Promise<PortResult<{ readonly value: unknown } | null>>;
  setIssueProperty(issue: IssueIdOrKey, key: string, value: unknown): Promise<PortResult<void>>;
  /** Deleting a missing property is not an error. */
  deleteIssueProperty(issue: IssueIdOrKey, key: string): Promise<PortResult<void>>;

  // Issue links
  getIssueLinkTypes(): Promise<PortResult<readonly IssueLinkType[]>>;
  getIssueLinks(issue: IssueIdOrKey): Promise<PortResult<readonly IssueLink[]>>;
  /**
   * Creates `inwardIssue —type→ outwardIssue`. Returns the link id. Services must check for an
   * existing link of the same type and direction first (§7.5 idempotence).
   */
  createIssueLink(input: { readonly type: string; readonly inwardIssue: IssueIdOrKey; readonly outwardIssue: IssueIdOrKey }): Promise<PortResult<{ readonly id: string }>>;
  deleteIssueLink(linkId: string): Promise<PortResult<void>>;

  // Components
  getProjectComponents(projectKey: string): Promise<PortResult<readonly ComponentInfo[]>>;
  /** Component lead lookup for the routing fallback (§11). */
  getComponent(componentId: string): Promise<PortResult<ComponentInfo>>;
  createComponent(input: CreateComponentInput): Promise<PortResult<ComponentInfo>>;

  // Comments
  addComment(issue: IssueIdOrKey, bodyText: string): Promise<PortResult<{ readonly id: string }>>;
  getComments(issue: IssueIdOrKey): Promise<PortResult<readonly CommentInfo[]>>;

  // Attachments (metadata + upload only; never content download, D1)
  getAttachments(issue: IssueIdOrKey): Promise<PortResult<readonly AttachmentInfo[]>>;
  /** SPIKE-I2: multipart upload via `requestJira` (`X-Atlassian-Token: no-check`) is unverified. */
  uploadAttachment(issue: IssueIdOrKey, file: UploadAttachmentInput): Promise<PortResult<AttachmentInfo>>;

  // Projects
  /** SPIKE-S1: needs `manage:jira-project`; may be refused on judge sites (fallback: pick a project). */
  createProject(input: CreateProjectInput): Promise<PortResult<{ readonly id: string; readonly key: string }>>;
  getProject(projectKeyOrId: string): Promise<PortResult<ProjectInfo>>;
  getProjectRoles(projectKey: string): Promise<PortResult<readonly ProjectRoleRef[]>>;
  /** Role actors for the routing fallback (§11). */
  getProjectRole(projectKey: string, roleId: string): Promise<PortResult<ProjectRoleInfo>>;

  // Users
  /** Display names for accountIds (fetched live, never stored, §3 "Personal data"). Unknown ids are omitted. */
  getUsers(accountIds: readonly string[]): Promise<PortResult<readonly JiraUser[]>>;
}

/** The user-bound port: adds checks that only make sense for the calling human (§14). */
export interface JiraUserPort extends JiraPort {
  /** `/rest/api/3/mypermissions`. Unknown keys come back `false`. */
  getMyPermissions(input: MyPermissionsInput): Promise<PortResult<Readonly<Record<JiraPermissionKey, boolean>>>>;
  getMyself(): Promise<PortResult<JiraUser>>;
}

/** Per-invocation factory: pick the principal explicitly at each call site. */
export interface JiraGateway {
  asUser(): JiraUserPort;
  asApp(): JiraPort;
}

/** Jira's documented property-key limit. */
export const PROPERTY_KEY_MAX_LENGTH = 255;
/** Jira's summary length limit. */
export const SUMMARY_MAX_LENGTH = 255;
/** Jira bulk-create limit per call. */
export const BULK_CREATE_MAX = 50;
/** Search page size bounds used by the app. */
export const SEARCH_DEFAULT_MAX_RESULTS = 50;
export const SEARCH_MAX_RESULTS = 100;
