/**
 * Port call counting for the seed (SPIKE-S2 evidence). The seed consumer wraps its ports so
 * every Jira REST call, storage operation and queue push is counted per step and kept in the
 * job record; on a real site those numbers are the measured call budget to compare with the
 * estimates in SEED_DATA §15.1 and the Forge/Jira rate limits.
 */
import type { Ports } from "../../ports/index";
import type { JiraGateway } from "../../ports/jira";

export class CallCounter {
  private readonly counts = new Map<string, number>();

  bump(op: string): void {
    this.counts.set(op, (this.counts.get(op) ?? 0) + 1);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries([...this.counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }

  total(prefix = ""): number {
    let n = 0;
    for (const [k, v] of this.counts) if (k.startsWith(prefix)) n += v;
    return n;
  }
}

/** Wraps every method of `target` so each call bumps `<prefix>.<method>`. */
export function counted<T extends object>(target: T, prefix: string, counter: CallCounter): T {
  return new Proxy(target, {
    get(t, p, receiver) {
      const v: unknown = Reflect.get(t, p, receiver);
      if (typeof v !== "function" || typeof p !== "string") return v;
      const fn = v as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        counter.bump(`${prefix}.${p}`);
        return fn.apply(t, args);
      };
    },
  });
}

export function countingPorts(ports: Ports, counter: CallCounter): Ports {
  const gateway: JiraGateway = {
    asApp: () => counted(ports.jira.asApp(), "jira", counter),
    asUser: () => counted(ports.jira.asUser(), "jira", counter),
  };
  return { ...ports, jira: gateway, storage: counted(ports.storage, "storage", counter), queue: counted(ports.queue, "queue", counter) };
}
