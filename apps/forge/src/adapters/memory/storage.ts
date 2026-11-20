/**
 * In-memory Forge storage: KVS (with TTL against the injected clock and the 240 KiB value
 * limit) and custom entities (attribute types and indexes from ENTITY_SPECS, which mirror the
 * manifest). Values are stored as JSON text, so callers never share references with storage.
 *
 * Query behaviour (SPIKE-E2 assumptions, not verified on the platform):
 * - rows lacking any partition or range attribute of an index are not in that index;
 * - results sort by the range attribute, then by key; default page 10, max 100;
 * - cursors are opaque and only valid for the same query.
 */
import { utf8ByteLength } from "@tt/engine";
import type { Clock } from "../../ports/clock";
import { ENTITY_SPECS, type EntityAttributeType, type EntityName, type EntityRows } from "../../ports/entities";
import { ok, portErr, type PortError, type PortErrorKind, type PortResult } from "../../ports/result";
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

interface KvRec {
  readonly json: string;
  /** Epoch ms; absent = no TTL. */
  readonly expiresAt?: number;
}

export interface StorageCall {
  readonly op: string;
  readonly target?: string;
}

export class MemoryStorage implements StoragePort {
  readonly calls: StorageCall[] = [];
  private readonly kv = new Map<string, KvRec>();
  private readonly entities = new Map<EntityName, Map<string, string>>();
  private readonly faults = new Map<string, PortError[]>();

  constructor(private readonly clock: Clock) {}

  // ------------------------------------------------------------ test helpers

  /** Makes the next `times` calls of `op` (method name or `*`) fail. */
  failNext(op: string, error: PortErrorKind | PortError, times = 1): void {
    const e: PortError = typeof error === "string" ? { kind: error, message: `injected ${error}`, op: `storage.${op}` } : error;
    const list = this.faults.get(op) ?? [];
    for (let i = 0; i < times; i++) list.push(e);
    this.faults.set(op, list);
  }

  /** All live KVS keys, sorted (expired keys excluded). */
  keys(): string[] {
    return [...this.kv.keys()].filter((k) => this.live(k) !== undefined).sort();
  }

  /** Number of rows of an entity. */
  entityCount(entity: EntityName): number {
    return this.entities.get(entity)?.size ?? 0;
  }

  // ------------------------------------------------------------ KVS

  async get(key: string): Promise<PortResult<unknown>> {
    const pre = await this.enter("get", key);
    if (pre !== null) return pre;
    const bad = checkKey(key, "get");
    if (bad !== null) return bad;
    const rec = this.live(key);
    return ok(rec === undefined ? undefined : (JSON.parse(rec.json) as unknown));
  }

  async set(key: string, value: unknown, opts: SetOptions = {}): Promise<PortResult<void>> {
    const pre = await this.enter("set", key);
    if (pre !== null) return pre;
    const rec = this.makeRec(key, value, opts, "set");
    if (!rec.ok) return rec;
    this.kv.set(key, rec.value);
    return ok(undefined);
  }

  async setIfAbsent(key: string, value: unknown, opts: SetOptions = {}): Promise<PortResult<boolean>> {
    const pre = await this.enter("setIfAbsent", key);
    if (pre !== null) return pre;
    const rec = this.makeRec(key, value, opts, "setIfAbsent");
    if (!rec.ok) return rec;
    if (this.live(key) !== undefined) return ok(false);
    this.kv.set(key, rec.value);
    return ok(true);
  }

  async delete(key: string): Promise<PortResult<void>> {
    const pre = await this.enter("delete", key);
    if (pre !== null) return pre;
    const bad = checkKey(key, "delete");
    if (bad !== null) return bad;
    this.kv.delete(key);
    return ok(undefined);
  }

  async queryByPrefix(prefix: string, opts: PageOptions = {}): Promise<PortResult<Page<KeyValue>>> {
    const pre = await this.enter("queryByPrefix", prefix);
    if (pre !== null) return pre;
    const page = pageParams(opts, "queryByPrefix");
    if (!page.ok) return page;
    const keys = this.keys().filter((k) => k.startsWith(prefix));
    const slice = keys.slice(page.value.offset, page.value.offset + page.value.limit);
    const items = slice.map((key) => ({ key, value: JSON.parse((this.kv.get(key) as KvRec).json) as unknown }));
    return ok(withCursor(items, page.value.offset + page.value.limit < keys.length ? page.value.offset + page.value.limit : undefined));
  }

