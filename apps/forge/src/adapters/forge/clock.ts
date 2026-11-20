/**
 * Wall clock and random ids for production. Tests use the deterministic memory clock/ids.
 */
import { randomUUID } from "node:crypto";
import type { Clock, IdSource } from "../../ports/clock";

export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
  nowMs: () => Date.now(),
};

/** `<prefix>-<uuid>`; the prefix is reduced to `[A-Za-z0-9_-]` (IdSource contract). */
export function randomIds(uuid: () => string = randomUUID): IdSource {
  return {
    next: (prefix) => {
      const p = prefix.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
      return `${p === "" ? "id" : p}-${uuid()}`;
    },
  };
}
