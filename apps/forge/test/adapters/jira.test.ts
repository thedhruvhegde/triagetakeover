import { describe, expect, it } from "vitest";
import { createHttpClient } from "../../src/adapters/forge/http.js";
import { ForgeJiraPort, multipartBody, toLinks } from "../../src/adapters/forge/jira.js";
import { instantPolicy, response, scriptedRequester, type FakeResponse } from "./helpers.js";

const FIELDS = "summary%2Cissuetype%2Clabels%2Ccomponents%2Ccreated%2Cupdated%2Cdescription%2Cproject";

function portWith(routes: Parameters<typeof scriptedRequester>[0], fallback?: Parameters<typeof scriptedRequester>[1]) {
  const s = scriptedRequester(routes, fallback);
  return { port: new ForgeJiraPort(createHttpClient(s.requester, instantPolicy())), calls: s.calls };
}

const PROJECT = {
  id: "10000",
  key: "TTDEMO",
  name: "Takeover Triage Demo [SYNTHETIC]",
  lead: { accountId: "u-admin" },
  issueTypes: [
    { id: "10001", name: "Task" },
    { id: "10002", name: "Bug" },
  ],
  simplified: false,
};

const ISSUE = {
  id: "20001",
  key: "TTDEMO-1",
  fields: {
    summary: "[SYNTHETIC] Lane loss on cam-B",
    issuetype: { id: "10001", name: "Task" },
    labels: ["tt-takeover", "tt-synthetic"],
    components: [{ id: "30001", name: "Perception" }],
    created: "2026-11-16T08:00:00.000+0000",
    updated: "2026-11-16T09:00:00.000+0000",
    description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Synthetic event." }] }] },
    project: { id: "10000", key: "TTDEMO" },
    issuelinks: [
      { id: "40002", type: { id: "10003", name: "Relates", inward: "relates to", outward: "relates to" }, inwardIssue: { id: "20009", key: "TTDEMO-9" } },
      { id: "40001", type: { id: "10002", name: "Duplicate", inward: "is duplicated by", outward: "duplicates" }, outwardIssue: { id: "20005", key: "TTDEMO-5" } },
    ],
    customfield_10001: { id: "team-1" },
  },
  properties: { "tt.event": { v: 1 }, unrequested: 1 },
};