  // ------------------------------------------------------------ custom entities

  async putEntity<E extends EntityName>(entity: E, key: string, value: EntityRows[E]): Promise<PortResult<void>> {
    const pre = await this.enter("putEntity", `${entity}/${key}`);
    if (pre !== null) return pre;
    const bad = checkKey(key, "putEntity");
    if (bad !== null) return bad;
    const invalid = checkRow(entity, value);
    if (invalid !== null) return portErr("bad-request", invalid, { op: "storage.putEntity" });
    const json = JSON.stringify(value);
    if (utf8ByteLength(json) > STORAGE_VALUE_MAX_BYTES) return portErr("value-too-large", `entity value exceeds ${STORAGE_VALUE_MAX_BYTES} bytes`, { op: "storage.putEntity" });
    this.table(entity).set(key, json);
    return ok(undefined);
  }

  async getEntity<E extends EntityName>(entity: E, key: string): Promise<PortResult<EntityRows[E] | undefined>> {
    const pre = await this.enter("getEntity", `${entity}/${key}`);
    if (pre !== null) return pre;
    const json = this.table(entity).get(key);
    return ok(json === undefined ? undefined : (JSON.parse(json) as EntityRows[E]));
  }

  async deleteEntity(entity: EntityName, key: string): Promise<PortResult<void>> {
    const pre = await this.enter("deleteEntity", `${entity}/${key}`);
    if (pre !== null) return pre;
    this.table(entity).delete(key);
    return ok(undefined);
  }

  async queryEntities<E extends EntityName>(entity: E, query: EntityQuery): Promise<PortResult<Page<EntityItem<EntityRows[E]>>>> {
    const pre = await this.enter("queryEntities", `${entity}/${query.index}`);
    if (pre !== null) return pre;
    const spec = ENTITY_SPECS[entity];
    const index = spec.indexes.find((i) => i.name === query.index);
    if (index === undefined) return portErr("bad-request", `entity ${entity} has no index ${query.index}`, { op: "storage.queryEntities" });
    if (query.partition.length !== index.partition.length) {
      return portErr("bad-request", `index ${query.index} needs ${index.partition.length} partition value(s)`, { op: "storage.queryEntities" });
    }
    const page = pageParams(query, "queryEntities");
    if (!page.ok) return page;
    const rangeAttr = index.range[0] as string;
    const rows: { key: string; value: Record<string, unknown>; r: string | number | boolean }[] = [];
    for (const [key, json] of this.table(entity)) {
      const value = JSON.parse(json) as Record<string, unknown>;
      const inIndex = index.partition.every((a, i) => value[a] !== undefined && value[a] === query.partition[i]);
      const r = value[rangeAttr];
      if (!inIndex || !(typeof r === "string" || typeof r === "number" || typeof r === "boolean")) continue;
      if (query.range !== undefined && !rangeMatches(query.range, r)) continue;
      rows.push({ key, value, r });
    }
    const dir = query.sort === "DESC" ? -1 : 1;
    rows.sort((a, b) => dir * (cmp(a.r, b.r) || cmp(a.key, b.key)));
    const slice = rows.slice(page.value.offset, page.value.offset + page.value.limit);
    const items = slice.map((x) => ({ key: x.key, value: x.value as unknown as EntityRows[E] }));
    return ok(withCursor(items, page.value.offset + page.value.limit < rows.length ? page.value.offset + page.value.limit : undefined));
  }

  // ------------------------------------------------------------ internals

  private async enter(op: string, target?: string): Promise<{ readonly ok: false; readonly error: PortError } | null> {
    await Promise.resolve();
    this.calls.push({ op, ...(target !== undefined ? { target } : {}) });
    const list = this.faults.get(op) ?? this.faults.get("*");
    const fault = list !== undefined && list.length > 0 ? list.shift() : undefined;
    return fault === undefined ? null : { ok: false, error: fault };
  }

  private live(key: string): KvRec | undefined {
    const rec = this.kv.get(key);
    if (rec === undefined) return undefined;
    if (rec.expiresAt !== undefined && rec.expiresAt <= this.clock.nowMs()) {
      this.kv.delete(key);
      return undefined;
    }
    return rec;
  }

