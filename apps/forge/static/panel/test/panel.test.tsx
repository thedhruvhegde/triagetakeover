// @vitest-environment jsdom
import "../../common/jsdom-setup.js";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PanelClusterView, RouteView } from "../../common/api.js";
import { clusterRef, conf, coverageView, eventSummary, fakeClient, matchView, onsetView, recordingNavigator, WithNavigator, type FakeTtClient } from "../../common/testing.js";
import { actionResult, eventView } from "./fixtures.js";
import { PanelApp, type PanelDeps } from "../src/App.js";

afterEach(cleanup);

function renderPanel(client: FakeTtClient, over: Partial<PanelDeps> = {}) {
  const nav = recordingNavigator();
  const openAddTelemetry = vi.fn(async () => "closed" as const);
  render(
    <WithNavigator navigator={nav}>
      <PanelApp deps={{ client, issueKey: "TEST-7", projectKey: "TEST", openAddTelemetry, ...over }} />
    </WithNavigator>,
  );
  return { nav, openAddTelemetry };
}

describe("panel", () => {
  it("renders the trace with the takeover marker, chips with their rule, the match card with confidence and the why-table", async () => {
    const client = fakeClient({ getPanel: () => eventView() });
    renderPanel(client);
    const card = await screen.findByTestId("tt-result-card");
    expect(card.querySelector("[data-result]")?.getAttribute("data-result")).toBe("match");
    expect(card.textContent).toContain("Matches a cluster");
    expect(within(card).getByTestId("tt-confidence").textContent).toContain("79%");
    const plot = screen.getByTestId("tt-panel-plot");
    expect(within(plot).getByTestId("tt-takeover-marker")).toBeTruthy();
    expect(plot.querySelector("desc")?.textContent).toContain("Lane confidence (0..1): min 0.22");
    expect(screen.getByTestId("tt-chip-low-sun-glare").textContent).toContain("sunBlob 0.009 >= 0.004");
    expect(screen.getByText("Image statistics, not scene understanding.")).toBeTruthy();
    expect(screen.getByTestId("tt-why-bucket-rule").textContent).toBe("Bucket: lane-loss x cam-B");
    expect(screen.getByTestId("tt-why-headline").textContent).toContain("d=0.18 < τ=1.00");
    expect(screen.getByTestId("tt-why-row-F3").textContent).toContain("n/a (channel not mapped)");
    expect(screen.getByTestId("tt-disclaimer").textContent).toBe("Not a safety tool.");
  });

  it("shows the top-3 neighbours side by side on shared axes", async () => {
    renderPanel(fakeClient({ getPanel: () => eventView() }));
    const section = await screen.findByTestId("tt-neighbours-plots");
    for (const k of ["TEST-7", "TEST-2", "TEST-3", "TEST-4"]) expect(within(section).getByTestId(`tt-neighbour-plot-${k}`)).toBeTruthy();
    expect(within(section).getByTestId("tt-neighbour-TEST-4").textContent).toContain("d ∞");
    // Same axes: the y-axis labels of the lane_conf strip are identical in every small multiple.
    const axisLabels = ["TEST-7", "TEST-2"].map((k) =>
      Array.from(within(section).getByTestId(`tt-neighbour-plot-${k}`).querySelectorAll('[data-channel="lane_conf"] text'))
        .map((t) => t.textContent)
        .join("|"),
    );
    expect(axisLabels[0]).toBe(axisLabels[1]);
  });

  it("Accept links to the matched cluster, announces it and reloads; Undo appears afterwards", async () => {
    let accepted = false;
    const client = fakeClient({
      getPanel: () =>
        accepted
          ? eventView({ match: matchView({ result: "accepted", message: "Accepted" }), triage: { state: "accepted", clusterKey: "TEST-5", by: "Test User", at: "2026-11-20T09:00:00Z", viaDemoSeed: false, history: [{ action: "accept", by: "Test User", at: "2026-11-20T09:00:00Z", clusterKey: "TEST-5" }] }, undo: { available: true, action: "accept", summary: "remove link TEST-7 → TEST-5" } })
          : eventView(),
      acceptMatch: () => {
        accepted = true;
        return actionResult();
      },
      undoLast: () => {
        accepted = false;
        return actionResult({ action: "undo", summary: "Removed link TEST-7 → TEST-5" });
      },
    });
    renderPanel(client);
    fireEvent.click(await screen.findByTestId("tt-accept"));
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Linked TEST-7 → TEST-5"));
    expect(client.calls.find((c) => c.method === "acceptMatch")?.req).toEqual({ issueKey: "TEST-7", clusterKey: "TEST-5" });
    await screen.findByTestId("tt-undo");
    expect(screen.queryByTestId("tt-accept")).toBeNull();
    expect(screen.getByTestId("tt-triage-state").textContent).toContain("Accepted into TEST-5 by Test User");
    fireEvent.click(screen.getByTestId("tt-undo"));
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Removed link"));
    await screen.findByTestId("tt-accept");
  });

  it("ambiguous results let the user pick the cluster to accept into", async () => {
    const client = fakeClient({ getPanel: () => eventView({ match: matchView({ result: "ambiguous" }) }), acceptMatch: () => actionResult() });
    renderPanel(client);
    await screen.findByTestId("tt-result-card");
    fireEvent.click(screen.getByLabelText("Lane-loss · cam-B other (TEST-9)"));
    fireEvent.click(screen.getByTestId("tt-accept"));
    await waitFor(() => expect(client.calls.find((c) => c.method === "acceptMatch")?.req).toEqual({ issueKey: "TEST-7", clusterKey: "TEST-9" }));
  });

  it("Split sends the optional name and lists proposed members without linking them", async () => {
    const client = fakeClient({
      getPanel: () => eventView({ match: matchView({ result: "novel", cluster: undefined as never, message: "Proposed new cluster" }) }),
      splitEvent: () => actionResult({ action: "split", summary: "Created cluster TEST-60", proposedMembers: ["TEST-61", "TEST-62"] }),
    });
    renderPanel(client);
    const card = await screen.findByTestId("tt-result-card");
    expect(card.textContent).toContain("Proposed new cluster");
    expect(screen.getByTestId("tt-accept").textContent).toContain("anyway");
    fireEvent.change(screen.getByLabelText("New cluster name (optional)"), { target: { value: "  Lane-loss tunnel  " } });
    fireEvent.click(screen.getByTestId("tt-split"));
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Would also match (not linked): TEST-61, TEST-62"));
    expect(client.calls.find((c) => c.method === "splitEvent")?.req).toEqual({ issueKey: "TEST-7", name: "Lane-loss tunnel" });
    // The resolver caps cluster names at 80 characters (§10.3); the field must not accept more.
    expect(screen.getByLabelText("New cluster name (optional)").getAttribute("maxlength")).toBe("80");
  });

  it("Route shows the source and why, and writes only on Confirm", async () => {
    const route: RouteView = {
      clusterKey: "TEST-5",
      rule: { index: 0, text: "type = lane-loss -> Perception" },
      source: "twg",
      team: { name: "Perception (test team)", ref: "ari:team", source: "twg" },
      contact: { accountId: "acc-2", displayName: "Test Lead", source: "twg" },
      members: [{ accountId: "acc-2", displayName: "Test Lead" }],
      twgStatus: "ok",
      hops: [{ step: "twg", ref: "ari:team", outcome: "ok", detail: "" }],
      why: ["Rule #1 matched; owner from Teamwork Graph"],
      confidence: conf(1, "1 when the rule's first target resolved"),
      evidence: [],
      applies: { componentId: "10001" },
    };
    const client = fakeClient({ getPanel: () => eventView(), suggestOwner: () => route, applyRoute: () => actionResult({ action: "route", summary: "Set component Perception on TEST-5" }) });
    renderPanel(client);
    fireEvent.click(await screen.findByTestId("tt-route"));
    const source = await screen.findByTestId("tt-route-source");
    expect(source.getAttribute("data-source")).toBe("twg");
    expect(source.textContent).toContain("Teamwork Graph, as you");
    expect(screen.getByTestId("tt-route-members").textContent).toContain("Test Lead");
    expect(client.calls.some((c) => c.method === "applyRoute")).toBe(false);
    fireEvent.click(screen.getByTestId("tt-route-confirm"));
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Set component Perception"));
    expect(client.calls.find((c) => c.method === "applyRoute")?.req).toEqual({ issueKey: "TEST-7", clusterKey: "TEST-5" });
  });

  it('shows "No signal data." with Add telemetry, opening the intake in attach mode', async () => {
    const client = fakeClient({ getPanel: () => ({ kind: "no-signal-data", issueKey: "TEST-7", message: "No signal data." }) });
    const { openAddTelemetry } = renderPanel(client);
    const empty = await screen.findByTestId("tt-panel-empty");
    expect(empty.textContent).toContain("No signal data.");
    expect(empty.textContent).toContain("does not guess");
    fireEvent.click(screen.getByTestId("tt-add-telemetry"));
    await waitFor(() => expect(openAddTelemetry).toHaveBeenCalledWith("TEST-7", "TEST"));
    await waitFor(() => expect(client.calls.filter((c) => c.method === "getPanel").length).toBe(2));
  });

  it("shows invalid signal data with the validation errors", async () => {
    renderPanel(fakeClient({ getPanel: () => ({ kind: "invalid-signal-data", issueKey: "TEST-7", message: "The stored property is not valid.", errors: [{ path: "sig.features.F3", message: "out of range" }] }) }));
    const box = await screen.findByTestId("tt-panel-invalid");
    expect(box.textContent).toContain("sig.features.F3");
    expect(screen.getByTestId("tt-add-telemetry").textContent).toBe("Replace telemetry");
  });

  it("explains the lazy re-processing that happened on open", async () => {
    renderPanel(fakeClient({ getPanel: () => eventView({ index: { reprocessed: true, reason: "the event was not indexed yet", outOfSync: false } }) }));
    const box = await screen.findByTestId("tt-reprocess");
    expect(box.getAttribute("data-reprocessed")).toBe("true");
    expect(box.textContent).toContain("because the event was not indexed yet");
  });

  it("first-of-kind shows no confidence and the event's own features", async () => {
    renderPanel(fakeClient({ getPanel: () => eventView({ match: matchView({ result: "first-of-kind", cluster: undefined as never, alternatives: [], why: [], dStar: null, message: "First of its kind in this bucket" }) }) }));
    const card = await screen.findByTestId("tt-result-card");
    expect(card.textContent).toContain("First of its kind in this bucket");
    expect(within(card).queryByTestId("tt-confidence")).toBeNull();
    expect(screen.queryByTestId("tt-accept")).toBeNull();
    expect(screen.getByTestId("tt-why-row-F6")).toBeTruthy();
  });

  it("renders the cluster view with onset and Route", async () => {
    const view: PanelClusterView = {
      kind: "cluster",
      cluster: clusterRef("TEST-5", "Lane-loss · low sun · cam-B"),
      members: [eventSummary("TEST-6"), eventSummary("TEST-7")],
      pendingSuggestions: ["TEST-11"],
      onset: onsetView(),
      coverage: coverageView(),
      owner: null,
      disclaimer: "Not a safety tool.",
    };
    renderPanel(fakeClient({ getPanel: () => view }), { issueKey: "TEST-5" });
    const panel = await screen.findByTestId("tt-panel-cluster");
    expect(panel.textContent).toContain("Cluster: Lane-loss · low sun · cam-B");
    expect(within(panel).getByTestId("tt-onset-bars")).toBeTruthy();
    expect(within(panel).getByTestId("tt-route")).toBeTruthy();
    expect(screen.getByTestId("tt-synthetic-badge")).toBeTruthy();
  });

  it("opens evidence links through the router", async () => {
    const { nav } = renderPanel(fakeClient({ getPanel: () => eventView() }));
    const card = await screen.findByTestId("tt-result-card");
    fireEvent.click(within(card).getByTestId("tt-evidence-link-0"));
    expect(nav.opened).toEqual(["/browse/TEST-5"]);
  });
});
