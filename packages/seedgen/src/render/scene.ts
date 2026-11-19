/**
 * Simplified procedural dashcam renderer (SEED_DATA §9.1–§9.3): sky gradient, perspective road
 * with value-noise asphalt, lane lines, sun glare blob, night darkening, rain blur and streaks,
 * the per-variant tone curve and the visible SYNTHETIC watermark. Output is RGBA.
 * Only the sun glare layer is drawn with pre-tone values above 215 (§9.4 constraint).
 */
import type { Rng } from "../rng/index.js";
import type { FrameCondition, Variant } from "../types.js";
import { clamp, lerp } from "../util/num.js";
import { forEachTextPixel, GLYPH_H, textWidth } from "./font.js";

type Rgb = readonly [number, number, number];

/** Sky palettes, top and horizon colour (§9.2). */
export const SKY: Readonly<Record<"clear" | "warm" | "overcast" | "night", { readonly top: Rgb; readonly horizon: Rgb }>> = {
  clear: { top: [112, 142, 186], horizon: [192, 206, 214] },
  warm: { top: [150, 140, 150], horizon: [214, 200, 178] },
  overcast: { top: [160, 163, 168], horizon: [196, 197, 200] },
  night: { top: [40, 45, 70], horizon: [110, 112, 128] },
};

const ASPHALT: Rgb = [80, 80, 84];
const VERGE: Rgb = [92, 104, 74];
const LANE_PAINT: Rgb = [208, 208, 202];
const FOG: Rgb = [150, 152, 156];
const STREAK: Rgb = [210, 212, 216];
const TEXTURE_AMPLITUDE = 12;
/** Share of the 2 px octave in the 2-octave asphalt texture (sets the baseline lapVar). */
const FINE_WEIGHT = 0.4;
const NIGHT_GAIN = 0.15;
const RAIN_FOG_LERP = 0.45;
const RAIN_BLUR_RADIUS = 3;
const RAIN_BLUR_PASSES = 3;
const STREAK_ALPHA = 0.15;
/** Amplitude of the uniform sensor noise added to night frames without rain (see `renderFrame`). */
const NIGHT_SENSOR_NOISE = 10;
/** Pre-tone value of the sun core; saturates both tone curves (cam-A knee ≥ 250 above ≈ 283). */
const SUN_CORE = 330;
export const WATERMARK_BOX_LUMA = 96;
/**
 * Text luma. Deviation from §9.3 (200): at 200 the glyph edges alone push `lapVar` above the
 * blur-rain threshold, so rain frames could never chip; 140 keeps the text legible on 96.
 */
export const WATERMARK_TEXT_LUMA = 140;
export const WATERMARK_MARGIN = 8;
const WATERMARK_PAD = 6;

/** Per-event sun placement and size (frames of one event share it, with a small drift). */
export interface SunSpec {
  readonly x: number;
  readonly y: number;
  /** Target area fraction of the sun core (≈ engine `sunBlob`). */
  readonly blobFraction: number;
  /** Area fraction of the saturated road sheen below the sun (cam-B LC-A only), 0 for none. */
  readonly sheenFraction: number;
}

export interface FrameRenderInput {
  readonly width: number;
  readonly height: number;
  readonly variant: Variant;
  readonly condition: FrameCondition;
  /** Stream for this frame's texture and streaks. */
  readonly rng: Rng;
  readonly sun: SunSpec | null;
  readonly watermark: readonly [string, string];
}

/** Horizon row fraction per variant (§9.1). */
export const horizonFraction = (variant: Variant): number => (variant === "cam-A" ? 0.42 : 0.4);

