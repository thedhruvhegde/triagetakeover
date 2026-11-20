import { describe, expect, it } from "vitest";
import { ForgeStorage, classifyKvsError, isKeyExistsError, type KvsClient } from "../../src/adapters/forge/storage.js";
import type { EventRow } from "../../src/ports/entities.js";
import { instantPolicy } from "./helpers.js";

/** Shape of `ForgeKvsAPIError` (matched structurally by the adapter). */
function kvsError(status: number, code: string): Error {
  return Object.assign(new Error(code), { code, responseDetails: { status, statusText: "" } });
}

interface Call {
  readonly op: string;
  readonly args: readonly unknown[];
}

/** Recording fake of the `@forge/kvs` client, including the query builder chains. */
function fakeKvs(script: { get?: unknown; getMany?: { results: { key: string; value: unknown }[]; nextCursor?: string }; fail?: Partial<Record<string, Error[]>> } = {}) {
  const calls: Call[] = [];
  const fail = (op: string): void => {
    const e = script.fail?.[op]?.shift();
    if (e !== undefined) throw e;
  };
  const builder = (prefix: string): Record<string, unknown> => {
    const b: Record<string, unknown> = {};
    for (const m of ["where", "limit", "cursor", "sort", "filters"]) {
      b[m] = (...args: unknown[]) => {
        calls.push({ op: `${prefix}.${m}`, args });
        return b;
      };
    }
    b["index"] = (...args: unknown[]) => {
      calls.push({ op: `${prefix}.index`, args });
      return b;
    };
    b["getMany"] = async () => {
      calls.push({ op: `${prefix}.getMany`, args: [] });
      fail(`${prefix}.getMany`);
      return script.getMany ?? { results: [] };
    };
    return b;
  };
  const client = {
    get: async (key: string) => {
      calls.push({ op: "get", args: [key] });
      fail("get");
      return script.get;
    },
    set: async (...args: unknown[]) => {
      calls.push({ op: "set", args });
      fail("set");
    },
    delete: async (key: string) => {
      calls.push({ op: "delete", args: [key] });
      fail("delete");
    },
    query: () => {
      calls.push({ op: "query", args: [] });
      return builder("query");
    },
    entity: (name: string) => {
      calls.push({ op: "entity", args: [name] });
      return {
        get: async (key: string) => {
          calls.push({ op: "entity.get", args: [key] });
          fail("entity.get");
          return script.get;
        },
        set: async (...args: unknown[]) => {
          calls.push({ op: "entity.set", args });
          fail("entity.set");
        },
        delete: async (key: string) => {
          calls.push({ op: "entity.delete", args: [key] });
        },
        query: () => {
          calls.push({ op: "entity.query", args: [] });
          return builder("eq");
        },
      };
    },
  };
  return { client: client as unknown as KvsClient, calls };
}

const ROW: EventRow = {
  issueKey: "TTDEMO-1",
  projectKey: "TTDEMO",
  bucket: "lane-loss|cam-B",
  type: "lane-loss",
  variant: "cam-B",
  build: "4.12.0",
  occurredAt: 1_763_000_000,
  status: "accepted",
  clusterId: "20010",
  proposalId: "",
  nnDist: 0.2,
  chipsMask: 2,
  features: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as unknown as EventRow["features"],
  engine: "1.0.0",
  synthetic: true,
  indexedAt: 1_763_000_100,
};

