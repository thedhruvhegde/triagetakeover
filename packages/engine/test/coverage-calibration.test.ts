import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calibrationAge, needsCalibrationCheck, parseCalendarSeconds } from "../src/calibration/index.js";
import { daysFromCivil } from "../src/mapping/iso.js";

describe("parseCalendarSeconds", () => {
  it("matches known epoch values", () => {
    expect(parseCalendarSeconds("1970-01-01")).toBe(0);
    expect(parseCalendarSeconds("2000-03-01T00:00:00Z")).toBe(951_868_800);
    expect(parseCalendarSeconds("2026-11-14T09:12:33Z")).toBe(1_794_647_553);
    expect(parseCalendarSeconds("2026-11-14T10:12:33+01:00")).toBe(1_794_647_553);
    expect(parseCalendarSeconds("2026-11-14T04:12:33.250-05:00")).toBe(1_794_647_553);
  });

  it("rejects malformed and impossible dates", () => {
    for (const s of ["", "2026-13-01", "2026-02-29", "2026-11-14T24:00", "14/11/2026", "2026-11-14Tfoo"]) expect(parseCalendarSeconds(s)).toBeNull();
    expect(parseCalendarSeconds("2024-02-29")).not.toBeNull();
  });

  it("daysFromCivil is consecutive across months and years (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1900, max: 2200 }), fc.integer({ min: 1, max: 12 }), (y, m) => {
        const next = m === 12 ? daysFromCivil(y + 1, 1, 1) : daysFromCivil(y, m + 1, 1);
        const len = next - daysFromCivil(y, m, 1);
        expect(len).toBeGreaterThanOrEqual(28);
        expect(len).toBeLessThanOrEqual(31);
      }),
    );
  });
});

describe("calibrationAge", () => {
  it("emits the chip only beyond the window (default 30 days)", () => {
    expect(calibrationAge("2026-11-16T12:00:00Z", "2026-10-06")).toEqual({ days: 41, stale: true, chip: "calibration 41 days old" });
    expect(calibrationAge("2026-11-16T12:00:00Z", "2026-10-17")).toEqual({ days: 30, stale: false, chip: null });
    expect(calibrationAge("2026-11-16", "2026-11-10", 5)?.chip).toBe("calibration 6 days old");
    expect(calibrationAge("2026-11-16", undefined)).toBeNull();
    expect(calibrationAge("bad", "2026-11-10")).toBeNull();
  });

  it("age grows with the event date (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 5000 }), (a, b) => {
        const day = (n: number): string => {
          const s = n * 86_400 + 1_700_000_000;
          // Build an ISO date from epoch days by search over daysFromCivil (test-only helper).
          const d = Math.floor(s / 86_400);
          let y = 2023;
          while (daysFromCivil(y + 1, 1, 1) <= d) y++;
          let m = 1;
          while (m < 12 && daysFromCivil(y, m + 1, 1) <= d) m++;
          const dd = d - daysFromCivil(y, m, 1) + 1;
          return `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        };
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const cal = "2023-01-01";
        expect((calibrationAge(day(hi), cal)?.days ?? 0) - (calibrationAge(day(lo), cal)?.days ?? 0)).toBe(hi - lo);
      }),
      { numRuns: 50 },
    );
  });
});

describe("needsCalibrationCheck", () => {
  const stale = { days: 41, stale: true, chip: "calibration 41 days old" };
  const fresh = { days: 3, stale: false, chip: null };
  it("flags only when every member is stale", () => {
    expect(needsCalibrationCheck([stale, stale])).toBe(true);
    expect(needsCalibrationCheck([stale, fresh])).toBe(false);
    expect(needsCalibrationCheck([stale, null])).toBe(false);
    expect(needsCalibrationCheck([])).toBe(false);
  });
});
