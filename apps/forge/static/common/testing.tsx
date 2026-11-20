/**
 * Test / dev-harness helpers shared by the three apps: a fake typed client, a recording
 * navigator and contract-shaped fixture builders. Fixture values are TEST DATA (keys `TEST-*`),
 * not demo data; demo data comes only from seedgen (SEED_DATA.md).
 */
import { createFakeClient, NavigationProvider, type FakeHandlers, type Navigator } from "@tt/ui-shared";
import type { ReactNode } from "react";
import type {
  ClusterRef,
  Confidence,
  CoverageView,
  EventSummary,
  MatchView,
  OnsetView,
  TelemetrySeries,
  UiApi,
  WhyRowView,
} from "../../src/contract/ui-api.js";
import type { TtClient } from "./api.js";

export type FakeTtClient = TtClient & { readonly calls: { readonly method: string; readonly req: unknown }[] };

export function fakeClient(handlers: FakeHandlers<UiApi>): FakeTtClient {
  return createFakeClient<UiApi>(handlers);
}

export interface RecordingNavigator extends Navigator {
  readonly opened: string[];
  readonly navigated: string[];
}

export function recordingNavigator(): RecordingNavigator {
  const opened: string[] = [];
  const navigated: string[] = [];
  return {
    opened,
    navigated,
    open: async (url) => {
      opened.push(url);
    },
    navigate: async (url) => {
      navigated.push(url);
    },
  };
}

export function WithNavigator({ navigator, children }: { readonly navigator: Navigator; readonly children: ReactNode }) {
  return <NavigationProvider navigator={navigator}>{children}</NavigationProvider>;
}

// ------------------------------------------------------------------ fixture builders

export const conf = (value: number, definition = "test definition"): Confidence => ({ value, definition });

export function clusterRef(key: string, name: string, bucket = "lane-loss|cam-B", memberCount = 3): ClusterRef {
  return { key, id: key.replace(/\D/g, "") || "1", name, bucket, memberCount, url: `/browse/${key}` };
}

export function eventSummary(key: string, over: Partial<EventSummary> = {}): EventSummary {
  return {
    key,
    id: key.replace(/\D/g, "") || "1",
    type: "lane-loss",
    variant: "cam-B",
    build: "4.12.0",
    bucket: "lane-loss|cam-B",
    chips: ["low-sun-glare"],
    occurredAt: "2026-11-14T09:12:33Z",
    vehicleId: "VEH-TEST-1",
    synthetic: true,
    tampered: false,
    engine: "1.0.0",
    ...over,
  };
}

export function onsetView(over: Partial<OnsetView> = {}): OnsetView {
  return {
    verdict: "regression-likely",
    onsetBuild: "4.12.0",
    k1: 0,
    e1Km: 2560,
    k2: 9,
    e2Km: 1760,
    ratePer1000kmBefore: 0,
    ratePer1000kmAfter: 5.11,
    rateRatio: "∞",
    rrCi95: [2.1, "∞"],
    pRaw: 0.00031,
    pScan: 0.00062,
    pHolm: 0.0025,
    holmFamilySize: 4,
    boundariesTested: 2,
    exposureFilter: "variant cam-B",
    buildsWithoutExposure: [],
    builds: [
      { build: "4.11.0", events: 0, km: 1200 },
      { build: "4.11.3", events: 0, km: 1360 },
      { build: "4.12.0", events: 9, km: 1760 },
    ],
    headline: "Regression likely at 4.12.0 (p_holm 0.0025)",
    caveats: ["Screening signal across clusters on screen."],
    confidence: conf(0.9975, "1 - p_holm; not the probability that the build caused the increase"),
    evidence: [{ kind: "driveSessions", url: "/browse/TEST-1", label: "drive sessions" }],
    ...over,
  };
}

export function coverageView(over: Partial<CoverageView> = {}): CoverageView {
  return {
    state: "ok",
    verdict: "uncovered",
    signature: { type: "lane-loss", variant: "cam-B", chips: ["low-sun-glare"], odd: ["highway"], text: "lane-loss x low-sun-glare x cam-B x highway" },
    tests: [],
    missing: ["type", "variant", "cond", "odd"],
    text: "0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway",
    scenarioJql: "labels = tt-scenario",
    confidence: conf(0, "matched dimensions / 4"),
    evidence: [],
    ...over,
  };
}

export function whyRows(): WhyRowView[] {
  return [
    { feature: "F6", key: "minLaneConf", label: "min lane confidence", unit: "0..1", eventValue: 0.22, referenceValue: 0.25, z: 0.3, contribution: 0.6, note: "" },
    { feature: "F1", key: "peakLatOffset", label: "peak lateral offset", unit: "m", eventValue: 0.9, referenceValue: 0.85, z: 0.33, contribution: 0.4, note: "" },
    { feature: "F3", key: "minTtc", label: "min TTC", unit: "s", eventValue: null, referenceValue: null, z: null, contribution: null, note: "n/a (channel not mapped)" },
  ];
}

/** A 201-sample window with a lane-confidence dip before the takeover. */
export function series(key: string, dip = 0.22): TelemetrySeries {
  const n = 201;
  const laneConf: (number | null)[] = [];
  const laneOffset: (number | null)[] = [];
  for (let k = 0; k < n; k++) {
    const t = -15 + k / 10;
    laneConf.push(t > -3 && t <= 0 ? dip : 0.95);
    laneOffset.push(k === 50 ? null : Math.max(0, (t + 5) * 0.1));
  }
  return { key, hz: 10, tStart: -15, channels: { lane_conf: laneConf, lane_offset: laneOffset } };
}

export function matchView(over: Partial<MatchView> = {}): MatchView {
  const cluster = clusterRef("TEST-5", "Lane-loss · low sun · cam-B");
  return {
    event: eventSummary("TEST-7"),
    result: "match",
    cluster,
    alternatives: [clusterRef("TEST-9", "Lane-loss · cam-B other")],
    dStar: 0.21,
    tau: 1,
    confidence: conf(0.79, "1 - d*/τ clamped to [0, 1]"),
    neighbours: [
      { key: "TEST-2", d: 0.18, clusterKey: "TEST-5" },
      { key: "TEST-3", d: 0.25, clusterKey: "TEST-5" },
      { key: "TEST-4", d: null, clusterKey: "TEST-9" },
    ],
    why: whyRows(),
    headlines: ["Bucket: lane-loss x cam-B", "Nearest: TEST-2 d=0.18 < τ=1.00"],
    evidence: [{ kind: "issue", key: "TEST-5", url: "/browse/TEST-5", label: "TEST-5" }],
    message: "Matches Lane-loss · low sun · cam-B",
    ...over,
  };
}
