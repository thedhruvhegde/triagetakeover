import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  boxDownscale,
  computeImageMetrics,
  downscale,
  downscaleFactor,
  evaluateChips,
  histogramPercentile,
  laplacianVariance,
  lumaOf,
  medianMetrics,
  summarizeFrames,
  sunBlobFraction,
  toHist32,
  toLuma,
  type FrameMetrics,
  type LumaImage,
  type RgbaImage,
} from "../src/image/index.js";
import { DEFAULT_CHIP_THRESHOLDS, chipsToMask, maskToChips, type ImageMetrics } from "../src/schema/index.js";

// ---------------------------------------------------------------- helpers

function solid(w: number, h: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([r, g, b, 255], i * 4);
  return { width: w, height: h, data };
}

function lumaFrom(w: number, h: number, f: (x: number, y: number) => number): LumaImage {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x, y);
  return { width: w, height: h, data };
}

function metricsOf(l: LumaImage): FrameMetrics {
  const r = computeImageMetrics(l);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

function meanLuma(img: RgbaImage): number {
  const l = toLuma(img);
  if (!l.ok) throw new Error("bad raster");
  let s = 0;
  for (const v of l.value.data) s += v;
  return s / l.value.data.length;
}

const BASE: ImageMetrics = { meanY: 120, p5: 20, p95: 220, glare: 0, sunBlob: 0, lapVar: 200, contrast: 55, darkFrac: 0.02 };

const rgbaArb = (maxW: number, maxH: number) =>
  fc
    .record({ w: fc.integer({ min: 1, max: maxW }), h: fc.integer({ min: 1, max: maxH }), seed: fc.integer() })
    .map(({ w, h, seed }) => {
      const data = new Uint8Array(w * h * 4);
      let s = seed >>> 0;
      for (let i = 0; i < data.length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        data[i] = s >>> 24;
      }
      return { width: w, height: h, data } as RgbaImage;
    });

// ---------------------------------------------------------------- luma and downscale

describe("image: luma", () => {
  it("matches the BT.601 integer approximation at the extremes", () => {
    expect(lumaOf(0, 0, 0)).toBe(0);
    expect(lumaOf(255, 255, 255)).toBe(255);
    expect(lumaOf(255, 0, 0)).toBe(77);
    expect(lumaOf(0, 255, 0)).toBe(149);
    expect(lumaOf(0, 0, 255)).toBe(29);
  });

  it("rejects malformed rasters", () => {
    const r = toLuma({ width: 2, height: 2, data: new Uint8Array(15) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error[0]?.code).toBe("E_IMAGE_INVALID");
    expect(toLuma({ width: 0, height: 2, data: new Uint8Array(0) }).ok).toBe(false);
  });
});

describe("image: downscale", () => {
  it("chooses the integer factor from the long side", () => {
    expect(downscaleFactor(1920, 1080)).toBe(3);
    expect(downscaleFactor(1280, 720)).toBe(2);
    expect(downscaleFactor(960, 540)).toBe(2);
    expect(downscaleFactor(640, 360)).toBe(1);
    expect(downscaleFactor(641, 10)).toBe(2);
  });

  it("returns small images unchanged and gives ceil dimensions with partial edge blocks", () => {
    const small = solid(10, 10, 1, 2, 3);
    const r = downscale(small);
    expect(r.ok && r.value).toBe(small);
    const big = boxDownscale(solid(7, 5, 9, 9, 9), 3);
    expect([big.width, big.height]).toEqual([3, 2]);
  });

  it("averages with round-half-up", () => {
    const img: RgbaImage = { width: 2, height: 1, data: new Uint8Array([0, 1, 2, 255, 1, 2, 2, 255]) };
    expect([...boxDownscale(img, 2).data]).toEqual([1, 2, 2, 255]); // 0.5→1, 1.5→2, 2→2
  });

  it("property: downscale of a constant image is constant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1400 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (w, h, r, g, b) => {
          const out = downscale(solid(w, h, r, g, b));
          if (!out.ok) return false;
          const d = out.value.data;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] !== r || d[i + 1] !== g || d[i + 2] !== b || d[i + 3] !== 255) return false;
          }
          return Math.max(out.value.width, out.value.height) <= 640;
        },
      ),
      { numRuns: 60 },
    );
  });

  it("property: downscale preserves mean luma within ±1", () => {
    fc.assert(
      fc.property(rgbaArb(40, 40), fc.integer({ min: 2, max: 5 }), (img, f) => {
        // whole blocks only, so every output pixel has the same weight
        const w = Math.max(f, img.width - (img.width % f));
        const h = Math.max(f, img.height - (img.height % f));
        const data = new Uint8Array(w * h * 4);
        for (let i = 0; i < data.length; i++) data[i] = img.data[i % img.data.length] as number;
        const src: RgbaImage = { width: w, height: h, data };
        return Math.abs(meanLuma(boxDownscale(src, f)) - meanLuma(src)) <= 1;
      }),
      { numRuns: 100 },
    );
  });

  it("property: downscale is deterministic", () => {
    fc.assert(
      fc.property(rgbaArb(30, 30), fc.integer({ min: 1, max: 4 }), (img, f) => {
        expect(boxDownscale(img, f)).toEqual(boxDownscale(img, f));
      }),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------- metrics

describe("image: metrics", () => {
  it("nearest-rank percentiles", () => {
    const hist = new Array<number>(256).fill(0);
    for (let v = 0; v < 100; v++) hist[v] = 1; // values 0..99
    expect(histogramPercentile(hist, 100, 5)).toBe(4);
    expect(histogramPercentile(hist, 100, 95)).toBe(94);
    expect(histogramPercentile(hist, 100, 0)).toBe(0);
    expect(histogramPercentile(hist, 100, 100)).toBe(99);
  });

  it("hist32 sums 8 levels per bin", () => {
    const hist = new Array<number>(256).fill(1);
    const h32 = toHist32(hist);
    expect(h32).toHaveLength(32);
    expect(h32.every((c) => c === 8)).toBe(true);
  });

  it("computes the documented statistics on a two-level image", () => {
    // left half 0, right half 255 (10x10)
    const m = metricsOf(lumaFrom(10, 10, (x) => (x < 5 ? 0 : 255))).metrics;
    expect(m.meanY).toBe(127.5);
    expect(m.contrast).toBe(127.5);
    expect(m.glare).toBe(0.5);
    expect(m.darkFrac).toBe(0.5);
    expect(m.p5).toBe(0);
    expect(m.p95).toBe(255);
    expect(m.sunBlob).toBe(0.5);
  });

  it("Laplacian variance on a hand-computed example", () => {
    // single bright interior pixel on a 3x3 image: one interior pixel → variance 0
    expect(laplacianVariance(lumaFrom(3, 3, (x, y) => (x === 1 && y === 1 ? 10 : 0)))).toBe(0);
    // 4x3: interior pixels (1,1)=10 and (2,1)=0 → L = 40 and −10, variance = 625
    expect(laplacianVariance(lumaFrom(4, 3, (x, y) => (x === 1 && y === 1 ? 10 : 0)))).toBe(625);
    expect(laplacianVariance(lumaFrom(2, 9, () => 7))).toBe(0);
  });

  it("property: a uniform image gives lapVar = 0, contrast = 0 and glare ∈ {0, 1}", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 255 }), (w, h, v) => {
        const m = metricsOf(lumaFrom(w, h, () => v)).metrics;
        return m.lapVar === 0 && m.contrast === 0 && (m.glare === 0 || m.glare === 1) && m.meanY === v && m.p5 === v && m.p95 === v;
      }),
    );
  });

  it("property: brightening (adding Δ with clipping) never decreases meanY", () => {
    fc.assert(
      fc.property(rgbaArb(24, 24), fc.integer({ min: 0, max: 255 }), (img, delta) => {
        const bright = new Uint8Array(img.data.length);
        for (let i = 0; i < bright.length; i++) bright[i] = Math.min(255, (img.data[i] as number) + delta);
        const a = metricsOf((toLuma(img) as { value: LumaImage }).value).metrics.meanY;
        const b = metricsOf((toLuma({ ...img, data: bright }) as { value: LumaImage }).value).metrics.meanY;
        return b >= a;
      }),
    );
  });

  it("property: metrics stay inside their schema ranges and p5 ≤ p95", () => {
    fc.assert(
      fc.property(rgbaArb(30, 30), (img) => {
        const m = metricsOf((toLuma(img) as { value: LumaImage }).value).metrics;
        return (
          m.p5 <= m.p95 &&
          m.glare >= m.sunBlob &&
          [m.glare, m.sunBlob, m.darkFrac].every((x) => x >= 0 && x <= 1) &&
          m.lapVar >= 0 &&
          m.lapVar <= 1020 ** 2 &&
          m.contrast >= 0 &&
          m.contrast <= 127.5 &&
          Number.isFinite(m.meanY)
        );
      }),
    );
  });
});

