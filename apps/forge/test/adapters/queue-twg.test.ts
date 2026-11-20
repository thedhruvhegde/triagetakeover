import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @forge/events: keep the real error classes, replace Queue with a recorder.
const queueState = vi.hoisted(() => ({
  created: [] as string[],
  pushes: [] as { queue: string; event: unknown }[],
  failWith: null as Error | null,
}));

vi.mock("@forge/events", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class Queue {
    private readonly key: string;
    constructor(params: { key: string }) {
      this.key = params.key;
      queueState.created.push(params.key);
    }
    push(event: unknown): Promise<{ jobId: string }> {
      if (queueState.failWith !== null) return Promise.reject(queueState.failWith);
      queueState.pushes.push({ queue: this.key, event });
      return Promise.resolve({ jobId: `job-${queueState.pushes.length}` });
    }
  }
  return { ...actual, Queue };
});

const { ForgeQueue, concurrencyKey } = await import("../../src/adapters/forge/queue.js");
const { ForgeTwg, TWG_QUERIES, firstConnectionNodes, userAri } = await import("../../src/adapters/forge/twg.js");
const events = await vi.importActual<Record<string, new (message: string) => Error>>("@forge/events");
const { response } = await import("./helpers.js");

describe("ForgeQueue", () => {
  beforeEach(() => {
    queueState.created.length = 0;
    queueState.pushes.length = 0;
    queueState.failWith = null;
  });

  it("pushes recluster jobs with concurrency key = projectKey, limit 1", async () => {
    const q = new ForgeQueue();
    const job = { projectKey: "TTDEMO", reason: "accept" as const, requestedAt: "2026-11-20T09:00:00.000Z", bucket: "lane-loss|cam-B" };
    expect(await q.pushRecluster(job)).toEqual({ ok: true, value: { jobId: "job-1" } });
    expect(await q.pushRecluster(job, { delaySeconds: 30 })).toEqual({ ok: true, value: { jobId: "job-2" } });
    expect(queueState.created).toEqual(["tt-recluster"]);
    expect(queueState.pushes).toEqual([
      { queue: "tt-recluster", event: { body: job, concurrency: { key: "TTDEMO", limit: 1 } } },
      { queue: "tt-recluster", event: { body: job, delayInSeconds: 30, concurrency: { key: "TTDEMO", limit: 1 } } },
    ]);
  });

  it("pushes seed steps with concurrency key = jobId", async () => {
    const q = new ForgeQueue();
    await q.pushSeed({ jobId: "seed-abc", step: "history", cursor: 4, seed: 2029 });
    expect(queueState.pushes[0]).toEqual({ queue: "tt-seed", event: { body: { jobId: "seed-abc", step: "history", cursor: 4, seed: 2029 }, concurrency: { key: "seed-abc", limit: 1 } } });
  });

  it("checks delay and payload limits before pushing", async () => {
    const q = new ForgeQueue();
    const job = { projectKey: "TTDEMO", reason: "resync" as const, requestedAt: "x" };
    expect((await q.pushRecluster(job, { delaySeconds: 901 })).ok).toBe(false);
    expect((await q.pushRecluster(job, { delaySeconds: 1.5 })).ok).toBe(false);
    const big = await q.pushRecluster({ ...job, requestedBy: "x".repeat(100 * 1024) });
    expect(big.ok ? null : big.error.kind).toBe("value-too-large");
    expect(queueState.pushes).toHaveLength(0);
  });

  it("maps @forge/events errors onto port kinds", async () => {
    const cases: [string, string][] = [
      ["RateLimitError", "rate-limited"],
      ["PayloadTooBigError", "value-too-large"],
      ["InvalidPushSettingsError", "bad-request"],
      ["InternalServerError", "unavailable"],
    ];
    for (const [cls, kind] of cases) {
      const Ctor = events[cls];
      if (Ctor === undefined) throw new Error(`missing ${cls}`);
      queueState.failWith = new Ctor("boom");
      const r = await new ForgeQueue().pushSeed({ jobId: "j", step: "s", cursor: 0, seed: 1 });
      expect(r.ok ? null : r.error.kind).toBe(kind);
    }
  });

  it("sanitises concurrency keys", () => {
    expect(concurrencyKey("TTDEMO")).toBe("TTDEMO");
    expect(concurrencyKey("a b/c")).toBe("a_b_c");
  });
});

