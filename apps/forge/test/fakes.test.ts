import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PROPERTY_LIMIT_BYTES } from "@tt/engine";
import { compileJql, createMemoryWorld, FakeClock, parseJqlDate, SequentialIds, APP_ACCOUNT_ID } from "../src/adapters/memory/index.js";
import { KvsKeys, PROPERTY_KEYS, LABELS, type EventRow, type JiraPort } from "../src/ports/index.js";
import { ADMIN, ENGINEER, OUTSIDER, demoWorld, must, validEvent } from "./fixtures.js";

async function createEvents(jira: JiraPort, specs: readonly { type: "lane-loss" | "late-brake"; build: string; variant?: string; occurredAt: string }[]): Promise<string[]> {
  const keys: string[] = [];
  for (const s of specs) {
    const ref = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: `[SYNTHETIC] ${s.type} ${s.build}`, labels: [LABELS.takeover, LABELS.synthetic] }));
    must(await jira.setIssueProperty(ref.key, PROPERTY_KEYS.event, validEvent({ type: s.type, build: s.build, ...(s.variant !== undefined ? { variant: s.variant } : {}), occurredAt: s.occurredAt })));
    keys.push(ref.key);
  }
  return keys;
}

async function searchKeys(jira: JiraPort, jql: string): Promise<string[]> {
  return must(await jira.searchJql({ jql, maxResults: 100 })).issues.map((i) => i.key);
}

// ---------------------------------------------------------------- Jira: issues, ids, permissions

describe("MemoryJiraSite issues", () => {
  it("creates deterministic ids and per-project keys TTDEMO-1..", async () => {
    const w = demoWorld();
    const jira = w.ports({ accountId: ENGINEER }).jira.asUser();
    const a = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "one" }));
    const b = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "bug", summary: "two" }));
    expect([a.key, b.key]).toEqual(["TTDEMO-1", "TTDEMO-2"]);
    expect(Number(b.id)).toBe(Number(a.id) + 1);
    const issue = must(await jira.getIssue("ttdemo-2"));
    expect(issue).toMatchObject({ key: "TTDEMO-2", issueType: "Bug", projectKey: "TTDEMO", created: w.clock.nowIso(), properties: {}, links: [] });
    // A second world produces the same ids (deterministic).
    const w2 = demoWorld();
    expect(must(await w2.ports({ accountId: ENGINEER }).jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" }))).toEqual(a);
  });

  it("validates create input like Jira (issue type, summary, labels, reporter)", async () => {
    const jira = demoWorld().ports({ accountId: ENGINEER }).jira.asUser();
    const bad = [
      { projectKey: "TTDEMO", issueType: "Epic", summary: "x" },
      { projectKey: "TTDEMO", issueType: "Task", summary: "" },
      { projectKey: "TTDEMO", issueType: "Task", summary: "a\nb" },
      { projectKey: "TTDEMO", issueType: "Task", summary: "x".repeat(256) },
      { projectKey: "TTDEMO", issueType: "Task", summary: "x", labels: ["has space"] },
      { projectKey: "NOPE", issueType: "Task", summary: "x" },
      { projectKey: "TTDEMO", issueType: "Task", summary: "x", reporterAccountId: "ghost" },
    ];
    for (const input of bad) {
      const r = await jira.createIssue(input);
      expect(r.ok, JSON.stringify(input)).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("bad-request");
    }
  });

  it("bulk-creates up to 50 issues and reports per-item errors", async () => {
    const jira = demoWorld().ports({}).jira.asApp();
    const res = must(await jira.bulkCreateIssues([
      { projectKey: "TTDEMO", issueType: "Task", summary: "a" },
      { projectKey: "TTDEMO", issueType: "Nope", summary: "b" },
      { projectKey: "TTDEMO", issueType: "Task", summary: "c" },
    ]));
    expect(res.issues.map((i) => i?.key ?? null)).toEqual(["TTDEMO-1", null, "TTDEMO-2"]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.index).toBe(1);
    const tooMany = await jira.bulkCreateIssues(Array.from({ length: 51 }, (_, i) => ({ projectKey: "TTDEMO", issueType: "Task", summary: `s${i}` })));
    expect(tooMany.ok).toBe(false);
  });

  it("hides issues of projects the user cannot browse (404, not 403) and filters JQL silently", async () => {
    const w = demoWorld();
    const key = must(await w.ports({ accountId: ADMIN }).jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "secret" })).key;
    const outsider = w.ports({ accountId: OUTSIDER }).jira.asUser();
    const r = await outsider.getIssue(key);
    expect(r.ok ? null : r.error).toMatchObject({ kind: "not-found", status: 404 });
    expect(await searchKeys(outsider, "project = TTDEMO")).toEqual([]);
    const perms = must(await outsider.getMyPermissions({ projectKey: "TTDEMO", permissions: ["BROWSE_PROJECTS", "EDIT_ISSUES"] }));
    expect(perms.BROWSE_PROJECTS).toBe(false);
    expect(perms.EDIT_ISSUES).toBe(false);
  });

  it("gives 403 on writes when the user can browse but not edit", async () => {
    const w = demoWorld();
    const key = must(await w.ports({ accountId: ADMIN }).jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    w.site.denyEdit(ENGINEER, "TTDEMO");
    const jira = w.ports({ accountId: ENGINEER }).jira.asUser();
    expect(must(await jira.getIssue(key)).key).toBe(key);
    const r = await jira.setIssueProperty(key, PROPERTY_KEYS.triage, { v: 1 });
    expect(r.ok ? null : r.error.kind).toBe("forbidden");
    const perms = must(await jira.getMyPermissions({ issueKey: key, permissions: ["BROWSE_PROJECTS", "EDIT_ISSUES", "ADMINISTER"] }));
    expect(perms).toMatchObject({ BROWSE_PROJECTS: true, EDIT_ISSUES: false, ADMINISTER: false });
  });

  it("models SPIKE-A1: asUser is unavailable in a consumer invocation; asApp works; calls are recorded per principal", async () => {
    const w = demoWorld();
    const consumer = w.ports({});
    const r = await consumer.jira.asUser().getIssue("TTDEMO-1");
    expect(r.ok ? null : r.error.kind).toBe("unauthorized");
    must(await consumer.jira.asApp().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "by app" }));
    must(await w.ports({ accountId: ENGINEER }).jira.asUser().addComment("TTDEMO-1", "hello"));
    expect(w.site.writesBy("app").map((c) => c.op)).toEqual(["createIssue"]);
    expect(w.site.writesBy(`user:${ENGINEER}`).map((c) => c.op)).toEqual(["addComment"]);
    const comments = must(await consumer.jira.asApp().getComments("TTDEMO-1"));
    expect(comments[0]?.authorAccountId).toBe(ENGINEER);
  });

  it("only the asUser port answers getMyPermissions / getMyself", async () => {
    const w = demoWorld();
    const user = w.ports({ accountId: ADMIN }).jira.asUser();
    expect(must(await user.getMyself())).toEqual({ accountId: ADMIN, displayName: "Site Admin" });
    expect(must(await user.getMyPermissions({ permissions: ["ADMINISTER"] })).ADMINISTER).toBe(true);
    // The app port has no such methods at the type level; at runtime the fake refuses too.
    const app = w.ports({}).jira.asApp() as unknown as { getMyself(): Promise<{ ok: boolean }> };
    expect((await app.getMyself()).ok).toBe(false);
  });

  it("app access can be denied per project (SPIKE-S3)", async () => {
    const w = demoWorld();
    w.site.denyApp("TTDEMO");
    const r = await w.ports({}).jira.asApp().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" });
    expect(r.ok).toBe(false);
  });

  it("injects faults in order, before permission checks", async () => {
    const w = demoWorld();
    w.site.failNext("getIssue", "rate-limited", 2);
    const jira = w.ports({ accountId: ADMIN }).jira.asUser();
    expect((await jira.getIssue("TTDEMO-99")).ok ? "" : "rl").toBe("rl");
    const second = await jira.getIssue("TTDEMO-99");
    expect(second.ok ? null : second.error.kind).toBe("rate-limited");
    const third = await jira.getIssue("TTDEMO-99");
    expect(third.ok ? null : third.error.kind).toBe("not-found");
  });

  it("updates labels and components and deletes issues with their links", async () => {
    const w = demoWorld();
    const jira = w.ports({ accountId: ADMIN }).jira.asUser();
    const comp = must(await jira.createComponent({ projectKey: "TTDEMO", name: "Perception", leadAccountId: ENGINEER }));
    const a = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "a", labels: ["x"] }));
    const b = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "b" }));
    must(await jira.updateIssue(a.key, { labelsAdd: ["y", "x"], labelsRemove: ["x"], componentIds: [comp.id], fields: { customfield_10001: "team-ari" } }));
    const got = must(await jira.getIssue(a.key, { extraFields: ["customfield_10001"] }));
    expect(got.labels).toEqual(["y", "x"]);
    expect(got.components).toEqual([{ id: comp.id, name: "Perception" }]);
    expect(got.fields).toEqual({ customfield_10001: "team-ari" });
    must(await jira.createIssueLink({ type: "Relates", inwardIssue: a.key, outwardIssue: b.key }));
    must(await jira.deleteIssue(a.key));
    expect(must(await jira.getIssueLinks(b.key))).toEqual([]);
    expect(w.site.issueCount()).toBe(1);
  });
});

