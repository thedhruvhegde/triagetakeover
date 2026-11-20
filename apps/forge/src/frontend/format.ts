/**
 * Pure display helpers for the UI Kit screens (unit-tested; no React, no platform).
 * Copy stays short and literal: it describes what the app computed, nothing more.
 */
import type { ApiError, DiagnosticStatus, MatchResultKind, ResyncStatus, SeedJobView, WhyRowView } from "../contract/ui-api";

export type LozengeAppearance = "default" | "inprogress" | "moved" | "new" | "removed" | "success";

export const RESULT_LABELS: Readonly<Record<MatchResultKind, { readonly text: string; readonly appearance: LozengeAppearance }>> = {
  match: { text: "Match", appearance: "success" },
  accepted: { text: "Accepted", appearance: "success" },
  ambiguous: { text: "Ambiguous", appearance: "moved" },
  novel: { text: "Novel", appearance: "new" },
  "first-of-kind": { text: "First of its kind", appearance: "new" },
};

export const DIAGNOSTIC_LABELS: Readonly<Record<DiagnosticStatus, { readonly text: string; readonly appearance: LozengeAppearance }>> = {
  pass: { text: "Pass", appearance: "success" },
  fail: { text: "Fail", appearance: "removed" },
  unknown: { text: "Unknown", appearance: "default" },
  skipped: { text: "Skipped", appearance: "default" },
};

/** `0.734` → `"73%"`. */
export function percent(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "n/a" : `${Math.round(v * 100)}%`;
}

/** Fixed digits, `n/a` for missing values (the contract sends +∞ as null). */
export function num(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(digits);
}

/** The `n` why-rows with the largest contribution (rows without one are dropped). */
export function topWhyRows(rows: readonly WhyRowView[], n = 3): WhyRowView[] {
  return rows
    .filter((r) => r.contribution !== null && Number.isFinite(r.contribution))
    .sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0) || (a.feature < b.feature ? -1 : 1))
    .slice(0, n);
}

/** Plain-language message for a failed call. 403/404 never say which (§10.3). */
export function errorText(e: ApiError): string {
  switch (e.code) {
    case "forbidden-or-not-found":
      return "You don't have access to this, or it doesn't exist.";
    case "rate-limited":
      return "Jira is rate-limiting requests. Wait a moment and try again.";
    default:
      return e.message;
  }
}

export const SEED_ACTIVE_STATES: readonly string[] = ["queued", "running", "waiting", "uploading-raw-files"];

export function seedActive(job: SeedJobView | null): boolean {
  return job !== null && SEED_ACTIVE_STATES.includes(job.state);
}

/**
 * Optional progress fields the seed service adds beyond the contract (`stepIndex`,
 * `stepCount`, `stepLabel`, `message`). Read defensively; absent fields mean "no detail".
 */
export interface SeedProgress {
  /** 0..1, or null when only an indeterminate bar is honest. */
  readonly fraction: number | null;
  readonly label: string;
  readonly message: string | null;
}

export function seedProgress(job: SeedJobView): SeedProgress {
  const extra = job as SeedJobView & Readonly<Record<string, unknown>>;
  const index = typeof extra["stepIndex"] === "number" ? extra["stepIndex"] : null;
  const count = typeof extra["stepCount"] === "number" ? extra["stepCount"] : null;
  const label = typeof extra["stepLabel"] === "string" ? extra["stepLabel"] : job.step;
  const message = typeof extra["message"] === "string" && extra["message"] !== "" ? extra["message"] : null;
  const fraction = job.state === "done" ? 1 : index !== null && count !== null && count > 0 ? Math.min(1, Math.max(0, index / count)) : null;
  return { fraction, label, message };
}

/** `{events: 12, clusters: 4}` → `"events 12 · clusters 4"` (stable key order). */
export function countsText(counts: Readonly<Record<string, number>>): string {
  return Object.keys(counts)
    .sort()
    .map((k) => `${k} ${counts[k] ?? 0}`)
    .join(" · ");
}

export function resyncActive(s: ResyncStatus | null): boolean {
  return s !== null && (s.state === "pending" || s.state === "running");
}

export function resyncText(s: ResyncStatus): string {
  switch (s.state) {
    case "idle":
      return "No re-sync has run yet.";
    case "pending":
      return `Queued${s.requestedAt !== undefined ? ` at ${s.requestedAt}` : ""}.`;
    case "running":
      return `Running${s.phase !== undefined ? `: ${s.phase}` : ""}.`;
    case "done":
      return `Done${s.finishedAt !== undefined ? ` at ${s.finishedAt}` : ""}.`;
    case "failed":
      return `Failed${s.message !== undefined ? `: ${s.message}` : ""}.`;
  }
}

/** Parses a number field; `null` when it is not a finite number in [min, max]. */
export function parseNumberField(text: string, min = -Infinity, max = Infinity): number | null {
  const t = text.trim();
  if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** Project keys as Jira allows them (upper-cased input). */
export function normaliseProjectKey(text: string): string | null {
  const k = text.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{1,9}$/.test(k) ? k : null;
}