  private makeRec(key: string, value: unknown, opts: SetOptions, op: string): PortResult<KvRec> {
    const bad = checkKey(key, op);
    if (bad !== null) return bad;
    if (value === undefined) return portErr("bad-request", "value must not be undefined", { op: `storage.${op}` });
    let json: string | undefined;
    try {
      json = JSON.stringify(value);
    } catch {
      json = undefined;
    }
    if (json === undefined) return portErr("bad-request", "value is not JSON-serializable", { op: `storage.${op}` });
    if (utf8ByteLength(json) > STORAGE_VALUE_MAX_BYTES) return portErr("value-too-large", `value exceeds ${STORAGE_VALUE_MAX_BYTES} bytes`, { op: `storage.${op}` });
    if (opts.ttlSeconds !== undefined && !(Number.isInteger(opts.ttlSeconds) && opts.ttlSeconds > 0)) {
      return portErr("bad-request", "ttlSeconds must be a positive integer", { op: `storage.${op}` });
    }
    return ok({ json, ...(opts.ttlSeconds !== undefined ? { expiresAt: this.clock.nowMs() + opts.ttlSeconds * 1000 } : {}) });
  }

  private table(entity: EntityName): Map<string, string> {
    let t = this.entities.get(entity);
    if (t === undefined) {
      t = new Map();
      this.entities.set(entity, t);
    }
    return t;
  }
}

function checkKey(key: string, op: string): { readonly ok: false; readonly error: PortError } | null {
  if (key.length === 0 || key.length > STORAGE_KEY_MAX_LENGTH || !STORAGE_KEY_PATTERN.test(key)) {
    return portErr("bad-request", `invalid storage key ${JSON.stringify(key)}`, { op: `storage.${op}` });
  }
  return null;
}

function typeOk(t: EntityAttributeType, v: unknown): boolean {
  switch (t) {
    case "string":
      return typeof v === "string";
    case "boolean":
      return typeof v === "boolean";
    case "integer":
      return typeof v === "number" && Number.isSafeInteger(v);
    case "float":
      return typeof v === "number" && Number.isFinite(v);
    case "any":
      return true;
  }
}

/** Every attribute must be declared and of its declared type. Returns an error message or null. */
function checkRow(entity: EntityName, value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return `${entity}: row must be an object`;
  const attrs = ENTITY_SPECS[entity].attributes as Readonly<Record<string, EntityAttributeType>>;
  for (const [k, v] of Object.entries(value)) {
    const t = attrs[k];
    if (t === undefined) return `${entity}.${k}: attribute is not declared in the manifest`;
    if (v !== undefined && !typeOk(t, v)) return `${entity}.${k}: expected ${t}`;
  }
  return null;
}

function cmp(a: string | number | boolean, b: string | number | boolean): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function rangeMatches(c: RangeCondition, r: string | number | boolean): boolean {
  switch (c.op) {
    case "equalTo":
      return r === c.value;
    case "beginsWith":
      return String(r).startsWith(String(c.value));
    case "between":
      return typeof r !== "boolean" && cmp(r, c.from) >= 0 && cmp(r, c.to) <= 0;
    case "greaterThan":
      return typeof r !== "boolean" && cmp(r, c.value) > 0;
    case "greaterThanEqualTo":
      return typeof r !== "boolean" && cmp(r, c.value) >= 0;
    case "lessThan":
      return typeof r !== "boolean" && cmp(r, c.value) < 0;
    case "lessThanEqualTo":
      return typeof r !== "boolean" && cmp(r, c.value) <= 0;
  }
}

function pageParams(opts: PageOptions, op: string): PortResult<{ readonly limit: number; readonly offset: number }> {
  const limit = opts.limit ?? STORAGE_QUERY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > STORAGE_QUERY_MAX_LIMIT) {
    return portErr("bad-request", `limit must be 1-${STORAGE_QUERY_MAX_LIMIT}`, { op: `storage.${op}` });
  }
  let offset = 0;
  if (opts.cursor !== undefined) {
    const m = /^c:(\d+)$/.exec(opts.cursor);
    if (m === null) return portErr("bad-request", "invalid cursor", { op: `storage.${op}` });
    offset = Number(m[1]);
  }
  return ok({ limit, offset });
}

function withCursor<T>(items: readonly T[], next: number | undefined): Page<T> {
  return next === undefined ? { items } : { items, nextCursor: `c:${next}` };
}
