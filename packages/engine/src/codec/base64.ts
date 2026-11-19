/**
 * Standard base64 (RFC 4648, with padding), pure TS.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Map<string, number>(Array.from(ALPHABET, (c, i) => [c, i] as const));

/** Encodes bytes as padded base64. */
export function base64Encode(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out.push(
      ALPHABET[(n >> 18) & 63] as string,
      ALPHABET[(n >> 12) & 63] as string,
      b1 === undefined ? "=" : (ALPHABET[(n >> 6) & 63] as string),
      b2 === undefined ? "=" : (ALPHABET[n & 63] as string),
    );
  }
  return out.join("");
}

/** Decodes padded base64; null when the text is not valid base64. */
export function base64Decode(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  const pad = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let j = 0; j < 4; j++) {
      const c = text[i + j] as string;
      const isPad = c === "=" && i + 4 === text.length && j >= 4 - pad;
      const v = isPad ? 0 : LOOKUP.get(c);
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    const bytes = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (const b of bytes) if (o < out.length) out[o++] = b;
  }
  return out;
}
