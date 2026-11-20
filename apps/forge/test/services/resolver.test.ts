import { describe, expect, it } from "vitest";
import { UI_METHODS, API_ERROR_CODES, type UiApi } from "../../src/contract/ui-api.js";
import { UI_HANDLERS, dispatchUi, invocationFromContext } from "../../src/resolvers/ui-handlers.js";
import { createServiceContext, type ServiceContextFactory } from "../../src/context.js";
import { ADMIN, ENGINEER, OUTSIDER, laneLoss, must, serviceWorld } from "./helpers.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
// Compile-time: UI_METHODS lists exactly the keys of UiApi.
const exhaustive: Equal<(typeof UI_METHODS)[number], keyof UiApi> = true;

describe("ui-resolver handlers", () => {
  it("has one handler per contract method", () => {
    expect(exhaustive).toBe(true);
    expect(Object.keys(UI_HANDLERS).sort()).toEqual([...UI_METHODS].sort());
    expect(new Set(UI_METHODS).size).toBe(UI_METHODS.length);
    expect(API_ERROR_CODES).toContain("forbidden-or-not-found");
  });

  it("reads identity and focus only from the invocation context", () => {
    expect(invocationFromContext({ accountId: "acc-1", extension: { issue: { key: "TTDEMO-4" } } })).toEqual({ accountId: "acc-1", focusIssueKey: "TTDEMO-4", focusProjectKey: "TTDEMO" });
    expect(invocationFromContext({ accountId: "<script>", extension: { project: { key: "lower" } } })).toEqual({});
    expect(invocationFromContext(null)).toEqual({});
  });

  it("validates payloads and returns the error envelope with paths", async () => {
    const sw = serviceWorld();
    const r = await dispatchUi("acceptMatch", { issueKey: "not a key", clusterKey: 5 }, { accountId: ENGINEER }, sw.factory);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("invalid-input");
      expect(r.error.details?.map((d) => d.path).sort()).toEqual(["clusterKey", "issueKey"]);
    }
  });

  it("ignores identity in the payload (§14)", async () => {
    const sw = serviceWorld();
    const r = await dispatchUi("getBoard", { projectKey: "TTDEMO", accountId: ENGINEER }, { accountId: OUTSIDER }, sw.factory);
    expect(!r.ok && r.error.code).toBe("forbidden-or-not-found");
  });

  it("falls back to the module context for issue/project keys", async () => {
    const sw = serviceWorld();
    const board = await dispatchUi("getBoard", {}, { accountId: ENGINEER, extension: { project: { key: "TTDEMO" } } }, sw.factory);
    expect(board.ok && board.data.projectKey).toBe("TTDEMO");
    const ref = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const commit = await dispatchUi("commitEvent", { event: laneLoss() }, { accountId: ENGINEER, extension: { issue: { key: ref.key } } }, sw.factory);
    expect(commit.ok && commit.data.match.result).toBe("first-of-kind");
    const panel = await dispatchUi("getPanel", {}, { accountId: ENGINEER, extension: { issue: { key: ref.key } } }, sw.factory);
    expect(panel.ok && panel.data.kind).toBe("event");
  });

  it("returns warnings with data", async () => {
    const sw = serviceWorld();
    const ref = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "t" }));
    const r = await dispatchUi("commitEvent", { issueKey: ref.key, event: laneLoss(), attachments: { via: "browser", status: "failed" } }, { accountId: ENGINEER }, sw.factory);
    expect(r.ok && r.warnings.some((w) => /Raw files were not attached/.test(w))).toBe(true);
  });

  it("never throws: unexpected exceptions become a generic error", async () => {
    const broken: ServiceContextFactory = () => {
      throw new Error("boom with secret details");
    };
    const r = await dispatchUi("getBoard", { projectKey: "TTDEMO" }, { accountId: ADMIN }, broken);
    expect(r).toEqual({ ok: false, error: { code: "error", message: expect.not.stringContaining("secret") as unknown as string, retryable: true } });
  });

  it("startSeed queues the demo seed through the resolver (the chain itself: test/seed)", async () => {
    const sw = serviceWorld();
    const r = await dispatchUi("startSeed", { projectKey: "TTDEMO", seed: 2029 }, { accountId: ADMIN }, sw.factory);
    expect(r.ok && r.data.state).toBe("queued");
    expect(sw.world.queue.peek("tt-seed")).toHaveLength(1);
  });

  it("runs every method without throwing on an empty payload", async () => {
    const sw = serviceWorld();
    const factory: ServiceContextFactory = (inv) => createServiceContext(sw.world.ports(inv.accountId !== undefined ? { accountId: inv.accountId } : {}), inv);
    for (const m of UI_METHODS) {
      const r = await dispatchUi(m, {}, { accountId: ADMIN }, factory);
      expect(typeof r.ok).toBe("boolean");
      if (!r.ok) expect(r.error.code).not.toBe("error");
    }
  });
});