describe("image: sun blob (union-find)", () => {
  const W = 20;
  const H = 10; // top band: rows 0..5 (5y < 30)

  it("ignores blobs entirely in the bottom 40 %", () => {
    expect(sunBlobFraction(lumaFrom(W, H, (x, y) => (y >= 6 && x < 4 ? 255 : 100)))).toBe(0);
    expect(sunBlobFraction(lumaFrom(W, H, (x, y) => (y >= 5 && x < 4 ? 255 : 100)))).toBe((5 * 4) / 200);
  });

  it("counts the whole component once it touches the top band", () => {
    // vertical bar spanning rows 3..9 in column 0
    expect(sunBlobFraction(lumaFrom(W, H, (x, y) => (x === 0 && y >= 3 ? 255 : 0)))).toBe(7 / 200);
  });

  it("uses 4-connectivity: diagonal neighbours are separate", () => {
    const diag = lumaFrom(W, H, (x, y) => (x === y ? 255 : 0));
    expect(sunBlobFraction(diag)).toBe(1 / 200);
  });

  it("merges U-shapes discovered as two labels", () => {
    // columns 0 and 4 bright in rows 0..3, joined along row 3
    const u = lumaFrom(W, H, (x, y) => ((x === 0 || x === 4) && y <= 3) || (y === 3 && x <= 4) ? 255 : 0);
    expect(sunBlobFraction(u)).toBe(11 / 200);
  });

  it("picks the largest qualifying component", () => {
    const two = lumaFrom(W, H, (x, y) => (y < 2 && x < 2) || (y < 3 && x >= 10 && x < 13) ? 250 : 249);
    expect(sunBlobFraction(two)).toBe(9 / 200);
  });

  it("handles a checkerboard (worst-case label count)", () => {
    expect(sunBlobFraction(lumaFrom(31, 17, (x, y) => ((x + y) % 2 === 0 ? 255 : 0)))).toBe(1 / (31 * 17));
  });

  it("property: sunBlob ≤ glare and is deterministic", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 30 }), fc.integer(), (w, h, seed) => {
        let s = seed >>> 0;
        const l = lumaFrom(w, h, () => {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          return s >>> 31 ? 255 : 0;
        });
        const m = metricsOf(l).metrics;
        return m.sunBlob <= m.glare && sunBlobFraction(l) === m.sunBlob;
      }),
    );
  });
});

