// @vitest-environment jsdom
import "../../common/jsdom-setup.js";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ViewTarget } from "../../common/context.js";
import { fakeClient, recordingNavigator, WithNavigator, type FakeTtClient } from "../../common/testing.js";
import { commitResult, intakeContext } from "./fixtures.js";
import { IntakeApp, type IntakeDeps } from "../src/App.js";
import { createProcessor } from "../src/processor.js";
import { file, laneLossCsv, testJpeg } from "./files.js";

afterEach(cleanup);

interface Setup {
  readonly client: FakeTtClient;
  readonly target?: ViewTarget;
  readonly requestJira?: IntakeDeps["requestJira"];
}

function renderIntake({ client, target = { inModal: true, mode: "create", projectKey: "TEST" }, requestJira }: Setup) {
  const nav = recordingNavigator();
  const jiraCalls: { path: string; init: RequestInit | undefined }[] = [];
  const close = vi.fn(async () => undefined);
  const deps: IntakeDeps = {
    client,
    target,
    processor: createProcessor({ createWorker: () => null }),
    requestJira:
      requestJira ??
      (async (path, init) => {
        jiraCalls.push({ path, init });
        if (path === "/rest/api/3/issue") return new Response(JSON.stringify({ key: "TEST-77", id: "10077" }), { status: 201 });
        return new Response(JSON.stringify([{ id: "500", filename: "takeover.csv" }, { id: "501", filename: "frame-1.jpg" }]), { status: 200 });
      }),
    encodeThumb: () => "QUJDRA==",
    close,
  };
  render(
    <WithNavigator navigator={nav}>
      <IntakeApp deps={deps} />
    </WithNavigator>,
  );
  return { nav, jiraCalls, close };
}

async function pick(files: File[]): Promise<void> {
  const input = await screen.findByTestId("tt-file-input");
  fireEvent.change(input, { target: { files } });
}

function fillDetails(opts: { summary?: boolean } = {}): void {
  if (opts.summary !== false) fireEvent.change(screen.getByLabelText(/^Summary/), { target: { value: "car drifted left, took over" } });
  fireEvent.change(screen.getByLabelText(/^Event time \(UTC\)/), { target: { value: "2026-11-14T09:12" } });
  fireEvent.change(screen.getByLabelText(/^Vehicle id/), { target: { value: "VEH-TEST" } });
  fireEvent.change(screen.getByLabelText(/^Sensor variant/), { target: { value: "cam-B" } });
  fireEvent.change(screen.getByLabelText(/^Software build/), { target: { value: "4.12.0" } });
  fireEvent.change(screen.getByLabelText(/^ODD tags/), { target: { value: "highway, highway" } });
}

