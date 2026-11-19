import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { commentLine, generateEventFiles, planFleet, Rng, synthesizeTelemetry, writeTelemetryCsv, type EventSpec, type QuirkId, type SeedConfig } from "../src/index.js";
import { analyzeCsvSignal } from "../../engine/src/signal/index.js";
import { suggestMapping } from "../../engine/src/mapping/index.js";
import { parseCsv } from "../../engine/src/csv/index.js";

const cfg = (seed: number): SeedConfig => ({ seed, anchorDate: "2026-11-16", profile: "demo-v1", frames: "fast" });
/** Latin-1 view of the bytes (CSV output is ASCII). */
function decode(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
}

/** CSV for an event with its quirks replaced (same seed, same latent signal). */
function csvWith(seed: number, e: EventSpec, quirks: QuirkId[]): Uint8Array {
  const plan = planFleet(cfg(seed));
  const vehicle = plan.vehicles.find((v) => v.vehicleId === e.vehicleId);
  if (vehicle === undefined) throw new Error("vehicle");
  const root = new Rng(seed);
  const { raw } = synthesizeTelemetry(root, e, vehicle);
  return writeTelemetryCsv({ seed, eventId: e.eventId, raw, quirks, rng: root.fork(`event:${e.key}:quirk`) });
}

