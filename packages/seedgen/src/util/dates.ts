/**
 * Calendar arithmetic without `Date` (SEED_DATA §4.4). Days are counted from 1970-01-01 (UTC)
 * with Howard Hinnant's civil-from-days algorithms; everything is integer arithmetic.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 for a proleptic Gregorian date. */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const mp = (m + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}. */
export function civilFromDays(z0: number): { y: number; m: number; d: number } {
  const z = z0 + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** Parses `YYYY-MM-DD` into a day number; returns null for malformed or impossible dates. */
export function parseIsoDate(s: string): number | null {
  const m = ISO_DATE.exec(s);
  if (m === null) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const day = daysFromCivil(y, mo, d);
  const back = civilFromDays(day);
  return back.y === y && back.m === mo && back.d === d ? day : null;
}

/** Day of week, 0 = Monday … 6 = Sunday. */
export function weekday(day: number): number {
  return (((day + 3) % 7) + 7) % 7;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** Formats a day number as `YYYY-MM-DD`. */
export function formatIsoDate(day: number): string {
  const { y, m, d } = civilFromDays(day);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Formats epoch seconds (UTC, integer part only) as `YYYY-MM-DDTHH:MM:SSZ`. */
export function formatIsoDateTime(epochSeconds: number): string {
  const s = Math.floor(epochSeconds);
  const day = Math.floor(s / 86400);
  const sod = s - day * 86400;
  return `${formatIsoDate(day)}T${pad(Math.floor(sod / 3600))}:${pad(Math.floor((sod % 3600) / 60))}:${pad(sod % 60)}Z`;
}

/** Epoch seconds at `day` + `secondsOfDay`. */
export function epochSeconds(day: number, secondsOfDay: number): number {
  return day * 86400 + secondsOfDay;
}