/** Bilinear value noise with lattice spacing `cell` px, values in [−1, 1]. */
function valueNoise(rng: Rng, w: number, h: number, cell: number): Float32Array {
  const lw = Math.ceil(w / cell) + 2;
  const lh = Math.ceil(h / cell) + 2;
  const lat = new Float32Array(lw * lh);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.uniform() * 2 - 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = x / cell;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const i = y0 * lw + x0;
      const a = lat[i] ?? 0, b = lat[i + 1] ?? 0, c = lat[i + lw] ?? 0, d = lat[i + lw + 1] ?? 0;
      out[y * w + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    }
  }
  return out;
}

function skyFor(condition: FrameCondition): (typeof SKY)[keyof typeof SKY] {
  if (condition === "night" || condition === "night-rain") return SKY.night;
  if (condition === "overcast" || condition === "rain") return SKY.overcast;
  if (condition === "low-sun" || condition === "low-sun-decoy" || condition === "low-sun-boundary") return SKY.warm;
  return SKY.clear;
}

/** Writes RGB into a float buffer (3 values per pixel). */
const put = (buf: Float32Array, i: number, c: Rgb): void => {
  buf[i * 3] = c[0];
  buf[i * 3 + 1] = c[1];
  buf[i * 3 + 2] = c[2];
};

/** Sky, road, verge and lane lines (scene layers 1–3). */
function drawBase(buf: Float32Array, input: FrameRenderInput): void {
  const { width: w, height: h, rng } = input;
  const horizon = Math.round(horizonFraction(input.variant) * h);
  const sky = skyFor(input.condition);
  const fine = valueNoise(rng.fork("texture:fine"), w, h, 2);
  const coarse = valueNoise(rng.fork("texture:coarse"), w, h, 16);
  const cx = w / 2;
  for (let y = 0; y < h; y++) {
    if (y < horizon) {
      const t = y / horizon;
      const c: Rgb = [lerp(sky.top[0], sky.horizon[0], t), lerp(sky.top[1], sky.horizon[1], t), lerp(sky.top[2], sky.horizon[2], t)];
      for (let x = 0; x < w; x++) put(buf, y * w + x, c);
      continue;
    }
    const f = (y - horizon + 1) / (h - horizon);
    const halfRoad = lerp(0.006, 0.42, f) * w;
    const lineW = Math.max(1, lerp(1, 14, f) * (w / 1280));
    const leftLine = cx - lerp(0.004, 0.26, f) * w;
    const rightLine = cx + lerp(0.004, 0.26, f) * w;
    const dashOn = Math.floor(1.5 / (f + 0.02)) % 2 === 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const n = TEXTURE_AMPLITUDE * (FINE_WEIGHT * (fine[i] ?? 0) + (1 - FINE_WEIGHT) * (coarse[i] ?? 0));
      const base = Math.abs(x - cx) <= halfRoad ? ASPHALT : VERGE;
      let c: Rgb = [base[0] + n, base[1] + n, base[2] + n];
      if (Math.abs(x - leftLine) <= lineW / 2 || (dashOn && Math.abs(x - rightLine) <= lineW / 2)) c = LANE_PAINT;
      put(buf, i, c);
    }
  }
}