// ---------------------------------------------------------------- entity properties

describe("entity properties", () => {
  it("round-trips JSON values and distinguishes a missing property from a missing issue", async () => {
    const w = demoWorld();
    const jira = w.ports({ accountId: ENGINEER }).jira.asUser();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    expect(must(await jira.getIssueProperty(key, PROPERTY_KEYS.event))).toBeNull();
    const ev = validEvent();
    must(await jira.setIssueProperty(key, PROPERTY_KEYS.event, ev));
    expect(must(await jira.getIssueProperty(key, PROPERTY_KEYS.event))).toEqual({ value: ev });
    const missing = await jira.getIssueProperty("TTDEMO-999", PROPERTY_KEYS.event);
    expect(missing.ok ? null : missing.error.kind).toBe("not-found");
    must(await jira.deleteIssueProperty(key, PROPERTY_KEYS.event));
    must(await jira.deleteIssueProperty(key, PROPERTY_KEYS.event)); // idempotent
    expect(must(await jira.getIssueProperty(key, PROPERTY_KEYS.event))).toBeNull();
  });

  it("returns stored copies (callers cannot mutate the site)", async () => {
    const jira = demoWorld().ports({ accountId: ENGINEER }).jira.asUser();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    const value = { a: [1, 2] };
    must(await jira.setIssueProperty(key, "tt.x", value));
    value.a.push(3);
    const got = must(await jira.getIssueProperty(key, "tt.x"));
    expect(got?.value).toEqual({ a: [1, 2] });
  });

  it("enforces the 32,768-byte value limit exactly (UTF-8 bytes of the JSON)", async () => {
    const jira = demoWorld().ports({ accountId: ENGINEER }).jira.asUser();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    // JSON of a string is the string plus 2 quote bytes.
    const atLimit = "a".repeat(PROPERTY_LIMIT_BYTES - 2);
    expect((await jira.setIssueProperty(key, "tt.big", atLimit)).ok).toBe(true);
    const over = await jira.setIssueProperty(key, "tt.big", `${atLimit}a`);
    expect(over.ok ? null : over.error).toMatchObject({ kind: "property-too-large", status: 400 });
    // Multi-byte characters count as bytes, not chars: 'é' is 2 bytes.
    const multi = await jira.setIssueProperty(key, "tt.big", "é".repeat(PROPERTY_LIMIT_BYTES / 2));
    expect(multi.ok ? null : multi.error.kind).toBe("property-too-large");
    // The failed write did not change the stored value.
    expect(must(await jira.getIssueProperty(key, "tt.big"))?.value).toBe(atLimit);
  });

  it("property-tests the limit boundary for arbitrary strings", async () => {
    const jira = demoWorld().ports({ accountId: ENGINEER }).jira.asUser();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: "binary", maxLength: 40 }), fc.integer({ min: 32_700, max: 32_800 }), async (tail, pad) => {
        const value = { pad: "x".repeat(pad), tail };
        const bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
        const r = await jira.setIssueProperty(key, "tt.prop", value);
        return r.ok === bytes <= PROPERTY_LIMIT_BYTES;
      }),
      { numRuns: 200 },
    );
  });

  it("rejects non-JSON values and bad keys", async () => {
    const jira = demoWorld().ports({ accountId: ENGINEER }).jira.asUser();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    expect((await jira.setIssueProperty(key, "tt.u", undefined)).ok).toBe(false);
    expect((await jira.setIssueProperty(key, "", 1)).ok).toBe(false);
    expect((await jira.setIssueProperty(key, "k".repeat(256), 1)).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- JQL subset

describe("JQL subset", () => {
  async function seeded() {
    const w = demoWorld();
    const jira = w.ports({ accountId: ENGINEER }).jira.asUser();
    w.site.addProject({ key: "ADAS", name: "ADAS", leadAccountId: ADMIN });
    const keys = await createEvents(jira, [
      { type: "lane-loss", build: "4.11.3", occurredAt: "2026-11-10T08:00:00Z" },
      { type: "lane-loss", build: "4.12.0", occurredAt: "2026-11-15T10:00:00Z" },
      { type: "late-brake", build: "4.12.0", variant: "cam-A", occurredAt: "2026-11-14T22:30:00Z" },
      { type: "late-brake", build: "4.11.0", variant: "cam-A", occurredAt: "2026-11-01T12:00:00Z" },
    ]);
    const scenario = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Test", summary: "[SYNTHETIC] Scenario: x", labels: [LABELS.scenario, "type:lane-loss", "cond:low-sun-glare"] }));
    const other = must(await jira.createIssue({ projectKey: "ADAS", issueType: "Task", summary: "elsewhere", labels: [LABELS.takeover] }));
    return { w, jira, keys, scenario: scenario.key, other: other.key };
  }

  it("filters by project, issuetype and labels", async () => {
    const { jira, keys, scenario, other } = await seeded();
    expect(await searchKeys(jira, "project = TTDEMO AND labels = tt-takeover")).toEqual(keys);
    expect(await searchKeys(jira, "labels = tt-scenario")).toEqual([scenario]);
    expect(await searchKeys(jira, "issuetype = Test")).toEqual([scenario]);
    expect(await searchKeys(jira, "issuetype = test")).toEqual([scenario]); // names are case-insensitive
    expect(await searchKeys(jira, "project in (TTDEMO, ADAS) AND labels = tt-takeover")).toEqual([...keys, other]);
    expect(await searchKeys(jira, 'labels = "type:lane-loss"')).toEqual([scenario]);
    expect(await searchKeys(jira, "project = ADAS")).toEqual([other]);
  });

  it("supports the tt.event aliases ttV, ttType, ttVariant, ttBuild, ttOccurred", async () => {
    const { jira, keys } = await seeded();
    const [k1, k2, k3, k4] = keys;
    expect(await searchKeys(jira, "ttV = 1 AND project in (TTDEMO)")).toEqual(keys);
    expect(await searchKeys(jira, "ttType = lane-loss")).toEqual([k1, k2]);
    expect(await searchKeys(jira, "ttVariant = cam-A AND ttType = late-brake")).toEqual([k3, k4]);
    expect(await searchKeys(jira, 'ttBuild in ("4.12.0", "4.11.3")')).toEqual([k1, k2, k3]);
    expect(await searchKeys(jira, 'ttBuild != "4.12.0"')).toEqual([k1, k4]);
    expect(await searchKeys(jira, 'ttOccurred >= "2026-11-14"')).toEqual([k2, k3]);
    expect(await searchKeys(jira, 'ttOccurred >= "2026-11-14 23:00"')).toEqual([k2]);
    expect(await searchKeys(jira, 'ttOccurred < "2026-11-14T22:30:00Z"')).toEqual([k1, k4]);
  });

  it("runs the DEMO_SCRIPT S01 query with ORDER BY ttOccurred DESC", async () => {
    const { jira, keys, other } = await seeded();
    const [k1, k2, k3, k4] = keys;
    expect(await searchKeys(jira, 'project = TTDEMO AND labels = tt-takeover AND ttOccurred >= "2026-11-01" ORDER BY ttOccurred DESC')).toEqual([k2, k3, k1, k4]);
    // Empty values (the ADAS issue has no tt.event) sort last.
    expect(await searchKeys(jira, "labels = tt-takeover ORDER BY ttBuild ASC, ttOccurred DESC")).toEqual([k4, k1, k2, k3, other]);
  });

  it("supports OR, NOT, parentheses, NOT IN, IS EMPTY and ~", async () => {
    const { jira, keys, scenario, other } = await seeded();
    const [k1, k2, k3, k4] = keys;
    expect(await searchKeys(jira, "(ttType = lane-loss AND ttBuild = 4.12.0) OR ttBuild = 4.11.0")).toEqual([k2, k4]);
    expect(await searchKeys(jira, "project = TTDEMO AND NOT ttType = lane-loss")).toEqual([k3, k4, scenario]);
    expect(await searchKeys(jira, "project = TTDEMO AND ttType not in (lane-loss)")).toEqual([k3, k4]);
    expect(await searchKeys(jira, "ttV is EMPTY")).toEqual([scenario, other]);
    expect(await searchKeys(jira, "ttV IS NOT EMPTY")).toEqual(keys);
    expect(await searchKeys(jira, 'summary ~ "scenario"')).toEqual([scenario]);
    expect(await searchKeys(jira, "key = ttdemo-1")).toEqual([k1]);
    expect(await searchKeys(jira, "project = TTDEMO ORDER BY key DESC")).toEqual([scenario, k4, k3, k2, k1]);
    expect(await searchKeys(jira, "")).toHaveLength(6);
  });

  it("answers 400 for unknown fields, bad syntax, bad values and unsupported operators", async () => {
    const { jira } = await seeded();
    for (const jql of ["nosuchfield = 1", "project = ", "project = TTDEMO AND", "ttV = one", 'ttOccurred > "yesterday"', "labels > a", "project in (A", "(project = TTDEMO", 'summary = "open', "ORDER BY nosuch"]) {
      const r = await jira.searchJql({ jql });
      expect(r.ok ? jql : r.error.kind, jql).toBe("bad-request");
    }
  });

  it("models SPIKE-E1 failure: without indexing the aliases are unknown fields", async () => {
    const w = demoWorld({ jira: { aliasesIndexed: false } });
    const r = await w.ports({ accountId: ENGINEER }).jira.asUser().searchJql({ jql: "ttV = 1" });
    expect(r.ok ? null : r.error).toMatchObject({ kind: "bad-request", status: 400 });
  });

  it("returns requested properties and links only (SPIKE-E3 modelled by an option)", async () => {
    const { jira, keys } = await seeded();
    const page = must(await jira.searchJql({ jql: "ttType = lane-loss", properties: [PROPERTY_KEYS.event, PROPERTY_KEYS.triage] }));
    expect(Object.keys(page.issues[0]?.properties ?? {})).toEqual([PROPERTY_KEYS.event]);
    expect(page.issues[0]?.links).toBeUndefined();
    const withLinks = must(await jira.searchJql({ jql: `key = ${keys[0] ?? ""}`, fields: ["issuelinks"] }));
    expect(withLinks.issues[0]?.links).toEqual([]);
    const w2 = demoWorld({ jira: { searchReturnsProperties: false } });
    const j2 = w2.ports({ accountId: ENGINEER }).jira.asUser();
    await createEvents(j2, [{ type: "lane-loss", build: "4.12.0", occurredAt: "2026-11-15T10:00:00Z" }]);
    const p2 = must(await j2.searchJql({ jql: "ttV = 1", properties: [PROPERTY_KEYS.event] }));
    expect(p2.issues[0]?.properties).toEqual({});
  });

  it("pages with nextPageToken and caps maxResults at 100", async () => {
    const w = demoWorld();
    const jira = w.ports({}).jira.asApp();
    for (let i = 0; i < 3; i++) {
      must(await jira.bulkCreateIssues(Array.from({ length: 50 }, (_, j) => ({ projectKey: "TTDEMO", issueType: "Task", summary: `s${i}-${j}` }))));
    }
    const seen: string[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const page = must(await jira.searchJql({ jql: "project = TTDEMO", maxResults: 1000, ...(token !== undefined ? { nextPageToken: token } : {}) }));
      expect(page.issues.length).toBeLessThanOrEqual(100);
      seen.push(...page.issues.map((i) => i.key));
      token = page.nextPageToken;
      pages++;
    } while (token !== undefined);
    expect(pages).toBe(2);
    expect(new Set(seen).size).toBe(150);
    expect((await jira.searchJql({ jql: "project = TTDEMO", nextPageToken: "garbage" })).ok).toBe(false);
  });

  it("property: `project = X` returns exactly X's visible issues, ordered by id", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom("TTDEMO", "ADAS", "OTHER"), { minLength: 0, maxLength: 25 }), async (projects) => {
        const w = demoWorld();
        w.site.addProject({ key: "ADAS", name: "ADAS" });
        w.site.addProject({ key: "OTHER", name: "Other" });
        const jira = w.ports({}).jira.asApp();
        const created: { key: string; project: string }[] = [];
        for (const p of projects) created.push({ key: must(await jira.createIssue({ projectKey: p, issueType: "Task", summary: "x" })).key, project: p });
        for (const p of ["TTDEMO", "ADAS", "OTHER"]) {
          const got = await searchKeys(jira, `project = ${p}`);
          if (JSON.stringify(got) !== JSON.stringify(created.filter((c) => c.project === p).map((c) => c.key))) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });

  it("property: ORDER BY ttOccurred DESC is sorted and complete", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: Date.UTC(2026, 9, 1), max: Date.UTC(2026, 10, 30) }), { minLength: 1, maxLength: 15 }), async (times) => {
        const w = demoWorld();
        const jira = w.ports({}).jira.asApp();
        const iso = times.map((t) => new Date(Math.floor(t / 1000) * 1000).toISOString().replace(".000Z", "Z"));
        const keys = await createEvents(jira, iso.map((occurredAt) => ({ type: "lane-loss" as const, build: "4.12.0", occurredAt })));
        const page = must(await jira.searchJql({ jql: "ttV = 1 ORDER BY ttOccurred DESC", properties: [PROPERTY_KEYS.event], maxResults: 100 }));
        const got = page.issues.map((i) => Date.parse((i.properties[PROPERTY_KEYS.event] as { ctx: { occurredAt: string } }).ctx.occurredAt));
        return page.issues.length === keys.length && got.every((t, i) => i === 0 || (got[i - 1] as number) >= t);
      }),
      { numRuns: 30 },
    );
  });

  it("compiles standalone against a custom field model and parses JQL dates", () => {
    const c = compileJql<{ n: number }>("n >= 2 ORDER BY n DESC", { fields: { n: { type: "number", get: (x) => [x.n] } }, defaultOrder: () => 0, nowMs: 0 });
    expect(c.ok).toBe(true);
    if (c.ok) expect([{ n: 1 }, { n: 3 }, { n: 2 }].filter(c.value.matches).sort(c.value.compare)).toEqual([{ n: 3 }, { n: 2 }]);
    const now = Date.UTC(2026, 10, 16, 9);
    expect(parseJqlDate("2026-11-14", now)).toBe(Date.UTC(2026, 10, 14));
    expect(parseJqlDate("2026/11/14 09:30", now)).toBe(Date.UTC(2026, 10, 14, 9, 30));
    expect(parseJqlDate("2026-11-14T09:12:33+01:00", now)).toBe(Date.UTC(2026, 10, 14, 8, 12, 33));
    expect(parseJqlDate("-7d", now)).toBe(now - 7 * 86_400_000);
    expect(parseJqlDate("2026-13-01", now)).toBeNull();
    expect(parseJqlDate("soon", now)).toBeNull();
  });
});

