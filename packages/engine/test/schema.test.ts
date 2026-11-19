import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  CANONICAL_CHANNELS,
  CHANNEL_SPECS,
  CODEC_DEFAULTS,
  CONDITION_CHIPS,
  DEFAULT_SCALES,
  DEFAULT_WEIGHTS,
  ENGINE_VERSION,
  FEATURE_IDS,
  FEATURE_KEYS,
  FEATURE_SPECS,
  SIGNAL_CHANNELS,
  SIGNAL_CHIPS,
  WINDOW_N,
  WINDOW_ZERO_INDEX,
  arrayOf,
  bucketId,
  chipsToMask,
  clampFeature,
  maskToChips,
  matchHeader,
  needsRecompute,
  normalizeHeader,
  num,
  object,
  run,
  str,
  tagsFromLabels,
  utf8ByteLength,
  windowTime,
  type ConditionChip,
} from "../src/schema/index.js";

describe("channels (§5.1)", () => {
  it("matches header synonyms case- and separator-insensitively", () => {
    expect(matchHeader("Time_MS")).toEqual({ channel: "t", inverted: false });
    expect(matchHeader(" speed-kph ")).toEqual({ channel: "speed", inverted: false });
    expect(matchHeader("﻿t")).toEqual({ channel: "t", inverted: false });
    expect(matchHeader("Lateral Offset")).toEqual({ channel: "lane_offset", inverted: false });
    expect(matchHeader("ad_active")).toEqual({ channel: "takeover", inverted: true });
    expect(matchHeader("accel_x")).toBeNull();
    expect(matchHeader("ad_mode")).toBeNull();
  });

  it("every synonym maps back to its own channel (no ambiguity)", () => {
    for (const name of CANONICAL_CHANNELS) {
      for (const syn of CHANNEL_SPECS[name].synonyms) expect(matchHeader(syn)?.channel).toBe(name);
    }
  });

  it("only t is required; codec covers all 8 signal channels", () => {
    expect(CANONICAL_CHANNELS.filter((c) => CHANNEL_SPECS[c].required)).toEqual(["t"]);
    expect(Object.keys(CODEC_DEFAULTS).sort()).toEqual([...SIGNAL_CHANNELS].sort());
  });

  it("normalizeHeader is idempotent", () => {
    fc.assert(fc.property(fc.string(), (s) => normalizeHeader(normalizeHeader(s)) === normalizeHeader(s)));
  });

  it("window grid: N = 201, sample 150 is t = 0, integer-exact times", () => {
    expect(WINDOW_N).toBe(201);
    expect(WINDOW_ZERO_INDEX).toBe(150);
    expect(windowTime(0)).toBe(-15);
    expect(windowTime(150)).toBe(0);
    expect(windowTime(200)).toBe(5);
    expect(windowTime(151)).toBe(0.1);
  });
});

describe("features (§5.3)", () => {
  it("matches the default scales and weights table", () => {
    expect(DEFAULT_SCALES).toEqual({ F1: 0.15, F2: 0.75, F3: 0.75, F4: 0.5, F5: 1.0, F6: 0.1, F7: 1.0, F8: 4.0, F9: 0.02, F10: 0.15 });
    expect(DEFAULT_WEIGHTS).toEqual({ F1: 1, F2: 1, F3: 1, F4: 1, F5: 0.75, F6: 1, F7: 0.5, F8: 0.5, F9: 0.5, F10: 0.5 });
    for (const id of FEATURE_IDS) expect(FEATURE_SPECS[id].key).toBe(FEATURE_KEYS[id]);
    expect(FEATURE_SPECS.F1.range).toEqual([0, 3]);
    expect(FEATURE_SPECS.F3.range).toEqual([0, 10]);
  });

  it("clampFeature lands in range and flags exactly when it changed the value", () => {
    fc.assert(
      fc.property(fc.constantFrom(...FEATURE_IDS), fc.double({ min: -1e6, max: 1e6, noNaN: true }), (id, x) => {
        const [lo, hi] = FEATURE_SPECS[id].range;
        const c = clampFeature(id, x);
        return c.value >= lo && c.value <= hi && c.clamped === (c.value !== x);
      }),
    );
  });
});

describe("chips (§5.5)", () => {
  it("mask round-trips any set of signal chips", () => {
    fc.assert(
      fc.property(fc.subarray([...SIGNAL_CHIPS]), (chips) => {
        const back = maskToChips(chipsToMask(chips));
        return chips.length === 0 ? back.join() === "normal" : back.join() === chips.join();
      }),
    );
  });
  it("normal has no bit", () => {
    expect(chipsToMask(["normal"] as ConditionChip[])).toBe(0);
    expect(chipsToMask([...CONDITION_CHIPS])).toBe(7);
  });
});

describe("coverage tags (§5.10)", () => {
  it("parses only known prefixes, dedupes and sorts", () => {
    expect(
      tagsFromLabels(["tt-scenario", "cond:low-sun-glare", "type:lane-loss", "cond:night", "cond:low-sun-glare", "variant:any", "foo:bar", ":x", "odd:"]),
    ).toEqual({ type: ["lane-loss"], variant: ["any"], cond: ["low-sun-glare", "night"] });
  });
  it("an absent dimension stays absent", () => {
    expect("odd" in tagsFromLabels(["type:late-brake"])).toBe(false);
  });
  it("is invariant to label order", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom("type:a", "cond:b", "cond:c", "odd:d", "x", "variant:any")), (labels) => {
        const a = JSON.stringify(tagsFromLabels(labels));
        const b = JSON.stringify(tagsFromLabels([...labels].reverse()));
        return a === b;
      }),
    );
  });
});

describe("misc", () => {
  it("bucketId and version helpers", () => {
    expect(bucketId({ type: "lane-loss", variant: "cam-B" })).toBe("lane-loss|cam-B");
    expect(needsRecompute(ENGINE_VERSION)).toBe(false);
    expect(needsRecompute("0.9.0")).toBe(true);
  });

  it("utf8ByteLength matches Buffer.byteLength for well-formed strings", () => {
    fc.assert(fc.property(fc.string({ unit: "grapheme" }), (s) => utf8ByteLength(s) === Buffer.byteLength(s, "utf8")));
    expect(utf8ByteLength("µ")).toBe(2);
    expect(utf8ByteLength("€")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("\uD800")).toBe(3);
  });
});

describe("validator combinators", () => {
  const point = object({ x: num({ min: 0 }), tags: arrayOf(str({ maxLength: 3 })) }, { label: str() });

  it("builds nested paths and collects all errors", () => {
    const r = run(point, { x: -1, tags: ["ok", "toolong"], label: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.map((e) => e.path)).toEqual(["x", "tags[1]", "label"]);
  });

  it("treats explicit undefined optional keys as absent", () => {
    const r = run(point, { x: 1, tags: [], label: undefined });
    expect(r).toEqual({ ok: true, value: { x: 1, tags: [] } });
  });

  it("num rejects non-finite values", () => {
    for (const v of [Number.NaN, Infinity, -Infinity, "1", null]) expect(run(num(), v).ok).toBe(false);
  });

  it("ignores prototype-polluting keys", () => {
    const raw = JSON.parse('{"x":1,"tags":[],"__proto__":{"polluted":true}}') as unknown;
    const r = run(point, raw);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });
});
