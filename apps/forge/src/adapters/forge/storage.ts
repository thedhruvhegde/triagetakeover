/**
 * Real StoragePort over `@forge/kvs`: KVS key-values (§7.4) and custom entities (§7.3).
 *
 * - Key and value limits are checked before any call (VERIFIED: 500-char keys, 240 KiB values),
 *   so oversize writes fail as `value-too-large` without a round trip.
 * - KVS errors (`ForgeKvsAPIError`, matched structurally so a second bundled copy of the
 *   package still classifies) map onto port kinds; 429 is retried with back-off within a small
 *   budget, then reported `rate-limited`.
 * - SPIKE-E2: composite partitions, page sizes, cursors and float/any attributes are unverified.
 */
import { kvs, Sort, WhereConditions } from "@forge/kvs";
import { utf8ByteLength } from "@tt/engine";
import type { EntityName, EntityRows } from "../../ports/entities";
import { kindForStatus, ok, portErr, type PortErrorKind, type PortResult } from "../../ports/result";
import {
  STORAGE_KEY_MAX_LENGTH,
  STORAGE_KEY_PATTERN,
  STORAGE_QUERY_DEFAULT_LIMIT,
  STORAGE_QUERY_MAX_LIMIT,
  STORAGE_VALUE_MAX_BYTES,
  type EntityItem,
  type EntityQuery,
  type KeyValue,
  type Page,
  type PageOptions,
  type RangeCondition,
  type SetOptions,
  type StoragePort,
} from "../../ports/storage";
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from "./http";

/** The slice of the `@forge/kvs` client this adapter uses (the default export satisfies it). */
export type KvsClient = Pick<typeof kvs, "get" | "set" | "delete" | "query" | "entity">;

interface Classified {
  readonly kind: PortErrorKind;
  readonly message: string;
  readonly status?: number;
}

/** Structural `ForgeKvsAPIError` check: `{code, responseDetails: {status}}`. */
export function classifyKvsError(e: unknown): Classified {
  if (typeof e === "object" && e !== null) {
    const r = e as { code?: unknown; message?: unknown; responseDetails?: { status?: unknown } };
    const status = typeof r.responseDetails?.status === "number" ? r.responseDetails.status : undefined;
    const code = typeof r.code === "string" ? r.code : "";
    const message = `${code !== "" ? `${code}: ` : ""}${typeof r.message === "string" ? r.message : "storage error"}`.slice(0, 300);
    if (status === 429 || /RATE_LIMIT|TOO_MANY_REQUESTS/i.test(code)) return { kind: "rate-limited", message, ...(status !== undefined ? { status } : {}) };
    if (status === 413 || /TOO_LARGE|TOO_BIG|SIZE/i.test(code)) return { kind: "value-too-large", message, ...(status !== undefined ? { status } : {}) };
    if (status !== undefined) return { kind: kindForStatus(status), message, status };
    if (code !== "") return { kind: "unknown", message };
  }
  return { kind: "unavailable", message: e instanceof Error ? e.message.slice(0, 300) : "storage error" };
}

/**
 * True when a `FAIL_IF_EXISTS` write was refused because the key exists. SPIKE-E2: the exact
 * error code is undocumented; a 409 or a code naming the condition counts.
 */
export function isKeyExistsError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const r = e as { code?: unknown; responseDetails?: { status?: unknown } };
  const code = typeof r.code === "string" ? r.code : "";
  return r.responseDetails?.status === 409 || /EXIST|CONFLICT|CONDITION|PRECONDITION/i.test(code);
}

function checkKey(key: string, op: string): { readonly ok: false; readonly error: ReturnType<typeof portErr>["error"] } | null {
  if (key.length === 0 || key.length > STORAGE_KEY_MAX_LENGTH || !STORAGE_KEY_PATTERN.test(key)) {
    return portErr("bad-request", `invalid storage key (1-${STORAGE_KEY_MAX_LENGTH} chars of [a-zA-Z0-9:._ -#])`, { op: `storage.${op}` });
  }
  return null;
}

function checkValue(value: unknown, op: string): { readonly ok: false; readonly error: ReturnType<typeof portErr>["error"] } | null {
  if (value === undefined) return portErr("bad-request", "value must not be undefined", { op: `storage.${op}` });
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    json = undefined;
  }
  if (json === undefined) return portErr("bad-request", "value must be JSON", { op: `storage.${op}` });
  if (utf8ByteLength(json) > STORAGE_VALUE_MAX_BYTES) return portErr("value-too-large", `value exceeds ${STORAGE_VALUE_MAX_BYTES} bytes`, { op: `storage.${op}` });
  return null;
}

function limitOf(n: number | undefined, op: string): PortResult<number> {
  const limit = n ?? STORAGE_QUERY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > STORAGE_QUERY_MAX_LIMIT) return portErr("bad-request", `limit must be 1-${STORAGE_QUERY_MAX_LIMIT}`, { op: `storage.${op}` });
  return ok(limit);
}

function ttlOf(opts: SetOptions): { ttl: { value: number; unit: "SECONDS" } } | Record<string, never> {
  return opts.ttlSeconds !== undefined ? { ttl: { value: Math.max(1, Math.round(opts.ttlSeconds)), unit: "SECONDS" } } : {};
}

type WhereClause = Parameters<ReturnType<ReturnType<ReturnType<KvsClient["entity"]>["query"]>["index"]>["where"]>[0];

