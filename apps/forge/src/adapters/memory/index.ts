/**
 * In-memory fakes of every port, for service tests (ARCHITECTURE §16.1 "services against
 * in-memory fakes"). `createMemoryPorts` wires a complete `Ports` for one invocation.
 */
import type { Ports } from "../../ports/index";
import { FakeClock, SequentialIds } from "./clock";
import { MemoryJiraSite, type MemoryJiraOptions } from "./jira";
import { MemoryQueue } from "./queue";
import { MemoryStorage } from "./storage";
import { MemoryTwgDirectory } from "./twg";

export * from "./clock";
export * from "./jira";
export * from "./jql";
export * from "./queue";
export * from "./storage";
export * from "./twg";

/** A whole fake environment: one Jira site, one app storage, queues, TWG, clock and ids. */
export interface MemoryWorld {
  readonly clock: FakeClock;
  readonly ids: SequentialIds;
  readonly site: MemoryJiraSite;
  readonly storage: MemoryStorage;
  readonly queue: MemoryQueue;
  readonly twg: MemoryTwgDirectory;
  /**
   * Ports for one invocation. With `accountId`: a resolver/action invocation (asUser and TWG
   * available). Without: a consumer invocation (asUser unavailable, no TWG; §8, SPIKE-A1).
   */
  ports(ctx?: { readonly accountId?: string }): Ports;
}

export function createMemoryWorld(opts: { readonly startIso?: string; readonly jira?: Omit<MemoryJiraOptions, "clock"> } = {}): MemoryWorld {
  const clock = new FakeClock(opts.startIso);
  const ids = new SequentialIds();
  const site = new MemoryJiraSite({ clock, ...(opts.jira ?? {}) });
  const storage = new MemoryStorage(clock);
  const queue = new MemoryQueue();
  const twg = new MemoryTwgDirectory();
  return {
    clock,
    ids,
    site,
    storage,
    queue,
    twg,
    ports: (ctx = {}) => ({
      jira: site.gateway(ctx),
      storage,
      queue,
      clock,
      ids,
      ...(ctx.accountId !== undefined ? { twg: twg.asUser(ctx.accountId) } : {}),
    }),
  };
}
