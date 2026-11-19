import { afterEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";
import jpeg from "jpeg-js";
import {
  analyzeEventFrames,
  analyzeJpeg,
  analyzeRgba,
  computeImageMetrics,
  decodeJpeg,
  readJpegHeader,
  toLuma,
  type RgbaImage,
} from "../src/image/index.js";
import type { ConditionChip } from "../src/schema/index.js";

// ---------------------------------------------------------------- synthetic scenes (test-only)

type Scene = "day" | "sun" | "night" | "rain" | "night-rain";

/** Deterministic LCG in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Grey-ish road scene: sky gradient, textured road, lane line, optional sun / night / rain layer. */
function render(scene: Scene, w = 1280, h = 720, seed = 7): RgbaImage {
  const rand = rng(seed);
  const y = new Float64Array(w * h);
  const horizon = Math.round(0.42 * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let v: number;
      if (r < horizon) v = 150 + (60 * r) / horizon; // sky 150 → 210
      else v = 70 + (rand() - 0.5) * 24; // asphalt ±12
      if (r >= horizon && Math.abs(c - w * 0.3) < w * 0.006) v = 200; // lane line
      y[r * w + c] = v;
    }
  }
  if (scene === "sun") {
    const cx = w * 0.5;
    const cy = h * 0.34;
    const rc = w * 0.04;
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const d = Math.hypot(c - cx, r - cy);
        y[r * w + c] = d < rc ? 255 : (y[r * w + c] as number) + 80 / (1 + (d / rc) ** 2);
      }
  }
  if (scene === "rain" || scene === "night-rain") {
    for (let i = 0; i < y.length; i++) y[i] = (y[i] as number) + 0.45 * (128 - (y[i] as number));
    for (let pass = 0; pass < 3; pass++) boxBlur(y, w, h, 3);
  }
  if (scene === "night" || scene === "night-rain") {
    // global gain 0.15, then sensor noise so the frame keeps fine texture (lapVar ≥ 60)
    for (let i = 0; i < y.length; i++) y[i] = (y[i] as number) * 0.15 + (scene === "night" ? (rand() - 0.5) * 32 : 0);
  }
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(y[i] as number)));
    data.set([v, v, v, 255], i * 4);
  }
  return { width: w, height: h, data };
}

/** Separable box blur in place (test-only helper). */
function boxBlur(y: Float64Array, w: number, h: number, rad: number): void {
  const tmp = new Float64Array(y.length);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let s = 0;
      let n = 0;
      for (let k = -rad; k <= rad; k++) {
        const cc = c + k;
        if (cc >= 0 && cc < w) {
          s += y[r * w + cc] as number;
          n++;
        }
      }
      tmp[r * w + c] = s / n;
    }
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let s = 0;
      let n = 0;
      for (let k = -rad; k <= rad; k++) {
        const rr = r + k;
        if (rr >= 0 && rr < h) {
          s += tmp[rr * w + c] as number;
          n++;
        }
      }
      y[r * w + c] = s / n;
    }
}

function encode(img: RgbaImage, quality = 85): Uint8Array {
  const buf = jpeg.encode({ width: img.width, height: img.height, data: img.data }, quality).data;
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}

const jpegs = new Map<Scene, Uint8Array>();
function jpegOf(scene: Scene): Uint8Array {
  let b = jpegs.get(scene);
  if (!b) {
    b = encode(render(scene));
    jpegs.set(scene, b);
  }
  return b;
}

// ---------------------------------------------------------------- decode

