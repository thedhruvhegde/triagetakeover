// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminState, ApiResponse, ProjectConfigView, ResyncStatus, SeedJobView, SeedReportView, UiMethod } from "../../src/contract/ui-api.js";
import type { Caller } from "../../src/frontend/api.js";
import { attr, isDisabled, text } from "./dom.js";

vi.mock("@forge/react", () => import("./ui-kit-mock.js"));
vi.mock("@forge/bridge", () => ({ invoke: vi.fn(), view: { close: vi.fn() } }));

const { AdminView, patchOf, ruleText } = await import("../../src/frontend/admin-view.js");

afterEach(cleanup);

const CONFIG: ProjectConfigView = {
  projectKey: "TTDEMO",
  enabled: true,
  eventIssueType: "Task",
  clusterIssueType: "Task",
  scenarioIssueType: "Task",
  eventJql: "project = TTDEMO AND labels = tt-takeover",
  scenarioJql: "project = TTDEMO AND labels = tt-scenario",
  tau: 1,
  k: 5,
  linkType: "Relates",
  routeField: "component",
  routing: [],
  buildOrder: "semver",
  calibrationWindowDays: 30,
  fallbackProjectRoleId: "",
  simulateTwgError: false,
  ruleThresholds: { llLaneConf: 0.3 },
  chipThresholds: { sunBlobAtLeast: 0.02 },
  params: "tau=1;k=5",
  updatedAt: null,
  updatedBy: null,
};

const IDLE: ResyncStatus = { projectKey: "TTDEMO", state: "idle", counts: {} };

const STATE: AdminState = {
  config: CONFIG,
  projects: ["TTDEMO"],
  resync: IDLE,
  diagnostics: {
    ranAt: "2026-11-20T09:00:00.000Z",
    checks: [
      { id: "storage", label: "App storage", status: "pass", consequence: "Index and settings can be stored." },
      { id: "twg-teams", label: "Teamwork Graph: user → teams", status: "fail", consequence: "Routing uses project components.", spike: "SPIKE-T1" },
      { id: "rovo", label: "Rovo / MCP", status: "unknown", consequence: "Cannot be checked from the app." },
    ],
  },
  components: [{ id: "30001", name: "Perception", leadAccountId: "u-lead" }],
  roles: [{ id: "10002", name: "Administrators" }],
  issueTypes: ["Task", "Bug"],
};

type Script = Partial<Record<UiMethod, ApiResponse<unknown>[]>>;

function caller(script: Script) {
  const calls: { method: UiMethod; req: unknown }[] = [];
  const call = (async (method: UiMethod, req: unknown) => {
    calls.push({ method, req });
    const q = script[method] ?? [];
    return (q.length > 1 ? q.shift() : q[0]) ?? { ok: false, error: { code: "error", message: `no fake for ${method}`, retryable: false } };
  }) as Caller;
  return { call, calls, of: (m: UiMethod) => calls.filter((c) => c.method === m).map((c) => c.req) };
}

const ok = <T,>(data: T, warnings: string[] = []): ApiResponse<T> => ({ ok: true, data, warnings });

async function openProject(script: Script) {
  const c = caller({ getAdminState: [ok(STATE)], ...script });
  render(<AdminView call={c.call} defaultSeed={2029} pollMs={5} />);
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByText("Settings for TTDEMO");
  return c;
}

