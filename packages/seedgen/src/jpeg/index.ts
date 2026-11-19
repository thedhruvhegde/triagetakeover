/**
 * jpeg-js encode wrapper and COM-segment splice (SEED_DATA §9.1, §9.3).
 * The COM segment is spliced by hand right after SOI so we do not rely on an encoder option.
 */
import jpeg from "jpeg-js";
import { GENERATOR_VERSION } from "../plan/profile.js";
import { asciiEncode, concatBytes } from "../util/utf8.js";

/** Encodes RGBA pixels as a baseline JPEG and returns a plain Uint8Array copy. */
export function encodeJpeg(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, quality: number): Uint8Array {
  const out = jpeg.encode({ width, height, data: rgba }, quality);
  const data: ArrayLike<number> = out.data;
  return Uint8Array.from(data);
}

/** COM payload text for a frame. */
export function comText(seed: number, eventId: string): string {
  return `SYNTHETIC; generator=takeover-triage-seedgen/${GENERATOR_VERSION}; seed=${seed}; event=${eventId}`;
}

/** Inserts a COM (FFFE) segment right after SOI. Throws if `jpegBytes` does not start with SOI or the text is too long. */
export function spliceComSegment(jpegBytes: Uint8Array, text: string): Uint8Array {
  if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) throw new RangeError("not a JPEG (missing SOI)");
  const payload = asciiEncode(text);
  const len = payload.length + 2;
  if (len > 0xffff) throw new RangeError("COM payload too long");
  const header = Uint8Array.of(0xff, 0xfe, len >> 8, len & 0xff);
  return concatBytes([jpegBytes.subarray(0, 2), header, payload, jpegBytes.subarray(2)]);
}

/** Reads every COM segment before the first SOS (used by the watermark test, G-T5). */
export function readComSegments(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let i = 2;
  while (i + 3 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xda || marker === 0xd9) break;
    const len = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    if (marker === 0xfe) out.push(String.fromCharCode(...bytes.subarray(i + 4, i + 2 + len)));
    i += 2 + len;
  }
  return out;
}
