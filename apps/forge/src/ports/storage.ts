/**
 * StoragePort: Forge KVS key-value data (§7.4) and custom entities (§7.3).
 *
 * Forge storage is app-wide and NOT permission-filtered: services must authorise the user
 * (asUser Browse check) before returning anything read through this port (§14).
 * Values read back are untrusted JSON: validate them before use.
 */
import type { EntityName, EntityRows } from "./entities";
import type { PortResult } from "./result";

/** Forge KVS limits (VERIFIED, forge-platform §D): 240 KiB per value. */
export const STORAGE_VALUE_MAX_BYTES = 240 * 1024;
/** Forge KVS key limits: at most 500 chars from `[a-zA-Z0-9:._\s\-#]`, not only whitespace. */
export const STORAGE_KEY_MAX_LENGTH = 500;
export const STORAGE_KEY_PATTERN = /^(?!\s+$)[a-zA-Z0-9:._\s\-#]+$/;
/** Query page size. SPIKE-E2: default/max page size and cursor behaviour to be confirmed. */
export const STORAGE_QUERY_DEFAULT_LIMIT = 10;
export const STORAGE_QUERY_MAX_LIMIT = 100;

export interface SetOptions {
  /** Time to live in seconds (KVS TTL; e.g. `board:` cache 60 s, `scenarios:` 600 s). */
  readonly ttlSeconds?: number;
}

export interface KeyValue {
  readonly key: string;
  readonly value: unknown;
}

export interface Page<T> {
  readonly items: readonly T[];
  /** Absent on the last page. */
  readonly nextCursor?: string;
}

export interface PageOptions {
  /** Default {@link STORAGE_QUERY_DEFAULT_LIMIT}, max {@link STORAGE_QUERY_MAX_LIMIT}. */
  readonly limit?: number;
  readonly cursor?: string;
}

/** Range condition on an index's range attribute (mirrors `@forge/kvs` `WhereConditions`). */
export type RangeCondition =
  | { readonly op: "equalTo"; readonly value: string | number | boolean }
  | { readonly op: "beginsWith"; readonly value: string | number }
  | { readonly op: "between"; readonly from: string | number; readonly to: string | number }
  | { readonly op: "greaterThan" | "greaterThanEqualTo" | "lessThan" | "lessThanEqualTo"; readonly value: string | number };

export interface EntityQuery {
  /** Index name declared in the manifest, e.g. `by-bucket`. */
  readonly index: string;
  /** Values for the index's partition attributes, in declaration order. */
  readonly partition: readonly (string | number | boolean)[];
  readonly range?: RangeCondition;
  /** Sort on the range attribute; default `ASC`. */
  readonly sort?: "ASC" | "DESC";
  readonly limit?: number;
  readonly cursor?: string;
}

export interface EntityItem<T> {
  readonly key: string;
  readonly value: T;
}

export interface StoragePort {
  // KVS
  /** `undefined` when the key is absent or expired. */
  get(key: string): Promise<PortResult<unknown>>;
  set(key: string, value: unknown, opts?: SetOptions): Promise<PortResult<void>>;
  /** Writes only when the key is absent (KVS `FAIL_IF_EXISTS`). Returns whether it wrote. */
  setIfAbsent(key: string, value: unknown, opts?: SetOptions): Promise<PortResult<boolean>>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<PortResult<void>>;
  /** Keys starting with `prefix`, in ascending key order. */
  queryByPrefix(prefix: string, opts?: PageOptions): Promise<PortResult<Page<KeyValue>>>;

  // Custom entities (§7.3). Writes are upserts keyed by the entity key (§7.5 idempotence).
  putEntity<E extends EntityName>(entity: E, key: string, value: EntityRows[E]): Promise<PortResult<void>>;
  /** `undefined` when absent. Values are as stored; re-validate fields before trusting them. */
  getEntity<E extends EntityName>(entity: E, key: string): Promise<PortResult<EntityRows[E] | undefined>>;
  deleteEntity(entity: EntityName, key: string): Promise<PortResult<void>>;
  /** SPIKE-E2: composite partitions; fallback is a composite-string partition attribute. */
  queryEntities<E extends EntityName>(entity: E, query: EntityQuery): Promise<PortResult<Page<EntityItem<EntityRows[E]>>>>;
}

/** KVS key builders for §7.4 (the only place key formats are spelled out). */
export const KvsKeys = {
  config: (projectKey: string) => `config:${projectKey}`,
  configGlobal: () => "config:global",
  preset: (projectKey: string, id: string) => `preset:${projectKey}:${id}`,
  triaged: (projectKey: string) => `triaged:${projectKey}`,
  seedJob: (jobId: string) => `job:seed:${jobId}`,
  seedState: () => "seed:state",
  board: (projectKey: string) => `board:${projectKey}`,
  scenarios: (projectKey: string) => `scenarios:${projectKey}`,
  diagLast: () => "diag:last",
  diagTwg: () => "diag:twg",
  resync: (projectKey: string) => `resync:${projectKey}`,
} as const;

/** TTLs named in §7.4 / §11. */
export const KVS_TTL_SECONDS = { board: 60, scenarios: 600, diagTwg: 600 } as const;
