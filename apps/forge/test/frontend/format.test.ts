import { describe, expect, it } from "vitest";
import type { SeedJobView, WhyRowView } from "../../src/contract/ui-api.js";
import { countsText, errorText, normaliseProjectKey, num, parseNumberField, percent, resyncActive, resyncText, seedActive, seedProgress, topWhyRows } from "../../src/frontend/format.js";

const row = (feature: string, contribution: number | null): WhyRowView => ({ feature, key: feature, label: feature, unit: "", eventValue: 1, referenceValue: 1, z: 0, contribution, note: "" });
const job = (state: string, extra: Record<string, unknown> = {}): SeedJobView => ({ jobId: "j", state, step: "registry", counts: {}, errors: [], seed: 2029, ...extra });

describe("format helpers", () => {
  it("percent and num never print NaN or Infinity", () => {
    expect(percent(0.734)).toBe("73%");
    expect(percent(null)).toBe("n/a");
    expect(percent(Number.POSITIVE_INFINITY)).toBe("n/a");
    expect(num(0.4251)).toBe("0.43");
    expect(num(null)).toBe("n/a");
  });

  it("topWhyRows keeps the largest contributions, drops n/a rows, ties by feature id", () => {
    expect(topWhyRows([row("F1", 0.2), row("F2", null), row("F3", 0.5), row("F4", 0.2), row("F5", 0.1)]).map((r) => r.feature)).toEqual(["F3", "F1", "F4"]);
  });

  it("errorText never echoes server text for 403/404", () => {
    expect(errorText({ code: "forbidden-or-not-found", message: "TTDEMO-9 is restricted", retryable: false })).toBe("You don't have access to this, or it doesn't exist.");
    expect(errorText({ code: "invalid-input", message: "Bad key", retryable: false })).toBe("Bad key");
  });

  it("seed progress uses the service's step index when present, else an indeterminate bar", () => {
    expect(seedActive(job("waiting"))).toBe(true);
    expect(seedActive(job("done"))).toBe(false);
    expect(seedActive(null)).toBe(false);
    expect(seedProgress(job("running", { stepIndex: 5, stepCount: 10, stepLabel: "Clusters", message: "" }))).toEqual({ fraction: 0.5, label: "Clusters", message: null });
    expect(seedProgress(job("running"))).toEqual({ fraction: null, label: "registry", message: null });
    expect(seedProgress(job("done")).fraction).toBe(1);
  });

  it("re-sync text per state", () => {
    const base = { projectKey: "P", counts: {} };
    expect(resyncText({ ...base, state: "failed", message: "rate limited" })).toBe("Failed: rate limited.");
    expect(resyncText({ ...base, state: "running" })).toBe("Running.");
    expect(resyncActive({ ...base, state: "pending" })).toBe(true);
    expect(resyncActive(null)).toBe(false);
  });

  it("counts, numbers and project keys", () => {
    expect(countsText({ events: 3, clusters: 4 })).toBe("clusters 4 · events 3");
    expect(parseNumberField(" 0.5 ", 0, 1)).toBe(0.5);
    expect(parseNumberField("1e3")).toBeNull();
    expect(parseNumberField("2", 0, 1)).toBeNull();
    expect(normaliseProjectKey(" ttdemo ")).toBe("TTDEMO");
    expect(normaliseProjectKey("T")).toBeNull();
  });
});
