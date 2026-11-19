/**
 * JPEG decoding via jpeg-js (ARCHITECTURE §5.5 step 1). Decode only; never throws.
 *
 * Before handing bytes to jpeg-js, the frame header is read directly so that non-JPEG input,
 * CMYK/YCCK (4-component) files and oversized frames are rejected cheaply and with a clear code.
 */
import jpeg from "jpeg-js";
import { ok, type Result } from "../schema/index.js";
import { imageError, type RgbaImage } from "./raster.js";

/** Default pixel limit per frame (50 MP covers 8K dashcams; 1080p is 2 MP). */
export const JPEG_MAX_PIXELS = 50_000_000;
/** Memory cap passed to jpeg-js, in MB. */
export const JPEG_MAX_MEMORY_MB = 512;

/** Dimensions and component count from a JPEG SOFn header. */
export interface JpegHeader {
  readonly width: number;
  readonly height: number;
  readonly components: number;
  /** True for progressive (SOF2/SOF6/SOF10/SOF14) frames. */
  readonly progressive: boolean;
}

export interface DecodeJpegOptions {
  /** Reject frames with more pixels than this (default {@link JPEG_MAX_PIXELS}). */
  readonly maxPixels?: number;
}

/** True for SOFn markers (C0..CF except DHT C4, JPG C8 and DAC CC). */
function isSofMarker(m: number): boolean {
  return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

/** Markers without a length field: TEM and RST0..RST7. */
function isStandalone(m: number): boolean {
  return m === 0x01 || (m >= 0xd0 && m <= 0xd7);
}

/**
 * Reads the frame header by walking marker segments from SOI until the first SOFn.
 * Fails if the bytes do not start with FFD8, the segment chain is broken, or SOS/EOI comes first.
 */
export function readJpegHeader(bytes: Uint8Array): Result<JpegHeader> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return imageError("E_IMAGE_NOT_JPEG", "data does not start with the JPEG SOI marker FFD8");
  }
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return imageError("E_IMAGE_DECODE", `expected a marker at byte ${i}`);
    let m = bytes[i + 1] ?? 0;
    i += 2;
    while (m === 0xff && i < bytes.length) m = bytes[i++] ?? 0; // fill bytes
    if (isStandalone(m)) continue;
    if (m === 0xd9 || m === 0xda) break; // EOI or SOS before any frame header
    const len = ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    if (len < 2 || i + len > bytes.length) return imageError("E_IMAGE_DECODE", `truncated segment at byte ${i - 2}`);
    if (isSofMarker(m)) {
      if (len < 8) return imageError("E_IMAGE_DECODE", "truncated frame header");
      const height = ((bytes[i + 3] ?? 0) << 8) | (bytes[i + 4] ?? 0);
      const width = ((bytes[i + 5] ?? 0) << 8) | (bytes[i + 6] ?? 0);
      const components = bytes[i + 7] ?? 0;
      const progressive = m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce;
      return ok({ width, height, components, progressive });
    }
    i += len;
  }
  return imageError("E_IMAGE_DECODE", "no frame header (SOFn) found");
}

/**
 * Decodes a baseline or progressive JPEG to RGBA with jpeg-js (`useTArray`, so no Node `Buffer`).
 * Errors: E_IMAGE_NOT_JPEG, E_IMAGE_CMYK, E_IMAGE_TOO_LARGE, E_IMAGE_DECODE.
 */
export function decodeJpeg(bytes: Uint8Array, opts: DecodeJpegOptions = {}): Result<RgbaImage> {
  const header = readJpegHeader(bytes);
  if (!header.ok) return header;
  const { width, height, components } = header.value;
  if (components === 4) return imageError("E_IMAGE_CMYK", "CMYK/YCCK JPEGs are not supported");
  if (components !== 1 && components !== 3) {
    return imageError("E_IMAGE_DECODE", `unsupported component count ${components}`);
  }
  if (width === 0 || height === 0) return imageError("E_IMAGE_DECODE", "frame header has a zero dimension");
  const maxPixels = opts.maxPixels ?? JPEG_MAX_PIXELS;
  if (width * height > maxPixels) {
    return imageError("E_IMAGE_TOO_LARGE", `${width}x${height} exceeds the ${maxPixels}-pixel limit`);
  }
  try {
    const out = jpeg.decode(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: Math.ceil(maxPixels / 1_000_000),
      maxMemoryUsageInMB: JPEG_MAX_MEMORY_MB,
    });
    if (out.width !== width || out.height !== height || out.data.length !== width * height * 4) {
      return imageError("E_IMAGE_DECODE", "decoded raster does not match the frame header");
    }
    return ok({ width: out.width, height: out.height, data: out.data });
  } catch (e) {
    return imageError("E_IMAGE_DECODE", e instanceof Error ? e.message : String(e));
  }
}