/** Sun core, bloom `1 / (1 + (d/r_b)²)` and optional road sheen (§9.2 low-sun). */
function drawSun(buf: Float32Array, w: number, h: number, sun: SunSpec): void {
  const rc = Math.sqrt((sun.blobFraction * w * h) / Math.PI);
  const rb = 0.5 * rc;
  const reach = rc * 6;
  for (let y = Math.max(0, Math.floor(sun.y - reach)); y < Math.min(h, Math.ceil(sun.y + reach)); y++) {
    for (let x = Math.max(0, Math.floor(sun.x - reach)); x < Math.min(w, Math.ceil(sun.x + reach)); x++) {
      const d = Math.hypot(x - sun.x, y - sun.y);
      const i = (y * w + x) * 3;
      if (d <= rc) {
        buf[i] = SUN_CORE;
        buf[i + 1] = SUN_CORE - 5;
        buf[i + 2] = SUN_CORE - 20;
      } else {
        const add = 60 / (1 + (d / rb) ** 2);
        buf[i] = (buf[i] ?? 0) + add;
        buf[i + 1] = (buf[i + 1] ?? 0) + 0.9 * add;
        buf[i + 2] = (buf[i + 2] ?? 0) + 0.7 * add;
      }
    }
  }
  if (sun.sheenFraction <= 0) return;
  const a = Math.sqrt((sun.sheenFraction * w * h) / (Math.PI * 0.25));
  const b = 0.25 * a;
  const cy = 0.8 * h;
  for (let y = Math.max(0, Math.floor(cy - b)); y < Math.min(h, Math.ceil(cy + b)); y++) {
    for (let x = Math.max(0, Math.floor(sun.x - a)); x < Math.min(w, Math.ceil(sun.x + a)); x++) {
      if (((x - sun.x) / a) ** 2 + ((y - cy) / b) ** 2 > 1) continue;
      const i = (y * w + x) * 3;
      buf[i] = SUN_CORE;
      buf[i + 1] = SUN_CORE - 5;
      buf[i + 2] = SUN_CORE - 20;
    }
  }
}

/** One horizontal + vertical box-blur pass of radius r over an interleaved RGB float buffer. */
function boxBlur(buf: Float32Array, w: number, h: number, r: number): void {
  const tmp = new Float32Array(buf.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += buf[(y * w + clamp(k, 0, w - 1)) * 3 + ch] ?? 0;
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + ch] = acc / n;
        acc += (buf[(y * w + Math.min(w - 1, x + r + 1)) * 3 + ch] ?? 0) - (buf[(y * w + Math.max(0, x - r)) * 3 + ch] ?? 0);
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 3; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[(clamp(k, 0, h - 1) * w + x) * 3 + ch] ?? 0;
      for (let y = 0; y < h; y++) {
        buf[(y * w + x) * 3 + ch] = acc / n;
        acc += (tmp[(Math.min(h - 1, y + r + 1) * w + x) * 3 + ch] ?? 0) - (tmp[(Math.max(0, y - r) * w + x) * 3 + ch] ?? 0);
      }
    }
  }
}

/** Fog lerp, three blur passes and diagonal streaks (§9.2 rain). */
function applyRain(buf: Float32Array, w: number, h: number, rng: Rng): void {
  for (let i = 0; i < w * h; i++) {
    for (let ch = 0; ch < 3; ch++) buf[i * 3 + ch] = lerp(buf[i * 3 + ch] ?? 0, FOG[ch] ?? 0, RAIN_FOG_LERP);
  }
  for (let p = 0; p < RAIN_BLUR_PASSES; p++) boxBlur(buf, w, h, RAIN_BLUR_RADIUS);
  const streaks = rng.fork("streaks");
  const count = Math.round((160 * w * h) / (1280 * 720));
  for (let s = 0; s < count; s++) {
    const x0 = streaks.range(0, w);
    const y0 = streaks.range(0, h);
    const len = streaks.range(20, 40) * (w / 1280);
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + 0.35 * k);
      const y = Math.round(y0 + k);
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const i = (y * w + x) * 3;
      for (let ch = 0; ch < 3; ch++) buf[i + ch] = lerp(buf[i + ch] ?? 0, STREAK[ch] ?? 0, STREAK_ALPHA);
    }
  }
}

/** Variant tone curve (§9.1): cam-A identity with a soft knee above 230; cam-B ×1.12, clipped. */
export function toneCurve(variant: Variant, v: number): number {
  if (variant === "cam-B") return Math.min(255, 1.12 * v);
  if (v <= 230) return v;
  return 230 + 22 * (1 - Math.exp(-(v - 230) / 22));
}

