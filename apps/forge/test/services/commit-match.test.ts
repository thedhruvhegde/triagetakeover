import { describe, expect, it } from "vitest";
import { distance } from "@tt/engine";
import { commitEvent } from "../../src/services/commit.js";
import { explainMatch, triageNow } from "../../src/services/match.js";
import { verifyEvent, TAMPERED_WARNING } from "../../src/services/verify.js";
import { defaultProjectConfig } from "../../src/services/config.js";
import { acceptMatch, splitEvent } from "../../src/services/triage.js";
import { ENGINEER, OUTSIDER, farLaneLoss, fileEvent, jsonSafe, laneLoss, lateralDrift, must, serviceWorld, synthEvent, value } from "./helpers.js";

describe("synthetic event builder (test helper sanity)", () => {
  it("produces the intended types and close siblings", () => {
    expect(laneLoss().sig.type).toBe("lane-loss");
    expect(lateralDrift().sig.type).toBe("lateral-drift");
    const op = (e: ReturnType<typeof laneLoss>) => ({ features: e.sig.features, chips: e.img?.chips ?? [] });
    expect(distance(op(laneLoss(0)), op(laneLoss(1)))).toBeLessThan(1);
    expect(farLaneLoss().sig.type).toBe("lane-loss");
    expect(distance(op(laneLoss(0)), op(farLaneLoss()))).toBeGreaterThan(1);
    expect(distance(op(farLaneLoss(0)), op(farLaneLoss(1)))).toBeLessThan(1);
    expect(synthEvent().sig.type).toBe("lane-loss");
  });
});

describe("verifyEvent (D2)", () => {
  const cfg = defaultProjectConfig("TTDEMO");
  it("accepts an untampered event", () => {
    const r = verifyEvent(laneLoss(), cfg);
    expect(r.ok && r.value.tampered).toBe(false);
  });
  it("recomputes sig when features were edited and flags it", () => {
    const e = laneLoss();
    const forged = { ...e, sig: { ...e.sig, features: { ...e.sig.features, F6: 0.9 } } };
    const r = verifyEvent(forged, cfg);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tampered).toBe(true);
    expect(r.value.event.sig.features.F6).toBe(e.sig.features.F6);
    expect(r.value.warnings).toContain(TAMPERED_WARNING);
  });
  it("rejects schema-invalid values", () => {
    expect(verifyEvent({ v: 1 }, cfg).ok).toBe(false);
  });
  it("flags an older engine version", () => {
    const r = verifyEvent({ ...laneLoss(), engine: "0.9.0" }, cfg);
    expect(r.ok && r.value.engineChanged).toBe(true);
  });
});

describe("commitEvent", () => {
  it("writes the properties asUser, indexes the event, returns first-of-kind, queues intake recluster", async () => {
    const sw = serviceWorld();
    const ctx = sw.ctx();
    const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "[SYNTHETIC] t" }));
    const r = value(await commitEvent(ctx, { issueKey: ref.key, event: laneLoss(), attachments: { via: "browser", status: "uploaded" } }));
    expect(r.match.result).toBe("first-of-kind");
    expect(r.match.message).toBe("First of its kind in this bucket");
    expect(r.match.confidence.definition).toMatch(/fewer than 2 accepted/);
    expect(sw.world.site.rawProperty(ref.key, "tt.event")).toBeDefined();
    const writes = sw.world.site.writesBy(`user:${ENGINEER}`).map((c) => c.op);
    expect(writes).toContain("setIssueProperty");
    expect(sw.world.site.writesBy("app")).toEqual([]);
    const row = must(await sw.world.storage.getEntity("event", ref.id));
    expect(row?.status).toBe("novel");
    expect(row?.proposalId).toBe("f:");
    expect(sw.world.queue.peek("tt-recluster").some((j) => (j.body as { reason: string }).reason === "intake")).toBe(true);
    expect(jsonSafe(r)).toBe(true);
    // label typing (Re-sync fallback selector) was added
    const issue = must(await ctx.ports.jira.asUser().getIssue(ref.key));
    expect(issue.labels).toContain("tt-takeover");
  });

  it("rejects invalid drafts with input paths and writes nothing", async () => {
    const sw = serviceWorld();
    const ctx = sw.ctx();
    const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const r = await commitEvent(ctx, { issueKey: ref.key, event: { ...laneLoss(), v: 2 } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("invalid-input");
      expect(r.error.details?.some((d) => d.path?.startsWith("event"))).toBe(true);
    }
    expect(sw.world.site.rawProperty(ref.key, "tt.event")).toBeUndefined();
  });

  it("does not leak whether a hidden issue exists", async () => {
    const sw = serviceWorld();
    const ref = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const hidden = await commitEvent(sw.ctx(OUTSIDER), { issueKey: ref.key, event: laneLoss() });
    const missing = await commitEvent(sw.ctx(OUTSIDER), { issueKey: "TTDEMO-999", event: laneLoss() });
    expect(hidden.ok || missing.ok).toBe(false);
    if (!hidden.ok && !missing.ok) {
      expect(hidden.error).toEqual(missing.error);
      expect(hidden.error.code).toBe("forbidden-or-not-found");
    }
  });

  it("reports a property-too-large failure from Jira before anything is half-created", async () => {
    const sw = serviceWorld();
    const ctx = sw.ctx();
    const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    sw.world.site.failNext("setIssueProperty", "property-too-large");
    const r = await commitEvent(ctx, { issueKey: ref.key, event: laneLoss() });
    expect(!r.ok && r.error.code).toBe("property-too-large");
    expect(sw.world.storage.entityCount("event")).toBe(0);
  });

  it("stores recomputed values when the client sent a tampered signature", async () => {
    const sw = serviceWorld();
    const ctx = sw.ctx();
    const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const e = laneLoss();
    const r = value(await commitEvent(ctx, { issueKey: ref.key, event: { ...e, sig: { ...e.sig, features: { ...e.sig.features, F1: 2.9 } } } }));
    expect(r.recomputed).toBe(true);
    const stored = JSON.parse(sw.world.site.rawProperty(ref.key, "tt.event") ?? "{}") as typeof e;
    expect(stored.sig.features.F1).toBe(e.sig.features.F1);
  });

  it("keeps working when the queue push fails (warning only)", async () => {
    const sw = serviceWorld();
    const ctx = sw.ctx();
    const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    sw.world.queue.failNext("unavailable", 3);
    const r = await commitEvent(ctx, { issueKey: ref.key, event: laneLoss() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.warnings.some((w) => /could not be queued/.test(w))).toBe(true);
  });

  it("warns when raw files were not attached and records the outcome for diagnostics", async () => {
    const sw = serviceWorld();
    const ctx = sw.ctx();
    const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const r = await commitEvent(ctx, { issueKey: ref.key, event: laneLoss(), attachments: { via: "browser", status: "failed", error: "403" } });
    expect(r.ok && r.value.warnings.some((w) => /Raw files were not attached/.test(w))).toBe(true);
    expect(must(await sw.world.storage.get("diag:attachments"))).toMatchObject({ browser: { status: "failed" } });
  });
});

