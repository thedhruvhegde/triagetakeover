import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  FEATURE_IDS,
  FEATURE_SPECS,
  PROPERTY_LIMIT_BYTES,
  RULE_IDS,
  RULE_TYPE,
  TT_EVENT_TARGET_BYTES,
  base64Length,
  checkPropertySize,
  parseMappingPreset,
  parseTtCluster,
  parseTtEvent,
  parseTtScenario,
  parseTtThumbs,
  parseTtTriage,
  serializedSize,
  type EngineError,
  type Result,
  type TtEvent,
} from "../src/schema/index.js";


const HEX64 = "9f2c".repeat(16);

/** A valid `tt.event` modelled on ARCHITECTURE §6.1. */
export function validEvent(): TtEvent {
  return {
    v: 1,
    engine: "1.0.0",
    app: "1.0.0",
    synthetic: true,
    ctx: {
      occurredAt: "2026-11-14T09:12:33Z",
      vehicleId: "V-03",
      variant: "cam-B",
      build: "4.12.0",
      driveSessionId: "DS-0142",
      odd: ["highway"],
    },
    mapping: { presetId: "default", hash: `sha256:${HEX64}` },
    source: {
      csv: { attachmentId: "10023", sha256: HEX64, rows: 4000, rawHz: 200 },
      frames: [{ attachmentId: "10024", sha256: HEX64, w: 1920, h: 1080 }],
    },
    takeover: { source: "flag", confidence: "high" },
    sig: {
      type: "lane-loss",
      ruleId: "R-LL-1",
      margins: { F6: -2.1, F1: 1.4 },
      features: { F1: 0.71, F2: 2.4, F3: 10, F4: 10, F5: 0.4, F6: 0.19, F7: 4.1, F8: 30.2, F9: 0.011, F10: 0 },
      flags: { F3: "clamped" },
    },
    img: {
      attested: "client",
      median: { meanY: 141, p5: 22, p95: 255, glare: 0.071, sunBlob: 0.009, lapVar: 212.4, contrast: 61.3, darkFrac: 0.04 },
      hist32: Array.from({ length: 32 }, (_, i) => i * 10),
      chips: ["low-sun-glare"],
      chipRules: [{ chip: "low-sun-glare", metric: "sunBlob", op: ">=", value: 0.009, threshold: 0.004 }],
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

/** Deep clone through JSON, giving a mutable `any`-free unknown structure. */
export function clone(x: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(x)) as Record<string, unknown>;
}

/** Sets a nested value by dotted path (test helper; creates nothing). */
export function setPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (const p of parts.slice(0, -1)) cur = cur[p] as Record<string, unknown>;
  const last = parts[parts.length - 1] as string;
  if (value === undefined) Reflect.deleteProperty(cur, last);
  else cur[last] = value;
  return obj;
}

function errorsOf<T>(r: Result<T>): readonly EngineError[] {
  return r.ok ? [] : r.error;
}
function paths<T>(r: Result<T>): string[] {
  return errorsOf(r).map((e) => e.path ?? "");
}

describe("parseTtEvent: valid input", () => {
  it("accepts the §6.1 example and returns an equal value", () => {
    const ev = validEvent();
    const r = parseTtEvent(clone(ev));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(ev);
  });

  it("strips unknown keys", () => {
    const raw = clone(validEvent());
    raw["extra"] = "x";
    setPath(raw, "ctx.junk", 1);
    const r = parseTtEvent(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect("extra" in r.value).toBe(false);
      expect("junk" in r.value.ctx).toBe(false);
    }
  });

  it("allows img and optional ids to be absent", () => {
    const raw = clone(validEvent());
    setPath(raw, "img", undefined);
    setPath(raw, "ctx.driveSessionId", undefined);
    setPath(raw, "source.csv.attachmentId", undefined);
    expect(parseTtEvent(raw).ok).toBe(true);
  });

  it("accepts partial feature vectors (n/a features)", () => {
    const raw = clone(validEvent());
    setPath(raw, "sig.features", { F1: 0.7 });
    setPath(raw, "sig.flags", { F6: "channel-unmapped" });
    expect(parseTtEvent(raw).ok).toBe(true);
  });
});

describe("parseTtEvent: errors carry paths", () => {
  const cases: [string, unknown, string][] = [
    ["ctx.occurredAt", "yesterday", "ctx.occurredAt"],
    ["ctx.odd", ["highway", "highway"], "ctx.odd"],
    ["mapping.hash", "sha256:abc", "mapping.hash"],
    ["source.csv.rows", 1.5, "source.csv.rows"],
    ["sig.type", "drift", "sig.type"],
    ["sig.ruleId", "R-LB-1", "sig"],
    ["sig.features.F1", 99, "sig.features.F1"],
    ["sig.features.F3", Number.NaN, "sig.features.F3"],
    ["sig.flags.F2", "weird", "sig.flags.F2"],
    ["img.median.glare", 1.5, "img.median.glare"],
    ["img.chips", ["normal", "night"], "img.chips"],
    ["img.chips", [], "img.chips"],
    ["img.hist32", [1, 2, 3], "img.hist32"],
    ["tel.n", 200, "tel.n"],
    ["tel.data", "AAAA", "tel"],
    ["tel.data", "not base64!", "tel.data"],
    ["engine", "1.0", "engine"],
    ["synthetic", "yes", "synthetic"],
    ["takeover", undefined, "takeover"],
  ];
  it.each(cases)("%s = %j fails at %s", (path, value, expected) => {
    const raw = setPath(clone(validEvent()), path, value);
    const r = parseTtEvent(raw);
    expect(r.ok).toBe(false);
    expect(paths(r)).toContain(expected);
  });

  it("rejects unknown feature ids", () => {
    const raw = setPath(clone(validEvent()), "sig.features.F11", 1);
    expect(paths(parseTtEvent(raw))).toContain("sig.features.F11");
  });

  it("rejects p5 > p95", () => {
    const raw = setPath(clone(validEvent()), "img.median.p5", 255);
    setPath(raw, "img.median.p95", 10);
    expect(paths(parseTtEvent(raw))).toContain("img.median");
  });

  it("reports array item paths", () => {
    const raw = setPath(clone(validEvent()), "tel.ch", [{ k: "lane_offset", s: 0.001, o: 0 }, { k: "bogus", s: 1, o: 0 }]);
    expect(paths(parseTtEvent(raw))).toContain("tel.ch[1].k");
  });

  it("collects several errors at once", () => {
    const raw = setPath(clone(validEvent()), "app", 3);
    setPath(raw, "ctx.vehicleId", "");
    expect(errorsOf(parseTtEvent(raw)).length).toBeGreaterThanOrEqual(2);
  });

  it("all error codes use E_ prefix", () => {
    const raw = setPath(clone(validEvent()), "sig.features.F1", -1);
    for (const e of errorsOf(parseTtEvent(raw))) expect(e.code.startsWith("E_")).toBe(true);
  });
});

describe("parseTtEvent: versioning", () => {
  it("newer versions give E_SCHEMA_VERSION", () => {
    const r = parseTtEvent(setPath(clone(validEvent()), "v", 2));
    expect(errorsOf(r)).toEqual([expect.objectContaining({ code: "E_SCHEMA_VERSION", path: "v" })]);
  });
  it("missing or bogus versions give E_SCHEMA_VERSION", () => {
    expect(errorsOf(parseTtEvent(setPath(clone(validEvent()), "v", undefined)))[0]?.code).toBe("E_SCHEMA_VERSION");
    expect(errorsOf(parseTtEvent(setPath(clone(validEvent()), "v", "1")))[0]?.code).toBe("E_SCHEMA_VERSION");
  });
  it("non-objects give E_SCHEMA_INVALID at the root", () => {
    for (const u of [null, 1, "x", [], undefined]) {
      expect(errorsOf(parseTtEvent(u))[0]).toMatchObject({ code: "E_SCHEMA_INVALID", path: "" });
    }
  });
});

describe("parseTtEvent: properties", () => {
  const featureVector = fc.record(
    Object.fromEntries(
      FEATURE_IDS.map((id) => [id, fc.double({ min: FEATURE_SPECS[id].range[0], max: FEATURE_SPECS[id].range[1], noNaN: true })]),
    ),
    { requiredKeys: [] },
  );

  it("any in-range feature vector with a consistent rule is accepted unchanged", () => {
    fc.assert(
      fc.property(featureVector, fc.constantFrom(...RULE_IDS), (features, ruleId) => {
        const raw = clone(validEvent());
        setPath(raw, "sig.features", features);
        setPath(raw, "sig.ruleId", ruleId);
        setPath(raw, "sig.type", RULE_TYPE[ruleId]);
        const r = parseTtEvent(raw);
        return r.ok && JSON.stringify(r.value.sig.features) === JSON.stringify(features);
      }),
    );
  });

  it("out-of-range features are always rejected at their path", () => {
    fc.assert(
      fc.property(fc.constantFrom(...FEATURE_IDS), fc.double({ min: 1e-6, max: 1e6, noNaN: true }), fc.boolean(), (id, delta, below) => {
        const [lo, hi] = FEATURE_SPECS[id].range;
        const raw = setPath(clone(validEvent()), `sig.features.${id}`, below ? lo - delta : hi + delta);
        return paths(parseTtEvent(raw)).includes(`sig.features.${id}`);
      }),
    );
  });

  it("never throws on arbitrary JSON", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (u) => {
        const r = parseTtEvent(u);
        return r.ok === false && r.error.length > 0;
      }),
    );
  });

  it("parse is idempotent: parse(parse(x)) == parse(x)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 3 }), (extra) => {
        const raw = { ...clone(validEvent()), ...Object.fromEntries(Object.entries(extra).filter(([k]) => k.startsWith("x"))) };
        const a = parseTtEvent(raw);
        if (!a.ok) return false;
        const b = parseTtEvent(clone(a.value));
        return b.ok && JSON.stringify(b.value) === JSON.stringify(a.value);
      }),
    );
  });
});