// ---------------------------------------------------------------- links, components, roles, users

describe("links, components, roles and users", () => {
  it("exposes the default link types and creates idempotent, two-sided links", async () => {
    const w = demoWorld();
    const jira = w.ports({ accountId: ENGINEER }).jira.asUser();
    const types = must(await jira.getIssueLinkTypes());
    expect(types.map((t) => t.name)).toEqual(["Blocks", "Cloners", "Duplicate", "Relates"]);
    expect(types.find((t) => t.name === "Duplicate")).toMatchObject({ inward: "is duplicated by", outward: "duplicates" });
    const ev = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "event" }));
    const cl = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "cluster", labels: [LABELS.cluster] }));
    const l1 = must(await jira.createIssueLink({ type: "Duplicate", inwardIssue: ev.key, outwardIssue: cl.key }));
    const l2 = must(await jira.createIssueLink({ type: "duplicate", inwardIssue: ev.key, outwardIssue: cl.key }));
    expect(l2.id).toBe(l1.id);
    const fromEvent = must(await jira.getIssueLinks(ev.key));
    const fromCluster = must(await jira.getIssueLinks(cl.key));
    expect(fromEvent).toEqual(fromCluster);
    expect(fromEvent[0]).toMatchObject({ inwardIssue: ev, outwardIssue: cl, type: { name: "Duplicate" } });
    expect(must(await jira.getIssue(cl.key)).links).toHaveLength(1);
    const missingType = await jira.createIssueLink({ type: "Causes", inwardIssue: ev.key, outwardIssue: cl.key });
    expect(missingType.ok ? null : missingType.error.kind).toBe("not-found");
    expect((await jira.createIssueLink({ type: "Relates", inwardIssue: ev.key, outwardIssue: ev.key })).ok).toBe(false);
    must(await jira.deleteIssueLink(l1.id));
    expect(must(await jira.getIssueLinks(ev.key))).toEqual([]);
    expect((await jira.deleteIssueLink(l1.id)).ok).toBe(false);
  });

  it("supports a site without the Duplicate link type (§15 #17)", async () => {
    const w = demoWorld({ jira: { linkTypes: [{ name: "Relates", inward: "relates to", outward: "relates to" }] } });
    const types = must(await w.ports({ accountId: ENGINEER }).jira.asUser().getIssueLinkTypes());
    expect(types.map((t) => t.name)).toEqual(["Relates"]);
  });

  it("creates components (project admins only) and resolves component leads and role actors", async () => {
    const w = demoWorld();
    const admin = w.ports({ accountId: ADMIN }).jira.asUser();
    const engineer = w.ports({ accountId: ENGINEER }).jira.asUser();
    const denied = await engineer.createComponent({ projectKey: "TTDEMO", name: "Planning" });
    expect(denied.ok ? null : denied.error.kind).toBe("forbidden");
    const c = must(await admin.createComponent({ projectKey: "TTDEMO", name: "Planning", leadAccountId: ENGINEER }));
    expect((await admin.createComponent({ projectKey: "TTDEMO", name: "planning" })).ok).toBe(false);
    expect(must(await engineer.getComponent(c.id))).toEqual({ id: c.id, name: "Planning", projectKey: "TTDEMO", leadAccountId: ENGINEER });
    expect(must(await engineer.getProjectComponents("TTDEMO")).map((x) => x.name)).toEqual(["Planning"]);
    const roles = must(await engineer.getProjectRoles("TTDEMO"));
    expect(roles.map((r) => r.name)).toEqual(["Administrators", "Developers"]);
    w.site.addRoleActor("TTDEMO", "Developers", ENGINEER);
    const dev = roles.find((r) => r.name === "Developers");
    expect(must(await engineer.getProjectRole("TTDEMO", dev?.id ?? ""))).toMatchObject({ name: "Developers", actorAccountIds: [ENGINEER] });
    const outsider = await w.ports({ accountId: OUTSIDER }).jira.asUser().getComponent(c.id);
    expect(outsider.ok ? null : outsider.error.kind).toBe("not-found");
  });

  it("returns display names for known accountIds only", async () => {
    const jira = demoWorld().ports({ accountId: ENGINEER }).jira.asUser();
    expect(must(await jira.getUsers([ADMIN, "ghost", ADMIN]))).toEqual([{ accountId: ADMIN, displayName: "Site Admin" }]);
  });
});

