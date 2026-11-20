import { describe, expect, it } from "vitest";
import { acceptMatch, splitEvent, undoLast } from "../../src/services/triage.js";
import { triageNow } from "../../src/services/match.js";
import { parseTtTriage, type TtTriage } from "@tt/engine";
import { ADMIN, ENGINEER, OUTSIDER, farLaneLoss, fileEvent, laneLoss, must, serviceWorld, value } from "./helpers.js";

async function setup() {
  const sw = serviceWorld();
  const seedEv = await fileEvent(sw, laneLoss(0));
  const second = await fileEvent(sw, laneLoss(1));
  return { sw, seedEv, second };
}

function triageOf(sw: ReturnType<typeof serviceWorld>, key: string): TtTriage | null {
  const raw = sw.world.site.rawProperty(key, "tt.triage");
  return raw === undefined ? null : must(parseTtTriage(JSON.parse(raw)));
}

describe("split", () => {
  it("creates a cluster issue with a deterministic name, tt.cluster, link and tt.triage (asUser)", async () => {
    const { sw, seedEv } = await setup();
    const r = value(await splitEvent(sw.ctx(), seedEv.key));
    expect(r.created).toBe(true);
    expect(r.nameSource).toBe("deterministic");
    expect(r.cluster?.name).toBe("Lane-loss · cam-B");
    const clusterKey = r.cluster?.key ?? "";
    const issue = must(await sw.ctx().ports.jira.asUser().getIssue(clusterKey, { properties: ["tt.cluster"] }));
    expect(issue.labels).toEqual(expect.arrayContaining(["tt-cluster", "tt-synthetic"]));
    expect(issue.summary).toBe("[SYNTHETIC] Cluster: Lane-loss · cam-B");
    expect(issue.properties["tt.cluster"]).toMatchObject({ v: 1, bucket: "lane-loss|cam-B", nameDet: "Lane-loss · cam-B", createdBy: ENGINEER });
    expect(issue.links?.some((l) => l.inwardIssue.key === seedEv.key)).toBe(true);
    const t = triageOf(sw, seedEv.key);
    expect(t).toMatchObject({ state: "accepted", clusterKey, by: ENGINEER });
    expect(sw.world.site.writesBy("app")).toEqual([]);
    const row = must(await sw.world.storage.getEntity("cluster", r.cluster?.id ?? ""));
    expect(row?.memberCount).toBe(1);
  });

  it("proposes (never links) bucket events that now match the new cluster", async () => {
    const sw = serviceWorld();
    const a = await fileEvent(sw, laneLoss(0));
    const b = await fileEvent(sw, laneLoss(1));
    const s1 = value(await splitEvent(sw.ctx(), a.key));
    value(await acceptMatch(sw.ctx(), b.key, s1.cluster?.key ?? ""));
    const far1 = await fileEvent(sw, farLaneLoss(0));
    const far2 = await fileEvent(sw, farLaneLoss(1));
    const s2 = value(await splitEvent(sw.ctx(), far1.key, "  Wide\u0007 drift  "));
    expect(s2.nameSource).toBe("user");
    expect(s2.cluster?.name).toBe("Wide drift");
    expect(s2.proposedMembers).toEqual([far2.key]);
    expect(s2.summary).toMatch(new RegExp(`Proposed \\(not linked\\): ${far2.key}`));
    const far2Issue = must(await sw.ctx().ports.jira.asUser().getIssue(far2.key));
    expect(far2Issue.links).toEqual([]);
    const row = must(await sw.world.storage.getEntity("event", far2.id));
    expect(row?.status).toBe("proposed");
    expect(row?.proposalId).toBe(`c:${s2.cluster?.id ?? ""}`);
  });

  it("refuses to split an event that is already accepted", async () => {
    const { sw, seedEv } = await setup();
    value(await splitEvent(sw.ctx(), seedEv.key));
    const r = await splitEvent(sw.ctx(), seedEv.key);
    expect(!r.ok && r.error.code).toBe("conflict");
  });
});

