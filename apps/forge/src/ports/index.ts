/**
 * Ports: the interfaces services depend on (ARCHITECTURE §4). Real Forge adapters and the
 * in-memory fakes (adapters/memory) both implement these, so services are tested against fakes.
 */
export * from "./result";
export * from "./clock";
export * from "./jira";
export * from "./entities";
export * from "./storage";
export * from "./twg";
export * from "./queue";
export * from "./properties";

import type { Clock, IdSource } from "./clock";
import type { JiraGateway } from "./jira";
import type { QueuePort } from "./queue";
import type { StoragePort } from "./storage";
import type { TwgPort } from "./twg";

/**
 * Everything a service may need, injected per invocation. `twg` is absent where TWG must not
 * be called (consumers, seed; §8) — services then report `twgStatus: skipped`.
 */
export interface Ports {
  readonly jira: JiraGateway;
  readonly storage: StoragePort;
  readonly queue: QueuePort;
  readonly clock: Clock;
  readonly ids: IdSource;
  readonly twg?: TwgPort;
}
