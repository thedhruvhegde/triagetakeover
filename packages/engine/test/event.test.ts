import { describe, expect, it } from "vitest";
import fc from "fast-check";
import jpeg from "jpeg-js";
import { MAX_EVENT_FRAMES, SUGGESTED_PRESET_ID, processEventFiles, type EventFilesInput } from "../src/event/index.js";
import { encodeUtf8 } from "../src/csv/index.js";
import { sha256Hex, suggestMapping } from "../src/mapping/index.js";
import { parseTtEvent, type EventContext } from "../src/schema/index.js";

const ctx: EventContext = { occurredAt: "2026-11-14T09:12:33Z", vehicleId: "V-02", variant: "cam-B", build: "4.12.0", driveSessionId: "DS-0031", odd: ["highway"] };

/** 30 s at 50 Hz around a takeover at t = 120 s: lane confidence collapses, the car drifts out. */
function laneLossCsv(): string {
  const rows = ["# SYNTHETIC test file", "t,speed,yaw_rate,lane_offset,steer_torque,brake,ttc,lane_conf,takeover"];
  for (let i = 0; i <= 1500; i++) {
    const t = 98 + i / 50;
    const rel = t - 120;
    const drift = rel > -2 && rel <= 0 ? 0.05 + 0.4 * (rel + 2) : rel > 0 ? 0.85 : 0.05;
    const conf = rel > -3 ? 0.15 : 0.9;
    const torque = Math.abs(rel) < 0.2 ? 4.5 : 0.2;
    rows.push([t.toFixed(2), "30.00", "0.0050", drift.toFixed(3), torque.toFixed(2), "0", "10", conf.toFixed(2), rel >= 0 ? "1" : "0"].join(","));
  }
  return `${rows.join("\n")}\n`;
}

/** Plain mid-grey road frame with mild texture, encoded at q85. */
function frame(w = 320, h = 180, seed = 1): Uint8Array {
  const data = Buffer.alloc(w * h * 4);
  let s = seed;
  for (let i = 0; i < w * h; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const y = i < (w * h * 2) / 5 ? 180 : 90 + ((s >>> 24) % 40);
    data[4 * i] = y;
    data[4 * i + 1] = y;
    data[4 * i + 2] = y;
    data[4 * i + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, 85).data);
}

const input = (frames: Uint8Array[] = [frame()]): EventFilesInput => ({ csv: encodeUtf8(laneLossCsv()), frames });

describe("processEventFiles", () => {
  it("turns CSV + JPEG into a valid tt.event", () => {
    const r = processEventFiles(input(), { ctx, synthetic: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { event } = r.value;
    expect(parseTtEvent(JSON.parse(JSON.stringify(event))).ok).toBe(true);
    expect(event.sig.type).toBe("lane-loss");
    expect(event.takeover).toEqual({ source: "flag", confidence: "high" });
    expect(event.mapping.presetId).toBe(SUGGESTED_PRESET_ID);
    expect(event.source.csv.rows).toBe(1501);
    expect(event.source.csv.rawHz).toBeCloseTo(50, 6);
    expect(event.source.csv.sha256).toBe(sha256Hex(input().csv as Uint8Array));
    expect(event.source.frames).toEqual([{ sha256: sha256Hex(input().frames[0] as Uint8Array), w: 320, h: 180 }]);
    expect(event.img?.chips).toEqual(["normal"]);
    expect(event.synthetic).toBe(true);
    expect(event.ctx).toEqual(ctx);
    expect(r.value.tTo).toBeCloseTo(120, 6);
    expect(r.value.insufficientChannels).toBe(false);
  });

  it("is deterministic and accepts text CSV as its UTF-8 bytes", () => {
    const a = processEventFiles(input(), { ctx });
    const b = processEventFiles({ csv: laneLossCsv(), frames: [frame()] }, { ctx });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("uses an explicit preset under its id", () => {
    const preset = suggestMapping(["t", "speed", "yaw_rate", "lane_offset", "steer_torque", "brake", "ttc", "lane_conf", "takeover"]);
    const r = processEventFiles(input(), { ctx, preset, presetId: "fleet-v2" });
    expect(r.ok && r.value.event.mapping.presetId).toBe("fleet-v2");
  });

  it("skips undecodable frames, and omits img when none decodes", () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5]);
    const r = processEventFiles(input([junk, frame()]), { ctx });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.frames.map((f) => f.ok)).toEqual([false, true]);
    expect(r.value.event.source.frames).toHaveLength(1);
    const none = processEventFiles(input([junk]), { ctx });
    expect(none.ok && none.value.event.img).toBeUndefined();
    expect(none.ok && none.value.event.source.frames).toEqual([]);
  });

  it("rejects more than the schema's frame limit", () => {
    const r = processEventFiles(input(Array.from({ length: MAX_EVENT_FRAMES + 1 }, () => frame(16, 16))), { ctx });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error[0]?.code).toBe("E_TOO_MANY_FRAMES");
  });

  it("passes CSV and takeover errors through", () => {
    const empty = processEventFiles({ csv: "", frames: [] }, { ctx });
    expect(empty.ok).toBe(false);
    const headerOnly = processEventFiles({ csv: "t,speed,takeover\n", frames: [] }, { ctx, manualTakeoverTime: 0 });
    expect(headerOnly.ok).toBe(false);
    if (!headerOnly.ok) expect(headerOnly.error[0]?.code).toBe("E_CSV_EMPTY");
    const noFlag = processEventFiles({ csv: "t,speed\n0,1\n1,1\n2,1\n", frames: [] }, { ctx });
    expect(noFlag.ok).toBe(false);
    if (!noFlag.ok) expect(noFlag.error[0]?.code).toBe("E_NO_TAKEOVER");
  });

  it("never throws on arbitrary bytes (property)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 400 }), fc.uint8Array({ maxLength: 64 }), (csv, img) => {
        const r = processEventFiles({ csv, frames: [img] }, { ctx });
        expect(typeof r.ok).toBe("boolean");
      }),
      { numRuns: 200 },
    );
  });
});
