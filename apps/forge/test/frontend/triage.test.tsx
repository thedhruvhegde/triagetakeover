// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiResponse, MatchView, UiMethod } from "../../src/contract/ui-api.js";
import type { Caller } from "../../src/frontend/api.js";
import { attr, text } from "./dom.js";

vi.mock("@forge/react", () => import("./ui-kit-mock.js"));
const bridge = vi.hoisted(() => ({ invoke: vi.fn(), close: vi.fn() }));
vi.mock("@forge/bridge", () => ({ invoke: bridge.invoke, view: { close: bridge.close } }));

const { TriageView } = await import("../../src/frontend/triage-view.js");

afterEach(() => {
  cleanup();
  bridge.invoke.mockReset();
});

const cluster = { key: "TTDEMO-10", id: "20010", name: "Lane loss · cam-B · low sun glare", bucket: "lane-loss|cam-B", memberCount: 7, url: "/browse/TTDEMO-10" };

export const MATCH: MatchView = {
  event: {
    key: "TTDEMO-12",
    id: "20012",
    type: "lane-loss",
    variant: "cam-B",
    build: "4.12.0",
    bucket: "lane-loss|cam-B",
    chips: ["low-sun-glare"],
    occurredAt: "2026-11-16T07:40:00.000Z",
    vehicleId: "V-02",
    synthetic: true,
    tampered: false,
    engine: "1.0.0",
  },
  result: "match",
  cluster,
  alternatives: [],
  dStar: 0.42,
  tau: 1,
  confidence: { value: 0.82, definition: "1 − d*/τ for the nearest accepted neighbour", inputs: { dStar: 0.42, tau: 1 } },
  neighbours: [{ key: "TTDEMO-5", d: 0.42, clusterKey: "TTDEMO-10" }],
  why: [
    { feature: "F3", key: "peakLatOffset", label: "Peak lateral offset", unit: "m", eventValue: 0.61, referenceValue: 0.58, z: 0.2, contribution: 0.1, note: "" },
    { feature: "F6", key: "laneConfMin", label: "Min lane confidence", unit: "", eventValue: 0.12, referenceValue: 0.15, z: 0.4, contribution: 0.5, note: "" },
    { feature: "F1", key: "ttc", label: "Time to takeover", unit: "s", eventValue: 1.2, referenceValue: 1.1, z: 0.3, contribution: 0.3, note: "" },
    { feature: "F9", key: "yaw", label: "Yaw rate", unit: "deg/s", eventValue: null, referenceValue: 2, z: null, contribution: null, note: "n/a (channel not mapped)" },
    { feature: "F2", key: "decel", label: "Peak decel", unit: "m/s²", eventValue: 2, referenceValue: 2.1, z: 0.1, contribution: 0.05, note: "" },
  ],
  headlines: ["Bucket: lane-loss x cam-B", "Nearest: TTDEMO-5 d=0.42 < τ=1.00"],
  evidence: [
    { kind: "issue", key: "TTDEMO-5", url: "/browse/TTDEMO-5", label: "TTDEMO-5 (nearest neighbour)" },
    { kind: "issue", key: "TTDEMO-10", url: "/browse/TTDEMO-10", label: "TTDEMO-10 (cluster)" },
  ],
  message: "Matches an accepted cluster.",
};

function caller(responses: Partial<Record<UiMethod, ApiResponse<unknown>[]>>) {
  const calls: { method: UiMethod; req: unknown }[] = [];
  const call = (async (method: UiMethod, req: unknown) => {
    calls.push({ method, req });
    const q = responses[method] ?? [];
    return (q.length > 1 ? q.shift() : q[0]) ?? { ok: false, error: { code: "error", message: `no fake for ${method}`, retryable: false } };
  }) as Caller;
  return { call, calls };
}