describe("ForgeStorage: KVS", () => {
  it("get / set with TTL in seconds / delete", async () => {
    const { client, calls } = fakeKvs({ get: { at: "t" } });
    const s = new ForgeStorage(client, instantPolicy());
    expect(await s.get("triaged:TTDEMO")).toEqual({ ok: true, value: { at: "t" } });
    expect((await s.set("board:TTDEMO", { x: 1 }, { ttlSeconds: 60 })).ok).toBe(true);
    expect((await s.set("config:TTDEMO", { y: 2 })).ok).toBe(true);
    expect((await s.delete("board:TTDEMO")).ok).toBe(true);
    expect(calls).toEqual([
      { op: "get", args: ["triaged:TTDEMO"] },
      { op: "set", args: ["board:TTDEMO", { x: 1 }, { ttl: { value: 60, unit: "SECONDS" } }] },
      { op: "set", args: ["config:TTDEMO", { y: 2 }] },
      { op: "delete", args: ["board:TTDEMO"] },
    ]);
  });

  it("absent keys read as undefined", async () => {
    const { client } = fakeKvs();
    expect(await new ForgeStorage(client, instantPolicy()).get("x")).toEqual({ ok: true, value: undefined });
  });

  it("checks key and value limits before calling KVS", async () => {
    const { client, calls } = fakeKvs();
    const s = new ForgeStorage(client, instantPolicy());
    expect((await s.get("bad/key")).ok).toBe(false);
    const big = await s.set("k", "x".repeat(240 * 1024));
    expect(big.ok ? null : big.error.kind).toBe("value-too-large");
    expect((await s.set("k", undefined)).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("setIfAbsent uses FAIL_IF_EXISTS and reports an existing key as false", async () => {
    const { client, calls } = fakeKvs({ fail: { set: [kvsError(409, "KEY_ALREADY_EXISTS")] } });
    const s = new ForgeStorage(client, instantPolicy());
    expect(await s.setIfAbsent("job:seed:1", { a: 1 }, { ttlSeconds: 1800 })).toEqual({ ok: true, value: false });
    expect(await s.setIfAbsent("job:seed:1", { a: 1 })).toEqual({ ok: true, value: true });
    expect(calls[0]).toEqual({ op: "set", args: ["job:seed:1", { a: 1 }, { keyPolicy: "FAIL_IF_EXISTS", ttl: { value: 1800, unit: "SECONDS" } }] });
    expect(calls[1]).toEqual({ op: "set", args: ["job:seed:1", { a: 1 }, { keyPolicy: "FAIL_IF_EXISTS" }] });
  });

  it("queryByPrefix builds beginsWith + limit + cursor and returns the next cursor", async () => {
    const { client, calls } = fakeKvs({ getMany: { results: [{ key: "job:seed:a", value: 1 }], nextCursor: "c2" } });
    const r = await new ForgeStorage(client, instantPolicy()).queryByPrefix("job:", { limit: 25, cursor: "c1" });
    expect(r).toEqual({ ok: true, value: { items: [{ key: "job:seed:a", value: 1 }], nextCursor: "c2" } });
    expect(calls.map((c) => c.op)).toEqual(["query", "query.where", "query.limit", "query.cursor", "query.getMany"]);
    expect(calls[1]?.args).toEqual(["key", { condition: "BEGINS_WITH", values: ["job:"] }]);
    expect(calls[2]?.args).toEqual([25]);
    const bad = await new ForgeStorage(client, instantPolicy()).queryByPrefix("job:", { limit: 101 });
    expect(bad.ok).toBe(false);
  });

  it("retries rate limits with back-off, then reports rate-limited", async () => {
    const { client } = fakeKvs({ get: 1, fail: { get: [kvsError(429, "RATE_LIMIT_EXCEEDED")] } });
    const policy = instantPolicy({ random: () => 0 });
    expect(await new ForgeStorage(client, policy).get("k")).toEqual({ ok: true, value: 1 });
    expect(policy.slept).toEqual([250]);
    const always = fakeKvs({ fail: { get: Array.from({ length: 9 }, () => kvsError(429, "RATE_LIMIT_EXCEEDED")) } });
    const r = await new ForgeStorage(always.client, instantPolicy()).get("k");
    expect(r.ok ? null : r.error).toMatchObject({ kind: "rate-limited", status: 429, op: "storage.get" });
  });

  it("classifies KVS errors", () => {
    expect(classifyKvsError(kvsError(400, "INVALID_KEY")).kind).toBe("bad-request");
    expect(classifyKvsError(kvsError(413, "VALUE_TOO_LARGE")).kind).toBe("value-too-large");
    expect(classifyKvsError(kvsError(500, "INTERNAL")).kind).toBe("unavailable");
    expect(classifyKvsError(new Error("socket")).kind).toBe("unavailable");
    expect(isKeyExistsError(kvsError(400, "KEY_ALREADY_EXISTS"))).toBe(true);
    expect(isKeyExistsError(kvsError(400, "INVALID_KEY"))).toBe(false);
  });
});

describe("ForgeStorage: custom entities", () => {
  it("put / get / delete go to the named entity", async () => {
    const { client, calls } = fakeKvs({ get: ROW });
    const s = new ForgeStorage(client, instantPolicy());
    expect((await s.putEntity("event", "20001", ROW)).ok).toBe(true);
    expect(await s.getEntity("event", "20001")).toEqual({ ok: true, value: ROW });
    expect((await s.deleteEntity("drive-session", "s-1")).ok).toBe(true);
    expect(calls).toEqual([
      { op: "entity", args: ["event"] },
      { op: "entity.set", args: ["20001", ROW] },
      { op: "entity", args: ["event"] },
      { op: "entity.get", args: ["20001"] },
      { op: "entity", args: ["drive-session"] },
      { op: "entity.delete", args: ["s-1"] },
    ]);
  });

  it("queries an index with a composite partition, range, sort, limit and cursor (SPIKE-E2)", async () => {
    const { client, calls } = fakeKvs({ getMany: { results: [{ key: "20001", value: ROW }] } });
    const r = await new ForgeStorage(client, instantPolicy()).queryEntities("event", {
      index: "by-bucket",
      partition: ["TTDEMO", "lane-loss|cam-B"],
      range: { op: "between", from: 1, to: 2 },
      sort: "DESC",
      limit: 100,
      cursor: "cur",
    });
    expect(r).toEqual({ ok: true, value: { items: [{ key: "20001", value: ROW }] } });
    expect(calls.slice(2)).toEqual([
      { op: "eq.index", args: ["by-bucket", { partition: ["TTDEMO", "lane-loss|cam-B"] }] },
      { op: "eq.where", args: [{ condition: "BETWEEN", values: [1, 2] }] },
      { op: "eq.sort", args: ["DESC"] },
      { op: "eq.limit", args: [100] },
      { op: "eq.cursor", args: ["cur"] },
      { op: "eq.getMany", args: [] },
    ]);
  });

  it("maps every range operator", async () => {
    const ops = [
      [{ op: "equalTo", value: "x" }, "EQUAL_TO"],
      [{ op: "beginsWith", value: "x" }, "BEGINS_WITH"],
      [{ op: "greaterThan", value: 1 }, "GREATER_THAN"],
      [{ op: "greaterThanEqualTo", value: 1 }, "GREATER_THAN_EQUAL_TO"],
      [{ op: "lessThan", value: 1 }, "LESS_THAN"],
      [{ op: "lessThanEqualTo", value: 1 }, "LESS_THAN_EQUAL_TO"],
    ] as const;
    for (const [range, condition] of ops) {
      const { client, calls } = fakeKvs();
      await new ForgeStorage(client, instantPolicy()).queryEntities("cluster", { index: "by-project", partition: ["TTDEMO"], range });
      expect((calls.find((c) => c.op === "eq.where")?.args[0] as { condition: string }).condition).toBe(condition);
      expect(calls.find((c) => c.op === "eq.sort")?.args).toEqual(["ASC"]);
      expect(calls.find((c) => c.op === "eq.limit")?.args).toEqual([10]);
    }
  });
});
