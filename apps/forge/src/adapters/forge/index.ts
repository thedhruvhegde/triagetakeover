/**
 * Real Forge adapters: wires every port to the platform for one invocation.
 *
 * Principal per call site (ARCHITECTURE §14, SPIKE-A1):
 * - `jira.asUser()` → `api.asUser().requestJira` when the invocation has a user
 *   (`accountId` from the resolver/action context). Without one (queue consumers) the user
 *   port answers `unauthorized` and never calls the platform.
 * - `jira.asApp()` → `api.asApp().requestJira` (consumers, seed, documented fallbacks).
 * - `twg` → `api.asUser().requestTeamworkGraph`, ONLY when there is a user; consumers get
 *   `twg: undefined` (TWG cannot be called as the app, §11).
 * - storage → `@forge/kvs`; queue → `@forge/events` `Queue`.
 *
 * `api.asUser()` is never given an accountId: the platform acts as the invoking user, and an
 * id from anywhere else would be an impersonation risk (§14 identity rule).
 * The production service factory is `createForgeContext()` in context.ts, which calls
 * {@link createForgePorts} per invocation.
 */
import api from "@forge/api";
import type { JiraGateway } from "../../ports/jira";
import type { Ports } from "../../ports/index";
import { randomIds, systemClock } from "./clock";
import { createHttpClient, DEFAULT_RETRY_POLICY, type Requester, type RetryPolicy } from "./http";
import { ForgeJiraPort } from "./jira";
import { ForgeQueue, defaultQueueFactory, type QueueFactory } from "./queue";
import { ForgeStorage, type KvsClient } from "./storage";
import { ForgeTwg, type TwgRequester } from "./twg";

export { ForgeJiraPort } from "./jira";
export { ForgeStorage } from "./storage";
export { ForgeQueue } from "./queue";
export { ForgeTwg, TWG_QUERIES } from "./twg";
export { createHttpClient, DEFAULT_RETRY_POLICY } from "./http";
export { systemClock, randomIds } from "./clock";

/** Caller facts the adapters need (structurally the same as `Invocation` in context.ts). */
export interface ForgeInvocation {
  readonly accountId?: string;
  readonly cloudId?: string;
}

/** Overridable platform bindings (tests; defaults are the real Forge APIs). */
export interface ForgeBindings {
  readonly userJira: Requester;
  readonly appJira: Requester;
  readonly userTwg: TwgRequester;
  readonly kvs?: KvsClient;
  readonly queues?: QueueFactory;
  readonly retry?: RetryPolicy;
}

/** Real bindings. Each call resolves `api.asUser()` / `api.asApp()` lazily, at request time. */
export function forgeBindings(): ForgeBindings {
  return {
    userJira: (path, init) => api.asUser().requestJira(path, init),
    appJira: (path, init) => api.asApp().requestJira(path, init),
    userTwg: (query, variables, operationName) => api.asUser().requestTeamworkGraph(query, variables, operationName),
  };
}

export function createForgePorts(invocation: ForgeInvocation, bindings: ForgeBindings = forgeBindings()): Ports {
  const retry = bindings.retry ?? DEFAULT_RETRY_POLICY;
  const hasUser = invocation.accountId !== undefined && invocation.accountId !== "";
  const userHttp = hasUser ? createHttpClient(bindings.userJira, retry) : null;
  const appHttp = createHttpClient(bindings.appJira, retry);
  const jira: JiraGateway = {
    asUser: () => new ForgeJiraPort(userHttp),
    asApp: () => new ForgeJiraPort(appHttp),
  };
  return {
    jira,
    storage: bindings.kvs !== undefined ? new ForgeStorage(bindings.kvs, retry) : new ForgeStorage(undefined, retry),
    queue: new ForgeQueue(bindings.queues ?? defaultQueueFactory),
    clock: systemClock,
    ids: randomIds(),
    ...(hasUser ? { twg: new ForgeTwg(bindings.userTwg) } : {}),
  };
}
