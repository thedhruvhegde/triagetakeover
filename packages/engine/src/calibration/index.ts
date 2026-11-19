/**
 * Calibration-age chip (ARCHITECTURE §5.12, PRD US-23; optional, informational only).
 *
 * Dates are parsed by hand (no `Date`, which the engine must not use): ISO-8601 calendar
 * dates `YYYY-MM-DD`, optionally with `THH:MM[:SS[.fff]]` and `Z` or `±HH:MM`. A date
 * without a zone is taken as UTC midnight / UTC time.
 */
import { daysFromCivil } from "../mapping/iso.js";

/** Default staleness window in days. */
export const DEFAULT_CALIBRATION_WINDOW_DAYS = 30;
/** Board flag text for a cluster whose members all have stale calibration. */
export const CALIBRATION_FLAG_TEXT = "check calibration first";

const SECONDS_PER_DAY = 86_400;
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function zoneOffsetSeconds(z: string | undefined): number {
  if (z === undefined || z === "Z") return 0;
  const sign = z.startsWith("-") ? -1 : 1;
  const digits = z.slice(1).replace(":", "");
  return sign * (Number(digits.slice(0, 2)) * 3600 + Number(digits.slice(2, 4)) * 60);
}

/** Parses an ISO-8601 date or timestamp to whole seconds since the Unix epoch, or null. */
export function parseCalendarSeconds(s: string): number | null {
  const m = ISO.exec(s.trim());
  if (m === null) return null;
  const [y, mo, d, h, mi, se] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number) as [number, number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || mi > 59 || se > 59) return null;
  return daysFromCivil(y, mo, d) * SECONDS_PER_DAY + h * 3600 + mi * 60 + se - zoneOffsetSeconds(m[7]);
}

export interface CalibrationAge {
  /** Whole days from calibration to the event (negative if calibrated after the event). */
  readonly days: number;
  /** days > window. */
  readonly stale: boolean;
  /** `calibration <n> days old` when stale, else null. */
  readonly chip: string | null;
}

/**
 * Calibration age of a sensor at the event time. Returns null when the sensor has no
 * calibration date or either date does not parse.
 */
export function calibrationAge(eventAt: string, calibratedAt: string | undefined, windowDays: number = DEFAULT_CALIBRATION_WINDOW_DAYS): CalibrationAge | null {
  if (calibratedAt === undefined) return null;
  const e = parseCalendarSeconds(eventAt);
  const c = parseCalendarSeconds(calibratedAt);
  if (e === null || c === null) return null;
  const days = Math.floor((e - c) / SECONDS_PER_DAY);
  const stale = days > windowDays;
  return { days, stale, chip: stale ? `calibration ${days} days old` : null };
}

/**
 * Board flag (§5.12): true when the cluster has members and every member's vehicle has stale
 * calibration at its event time. A member with unknown age (null) prevents the flag.
 */
export function needsCalibrationCheck(memberAges: readonly (CalibrationAge | null)[]): boolean {
  return memberAges.length > 0 && memberAges.every((a) => a !== null && a.stale);
}
