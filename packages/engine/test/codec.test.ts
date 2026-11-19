import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  base64Decode,
  base64Encode,
  codecChannel,
  decodeTelemetry,
  decodeTelemetryValues,
  dequantise,
  encodeTelemetry,
  quantise,
  quantiseWindow,
} from "../src/codec/index.js";
import { channelWindow, type SignalWindow } from "../src/resample/index.js";
import { computeFeatures } from "../src/signal/index.js";
import {
  CODEC_NAN_SENTINEL,
  SIGNAL_CHANNELS,
  WINDOW_N,
  base64Length,
  type SignalChannel,
} from "../src/schema/index.js";

function must<T>(x: T | undefined | null): T {
  if (x === undefined || x === null) throw new Error("missing value");
  return x;
}

const RANGES: Record<SignalChannel, [number, number]> = {
  speed: [0, 80],
  yaw_rate: [-2, 2],
  lane_offset: [-5, 5],
  steer_torque: [-50, 50],
  brake: [0, 1],
  ttc: [0, 10],
  lane_conf: [0, 1],
  takeover: [0, 1],
};

const sampleFor = (c: SignalChannel) =>
  fc.oneof({ weight: 9, arbitrary: fc.double({ min: RANGES[c][0], max: RANGES[c][1], noNaN: true }) }, { weight: 1, arbitrary: fc.constant(NaN) });
const windowArb = fc
  .subarray([...SIGNAL_CHANNELS], { minLength: 1 })
  .chain((chs) =>
    fc.tuple(...chs.map((c) => fc.array(sampleFor(c), { minLength: WINDOW_N, maxLength: WINDOW_N }))).map((arrs) => {
      const w: { [K in SignalChannel]?: ReturnType<typeof channelWindow> } = {};
      chs.forEach((c, i) => (w[c] = channelWindow(c === "takeover" ? must(arrs[i]).map((v) => (Number.isNaN(v) ? v : Math.round(v))) : must(arrs[i]))));
      return w as SignalWindow;
    }),
  );

describe("codec: base64", () => {
  it("matches RFC 4648 vectors", () => {
    const enc = (s: string) => base64Encode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
    expect(["", "f", "fo", "foo", "foob", "fooba", "foobar"].map(enc)).toEqual(["", "Zg==", "Zm8=", "Zm9v", "Zm9vYg==", "Zm9vYmE=", "Zm9vYmFy"]);
    expect(base64Decode("Zm9vYg==")).toEqual(Uint8Array.from([102, 111, 111, 98]));
  });
  it("rejects invalid text", () => {
    for (const bad of ["Zg=", "Z===", "Zm9v!A==", "=Zm9"]) expect(base64Decode(bad)).toBeNull();
  });
  it("round-trips bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 300 }), (b) => {
      expect(base64Decode(base64Encode(b))).toEqual(b);
    }));
  });
});

describe("codec: quantisation", () => {
  it("uses the sentinel for NaN, clamps ttc to 10 and saturates", () => {
    const c = codecChannel("ttc");
    expect(quantise(NaN, "ttc", c)).toBe(CODEC_NAN_SENTINEL);
    expect(quantise(Infinity, "speed", codecChannel("speed"))).toBe(CODEC_NAN_SENTINEL);
    expect(quantise(25, "ttc", c)).toBe(1000);
    expect(quantise(1e9, "speed", codecChannel("speed"))).toBe(32767);
    expect(quantise(-1e9, "speed", codecChannel("speed"))).toBe(-32767);
    expect(dequantise(CODEC_NAN_SENTINEL, c)).toBeNaN();
    expect(codecChannel("brake", "bar")).toEqual({ s: 0.01, o: 0 });
    expect(codecChannel("brake")).toEqual({ s: 0.001, o: 0 });
  });
});