describe("image: decodeJpeg", () => {
  it("decodes a jpeg-js baseline JPEG to RGBA", () => {
    const r = decodeJpeg(encode(render("day", 64, 36)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.value.width, r.value.height, r.value.data.length]).toEqual([64, 36, 64 * 36 * 4]);
    expect(r.value.data).toBeInstanceOf(Uint8Array);
  });

  it("reads the frame header", () => {
    const h = readJpegHeader(encode(render("day", 50, 20)));
    expect(h.ok && h.value).toEqual({ width: 50, height: 20, components: 3, progressive: false });
  });

  it("rejects bytes that do not start with FFD8", () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]), new Uint8Array([0xff, 0xd8])]) {
      const r = decodeJpeg(bytes);
      expect(!r.ok && r.error[0]?.code).toBe("E_IMAGE_NOT_JPEG");
    }
  });

  it("rejects CMYK frames before decoding", () => {
    // SOI, SOF0 (len 17): precision 8, 8x8, 4 components
    const sof = [0xff, 0xc0, 0x00, 0x14, 0x08, 0x00, 0x08, 0x00, 0x08, 0x04, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0];
    const r = decodeJpeg(new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xd9]));
    expect(!r.ok && r.error[0]?.code).toBe("E_IMAGE_CMYK");
  });

  it("rejects frames over the pixel limit", () => {
    const r = decodeJpeg(encode(render("day", 100, 100)), { maxPixels: 9999 });
    expect(!r.ok && r.error[0]?.code).toBe("E_IMAGE_TOO_LARGE");
  });

  it("returns E_IMAGE_DECODE for corrupt or truncated data and never throws", () => {
    const good = encode(render("day", 64, 36));
    const truncated = decodeJpeg(good.subarray(0, 40));
    expect(!truncated.ok && truncated.error[0]?.code).toBe("E_IMAGE_DECODE");
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 300 }), (tail) => {
        const r = decodeJpeg(new Uint8Array([0xff, 0xd8, ...tail]));
        return r.ok || r.error.length === 1;
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------- chips on synthetic frames

describe("image: chips on synthetic JPEG frames (1280x720, q85)", () => {
  const cases: [Scene, readonly ConditionChip[]][] = [
    ["day", ["normal"]],
    ["sun", ["low-sun-glare"]],
    ["night", ["night"]],
    ["rain", ["blur-rain"]],
    ["night-rain", ["night", "blur-rain"]],
  ];
  for (const [scene, chips] of cases) {
    it(`${scene} → ${chips.join(", ")}`, () => {
      const r = analyzeEventFrames([jpegOf(scene)]);
      expect(r.frames[0]?.ok).toBe(true);
      expect(r.summary?.chips).toEqual(chips);
      const f = r.frames[0];
      if (f?.ok) expect([f.value.scaledWidth, f.value.scaledHeight]).toEqual([640, 360]);
    });
  }

  it("sun frame: the blob qualifies and every chip rule is recorded with its value", () => {
    const s = analyzeEventFrames([jpegOf("sun")]).summary;
    expect(s).not.toBeNull();
    if (!s) return;
    expect(s.median.sunBlob).toBeGreaterThanOrEqual(0.004);
    expect(s.median.glare).toBeGreaterThanOrEqual(s.median.sunBlob);
    expect(s.chipRules.some((r) => r.metric === "sunBlob" && r.value === s.median.sunBlob)).toBe(true);
    expect(s.hist32.reduce((a, b) => a + b, 0)).toBe(640 * 360);
  });

  it("per event: median across frames, failed frames skipped", () => {
    const r = analyzeEventFrames([jpegOf("night"), new Uint8Array([1, 2, 3]), jpegOf("night"), jpegOf("day")]);
    expect(r.frames.map((f) => f.ok)).toEqual([true, false, true, true]);
    expect(r.summary?.chips).toEqual(["night"]);
  });

  it("no decodable frame gives a null summary (chips n/a)", () => {
    expect(analyzeEventFrames([new Uint8Array([0xff, 0xd8, 0xff])]).summary).toBeNull();
    expect(analyzeEventFrames([]).summary).toBeNull();
  });
});

// ---------------------------------------------------------------- determinism and speed

describe("image: determinism and performance", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the same bytes give identical metrics, without touching Math.random or Date", () => {
    const bytes = jpegOf("sun");
    const a = analyzeJpeg(bytes);
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random used");
    });
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("Date.now used");
    });
    const b = analyzeJpeg(new Uint8Array(bytes));
    expect(b).toEqual(a);
  });

  it("property: identical rasters give identical metrics", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.constantFrom<Scene>("day", "sun", "night", "rain"), (seed, scene) => {
        const img = render(scene, 96, 54, seed);
        const copy: RgbaImage = { ...img, data: new Uint8Array(img.data) };
        expect(analyzeRgba(copy)).toEqual(analyzeRgba(img));
      }),
      { numRuns: 10 },
    );
  });

  it("metrics on a 640x360 frame run in < 50 ms", () => {
    const r = decodeJpeg(jpegOf("sun"));
    if (!r.ok) throw new Error("decode failed");
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const l = analyzeRgba(r.value); // downscale 1280x720 → 640x360, luma, M1..M7
      samples.push(performance.now() - t0);
      expect(l.ok).toBe(true);
    }
    samples.sort((a, b) => a - b);
    expect(samples[2]).toBeLessThan(50);
    // metrics alone, on an already-downscaled luma raster
    const small = toLuma(render("day", 640, 360));
    if (!small.ok) throw new Error("luma failed");
    const t0 = performance.now();
    computeImageMetrics(small.value);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