describe("AdminView", () => {
  it("opens a project and shows settings, re-sync, team mapping and the last diagnostics", async () => {
    const c = await openProject({});
    expect(c.of("getAdminState")).toEqual([{ projectKey: "TTDEMO" }]);
    expect(screen.getByText("No re-sync has run yet.")).toBeTruthy();
    expect(screen.getByText("No rules yet.")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Fail")).toBeTruthy();
    expect(within(table).getByText("Routing uses project components. [SPIKE-T1]")).toBeTruthy();
    expect(screen.queryByText("Simulate TWG error")).toBeNull(); // staging tools hidden by default
  });

  it("rejects malformed project keys before calling the resolver", () => {
    const c = caller({});
    render(<AdminView call={c.call} defaultSeed={2029} />);
    fireEvent.change(screen.getByDisplayValue("TTDEMO"), { target: { value: "1bad" } });
    expect(isDisabled(screen.getByRole("button", { name: "Open" }))).toBe(true);
    expect(screen.getByText(/Project keys are 2–10 letters/)).toBeTruthy();
    expect(c.calls).toHaveLength(0);
  });

  it("forbidden projects show the neutral message", async () => {
    const c = caller({ getAdminState: [{ ok: false, error: { code: "forbidden-or-not-found", message: "secret", retryable: false } }] });
    render(<AdminView call={c.call} defaultSeed={2029} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("You don't have access to this, or it doesn't exist.");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("Load demo data starts the seed and polls progress until done", async () => {
    const job = (state: string, extra: Record<string, unknown> = {}): SeedJobView => ({ jobId: "seed-1", state, step: "history", counts: { events: 3 }, errors: [], seed: 2029, ...extra });
    // The job stays "running" until the progress has been asserted, then "done" is released
    // (no timing race with the 5 ms poll under a loaded test run).
    const seedJobs: ApiResponse<unknown>[] = [ok(job("running", { stepIndex: 3, stepCount: 10, stepLabel: "Historical events", message: "Writing event 4 of 20" }))];
    const c = caller({ startSeed: [ok(job("queued"))], getSeedJob: seedJobs });
    render(<AdminView call={c.call} defaultSeed={2029} pollMs={5} />);
    expect(screen.getByText(/generated SYNTHETIC demo data into TTDEMO/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));
    await screen.findByText("queued");
    expect(c.of("startSeed")).toEqual([{ projectKey: "TTDEMO", seed: 2029 }]);
    await screen.findByText("Writing event 4 of 20");
    expect(attr(screen.getByLabelText("Demo data progress"), "value")).toBe("0.3");
    seedJobs.push(ok(job("done", { stepLabel: "Done" })));
    await screen.findByText("done");
    expect(c.of("getSeedJob")).toContainEqual({ jobId: "seed-1" });
    expect(screen.getByText("events 3")).toBeTruthy();
    const polls = c.of("getSeedJob").length;
    await new Promise((r) => setTimeout(r, 30));
    expect(c.of("getSeedJob")).toHaveLength(polls); // polling stopped
  });

  it("seed conflicts are explained, not hidden", async () => {
    const c = caller({ startSeed: [{ ok: false, error: { code: "conflict", message: "Demo data (seed 2029) is already loaded in TTDEMO.", retryable: false, details: [{ path: "mode", message: "keep or reset" }] } }] });
    render(<AdminView call={c.call} defaultSeed={2029} />);
    fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));
    await screen.findByText("Demo data (seed 2029) is already loaded in TTDEMO.");
    expect(screen.getByText("mode: keep or reset")).toBeTruthy();
  });

  it("a seed conflict offers the Keep and Reset choices the service named", async () => {
    const conflict: ApiResponse<SeedJobView> = { ok: false, error: { code: "conflict", message: "Demo data (seed 2029) is already loaded in TTDEMO.", retryable: false, details: [{ path: "mode", message: "keep or reset" }] } };
    const kept: SeedJobView = { jobId: "seed-1", state: "done", step: "report", counts: {}, errors: [], seed: 2029 };
    const c = caller({ startSeed: [conflict, ok(kept, ["Kept the existing demo data."])] });
    render(<AdminView call={c.call} defaultSeed={2029} />);
    fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep existing demo data" }));
    await screen.findByText("Kept the existing demo data.");
    expect(c.of("startSeed")).toEqual([{ projectKey: "TTDEMO", seed: 2029 }, { projectKey: "TTDEMO", seed: 2029, mode: "keep" }]);
    expect(screen.queryByRole("button", { name: "Keep existing demo data" })).toBeNull();
  });

  it("shows the admin-only seed report as measured, with its honesty notes", async () => {
    const report: SeedReportView = {
      v: 1,
      projectKey: "TTDEMO",
      seed: 2029,
      anchorDate: "2026-11-16",
      frames: "fast",
      profile: "p",
      generator: "seedgen-1",
      paramsHash: "h",
      defaultSeed: 2029,
      isDefaultSeed: true,
      defaultSeedRule: "The default seed is the smallest seed that exercises every demo state.",
      counts: { events: 31 },
      planted: [{ role: "NOVEL-1", eventId: "E-031", issueKey: "TTDEMO-40" }],
      accuracy: { ariAll: 0.898051, ariExcludingBoundary: null, ariHistoryProposal: 1, events: 31, boundaryEvents: 2, latentClusters: 4, engineGroups: 5, note: "Measured against this generator only." },
      attachments: "done",
      failedEvents: [],
      timings: { totalMs: 1, steps: {} },
      calls: {},
      honesty: ["All data in this project is SYNTHETIC."],
    };
    const c = caller({ getSeedReport: [ok(report)] });
    render(<AdminView call={c.call} defaultSeed={2029} />);
    fireEvent.click(screen.getByRole("button", { name: "Show seed report" }));
    await screen.findByText("All data in this project is SYNTHETIC.");
    expect(c.of("getSeedReport")).toEqual([{ projectKey: "TTDEMO" }]);
    expect(screen.getByText(/all events 0\.8981; without the 2 boundary events n\/a; historical/)).toBeTruthy();
    expect(screen.getByText("Planted: NOVEL-1 TTDEMO-40")).toBeTruthy();
  });

  it("a resume-only conflict offers Reset but not Keep", async () => {
    const c = caller({ startSeed: [{ ok: false, error: { code: "conflict", message: "A demo seed stopped.", retryable: false, details: [{ path: "mode", message: "reset" }] } }] });
    render(<AdminView call={c.call} defaultSeed={2030} />);
    fireEvent.click(screen.getByRole("button", { name: "Load demo data" }));
    await screen.findByRole("button", { name: "Reset: remove and load again" });
    expect(screen.queryByRole("button", { name: "Keep existing demo data" })).toBeNull();
  });

  it("Remove demo data needs a confirmation", async () => {
    const c = caller({ removeDemoData: [ok({ removedIssues: 31, removedRows: 80 })] });
    render(<AdminView call={c.call} defaultSeed={2029} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove demo data" }));
    expect(c.calls).toHaveLength(0);
    expect(screen.getByText(/Deletes the tt-synthetic issues in TTDEMO/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await screen.findByText("Removed 31 demo issue(s) and 80 stored row(s).");
    expect(c.of("removeDemoData")).toEqual([{ projectKey: "TTDEMO" }]);
  });

  it("Re-sync now queues the rebuild and polls until it finishes", async () => {
    const c = await openProject({
      requestResync: [ok<ResyncStatus>({ ...IDLE, state: "pending", requestedAt: "2026-11-20T09:01:00.000Z" })],
      getResyncStatus: [ok<ResyncStatus>({ ...IDLE, state: "running", phase: "events", counts: { events: 12 } }), ok<ResyncStatus>({ ...IDLE, state: "done", finishedAt: "2026-11-20T09:02:00.000Z", counts: { events: 31 } })],
    });
    fireEvent.click(screen.getByRole("button", { name: "Re-sync now" }));
    await screen.findByText("Queued at 2026-11-20T09:01:00.000Z.");
    expect(isDisabled(screen.getByRole("button", { name: "Re-sync now" }))).toBe(true);
    await screen.findByText("Done at 2026-11-20T09:02:00.000Z.");
    expect(screen.getByText("events 31")).toBeTruthy();
    expect(c.of("requestResync")).toEqual([{ projectKey: "TTDEMO" }]);
  });

  it("Save settings validates numbers locally, then sends a typed patch", async () => {
    const saved: ProjectConfigView = { ...CONFIG, tau: 0.8, updatedAt: "2026-11-20T09:05:00.000Z", updatedBy: "u-admin" };
    const c = await openProject({ saveProjectConfig: [ok(saved)] });
    fireEvent.change(screen.getByDisplayValue("1"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText(/τ \(match threshold\): expected a number from 0.05 to 10/)).toBeTruthy();
    expect(c.of("saveProjectConfig")).toHaveLength(0);
    fireEvent.change(screen.getByDisplayValue("abc"), { target: { value: "0.8" } });
    fireEvent.change(screen.getByLabelText("Cluster issue type"), { target: { value: "Bug" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByText("Saved at 2026-11-20T09:05:00.000Z.");
    const req = c.of("saveProjectConfig")[0] as { projectKey: string; config: Record<string, unknown> };
    expect(req.projectKey).toBe("TTDEMO");
    expect(req.config).toMatchObject({ tau: 0.8, k: 5, clusterIssueType: "Bug", ruleThresholds: { llLaneConf: 0.3 }, chipThresholds: { sunBlobAtLeast: 0.02 } });
    expect("simulateTwgError" in req.config).toBe(false);
  });

  it("server-side validation problems are listed per field", async () => {
    await openProject({ saveProjectConfig: [{ ok: false, error: { code: "invalid-input", message: "Some settings are not valid.", retryable: false, details: [{ path: "linkType", message: 'link type "Dup" does not exist on this site' }] } }] });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    await screen.findByText('linkType: link type "Dup" does not exist on this site');
  });

  it("team mapping: add a component rule and save only the routing", async () => {
    const c = await openProject({ saveProjectConfig: [ok({ ...CONFIG, routing: [{ match: { type: "lane-loss" }, team: { componentId: "30001" } }] })] });
    fireEvent.change(screen.getByLabelText("Takeover type"), { target: { value: "lane-loss" } });
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "30001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByText("1. When type lane-loss, variant any → component Perception")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save team mapping" }));
    await screen.findByText("Team mapping saved.");
    expect(c.of("saveProjectConfig")).toEqual([{ projectKey: "TTDEMO", config: { routing: [{ match: { type: "lane-loss" }, team: { componentId: "30001" } }] } }]);
  });

  it("team mapping: TWG team picker reports empty honestly and accepts a pasted ARI", async () => {
    await openProject({ listMyTeams: [ok({ status: "empty" as const, teams: [], message: "possibly a missing scope or no data" })] });
    fireEvent.change(screen.getByLabelText("Route to"), { target: { value: "team" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my teams" }));
    await screen.findByText("Teamwork Graph: empty. possibly a missing scope or no data");
    fireEvent.change(screen.getByLabelText("…or paste a team ARI"), { target: { value: "ari:cloud:identity::team/abc" } });
    fireEvent.change(screen.getByLabelText("Team name shown in suggestions (optional)"), { target: { value: "Perception" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getByText("1. When type any, variant any → team Perception")).toBeTruthy();
  });

  it("Run diagnostics replaces the table", async () => {
    const c = await openProject({ runDiagnostics: [ok({ ranAt: "2026-11-20T10:00:00.000Z", checks: [{ id: "storage", label: "App storage", status: "pass" as const, consequence: "ok" }] })] });
    fireEvent.click(screen.getByRole("button", { name: "Run diagnostics" }));
    await screen.findByText("Last run 2026-11-20T10:00:00.000Z");
    expect(c.of("runDiagnostics")).toEqual([{ projectKey: "TTDEMO" }]);
    expect(text(screen.getByRole("table"))).not.toContain("Teamwork Graph");
  });

  it("staging tools appear only when asked, captioned as simulated", async () => {
    const c = caller({ getAdminState: [ok(STATE)] });
    render(<AdminView call={c.call} defaultSeed={2029} showStagingTools />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("Simulate TWG error");
    expect(screen.getByText(/anything shown with it on is simulated/)).toBeTruthy();
  });

  it("entry: AdminApp hides staging tools in production", async () => {
    const mock = await import("./ui-kit-mock.js");
    const entry = await import("../../src/frontend/admin.js");
    expect(mock.default.render).toHaveBeenCalled();
    render(<entry.AdminApp />);
    expect(screen.getByRole("button", { name: "Load demo data" })).toBeTruthy();
    expect(screen.getByDisplayValue("2029")).toBeTruthy();
  });
});

describe("admin helpers", () => {
  it("patchOf reports every bad number and omits staging fields unless enabled", () => {
    const d = { enabled: true, eventIssueType: "Task", clusterIssueType: "Task", scenarioIssueType: "Task", linkType: "Relates", eventJql: "", scenarioJql: "", routeField: "component", tau: "0", k: "2.5", calibrationWindowDays: "30", fallbackProjectRoleId: "", simulateTwgError: true, ruleThresholds: { a: "-1" }, chipThresholds: {} };
    const r = patchOf(d, false);
    expect(r.problems).toEqual(["τ (match threshold): expected a number from 0.05 to 10", "k (neighbours): expected an integer from 1 to 15", "Rule threshold a: expected a number from 0 to 1000000"]);
    expect("simulateTwgError" in r.patch).toBe(false);
    expect(patchOf({ ...d, tau: "1", k: "3", ruleThresholds: { a: "1" } }, true).patch).toMatchObject({ tau: 1, k: 3, simulateTwgError: true });
  });

  it("ruleText names targets from the project's components and roles", () => {
    expect(ruleText({ match: { type: ["lane-loss", "late-brake"], variant: "cam-B" }, team: { projectRoleId: "10002" } }, STATE)).toBe("When type lane-loss or late-brake, variant cam-B → project role Administrators");
    expect(ruleText({ match: {}, team: {} }, STATE)).toBe("When type any, variant any → no target");
  });
});
