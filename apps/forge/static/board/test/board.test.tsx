// @vitest-environment jsdom
import "../../common/jsdom-setup.js";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeClient, recordingNavigator, WithNavigator, type FakeTtClient } from "../../common/testing.js";
import { BoardApp, type BoardDeps } from "../src/App.js";
import { boardView, idleResync } from "./fixtures.js";

afterEach(cleanup);

function renderBoard(client: FakeTtClient, over: Partial<BoardDeps> = {}) {
  const nav = recordingNavigator();
  const openIntake = vi.fn(async () => "closed" as const);
  const deps: BoardDeps = { client, projectKey: "TEST", openIntake, pollMs: 5, ...over };
  render(
    <WithNavigator navigator={nav}>
      <BoardApp deps={deps} />
    </WithNavigator>,
  );
  return { nav, openIntake: (over.openIntake ?? openIntake) as typeof openIntake };
}

const count = (client: FakeTtClient, method: string): number => client.calls.filter((c) => c.method === method).length;

describe("board", () => {
  it("shows cluster rows with onset and coverage columns, the synthetic badge and since-last-triage", async () => {
    const client = fakeClient({ getBoard: () => boardView() });
    renderBoard(client);
    expect(screen.getByTestId("tt-loading")).toBeTruthy();
    const table = await screen.findByTestId("tt-cluster-table");
    const row = within(table).getByTestId("tt-cluster-row-TEST-5");
    expect(within(row).getByText("Lane-loss · low sun · cam-B")).toBeTruthy();
    expect(within(row).getByTestId("tt-onset-verdict").getAttribute("data-verdict")).toBe("regression-likely");
    expect(within(row).getByText("Regression likely (p < 0.01)")).toBeTruthy();
    expect(within(row).getByTestId("tt-coverage-TEST-5").textContent).toBe("0 scenario tests");
    expect(within(table).getByTestId("tt-coverage-TEST-20").textContent).toBe("Covered by 1 test");
    expect(within(table).getByTestId("tt-cluster-row-TEST-20").textContent).toContain("No evidence of onset");
    expect(screen.getByTestId("tt-synthetic-badge").textContent).toContain("SYNTHETIC DEMO DATA");
    expect(screen.getByTestId("tt-since-triage").textContent).toContain("4 new events");
    expect(screen.getByTestId("tt-novel-queue").textContent).toContain("TEST-40");
    expect(screen.getByTestId("tt-novel-queue").textContent).toContain("d* 1.70 > τ 1.00");
    expect(screen.getByTestId("tt-gap-cell-cond-low-sun-glare-lane-loss").getAttribute("data-gap")).toBe("true");
    expect(screen.getByTestId("tt-disclaimer").textContent).toContain("not a safety tool");
    expect(client.calls[0]).toEqual({ method: "getBoard", req: { projectKey: "TEST" } });
  });

  it("shows the empty state pointing to File a takeover and Load demo data, never an error", async () => {
    const client = fakeClient({ getBoard: () => boardView({ empty: true, clusters: [], novel: [], synthetic: false }) });
    const { openIntake } = renderBoard(client);
    const empty = await screen.findByTestId("tt-board-empty");
    expect(empty.textContent).toContain("Load demo data");
    expect(empty.textContent).toContain("Takeover Triage setup");
    expect(screen.queryByTestId("tt-error")).toBeNull();
    expect(screen.queryByTestId("tt-synthetic-badge")).toBeNull();
    fireEvent.click(screen.getByTestId("tt-empty-file-takeover"));
    await waitFor(() => expect(openIntake).toHaveBeenCalledWith("TEST"));
  });

  it("shows a retryable error and reloads on retry", async () => {
    let fail = true;
    const client = fakeClient({
      getBoard: () => (fail ? { ok: false, error: { code: "unavailable", message: "Jira is not answering.", retryable: true } } : boardView()),
    });
    renderBoard(client);
    const error = await screen.findByTestId("tt-error");
    expect(error.textContent).toContain("Jira is not answering.");
    fail = false;
    fireEvent.click(screen.getByTestId("tt-retry"));
    await screen.findByTestId("tt-cluster-table");
    expect(count(client, "getBoard")).toBe(2);
  });

  it("Mark triaged writes the timestamp, announces it and reloads", async () => {
    const client = fakeClient({ getBoard: () => boardView(), markTriaged: () => ({ at: "2026-11-20T09:00:00Z", by: "acc-1" }) });
    renderBoard(client);
    await screen.findByTestId("tt-cluster-table");
    fireEvent.click(screen.getByTestId("tt-mark-triaged"));
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Marked triaged at 2026-11-20 09:00 UTC"));
    await waitFor(() => expect(count(client, "getBoard")).toBe(2));
  });

  it("Re-sync now queues the rebuild, shows progress and reloads when done", async () => {
    let polls = 0;
    const client = fakeClient({
      getBoard: () => boardView(),
      requestResync: () => ({ projectKey: "TEST", state: "pending", requestedAt: "2026-11-20T09:00:00Z", counts: {} }),
      getResyncStatus: () => {
        polls++;
        return polls < 2 ? { projectKey: "TEST", state: "running", phase: "indexing", counts: { events: 12 } } : { ...idleResync, state: "done", finishedAt: "2026-11-20T09:01:00Z", counts: { events: 18 } };
      },
    });
    renderBoard(client);
    await screen.findByTestId("tt-cluster-table");
    fireEvent.click(screen.getByTestId("tt-resync"));
    await waitFor(() => expect(screen.getByTestId("tt-resync-status").getAttribute("data-state")).toBe("running"));
    expect(screen.getByTestId("tt-resync-status").textContent).toContain("indexing");
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Re-sync finished"));
    await waitFor(() => expect(count(client, "getBoard")).toBe(2));
  });

  it("File takeover opens the intake modal and reloads after it closes; says so when the modal is unavailable", async () => {
    const client = fakeClient({ getBoard: () => boardView() });
    const { openIntake } = renderBoard(client);
    await screen.findByTestId("tt-cluster-table");
    fireEvent.click(screen.getByTestId("tt-file-takeover"));
    await waitFor(() => expect(openIntake).toHaveBeenCalledWith("TEST"));
    await waitFor(() => expect(count(client, "getBoard")).toBe(2));
    cleanup();

    const client2 = fakeClient({ getBoard: () => boardView() });
    renderBoard(client2, { openIntake: vi.fn(async () => "unavailable" as const) });
    await screen.findByTestId("tt-cluster-table");
    fireEvent.click(screen.getByTestId("tt-file-takeover"));
    await waitFor(() => expect(screen.getByTestId("tt-toast").textContent).toContain("Add telemetry"));
  });

  it("expands a row to onset bars and the how-to, and creates a scenario stub only after preview + confirm", async () => {
    const stub = {
      clusterKey: "TEST-5",
      summary: "[Scenario] lane-loss x low-sun-glare x cam-B x highway",
      labels: ["tt-scenario", "cond:low-sun-glare"],
      description: "Template description",
      linkedEvents: ["TEST-6", "TEST-7", "TEST-8"],
      narrativeSource: "template" as const,
      evidence: [],
      confidence: { value: 1, definition: "template" },
      why: ["gap"],
    };
    const client = fakeClient({
      getBoard: () => boardView(),
      previewScenarioStub: () => stub,
      createScenarioStub: () => ({ ...stub, created: { key: "TEST-50", id: "50", url: "/browse/TEST-50" } }),
    });
    const { nav } = renderBoard(client);
    await screen.findByTestId("tt-cluster-table");
    const toggle = screen.getByTestId("tt-expand-TEST-5");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const bars = screen.getByTestId("tt-onset-bars");
    expect(bars.querySelector('[data-build="4.12.0"]')?.getAttribute("data-after")).toBe("true");
    expect(bars.querySelector('[data-build="4.11.3"]')?.getAttribute("data-after")).toBe("false");
    expect(screen.getByTestId("tt-onset-howto").textContent).toBe("How is this computed?");
    expect(screen.getAllByText(/would happen by chance about 1 time in 400/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("tt-create-stub"));
    const preview = await screen.findByTestId("tt-stub-preview");
    expect(preview.textContent).toContain("nothing is created yet");
    expect(count(client, "createScenarioStub")).toBe(0);
    fireEvent.click(screen.getByTestId("tt-stub-confirm"));
    const created = await screen.findByTestId("tt-stub-created");
    expect(created.textContent).toContain("TEST-50");
    expect(client.calls.find((c) => c.method === "createScenarioStub")?.req).toEqual({ clusterKey: "TEST-5" });

    await act(async () => {
      fireEvent.click(within(created).getByText("TEST-50"));
    });
    expect(nav.opened).toContain("/browse/TEST-50");
  });

  it("opens evidence with the Forge router, never a popup", async () => {
    const client = fakeClient({ getBoard: () => boardView() });
    const { nav } = renderBoard(client);
    await screen.findByTestId("tt-cluster-table");
    const link = within(screen.getByTestId("tt-novel-queue")).getByText("TEST-40");
    expect(link.getAttribute("target")).toBeNull();
    fireEvent.click(link);
    expect(nav.opened).toEqual(["/browse/TEST-40"]);
  });

  it("explains a missing project context instead of failing", () => {
    renderBoard(fakeClient({}), { projectKey: undefined });
    expect(screen.getByText("No project in context")).toBeTruthy();
  });
});
