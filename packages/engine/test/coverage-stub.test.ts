import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { ConditionSignature } from "../src/schema/index.js";
import { representativeEvents, scenarioStub, stubLabels, stubSummary, type StubEvent } from "../src/coverage/index.js";

const LC_A: ConditionSignature = { type: "lane-loss", variant: "cam-B", chips: ["low-sun-glare"], odd: ["highway"] };

const members: StubEvent[] = [
  { key: "TT-12", distanceToMedoid: 0.4, occurredAt: "2026-11-14T09:12:33Z", vehicleId: "V-02", build: "4.12.0", chips: ["low-sun-glare"], odd: ["highway", "low-sun"] },
  { key: "TT-9", distanceToMedoid: 0, occurredAt: "2026-11-13T08:01:00Z", vehicleId: "V-03", build: "4.12.0", chips: ["low-sun-glare"], odd: ["highway"] },
  { key: "TT-30", distanceToMedoid: 0.2 },
  { key: "TT-31", distanceToMedoid: 0.4 },
  { key: "TT-40", distanceToMedoid: Number.NaN },
];

describe("representativeEvents", () => {
  it("returns the medoid then the 2 nearest, ties by key", () => {
    expect(representativeEvents(members).map((e) => e.key)).toEqual(["TT-9", "TT-30", "TT-12"]);
    expect(representativeEvents(members, 5).map((e) => e.key)).toEqual(["TT-9", "TT-30", "TT-12", "TT-31", "TT-40"]);
  });

  it("is independent of input order (property)", () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.record({ key: fc.integer({ min: 1, max: 500 }).map((n) => `E-${n}`), distanceToMedoid: fc.double({ min: 0, max: 10, noNaN: true }) }), { selector: (e) => e.key }), (ms) => {
        expect(representativeEvents([...ms].reverse())).toEqual(representativeEvents(ms));
      }),
    );
  });
});

describe("scenarioStub", () => {
  const stub = scenarioStub({
    clusterKey: "TTDEMO-50",
    clusterName: "Lane-loss, cam-B, low sun",
    signature: LC_A,
    members,
    coverage: { verdict: "uncovered", tests: [], missing: ["type"], text: "0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway" },
  });

  it("uses the deterministic summary and signature labels", () => {
    expect(stub.summary).toBe("Scenario: Lane-loss, cam-B, low sun (from TTDEMO-50)");
    expect(stub.labels).toEqual(["tt-scenario", "type:lane-loss", "variant:cam-B", "cond:low-sun-glare", "odd:highway"]);
    expect(stub.links).toEqual({ cluster: "TTDEMO-50", events: ["TT-9", "TT-30", "TT-12"] });
    expect(stub.narrativeSource).toBe("template");
  });

  it("renders the evidence table and description deterministically", () => {
    expect(stub.evidence.header).toEqual(["Event", "Role", "Distance", "Occurred", "Vehicle", "Build", "Chips", "ODD"]);
    expect(stub.evidence.rows[0]).toEqual(["TT-9", "medoid", "0.00", "2026-11-13T08:01:00Z", "V-03", "4.12.0", "low-sun-glare", "highway"]);
    expect(stub.evidence.rows[1]).toEqual(["TT-30", "nearest 1", "0.20", "-", "-", "-", "-", "-"]);
    expect(stub.description).toContain("Coverage before this stub: 0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway.");
    expect(stub.description).toContain("| TT-12 | nearest 2 | 0.40 |");
    expect(stub.description.split("\n").slice(0, 3)).toEqual(["Scenario stub created by Takeover Triage from cluster TTDEMO-50 (Lane-loss, cam-B, low sun).", "", "Condition signature:"]);
  });

  it("labels a chip-less signature cond:normal and sanitises spaces", () => {
    expect(stubLabels({ type: "lateral-drift", variant: "cam B", chips: [], odd: [] })).toEqual(["tt-scenario", "type:lateral-drift", "variant:cam-B", "cond:normal"]);
  });

  it("keeps the summary within 255 characters", () => {
    const s = stubSummary("x".repeat(400), "TTDEMO-1");
    expect(s.length).toBe(255);
    expect(s.endsWith("... (from TTDEMO-1)")).toBe(true);
  });
});
