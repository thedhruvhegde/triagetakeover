import { describe, expect, it } from "vitest";
import { base64Encode } from "@tt/engine";
import { applyConfigPatch, defaultProjectConfig, loadProjectConfig, saveProjectConfig } from "../../src/services/config.js";
import { getAdminState } from "../../src/services/admin.js";
import { runDiagnostics } from "../../src/services/diagnostics.js";
import { createTakeoverIssue, getIntakeContext, saveMappingPreset, uploadAttachmentFallback } from "../../src/services/intake.js";
import { commitEvent } from "../../src/services/commit.js";
import { ADMIN, ENGINEER, OUTSIDER, fileEvent, laneLoss, must, serviceWorld, value } from "./helpers.js";

describe("project config", () => {
  it("defaults when nothing is stored; validates each field", () => {
    const base = defaultProjectConfig("TTDEMO");
    expect(base).toMatchObject({ enabled: true, tau: 1, k: 3, linkType: "Duplicate", buildOrder: "semver", routing: [] });
    const { config, problems } = applyConfigPatch(base, { tau: -1, k: 2, routing: [{ match: {}, team: {} }], buildOrder: ["4.11.0", "bad build!"], unknown: 1 });
    expect(config.k).toBe(2);
    expect(config.tau).toBe(1);
    expect(problems.map((p) => p.path).sort()).toEqual(["buildOrder", "routing", "tau"]);
  });

  it("only admins save; issue types and link types must exist", async () => {
    const sw = serviceWorld();
    expect(!(await saveProjectConfig(sw.ctx(ENGINEER), "TTDEMO", { tau: 0.8 })).ok).toBe(true);
    const bad = await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { eventIssueType: "Takeover", linkType: "Nope" });
    expect(!bad.ok && bad.error.details?.map((d) => d.path)).toEqual(["eventIssueType", "linkType"]);
    const ok = value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { tau: 0.8, scenarioIssueType: "Test" }));
    expect(ok).toMatchObject({ tau: 0.8, scenarioIssueType: "Test", updatedBy: ADMIN });
    expect((await loadProjectConfig(sw.world.storage, "TTDEMO")).config.tau).toBe(0.8);
  });

  it("ignores corrupted stored fields and says so", async () => {
    const sw = serviceWorld();
    must(await sw.world.storage.set("config:TTDEMO", { tau: "x", k: 5 }));
    const r = await loadProjectConfig(sw.world.storage, "TTDEMO");
    expect(r.config.k).toBe(5);
    expect(r.config.tau).toBe(1);
    expect(r.warnings[0]).toMatch(/Ignored invalid settings: tau/);
  });

  it("a disabled project refuses intake", async () => {
    const sw = serviceWorld();
    value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { enabled: false }));
    const ref = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const r = await commitEvent(sw.ctx(), { issueKey: ref.key, event: laneLoss() });
    expect(!r.ok && r.error.code).toBe("not-configured");
  });

  it("admin state lists config, components, roles and issue types", async () => {
    const sw = serviceWorld();
    must(await sw.ctx(ADMIN).ports.jira.asUser().createComponent({ projectKey: "TTDEMO", name: "Planning", leadAccountId: ADMIN }));
    const s = value(await getAdminState(sw.ctx(ADMIN), "TTDEMO"));
    expect(s.components.map((c) => c.name)).toEqual(["Planning"]);
    expect(s.roles.map((r) => r.name)).toEqual(["Administrators", "Developers"]);
    expect(s.issueTypes).toEqual(["Task", "Bug", "Test"]);
    expect(s.resync.state).toBe("idle");
    expect((await getAdminState(sw.ctx(ENGINEER), "TTDEMO")).ok).toBe(false);
  });
});

describe("diagnostics", () => {
  it("reports pass/fail/unknown honestly", async () => {
    const sw = serviceWorld();
    const ev = await fileEvent(sw, laneLoss());
    const d = value(await runDiagnostics(sw.ctx(ADMIN), "TTDEMO", ev.key));
    const by = Object.fromEntries(d.checks.map((c) => [c.id, c]));
    expect(by["storage"]?.status).toBe("pass");
    expect(by["property-write"]?.status).toBe("pass");
    expect(by["jql-index"]?.status).toBe("pass");
    expect(by["search-properties"]?.status).toBe("pass");
    expect(by["twg-user-teams"]?.status).toBe("unknown");
    expect(by["twg-user-teams"]?.consequence).toMatch(/possibly a missing scope or no data/);
    expect(by["rovo"]?.status).toBe("unknown");
    expect(by["mcp"]?.status).toBe("unknown");
    expect(by["attachments"]?.status).toBe("pass");
    expect(sw.world.site.rawProperty(ev.key, "tt.diag")).toBeUndefined();
    expect(must(await sw.world.storage.get("diag:last"))).toMatchObject({ ranAt: d.ranAt });
  });

  it("reports the SPIKE-E1 fallback and a TWG error", async () => {
    const sw = serviceWorld({ jira: { aliasesIndexed: false } });
    sw.world.twg.setMode("error");
    const d = value(await runDiagnostics(sw.ctx(ADMIN), "TTDEMO"));
    const by = Object.fromEntries(d.checks.map((c) => [c.id, c]));
    expect(by["jql-index"]?.status).toBe("fail");
    expect(by["jql-index"]?.consequence).toMatch(/falls back to labels = tt-takeover/);
    expect(by["twg-user-teams"]?.status).toBe("fail");
    expect(by["twg-team-members"]?.status).toBe("skipped");
    expect(by["property-write"]?.status).toBe("unknown");
  });

  it("is admin-only", async () => {
    const sw = serviceWorld();
    expect((await runDiagnostics(sw.ctx(OUTSIDER), "TTDEMO")).ok).toBe(false);
  });
});

