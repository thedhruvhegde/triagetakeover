/**
 * Pure formatting helpers. No dates are created here and nothing is localised by the browser,
 * so the output is identical in tests and in every locale.
 */
import type { OnsetVerdict } from "./types.js";

/** Fixed-precision number, `"–"` for null / non-finite. Trailing zeros are kept (stable widths). */
export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return value.toFixed(digits);
}

/** 0..1 → "78%". */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  return `${(Math.min(1, Math.max(0, value)) * 100).toFixed(digits)}%`;
}

/** Kilometres with a thousands separator ("2,560 km"). */
export function formatKm(km: number): string {
  if (!Number.isFinite(km)) return "–";
  return `${groupThousands(Math.round(km))} km`;
}

/** `1234567` → `"1,234,567"` (deterministic, not locale dependent). */
export function groupThousands(n: number): string {
  const sign = n < 0 ? "-" : "";
  const digits = String(Math.abs(Math.trunc(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** A p-value for display: `"0.0013"`, `"3.1e-4"`, `"< 1e-12"`, `"–"`. */
export function formatP(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "–";
  if (p < 1e-12) return "< 1e-12";
  if (p >= 0.001) return p >= 0.1 ? p.toFixed(2) : p.toPrecision(2);
  const [mantissa, exponent] = p.toExponential(1).split("e");
  return `${mantissa ?? ""}e${exponent ?? ""}`;
}

/**
 * A p-value in plain words. The sentence states what a p-value is (how surprising the data
 * would be with no change), never "the probability that the build caused it".
 */
export function pValueInWords(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "No p-value: there is not enough data to test.";
  if (p <= 0) return "If the rate had not changed, a rise this large would essentially never happen by chance.";
  if (p >= 0.5) return "A rise like this is common by chance alone; the data show no change.";
  const oneIn = 1 / p;
  const rounded = oneIn >= 100 ? groupThousands(Math.round(oneIn / 10) * 10) : String(Math.round(oneIn));
  return `If the rate had not changed, a rise at least this large would happen by chance about 1 time in ${rounded}.`;
}

/** Verdict label used everywhere (PRD US-14 AC4). */
export function onsetVerdictLabel(verdict: OnsetVerdict): string {
  switch (verdict) {
    case "regression-likely":
      return "Regression likely (p < 0.01)";
    case "inconclusive":
      return "Inconclusive";
    case "no-evidence":
      return "No evidence of onset";
    case "not-enough-data":
      return "Not enough data";
  }
}

/** Rate ratio or CI end: number, `"∞"` (no events before the boundary), or null. */
export function formatRatio(value: number | "∞" | null | undefined, digits = 1): string {
  if (value === "∞") return "∞";
  return formatNumber(value, digits);
}

/** ISO-8601 → "2026-11-14 09:12 UTC" without the Date object (deterministic). */
export function formatInstant(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "–";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (m === null) return iso;
  const zone = m[3] === "Z" ? "UTC" : `UTC${m[3] ?? ""}`;
  return `${m[1] ?? ""} ${m[2] ?? ""} ${zone}`;
}

/** "lane-loss" → "Lane-loss". */
export function capitalise(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** Plural helper: `plural(1, "event")` → "1 event". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${groupThousands(n)} ${n === 1 ? singular : pluralForm}`;
}
