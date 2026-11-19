/**
 * Canonical channels and CSV schema constants (ARCHITECTURE §5.1, §5.2, §5.6).
 */

/** Every canonical channel name, in the order of the §5.1 table. */
export const CANONICAL_CHANNELS = [
  "t",
  "speed",
  "yaw_rate",
  "lane_offset",
  "steer_torque",
  "brake",
  "ttc",
  "lane_conf",
  "takeover",
  "takeover_time",
] as const;
export type CanonicalChannel = (typeof CANONICAL_CHANNELS)[number];

/**
 * Channels that are sampled over time and resampled into the 10 Hz window
 * (everything except the time base `t` and the single-valued `takeover_time`).
 * These are the 8 channels the telemetry codec stores (§5.6).
 */
export const SIGNAL_CHANNELS = [
  "speed",
  "yaw_rate",
  "lane_offset",
  "steer_torque",
  "brake",
  "ttc",
  "lane_conf",
  "takeover",
] as const;
export type SignalChannel = (typeof SIGNAL_CHANNELS)[number];

/** A unit multiplier offered in the mapping UI. `factor` multiplies the raw value. */
export interface UnitMultiplier {
  /** Human label, e.g. "km/h → m/s". */
  readonly label: string;
  readonly factor: number;
}

/** Static description of one canonical channel. */
export interface ChannelSpec {
  readonly name: CanonicalChannel;
  /** Engineering unit after mapping (`"s"`, `"m/s"`, `"0..1"`, ...). */
  readonly unit: string;
  readonly required: boolean;
  /** Header synonyms, already normalised with {@link normalizeHeader}. */
  readonly synonyms: readonly string[];
  /** Synonyms whose values must be inverted (e.g. `ad_active` for `takeover`). */
  readonly invertedSynonyms: readonly string[];
  readonly multipliers: readonly UnitMultiplier[];
}

/**
 * Normalises a CSV header for synonym matching: lower-case, with `_`, `-` and
 * whitespace removed (§5.1 "case-insensitive, `[_\s-]` ignored"). Also strips a BOM.
 */
export function normalizeHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").toLowerCase().replace(/[_\s-]/g, "");
}

const spec = (
  name: CanonicalChannel,
  unit: string,
  synonyms: readonly string[],
  multipliers: readonly UnitMultiplier[] = [],
  invertedSynonyms: readonly string[] = [],
): ChannelSpec => ({
  name,
  unit,
  required: name === "t",
  synonyms: synonyms.map(normalizeHeader),
  invertedSynonyms: invertedSynonyms.map(normalizeHeader),
  multipliers,
});

/**
 * The §5.1 table. ISO-8601 time parsing is a parser concern, not a multiplier, and is
 * therefore not listed here.
 */
export const CHANNEL_SPECS: Readonly<Record<CanonicalChannel, ChannelSpec>> = {
  t: spec("t", "s", ["time", "timestamp", "t_s", "ts", "time_ms", "t"], [
    { label: "ms → s", factor: 0.001 },
    { label: "µs → s", factor: 1e-6 },
  ]),
  speed: spec("speed", "m/s", ["speed", "v", "vel", "ego_speed", "speed_kph"], [
    { label: "km/h → m/s", factor: 1 / 3.6 },
    { label: "mph → m/s", factor: 0.44704 },
  ]),
  yaw_rate: spec("yaw_rate", "rad/s", ["yaw_rate", "yawrate", "r", "yaw_rate_deg"], [
    { label: "deg/s → rad/s", factor: Math.PI / 180 },
  ]),
  lane_offset: spec("lane_offset", "m", ["lane_offset", "lateral_offset", "lat_err", "d_lat", "offset_cm"], [
    { label: "cm → m", factor: 0.01 },
  ]),
  steer_torque: spec("steer_torque", "Nm", ["steer_torque", "steering_torque", "torque", "drv_torque"]),
  brake: spec("brake", "0..1 or bar", ["brake", "brake_pedal", "brake_pressure"], [{ label: "% → 0..1", factor: 0.01 }]),
  ttc: spec("ttc", "s", ["ttc", "time_to_collision"], [{ label: "ms → s", factor: 0.001 }]),
  lane_conf: spec("lane_conf", "0..1", ["lane_conf", "lane_quality", "lane_confidence"], [{ label: "% → 0..1", factor: 0.01 }]),
  takeover: spec("takeover", "flag 0/1", ["takeover", "disengage", "driver_override"], [], ["ad_active"]),
  takeover_time: spec("takeover_time", "s", []),
};

