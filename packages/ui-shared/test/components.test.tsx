// @vitest-environment jsdom
import "./dom-setup.js";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import * as ui from "../src/index.js";

afterEach(cleanup);

const series = (key: string) => ({
  key,
  hz: 10,
  tStart: -15,
  channels: { lane_conf: Array.from({ length: 201 }, (_, k) => (k > 120 && k <= 150 ? 0.2 : 0.9)), lane_offset: Array.from({ length: 201 }, (_, k) => k / 200) },
});

describe("SignalPlot / OverlayPlot", () => {
  it("draws one strip per channel, the takeover marker at t = 0 and a text description", () => {
    render(<ui.SignalPlot series={series("TEST-1")} />);
    const svg = screen.getByTestId("tt-signal-plot");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelectorAll("[data-channel]").length).toBe(2);
    const marker = within(svg as unknown as HTMLElement).getByTestId("tt-takeover-marker");
    // x(0) for tStart -15 .. 5 over [112, 628]: 112 + 15/20 * 516 = 499
    expect(Number(marker.getAttribute("x1"))).toBeCloseTo(499);
    expect(svg.querySelector("desc")?.textContent).toContain("Lane confidence (0..1): min 0.20 at -2.9 s");
    expect(svg.textContent).toContain("+5 s");
  });

  it("overlays at most three neighbours with distinct dash patterns and a legend", () => {
    render(<ui.OverlayPlot event={series("TEST-1")} neighbours={[series("TEST-2"), series("TEST-3"), series("TEST-4"), series("TEST-5")]} channels={["lane_conf"]} />);
    const svg = screen.getByTestId("tt-overlay-plot");
    const paths = svg.querySelectorAll('[data-channel="lane_conf"] path');
    expect(paths.length).toBe(4);
    expect(new Set(Array.from(paths).map((p) => p.getAttribute("stroke-dasharray") ?? "")).size).toBe(4);
    expect(svg.textContent).toContain("TEST-1 (this event)");
    expect(svg.textContent).not.toContain("TEST-5");
  });

  it("says so when there is nothing to plot", () => {
    render(<ui.SignalPlot series={{ key: "X", hz: 10, tStart: -15, channels: {} }} />);
    expect(screen.getByTestId("tt-signal-plot").textContent).toContain("No plottable channels");
  });
});

describe("WhyTable", () => {
  it("ranks features by contribution and shows n/a notes and the condition term", () => {
    render(
      <ui.WhyTable
        rows={[
          { feature: "F1", key: "peakLatOffset", label: "peak lateral offset", unit: "m", eventValue: 0.9, referenceValue: 0.8, z: 0.6, contribution: 0.25, note: "" },
          { feature: "F6", key: "minLaneConf", label: "min lane confidence", unit: "0..1", eventValue: 0.2, referenceValue: 0.25, z: 0.5, contribution: 0.75, note: "" },
          { feature: "F3", key: "minTtc", label: "min TTC", unit: "s", eventValue: null, referenceValue: null, z: null, contribution: null, note: "n/a (channel not mapped)" },
        ]}
        headlines={["Bucket: lane-loss x cam-B", "d*=0.21 < τ=1.00"]}
        conditionTerm={{ dCond: 0.5, chipDifference: ["night"] }}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]?.getAttribute("data-testid")).toBe("tt-why-row-F6");
    expect(rows[1]?.getAttribute("data-testid")).toBe("tt-why-row-F1");
    expect(screen.getByTestId("tt-why-row-F6").textContent).toContain("75%");
    expect(screen.getByTestId("tt-why-row-F3").textContent).toContain("n/a (channel not mapped)");
    expect(screen.getByTestId("tt-why-condition-term").textContent).toContain("Differs: night");
    expect(screen.getByTestId("tt-why-bucket-rule").textContent).toBe("Bucket: lane-loss x cam-B");
    expect(screen.getByTestId("tt-why-headline").textContent).toBe("d*=0.21 < τ=1.00");
  });
});