/** Bounding box of the watermark for a frame size and text (also used by tests, G-T5). */
export function watermarkLayout(w: number, h: number, lines: readonly [string, string]): {
  readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly scale1: number; readonly scale2: number;
} {
  const maxW = w - 2 * WATERMARK_MARGIN - 2 * WATERMARK_PAD;
  const scale1 = textWidth(lines[0], 3) <= maxW ? 3 : textWidth(lines[0], 2) <= maxW ? 2 : 1;
  const scale2 = 2;
  const width = Math.max(textWidth(lines[0], scale1), textWidth(lines[1], scale2)) + 2 * WATERMARK_PAD;
  const height = GLYPH_H * scale1 + GLYPH_H * scale2 + 3 * WATERMARK_PAD;
  return { x: WATERMARK_MARGIN, y: h - WATERMARK_MARGIN - height, width, height, scale1, scale2 };
}

function drawWatermark(out: Uint8ClampedArray, w: number, h: number, lines: readonly [string, string]): void {
  const box = watermarkLayout(w, h, lines);
  for (let y = box.y; y < box.y + box.height; y++) {
    for (let x = box.x; x < box.x + box.width; x++) {
      const i = (y * w + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = WATERMARK_BOX_LUMA;
    }
  }
  const plot = (x: number, y: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = (y * w + x) * 4;
    out[i] = out[i + 1] = out[i + 2] = WATERMARK_TEXT_LUMA;
  };
  const x0 = box.x + WATERMARK_PAD;
  const y1 = box.y + WATERMARK_PAD;
  forEachTextPixel(lines[0], x0, y1, box.scale1, plot);
  forEachTextPixel(lines[1], x0, y1 + GLYPH_H * box.scale1 + WATERMARK_PAD, box.scale2, plot);
  // Soften the box and a 2 px rim around it (also smooths the box border against dark scenes).
  const rx = Math.max(0, box.x - 2);
  const ry = Math.max(0, box.y - 2);
  softenRegion(out, w, rx, ry, Math.min(w, box.x + box.width + 2) - rx, Math.min(h, box.y + box.height + 2) - ry);
}

/**
 * One 3x3 box-blur pass over a rectangle's interior (integer, round half up). It softens
 * the glyph edges so the text adds little Laplacian variance (keeps `blur-rain` reachable).
 */
function softenRegion(out: Uint8ClampedArray, w: number, x0: number, y0: number, bw: number, bh: number): void {
  const copy = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) copy[y * bw + x] = out[((y0 + y) * w + x0 + x) * 4] ?? 0;
  for (let y = 1; y < bh - 1; y++) {
    for (let x = 1; x < bw - 1; x++) {
      let acc = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) acc += copy[(y + dy) * bw + x + dx] ?? 0;
      const i = ((y0 + y) * w + x0 + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = Math.floor((acc + 4) / 9);
    }
  }
}

/** Renders one synthetic frame as RGBA (alpha 255). */
export function renderFrame(input: FrameRenderInput): Uint8ClampedArray {
  const { width: w, height: h, condition } = input;
  const buf = new Float32Array(w * h * 3);
  drawBase(buf, input);
  if (input.sun !== null) drawSun(buf, w, h, input.sun);
  if (condition === "rain" || condition === "night-rain") applyRain(buf, w, h, input.rng);
  const gain = condition === "night" || condition === "night-rain" ? NIGHT_GAIN : 1;
  // Night (dry) gets high-gain sensor noise, so its lapVar does not hinge on the watermark and
  // the blur-rain rule (lapVar < 60) stays off. Deviation: not listed in §9.2.
  const noise = condition === "night" ? input.rng.fork("sensor-noise") : null;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const n = noise === null ? 0 : (noise.uniform() * 2 - 1) * NIGHT_SENSOR_NOISE;
    for (let ch = 0; ch < 3; ch++) out[i * 4 + ch] = Math.round(toneCurve(input.variant, gain * (buf[i * 3 + ch] ?? 0) + n));
    out[i * 4 + 3] = 255;
  }
  drawWatermark(out, w, h, input.watermark);
  return out;
}