/**
 * Suggests the canonical channel for a raw CSV header, or null. `inverted` is true for
 * synonyms like `ad_active` whose truth value is the opposite of `takeover`.
 */
export function matchHeader(header: string): { readonly channel: CanonicalChannel; readonly inverted: boolean } | null {
  const h = normalizeHeader(header);
  for (const name of CANONICAL_CHANNELS) {
    const s = CHANNEL_SPECS[name];
    if (s.synonyms.includes(h)) return { channel: name, inverted: false };
    if (s.invertedSynonyms.includes(h)) return { channel: name, inverted: true };
  }
  return null;
}

/** At least one of these must be mapped, or the type becomes `unknown` (§5.1 footnote). */
export const TYPE_DECIDING_CHANNELS = ["lane_offset", "ttc", "brake"] as const satisfies readonly SignalChannel[];

/** Unit of the `brake` channel: normalised pedal (0..1) or pressure in bar. */
export const BRAKE_UNITS = ["ratio", "bar"] as const;
export type BrakeUnit = (typeof BRAKE_UNITS)[number];

// ---- CSV parsing limits (§5.1 "Parsing") ----

/** Candidate delimiters, in detection preference order. */
export const CSV_DELIMITERS = [",", ";", "\t", "|"] as const;
export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];
/** Number of leading (non-comment) lines used for delimiter detection. */
export const CSV_SNIFF_LINES = 5;
/** Leading lines starting with this are comments (SEED_DATA §8.1 `# SYNTHETIC …`). */
export const CSV_COMMENT_PREFIX = "#";
/** Decimal comma is accepted only with this delimiter. */
export const CSV_DECIMAL_COMMA_DELIMITER: CsvDelimiter = ";";
export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 200_000;
export const CSV_MAX_COLUMNS = 64;

// ---- Window and resampling (§5.2) ----

export const WINDOW_HZ = 10;
/** Seconds before takeover covered by the window. */
export const WINDOW_PRE_S = 15;
/** Seconds after takeover covered by the window. */
export const WINDOW_POST_S = 5;
/** Number of samples, 201. */
export const WINDOW_N = (WINDOW_PRE_S + WINDOW_POST_S) * WINDOW_HZ + 1;
/** Sample index of t = 0, 150. */
export const WINDOW_ZERO_INDEX = WINDOW_PRE_S * WINDOW_HZ;
/** Raw gaps longer than this (s) mask the affected output samples. */
export const RESAMPLE_MAX_GAP_S = 0.5;
/** A channel with less valid coverage than this in the window is `unusable`. */
export const MIN_CHANNEL_COVERAGE = 0.8;

/** Time in seconds of window sample `k` (integer arithmetic, no drift). */
export function windowTime(k: number): number {
  return (k - WINDOW_ZERO_INDEX) / WINDOW_HZ;
}

// ---- Telemetry codec defaults (§5.6) ----

/** Per-channel quantisation `{s: scale, o: offset}`; value = int16 · s + o. */
export interface CodecChannelDefault {
  readonly s: number;
  readonly o: number;
}

/**
 * §5.6 defaults. `takeover` is not listed in the spec; it is a 0/1 flag, so `s = 1`
 * is the simplest lossless choice.
 */
export const CODEC_DEFAULTS: Readonly<Record<SignalChannel, CodecChannelDefault>> = {
  lane_offset: { s: 0.001, o: 0 },
  yaw_rate: { s: 0.0001, o: 0 },
  steer_torque: { s: 0.01, o: 0 },
  speed: { s: 0.01, o: 0 },
  brake: { s: 0.001, o: 0 },
  ttc: { s: 0.01, o: 0 },
  lane_conf: { s: 0.001, o: 0 },
  takeover: { s: 1, o: 0 },
};
/** Upper clamp applied to `ttc` before encoding. */
export const CODEC_TTC_MAX_S = 10;
/** int16 sentinel meaning NaN or masked. */
export const CODEC_NAN_SENTINEL = -32768;