/** {@link RangeCondition} → `WhereConditions` clause. */
export function whereOf(range: RangeCondition): WhereClause {
  switch (range.op) {
    case "equalTo":
      return WhereConditions.equalTo(range.value);
    case "beginsWith":
      return WhereConditions.beginsWith(range.value);
    case "between":
      return WhereConditions.between(range.from, range.to);
    case "greaterThan":
      return WhereConditions.greaterThan(range.value);
    case "greaterThanEqualTo":
      return WhereConditions.greaterThanEqualTo(range.value);
    case "lessThan":
      return WhereConditions.lessThan(range.value);
    case "lessThanEqualTo":
      return WhereConditions.lessThanEqualTo(range.value);
  }
}

export class ForgeStorage implements StoragePort {
  constructor(
    private readonly client: KvsClient = kvs,
    private readonly policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  ) {}

  /** Runs one KVS call; retries rate limits within the policy; never throws. */
  private async run<T>(op: string, f: () => Promise<T>): Promise<PortResult<T>> {
    let slept = 0;
    for (let attempt = 1; ; attempt++) {
      try {
        return ok(await f());
      } catch (e) {
        const c = classifyKvsError(e);
        if (c.kind === "rate-limited" && attempt < this.policy.maxAttempts) {
          const wait = Math.round(this.policy.baseDelayMs * 2 ** (attempt - 1) * (0.5 + this.policy.random() / 2));
          if (slept + wait <= this.policy.budgetMs) {
            await this.policy.sleep(wait);
            slept += wait;
            continue;
          }
        }
        return portErr(c.kind, c.message, { op: `storage.${op}`, ...(c.status !== undefined ? { status: c.status } : {}), ...(c.kind === "rate-limited" ? { retryAfterSeconds: 5 } : {}) });
      }
    }
  }

  // ------------------------------------------------------------ KVS

  async get(key: string): Promise<PortResult<unknown>> {
    const bad = checkKey(key, "get");
    if (bad !== null) return bad;
    return this.run("get", () => this.client.get<unknown>(key));
  }

  async set(key: string, value: unknown, opts: SetOptions = {}): Promise<PortResult<void>> {
    const bad = checkKey(key, "set") ?? checkValue(value, "set");
    if (bad !== null) return bad;
    const options = ttlOf(opts);
    return this.run("set", () => ("ttl" in options ? this.client.set(key, value, options) : this.client.set(key, value)));
  }

  async setIfAbsent(key: string, value: unknown, opts: SetOptions = {}): Promise<PortResult<boolean>> {
    const bad = checkKey(key, "setIfAbsent") ?? checkValue(value, "setIfAbsent");
    if (bad !== null) return bad;
    return this.run("setIfAbsent", async () => {
      try {
        await this.client.set(key, value, { keyPolicy: "FAIL_IF_EXISTS", ...ttlOf(opts) });
        return true;
      } catch (e) {
        if (isKeyExistsError(e)) return false;
        throw e;
      }
    });
  }

  async delete(key: string): Promise<PortResult<void>> {
    const bad = checkKey(key, "delete");
    if (bad !== null) return bad;
    return this.run("delete", () => this.client.delete(key));
  }

  async queryByPrefix(prefix: string, opts: PageOptions = {}): Promise<PortResult<Page<KeyValue>>> {
    const limit = limitOf(opts.limit, "queryByPrefix");
    if (!limit.ok) return limit;
    return this.run("queryByPrefix", async () => {
      let q = this.client.query();
      if (prefix !== "") q = q.where("key", WhereConditions.beginsWith(prefix));
      q = q.limit(limit.value);
      if (opts.cursor !== undefined) q = q.cursor(opts.cursor);
      const res = await q.getMany<unknown>();
      const items = res.results.map((r) => ({ key: r.key, value: r.value }));
      return res.nextCursor !== undefined && res.nextCursor !== "" ? { items, nextCursor: res.nextCursor } : { items };
    });
  }

  // ------------------------------------------------------------ custom entities

  async putEntity<E extends EntityName>(entity: E, key: string, value: EntityRows[E]): Promise<PortResult<void>> {
    const bad = checkKey(key, "putEntity") ?? checkValue(value, "putEntity");
    if (bad !== null) return bad;
    return this.run("putEntity", () => this.client.entity<EntityRows[E]>(entity).set(key, value));
  }

  async getEntity<E extends EntityName>(entity: E, key: string): Promise<PortResult<EntityRows[E] | undefined>> {
    const bad = checkKey(key, "getEntity");
    if (bad !== null) return bad;
    return this.run("getEntity", () => this.client.entity<EntityRows[E]>(entity).get(key));
  }

  async deleteEntity(entity: EntityName, key: string): Promise<PortResult<void>> {
    const bad = checkKey(key, "deleteEntity");
    if (bad !== null) return bad;
    return this.run("deleteEntity", () => this.client.entity(entity).delete(key));
  }

  async queryEntities<E extends EntityName>(entity: E, query: EntityQuery): Promise<PortResult<Page<EntityItem<EntityRows[E]>>>> {
    const limit = limitOf(query.limit, "queryEntities");
    if (!limit.ok) return limit;
    return this.run("queryEntities", async () => {
      let q = this.client
        .entity<EntityRows[E]>(entity)
        .query()
        .index(query.index, { partition: [...query.partition] });
      if (query.range !== undefined) q = q.where(whereOf(query.range));
      q = q.sort(query.sort === "DESC" ? Sort.DESC : Sort.ASC).limit(limit.value);
      if (query.cursor !== undefined) q = q.cursor(query.cursor);
      const res = await q.getMany();
      const items = res.results.map((r) => ({ key: r.key, value: r.value }));
      return res.nextCursor !== undefined && res.nextCursor !== "" ? { items, nextCursor: res.nextCursor } : { items };
    });
  }
}
