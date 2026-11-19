import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { encodeUtf8, formatCsv, parseCsv, type CsvTable } from "../src/csv/index.js";
import {
  applyMapping,
  canonicalJson,
  daysFromCivil,
  parseIsoSeconds,
  presetHash,
  sha256Hex,
  suggestMapping,
  type MappedSeries,
} from "../src/mapping/index.js";
import { parseMappingPreset, type MappingPreset } from "../src/schema/index.js";

function must<T>(x: T | undefined | null): T {
  if (x === undefined || x === null) throw new Error("missing value");
  return x;
}

const table = (s: string): CsvTable => {
  const r = parseCsv(s);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const mapped = (s: string, preset: MappingPreset = suggestMapping(table(s).headers)): MappedSeries => {
  const r = applyMapping(table(s), preset);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe("mapping: sha256", () => {
  it("matches FIPS test vectors", () => {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(encodeUtf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(encodeUtf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256Hex(new Uint8Array(1000).fill(0x61))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});

describe("mapping: suggestions", () => {
  it("maps the seeded default header row and drops decoys", () => {
    const p = suggestMapping(["t", "speed", "yaw_rate", "lane_offset", "steer_torque", "brake", "ttc", "lane_conf", "takeover", "accel_x", "ad_mode"]);
    expect(p.columns).toEqual({
      t: "t", speed: "speed", yaw_rate: "yaw_rate", lane_offset: "lane_offset", steer_torque: "steer_torque",
      brake: "brake", ttc: "ttc", lane_conf: "lane_conf", takeover: "takeover",
    });
    expect(p.multipliers).toEqual({});
    expect(p.brakeUnit).toBe("ratio");
    expect(parseMappingPreset(p).ok).toBe(true);
  });

  it("suggests unit multipliers and inversion for quirk headers", () => {
    const p = suggestMapping(["Time_ms", "Speed-KPH", "AD Active", "Offset_cm", "yaw_rate_deg"]);
    expect(p.columns).toMatchObject({ t: "Time_ms", speed: "Speed-KPH", takeover: "AD Active", lane_offset: "Offset_cm", yaw_rate: "yaw_rate_deg" });
    expect(p.multipliers).toEqual({ t: 0.001, speed: 1 / 3.6, lane_offset: 0.01, yaw_rate: Math.PI / 180 });
    expect(p.invert).toEqual({ takeover: true });
  });

  it("keeps the first header for a channel", () => {
    expect(suggestMapping(["time", "timestamp"]).columns.t).toBe("time");
  });
});

describe("mapping: preset hash", () => {
  const p: MappingPreset = { columns: { t: "t", speed: "v" }, multipliers: { speed: 0.5 }, invert: {}, brakeUnit: "ratio" };
  it("is sha256:<64 hex> and independent of key order", () => {
    const h = presetHash(p);
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
    const reordered: MappingPreset = { brakeUnit: "ratio", invert: {}, multipliers: { speed: 0.5 }, columns: { speed: "v", t: "t" } };
    expect(presetHash(reordered)).toBe(h);
    expect(presetHash({ ...p, brakeUnit: "bar" })).not.toBe(h);
  });
  it("canonical JSON sorts keys and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [1, { d: undefined, c: "x" }] })).toBe('{"a":[1,{"c":"x"}],"b":1}');
  });
});

describe("mapping: ISO time", () => {
  it("parses ISO-8601 to epoch seconds without Date", () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(parseIsoSeconds("2000-03-01T00:00:00Z")).toBe(951868800);
    expect(parseIsoSeconds("2026-11-14T09:12:33.25Z")).toBeCloseTo(1794647553.25, 6);
    expect(parseIsoSeconds("2026-11-14T10:12:33+01:00")).toBe(parseIsoSeconds("2026-11-14T09:12:33Z"));
    for (const bad of ["2026-02-30T00:00:00Z", "2026-13-01T00:00:00Z", "12.5", "2026-11-14"]) expect(parseIsoSeconds(bad)).toBeNaN();
  });

  it("maps an ISO time column", () => {
    const s = mapped("timestamp,speed\n2026-11-14T09:00:00.0Z,1\n2026-11-14T09:00:00.1Z,2\n");
    expect(must(s.t[1]) - must(s.t[0])).toBeCloseTo(0.1, 6);
  });
});

describe("mapping: apply", () => {
  it("applies multipliers and inversion", () => {
    const s = mapped("time_ms,speed_kph,ad_active\n0,36,1\n100,72,0\n");
    expect(s.t).toEqual([0, 0.1]);
    expect(s.channels.speed?.[0]).toBeCloseTo(10, 12);
    expect(s.channels.takeover).toEqual([0, 1]);
  });

  it("sorts by t, keeps the first duplicate and warns", () => {
    const s = mapped("t,speed\n0.2,3\n0.1,2\n0.1,9\n0,1\n");
    expect(s.t).toEqual([0, 0.1, 0.2]);
    expect(s.channels.speed).toEqual([1, 2, 3]);
    expect(s.lines).toEqual([5, 3, 2]);
    expect(s.warnings.map((w) => w.code)).toEqual(["W_DUPLICATE_TIME", "W_UNSORTED_TIME"]);
    expect(s.warnings[0]?.row).toBe(4);
  });

  it("errors on huge gaps, invalid time and missing columns", () => {
    const gap = applyMapping(table("t,x\n0,1\n0.1,1\n20,1\n"), suggestMapping(["t"]));
    expect(!gap.ok && gap.error[0]).toMatchObject({ code: "E_TIME_NONMONOTONIC_GAP", row: 4 });
    const bad = applyMapping(table("t,x\n0,1\nabc,1\n"), suggestMapping(["t"]));
    expect(!bad.ok && bad.error[0]).toMatchObject({ code: "E_TIME_INVALID", row: 3, column: "t" });
    const none = applyMapping(table("a,b\n1,2\n"), suggestMapping(["a"]));
    expect(!none.ok && none.error[0]?.code).toBe("E_MAPPING_NO_TIME");
    const missing = applyMapping(table("t\n1\n"), { columns: { t: "t", speed: "v" }, multipliers: {}, invert: {}, brakeUnit: "ratio" });
    expect(!missing.ok && missing.error[0]).toMatchObject({ code: "E_MAPPING_COLUMN_MISSING", column: "v" });
  });
});

describe("mapping: properties", () => {
  const rows = fc
    .uniqueArray(fc.integer({ min: 0, max: 900 }), { minLength: 2, maxLength: 40 })
    .chain((ts) => fc.tuple(fc.constant(ts), fc.array(fc.integer({ min: -100000, max: 100000 }).map((x) => x / 1000), { minLength: ts.length, maxLength: ts.length })));

  it("row shuffles give identical output after the sort by t", () => {
    fc.assert(
      fc.property(rows, fc.infiniteStream(fc.nat()), ([ts, vs], seeds) => {
        const data = ts.map((t, i) => [t / 100, vs[i] as number]);
        const shuffled = [...data];
        const it = seeds[Symbol.iterator]();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (it.next().value as number) % (i + 1);
          [shuffled[i], shuffled[j]] = [must(shuffled[j]), must(shuffled[i])];
        }
        const a = mapped(formatCsv(["t", "speed"], data));
        const b = mapped(formatCsv(["t", "speed"], shuffled));
        expect(b.t).toEqual(a.t);
        expect(b.channels).toEqual(a.channels);
      }),
      { numRuns: 200 },
    );
  });

  it("scaling a raw column by u with multiplier 1/u gives the same canonical values (u a power of 2: exact)", () => {
    fc.assert(
      fc.property(rows, fc.integer({ min: -8, max: 8 }), ([ts, vs], e) => {
        const u = 2 ** e;
        const base = mapped(formatCsv(["t", "speed"], ts.map((t, i) => [t / 100, vs[i] as number])));
        const csv = formatCsv(["t", "speed"], ts.map((t, i) => [t / 100, (vs[i] as number) * u]));
        const scaled = mapped(csv, { columns: { t: "t", speed: "speed" }, multipliers: { speed: 1 / u }, invert: {}, brakeUnit: "ratio" });
        expect(scaled.channels.speed).toEqual(base.channels.speed);
      }),
      { numRuns: 200 },
    );
  });

  it("the preset hash is deterministic", () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 5 }), (hs) => presetHash(suggestMapping(hs)) === presetHash(suggestMapping([...hs]))),
    );
  });
});
