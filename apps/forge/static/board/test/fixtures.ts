/**
 * Contract-shaped TEST fixtures for the board (keys `TEST-*`; not demo data).
 */
import type { BoardView, ResyncStatus } from "../../common/api.js";
import { clusterRef, conf, coverageView, eventSummary, onsetView } from "../../common/testing.js";

export const idleResync: ResyncStatus = { projectKey: "TEST", state: "idle", counts: {} };

export function boardView(over: Partial<BoardView> = {}): BoardView {
  return {
    projectKey: "TEST",
    empty: false,
    clusters: [
      {
        cluster: clusterRef("TEST-5", "Lane-loss · low sun · cam-B", "lane-loss|cam-B", 9),
        type: "lane-loss",
        variant: "cam-B",
        conditions: ["low-sun-glare"],
        buildsSeen: ["4.12.0"],
        acceptedCount: 9,
        newSinceTriage: 3,
        pendingSuggestions: ["TEST-11"],
        onset: onsetView(),
        coverage: coverageView(),
        owner: { ruleIndex: 0, ruleText: "type = lane-loss", team: "Perception (test team)" },
        status: "open",
        medoidKey: "TEST-6",
      },
      {
        cluster: clusterRef("TEST-20", "Late-brake · night · cam-A", "late-brake|cam-A", 6),
        type: "late-brake",
        variant: "cam-A",
        conditions: ["night"],
        buildsSeen: ["4.11.0", "4.11.3", "4.12.0"],
        acceptedCount: 6,
        newSinceTriage: 0,
        pendingSuggestions: [],
        onset: onsetView({ verdict: "no-evidence", onsetBuild: null, pRaw: 0.41, pScan: 0.8, pHolm: 1, rateRatio: 1.1, headline: "No evidence of onset" }),
        coverage: coverageView({ verdict: "covered", tests: ["TEST-30"], missing: [], text: "Covered by 1 test", confidence: conf(1, "matched dimensions / 4") }),
        owner: null,
        status: "open",
        medoidKey: null,
      },
    ],
    novel: [
      {
        event: eventSummary("TEST-40", { type: "cut-in-response", chips: [] }),
        reason: "exceeds-tau",
        nearestCluster: clusterRef("TEST-5", "Lane-loss · low sun · cam-B"),
        dStar: 1.7,
        tau: 1,
        message: "Proposed new cluster",
        evidence: [],
      },
    ],
    proposedGroups: [],
    unassignedCount: 2,
    sinceLastTriage: { at: "2026-11-13T17:00:00Z", by: "Test User", newEvents: 4, source: "mark-triaged" },
    gapGrid: {
      columns: ["lane-loss", "late-brake"],
      rows: [
        { dimension: "cond", value: "low-sun-glare", cells: [{ type: "lane-loss", events: 9, tests: 0, gap: true }, { type: "late-brake", events: 0, tests: 0, gap: false }] },
        { dimension: "cond", value: "night", cells: [{ type: "lane-loss", events: 0, tests: 0, gap: false }, { type: "late-brake", events: 6, tests: 1, gap: false }] },
      ],
    },
    scenarioJql: "labels = tt-scenario",
    scenarioCount: 1,
    holmFamilySize: 2,
    resync: idleResync,
    totals: { events: 18, accepted: 15, proposed: 1, novel: 1, clusters: 2 },
    synthetic: true,
    caveats: ["p-values are a screening signal."],
    disclaimer: "Takeover Triage surfaces evidence for engineers. It is not a safety tool and makes no safety or compliance claim.",
    builtAt: "2026-11-20T08:00:00Z",
    ...over,
  };
}