// ---------------------------------------------------------------- chips

describe("image: chips", () => {
  it("normal when nothing fires", () => {
    expect(evaluateChips(BASE)).toEqual({ chips: ["normal"], chipRules: [] });
  });

  it("night records both conditions and suppresses glare", () => {
    const e = evaluateChips({ ...BASE, meanY: 30, p95: 120, glare: 0.2 });
    expect(e.chips).toEqual(["night"]);
    expect(e.chipRules).toEqual([
      { chip: "night", metric: "meanY", op: "<", value: 30, threshold: 45 },
      { chip: "night", metric: "p95", op: "<", value: 120, threshold: 160 },
    ]);
  });

  it("night needs both conditions", () => {
    expect(evaluateChips({ ...BASE, meanY: 30, p95: 200 }).chips).toEqual(["normal"]);
  });

  it("low-sun-glare records only the conditions that fired", () => {
    const e = evaluateChips({ ...BASE, sunBlob: 0.009, glare: 0.01 });
    expect(e.chips).toEqual(["low-sun-glare"]);
    expect(e.chipRules).toEqual([{ chip: "low-sun-glare", metric: "sunBlob", op: ">=", value: 0.009, threshold: 0.004 }]);
    expect(evaluateChips({ ...BASE, glare: 0.05 }).chips).toEqual(["low-sun-glare"]); // boundary is inclusive
  });

  it("blur-rain combines with night", () => {
    const e = evaluateChips({ ...BASE, meanY: 20, p95: 100, lapVar: 30, contrast: 20 });
    expect(e.chips).toEqual(["night", "blur-rain"]);
    expect(e.chipRules.map((r) => r.metric)).toEqual(["meanY", "p95", "lapVar", "contrast"]);
  });

  it("honours custom thresholds", () => {
    expect(evaluateChips(BASE, { ...DEFAULT_CHIP_THRESHOLDS, nightMeanYBelow: 200, nightP95Below: 255 }).chips).toEqual(["night"]);
  });

  const metricsArb = fc.record({
    meanY: fc.double({ min: 0, max: 255, noNaN: true }),
    p5: fc.integer({ min: 0, max: 255 }),
    p95: fc.integer({ min: 0, max: 255 }),
    glare: fc.double({ min: 0, max: 1, noNaN: true }),
    sunBlob: fc.double({ min: 0, max: 1, noNaN: true }),
    lapVar: fc.double({ min: 0, max: 1000, noNaN: true }),
    contrast: fc.double({ min: 0, max: 127.5, noNaN: true }),
    darkFrac: fc.double({ min: 0, max: 1, noNaN: true }),
  });

  it("property: normal is exclusive, night excludes glare, every rule is true and every chip has a rule", () => {
    fc.assert(
      fc.property(metricsArb, (m) => {
        const { chips, chipRules } = evaluateChips(m);
        if (chips.length === 0) return false;
        if (chips.includes("normal")) return chips.length === 1 && chipRules.length === 0;
        if (chips.includes("night") && chips.includes("low-sun-glare")) return false;
        const ruleOk = chipRules.every((r) => chips.includes(r.chip) && m[r.metric] === r.value);
        const chipHasRule = chips.every((c) => chipRules.some((r) => r.chip === c));
        return ruleOk && chipHasRule && maskToChips(chipsToMask(chips)).join() === chips.join();
      }),
    );
  });
});