describe("matching (kNN, novel, why rows, evidence)", () => {
  async function bucketWithCluster() {
    const sw = serviceWorld();
    const a = await fileEvent(sw, laneLoss(0));
    const split = value(await splitEvent(sw.ctx(), a.key));
    const b = await fileEvent(sw, laneLoss(1));
    value(await acceptMatch(sw.ctx(), b.key, split.cluster?.key ?? ""));
    return { sw, clusterKey: split.cluster?.key ?? "", members: [a.key, b.key] };
  }

  it("matches a close event with confidence, neighbours, why rows and evidence links", async () => {
    const { sw, clusterKey, members } = await bucketWithCluster();
    const c = await fileEvent(sw, laneLoss(-1));
    const m = value(await triageNow(sw.ctx(), c.key));
    expect(m.result).toBe("match");
    expect(m.cluster?.key).toBe(clusterKey);
    expect(m.confidence.value).toBeGreaterThan(0);
    expect(m.confidence.definition).toMatch(/1 − d\*\/τ/);
    expect(m.neighbours.map((n) => n.key).sort()).toEqual([...members].sort());
    expect(m.why).toHaveLength(10);
    expect(m.why.reduce((s, r) => s + (r.contribution ?? 0), 0)).toBeCloseTo(1, 6);
    expect(m.headlines[0]).toBe("Bucket: lane-loss x cam-B");
    expect(m.headlines.some((h) => h.startsWith("Nearest: "))).toBe(true);
    expect(m.evidence.map((e) => e.key)).toEqual(expect.arrayContaining([c.key, clusterKey, ...members]));
    expect(m.evidence.every((e) => e.url.startsWith("/"))).toBe(true);
    const row = must(await sw.world.storage.getEntity("event", c.id));
    expect(row?.status).toBe("proposed");
    expect(row?.proposalId.startsWith("c:")).toBe(true);
    expect(jsonSafe(m)).toBe(true);
  });

  it("proposes a new cluster when the nearest is beyond τ, with a split headline", async () => {
    const { sw, clusterKey } = await bucketWithCluster();
    const far = await fileEvent(sw, farLaneLoss());
    const m = value(await triageNow(sw.ctx(), far.key));
    expect(m.result).toBe("novel");
    expect(m.message).toMatch(/^Proposed new cluster/);
    expect(m.alternatives[0]?.key).toBe(clusterKey);
    expect(m.confidence.value).toBe(0);
    expect(m.headlines.some((h) => h.startsWith("Split: "))).toBe(true);
    expect(m.dStar).toBeGreaterThan(m.tau);
  });

  it("explains a cross-bucket comparison: same text is irrelevant, signal decides", async () => {
    const { sw, clusterKey } = await bucketWithCluster();
    const drift = await fileEvent(sw, lateralDrift(0), ENGINEER, "[SYNTHETIC] Takeover: car drifted left, took over");
    const x = value(await explainMatch(sw.ctx(), drift.key, clusterKey));
    expect(x.sameBucket).toBe(false);
    expect(x.bucketRule).toMatch(/^Different bucket: event lateral-drift x cam-B/);
    expect(x.decision).toBe("exceeds-tau");
    expect(x.topContributors).toContain("F6");
    expect(x.why.find((r) => r.feature === "F6")?.contribution).toBeGreaterThan(0.3);
  });

  it("explainMatch rejects an unknown cluster key", async () => {
    const { sw, members } = await bucketWithCluster();
    const r = await explainMatch(sw.ctx(), members[0] ?? "", "TTDEMO-999");
    expect(!r.ok && r.error.code).toBe("invalid-input");
  });

  it("triageNow on an issue without tt.event is an honest no-signal state", async () => {
    const sw = serviceWorld();
    const ref = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const r = await triageNow(sw.ctx(), ref.key);
    expect(!r.ok && r.error.message).toMatch(/No signal data/);
  });
});