// ---------------------------------------------------------------- attachments, comments, projects

describe("attachments, comments and projects", () => {
  it("stores attachment bytes and returns metadata only", async () => {
    const w = demoWorld();
    const jira = w.ports({}).jira.asApp();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const info = must(await jira.uploadAttachment(key, { filename: "SYNTHETIC_E-001_f1.jpg", mimeType: "image/jpeg", bytes }));
    bytes[0] = 0; // caller mutation does not leak into the site
    expect(info).toMatchObject({ filename: "SYNTHETIC_E-001_f1.jpg", size: 7, authorAccountId: APP_ACCOUNT_ID });
    expect(Array.from(w.site.attachmentBytes(info.id) ?? [])).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(must(await jira.getAttachments(key))).toEqual([info]);
    expect("getAttachmentContent" in jira).toBe(false); // D1: no content download on the port
  });

  it("models SPIKE-I2 refusal modes and the size limit", async () => {
    const w = demoWorld({ jira: { attachmentUpload: "users-only", maxAttachmentBytes: 4 } });
    const app = w.ports({}).jira.asApp();
    const key = must(await app.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    const file = { filename: "a.csv", mimeType: "text/csv", bytes: new Uint8Array([1, 2]) };
    const refused = await app.uploadAttachment(key, file);
    expect(refused.ok ? null : refused.error.kind).toBe("forbidden");
    const user = w.ports({ accountId: ENGINEER }).jira.asUser();
    expect((await user.uploadAttachment(key, file)).ok).toBe(true);
    const big = await user.uploadAttachment(key, { ...file, bytes: new Uint8Array(5) });
    expect(big.ok ? null : big.error.kind).toBe("value-too-large");
  });

  it("creates projects for global admins only and refuses when creation is disabled (SPIKE-S1)", async () => {
    const w = demoWorld();
    const engineer = w.ports({ accountId: ENGINEER }).jira.asUser();
    const refused = await engineer.createProject({ key: "TTNEW", name: "New", leadAccountId: ENGINEER });
    expect(refused.ok ? null : refused.error.kind).toBe("forbidden");
    const admin = w.ports({ accountId: ADMIN }).jira.asUser();
    expect((await admin.createProject({ key: "TTDEMO", name: "dup", leadAccountId: ADMIN })).ok).toBe(false);
    expect((await admin.createProject({ key: "bad", name: "bad", leadAccountId: ADMIN })).ok).toBe(false);
    const p = must(await admin.createProject({ key: "TTNEW", name: "Takeover Triage New [SYNTHETIC]", leadAccountId: ADMIN }));
    const info = must(await admin.getProject(p.key));
    expect(info).toMatchObject({ key: "TTNEW", leadAccountId: ADMIN, simplified: false });
    expect(info.issueTypes.map((t) => t.name)).toEqual(["Task", "Bug", "Story", "Epic", "Subtask"]);
    must(await admin.createComponent({ projectKey: "TTNEW", name: "Perception" }));
    const off = demoWorld({ jira: { projectCreation: "nobody" } });
    expect((await off.ports({ accountId: ADMIN }).jira.asUser().createProject({ key: "TTX", name: "x", leadAccountId: ADMIN })).ok).toBe(false);
  });

  it("rejects empty comments and timestamps with the fake clock", async () => {
    const w = demoWorld();
    const jira = w.ports({ accountId: ENGINEER }).jira.asUser();
    const key = must(await jira.createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "x" })).key;
    expect((await jira.addComment(key, "  ")).ok).toBe(false);
    w.clock.advance({ minutes: 5 });
    must(await jira.addComment(key, "Accepted on behalf of the user"));
    expect(must(await jira.getComments(key))[0]?.created).toBe("2026-11-16T09:05:00.000Z");
  });
});