// ---------------------------------------------------------------- aggregation

describe("image: per-event aggregation", () => {
  const frame = (meanY: number, glare: number, tag: number): FrameMetrics => ({
    metrics: { ...BASE, meanY, glare },
    hist32: new Array<number>(32).fill(tag),
  });

  it("takes the lower median per metric for an even count", () => {
    const r = medianMetrics([
      { ...BASE, meanY: 40 },
      { ...BASE, meanY: 10 },
      { ...BASE, meanY: 30 },
      { ...BASE, meanY: 20 },
    ]);
    expect(r.ok && r.value.meanY).toBe(20);
  });

  it("stores hist32 of the frame holding the median meanY and derives chips from the medians", () => {
    const r = summarizeFrames([frame(150, 0.1, 1), frame(100, 0.0, 2), frame(120, 0.06, 3)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.median.meanY).toBe(120);
    expect(r.value.median.glare).toBe(0.06);
    expect(r.value.hist32[0]).toBe(3);
    expect(r.value.chips).toEqual(["low-sun-glare"]);
    expect(r.value.attested).toBe("client");
  });

  it("fails with E_IMAGE_NO_FRAMES on an empty list", () => {
    const r = summarizeFrames([]);
    expect(!r.ok && r.error[0]?.code).toBe("E_IMAGE_NO_FRAMES");
  });

  it("property: the median is invariant to frame order and is an actual frame value", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 0, max: 255, noNaN: true }), { minLength: 1, maxLength: 6 }), (ys) => {
        const a = medianMetrics(ys.map((meanY) => ({ ...BASE, meanY })));
        const b = medianMetrics([...ys].reverse().map((meanY) => ({ ...BASE, meanY })));
        return a.ok && b.ok && a.value.meanY === b.value.meanY && ys.includes(a.value.meanY);
      }),
    );
  });
});
