/**
 * Real JiraPort over `requestJira` (Jira Cloud REST v3, documented GA endpoints only).
 *
 * One instance is bound to one principal: the gateway (adapters/forge/index.ts) builds it over
 * `api.asUser().requestJira` or `api.asApp().requestJira` (§14). With no user in the
 * invocation (queue consumers, SPIKE-A1) the user port answers `unauthorized` without calling
 * anything, exactly like the in-memory fake.
 *
 * Every path is built with the `route` tagged template, which encodes each parameter, so issue
 * keys and property keys can never alter the path.
 */
import { route, type Route } from "@forge/api";
import { PROPERTY_LIMIT_BYTES, utf8ByteLength } from "@tt/engine";
import {
  BULK_CREATE_MAX,
  SEARCH_DEFAULT_MAX_RESULTS,
  SEARCH_MAX_RESULTS,
  type AttachmentInfo,
  type BulkCreateResult,
  type CommentInfo,
  type ComponentInfo,
  type ComponentRef,
  type CreateComponentInput,
  type CreateIssueInput,
  type CreateProjectInput,
  type GetIssueOptions,
  type IssueIdOrKey,
  type IssueLink,
  type IssueLinkType,
  type IssueRef,
  type IssueTypeInfo,
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
import { ok, portErr, type PortError, type PortResult } from "../../ports/result";
import { adfToText, textToAdf } from "./adf";
import { jsonInit, parseJson, type HttpClient, type HttpReply } from "./http";

// ---------------------------------------------------------------- JSON helpers

type Rec = Readonly<Record<string, unknown>>;
const isRec = (u: unknown): u is Rec => typeof u === "object" && u !== null && !Array.isArray(u);
const rec = (u: unknown): Rec => (isRec(u) ? u : {});
const arr = (u: unknown): readonly unknown[] => (Array.isArray(u) ? u : []);
const str = (u: unknown): string | undefined => (typeof u === "string" ? u : typeof u === "number" && Number.isFinite(u) ? String(u) : undefined);

/** Fields every issue read asks for; `JiraIssue` is built from exactly these. */
export const BASE_ISSUE_FIELDS = ["summary", "issuetype", "labels", "components", "created", "updated", "description", "project"] as const;

const ALL_PERMISSIONS: readonly JiraPermissionKey[] = [
  "BROWSE_PROJECTS",
  "CREATE_ISSUES",
  "EDIT_ISSUES",
  "LINK_ISSUES",
  "ADD_COMMENTS",
  "CREATE_ATTACHMENTS",
  "ADMINISTER_PROJECTS",
  "ADMINISTER",
];

/** `/rest/api/3/user/bulk` page size we ask for (documented max 200; SPIKE: keep it modest). */
const USER_BULK_CHUNK = 50;
const COMMENTS_PAGE = 100;

function invalid(op: string, what: string): { readonly ok: false; readonly error: PortError } {
  return portErr("invalid-response", `unexpected response shape: ${what}`, { op });
}

/** A Jira issue JSON (`{id, key, fields, properties}`) → {@link JiraIssue}. */
export function toJiraIssue(raw: unknown, opts: { readonly links: boolean; readonly extraFields: readonly string[]; readonly properties: readonly string[] }): JiraIssue | null {
  const r = rec(raw);
  const id = str(r["id"]);
  const key = str(r["key"]);
  if (id === undefined || key === undefined) return null;
  const f = rec(r["fields"]);
  const project = rec(f["project"]);
  const props = rec(r["properties"]);
  const properties: Record<string, unknown> = {};
  for (const k of opts.properties) if (k in props && props[k] !== undefined) properties[k] = props[k];
  const description = f["description"] === null || f["description"] === undefined ? "" : adfToText(f["description"]);
  const fields: Record<string, unknown> = {};
  for (const x of opts.extraFields) if (x in f) fields[x] = f[x];
  const components: ComponentRef[] = [];
  for (const c of arr(f["components"])) {
    const cid = str(rec(c)["id"]);
    if (cid !== undefined) components.push({ id: cid, name: str(rec(c)["name"]) ?? cid });
  }
  return {
    id,
    key,
    projectId: str(project["id"]) ?? "",
    projectKey: str(project["key"]) ?? key.replace(/-\d+$/, ""),
    summary: str(f["summary"]) ?? "",
    issueType: str(rec(f["issuetype"])["name"]) ?? "",
    labels: arr(f["labels"]).filter((l): l is string => typeof l === "string"),
    components,
    created: str(f["created"]) ?? "",
    updated: str(f["updated"]) ?? "",
    ...(description !== "" ? { description } : {}),
    properties,
    ...(opts.links ? { links: toLinks({ id, key }, f["issuelinks"]) } : {}),
    ...(opts.extraFields.length > 0 ? { fields } : {}),
  };
}

function toLinkType(u: unknown): IssueLinkType | null {
  const t = rec(u);
  const id = str(t["id"]);
  const name = str(t["name"]);
  if (id === undefined || name === undefined) return null;
  return { id, name, inward: str(t["inward"]) ?? "", outward: str(t["outward"]) ?? "" };
}

function toRef(u: unknown): IssueRef | null {
  const id = str(rec(u)["id"]);
  const key = str(rec(u)["key"]);
  return id === undefined || key === undefined ? null : { id, key };
}

/**
 * The issue's `issuelinks` field names only the OTHER end. An entry with `outwardIssue` means
 * the read issue is the inward end, and vice versa; both ends are filled in so services never
 * care which side they read from (port contract). SPIKE-E3-adjacent: the orientation follows
 * the documented field names (same names as `POST /rest/api/3/issueLink`).
 */
export function toLinks(self: IssueRef, raw: unknown): IssueLink[] {
  const out: IssueLink[] = [];
  for (const u of arr(raw)) {
    const l = rec(u);
    const id = str(l["id"]);
    const type = toLinkType(l["type"]);
    if (id === undefined || type === null) continue;
    const outward = toRef(l["outwardIssue"]);
    const inward = toRef(l["inwardIssue"]);
    if (outward !== null) out.push({ id, type, inwardIssue: self, outwardIssue: outward });
    else if (inward !== null) out.push({ id, type, inwardIssue: inward, outwardIssue: self });
  }
  return out.sort((a, b) => Number(a.id) - Number(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function toComponent(u: unknown, projectKey?: string): ComponentInfo | null {
  const c = rec(u);
  const id = str(c["id"]);
  const name = str(c["name"]);
  if (id === undefined || name === undefined) return null;
  const lead = str(rec(c["lead"])["accountId"]) ?? str(c["leadAccountId"]);
  return { id, name, projectKey: str(c["project"]) ?? projectKey ?? "", ...(lead !== undefined ? { leadAccountId: lead } : {}) };
}

function toAttachment(u: unknown): AttachmentInfo | null {
  const a = rec(u);
  const id = str(a["id"]);
  if (id === undefined) return null;
  return {
    id,
    filename: str(a["filename"]) ?? "",
    mimeType: str(a["mimeType"]) ?? "application/octet-stream",
    size: typeof a["size"] === "number" ? a["size"] : 0,
    created: str(a["created"]) ?? "",
    authorAccountId: str(rec(a["author"])["accountId"]) ?? "",
  };
}

/** Builds a `multipart/form-data` body with one `file` part (SPIKE-I2: unverified via requestJira). */
export function multipartBody(file: UploadAttachmentInput): { readonly boundary: string; readonly body: ArrayBuffer } {
  const enc = new TextEncoder();
  const safeName = file.filename.replace(/["\r\n\\]/g, "_");
  const safeType = /^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType) ? file.mimeType : "application/octet-stream";
  let n = 0;
  let boundary = "";
  // Pick a boundary that does not occur in the content.
  do boundary = `----tt-takeover-triage-${file.bytes.byteLength}-${n++}`;
  while (containsBytes(file.bytes, enc.encode(boundary)));
  const head = enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\nContent-Type: ${safeType}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const out = new Uint8Array(head.byteLength + file.bytes.byteLength + tail.byteLength);
  out.set(head, 0);
  out.set(file.bytes, head.byteLength);
  out.set(tail, head.byteLength + file.bytes.byteLength);
  return { boundary, body: out.buffer };
}

function containsBytes(hay: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function fieldsFor(input: CreateIssueInput, issueTypeId: string): Record<string, unknown> {
  return {
    project: { key: input.projectKey },
    issuetype: { id: issueTypeId },
    summary: input.summary,
    ...(input.description !== undefined && input.description !== "" ? { description: textToAdf(input.description) } : {}),
    ...(input.labels !== undefined && input.labels.length > 0 ? { labels: [...new Set(input.labels)] } : {}),
    ...(input.componentIds !== undefined && input.componentIds.length > 0 ? { components: [...new Set(input.componentIds)].map((id) => ({ id })) } : {}),
    ...(input.reporterAccountId !== undefined ? { reporter: { id: input.reporterAccountId } } : {}),
  };
}

const sameIssue = (ref: IssueRef, idOrKey: IssueIdOrKey): boolean => ref.id === idOrKey || ref.key.toUpperCase() === idOrKey.toUpperCase();

// ---------------------------------------------------------------- the port

export class ForgeJiraPort implements JiraUserPort {
  /** projectKey (upper case) → issue types, memoised for this port's lifetime (one invocation). */
  private readonly issueTypes = new Map<string, readonly IssueTypeInfo[]>();

  /** `http === null`: no user in this invocation; every call fails `unauthorized` (SPIKE-A1). */
  constructor(private readonly http: HttpClient | null) {}

  /**
   * `path` is a thunk: `route` throws on path-manipulation attempts (e.g. `..` in a key), and
   * a port must answer with a value, never throw.
   */
  private async send(op: string, path: () => Route, init?: Parameters<HttpClient["send"]>[2]): Promise<PortResult<HttpReply>> {
    if (this.http === null) return portErr("unauthorized", "asUser() is not available in this context (SPIKE-A1)", { status: 401, op: `jira.${op}` });
    let r: Route;
    try {
      r = path();
    } catch {
      return portErr("bad-request", "invalid identifier in request path", { op: `jira.${op}` });
    }
    return this.http.send(`jira.${op}`, r, init);
  }

  private async json(op: string, path: () => Route, init?: Parameters<HttpClient["send"]>[2]): Promise<PortResult<unknown>> {
    const r = await this.send(op, path, init);
    return r.ok ? parseJson(r.value, `jira.${op}`) : r;
  }

  // ------------------------------------------------------------ issues

  private async issueTypeId(projectKey: string, name: string, op: string): Promise<PortResult<string>> {
    let types = this.issueTypes.get(projectKey.toUpperCase());
    if (types === undefined) {
      const p = await this.getProject(projectKey);
      if (!p.ok) return p.error.kind === "not-found" ? portErr("bad-request", "project: valid project is required", { status: 400, op: `jira.${op}` }) : p;
      types = p.value.issueTypes;
      this.issueTypes.set(projectKey.toUpperCase(), types);
    }
    const t = types.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return t === undefined ? portErr("bad-request", `issuetype: '${name}' is not valid for project ${projectKey}`, { status: 400, op: `jira.${op}` }) : ok(t.id);
  }

  /** `POST /rest/api/3/issue` (issue type id resolved from `GET /rest/api/3/project/{key}`). */
  async createIssue(input: CreateIssueInput): Promise<PortResult<IssueRef>> {
    const type = await this.issueTypeId(input.projectKey, input.issueType, "createIssue");
    if (!type.ok) return type;
    const r = await this.json("createIssue", () => route`/rest/api/3/issue`, jsonInit("POST", { fields: fieldsFor(input, type.value) }));
    if (!r.ok) return r;
    const ref = toRef(r.value);
    return ref === null ? invalid("jira.createIssue", "no id/key") : ok(ref);
  }

  /** `POST /rest/api/3/issue/bulk` (at most 50; Jira answers 201 or 400 with per-element errors). */
  async bulkCreateIssues(inputs: readonly CreateIssueInput[]): Promise<PortResult<BulkCreateResult>> {
    if (inputs.length === 0 || inputs.length > BULK_CREATE_MAX) return portErr("bad-request", `bulk create takes 1-${BULK_CREATE_MAX} issues`, { status: 400, op: "jira.bulkCreateIssues" });
    const issueUpdates: { fields: Record<string, unknown> }[] = [];
    for (const input of inputs) {
      const type = await this.issueTypeId(input.projectKey, input.issueType, "bulkCreateIssues");
      if (!type.ok) return type;
      issueUpdates.push({ fields: fieldsFor(input, type.value) });
    }
    const sent = await this.send("bulkCreateIssues", () => route`/rest/api/3/issue/bulk`, jsonInit("POST", { issueUpdates }));
    // A 400 means every element failed; its body still lists them.
    let body: unknown;
    if (sent.ok) {
      const j = parseJson(sent.value, "jira.bulkCreateIssues");
      if (!j.ok) return j;
      body = j.value;
    } else if (sent.error.status === 400) {
      body = { issues: [], errors: inputs.map((_, i) => ({ failedElementNumber: i, elementErrors: { errorMessages: [sent.error.message] } })) };
    } else return sent;
    const failed = new Map<number, string>();
    for (const e of arr(rec(body)["errors"])) {
      const n = rec(e)["failedElementNumber"];
      if (typeof n === "number") failed.set(n, jiraErrorTextOf(rec(e)["elementErrors"]));
    }
    const created = arr(rec(body)["issues"]).map(toRef);
    const issues: (IssueRef | null)[] = [];
    const errors: { index: number; message: string }[] = [];
    let next = 0;
    for (let i = 0; i < inputs.length; i++) {
      if (failed.has(i)) {
        issues.push(null);
        errors.push({ index: i, message: failed.get(i) ?? "failed" });
        continue;
      }
      const ref = created[next++] ?? null;
      issues.push(ref);
      if (ref === null) errors.push({ index: i, message: "not created" });
    }
    return ok({ issues, errors });
  }

  /** `GET /rest/api/3/issue/{issueIdOrKey}?fields=…,issuelinks&properties=…`. */
  async getIssue(issue: IssueIdOrKey, opts: GetIssueOptions = {}): Promise<PortResult<JiraIssue>> {
    const props = opts.properties ?? [];
    const extra = opts.extraFields ?? [];
    const q = new URLSearchParams({ fields: [...BASE_ISSUE_FIELDS, "issuelinks", ...extra].join(",") });
    if (props.length > 0) q.set("properties", props.join(","));
    const r = await this.json("getIssue", () => route`/rest/api/3/issue/${issue}?${q}`);
    if (!r.ok) return r;
    const i = toJiraIssue(r.value, { links: true, extraFields: extra, properties: props });
    return i === null ? invalid("jira.getIssue", "no id/key") : ok(i);
  }

  /** `PUT /rest/api/3/issue/{issueIdOrKey}` (fields + `update.labels` add/remove). */
  async updateIssue(issue: IssueIdOrKey, input: UpdateIssueInput): Promise<PortResult<void>> {
    const fields: Record<string, unknown> = { ...(input.fields ?? {}) };
    if (input.summary !== undefined) fields["summary"] = input.summary;
    if (input.componentIds !== undefined) fields["components"] = [...new Set(input.componentIds)].map((id) => ({ id }));
    const labels = [...(input.labelsAdd ?? []).map((l) => ({ add: l })), ...(input.labelsRemove ?? []).map((l) => ({ remove: l }))];
    const body = { ...(Object.keys(fields).length > 0 ? { fields } : {}), ...(labels.length > 0 ? { update: { labels } } : {}) };
    if (Object.keys(body).length === 0) return ok(undefined);
    const r = await this.send("updateIssue", () => route`/rest/api/3/issue/${issue}`, jsonInit("PUT", body));
    return r.ok ? ok(undefined) : r;
  }

  /** `DELETE /rest/api/3/issue/{issueIdOrKey}`. */
  async deleteIssue(issue: IssueIdOrKey): Promise<PortResult<void>> {
    const r = await this.send("deleteIssue", () => route`/rest/api/3/issue/${issue}`, { method: "DELETE" });
    return r.ok ? ok(undefined) : r;
  }

  /**
   * `POST /rest/api/3/search/jql` (enhanced search, `nextPageToken` paging).
   * SPIKE-E3: issue `properties` in search results; services fall back to per-issue reads.
   */
  async searchJql(input: SearchInput): Promise<PortResult<SearchPage>> {
    const maxResults = Math.min(Math.max(1, Math.floor(input.maxResults ?? SEARCH_DEFAULT_MAX_RESULTS)), SEARCH_MAX_RESULTS);
    const requested = input.fields ?? [];
    const links = requested.includes("issuelinks");
    const extra = requested.filter((f) => f !== "issuelinks");
    const props = input.properties ?? [];
    const body = {
      jql: input.jql,
      maxResults,
      fields: [...BASE_ISSUE_FIELDS, ...requested],
      ...(props.length > 0 ? { properties: [...props] } : {}),
      ...(input.nextPageToken !== undefined ? { nextPageToken: input.nextPageToken } : {}),
    };
    const r = await this.json("searchJql", () => route`/rest/api/3/search/jql`, jsonInit("POST", body));
    if (!r.ok) return r;
    const issues: JiraIssue[] = [];
    for (const raw of arr(rec(r.value)["issues"])) {
      const i = toJiraIssue(raw, { links, extraFields: extra, properties: props });
      if (i === null) return invalid("jira.searchJql", "issue without id/key");
      issues.push(i);
    }
    const token = str(rec(r.value)["nextPageToken"]);
    const isLast = rec(r.value)["isLast"] === true;
    return ok({ issues, ...(token !== undefined && token !== "" && !isLast ? { nextPageToken: token } : {}) });
  }

  // ------------------------------------------------------------ entity properties

  /** Jira answers 404 both for a missing property and a missing issue; tell them apart. */
  private async issueVisible(issue: IssueIdOrKey, op: string): Promise<PortResult<void>> {
    const r = await this.send(op, () => route`/rest/api/3/issue/${issue}?fields=id`);
    return r.ok ? ok(undefined) : r;
  }

  /** `GET /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}`. */
  async getIssueProperty(issue: IssueIdOrKey, key: string): Promise<PortResult<{ readonly value: unknown } | null>> {
    const r = await this.json("getIssueProperty", () => route`/rest/api/3/issue/${issue}/properties/${key}`);
    if (r.ok) {
      const body = rec(r.value);
      return "value" in body ? ok({ value: body["value"] }) : invalid("jira.getIssueProperty", "no value");
    }
    if (r.error.kind !== "not-found") return r;
    const seen = await this.issueVisible(issue, "getIssueProperty");
    return seen.ok ? ok(null) : seen;
  }

  /**
   * `PUT /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}`. The 32,768-byte limit is
   * VERIFIED; it is checked here first so nothing is sent that Jira would reject (§15 #1).
   */
  async setIssueProperty(issue: IssueIdOrKey, key: string, value: unknown): Promise<PortResult<void>> {
    let json: string | undefined;
    try {
      json = JSON.stringify(value);
    } catch {
      json = undefined;
    }
    if (json === undefined) return portErr("bad-request", "The property value must be valid JSON.", { op: "jira.setIssueProperty" });
    const bytes = utf8ByteLength(json);
    if (bytes > PROPERTY_LIMIT_BYTES) return portErr("property-too-large", `The property value is ${bytes} bytes; the limit is ${PROPERTY_LIMIT_BYTES} bytes.`, { op: "jira.setIssueProperty" });
    const r = await this.send("setIssueProperty", () => route`/rest/api/3/issue/${issue}/properties/${key}`, {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: json,
    });
    if (r.ok) return ok(undefined);
    // SPIKE-I1: the exact 400 text for an oversized value; map it if Jira still refuses.
    if (r.error.status === 400 && /too (large|long|big)|32768|32,768|exceed/i.test(r.error.message)) return portErr("property-too-large", r.error.message, { status: 400, op: "jira.setIssueProperty" });
    return r;
  }

  /** `DELETE /rest/api/3/issue/{issueIdOrKey}/properties/{propertyKey}`; a missing property is fine. */
  async deleteIssueProperty(issue: IssueIdOrKey, key: string): Promise<PortResult<void>> {
    const r = await this.send("deleteIssueProperty", () => route`/rest/api/3/issue/${issue}/properties/${key}`, { method: "DELETE" });
    if (r.ok) return ok(undefined);
    if (r.error.kind !== "not-found") return r;
    return this.issueVisible(issue, "deleteIssueProperty");
  }

  // ------------------------------------------------------------ links

  /** `GET /rest/api/3/issueLinkType`. */
  async getIssueLinkTypes(): Promise<PortResult<readonly IssueLinkType[]>> {
    const r = await this.json("getIssueLinkTypes", () => route`/rest/api/3/issueLinkType`);
    if (!r.ok) return r;
    return ok(arr(rec(r.value)["issueLinkTypes"]).map(toLinkType).filter((t): t is IssueLinkType => t !== null));
  }

  /** Links of one issue (`GET /rest/api/3/issue/{key}?fields=issuelinks`). */
  async getIssueLinks(issue: IssueIdOrKey): Promise<PortResult<readonly IssueLink[]>> {
    const r = await this.json("getIssueLinks", () => route`/rest/api/3/issue/${issue}?fields=issuelinks`);
    if (!r.ok) return r;
    const self = toRef(r.value);
    return self === null ? invalid("jira.getIssueLinks", "no id/key") : ok(toLinks(self, rec(rec(r.value)["fields"])["issuelinks"]));
  }

  /**
   * `POST /rest/api/3/issueLink`. Jira answers 201 with an empty body, so the new link id is
   * read back from the inward issue's links (same type, outward end = the target).
   */
  async createIssueLink(input: { readonly type: string; readonly inwardIssue: IssueIdOrKey; readonly outwardIssue: IssueIdOrKey }): Promise<PortResult<{ readonly id: string }>> {
    const type = /^\d+$/.test(input.type) ? { id: input.type } : { name: input.type };
    const body = { type, inwardIssue: issueRefBody(input.inwardIssue), outwardIssue: issueRefBody(input.outwardIssue) };
    const r = await this.send("createIssueLink", () => route`/rest/api/3/issueLink`, jsonInit("POST", body));
    if (!r.ok) return r;
    const links = await this.getIssueLinks(input.inwardIssue);
    if (!links.ok) return links;
    const want = input.type.toLowerCase();
    const found = links.value.find((l) => (l.type.id === input.type || l.type.name.toLowerCase() === want) && sameIssue(l.inwardIssue, input.inwardIssue) && sameIssue(l.outwardIssue, input.outwardIssue));
    return found === undefined ? invalid("jira.createIssueLink", "created link not found on the inward issue") : ok({ id: found.id });
  }

  /** `DELETE /rest/api/3/issueLink/{linkId}`. */
  async deleteIssueLink(linkId: string): Promise<PortResult<void>> {
    const r = await this.send("deleteIssueLink", () => route`/rest/api/3/issueLink/${linkId}`, { method: "DELETE" });
    return r.ok ? ok(undefined) : r;
  }

  // ------------------------------------------------------------ components

  /** `GET /rest/api/3/project/{projectIdOrKey}/components`. */
  async getProjectComponents(projectKey: string): Promise<PortResult<readonly ComponentInfo[]>> {
    const r = await this.json("getProjectComponents", () => route`/rest/api/3/project/${projectKey}/components`);
    if (!r.ok) return r;
    return ok(arr(r.value).map((c) => toComponent(c, projectKey)).filter((c): c is ComponentInfo => c !== null));
  }

  /** `GET /rest/api/3/component/{id}`. */
  async getComponent(componentId: string): Promise<PortResult<ComponentInfo>> {
    const r = await this.json("getComponent", () => route`/rest/api/3/component/${componentId}`);
    if (!r.ok) return r;
    const c = toComponent(r.value);
    return c === null ? invalid("jira.getComponent", "no id/name") : ok(c);
  }

  /** `POST /rest/api/3/component`. */
  async createComponent(input: CreateComponentInput): Promise<PortResult<ComponentInfo>> {
    const body = {
      project: input.projectKey,
      name: input.name,
      ...(input.leadAccountId !== undefined ? { leadAccountId: input.leadAccountId } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    const r = await this.json("createComponent", () => route`/rest/api/3/component`, jsonInit("POST", body));
    if (!r.ok) return r;
    const c = toComponent(r.value, input.projectKey);
    return c === null ? invalid("jira.createComponent", "no id/name") : ok(c);
  }

  // ------------------------------------------------------------ comments

  /** `POST /rest/api/3/issue/{issueIdOrKey}/comment` (ADF body; `[~accountid:x]` → mention). */
  async addComment(issue: IssueIdOrKey, bodyText: string): Promise<PortResult<{ readonly id: string }>> {
    if (bodyText.trim() === "") return portErr("bad-request", "Comment body can not be empty!", { op: "jira.addComment" });
    const r = await this.json("addComment", () => route`/rest/api/3/issue/${issue}/comment`, jsonInit("POST", { body: textToAdf(bodyText) }));
    if (!r.ok) return r;
    const id = str(rec(r.value)["id"]);
    return id === undefined ? invalid("jira.addComment", "no id") : ok({ id });
  }

  /** `GET /rest/api/3/issue/{issueIdOrKey}/comment` (offset paging, 100 per page). */
  async getComments(issue: IssueIdOrKey): Promise<PortResult<readonly CommentInfo[]>> {
    const out: CommentInfo[] = [];
    for (let startAt = 0; ; ) {
      const q = new URLSearchParams({ startAt: String(startAt), maxResults: String(COMMENTS_PAGE), orderBy: "created" });
      const r = await this.json("getComments", () => route`/rest/api/3/issue/${issue}/comment?${q}`);
      if (!r.ok) return r;
      const page = arr(rec(r.value)["comments"]);
      for (const u of page) {
        const c = rec(u);
        const id = str(c["id"]);
        if (id === undefined) continue;
        out.push({ id, authorAccountId: str(rec(c["author"])["accountId"]) ?? "", body: adfToText(c["body"]), created: str(c["created"]) ?? "" });
      }
      const total = rec(r.value)["total"];
      startAt += page.length;
      if (page.length === 0 || typeof total !== "number" || startAt >= total) break;
    }
    return ok(out);
  }

  // ------------------------------------------------------------ attachments (metadata + upload only, D1)

  /** Attachment metadata via `GET /rest/api/3/issue/{key}?fields=attachment`. Never content. */
  async getAttachments(issue: IssueIdOrKey): Promise<PortResult<readonly AttachmentInfo[]>> {
    const r = await this.json("getAttachments", () => route`/rest/api/3/issue/${issue}?fields=attachment`);
    if (!r.ok) return r;
    return ok(arr(rec(rec(r.value)["fields"])["attachment"]).map(toAttachment).filter((a): a is AttachmentInfo => a !== null));
  }

  /**
   * `POST /rest/api/3/issue/{issueIdOrKey}/attachments`, multipart with
   * `X-Atlassian-Token: no-check`. SPIKE-I2: multipart through `requestJira` with an
   * ArrayBuffer body is unverified; on failure the services fall back (§15 #2).
   */
  async uploadAttachment(issue: IssueIdOrKey, file: UploadAttachmentInput): Promise<PortResult<AttachmentInfo>> {
    if (file.filename.trim() === "") return portErr("bad-request", "filename is required", { op: "jira.uploadAttachment" });
    const { boundary, body } = multipartBody(file);
    const r = await this.json("uploadAttachment", () => route`/rest/api/3/issue/${issue}/attachments`, {
      method: "POST",
      headers: { Accept: "application/json", "X-Atlassian-Token": "no-check", "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    if (!r.ok) return r;
    const a = toAttachment(arr(r.value)[0]);
    return a === null ? invalid("jira.uploadAttachment", "no attachment in response") : ok(a);
  }

  // ------------------------------------------------------------ projects

  /** `POST /rest/api/3/project`. SPIKE-S1: may be refused on judge sites (403). */
  async createProject(input: CreateProjectInput): Promise<PortResult<{ readonly id: string; readonly key: string }>> {
    const body = {
      key: input.key,
      name: input.name,
      leadAccountId: input.leadAccountId,
      projectTypeKey: input.projectTypeKey ?? "software",
      ...(input.projectTemplateKey !== undefined ? { projectTemplateKey: input.projectTemplateKey } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    const r = await this.json("createProject", () => route`/rest/api/3/project`, jsonInit("POST", body));
    if (!r.ok) return r;
    const id = str(rec(r.value)["id"]);
    const key = str(rec(r.value)["key"]);
    return id === undefined || key === undefined ? invalid("jira.createProject", "no id/key") : ok({ id, key });
  }

  /** `GET /rest/api/3/project/{projectIdOrKey}`. */
  async getProject(projectKeyOrId: string): Promise<PortResult<ProjectInfo>> {
    const r = await this.json("getProject", () => route`/rest/api/3/project/${projectKeyOrId}`);
    if (!r.ok) return r;
    const p = rec(r.value);
    const id = str(p["id"]);
    const key = str(p["key"]);
    if (id === undefined || key === undefined) return invalid("jira.getProject", "no id/key");
    const issueTypes: IssueTypeInfo[] = [];
    for (const t of arr(p["issueTypes"])) {
      const tid = str(rec(t)["id"]);
      const name = str(rec(t)["name"]);
      if (tid !== undefined && name !== undefined) issueTypes.push({ id: tid, name });
    }
    const lead = str(rec(p["lead"])["accountId"]);
    this.issueTypes.set(key.toUpperCase(), issueTypes);
    return ok({ id, key, name: str(p["name"]) ?? key, ...(lead !== undefined ? { leadAccountId: lead } : {}), issueTypes, simplified: p["simplified"] === true || p["style"] === "next-gen" });
  }

  /** `GET /rest/api/3/project/{projectIdOrKey}/role` (name → role URL; the id is the URL's last segment). */
  async getProjectRoles(projectKey: string): Promise<PortResult<readonly ProjectRoleRef[]>> {
    const r = await this.json("getProjectRoles", () => route`/rest/api/3/project/${projectKey}/role`);
    if (!r.ok) return r;
    const out: ProjectRoleRef[] = [];
    for (const [name, url] of Object.entries(rec(r.value))) {
      const m = typeof url === "string" ? /\/role\/(\d+)\/?$/.exec(url) : null;
      if (m?.[1] !== undefined) out.push({ id: m[1], name });
    }
    return ok(out.sort((a, b) => Number(a.id) - Number(b.id)));
  }

  /** `GET /rest/api/3/project/{projectIdOrKey}/role/{id}` (user actors only; groups are not expanded). */
  async getProjectRole(projectKey: string, roleId: string): Promise<PortResult<ProjectRoleInfo>> {
    const r = await this.json("getProjectRole", () => route`/rest/api/3/project/${projectKey}/role/${roleId}`);
    if (!r.ok) return r;
    const body = rec(r.value);
    const ids = new Set<string>();
    for (const a of arr(body["actors"])) {
      const acc = str(rec(rec(a)["actorUser"])["accountId"]);
      if (acc !== undefined) ids.add(acc);
    }
    return ok({ id: str(body["id"]) ?? roleId, name: str(body["name"]) ?? "", actorAccountIds: [...ids].sort() });
  }

  // ------------------------------------------------------------ users

  /** `GET /rest/api/3/user/bulk?accountId=…` in chunks, following `isLast`. Unknown ids are omitted. */
  async getUsers(accountIds: readonly string[]): Promise<PortResult<readonly JiraUser[]>> {
    const ids = [...new Set(accountIds)];
    const out: JiraUser[] = [];
    for (let i = 0; i < ids.length; i += USER_BULK_CHUNK) {
      const chunk = ids.slice(i, i + USER_BULK_CHUNK);
      for (let startAt = 0; ; ) {
        const q = new URLSearchParams({ startAt: String(startAt), maxResults: String(USER_BULK_CHUNK) });
        for (const id of chunk) q.append("accountId", id);
        const r = await this.json("getUsers", () => route`/rest/api/3/user/bulk?${q}`);
        if (!r.ok) return r;
        const values = arr(rec(r.value)["values"]);
        for (const u of values) {
          const accountId = str(rec(u)["accountId"]);
          if (accountId !== undefined) out.push({ accountId, displayName: str(rec(u)["displayName"]) ?? accountId });
        }
        startAt += values.length;
        if (rec(r.value)["isLast"] !== false || values.length === 0) break;
      }
    }
    return ok(out);
  }

  // ------------------------------------------------------------ user-bound checks

  /** `GET /rest/api/3/mypermissions?permissions=…&projectKey=…|issueKey=…`. */
  async getMyPermissions(input: MyPermissionsInput): Promise<PortResult<Readonly<Record<JiraPermissionKey, boolean>>>> {
    const q = new URLSearchParams({ permissions: [...new Set(input.permissions)].join(",") });
    if (input.issueKey !== undefined) q.set("issueKey", input.issueKey);
    else if (input.projectKey !== undefined) q.set("projectKey", input.projectKey);
    const r = await this.json("getMyPermissions", () => route`/rest/api/3/mypermissions?${q}`);
    if (!r.ok) return r;
    const perms = rec(rec(r.value)["permissions"]);
    const out = Object.fromEntries(ALL_PERMISSIONS.map((k) => [k, input.permissions.includes(k) && rec(perms[k])["havePermission"] === true])) as Record<JiraPermissionKey, boolean>;
    return ok(out);
  }

  /** `GET /rest/api/3/myself`. */
  async getMyself(): Promise<PortResult<JiraUser>> {
    const r = await this.json("getMyself", () => route`/rest/api/3/myself`);
    if (!r.ok) return r;
    const accountId = str(rec(r.value)["accountId"]);
    return accountId === undefined ? invalid("jira.getMyself", "no accountId") : ok({ accountId, displayName: str(rec(r.value)["displayName"]) ?? accountId });
  }
}

function issueRefBody(idOrKey: IssueIdOrKey): { id: string } | { key: string } {
  return /^\d+$/.test(idOrKey) ? { id: idOrKey } : { key: idOrKey };
}

function jiraErrorTextOf(elementErrors: unknown): string {
  const e = rec(elementErrors);
  const parts: string[] = [];
  for (const m of arr(e["errorMessages"])) if (typeof m === "string") parts.push(m);
  for (const [k, m] of Object.entries(rec(e["errors"]))) if (typeof m === "string") parts.push(`${k}: ${m}`);
  return parts.length > 0 ? parts.join("; ") : "failed";
}
