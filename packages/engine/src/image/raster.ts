/**
 * Raster types shared by the image pipeline (ARCHITECTURE §5.5).
 */
import { err, ok, type EngineError, type Result } from "../schema/index.js";

/** Pixel bytes as produced by jpeg-js (`Uint8Array`) or a canvas/renderer (`Uint8ClampedArray`). */
export type PixelBytes = Uint8Array | Uint8ClampedArray;

/** An RGBA raster, row-major, 4 bytes per pixel, no padding. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: PixelBytes;
}

/** A single-channel luma raster, row-major, 1 byte per pixel (0..255). */
export interface LumaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Error codes produced by the image module. */
export type ImageErrorCode =
  | "E_IMAGE_INVALID"
  | "E_IMAGE_NOT_JPEG"
  | "E_IMAGE_CMYK"
  | "E_IMAGE_TOO_LARGE"
  | "E_IMAGE_DECODE"
  | "E_IMAGE_NO_FRAMES";

/** Builds a single-error failure. */
export function imageError(code: ImageErrorCode, message: string): { readonly ok: false; readonly error: readonly EngineError[] } {
  return err([{ code, message }]);
}

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/** Checks that a raster has positive integer dimensions and exactly `w·h·channels` bytes. */
export function checkRaster<T extends { readonly width: number; readonly height: number; readonly data: PixelBytes }>(
  img: T,
  channels: 1 | 4,
): Result<T> {
  if (!isPositiveInt(img.width) || !isPositiveInt(img.height)) {
    return imageError("E_IMAGE_INVALID", `dimensions must be positive integers, got ${img.width}x${img.height}`);
  }
  const expected = img.width * img.height * channels;
  if (img.data.length !== expected) {
    return imageError("E_IMAGE_INVALID", `expected ${expected} bytes for ${img.width}x${img.height}x${channels}, got ${img.data.length}`);
  }
  return ok(img);
}