describe("TriageView", () => {
  it("shows the compact match: result, cluster link, confidence with its definition, top-3 why rows, evidence", async () => {
    const { call, calls } = caller({ triageNow: [{ ok: true, data: MATCH, warnings: [] }] });
    render(<TriageView call={call} issueKey="TTDEMO-12" />);
    expect(screen.getByText("Matching this takeover against the clusters…")).toBeTruthy();
    await screen.findByText("Match");
    expect(calls).toEqual([{ method: "triageNow", req: { issueKey: "TTDEMO-12" } }]);
    expect(screen.getByText("SYNTHETIC")).toBeTruthy();
    expect(attr(screen.getByRole("link", { name: "TTDEMO-10 Lane loss · cam-B · low sun glare" }), "href")).toBe("/browse/TTDEMO-10");
    expect(screen.getByText("Confidence 82%")).toBeTruthy();
    expect(screen.getByText(/1 − d\*\/τ for the nearest accepted neighbour/)).toBeTruthy();
    expect(screen.getByText("Nearest: TTDEMO-5 d=0.42 < τ=1.00")).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1).map((r) => text(r));
    expect(rows).toEqual(["F6 Min lane confidence0.120.1550%", "F1 Time to takeover1.20 s1.10 s30%", "F3 Peak lateral offset0.61 m0.58 m10%"]);
    expect(attr(screen.getByRole("link", { name: "TTDEMO-5 (nearest neighbour)" }), "href")).toBe("/browse/TTDEMO-5");
    expect(screen.getByText(/not a safety tool/)).toBeTruthy();
    expect(screen.getByText(/from the Takeover signature panel/)).toBeTruthy();
  });

  it("novel: no cluster line, says so plainly", async () => {
    const novel: MatchView = { ...MATCH, result: "novel", alternatives: [cluster], message: "No cluster within τ: proposed new cluster.", dStar: null, why: [] };
    const { cluster: _drop, ...withoutCluster } = novel;
    void _drop;
    const { call } = caller({ triageNow: [{ ok: true, data: withoutCluster, warnings: ["Index row was stale; re-processed."] }] });
    render(<TriageView call={call} issueKey="TTDEMO-12" />);
    await screen.findByText("Novel");
    expect(screen.queryByText(/^Cluster:/)).toBeNull();
    expect(screen.getByText("No cluster within τ: proposed new cluster.")).toBeTruthy();
    expect(screen.getByText(/d\* = n\/a/)).toBeTruthy();
    expect(screen.getByText("Index row was stale; re-processed.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("forbidden-or-not-found leaks nothing; retryable errors offer Try again", async () => {
    const { call } = caller({ triageNow: [{ ok: false, error: { code: "forbidden-or-not-found", message: "Issue TTDEMO-12 is hidden", retryable: false } }] });
    render(<TriageView call={call} issueKey="TTDEMO-12" />);
    await screen.findByText("You don't have access to this, or it doesn't exist.");
    expect(screen.queryByText(/hidden/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    cleanup();

    const flaky = caller({ triageNow: [{ ok: false, error: { code: "unavailable", message: "Jira is unavailable.", retryable: true } }, { ok: true, data: MATCH, warnings: [] }] });
    render(<TriageView call={flaky.call} issueKey="TTDEMO-12" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Match");
    expect(flaky.calls).toHaveLength(2);
  });

  it("entry: renders through ForgeReconciler and takes the issue key from the product context", async () => {
    const mock = await import("./ui-kit-mock.js");
    const entry = await import("../../src/frontend/triage.js");
    expect(mock.default.render).toHaveBeenCalledTimes(1);
    bridge.invoke.mockResolvedValue({ ok: true, data: MATCH, warnings: [] });
    render(<entry.TriageApp />);
    await screen.findByText("Match");
    expect(bridge.invoke).toHaveBeenCalledWith("triageNow", { issueKey: "TTDEMO-12" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(bridge.close).toHaveBeenCalled();
  });

  it("api client: a rejected invoke becomes a retryable envelope, never an exception", async () => {
    const { callResolver } = await import("../../src/frontend/api.js");
    bridge.invoke.mockRejectedValueOnce(new Error("offline"));
    expect(await callResolver("triageNow", { issueKey: "TTDEMO-1" })).toMatchObject({ ok: false, error: { code: "unavailable", retryable: true } });
    bridge.invoke.mockResolvedValueOnce("garbage");
    expect(await callResolver("triageNow", { issueKey: "TTDEMO-1" })).toMatchObject({ ok: false, error: { code: "error" } });
    await waitFor(() => expect(bridge.invoke).toHaveBeenCalledTimes(2));
  });
});
