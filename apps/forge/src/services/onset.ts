/**
 * Build-onset screen per cluster (ARCHITECTURE §5.9, PRD US-14).
 *
 * Exposure comes from drive-session rows of the cluster's sensor variant (never a typed-in
 * number); events are the cluster's ACCEPTED members per build. The engine scans every build
 * boundary (Bonferroni over boundaries); Holm runs across the clusters in the current view.
 */
import { applyHolm, onsetScan, type BuildExposure, type OnsetResult } from "@tt/engine";
import type { OnsetView } from "../contract/ui-api";
import type { DriveSessionRow, EventRow } from "../ports/entities";
import { confidence, issueEvidence, round } from "./evidence";
import type { Keyed } from "./index-store";

export const ONSET_CAVEATS = [
  "Screening signal, not a causal attribution.",
  "Assumes events are Poisson in km and that the ODD mix is comparable across builds.",
] as const;

export const EXPOSURE_UNKNOWN = "Exposure unknown. Add drive sessions.";

/** Per-build events (accepted members) and km (drive sessions of the variant), in build order. */
export function exposureFor(sessions: readonly DriveSessionRow[], memberBuilds: readonly string[], compare: (a: string, b: string) => number): BuildExposure[] {
  const km = new Map<string, number>();
  for (const s of sessions) if (Number.isFinite(s.km) && s.km > 0) km.set(s.build, (km.get(s.build) ?? 0) + s.km);
  const events = new Map<string, number>();
  for (const b of memberBuilds) events.set(b, (events.get(b) ?? 0) + 1);
  const builds = [...new Set([...km.keys(), ...events.keys()])].sort(compare);
  return builds.map((build) => ({ build, events: events.get(build) ?? 0, km: km.get(build) ?? 0 }));
}

export interface OnsetSubject {
  readonly clusterId: string;
  readonly clusterKey: string;
  readonly variant: string;
  readonly members: readonly Keyed<EventRow>[];
}

interface Scanned {
  readonly subject: OnsetSubject;
  readonly exposure: readonly BuildExposure[];
  readonly sessions: number;
  readonly onset: OnsetResult;
}

const per1000 = (k: number, km: number): number | null => (km > 0 ? round((k / km) * 1000, 3) : null);
const inf = (x: number): number | "∞" => (Number.isFinite(x) ? round(x, 4) : "∞");

function notEnoughMessage(s: Scanned): string {
  if (s.sessions === 0) return EXPOSURE_UNKNOWN;
  const n = s.exposure.reduce((a, b) => a + b.events, 0);
  const withKm = s.exposure.filter((b) => b.km > 0).length;
  if (withKm < 2) return `${EXPOSURE_UNKNOWN} At least two builds need drive sessions (have ${withKm}).`;
  return `Not enough events: the test needs at least 3 accepted members (have ${n}).`;
}

function viewOf(s: Scanned, pHolm: number | null, verdict: OnsetView["verdict"], familySize: number): OnsetView {
  const o = s.onset;
  const filter = `Exposure filtered to ${s.subject.variant} vehicles`;
  const builds = s.exposure.map((b) => ({ build: b.build, events: b.events, km: round(b.km, 1) }));
  const evidence = [
    { kind: "driveSessions" as const, url: "", label: `${s.sessions} drive sessions, ${round(s.exposure.reduce((a, b) => a + b.km, 0), 1)} km on ${s.subject.variant}` },
    issueEvidence(s.subject.clusterKey, "Cluster"),
    ...s.subject.members.slice(0, 25).map((m) => issueEvidence(m.value.issueKey, `Member on ${m.value.build}`)),
  ];
  const caveats = [...ONSET_CAVEATS, `${filter}.`, `Holm correction across the ${familySize} tested cluster(s) of this project (the board), not only this one.`];
  if (verdict === "not-enough-data") {
    const message = notEnoughMessage(s);
    return {
      verdict,
      onsetBuild: null,
      k1: 0,
      e1Km: 0,
      k2: 0,
      e2Km: 0,
      ratePer1000kmBefore: null,
      ratePer1000kmAfter: null,
      rateRatio: null,
      rrCi95: null,
      pRaw: null,
      pScan: null,
      pHolm: null,
      holmFamilySize: familySize,
      boundariesTested: Math.max(0, s.exposure.filter((b) => b.km > 0).length - 1),
      exposureFilter: filter,
      buildsWithoutExposure: o.excludedBuilds,
      builds,
      headline: `Not enough data: ${message}`,
      message,
      caveats,
      confidence: confidence(0, `No test was run: ${message}`),
      evidence,
    };
  }
  const p = pHolm ?? o.pScan ?? 1;
  const label = verdict === "regression-likely" ? "Regression likely" : verdict === "inconclusive" ? "Inconclusive" : "No evidence of onset";
  const headline = `${label} at ${o.onsetBuild ?? "?"}: ${o.after.events} events in ${round(o.after.km, 0)} km vs ${o.before.events} in ${round(o.before.km, 0)} km (p_raw=${(o.pRaw ?? 1).toPrecision(2)}, p_holm=${p.toPrecision(2)})`;
  return {
    verdict,
    onsetBuild: o.onsetBuild,
    k1: o.before.events,
    e1Km: round(o.before.km, 1),
    k2: o.after.events,
    e2Km: round(o.after.km, 1),
    ratePer1000kmBefore: per1000(o.before.events, o.before.km),
    ratePer1000kmAfter: per1000(o.after.events, o.after.km),
    rateRatio: o.rateRatio === null ? null : inf(o.rateRatio),
    rrCi95: o.rateRatioCi95 === null ? null : [inf(o.rateRatioCi95.lower), inf(o.rateRatioCi95.upper)],
    pRaw: o.pRaw,
    pScan: o.pScan,
    pHolm,
    holmFamilySize: familySize,
    boundariesTested: o.boundaries.length,
    exposureFilter: filter,
    buildsWithoutExposure: o.excludedBuilds,
    builds,
    headline,
    caveats,
    confidence: confidence(1 - p, "1 − p_holm of the boundary scan: a screening strength, not the probability that the build caused the increase", { pRaw: o.pRaw ?? 1, pScan: o.pScan ?? 1, pHolm: p }),
    evidence,
  };
}

/**
 * Onset views for every subject, with Holm across all of them (the view's family).
 * `sessionsByVariant` holds the drive sessions per sensor variant.
 */
export function onsetViews(subjects: readonly OnsetSubject[], sessionsByVariant: ReadonlyMap<string, readonly DriveSessionRow[]>, compare: (a: string, b: string) => number): Map<string, OnsetView> {
  const scanned: Scanned[] = subjects.map((subject) => {
    const sessions = sessionsByVariant.get(subject.variant) ?? [];
    const exposure = exposureFor(sessions, subject.members.map((m) => m.value.build), compare);
    return { subject, exposure, sessions: sessions.length, onset: onsetScan(exposure) };
  });
  const adjusted = applyHolm(scanned);
  const family = scanned.filter((s) => s.onset.pScan !== null).length;
  const out = new Map<string, OnsetView>();
  for (const a of adjusted) out.set(a.subject.clusterId, viewOf(a, a.pHolm, a.verdict, family));
  return out;
}

export function sessionsOf(rows: readonly Keyed<DriveSessionRow>[]): DriveSessionRow[] {
  return rows.map((r) => r.value);
}