describe("ForgeJiraPort: issues", () => {
  it("getIssue asks for the base fields, links, extra fields and properties, and maps the result", async () => {
    const { port, calls } = portWith({
      [`GET /rest/api/3/issue/TTDEMO-1?fields=${FIELDS}%2Cissuelinks%2Ccustomfield_10001&properties=tt.event%2Ctt.triage`]: response(200, ISSUE),
    });
    const r = await port.getIssue("TTDEMO-1", { properties: ["tt.event", "tt.triage"], extraFields: ["customfield_10001"] });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect(r).toEqual({
      ok: true,
      value: {
        id: "20001",
        key: "TTDEMO-1",
        projectId: "10000",
        projectKey: "TTDEMO",
        summary: "[SYNTHETIC] Lane loss on cam-B",
        issueType: "Task",
        labels: ["tt-takeover", "tt-synthetic"],
        components: [{ id: "30001", name: "Perception" }],
        created: "2026-11-16T08:00:00.000+0000",
        updated: "2026-11-16T09:00:00.000+0000",
        description: "Synthetic event.",
        properties: { "tt.event": { v: 1 } },
        links: [
          {
            id: "40001",
            type: { id: "10002", name: "Duplicate", inward: "is duplicated by", outward: "duplicates" },
            inwardIssue: { id: "20001", key: "TTDEMO-1" },
            outwardIssue: { id: "20005", key: "TTDEMO-5" },
          },
          {
            id: "40002",
            type: { id: "10003", name: "Relates", inward: "relates to", outward: "relates to" },
            inwardIssue: { id: "20009", key: "TTDEMO-9" },
            outwardIssue: { id: "20001", key: "TTDEMO-1" },
          },
        ],
        fields: { customfield_10001: { id: "team-1" } },
      },
    });
  });

  it("encodes path parameters and refuses path manipulation without calling Jira", async () => {
    const { port, calls } = portWith({});
    const r = await port.getIssue("../../rest/api/3/myself");
    expect(r.ok ? null : r.error.kind).toBe("bad-request");
    expect(calls).toHaveLength(0);
  });

  it("hidden issues answer not-found (Jira 404 leaks nothing)", async () => {
    const { port } = portWith({}, () => response(404, { errorMessages: ["Issue does not exist or you do not have permission to see it."] }));
    const r = await port.getIssue("TTDEMO-99");
    expect(r.ok ? null : r.error).toMatchObject({ kind: "not-found", status: 404, op: "jira.getIssue" });
  });

  it("createIssue resolves the issue type id once per project and sends ADF, labels, components, reporter", async () => {
    const { port, calls } = portWith({
      "GET /rest/api/3/project/TTDEMO": response(200, PROJECT),
      "POST /rest/api/3/issue": response(201, { id: "20002", key: "TTDEMO-2", self: "https://x/rest/api/3/issue/20002" }),
    });
    const input = { projectKey: "TTDEMO", issueType: "task", summary: "S", description: "Line [~accountid:u-1]", labels: ["tt-takeover", "tt-takeover"], componentIds: ["30001"], reporterAccountId: "u-1" };
    expect(await port.createIssue(input)).toEqual({ ok: true, value: { id: "20002", key: "TTDEMO-2" } });
    await port.createIssue({ ...input, description: "" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /rest/api/3/project/TTDEMO", "POST /rest/api/3/issue", "POST /rest/api/3/issue"]);
    expect(calls[1]?.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
    expect(calls[1]?.body).toEqual({
      fields: {
        project: { key: "TTDEMO" },
        issuetype: { id: "10001" },
        summary: "S",
        description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Line " }, { type: "mention", attrs: { id: "u-1" } }] }] },
        labels: ["tt-takeover"],
        components: [{ id: "30001" }],
        reporter: { id: "u-1" },
      },
    });
    expect((calls[2]?.body as { fields: Record<string, unknown> }).fields["description"]).toBeUndefined();
  });

  it("createIssue reports an unknown issue type as bad-request without posting", async () => {
    const { port, calls } = portWith({ "GET /rest/api/3/project/TTDEMO": response(200, PROJECT) });
    const r = await port.createIssue({ projectKey: "TTDEMO", issueType: "Epic", summary: "S" });
    expect(r.ok ? null : r.error.kind).toBe("bad-request");
    expect(calls).toHaveLength(1);
  });

  it("bulkCreateIssues keeps input order and maps per-element failures", async () => {
    const { port, calls } = portWith({
      "GET /rest/api/3/project/TTDEMO": response(200, PROJECT),
      "POST /rest/api/3/issue/bulk": response(201, {
        issues: [
          { id: "1", key: "TTDEMO-1" },
          { id: "3", key: "TTDEMO-3" },
        ],
        errors: [{ failedElementNumber: 1, elementErrors: { errorMessages: [], errors: { summary: "required" } }, status: 400 }],
      }),
    });
    const mk = (summary: string) => ({ projectKey: "TTDEMO", issueType: "Task", summary });
    const r = await port.bulkCreateIssues([mk("a"), mk(""), mk("c")]);
    expect(r).toEqual({ ok: true, value: { issues: [{ id: "1", key: "TTDEMO-1" }, null, { id: "3", key: "TTDEMO-3" }], errors: [{ index: 1, message: "summary: required" }] } });
    expect((calls[1]?.body as { issueUpdates: unknown[] }).issueUpdates).toHaveLength(3);
    expect((await port.bulkCreateIssues([])).ok).toBe(false);
  });

  it("updateIssue sends fields and label add/remove operations; nothing to do sends nothing", async () => {
    const { port, calls } = portWith({ "PUT /rest/api/3/issue/TTDEMO-1": response(204) });
    expect((await port.updateIssue("TTDEMO-1", { summary: "New", componentIds: ["1", "1"], labelsAdd: ["a"], labelsRemove: ["b"], fields: { customfield_10001: "t" } })).ok).toBe(true);
    expect(calls[0]?.body).toEqual({ fields: { customfield_10001: "t", summary: "New", components: [{ id: "1" }] }, update: { labels: [{ add: "a" }, { remove: "b" }] } });
    expect((await port.updateIssue("TTDEMO-1", {})).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("deleteIssue uses DELETE", async () => {
    const { port, calls } = portWith({ "DELETE /rest/api/3/issue/TTDEMO-1": response(204) });
    expect((await port.deleteIssue("TTDEMO-1")).ok).toBe(true);
    expect(calls).toHaveLength(1);
  });
});

describe("ForgeJiraPort: search", () => {
  it("posts enhanced JQL search with fields, properties, page size cap and token", async () => {
    const { port, calls } = portWith({
      "POST /rest/api/3/search/jql": response(200, { issues: [ISSUE], nextPageToken: "tok-2", isLast: false }),
    });
    const r = await port.searchJql({ jql: 'project = "TTDEMO" AND ttV = 1', properties: ["tt.event"], fields: ["issuelinks"], maxResults: 500, nextPageToken: "tok-1" });
    expect(calls[0]?.body).toEqual({
      jql: 'project = "TTDEMO" AND ttV = 1',
      maxResults: 100,
      fields: ["summary", "issuetype", "labels", "components", "created", "updated", "description", "project", "issuelinks"],
      properties: ["tt.event"],
      nextPageToken: "tok-1",
    });
    expect(r.ok && r.value.nextPageToken).toBe("tok-2");
    expect(r.ok && r.value.issues[0]?.links?.length).toBe(2);
    expect(r.ok && r.value.issues[0]?.properties).toEqual({ "tt.event": { v: 1 } });
  });

  it("drops the token on the last page and omits links when not requested", async () => {
    const { port } = portWith({ "POST /rest/api/3/search/jql": response(200, { issues: [ISSUE], nextPageToken: "x", isLast: true }) });
    const r = await port.searchJql({ jql: "labels = tt-takeover" });
    expect(r.ok && r.value.nextPageToken).toBeUndefined();
    expect(r.ok && r.value.issues[0]?.links).toBeUndefined();
  });

  it("invalid JQL is a bad-request with Jira's message", async () => {
    const { port } = portWith({ "POST /rest/api/3/search/jql": response(400, { errorMessages: ["Field 'ttV' does not exist."] }) });
    const r = await port.searchJql({ jql: "ttV = 1" });
    expect(r.ok ? null : r.error).toMatchObject({ kind: "bad-request", message: "Field 'ttV' does not exist." });
  });
});

describe("ForgeJiraPort: entity properties", () => {
  const PROP = "/rest/api/3/issue/TTDEMO-1/properties/tt.event";

  it("reads a property value", async () => {
    const { port } = portWith({ [`GET ${PROP}`]: response(200, { key: "tt.event", value: { v: 1 } }) });
    expect(await port.getIssueProperty("TTDEMO-1", "tt.event")).toEqual({ ok: true, value: { value: { v: 1 } } });
  });

  it("tells a missing property (null) from a missing issue (not-found)", async () => {
    const missingProp = portWith({ [`GET ${PROP}`]: response(404, { errorMessages: ["The property with key 'tt.event' does not exist."] }), "GET /rest/api/3/issue/TTDEMO-1?fields=id": response(200, { id: "20001", key: "TTDEMO-1" }) });
    expect(await missingProp.port.getIssueProperty("TTDEMO-1", "tt.event")).toEqual({ ok: true, value: null });
    const missingIssue = portWith({}, () => response(404, { errorMessages: ["Issue does not exist or you do not have permission to see it."] }));
    const r = await missingIssue.port.getIssueProperty("TTDEMO-1", "tt.event");
    expect(r.ok ? null : r.error.kind).toBe("not-found");
  });

  it("writes JSON with PUT and refuses values over 32,768 bytes before sending", async () => {
    const { port, calls } = portWith({ [`PUT ${PROP}`]: response(200) });
    expect((await port.setIssueProperty("TTDEMO-1", "tt.event", { v: 1 })).ok).toBe(true);
    expect(calls[0]).toMatchObject({ method: "PUT", body: { v: 1 }, headers: { "Content-Type": "application/json" } });
    const big = await port.setIssueProperty("TTDEMO-1", "tt.event", { s: "x".repeat(32_768) });
    expect(big.ok ? null : big.error.kind).toBe("property-too-large");
    expect(calls).toHaveLength(1);
  });

  it("maps Jira's own oversize 400 to property-too-large (SPIKE-I1)", async () => {
    const { port } = portWith({ [`PUT ${PROP}`]: response(400, { errorMessages: ["The property value is too large."] }) });
    const r = await port.setIssueProperty("TTDEMO-1", "tt.event", { v: 1 });
    expect(r.ok ? null : r.error.kind).toBe("property-too-large");
  });

  it("deleting a missing property is not an error, on a missing issue it is", async () => {
    const a = portWith({ [`DELETE ${PROP}`]: response(404), "GET /rest/api/3/issue/TTDEMO-1?fields=id": response(200, { id: "1", key: "TTDEMO-1" }) });
    expect((await a.port.deleteIssueProperty("TTDEMO-1", "tt.event")).ok).toBe(true);
    const b = portWith({}, () => response(404));
    expect((await b.port.deleteIssueProperty("TTDEMO-1", "tt.event")).ok).toBe(false);
  });
});

describe("ForgeJiraPort: links", () => {
  it("creates a link by type name and reads back its id from the inward issue", async () => {
    const { port, calls } = portWith({
      "POST /rest/api/3/issueLink": response(201),
      "GET /rest/api/3/issue/TTDEMO-1?fields=issuelinks": response(200, ISSUE),
    });
    expect(await port.createIssueLink({ type: "Duplicate", inwardIssue: "TTDEMO-1", outwardIssue: "TTDEMO-5" })).toEqual({ ok: true, value: { id: "40001" } });
    expect(calls[0]?.body).toEqual({ type: { name: "Duplicate" }, inwardIssue: { key: "TTDEMO-1" }, outwardIssue: { key: "TTDEMO-5" } });
  });

  it("uses {id} for numeric issue and type ids", async () => {
    const { port, calls } = portWith({
      "POST /rest/api/3/issueLink": response(201),
      "GET /rest/api/3/issue/20001?fields=issuelinks": response(200, ISSUE),
    });
    expect((await port.createIssueLink({ type: "10002", inwardIssue: "20001", outwardIssue: "20005" })).ok).toBe(true);
    expect(calls[0]?.body).toEqual({ type: { id: "10002" }, inwardIssue: { id: "20001" }, outwardIssue: { id: "20005" } });
  });

  it("reports invalid-response when the created link cannot be found", async () => {
    const { port } = portWith({ "POST /rest/api/3/issueLink": response(201), "GET /rest/api/3/issue/TTDEMO-1?fields=issuelinks": response(200, { ...ISSUE, fields: { issuelinks: [] } }) });
    const r = await port.createIssueLink({ type: "Duplicate", inwardIssue: "TTDEMO-1", outwardIssue: "TTDEMO-5" });
    expect(r.ok ? null : r.error.kind).toBe("invalid-response");
  });

  it("lists link types and deletes links", async () => {
    const { port, calls } = portWith({
      "GET /rest/api/3/issueLinkType": response(200, { issueLinkTypes: [{ id: "10002", name: "Duplicate", inward: "is duplicated by", outward: "duplicates", self: "x" }, { bogus: true }] }),
      "DELETE /rest/api/3/issueLink/40001": response(204),
    });
    expect(await port.getIssueLinkTypes()).toEqual({ ok: true, value: [{ id: "10002", name: "Duplicate", inward: "is duplicated by", outward: "duplicates" }] });
    expect((await port.deleteIssueLink("40001")).ok).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["GET", "DELETE"]);
  });

  it("toLinks fills in the read issue on the right end", () => {
    const self = { id: "1", key: "A-1" };
    const links = toLinks(self, [{ id: "9", type: { id: "1", name: "Relates", inward: "r", outward: "r" }, inwardIssue: { id: "2", key: "A-2" } }]);
    expect(links).toEqual([{ id: "9", type: { id: "1", name: "Relates", inward: "r", outward: "r" }, inwardIssue: { id: "2", key: "A-2" }, outwardIssue: self }]);
  });
});

describe("ForgeJiraPort: components, comments, attachments", () => {
  it("reads project components and component leads, creates components", async () => {
    const { port, calls } = portWith({
      "GET /rest/api/3/project/TTDEMO/components": response(200, [{ id: "30001", name: "Perception", lead: { accountId: "u-lead" }, project: "TTDEMO" }, { id: "30002", name: "Planning" }]),
      "GET /rest/api/3/component/30001": response(200, { id: "30001", name: "Perception", lead: { accountId: "u-lead" }, project: "TTDEMO" }),
      "POST /rest/api/3/component": response(201, { id: "30003", name: "Controls", project: "TTDEMO", leadAccountId: "u-2" }),
    });
    expect(await port.getProjectComponents("TTDEMO")).toEqual({
      ok: true,
      value: [
        { id: "30001", name: "Perception", projectKey: "TTDEMO", leadAccountId: "u-lead" },
        { id: "30002", name: "Planning", projectKey: "TTDEMO" },
      ],
    });
    expect(await port.getComponent("30001")).toEqual({ ok: true, value: { id: "30001", name: "Perception", projectKey: "TTDEMO", leadAccountId: "u-lead" } });
    expect(await port.createComponent({ projectKey: "TTDEMO", name: "Controls", leadAccountId: "u-2" })).toEqual({ ok: true, value: { id: "30003", name: "Controls", projectKey: "TTDEMO", leadAccountId: "u-2" } });
    expect(calls[2]?.body).toEqual({ project: "TTDEMO", name: "Controls", leadAccountId: "u-2" });
  });

  it("adds an ADF comment with a real mention node; empty comments are refused locally", async () => {
    const { port, calls } = portWith({ "POST /rest/api/3/issue/20010/comment": response(201, { id: "50001" }) });
    expect(await port.addComment("20010", "Suggested contact: [~accountid:u-lead]")).toEqual({ ok: true, value: { id: "50001" } });
    expect(calls[0]?.body).toEqual({ body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Suggested contact: " }, { type: "mention", attrs: { id: "u-lead" } }] }] } });
    expect((await port.addComment("20010", "  ")).ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("pages through comments and flattens ADF", async () => {
    const c = (id: string) => ({ id, author: { accountId: "u" }, body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: `c${id}` }] }] }, created: "t" });
    const { port, calls } = portWith({
      "GET /rest/api/3/issue/TTDEMO-1/comment?startAt=0&maxResults=100&orderBy=created": response(200, { comments: [c("1"), c("2")], total: 3, startAt: 0 }),
      "GET /rest/api/3/issue/TTDEMO-1/comment?startAt=2&maxResults=100&orderBy=created": response(200, { comments: [c("3")], total: 3, startAt: 2 }),
    });
    const r = await port.getComments("TTDEMO-1");
    expect(r.ok && r.value.map((x) => x.body)).toEqual(["c1", "c2", "c3"]);
    expect(calls).toHaveLength(2);
  });

  it("lists attachment metadata only (never content, D1)", async () => {
    const { port, calls } = portWith({
      "GET /rest/api/3/issue/TTDEMO-1?fields=attachment": response(200, { id: "1", key: "TTDEMO-1", fields: { attachment: [{ id: "60001", filename: "tel.csv", mimeType: "text/csv", size: 12, created: "t", author: { accountId: "u" }, content: "https://x/secure/attachment/60001" }] } }),
    });
    expect(await port.getAttachments("TTDEMO-1")).toEqual({ ok: true, value: [{ id: "60001", filename: "tel.csv", mimeType: "text/csv", size: 12, created: "t", authorAccountId: "u" }] });
    expect(calls).toHaveLength(1);
  });

  it("uploads one multipart file with X-Atlassian-Token: no-check (SPIKE-I2)", async () => {
    const { port, calls } = portWith({
      "POST /rest/api/3/issue/TTDEMO-1/attachments": response(200, [{ id: "60002", filename: "frame_1.jpg", mimeType: "image/jpeg", size: 3, created: "t", author: { accountId: "u" } }]),
    });
    const r = await port.uploadAttachment("TTDEMO-1", { filename: 'frame_1".jpg', mimeType: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) });
    expect(r.ok && r.value.id).toBe("60002");
    const call = calls[0];
    expect(call?.headers["X-Atlassian-Token"]).toBe("no-check");
    const boundary = /boundary=(.+)$/.exec(call?.headers["Content-Type"] ?? "")?.[1] ?? "";
    expect(boundary).not.toBe("");
    const text = new TextDecoder("latin1").decode(call?.rawBody as ArrayBuffer);
    expect(text.startsWith(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="frame_1_.jpg"\r\nContent-Type: image/jpeg\r\n\r\n\x01\x02\x03\r\n--${boundary}--\r\n`)).toBe(true);
  });

  it("multipart boundary never occurs in the content", () => {
    const enc = new TextEncoder();
    const evil = enc.encode("----tt-takeover-triage-41-0");
    const padded = new Uint8Array(41);
    padded.set(evil);
    const { boundary } = multipartBody({ filename: "a", mimeType: "text/plain", bytes: padded });
    expect(boundary).toBe("----tt-takeover-triage-41-1");
  });
});

describe("ForgeJiraPort: projects, roles, users, permissions", () => {
  it("creates projects (SPIKE-S1) and reads them", async () => {
    const { port, calls } = portWith({
      "POST /rest/api/3/project": response(201, { id: 10042, key: "TTDEMO", self: "x" }),
      "GET /rest/api/3/project/TTDEMO": response(200, PROJECT),
    });
    expect(await port.createProject({ key: "TTDEMO", name: "Demo", leadAccountId: "u-admin", projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic" })).toEqual({ ok: true, value: { id: "10042", key: "TTDEMO" } });
    expect(calls[0]?.body).toEqual({ key: "TTDEMO", name: "Demo", leadAccountId: "u-admin", projectTypeKey: "software", projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-kanban-classic" });
    expect(await port.getProject("TTDEMO")).toEqual({
      ok: true,
      value: { id: "10000", key: "TTDEMO", name: "Takeover Triage Demo [SYNTHETIC]", leadAccountId: "u-admin", issueTypes: [{ id: "10001", name: "Task" }, { id: "10002", name: "Bug" }], simplified: false },
    });
  });

  it("parses role ids from role URLs and returns user actors only", async () => {
    const { port } = portWith({
      "GET /rest/api/3/project/TTDEMO/role": response(200, { Developers: "https://x/rest/api/3/project/10000/role/10101", Administrators: "https://x/rest/api/3/project/10000/role/10002" }),
      "GET /rest/api/3/project/TTDEMO/role/10002": response(200, {
        id: 10002,
        name: "Administrators",
        actors: [
          { type: "atlassian-user-role-actor", actorUser: { accountId: "u-b" } },
          { type: "atlassian-group-role-actor", actorGroup: { name: "admins" } },
          { type: "atlassian-user-role-actor", actorUser: { accountId: "u-a" } },
        ],
      }),
    });
    expect(await port.getProjectRoles("TTDEMO")).toEqual({ ok: true, value: [{ id: "10002", name: "Administrators" }, { id: "10101", name: "Developers" }] });
    expect(await port.getProjectRole("TTDEMO", "10002")).toEqual({ ok: true, value: { id: "10002", name: "Administrators", actorAccountIds: ["u-a", "u-b"] } });
  });

  it("bulk-reads users in chunks of 50 and follows isLast", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `u${i}`);
    const { port, calls } = portWith({}, (req) => {
      const u = new URL(`https://site${req.path}`);
      const asked = u.searchParams.getAll("accountId");
      const startAt = Number(u.searchParams.get("startAt"));
      if (asked.length === 50 && startAt === 0) return response(200, { values: asked.slice(0, 30).map((a) => ({ accountId: a, displayName: a.toUpperCase() })), isLast: false });
      if (asked.length === 50) return response(200, { values: asked.slice(30).map((a) => ({ accountId: a, displayName: a.toUpperCase() })), isLast: true });
      return response(200, { values: [], isLast: true });
    });
    const r = await port.getUsers([...ids, "u0"]);
    expect(r.ok && r.value.length).toBe(50);
    expect(calls.map((c) => c.path.split("?")[0])).toEqual(["/rest/api/3/user/bulk", "/rest/api/3/user/bulk", "/rest/api/3/user/bulk"]);
    expect(calls[1]?.path.startsWith("/rest/api/3/user/bulk?startAt=30&maxResults=50&accountId=u0&accountId=u1")).toBe(true);
  });

  it("mypermissions: only requested keys can be true", async () => {
    const { port, calls } = portWith({
      "GET /rest/api/3/mypermissions?permissions=BROWSE_PROJECTS%2CADMINISTER_PROJECTS&projectKey=TTDEMO": response(200, { permissions: { BROWSE_PROJECTS: { havePermission: true }, ADMINISTER_PROJECTS: { havePermission: false }, EDIT_ISSUES: { havePermission: true } } }),
    });
    const r = await port.getMyPermissions({ permissions: ["BROWSE_PROJECTS", "ADMINISTER_PROJECTS"], projectKey: "TTDEMO" });
    expect(r.ok && r.value).toEqual({ BROWSE_PROJECTS: true, CREATE_ISSUES: false, EDIT_ISSUES: false, LINK_ISSUES: false, ADD_COMMENTS: false, CREATE_ATTACHMENTS: false, ADMINISTER_PROJECTS: false, ADMINISTER: false });
    expect(calls).toHaveLength(1);
  });

  it("getMyself", async () => {
    const { port } = portWith({ "GET /rest/api/3/myself": response(200, { accountId: "u1", displayName: "Ada" }) });
    expect(await port.getMyself()).toEqual({ ok: true, value: { accountId: "u1", displayName: "Ada" } });
  });
});

describe("ForgeJiraPort without a user (consumers, SPIKE-A1)", () => {
  it("answers unauthorized and never calls the platform", async () => {
    const port = new ForgeJiraPort(null);
    const results = await Promise.all([port.getIssue("TTDEMO-1"), port.searchJql({ jql: "x" }), port.getMyself(), port.bulkCreateIssues([{ projectKey: "TTDEMO", issueType: "Task", summary: "s" }])]);
    for (const r of results) expect(r.ok ? null : r.error).toMatchObject({ kind: "unauthorized", status: 401 });
  });

  it("malformed JSON bodies are invalid-response, not exceptions", async () => {
    const bad: FakeResponse = response(200, "{not json");
    const { port } = portWith({ "GET /rest/api/3/myself": bad });
    const r = await port.getMyself();
    expect(r.ok ? null : r.error.kind).toBe("invalid-response");
  });
});
