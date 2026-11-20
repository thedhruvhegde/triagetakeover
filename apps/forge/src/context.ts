/**
 * Per-invocation service context and its factory.
 *
 * Resolvers, action handlers and consumers build one {@link ServiceContext} per invocation
 * from a {@link ServiceContextFactory}. Tests pass a factory over the in-memory fakes;
 * production uses {@link createForgeContext}, which wires the real Forge adapters
 * (`adapters/forge`, written separately).
 */
import { createForgePorts } from "./adapters/forge/index";
import type { Ports } from "./ports/index";

/** What the platform tells us about the caller. Identity is never read from payloads (§14). */
export interface Invocation {
  /** Absent in queue consumers (asUser unavailable, SPIKE-A1). */
  readonly accountId?: string;
  readonly cloudId?: string;
  /** Issue / project the UI module is rendered on (`context.extension`), when known. */
  readonly focusIssueKey?: string;
  readonly focusProjectKey?: string;
}

export interface ServiceContext {
  readonly ports: Ports;
  readonly accountId?: string;
  readonly invocation: Invocation;
  /** Per-invocation memo (permission checks, link types, TWG circuit breaker). */
  readonly memo: Map<string, unknown>;
}

export type ServiceContextFactory = (invocation: Invocation) => ServiceContext;

export function createServiceContext(ports: Ports, invocation: Invocation): ServiceContext {
  return {
    ports,
    invocation,
    memo: new Map(),
    ...(invocation.accountId !== undefined ? { accountId: invocation.accountId } : {}),
  };
}

/** Memoises an async computation for the lifetime of one invocation. */
export async function memoize<T>(ctx: ServiceContext, key: string, f: () => Promise<T>): Promise<T> {
  if (ctx.memo.has(key)) return ctx.memo.get(key) as T;
  const v = await f();
  ctx.memo.set(key, v);
  return v;
}

/** The production factory: real Forge adapters (asUser/asApp requestJira, KVS, queues, TWG). */
export function createForgeContext(): ServiceContextFactory {
  return (invocation) => createServiceContext(createForgePorts(invocation), invocation);
}
