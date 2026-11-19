/**
 * int16 quantise + base64 telemetry codec (ARCHITECTURE §5.6).
 *
 * Layout: channel-major, little-endian int16, `value = q · s + o`, with −32768 meaning
 * NaN or masked. Channels are stored in {@link SIGNAL_CHANNELS} order.
 */
import {
  CODEC_DEFAULTS,
  CODEC_NAN_SENTINEL,
  CODEC_TTC_MAX_S,
  SIGNAL_CHANNELS,
  WINDOW_HZ,
  WINDOW_N,
  WINDOW_PRE_S,
  err,
  ok,
  type BrakeUnit,
  type CodecChannelDefault,
  type Result,
  type SignalChannel,
  type TelemetryBlock,
  type TelemetryChannelRef,
} from "../schema/index.js";
import { windowFromValues, type SignalWindow } from "../resample/window.js";
import { base64Decode, base64Encode } from "./base64.js";

/** Largest stored magnitude; −32768 is reserved for NaN. */
export const INT16_MAX = 32767;
/** Brake scale when `brakeUnit = "bar"` (0.001 would saturate at 32.8 bar). */
export const CODEC_BRAKE_BAR_SCALE = 0.01;

/** Quantisation parameters for a channel, honouring the brake unit. */
export function codecChannel(k: SignalChannel, brakeUnit: BrakeUnit = "ratio"): CodecChannelDefault {
  if (k === "brake" && brakeUnit === "bar") return { s: CODEC_BRAKE_BAR_SCALE, o: 0 };
  return CODEC_DEFAULTS[k];
}

/**
 * Quantises one value: NaN/±∞ → −32768; `ttc` clamped to ≤ 10 s first; otherwise
 * `round((v − o)/s)` saturated to [−32767, 32767].
 */
export function quantise(v: number, k: SignalChannel, c: CodecChannelDefault): number {
  if (!Number.isFinite(v)) return CODEC_NAN_SENTINEL;
  const x = k === "ttc" ? Math.min(v, CODEC_TTC_MAX_S) : v;
  const q = Math.round((x - c.o) / c.s);
  return Math.max(-INT16_MAX, Math.min(INT16_MAX, q));
}

/** Inverse of {@link quantise}: −32768 → NaN, else `q · s + o`. */
export function dequantise(q: number, c: CodecChannelDefault): number {
  return q === CODEC_NAN_SENTINEL ? NaN : q * c.s + c.o;
}

/**
 * Encodes a window into the `tel` block. Every mapped channel is stored (in
 * SIGNAL_CHANNELS order); channels shorter than 201 samples are padded with NaN.
 */
export function encodeTelemetry(window: SignalWindow, brakeUnit: BrakeUnit = "ratio"): TelemetryBlock {
  const ch: TelemetryChannelRef[] = SIGNAL_CHANNELS.filter((k) => window[k] !== undefined).map((k) => ({ k, ...codecChannel(k, brakeUnit) }));
  const bytes = new Uint8Array(WINDOW_N * ch.length * 2);
  ch.forEach((c, ci) => {
    const values = window[c.k]?.values ?? [];
    for (let i = 0; i < WINDOW_N; i++) {
      const q = quantise(values[i] ?? NaN, c.k, c) & 0xffff;
      const off = (ci * WINDOW_N + i) * 2;
      bytes[off] = q & 0xff;
      bytes[off + 1] = q >> 8;
    }
  });
  return { hz: WINDOW_HZ, tStart: -WINDOW_PRE_S, n: WINDOW_N, ch, data: base64Encode(bytes) };
}

/** Decoded per-channel sample arrays. */
export type DecodedTelemetry = { readonly [K in SignalChannel]?: readonly number[] };

/** Decodes a `tel` block's sample arrays. Fails with `E_TELEMETRY_DECODE` on bad data. */
export function decodeTelemetryValues(block: TelemetryBlock): Result<DecodedTelemetry> {
  const bytes = base64Decode(block.data);
  const expected = block.n * block.ch.length * 2;
  if (bytes === null || bytes.length !== expected) {
    return err([{ code: "E_TELEMETRY_DECODE", message: `telemetry data is not ${expected} bytes of base64`, path: "tel.data" }]);
  }
  const out: { [K in SignalChannel]?: readonly number[] } = {};
  block.ch.forEach((c, ci) => {
    const vals = new Array<number>(block.n);
    for (let i = 0; i < block.n; i++) {
      const off = (ci * block.n + i) * 2;
      const u = (bytes[off] as number) | ((bytes[off + 1] as number) << 8);
      vals[i] = dequantise(u >= 0x8000 ? u - 0x10000 : u, c);
    }
    out[c.k] = vals;
  });
  return ok(out);
}

/** Decodes a `tel` block into a window with coverage recomputed. */
export function decodeTelemetry(block: TelemetryBlock): Result<SignalWindow> {
  const r = decodeTelemetryValues(block);
  return r.ok ? ok(windowFromValues(r.value)) : r;
}

/**
 * Client path: quantise and decode the window, so that features computed client side
 * and server side run on the same values (§5.6, D2).
 */
export function quantiseWindow(window: SignalWindow, brakeUnit: BrakeUnit = "ratio"): { readonly tel: TelemetryBlock; readonly window: SignalWindow } {
  const tel = encodeTelemetry(window, brakeUnit);
  const decoded = decodeTelemetry(tel);
  return { tel, window: decoded.ok ? decoded.value : {} };
}