describe("ForgeTwg", () => {
  const TEAM = "ari:cloud:identity::team/11111111-2222-3333-4444-555555555555";
  afterEach(() => vi.useRealTimers());

  function twgWith(body: unknown, status = 200) {
    const calls: { query: string; variables: Record<string, unknown>; operationName: string }[] = [];
    const twg = new ForgeTwg(async (query, variables, operationName) => {
      calls.push({ query, variables, operationName });
      return response(status, body);
    });
    return { twg, calls };
  }

  it("teamsOfUser sends the curated query as the user ARI and returns teams by name", async () => {
    const { twg, calls } = twgWith({ data: { atlassianUserInTeams: { edges: [{ node: { id: "ari:t/2", displayName: "Planning" } }, { node: { id: "ari:t/1", displayName: "Perception" } }] } } });
    expect(await twg.teamsOfUser("557058:abc")).toEqual({ status: "ok", value: [{ ari: "ari:t/1", name: "Perception" }, { ari: "ari:t/2", name: "Planning" }] });
    expect(calls).toEqual([{ query: TWG_QUERIES.userInTeams.query, variables: { userId: "ari:cloud:identity::user/557058:abc", first: 25 }, operationName: "TtUserInTeams" }]);
  });

  it("teamMembers caps first at 25 and reads account ids from nodes or user ARIs", async () => {
    const { twg, calls } = twgWith({ data: { atlassianTeamMembers: { displayName: "Perception", edges: [{ node: { accountId: "u-1" } }, { node: { id: "ari:cloud:identity::user/u-2" } }, { node: { id: "junk" } }] } } });
    expect(await twg.teamMembers(TEAM, { first: 99 })).toEqual({ status: "ok", value: { team: { ari: TEAM, name: "Perception" }, memberAccountIds: ["u-1", "u-2"] } });
    expect(calls[0]?.variables).toEqual({ teamId: TEAM, first: 25 });
  });

  it("an empty connection is `empty` (possibly a missing scope), never invented data", async () => {
    const a = twgWith({ data: { atlassianUserInTeams: { edges: [] } } });
    expect(await a.twg.teamsOfUser("u")).toEqual({ status: "empty", message: "possibly a missing scope or no data" });
    const b = twgWith({ data: null });
    expect((await b.twg.teamMembers(TEAM)).status).toBe("empty");
  });

  it("classifies not-permitted, GraphQL errors and HTTP errors", async () => {
    const np = twgWith({ errors: [{ message: "User is not permitted to query this organization" }], data: null });
    expect(await np.twg.teamsOfUser("u")).toEqual({ status: "not-permitted", message: "User is not permitted to query this organization" });
    const gql = twgWith({ errors: [{ message: "Cannot query field 'atlassianUserInTeams'" }], data: null });
    expect(await gql.twg.teamsOfUser("u")).toEqual({ status: "error", message: "Cannot query field 'atlassianUserInTeams'" });
    const http = twgWith({ errors: [{ message: "forbidden" }] }, 403);
    expect(await http.twg.teamsOfUser("u")).toEqual({ status: "error", message: "Teamwork Graph answered HTTP 403: forbidden" });
    const thrown = new ForgeTwg(() => Promise.reject(new Error("network down")));
    expect(await thrown.teamsOfUser("u")).toEqual({ status: "error", message: "network down" });
  });

  it("times out after 4 s", async () => {
    vi.useFakeTimers();
    const twg = new ForgeTwg(() => new Promise(() => undefined));
    const p = twg.teamsOfUser("u");
    await vi.advanceTimersByTimeAsync(4000);
    expect(await p).toEqual({ status: "error", message: "Teamwork Graph did not answer within 4 s" });
  });

  it("helpers", () => {
    expect(userAri("ari:cloud:identity::user/x")).toBe("ari:cloud:identity::user/x");
    expect(firstConnectionNodes({ a: { b: { nodes: [{ id: "1" }, 3] } } })).toEqual([{ id: "1" }]);
    expect(firstConnectionNodes("x")).toBeNull();
  });
});
