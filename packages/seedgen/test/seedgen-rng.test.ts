import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { fmix32, hashLabel, Rng, splitmix32, stream } from "../src/rng/index.js";
import { civilFromDays, daysFromCivil, formatIsoDate, formatIsoDateTime, parseIsoDate, weekday } from "../src/util/dates.js";
import { sha256Hex } from "../src/util/sha256.js";
import { utf8Encode } from "../src/util/utf8.js";
import { quantize, smoothstep } from "../src/util/num.js";

const seedArb = fc.integer({ min: 0, max: 0xffffffff });

describe("splitmix32 / xoshiro128**", () => {
  it("matches an independent reference implementation", () => {
    const sm = splitmix32(0);
    expect([sm(), sm(), sm()]).toEqual([2462723854, 1020716019, 454327756]);
    const a = new Rng(1);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual([2442144158, 3238099751, 3819917871, 2104621829, 2021136066]);
    const b = new Rng(2026);
    expect(Array.from({ length: 5 }, () => b.next())).toEqual([1436751614, 742089593, 1736781944, 1312845263, 2711517162]);
  });

  it("is deterministic and yields uint32 values", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const a = new Rng(seed), b = new Rng(seed);
      for (let i = 0; i < 20; i++) {
        const x = a.next();
        expect(x).toBe(b.next());
        expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true);
      }
    }));
  });

  it("uniform() is in [0, 1) on a 24-bit grid", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const r = new Rng(seed);
      for (let i = 0; i < 50; i++) {
        const u = r.uniform();
        expect(u >= 0 && u < 1).toBe(true);
        expect(Number.isInteger(u * 16777216)).toBe(true);
      }
    }));
  });
});

describe("fork", () => {
  it("depends only on the parent seed and the label, not on draws already made", () => {
    fc.assert(fc.property(seedArb, fc.string(), fc.nat(50), (seed, label, draws) => {
      const a = new Rng(seed);
      for (let i = 0; i < draws; i++) a.next();
      expect(a.fork(label).next()).toBe(new Rng(seed).fork(label).next());
      expect(stream(seed, label).next()).toBe(new Rng(seed).fork(label).next());
    }));
  });

  it("gives different streams for different labels", () => {
    const labels = ["event:E-001:telemetry", "event:E-002:telemetry", "fleet", "count:LC-A:cam-B:4.12.0", ""];
    const firsts = new Set(labels.map((l) => stream(7, l).next()));
    expect(firsts.size).toBe(labels.length);
    expect(hashLabel(1, "x")).not.toBe(hashLabel(2, "x"));
  });

  it("fmix32 is a bijection on a sample (no collisions)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(fmix32(i));
    expect(seen.size).toBe(5000);
  });
});

describe("distributions", () => {
  it("normal() is bounded at ±6 with mean ≈ 0 and variance ≈ 1", () => {
    const r = new Rng(42);
    let s = 0, s2 = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const x = r.normal();
      expect(Math.abs(x)).toBeLessThanOrEqual(6);
      s += x;
      s2 += x * x;
    }
    expect(Math.abs(s / n)).toBeLessThan(0.03);
    expect(Math.abs(s2 / n - 1)).toBeLessThan(0.05);
  });

  it("poisson() has mean ≈ λ and returns 0 for λ ≤ 0", () => {
    const r = new Rng(3);
    expect(r.poisson(0)).toBe(0);
    expect(r.poisson(-1)).toBe(0);
    for (const lambda of [0.5, 4, 14, 45]) {
      let s = 0;
      for (let i = 0; i < 4000; i++) s += r.poisson(lambda);
      expect(Math.abs(s / 4000 - lambda)).toBeLessThan(0.1 * lambda + 0.05);
    }
  });

  it("shuffle() is a permutation; weightedIndex() never picks a zero weight", () => {
    fc.assert(fc.property(seedArb, fc.array(fc.integer(), { maxLength: 30 }), fc.array(fc.nat(5), { minLength: 1, maxLength: 10 }), (seed, xs, ws) => {
      const r = new Rng(seed);
      expect([...r.shuffle(xs)].sort((a, b) => a - b)).toEqual([...xs].sort((a, b) => a - b));
      fc.pre(ws.some((w) => w > 0));
      const i = r.weightedIndex(ws);
      expect(ws[i]).toBeGreaterThan(0);
    }));
  });

  it("pick() throws on an empty list", () => {
    expect(() => new Rng(1).pick([])).toThrow(RangeError);
  });
});

describe("utilities", () => {
  it("dates round-trip and know weekdays", () => {
    fc.assert(fc.property(fc.integer({ min: -200000, max: 200000 }), (day) => {
      const { y, m, d } = civilFromDays(day);
      expect(daysFromCivil(y, m, d)).toBe(day);
      expect(parseIsoDate(formatIsoDate(day))).toBe(day);
    }));
    const monday = parseIsoDate("2026-11-16");
    expect(monday).not.toBeNull();
    expect(weekday(monday ?? 0)).toBe(0);
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("2026-1-1")).toBeNull();
    expect(formatIsoDateTime(0)).toBe("1970-01-01T00:00:00Z");
    expect(formatIsoDateTime(daysFromCivil(2026, 11, 13) * 86400 + 17 * 3600)).toBe("2026-11-13T17:00:00Z");
  });

  it("sha256 matches the FIPS test vectors", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(utf8Encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(utf8Encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("utf8Encode handles multi-byte and surrogate pairs", () => {
    expect([...utf8Encode("é€😀")]).toEqual([0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
    expect([...utf8Encode("\ud800")]).toEqual([0xef, 0xbf, 0xbd]);
  });

  it("quantize never returns -0 and smoothstep is clamped", () => {
    expect(Object.is(quantize(-0.0004, 0.001), 0)).toBe(true);
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.5)).toBe(0.5);
  });
});
