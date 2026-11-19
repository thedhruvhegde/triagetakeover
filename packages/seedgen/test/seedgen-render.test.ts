import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import {
  comText, encodeJpeg, EXPECTED_CHIPS, readComSegments, renderFrame, Rng, spliceComSegment, toneCurve, watermarkLayout,
  watermarkLines, WATERMARK_BOX_LUMA, type FrameCondition, type Variant,
} from "../src/index.js";
import { sunFor } from "../src/render/frames.js";
import { sha256Hex } from "../src/util/sha256.js";

const hash = (d: Uint8ClampedArray): string => sha256Hex(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
import { analyzeJpeg, analyzeRgba, evaluateChips } from "../../engine/src/image/index.js";

const W = 960;
const H = 540;

function frame(condition: FrameCondition, variant: Variant, seed = 1): Uint8ClampedArray {
  const rng = new Rng(seed);
  return renderFrame({ width: W, height: H, variant, condition, rng, sun: sunFor(rng.fork("sun"), condition, W, H), watermark: watermarkLines(seed, "E-001") });
}

const luma = (d: ArrayLike<number>, i: number): number => (77 * (d[i * 4] ?? 0) + 150 * (d[i * 4 + 1] ?? 0) + 29 * (d[i * 4 + 2] ?? 0) + 128) >> 8;

describe("tone curves (§9.1)", () => {
  it("cam-B gains 1.12 and clips at 255; cam-A has a soft knee below 252", () => {
    expect(toneCurve("cam-B", 100)).toBeCloseTo(112);
    expect(toneCurve("cam-B", 300)).toBe(255);
    expect(toneCurve("cam-A", 200)).toBe(200);
    expect(toneCurve("cam-A", 10_000)).toBeLessThanOrEqual(252);
    expect(toneCurve("cam-A", 330)).toBeGreaterThanOrEqual(250);
    expect(toneCurve("cam-A", 240)).toBeLessThan(240);
  });
});

describe("renderer", () => {
  it("is deterministic, opaque and sized as requested", () => {
    const a = frame("day", "cam-B");
    const b = frame("day", "cam-B");
    expect(a.length).toBe(W * H * 4);
    expect(hash(a)).toBe(hash(b));
    for (let i = 3; i < a.length; i += 4 * 997) expect(a[i]).toBe(255);
    expect(hash(frame("day", "cam-B", 2))).not.toBe(hash(a));
  });

  it("only the sun layer reaches glare luma (no element ≥ 250 in non-sun scenes)", () => {
    for (const c of ["day", "overcast", "night", "rain"] as const) {
      for (const v of ["cam-A", "cam-B"] as const) {
        const d = frame(c, v);
        let hot = 0;
        for (let i = 0; i < W * H; i++) if (luma(d, i) >= 250) hot++;
        expect(hot, `${c} ${v}`).toBe(0);
      }
    }
  });

  it("each condition produces its expected chips after JPEG encode (§9.4)", () => {
    const cases: [FrameCondition, Variant][] = [
      ["day", "cam-A"], ["day", "cam-B"], ["overcast", "cam-B"], ["low-sun", "cam-B"], ["low-sun-decoy", "cam-A"],
      ["night", "cam-A"], ["night", "cam-B"], ["rain", "cam-A"], ["rain", "cam-B"], ["night-rain", "cam-A"],
    ];
    for (const [c, v] of cases) {
      for (const seed of [1, 2]) {
        const r = analyzeJpeg(encodeJpeg(frame(c, v, seed), W, H, 80));
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(evaluateChips(r.value.metrics).chips, `${c} ${v}`).toEqual(EXPECTED_CHIPS[c]);
      }
    }
  });

  it("puts low-sun sunBlob and night meanY in their pre-registered bands", () => {
    const sun = analyzeRgba({ width: W, height: H, data: frame("low-sun", "cam-B") });
    const night = analyzeRgba({ width: W, height: H, data: frame("night", "cam-A") });
    const boundary = analyzeRgba({ width: W, height: H, data: frame("low-sun-boundary", "cam-B") });
    expect(sun.ok && night.ok && boundary.ok).toBe(true);
    if (!sun.ok || !night.ok || !boundary.ok) return;
    expect(sun.value.metrics.sunBlob).toBeGreaterThanOrEqual(0.008);
    expect(sun.value.metrics.sunBlob).toBeLessThanOrEqual(0.02);
    expect(boundary.value.metrics.sunBlob).toBeGreaterThanOrEqual(0.003);
    expect(boundary.value.metrics.sunBlob).toBeLessThanOrEqual(0.005);
    expect(night.value.metrics.meanY).toBeGreaterThanOrEqual(15);
    expect(night.value.metrics.meanY).toBeLessThanOrEqual(35);
  });
});

describe("watermark and JPEG (§9.3, G-T5)", () => {
  it("draws the mid-grey box bottom-left and keeps it after decode", () => {
    const lines = watermarkLines(7, "E-012");
    const box = watermarkLayout(W, H, lines);
    expect(box.x).toBe(8);
    expect(box.y + box.height).toBe(H - 8);
    expect(box.x + box.width).toBeLessThanOrEqual(W - 8);
    const rng = new Rng(7);
    const rgba = renderFrame({ width: W, height: H, variant: "cam-B", condition: "night", rng, sun: null, watermark: lines });
    const bytes = spliceComSegment(encodeJpeg(rgba, W, H, 80), comText(7, "E-012"));
    const dec = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
    let sum = 0;
    let n = 0;
    for (let x = box.x + 3; x < box.x + box.width - 3; x++) {
      for (const y of [box.y + 2, box.y + 3]) {
        sum += luma(dec.data, y * W + x);
        n++;
      }
    }
    expect(Math.abs(sum / n - WATERMARK_BOX_LUMA)).toBeLessThanOrEqual(12);
  });

  it("splices the COM segment right after SOI and stays decodable", () => {
    const rgba = frame("day", "cam-A");
    const plain = encodeJpeg(rgba, W, H, 80);
    const text = comText(1, "E-001");
    const withCom = spliceComSegment(plain, text);
    expect([...withCom.subarray(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xfe]);
    expect(withCom.length).toBe(plain.length + 4 + text.length);
    expect(readComSegments(withCom)).toEqual([text]);
    expect(text).toBe("SYNTHETIC; generator=takeover-triage-seedgen/1.0.0; seed=1; event=E-001");
    const dec = jpeg.decode(withCom, { useTArray: true });
    expect([dec.width, dec.height]).toEqual([W, H]);
    expect(() => spliceComSegment(new Uint8Array([1, 2, 3]), "x")).toThrow(RangeError);
  });
});
