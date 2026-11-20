/** Shared test fixtures for the Forge app tests. */
import { base64Length, type TtEvent } from "@tt/engine";
import { createMemoryWorld, type MemoryWorld } from "../src/adapters/memory/index.js";

export const ADMIN = "acc-admin";
export const ENGINEER = "acc-engineer";
export const OUTSIDER = "acc-outsider";

const HEX64 = "9f2c".repeat(16);

/** A schema-valid `tt.event` (ARCHITECTURE §6.1 example). */
export function validEvent(over: { readonly type?: "lane-loss" | "late-brake"; readonly variant?: string; readonly build?: string; readonly occurredAt?: string } = {}): TtEvent {
  const lateBrake = over.type === "late-brake";
  return {
    v: 1,
    engine: "1.0.0",
    app: "1.0.0",
    synthetic: true,
    ctx: {
      occurredAt: over.occurredAt ?? "2026-11-14T09:12:33Z",
      vehicleId: "V-03",
      variant: over.variant ?? "cam-B",
      build: over.build ?? "4.12.0",
      driveSessionId: "DS-0142",
      odd: ["highway"],
    },
    mapping: { presetId: "default", hash: `sha256:${HEX64}` },
    source: { csv: { sha256: HEX64, rows: 4000, rawHz: 200 }, frames: [{ sha256: HEX64, w: 1920, h: 1080 }] },
    takeover: { source: "flag", confidence: "high" },
    sig: {
      type: lateBrake ? "late-brake" : "lane-loss",
      ruleId: lateBrake ? "R-LB-1" : "R-LL-1",
      margins: lateBrake ? { F3: -1.2, F4: -0.8 } : { F6: -2.1, F1: 1.4 },
      features: { F1: 0.71, F2: 2.4, F3: lateBrake ? 1.1 : 10, F4: lateBrake ? 0.9 : 10, F5: 0.4, F6: 0.19, F7: 4.1, F8: 30.2, F9: 0.011, F10: 0 },
      flags: {},
    },
    tel: {
      hz: 10,
      tStart: -15,
      n: 201,
      ch: [
        { k: "lane_offset", s: 0.001, o: 0 },
        { k: "ttc", s: 0.01, o: 0 },
      ],
      data: "A".repeat(base64Length(201 * 2 * 2)),
    },
  };
}

/** A world with an admin, an engineer, an outsider (no access to TTDEMO) and project TTDEMO. */
export function demoWorld(opts: Parameters<typeof createMemoryWorld>[0] = {}): MemoryWorld {
  const w = createMemoryWorld(opts);
  w.site.addUser({ accountId: ADMIN, displayName: "Site Admin", globalAdmin: true });
  w.site.addUser({ accountId: ENGINEER, displayName: "Triage Engineer" });
  w.site.addUser({ accountId: OUTSIDER, displayName: "Other Team" });
  w.site.addProject({ key: "TTDEMO", name: "Takeover Triage Demo [SYNTHETIC]", leadAccountId: ADMIN, issueTypes: ["Task", "Bug", "Test"] });
  w.site.denyBrowse(OUTSIDER, "TTDEMO");
  return w;
}

/** Unwraps an ok result or fails the test with the error. */
export function must<T>(r: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
}