describe("property size", () => {
  it("the §6.1 example is under the 12 KB target and the 32 KB limit", () => {
    const ev: TtEvent = { ...validEvent(), tel: { ...validEvent().tel, data: "A".repeat(base64Length(201 * 8 * 2)) } };
    const r = checkPropertySize(ev, TT_EVENT_TARGET_BYTES);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.bytes).toBeGreaterThan(4288);
      expect(r.value.headroom).toBe(TT_EVENT_TARGET_BYTES - r.value.bytes);
    }
  });

  it("over the limit gives E_PROPERTY_TOO_LARGE", () => {
    const r = checkPropertySize({ s: "x".repeat(PROPERTY_LIMIT_BYTES) });
    expect(errorsOf(r)[0]?.code).toBe("E_PROPERTY_TOO_LARGE");
    expect(checkPropertySize({ s: "x".repeat(PROPERTY_LIMIT_BYTES - 8) }).ok).toBe(true); // exactly 32768
  });

  it("unserializable values give E_SERIALIZE", () => {
    const cyc: Record<string, unknown> = {};
    cyc["self"] = cyc;
    expect(errorsOf(serializedSize(cyc))[0]?.code).toBe("E_SERIALIZE");
    expect(errorsOf(serializedSize(undefined))[0]?.code).toBe("E_SERIALIZE");
    expect(errorsOf(serializedSize(10n))[0]?.code).toBe("E_SERIALIZE");
  });
});