// ---------------------------------------------------------------- storage

describe("MemoryStorage KVS", () => {
  it("gets, sets, deletes and expires keys against the clock", async () => {
    const w = createMemoryWorld();
    const s = w.storage;
    expect(must(await s.get(KvsKeys.board("TTDEMO")))).toBeUndefined();
    must(await s.set(KvsKeys.board("TTDEMO"), { clusters: 4 }, { ttlSeconds: 60 }));
    expect(must(await s.get(KvsKeys.board("TTDEMO")))).toEqual({ clusters: 4 });
    w.clock.advance({ seconds: 59 });
    expect(must(await s.get(KvsKeys.board("TTDEMO")))).toEqual({ clusters: 4 });
    w.clock.advance({ seconds: 1 });
    expect(must(await s.get(KvsKeys.board("TTDEMO")))).toBeUndefined();
    must(await s.set("config:TTDEMO", { tau: 1 }));
    must(await s.delete("config:TTDEMO"));
    must(await s.delete("config:TTDEMO"));
    expect(must(await s.get("config:TTDEMO"))).toBeUndefined();
  });

  it("setIfAbsent dedupes (Re-sync now, §7.4) and respects expiry", async () => {
    const w = createMemoryWorld();
    expect(must(await w.storage.setIfAbsent(KvsKeys.resync("TTDEMO"), { state: "pending" }, { ttlSeconds: 900 }))).toBe(true);
    expect(must(await w.storage.setIfAbsent(KvsKeys.resync("TTDEMO"), { state: "pending" }))).toBe(false);
    w.clock.advance({ seconds: 900 });
    expect(must(await w.storage.setIfAbsent(KvsKeys.resync("TTDEMO"), { state: "pending" }))).toBe(true);
  });

  it("queries by prefix in key order with cursors", async () => {
    const s = createMemoryWorld().storage;
    for (const id of ["c", "a", "b"]) must(await s.set(KvsKeys.preset("TTDEMO", id), { id }));
    must(await s.set(KvsKeys.preset("ADAS", "z"), { id: "z" }));
    const p1 = must(await s.queryByPrefix("preset:TTDEMO:", { limit: 2 }));
    expect(p1.items.map((i) => i.key)).toEqual(["preset:TTDEMO:a", "preset:TTDEMO:b"]);
    const p2 = must(await s.queryByPrefix("preset:TTDEMO:", { limit: 2, ...(p1.nextCursor !== undefined ? { cursor: p1.nextCursor } : {}) }));
    expect(p2.items.map((i) => i.value)).toEqual([{ id: "c" }]);
    expect(p2.nextCursor).toBeUndefined();
    expect((await s.queryByPrefix("preset:", { limit: 101 })).ok).toBe(false);
  });

  it("validates keys, values and limits", async () => {
    const s = createMemoryWorld().storage;
    expect((await s.set("bad/key", 1)).ok).toBe(false);
    expect((await s.set("   ", 1)).ok).toBe(false);
    expect((await s.set("k".repeat(501), 1)).ok).toBe(false);
    expect((await s.set("k", undefined)).ok).toBe(false);
    const big = await s.set("k", "x".repeat(240 * 1024));
    expect(big.ok ? null : big.error.kind).toBe("value-too-large");
    expect((await s.set("k", 1, { ttlSeconds: 0 })).ok).toBe(false);
    expect((await s.set("job:seed:seed-1", { state: "running" })).ok).toBe(true);
  });

  it("injects faults", async () => {
    const s = createMemoryWorld().storage;
    s.failNext("set", "unavailable");
    const r = await s.set("k", 1);
    expect(r.ok ? null : r.error.kind).toBe("unavailable");
    expect((await s.set("k", 1)).ok).toBe(true);
  });
});

