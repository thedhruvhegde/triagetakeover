/**
 * Strict ISO-8601 timestamp → epoch seconds, without `Date` (engine purity).
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;

/** Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's algorithm). */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

const daysInMonth = (y: number, m: number): number =>
  m === 2 ? (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

/** Parses the UTC offset suffix into seconds (0 for `Z` or none); NaN when invalid. */
function offsetSeconds(tz: string | undefined): number {
  if (tz === undefined || tz === "Z") return 0;
  const sign = tz.startsWith("-") ? -1 : 1;
  const digits = tz.slice(1).replace(":", "");
  const hh = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  return hh > 23 || mm > 59 ? NaN : sign * (hh * 3600 + mm * 60);
}

/**
 * Parses `YYYY-MM-DDTHH:MM:SS[.fff][Z|±HH:MM]` (a space instead of `T` is accepted,
 * no offset means UTC). Returns epoch seconds, or NaN when the text is not a valid
 * timestamp.
 */
export function parseIsoSeconds(text: string): number {
  const m = ISO.exec(text.trim());
  if (m === null) return NaN;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || s > 59) return NaN;
  const frac = m[7] === undefined ? 0 : Number(`0${m[7]}`);
  const off = offsetSeconds(m[8]);
  return daysFromCivil(y, mo, d) * 86400 + h * 3600 + mi * 60 + s + frac - off;
}

/** True when the text looks like an ISO timestamp (used to auto-detect ISO time columns). */
export function isIsoTimestamp(text: string): boolean {
  return !Number.isNaN(parseIsoSeconds(text));
}
