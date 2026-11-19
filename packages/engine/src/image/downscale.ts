/**
 * Deterministic integer box-filter downscale (ARCHITECTURE §5.5 step 2).
 *
 * The integer factor is f = ceil(longSide / maxSide). Each output pixel is the area average of an
 * f×f source block, using integer accumulators and round-half-up. Blocks on the right and bottom
 * edges may be partial; they average over the pixels they contain, so no source pixel is dropped.
 * No floating-point arithmetic touches pixel values, so output is identical on every engine.
 */
import { DOWNSCALE_MAX_SIDE, ok, type Result } from "../schema/index.js";
import { checkRaster, type RgbaImage } from "./raster.js";

/** Integer reduction factor so that the long side becomes ≤ `maxSide` (1 if already small). */
export function downscaleFactor(width: number, height: number, maxSide: number = DOWNSCALE_MAX_SIDE): number {
  return Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
}

/** Round-half-up of `sum / count` for non-negative integers. */
function roundDiv(sum: number, count: number): number {
  return Math.floor((2 * sum + count) / (2 * count));
}

/** Box-filters an RGBA raster by integer factor `f` (all four channels). */
export function boxDownscale(img: RgbaImage, f: number): RgbaImage {
  const { width: w, height: h, data: src } = img;
  const ow = Math.ceil(w / f);
  const oh = Math.ceil(h / f);
  const out = new Uint8Array(ow * oh * 4);
  const acc = new Float64Array(ow * 4); // holds integers < 2^53
  for (let oy = 0; oy < oh; oy++) {
    acc.fill(0);
    const y0 = oy * f;
    const y1 = Math.min(h, y0 + f);
    for (let y = y0; y < y1; y++) {
      let p = y * w * 4;
      for (let x = 0; x < w; x++, p += 4) {
        const a = ((x / f) | 0) * 4;
        acc[a] = (acc[a] as number) + (src[p] as number);
        acc[a + 1] = (acc[a + 1] as number) + (src[p + 1] as number);
        acc[a + 2] = (acc[a + 2] as number) + (src[p + 2] as number);
        acc[a + 3] = (acc[a + 3] as number) + (src[p + 3] as number);
      }
    }
    const rows = y1 - y0;
    for (let ox = 0; ox < ow; ox++) {
      const count = rows * (Math.min(w, ox * f + f) - ox * f);
      const a = ox * 4;
      const q = (oy * ow + ox) * 4;
      for (let c = 0; c < 4; c++) out[q + c] = roundDiv(acc[a + c] as number, count);
    }
  }
  return { width: ow, height: oh, data: out };
}

/**
 * Downscales so the long side is ≤ `maxSide` (default 640). Images already small enough are
 * returned unchanged (same object). Fails with E_IMAGE_INVALID on a malformed raster.
 */
export function downscale(img: RgbaImage, maxSide: number = DOWNSCALE_MAX_SIDE): Result<RgbaImage> {
  const checked = checkRaster(img, 4);
  if (!checked.ok) return checked;
  const f = downscaleFactor(img.width, img.height, maxSide);
  return ok(f === 1 ? img : boxDownscale(img, f));
}
