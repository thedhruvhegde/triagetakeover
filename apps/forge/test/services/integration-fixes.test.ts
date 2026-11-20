/**
 * Behaviour added while integrating the work packages: seed `mode`/`frames` through the
 * resolver, `getSeedReport`, honest permission-check failures, TWG names that are only an ARI,
 * and the explicit `reused` flag on scenario stubs.
 */
import { describe, expect, it } from "vitest";
import { dispatchUi } from "../../src/resolvers/ui-handlers.js";
import { saveProjectConfig } from "../../src/services/config.js";
import { createScenarioStub } from "../../src/services/coverage.js";
import { suggestOwner } from "../../src/services/route.js";
import { splitEvent } from "../../src/services/triage.js";
import { ADMIN, ENGINEER, fileEvent, laneLoss, must, serviceWorld, value } from "./helpers.js";

const TEAM = "ari:cloud:identity::team/11111111-2222-3333-4444-555555555555";

describe("startSeed / getSeedReport through the resolver", () => {
  it("decodes mode and frames, and rejects unknown values with a path", async () => {
    const sw = serviceWorld();
    const bad = await dispatchUi("startSeed", { projectKey: "TTDEMO", seed: 2029, mode: "wipe" }, { accountId: ADMIN }, sw.factory);
    expect(!bad.ok && bad.error.code).toBe("invalid-input");
    expect(!bad.ok && bad.error.details?.map((d) => d.path)).toContain("mode");
    const badFrames = await dispatchUi("startSeed", { projectKey: "TTDEMO", seed: 2029, frames: "huge" }, { accountId: ADMIN }, sw.factory);
    expect(!badFrames.ok && badFrames.error.details?.map((d) => d.path)).toContain("frames");
    const okStart = await dispatchUi("startSeed", { projectKey: "TTDEMO", seed: 2029, mode: "keep", frames: "fast" }, { accountId: ADMIN }, sw.factory);
    expect(okStart.ok && okStart.data.state).toBe("queued");
    expect(okStart.ok && okStart.data.stepCount).toBeGreaterThan(0);
  });

  it("getSeedReport is admin-only and does not invent a report before a seed ran", async () => {
    const sw = serviceWorld();
    const asEngineer = await dispatchUi("getSeedReport", { projectKey: "TTDEMO" }, { accountId: ENGINEER }, sw.factory);
    expect(asEngineer.ok).toBe(false);
    const asAdmin = await dispatchUi("getSeedReport", { projectKey: "TTDEMO" }, { accountId: ADMIN }, sw.factory);
    expect(asAdmin.ok).toBe(false);
    expect(!asAdmin.ok && asAdmin.error.code).not.toBe("error");
  });
});

describe("permission checks", () => {
  it("a transient mypermissions failure is reported as unavailable, not as 'no access'", async () => {
    const sw = serviceWorld();
    sw.world.site.failNext("getMyPermissions", "unavailable");
    const r = await dispatchUi("getBoard", { projectKey: "TTDEMO" }, { accountId: ENGINEER }, sw.factory);
    expect(!r.ok && r.error.code).toBe("unavailable");
    expect(!r.ok && r.error.retryable).toBe(true);
    const again = await dispatchUi("getBoard", { projectKey: "TTDEMO" }, { accountId: ENGINEER }, sw.factory);
    expect(again.ok).toBe(true);
  });
});

describe("routing names", () => {
  it("uses the admin's rule label when TWG returns only the ARI as the team name", async () => {
    const sw = serviceWorld();
    const comp = must(await sw.ctx(ADMIN).ports.jira.asUser().createComponent({ projectKey: "TTDEMO", name: "Perception", leadAccountId: ADMIN }));
    value(await saveProjectConfig(sw.ctx(ADMIN), "TTDEMO", { routing: [{ match: { type: "lane-loss" }, team: { teamAri: TEAM, componentId: comp.id, label: "Perception" } }] }));
    const ev = await fileEvent(sw, laneLoss());
    const clusterKey = value(await splitEvent(sw.ctx(), ev.key)).cluster?.key ?? "";
    sw.world.twg.addTeam({ ari: TEAM, name: TEAM, members: [ENGINEER] });
    const r = value(await suggestOwner(sw.ctx(), clusterKey));
    expect(r.source).toBe("twg");
    expect(r.team?.name).toBe("Perception");
  });
});

describe("scenario stubs", () => {
  it("flags a reused stub explicitly instead of only in a warning", async () => {
    const sw = serviceWorld();
    const ev = await fileEvent(sw, laneLoss());
    const clusterKey = value(await splitEvent(sw.ctx(), ev.key)).cluster?.key ?? "";
    const first = value(await createScenarioStub(sw.ctx(), clusterKey));
    expect(first.reused).toBe(false);
    const second = value(await createScenarioStub(sw.ctx(), clusterKey));
    expect(second.reused).toBe(true);
    expect(second.created?.key).toBe(first.created?.key);
  });
});