describe("accept", () => {
  it("links, records who and when, updates the index, and is idempotent", async () => {
    const { sw, seedEv, second } = await setup();
    const split = value(await splitEvent(sw.ctx(), seedEv.key));
    const clusterKey = split.cluster?.key ?? "";
    const r = value(await acceptMatch(sw.ctx(), second.key, clusterKey));
    expect(r.created).toBe(true);
    expect(r.link?.type).toBe("Duplicate");
    expect(r.undoAvailable).toBe(true);
    expect(r.evidence.map((e) => e.key)).toEqual([second.key, clusterKey]);
    expect(triageOf(sw, second.key)).toMatchObject({ state: "accepted", clusterKey, by: ENGINEER });
    expect(must(await sw.world.storage.getEntity("event", second.id))?.status).toBe("accepted");
    // second click / second user: no new link, says who did it
    const again = value(await acceptMatch(sw.ctx(ADMIN), second.key, clusterKey));
    expect(again.alreadyDone).toBe(true);
    expect(again.summary).toMatch(new RegExp(`Already linked to ${clusterKey} by ${ENGINEER}`));
    const links = must(await sw.ctx().ports.jira.asUser().getIssueLinks(second.key));
    expect(links).toHaveLength(1);
  });

  it("falls back to Relates when the configured link type is missing (§15 #17)", async () => {
    const sw = serviceWorld({ jira: { linkTypes: [{ name: "Relates", inward: "relates to", outward: "relates to" }] } });
    const a = await fileEvent(sw, laneLoss(0));
    const b = await fileEvent(sw, laneLoss(1));
    const s = await splitEvent(sw.ctx(), a.key);
    expect(s.ok).toBe(true);
    const r = await acceptMatch(sw.ctx(), b.key, value(s).cluster?.key ?? "");
    expect(r.ok && r.value.value.link?.type).toBe("Relates");
    expect(r.ok && r.value.warnings.some((w) => /Duplicate.*not available/.test(w))).toBe(true);
  });

  it("refuses non-cluster targets, other projects' clusters and moves between clusters", async () => {
    const { sw, seedEv, second } = await setup();
    expect((await acceptMatch(sw.ctx(), second.key, seedEv.key)).ok).toBe(false);
    const s1 = value(await splitEvent(sw.ctx(), seedEv.key));
    const s2 = value(await splitEvent(sw.ctx(), second.key));
    const r = await acceptMatch(sw.ctx(), second.key, s1.cluster?.key ?? "");
    expect(!r.ok && r.error.code).toBe("conflict");
    expect(!r.ok && r.error.message).toMatch(new RegExp(`already accepted into ${s2.cluster?.key ?? ""}`));
  });

  it("users without access get forbidden-or-not-found and nothing is written", async () => {
    const { sw, seedEv, second } = await setup();
    const s = value(await splitEvent(sw.ctx(), seedEv.key));
    const before = sw.world.site.calls.length;
    const r = await acceptMatch(sw.ctx(OUTSIDER), second.key, s.cluster?.key ?? "");
    expect(!r.ok && r.error.code).toBe("forbidden-or-not-found");
    expect(sw.world.site.calls.slice(before).filter((c) => c.op === "createIssueLink" || c.op === "setIssueProperty")).toEqual([]);
  });

  it("users who can browse but not edit get a clean error (Jira enforces permissions)", async () => {
    const { sw, seedEv, second } = await setup();
    const s = value(await splitEvent(sw.ctx(), seedEv.key));
    sw.world.site.denyEdit(ADMIN, "TTDEMO");
    const r = await acceptMatch(sw.ctx(ADMIN), second.key, s.cluster?.key ?? "");
    expect(r.ok).toBe(false);
  });
});

describe("undo", () => {
  it("accept → undo removes the link, records the undo, resets the index; round trip restores the start state", async () => {
    const { sw, seedEv, second } = await setup();
    const s = value(await splitEvent(sw.ctx(), seedEv.key));
    const clusterKey = s.cluster?.key ?? "";
    const before = value(await triageNow(sw.ctx(), second.key));
    value(await acceptMatch(sw.ctx(), second.key, clusterKey));
    const u = value(await undoLast(sw.ctx(), second.key));
    expect(u.summary).toMatch(new RegExp(`Removed the link from ${second.key} to ${clusterKey}`));
    expect(must(await sw.ctx().ports.jira.asUser().getIssueLinks(second.key))).toEqual([]);
    expect(triageOf(sw, second.key)).toMatchObject({ state: "none" });
    expect(triageOf(sw, second.key)?.history.map((h) => h.action)).toEqual(["accept", "undo-accept"]);
    const after = value(await triageNow(sw.ctx(), second.key));
    expect(after.result).toBe(before.result);
    expect(after.cluster?.key).toBe(before.cluster?.key);
    expect(must(await sw.world.storage.getEntity("cluster", s.cluster?.id ?? ""))?.memberCount).toBe(1);
    // nothing left to undo for this issue
    expect((await undoLast(sw.ctx(), second.key)).ok).toBe(false);
  });

  it("split → undo deletes the empty cluster issue and its row", async () => {
    const { sw, seedEv } = await setup();
    const s = value(await splitEvent(sw.ctx(), seedEv.key));
    const u = value(await undoLast(sw.ctx(), seedEv.key));
    expect(u.summary).toMatch(/Deleted the empty cluster issue/);
    expect((await sw.ctx().ports.jira.asUser().getIssue(s.cluster?.key ?? "")).ok).toBe(false);
    expect(must(await sw.world.storage.getEntity("cluster", s.cluster?.id ?? ""))).toBeUndefined();
    expect(must(await sw.world.storage.getEntity("event", seedEv.id))?.status).toBe("unassigned");
  });

  it("split → undo keeps the cluster when others were accepted into it", async () => {
    const { sw, seedEv, second } = await setup();
    const s = value(await splitEvent(sw.ctx(), seedEv.key));
    value(await acceptMatch(sw.ctx(), second.key, s.cluster?.key ?? ""));
    const u = await undoLast(sw.ctx(), seedEv.key);
    expect(u.ok && u.value.warnings.some((w) => /other links/.test(w))).toBe(true);
    expect((await sw.ctx().ports.jira.asUser().getIssue(s.cluster?.key ?? "")).ok).toBe(true);
  });

  it("queues recluster jobs for accept, split and undo", async () => {
    const { sw, seedEv, second } = await setup();
    const s = value(await splitEvent(sw.ctx(), seedEv.key));
    value(await acceptMatch(sw.ctx(), second.key, s.cluster?.key ?? ""));
    value(await undoLast(sw.ctx(), second.key));
    const reasons = sw.world.queue.pushed.map((j) => (j.body as { reason: string }).reason);
    expect(reasons).toEqual(expect.arrayContaining(["split", "accept", "undo"]));
  });
});
