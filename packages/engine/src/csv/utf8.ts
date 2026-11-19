/**
 * Pure UTF-8 encode/decode (the engine's lib has no TextEncoder/TextDecoder).
 */

/** Decodes UTF-8 bytes. Invalid sequences become U+FFFD. */
export function decodeUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let codes: number[] = [];
  const n = bytes.length;
  let i = 0;
  const flush = (): void => {
    parts.push(String.fromCharCode(...codes));
    codes = [];
  };
  while (i < n) {
    const b0 = bytes[i] as number;
    let cp = 0xfffd;
    let len = 1;
    if (b0 < 0x80) {
      cp = b0;
    } else if (b0 >= 0xc2 && b0 < 0xe0) {
      len = 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      len = 3;
    } else if (b0 >= 0xf0 && b0 < 0xf5) {
      len = 4;
    }
    if (len > 1) {
      cp = decodeMultiByte(bytes, i, len);
      if (cp < 0) {
        cp = 0xfffd;
        len = 1;
      }
    }
    if (cp > 0xffff) {
      const c = cp - 0x10000;
      codes.push(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else {
      codes.push(cp);
    }
    i += len;
    if (codes.length >= 8192) flush();
  }
  flush();
  return parts.join("");
}

/** Returns the code point of a `len`-byte sequence at `i`, or -1 when invalid. */
function decodeMultiByte(bytes: Uint8Array, i: number, len: number): number {
  if (i + len > bytes.length) return -1;
  const b0 = bytes[i] as number;
  let cp = b0 & (len === 2 ? 0x1f : len === 3 ? 0x0f : 0x07);
  for (let j = 1; j < len; j++) {
    const b = bytes[i + j] as number;
    if ((b & 0xc0) !== 0x80) return -1;
    cp = (cp << 6) | (b & 0x3f);
  }
  const min = len === 2 ? 0x80 : len === 3 ? 0x800 : 0x10000;
  if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return -1;
  return cp;
}

/** Encodes a string as UTF-8. Lone surrogates become U+FFFD. */
export function encodeUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        cp = 0xfffd;
      }
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}