function analyze(bytes: Uint8Array) {
  const table = parseCsv(bytes);
  if (!table.ok) throw new Error(JSON.stringify(table.error));
  const r = analyzeCsvSignal(bytes, suggestMapping(table.value.headers));
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

const EXPECTED_TYPE: Record<string, string> = {
  "LC-A": "lane-loss", "LC-B": "late-brake", "LC-C": "lateral-drift", "LC-D": "phantom-brake", "NOVEL-1": "lane-loss",
};

describe("CSV shape (§8.1)", () => {
  const plan = planFleet(cfg(1));
  const clean = plan.events.find((e) => e.quirks.length === 0 && e.vehicleId === "V-03");

  it("starts with the SYNTHETIC comment and the default columns, 30 s at the vehicle rate", () => {
    expect(clean).toBeDefined();
    if (clean === undefined) return;
    const { csv } = generateEventFiles(cfg(1), clean.eventId, plan);
    expect(csv.name).toBe(`SYNTHETIC_${clean.eventId}.csv`);
    const lines = decode(csv.bytes).trimEnd().split("\n");
    expect(lines[0]).toBe(commentLine(1, clean.eventId));
    expect(lines[0]).toMatch(/^# SYNTHETIC DATA - Takeover Triage seedgen 1\.0\.0 - seed 1 - E-\d{3} - not real vehicle data$/);
    expect(lines[1]).toBe("t,speed,yaw_rate,lane_offset,steer_torque,brake,ttc,lane_conf,takeover,accel_x,ad_mode");
    expect(lines.length - 2).toBe(30 * 200 + 1);
    expect(csv.bytes.length).toBeLessThan(1_000_000);
    const row = lines[2]?.split(",") ?? [];
    expect(row).toHaveLength(11);
    expect(row[10]).toBe("ON");
    expect(lines.at(-1)?.endsWith("OFF")).toBe(true);
  });

  it("applies each quirk's format change", () => {
    if (clean === undefined) return;
    const head = (q: QuirkId): string => decode(csvWith(1, clean, [q])).split("\n").slice(0, 3).join("\n");
    expect(head("Q1")).toMatch(/^# SYNTHETIC.*\nt;speed;.*\n\d+,\d{4};\d+,\d{2};/);
    expect(head("Q2")).toContain("t,speed_kph,yaw_rate");
    expect(head("Q3")).toMatch(/\ntime_ms,speed,.*\n\d+\.\d,/);
    expect(head("Q4")).toContain(",ad_active,");
    expect(head("Q5")).not.toMatch(/takeover|ad_active/);
    expect(head("Q6")).not.toContain("lane_conf");
    const q9 = csvWith(1, clean, ["Q9"]);
    expect([...q9.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(decode(q9.subarray(3)).startsWith("t,speed")).toBe(true);
    const rows = (q: QuirkId[]): number => decode(csvWith(1, clean, q)).split("\n").length;
    expect(rows([]) - rows(["Q7"])).toBeGreaterThanOrEqual(0.7 * 200 - 2);
    const q8 = decode(csvWith(1, clean, ["Q8"])).trimEnd().split("\n").slice(2).map((l) => Number(l.split(",")[0]));
    expect(q8.length).toBe(30 * 200 + 2);
    let outOfOrder = 0;
    let dupes = 0;
    for (let i = 1; i < q8.length; i++) {
      if ((q8[i] ?? 0) < (q8[i - 1] ?? 0)) outOfOrder++;
      if (q8[i] === q8[i - 1]) dupes++;
    }
    expect(outOfOrder).toBeGreaterThanOrEqual(1);
    expect(dupes).toBe(1);
  });

  it("is deterministic per seed (property)", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
      const p = planFleet(cfg(seed));
      const e = p.events[0];
      if (e === undefined) return;
      const v = p.vehicles.find((x) => x.vehicleId === e.vehicleId);
      if (v === undefined) return;
      const a = synthesizeTelemetry(new Rng(seed), e, v);
      const b = synthesizeTelemetry(new Rng(seed), e, v);
      expect(a.params).toEqual(b.params);
      expect([...a.raw.values.lane_offset]).toEqual([...b.raw.values.lane_offset]);
    }), { numRuns: 20 });
  });
});

describe("archetype conformance through the engine (G-T3 smoke, G-T7)", () => {
  it("non-boundary, non-Q6 events get their expected type; Q6 becomes lateral-drift", () => {
    for (const seed of [1, 2]) {
      const plan = planFleet(cfg(seed));
      for (const e of plan.events) {
        const csv = csvWith(seed, e, [...e.quirks]);
        const sig = analyze(csv).sig;
        if (e.roles.includes("AMB1") || e.roles.includes("AMB2")) continue;
        if (e.quirks.includes("Q6")) expect(sig.type, e.eventId).toBe("lateral-drift");
        else expect(sig.type, `${e.eventId} ${e.archetype} ${e.quirks.join()}`).toBe(EXPECTED_TYPE[e.archetype]);
      }
    }
  });

  it("Q1, Q2, Q3 and Q8 give features equal to the clean file within quantisation", () => {
    const plan = planFleet(cfg(3));
    const e = plan.events.find((x) => !x.planted && x.archetype === "LC-A");
    expect(e).toBeDefined();
    if (e === undefined) return;
    const base = analyze(csvWith(3, e, [])).sig.features as Record<string, number>;
    for (const q of ["Q1", "Q2", "Q3", "Q8"] as const) {
      const f = analyze(csvWith(3, e, [q])).sig.features as Record<string, number>;
      for (const k of Object.keys(base)) expect(Math.abs((f[k] ?? NaN) - (base[k] ?? NaN)), `${q} ${k}`).toBeLessThanOrEqual(0.02);
    }
  });

  it("planted pairs differ on the deciding features", () => {
    const plan = planFleet(cfg(1));
    const f = (role: string) => {
      const e = plan.events.find((x) => x.roles.some((r) => r === role));
      if (e === undefined) throw new Error(role);
      return analyze(csvWith(1, e, [])).sig.features as Record<string, number>;
    };
    const [p1a, p1b, p3a, p3b] = [f("P1a"), f("P1b"), f("P3a"), f("P3b")];
    expect((p1b["F6"] ?? 0) - (p1a["F6"] ?? 0)).toBeGreaterThan(0.4);
    expect((p1b["F2"] ?? 0) - (p1a["F2"] ?? 0)).toBeGreaterThan(1);
    expect((p3b["F3"] ?? 0) - (p3a["F3"] ?? 0)).toBeGreaterThan(5);
  });
});