describe("companion properties", () => {
  it("tt.thumbs", () => {
    expect(parseTtThumbs({ v: 1, frames: [{ w: 160, h: 90, jpegB64: "/9j/AAAA" }] }).ok).toBe(true);
    expect(parseTtThumbs({ v: 1, frames: Array(5).fill({ w: 160, h: 90, jpegB64: "AAAA" }) }).ok).toBe(false);
  });
  it("tt.triage", () => {
    const t = { v: 1, state: "accepted", clusterKey: "ADAS-305", by: "acc-1", at: "2026-11-16T08:00:00Z", history: [] };
    expect(parseTtTriage(t).ok).toBe(true);
    expect(paths(parseTtTriage({ ...t, state: "maybe" }))).toContain("state");
    const h = { action: "accept", by: "acc-1", at: "2026-11-16T08:00:00Z" };
    expect(parseTtTriage({ ...t, history: Array(11).fill(h) }).ok).toBe(false);
  });
  it("tt.cluster", () => {
    const c = { v: 1, bucket: "lane-loss|cam-B", nameDet: "Lane-loss · low sun · cam-B", createdBy: "acc-1", createdAt: "2026-11-16T08:00:00Z", params: "params-v1" };
    expect(parseTtCluster(c).ok).toBe(true);
    expect(paths(parseTtCluster({ ...c, bucket: "lane-loss" }))).toContain("bucket");
  });
  it("tt.scenario", () => {
    const s = { v: 1, type: "lane-loss", variant: "any", cond: ["low-sun-glare"], odd: ["highway"] };
    expect(parseTtScenario(s).ok).toBe(true);
    expect(parseTtScenario({ ...s, type: "any", cond: ["any"] }).ok).toBe(true);
    expect(paths(parseTtScenario({ ...s, cond: ["fog"] }))).toContain("cond[0]");
  });
});

describe("mapping preset", () => {
  it("accepts a preset and rejects bad channels and zero multipliers", () => {
    const p = { columns: { t: "time_ms", speed: "speed_kph" }, multipliers: { t: 0.001, speed: 1 / 3.6 }, invert: { takeover: true }, brakeUnit: "bar" };
    expect(parseMappingPreset(p).ok).toBe(true);
    expect(paths(parseMappingPreset({ ...p, columns: { accel_x: "a" } }))).toContain("columns.accel_x");
    expect(paths(parseMappingPreset({ ...p, multipliers: { t: 0 } }))).toContain("multipliers.t");
  });
});