describe("MemoryStorage custom entities", () => {
  function row(over: Partial<EventRow> & Pick<EventRow, "issueKey">): EventRow {
    return {
      projectKey: "TTDEMO",
      bucket: "lane-loss|cam-B",
      type: "lane-loss",
      variant: "cam-B",
      build: "4.12.0",
      occurredAt: 1_763_000_000,
      status: "unassigned",
      clusterId: "",
      proposalId: "",
      nnDist: -1,
      chipsMask: 2,
      features: { F1: 0.7 },
      engine: "1.0.0",
      synthetic: true,
      indexedAt: 1_763_100_000,
      ...over,
    };
  }

  it("upserts, gets and deletes rows by key", async () => {
    const s = createMemoryWorld().storage;
    must(await s.putEntity("event", "20001", row({ issueKey: "TTDEMO-1" })));
    must(await s.putEntity("event", "20001", row({ issueKey: "TTDEMO-1", status: "novel" })));
    expect(must(await s.getEntity("event", "20001"))?.status).toBe("novel");
    expect(s.entityCount("event")).toBe(1);
    must(await s.deleteEntity("event", "20001"));
    expect(must(await s.getEntity("event", "20001"))).toBeUndefined();
  });

  it("rejects undeclared attributes and wrong attribute types", async () => {
    const s = createMemoryWorld().storage;
    const extra = { ...row({ issueKey: "TTDEMO-1" }), nameAi: "x" } as unknown as EventRow;
    expect((await s.putEntity("event", "1", extra)).ok).toBe(false);
    expect((await s.putEntity("event", "1", row({ issueKey: "TTDEMO-1", occurredAt: 1.5 }))).ok).toBe(false);
    expect((await s.putEntity("event", "1", { ...row({ issueKey: "TTDEMO-1" }), synthetic: "yes" } as unknown as EventRow)).ok).toBe(false);
  });

  it("queries composite partitions with range, sort, default page size 10 and cursors", async () => {
    const s = createMemoryWorld().storage;
    for (let i = 0; i < 25; i++) {
      must(await s.putEntity("event", String(20001 + i), row({ issueKey: `TTDEMO-${i + 1}`, occurredAt: 1_763_000_000 + i * 60, bucket: i % 5 === 0 ? "late-brake|cam-A" : "lane-loss|cam-B" })));
    }
    const first = must(await s.queryEntities("event", { index: "by-bucket", partition: ["TTDEMO", "lane-loss|cam-B"] }));
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).toBeDefined();
    const all: string[] = [];
    let cursor: string | undefined;
    do {
      const page = must(await s.queryEntities("event", { index: "by-bucket", partition: ["TTDEMO", "lane-loss|cam-B"], limit: 7, ...(cursor !== undefined ? { cursor } : {}) }));
      all.push(...page.items.map((i) => i.value.issueKey));
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    expect(all).toHaveLength(20);
    const desc = must(await s.queryEntities("event", { index: "by-bucket", partition: ["TTDEMO", "late-brake|cam-A"], sort: "DESC", limit: 100 }));
    expect(desc.items.map((i) => i.value.issueKey)).toEqual(["TTDEMO-21", "TTDEMO-16", "TTDEMO-11", "TTDEMO-6", "TTDEMO-1"]);
    const ranged = must(await s.queryEntities("event", { index: "by-bucket", partition: ["TTDEMO", "late-brake|cam-A"], range: { op: "between", from: 1_763_000_300, to: 1_763_000_900 } }));
    expect(ranged.items.map((i) => i.value.issueKey)).toEqual(["TTDEMO-6", "TTDEMO-11", "TTDEMO-16"]);
    const gt = must(await s.queryEntities("event", { index: "by-status", partition: ["TTDEMO", "unassigned"], range: { op: "greaterThanEqualTo", value: 1_763_000_000 + 24 * 60 } }));
    expect(gt.items.map((i) => i.key)).toEqual(["20025"]);
    expect((await s.queryEntities("event", { index: "by-nothing", partition: ["TTDEMO"] })).ok).toBe(false);
    expect((await s.queryEntities("event", { index: "by-bucket", partition: ["TTDEMO"] })).ok).toBe(false);
  });

  it("queries the other entities' indexes", async () => {
    const s = createMemoryWorld().storage;
    must(await s.putEntity("drive-session", "DS-0001", { sessionId: "DS-0001", vehicleId: "V-01", variant: "cam-A", build: "4.11.0", date: 1_762_000_000, km: 85.5, odd: ["highway"], source: "seed", synthetic: true }));
    must(await s.putEntity("drive-session", "DS-0002", { sessionId: "DS-0002", vehicleId: "V-02", variant: "cam-B", build: "4.12.0", date: 1_762_100_000, km: 40.25, odd: ["urban"], source: "seed", synthetic: true }));
    must(await s.putEntity("vehicle", "V-02", { vehicleId: "V-02", label: "V-02 [SYNTHETIC]", variant: "cam-B", sensors: {}, calibration: {}, synthetic: true }));
    must(await s.putEntity("cluster", "20100", { issueKey: "TTDEMO-40", projectKey: "TTDEMO", bucket: "lane-loss|cam-B", nameDet: "Lane-loss · low sun · cam-B", memberCount: 7, firstBuild: "4.12.0", ownerRule: "", status: "open", profile: {}, onset: null, coverage: null, updatedAt: 1_763_000_000, synthetic: true }));
    expect(must(await s.queryEntities("drive-session", { index: "by-variant", partition: ["cam-B"] })).items.map((i) => i.key)).toEqual(["DS-0002"]);
    expect(must(await s.queryEntities("vehicle", { index: "by-variant", partition: ["cam-B"] })).items).toHaveLength(1);
    expect(must(await s.queryEntities("cluster", { index: "by-project-bucket", partition: ["TTDEMO", "lane-loss|cam-B"], range: { op: "greaterThan", value: 5 } })).items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- queue, TWG, clock

describe("MemoryQueue", () => {
  it("records pushes with the §8 concurrency keys", async () => {
    const w = createMemoryWorld();
    must(await w.queue.pushRecluster({ projectKey: "TTDEMO", bucket: "lane-loss|cam-B", reason: "intake", requestedAt: w.clock.nowIso() }));
    must(await w.queue.pushSeed({ jobId: "seed-1", step: "S2", cursor: 0, seed: 2029 }, { delaySeconds: 30 }));
    expect(w.queue.pushed.map((j) => [j.queue, j.concurrencyKey, j.delaySeconds])).toEqual([
      ["tt-recluster", "TTDEMO", 0],
      ["tt-seed", "seed-1", 30],
    ]);
    expect(w.queue.take("tt-recluster")).toHaveLength(1);
    expect(w.queue.peek()).toHaveLength(1);
    expect(w.queue.take()).toHaveLength(1);
    expect(w.queue.peek()).toHaveLength(0);
  });

  it("enforces the delay range and 100 KB payload limit, and injects faults", async () => {
    const q = createMemoryWorld().queue;
    expect((await q.pushSeed({ jobId: "j", step: "S2", cursor: 0, seed: 1 }, { delaySeconds: 901 })).ok).toBe(false);
    const big = await q.pushSeed({ jobId: "j".repeat(110 * 1024), step: "S2", cursor: 0, seed: 1 });
    expect(big.ok ? null : big.error.kind).toBe("value-too-large");
    q.failNext("unavailable");
    expect((await q.pushSeed({ jobId: "j", step: "S2", cursor: 0, seed: 1 })).ok).toBe(false);
    expect(q.pushed).toHaveLength(0);
  });
});

describe("MemoryTwgDirectory", () => {
  it("classifies ok / empty / not-permitted / error and is bound to the calling user", async () => {
    const w = createMemoryWorld();
    w.twg.addTeam({ ari: "ari:cloud:identity::team/t-perc", name: "Perception", members: [ENGINEER, ADMIN] });
    const twg = w.ports({ accountId: ENGINEER }).twg;
    expect(twg).toBeDefined();
    if (twg === undefined) return;
    expect(await twg.teamsOfUser(ENGINEER)).toEqual({ status: "ok", value: [{ ari: "ari:cloud:identity::team/t-perc", name: "Perception" }] });
    expect((await twg.teamsOfUser("nobody")).status).toBe("empty");
    const members = await twg.teamMembers("ari:cloud:identity::team/t-perc", { first: 1 });
    expect(members.status === "ok" ? members.value.memberAccountIds : null).toEqual([ADMIN]);
    expect((await twg.teamMembers("ari:cloud:identity::team/none")).status).toBe("empty");
    w.twg.setMode("scopes-missing");
    expect((await twg.teamsOfUser(ENGINEER)).status).toBe("empty");
    w.twg.setMode("not-permitted");
    expect(await twg.teamsOfUser(ENGINEER)).toMatchObject({ status: "not-permitted", message: "User is not permitted to query this organization" });
    w.twg.setMode("error");
    expect((await twg.teamMembers("ari:cloud:identity::team/t-perc")).status).toBe("error");
    expect(w.twg.calls.every((c) => c.as === ENGINEER)).toBe(true);
    // Consumers get no TWG at all (§8).
    expect(w.ports({}).twg).toBeUndefined();
  });
});

describe("FakeClock and SequentialIds", () => {
  it("advances deterministically and never goes back", () => {
    const c = new FakeClock("2026-11-16T09:00:00.000Z");
    c.advance({ days: 1, hours: 2, minutes: 3, seconds: 4, ms: 5 });
    expect(c.nowIso()).toBe("2026-11-17T11:03:04.005Z");
    expect(c.nowMs()).toBe(Date.parse("2026-11-17T11:03:04.005Z"));
    expect(() => c.advance({ seconds: -1 })).toThrow(RangeError);
    expect(() => c.set("2026-11-01T00:00:00Z")).toThrow(RangeError);
    c.set("2026-12-01T00:00:00Z");
    expect(c.nowIso()).toBe("2026-12-01T00:00:00.000Z");
    expect(() => new FakeClock("not a date")).toThrow(RangeError);
  });

  it("numbers ids per prefix", () => {
    const ids = new SequentialIds();
    expect([ids.next("seed"), ids.next("seed"), ids.next("undo")]).toEqual(["seed-1", "seed-2", "undo-1"]);
  });
});