describe("intake", () => {
  it("create mode: preview first, then create the issue, upload originals from the browser and commit", async () => {
    const client = fakeClient({
      getIntakeContext: () => intakeContext(),
      commitEvent: (req) => commitResult(req.issueKey, req.attachments ?? { via: "none", status: "skipped" }),
    });
    const { jiraCalls, nav, close } = renderIntake({ client });
    await pick([file("takeover.csv", laneLossCsv(), "text/csv"), file("frame-1.jpg", testJpeg(), "image/jpeg")]);
    await waitFor(() => expect(screen.getByTestId("tt-mapping-summary").textContent).toContain("suggested from the headers"));
    expect(screen.getByTestId("tt-file-list").textContent).toContain("takeover.csv");
    fillDetails();
    fireEvent.click(screen.getByTestId("tt-intake-preview"));
    await screen.findByTestId("tt-intake-preview-section");
    expect(screen.getByTestId("tt-preview-type").textContent).toBe("Takeover type: lane-loss");
    expect(screen.getByTestId("tt-preview-plot").querySelector("svg")).toBeTruthy();
    expect(screen.getByTestId("tt-frame-outcomes").textContent).toContain("decoded 64×36");
    // Nothing has been written before the confirm.
    expect(jiraCalls).toEqual([]);
    expect(client.calls.map((c) => c.method)).toEqual(["getIntakeContext"]);

    fireEvent.click(screen.getByTestId("tt-intake-create"));
    const done = await screen.findByTestId("tt-intake-done");
    expect(done.textContent).toContain("Created TEST-77");
    expect(screen.queryByTestId("tt-attachments-banner")).toBeNull();

    expect(jiraCalls.map((c) => c.path)).toEqual(["/rest/api/3/issue", "/rest/api/3/issue/TEST-77/attachments"]);
    const issueBody = JSON.parse(String(jiraCalls[0]?.init?.body)) as { fields: { summary: string; labels: string[]; issuetype: { name: string } } };
    expect(issueBody.fields).toMatchObject({ summary: "car drifted left, took over", labels: ["tt-takeover"], issuetype: { name: "Task" } });
    const commit = client.calls.find((c) => c.method === "commitEvent")?.req as { issueKey: string; event: { ctx: unknown; source: { csv: { attachmentId?: string }; frames: { attachmentId?: string }[] } }; thumbs?: { frames: unknown[] }; attachments: unknown };
    expect(commit.issueKey).toBe("TEST-77");
    expect(commit.event.ctx).toEqual({ occurredAt: "2026-11-14T09:12:00Z", vehicleId: "VEH-TEST", variant: "cam-B", build: "4.12.0", odd: ["highway"] });
    expect(commit.event.source.csv.attachmentId).toBe("500");
    expect(commit.event.source.frames[0]?.attachmentId).toBe("501");
    expect(commit.thumbs?.frames.length).toBe(1);
    expect(commit.attachments).toEqual({ via: "browser", status: "uploaded" });

    fireEvent.click(screen.getByTestId("tt-intake-open"));
    expect(nav.navigated).toEqual(["/browse/TEST-77"]);
    fireEvent.click(screen.getByTestId("tt-intake-close"));
    expect(close).toHaveBeenCalledWith({ issueKey: "TEST-77" });
  });

  it("opens the column-mapping step for unrecognised headers and applies the mapping", async () => {
    const client = fakeClient({ getIntakeContext: () => intakeContext(), saveMappingPreset: (req) => ({ id: req.id }) });
    renderIntake({ client });
    await pick([file("robot.csv", laneLossCsv({ headers: ["zeit", "v_mps", "spur", "qual", "flag"] }), "text/csv")]);
    const mapping = await screen.findByTestId("tt-mapping");
    expect(screen.getByTestId("tt-mapping-status").textContent).toContain("Map the required channel: t");
    expect((screen.getByTestId("tt-mapping-apply") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(mapping).getByLabelText(/^t \(s\)/), { target: { value: "zeit" } });
    fireEvent.change(within(mapping).getByLabelText(/^speed/), { target: { value: "v_mps" } });
    fireEvent.change(within(mapping).getByLabelText(/^lane_offset/), { target: { value: "spur" } });
    fireEvent.change(within(mapping).getByLabelText(/^lane_conf/), { target: { value: "qual" } });
    fireEvent.change(within(mapping).getByLabelText(/^takeover \(/), { target: { value: "flag" } });
    expect(screen.getByTestId("tt-mapping-status").textContent).toContain("4 signal channels mapped");
    fireEvent.change(within(mapping).getByLabelText("Save as preset (id)"), { target: { value: "robot-v1" } });
    fireEvent.click(screen.getByTestId("tt-preset-save"));
    await waitFor(() => expect(client.calls.find((c) => c.method === "saveMappingPreset")?.req).toMatchObject({ projectKey: "TEST", id: "robot-v1", preset: { columns: { t: "zeit", speed: "v_mps" } } }));
    fireEvent.click(screen.getByTestId("tt-mapping-apply"));
    expect(screen.getByTestId("tt-mapping-summary").textContent).toContain("saved preset “robot-v1”");
    fillDetails();
    fireEvent.click(screen.getByTestId("tt-intake-preview"));
    await screen.findByTestId("tt-intake-preview-section");
    expect(screen.getByTestId("tt-preview-type").textContent).toBe("Takeover type: lane-loss");
    expect(screen.getByTestId("tt-preview-features").textContent).toContain("n/a (channel not mapped)");
  });

  it("names bad files and missing fields instead of creating anything", async () => {
    const client = fakeClient({ getIntakeContext: () => intakeContext() });
    renderIntake({ client });
    await pick([file("notes.txt", "hello", "text/plain"), file("fake.jpg", "not really", "image/jpeg")]);
    const errors = await screen.findByTestId("tt-file-errors");
    expect(errors.textContent).toContain("notes.txt is not a CSV or JPEG file.");
    expect(errors.textContent).toContain("fake.jpg is not a JPEG file.");
    expect((screen.getByTestId("tt-intake-preview") as HTMLButtonElement).disabled).toBe(true);

    await pick([file("takeover.csv", laneLossCsv(), "text/csv")]);
    await screen.findByTestId("tt-mapping-summary");
    fireEvent.click(screen.getByTestId("tt-intake-preview"));
    expect(await screen.findByText("Enter the vehicle id.")).toBeTruthy();
    expect(screen.getByLabelText(/^Vehicle id/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByTestId("tt-intake-preview-section")).toBeNull();
  });

  it("reports engine errors with the row (e.g. no takeover found)", async () => {
    const noTakeover = laneLossCsv().replace(/,1\n/g, ",0\n");
    renderIntake({ client: fakeClient({ getIntakeContext: () => intakeContext() }) });
    await pick([file("takeover.csv", noTakeover, "text/csv")]);
    await screen.findByTestId("tt-mapping-summary");
    fillDetails();
    fireEvent.click(screen.getByTestId("tt-intake-preview"));
    const errs = await screen.findByTestId("tt-process-errors");
    expect(errs.textContent).toMatch(/takeover/i);
  });

  it("attach mode: no issue is created; a failed upload is reported as raw files not attached", async () => {
    const client = fakeClient({
      getIntakeContext: (req) => intakeContext({ mode: "attach", ...(req.issueKey !== undefined ? { issueKey: req.issueKey } : {}) }),
      uploadAttachment: () => ({ ok: false, error: { code: "forbidden-or-not-found", message: "no permission", retryable: false } }),
      commitEvent: (req) => commitResult(req.issueKey, req.attachments ?? { via: "none", status: "skipped" }),
    });
    const paths: string[] = [];
    renderIntake({
      client,
      target: { inModal: true, mode: "attach", issueKey: "TEST-3", projectKey: "TEST" },
      requestJira: async (path) => {
        paths.push(path);
        return new Response("no", { status: 403 });
      },
    });
    expect(await screen.findByText("Add telemetry to TEST-3")).toBeTruthy();
    expect(client.calls[0]).toEqual({ method: "getIntakeContext", req: { issueKey: "TEST-3" } });
    await pick([file("takeover.csv", laneLossCsv(), "text/csv")]);
    await screen.findByTestId("tt-mapping-summary");
    expect(screen.queryByLabelText(/^Summary/)).toBeNull();
    fillDetails({ summary: false });
    fireEvent.click(screen.getByTestId("tt-intake-preview"));
    await screen.findByTestId("tt-intake-preview-section");
    expect(screen.getByTestId("tt-intake-create").textContent).toBe("Save to TEST-3");
    fireEvent.click(screen.getByTestId("tt-intake-create"));
    const banner = await screen.findByTestId("tt-attachments-banner");
    expect(banner.textContent).toContain("Raw files not attached");
    expect(banner.textContent).toContain("no permission");
    expect(paths).toEqual(["/rest/api/3/issue/TEST-3/attachments"]);
    const commit = client.calls.find((c) => c.method === "commitEvent")?.req as { issueKey: string; attachments: { status: string } };
    expect(commit.issueKey).toBe("TEST-3");
    expect(commit.attachments.status).toBe("failed");
  });

  it("keeps the created issue and retries only the commit when saving fails", async () => {
    let fail = true;
    const client = fakeClient({
      getIntakeContext: () => intakeContext(),
      commitEvent: (req) => (fail ? { ok: false, error: { code: "property-too-large", message: "tt.event is too large", retryable: false } } : commitResult(req.issueKey, { via: "none", status: "skipped" })),
    });
    const { jiraCalls } = renderIntake({ client });
    await pick([file("takeover.csv", laneLossCsv(), "text/csv")]);
    await screen.findByTestId("tt-mapping-summary");
    fillDetails();
    fireEvent.click(screen.getByTestId("tt-intake-preview"));
    await screen.findByTestId("tt-intake-preview-section");
    fireEvent.click(screen.getByTestId("tt-attach-originals"));
    fireEvent.click(screen.getByTestId("tt-intake-create"));
    const failed = await screen.findByTestId("tt-commit-failed");
    expect(failed.textContent).toContain("TEST-77 exists, but its signal data was not saved");
    fail = false;
    fireEvent.click(within(failed).getByTestId("tt-retry"));
    const done = await screen.findByTestId("tt-intake-done");
    expect(done.textContent).toContain("Created TEST-77");
    expect(screen.getByTestId("tt-attachments-banner").textContent).toContain("You chose not to attach");
    expect(jiraCalls.map((c) => c.path)).toEqual(["/rest/api/3/issue"]);
    expect(client.calls.filter((c) => c.method === "commitEvent").length).toBe(2);
  });

  it("explains a missing context", () => {
    renderIntake({ client: fakeClient({}), target: { inModal: false } });
    expect(screen.getByText("Nothing to attach to")).toBeTruthy();
  });
});
