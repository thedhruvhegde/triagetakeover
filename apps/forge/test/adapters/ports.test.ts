import { beforeEach, describe, expect, it, vi } from "vitest";

// @forge/api: keep the real `route` and error classes; replace the principal-bound fetchers.
const apiState = vi.hoisted(() => ({
  calls: [] as { principal: "user" | "app"; kind: "jira" | "twg"; path?: string; method?: string; operationName?: string }[],
  asUserArgs: [] as unknown[][],
}));

vi.mock("@forge/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const reply = (body: unknown) => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
  const fetchers = (principal: "user" | "app") => ({
    requestJira: (path: { value: string }, init?: { method?: string }) => {
      apiState.calls.push({ principal, kind: "jira", path: path.value, method: init?.method ?? "GET" });
      return Promise.resolve(reply({ accountId: principal === "user" ? "u-1" : "app", displayName: principal }));
    },
    requestTeamworkGraph: (_q: string, _v: unknown, operationName: string) => {
      apiState.calls.push({ principal, kind: "twg", operationName });
      return Promise.resolve(reply({ data: { atlassianUserInTeams: { edges: [{ node: { id: "ari:t/1", displayName: "Perception" } }] } } }));
    },
  });
  const api = {
    asUser: (...args: unknown[]) => {
      apiState.asUserArgs.push(args);
      return fetchers("user");
    },
    asApp: () => fetchers("app"),
  };
  return { ...actual, default: api };
});

const { createForgePorts } = await import("../../src/adapters/forge/index.js");
const { createForgeContext } = await import("../../src/context.js");

describe("createForgePorts", () => {
  beforeEach(() => {
    apiState.calls.length = 0;
    apiState.asUserArgs.length = 0;
  });

  it("binds asUser() to api.asUser().requestJira and asApp() to api.asApp().requestJira", async () => {
    const ports = createForgePorts({ accountId: "u-1" });
    expect(await ports.jira.asUser().getMyself()).toEqual({ ok: true, value: { accountId: "u-1", displayName: "user" } });
    expect((await ports.jira.asApp().getIssueLinkTypes()).ok).toBe(true);
    expect(apiState.calls).toEqual([
      { principal: "user", kind: "jira", path: "/rest/api/3/myself", method: "GET" },
      { principal: "app", kind: "jira", path: "/rest/api/3/issueLinkType", method: "GET" },
    ]);
    // Never impersonates: asUser() gets no accountId argument (§14).
    expect(apiState.asUserArgs).toEqual([[]]);
  });

  it("TWG runs as the user only", async () => {
    const ports = createForgePorts({ accountId: "u-1" });
    expect(await ports.twg?.teamsOfUser("u-1")).toEqual({ status: "ok", value: [{ ari: "ari:t/1", name: "Perception" }] });
    expect(apiState.calls).toEqual([{ principal: "user", kind: "twg", operationName: "TtUserInTeams" }]);
  });

  it("consumers (no accountId): no TWG, asUser() fails unauthorized without a call, asApp() works", async () => {
    const ports = createForgePorts({});
    expect(ports.twg).toBeUndefined();
    const u = await ports.jira.asUser().getMyself();
    expect(u.ok ? null : u.error.kind).toBe("unauthorized");
    expect((await ports.jira.asApp().getIssueLinkTypes()).ok).toBe(true);
    expect(apiState.calls.map((c) => c.principal)).toEqual(["app"]);
    expect(apiState.asUserArgs).toHaveLength(0);
  });

  it("clock and ids are real and well-formed", () => {
    const ports = createForgePorts({});
    expect(ports.clock.nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(ports.ids.next("seed")).toMatch(/^seed-[0-9a-f-]{36}$/);
    expect(ports.ids.next("a b!")).toMatch(/^ab-/);
    expect(ports.ids.next("seed")).not.toBe(ports.ids.next("seed"));
  });

  it("createForgeContext builds a service context over the real adapters (no longer a throwing stub)", async () => {
    const ctx = createForgeContext()({ accountId: "u-1", focusIssueKey: "TTDEMO-1" });
    expect(ctx.accountId).toBe("u-1");
    expect(ctx.ports.twg).toBeDefined();
    expect((await ctx.ports.jira.asUser().getMyself()).ok).toBe(true);
  });
});