describe("intake", () => {
  it("context for create and attach modes", async () => {
    const sw = serviceWorld();
    const create = value(await getIntakeContext(sw.ctx(), { projectKey: "TTDEMO" }));
    expect(create).toMatchObject({ mode: "create", eventIssueType: "Task", labels: ["tt-takeover"], existingEvent: false });
    expect(create.limits.propertyMaxBytes).toBe(32768);
    const ev = await fileEvent(sw, laneLoss(0, { build: "4.12.0", variant: "cam-B" }));
    const attach = value(await getIntakeContext(sw.ctx(), { issueKey: ev.key }));
    expect(attach).toMatchObject({ mode: "attach", projectKey: "TTDEMO", existingEvent: true, knownVariants: ["cam-B"], knownBuilds: ["4.12.0"] });
  });

  it("createTakeoverIssue (fallback) creates asUser with the takeover label", async () => {
    const sw = serviceWorld();
    const r = value(await createTakeoverIssue(sw.ctx(), { projectKey: "TTDEMO", summary: "Takeover\u0000 on the loop" }));
    const issue = must(await sw.ctx().ports.jira.asUser().getIssue(r.key));
    expect(issue.summary).toBe("Takeover on the loop");
    expect(issue.labels).toEqual(["tt-takeover"]);
    expect(r.url).toBe(`/browse/${r.key}`);
  });

  it("uploadAttachment fallback (SPIKE-I2): size, type and name checks; records the outcome", async () => {
    const sw = serviceWorld();
    const ev = await fileEvent(sw, laneLoss());
    const bytes = new TextEncoder().encode("t,speed\n0,1\n");
    const r = value(await uploadAttachmentFallback(sw.ctx(), { issueKey: ev.key, filename: "event.csv", mimeType: "text/csv", dataBase64: base64Encode(bytes) }));
    expect(sw.world.site.attachmentBytes(r.attachmentId)).toEqual(bytes);
    expect(must(await sw.world.storage.get("diag:attachments"))).toMatchObject({ backend: { status: "uploaded" } });
    expect((await uploadAttachmentFallback(sw.ctx(), { issueKey: ev.key, filename: "x.exe", mimeType: "application/x-msdownload", dataBase64: "AAAA" })).ok).toBe(false);
    expect((await uploadAttachmentFallback(sw.ctx(), { issueKey: ev.key, filename: "../etc/passwd", mimeType: "text/csv", dataBase64: "AAAA" })).ok).toBe(false);
    const big = base64Encode(new Uint8Array(400 * 1024));
    const tooBig = await uploadAttachmentFallback(sw.ctx(), { issueKey: ev.key, filename: "big.jpg", mimeType: "image/jpeg", dataBase64: big });
    expect(!tooBig.ok && tooBig.error.message).toMatch(/larger than 360 KB/);
  });

  it("upload refused by Jira is reported and recorded", async () => {
    const sw = serviceWorld({ jira: { attachmentUpload: "nobody" } });
    const ev = await fileEvent(sw, laneLoss());
    const r = await uploadAttachmentFallback(sw.ctx(), { issueKey: ev.key, filename: "f.jpg", mimeType: "image/jpeg", dataBase64: "AAAA" });
    expect(r.ok).toBe(false);
    expect(must(await sw.world.storage.get("diag:attachments"))).toMatchObject({ backend: { status: "failed" } });
  });

  it("mapping presets are validated", async () => {
    const sw = serviceWorld();
    const preset = { columns: { t: "time", speed: "v" }, multipliers: { speed: 0.2777 }, invert: {}, brakeUnit: "ratio" };
    expect(value(await saveMappingPreset(sw.ctx(), { projectKey: "TTDEMO", id: "fleet-a", preset }))).toEqual({ id: "fleet-a" });
    expect((await saveMappingPreset(sw.ctx(), { projectKey: "TTDEMO", id: "x", preset: { columns: {}, multipliers: { speed: 0 }, invert: {}, brakeUnit: "ratio" } })).ok).toBe(false);
    const ctx = value(await getIntakeContext(sw.ctx(), { projectKey: "TTDEMO" }));
    expect(ctx.presets.map((p) => p.id)).toEqual(["fleet-a"]);
  });
});