describe("badges", () => {
  it("ConfidenceBadge exposes its definition on a keyboard toggle", () => {
    render(<ui.ConfidenceBadge confidence={{ value: 0.79, definition: "1 - d*/τ", inputs: { dStar: 0.21, tau: 1 } }} />);
    const badge = screen.getByTestId("tt-confidence");
    expect(badge.textContent).toContain("79%");
    const toggle = screen.getByTestId("tt-confidence-toggle");
    const def = badge.querySelector("[id$='-def']") as HTMLElement;
    expect(def.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(def.hidden).toBe(false);
    expect(def.textContent).toBe("1 - d*/τ (dStar = 0.21, tau = 1)");
  });

  it("ConditionChips show the rule that fired and the image-statistics caption", () => {
    render(<ui.ConditionChips chips={[{ chip: "low-sun-glare", rules: ["glare 0.071 >= 0.05"] }]} showRules caption />);
    expect(screen.getByTestId("tt-chip-low-sun-glare").textContent).toContain("glare 0.071 >= 0.05");
    expect(screen.getByText("Image statistics, not scene understanding.")).toBeTruthy();
  });

  it("EvidenceLink opens through the navigator", () => {
    const opened: string[] = [];
    render(
      <ui.NavigationProvider navigator={{ open: async (u) => void opened.push(u), navigate: async () => undefined }}>
        <ui.IssueLink issueKey="TEST-1" index={0} />
      </ui.NavigationProvider>,
    );
    const a = screen.getByTestId("tt-evidence-link-0");
    expect(a.getAttribute("href")).toBe("/browse/TEST-1");
    expect(a.getAttribute("target")).toBeNull();
    fireEvent.click(a);
    expect(opened).toEqual(["/browse/TEST-1"]);
  });

  it("SyntheticBadge carries the DEMO_SCRIPT wording", () => {
    render(<ui.SyntheticBadge />);
    expect(screen.getByTestId("tt-synthetic-badge").textContent).toBe("SYNTHETIC DEMO DATA: no real fleet, vehicles or people");
  });
});

describe("GapGrid", () => {
  it("marks gaps with text, not colour only, and selects cells by keyboard-operable buttons", () => {
    const picked: string[] = [];
    render(
      <ui.GapGrid
        grid={{ columns: ["lane-loss", "late-brake"], rows: [{ dimension: "cond", value: "low-sun-glare", cells: [{ type: "lane-loss", events: 9, tests: 0, gap: true }, { type: "late-brake", events: 0, tests: 0, gap: false }] }] }}
        onSelect={(c) => picked.push(`${c.value}/${c.type}`)}
      />,
    );
    const gap = screen.getByTestId("tt-gap-cell-cond-low-sun-glare-lane-loss");
    expect(gap.getAttribute("data-gap")).toBe("true");
    expect(gap.textContent).toContain("! 9 / 0");
    expect(gap.textContent).toContain("lane-loss x low-sun-glare: 9 events, 0 scenario tests (gap)");
    fireEvent.click(within(gap).getByRole("button"));
    expect(picked).toEqual(["low-sun-glare/lane-loss"]);
    expect(within(screen.getByTestId("tt-gap-cell-cond-low-sun-glare-late-brake")).queryByRole("button")).toBeNull();
  });
});

describe("Onset", () => {
  const onset = {
    verdict: "regression-likely" as const,
    onsetBuild: "4.12.0",
    k1: 0,
    e1Km: 3100,
    k2: 8,
    e2Km: 2400,
    ratePer1000kmBefore: 0,
    ratePer1000kmAfter: 3.33,
    rateRatio: "∞" as const,
    rrCi95: [2.5, "∞"] as const,
    pRaw: 0.0013,
    pScan: 0.0026,
    pHolm: 0.0052,
    holmFamilySize: 4,
    boundariesTested: 2,
    exposureFilter: "variant cam-B",
    buildsWithoutExposure: [],
    builds: [
      { build: "4.11.0", events: 0, km: 3100 },
      { build: "4.12.0", events: 8, km: 2400 },
    ],
    headline: "Regression likely at 4.12.0",
    caveats: [],
  };

  it("OnsetBadge shows the verdict, raw and Holm p and the plain-words sentence", () => {
    render(<ui.OnsetBadge onset={onset} showWords />);
    const b = screen.getByTestId("tt-onset-verdict");
    expect(b.getAttribute("data-verdict")).toBe("regression-likely");
    expect(b.textContent).toContain("p_raw 0.0013 · p_holm 0.0052");
    expect(b.textContent).toContain("about 1 time in 190");
  });

  it("not-enough-data shows the message and no p-value", () => {
    render(<ui.OnsetBadge onset={{ ...onset, verdict: "not-enough-data", pRaw: null, pScan: null, pHolm: null, message: "Exposure unknown. Add drive sessions." }} showWords />);
    const b = screen.getByTestId("tt-onset-verdict");
    expect(b.textContent).toContain("Exposure unknown. Add drive sessions.");
    expect(b.textContent).not.toContain("p_raw");
  });

  it("OnsetBars marks the onset build and the how-to lists every input", () => {
    render(
      <>
        <ui.OnsetBars onset={onset} />
        <ui.OnsetHowTo onset={onset} />
      </>,
    );
    const bars = screen.getByTestId("tt-onset-bars");
    expect(bars.querySelector('[data-build="4.12.0"]')?.textContent).toContain("← onset");
    expect(bars.getAttribute("aria-label")).toContain("4.12.0: 8 events in 2,400 km, 3.33 per 1,000 km");
    const howto = screen.getByTestId("tt-onset-howto").closest("details");
    expect(howto?.textContent).toContain("0 events / 3,100 km");
    expect(howto?.textContent).toContain("∞ (2.5 to ∞)");
    expect(howto?.textContent).toContain("not the probability that the build caused");
    // The Holm family is every tested cluster of the project, also when shown in an issue panel.
    expect(howto?.textContent).toContain("Holm-corrected across the 4 tested clusters of this project");
    expect(howto?.textContent).not.toContain("on screen");
  });
});

describe("status", () => {
  it("ApiErrorMessage offers retry only when retryable", () => {
    let retried = 0;
    const { rerender } = render(<ui.ApiErrorMessage error={{ code: "unavailable", message: "down", retryable: true }} onRetry={() => retried++} />);
    fireEvent.click(screen.getByTestId("tt-retry"));
    expect(retried).toBe(1);
    rerender(<ui.ApiErrorMessage error={{ code: "invalid-input", message: "bad", retryable: false, details: [{ path: "event.ctx", message: "missing" }] }} onRetry={() => retried++} />);
    expect(screen.queryByTestId("tt-retry")).toBeNull();
    expect(screen.getByTestId("tt-error").textContent).toContain("event.ctx: missing");
  });
});