describe("codec: telemetry block", () => {
  const full: SignalWindow = Object.fromEntries(SIGNAL_CHANNELS.map((c) => [c, channelWindow(Array.from({ length: WINDOW_N }, (_, k) => (k % 7) * 0.01))]));

  it("8 channels × 201 samples = 4,288 base64 chars, matching the schema", () => {
    const tel = encodeTelemetry(full);
    expect(tel.data).toHaveLength(4288);
    expect(tel.data).toHaveLength(base64Length(WINDOW_N * 8 * 2));
    expect(tel).toMatchObject({ hz: 10, tStart: -15, n: 201 });
    expect(tel.ch.map((c) => c.k)).toEqual([...SIGNAL_CHANNELS]);
  });

  it("stores only mapped channels, in canonical order, little-endian", () => {
    const tel = encodeTelemetry({ ttc: channelWindow(Array(WINDOW_N).fill(2.56)), speed: channelWindow(Array(WINDOW_N).fill(NaN)) });
    expect(tel.ch).toEqual([{ k: "speed", s: 0.01, o: 0 }, { k: "ttc", s: 0.01, o: 0 }]);
    const bytes = must(base64Decode(tel.data));
    expect([bytes[0], bytes[1]]).toEqual([0x00, 0x80]); // −32768
    const off = WINDOW_N * 2;
    expect([bytes[off], bytes[off + 1]]).toEqual([0x00, 0x01]); // 256
  });

  it("rejects malformed data", () => {
    const tel = encodeTelemetry(full);
    expect(decodeTelemetryValues({ ...tel, data: tel.data.slice(4) }).ok).toBe(false);
    const r = decodeTelemetry({ ...tel, data: "!!!!" });
    expect(!r.ok && r.error[0]?.code).toBe("E_TELEMETRY_DECODE");
  });
});

describe("codec: properties", () => {
  it("|decode(encode(x)) − x| ≤ s/2 (ttc clamped at 10), NaN preserved", () => {
    fc.assert(
      fc.property(windowArb, fc.constantFrom("ratio" as const, "bar" as const), (w, unit) => {
        const tel = encodeTelemetry(w, unit);
        const dec = decodeTelemetryValues(tel);
        if (!dec.ok) throw new Error("decode failed");
        for (const c of tel.ch) {
          const xs = must(w[c.k]).values;
          const ys = must(dec.value[c.k]);
          xs.forEach((x, i) => {
            const y = ys[i] as number;
            if (Number.isNaN(x)) return expect(y).toBeNaN();
            const target = c.k === "ttc" ? Math.min(x, 10) : x;
            expect(Math.abs(y - target)).toBeLessThanOrEqual(c.s / 2 + 1e-12 * Math.max(1, Math.abs(target)));
          });
        }
      }),
      { numRuns: 300 },
    );
  });

  it("encoding is idempotent on decoded data and decode preserves coverage", () => {
    fc.assert(
      fc.property(windowArb, (w) => {
        const a = quantiseWindow(w);
        const b = quantiseWindow(a.window);
        expect(b.tel.data).toBe(a.tel.data);
        for (const c of SIGNAL_CHANNELS) expect(a.window[c]?.valid).toBe(w[c]?.valid);
      }),
      { numRuns: 200 },
    );
  });

  it("features from decoded telemetry are bit-identical on client and server", () => {
    fc.assert(
      fc.property(windowArb, (w) => {
        const client = quantiseWindow(w);
        const serialized = JSON.parse(JSON.stringify(client.tel)) as typeof client.tel;
        const server = decodeTelemetry(serialized);
        if (!server.ok) throw new Error("decode failed");
        const fc1 = computeFeatures(client.window);
        const fc2 = computeFeatures(server.value);
        expect(Object.keys(fc2.features)).toEqual(Object.keys(fc1.features));
        for (const [k, v] of Object.entries(fc1.features)) expect(Object.is(v, fc2.features[k as keyof typeof fc2.features])).toBe(true);
        expect(fc2.flags).toEqual(fc1.flags);
      }),
      { numRuns: 200 },
    );
  });
});
