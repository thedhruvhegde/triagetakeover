/**
 * TEST inputs for the intake: a hand-written synthetic CSV (lane confidence collapses and the car
 * drifts before a flagged takeover at t = 20 s) and a tiny JPEG encoded with seedgen's encoder.
 * These are test fixtures, not demo data.
 */
import { encodeJpeg } from "@tt/seedgen";

export interface CsvOptions {
  /** Header names, in order: time, speed, lane offset, lane confidence, takeover flag. */
  readonly headers?: readonly [string, string, string, string, string];
  readonly hz?: number;
}

export function laneLossCsv(opts: CsvOptions = {}): string {
  const [ht, hs, ho, hc, hf] = opts.headers ?? ["t", "speed", "lane_offset", "lane_conf", "takeover"];
  const hz = opts.hz ?? 20;
  const lines = [`${ht},${hs},${ho},${hc},${hf}`];
  for (let i = 0; i <= 30 * hz; i++) {
    const t = i / hz;
    const offset = t < 16 ? 0.05 : Math.min(0.9, 0.05 + (t - 16) * 0.25);
    const conf = t < 17 ? 0.92 : 0.2;
    lines.push(`${t.toFixed(3)},25,${offset.toFixed(3)},${conf.toFixed(2)},${t >= 20 ? 1 : 0}`);
  }
  return lines.join("\n") + "\n";
}

/** A 64x36 frame: bright sky band on top, dark road below. */
export function testJpeg(): Uint8Array {
  const w = 64;
  const h = 36;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = y < h / 3 ? 230 : 60 + ((x * 7 + y * 3) % 40);
      const o = (y * w + x) * 4;
      rgba[o] = v;
      rgba[o + 1] = v;
      rgba[o + 2] = v;
      rgba[o + 3] = 255;
    }
  return encodeJpeg(rgba, w, h, 80);
}

export function file(name: string, content: string | Uint8Array, type: string): File {
  const part = typeof content === "string" ? content : (content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer);
  return new File([part], name, { type });
}

export const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
