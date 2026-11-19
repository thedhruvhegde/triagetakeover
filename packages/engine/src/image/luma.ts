/**
 * Integer BT.601 luma (ARCHITECTURE §5.5 step 3): Y = (77R + 150G + 29B + 128) >> 8.
 */
import { ok, type Result } from "../schema/index.js";
import { checkRaster, type LumaImage, type RgbaImage } from "./raster.js";

/** Luma of one pixel, 0..255. Alpha is ignored. */
export function lumaOf(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b + 128) >> 8;
}

/** Converts an RGBA raster to luma. Fails with E_IMAGE_INVALID on a malformed raster. */
export function toLuma(img: RgbaImage): Result<LumaImage> {
  const checked = checkRaster(img, 4);
  if (!checked.ok) return checked;
  const n = img.width * img.height;
  const src = img.data;
  const out = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = lumaOf(src[p] as number, src[p + 1] as number, src[p + 2] as number);
  }
  return ok({ width: img.width, height: img.height, data: out });
}
