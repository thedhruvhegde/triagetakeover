import { describe, expect, it } from "vitest";
import fc from "fast-check";
import jpeg from "jpeg-js";
import { buildTruth, generateEventFiles, generateFleet, planFleet, readComSegments, sha256Hex, utf8Encode, type EventFiles, type SeedConfig } from "../src/index.js";

const cfg = (seed: number, frames: SeedConfig["frames"] = "fast"): SeedConfig => ({ seed, anchorDate: "2026-11-16", profile: "demo-v1", frames });

/** SHA-256 manifest over every generated file plus the plan and truth JSON (G-T1). */
function manifest(plan: unknown, files: Readonly<Record<string, EventFiles>>, truth: unknown): Record<string, string> {
  const out: Record<string, string> = {
    "plan.json": sha256Hex(utf8Encode(JSON.stringify(plan))),
    "truth.json": sha256Hex(utf8Encode(JSON.stringify(truth))),
  };
  for (const f of Object.values(files)) {
    out[f.csv.name] = sha256Hex(f.csv.bytes);
    for (const fr of f.frames) out[fr.name] = sha256Hex(fr.bytes);
  }
  return out;
}

describe("determinism (G-T1)", () => {
  it("generates identical bytes twice for the same seed, and every frame decodes", () => {
    const a = generateFleet(cfg(11));
    const b = generateFleet(cfg(11));
    const ma = manifest(a.plan, a.files, a.truth);
    expect(manifest(b.plan, b.files, b.truth)).toEqual(ma);
    expect(Object.keys(a.files)).toHaveLength(a.plan.events.length);
    for (const e of a.plan.events) {
      const f = a.files[e.eventId];
      expect(f).toBeDefined();
      if (f === undefined) continue;
      expect(f.csv.name.startsWith("SYNTHETIC_")).toBe(true);
      expect(f.frames.length).toBe(e.monday ? Math.min(2, e.frameCount) : e.frameCount);
      for (const [k, fr] of f.frames.entries()) {
        expect(fr.name).toBe(`SYNTHETIC_${e.eventId}_f${k + 1}.jpg`);
        expect(fr.bytes.length).toBeLessThan(400_000);
        expect(readComSegments(fr.bytes)[0]).toContain(`event=${e.eventId}`);
        const dec = jpeg.decode(fr.bytes, { useTArray: true });
        expect([dec.width, dec.height]).toEqual([960, 540]);
      }
    }
  }, 120_000);

  it("a different seed gives different bytes", () => {
    const e1 = generateEventFiles(cfg(1), "E-001");
    const e2 = generateEventFiles(cfg(2), "E-001");
    expect(sha256Hex(e1.csv.bytes)).not.toBe(sha256Hex(e2.csv.bytes));
  });

  it("generating one event alone equals generating it inside the plan (order independence)", () => {
    const plan = planFleet(cfg(5));
    const last = plan.events.at(-1);
    expect(last).toBeDefined();
    if (last === undefined) return;
    const alone = generateEventFiles(cfg(5), last.eventId);
    const inPlan = generateEventFiles(cfg(5), last.eventId, plan);
    expect(sha256Hex(alone.csv.bytes)).toBe(sha256Hex(inPlan.csv.bytes));
    expect(alone.frames.map((f) => sha256Hex(f.bytes))).toEqual(inPlan.frames.map((f) => sha256Hex(f.bytes)));
    expect(() => generateEventFiles(cfg(5), "E-999")).toThrow(RangeError);
  });

  it("plan, truth and CSV bytes are a pure function of the seed (property)", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
      const h = (): string => {
        const plan = planFleet(cfg(seed));
        const e = plan.events[0];
        const csv = e === undefined ? new Uint8Array(0) : generateEventFiles(cfg(seed), e.eventId, plan).csv.bytes;
        return sha256Hex(utf8Encode(JSON.stringify(plan) + JSON.stringify(buildTruth(cfg(seed))))) + sha256Hex(csv);
      };
      expect(h()).toBe(h());
    }), { numRuns: 8 });
  }, 60_000);

  it("full frames are 1280x720 and keep all frames of Monday events", () => {
    const plan = planFleet(cfg(3, "full"));
    const e = plan.events.find((x) => x.monday && x.frameCount >= 1);
    expect(e).toBeDefined();
    if (e === undefined) return;
    const files = generateEventFiles(cfg(3, "full"), e.eventId, plan);
    expect(files.frames).toHaveLength(e.frameCount);
    const first = files.frames[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const dec = jpeg.decode(first.bytes, { useTArray: true });
    expect([dec.width, dec.height]).toEqual([1280, 720]);
  }, 60_000);
});
