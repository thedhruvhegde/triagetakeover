import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildTruth, CLUSTERS, isEligible, NOTE_BRAKED_HARD, NOTE_DRIFTED_LEFT, NOTE_STEERING_LIGHT, parseIsoDate, PLANTED, planFleet,
  routeType, SCENARIO_ROWS, validateConfig, type DriveSessionRecord, type EventSpec, type FleetPlanOutput, type SeedConfig,
} from "../src/index.js";

const cfg = (seed: number, frames: SeedConfig["frames"] = "fast"): SeedConfig => ({ seed, anchorDate: "2026-11-16", profile: "demo-v1", frames });
const ANCHOR = parseIsoDate("2026-11-16") ?? 0;
const dayOf = (iso: string): number => parseIsoDate(iso.slice(0, 10)) ?? NaN;
const seedArb = fc.integer({ min: 0, max: 0xffffffff });

const byRole = (plan: FleetPlanOutput, role: string): EventSpec | undefined => plan.events.find((e) => e.roles.some((r) => r === role));

describe("config", () => {
  it("rejects bad seeds, dates and profiles", () => {
    expect(() => validateConfig({ ...cfg(1), seed: -1 })).toThrow(RangeError);
    expect(() => validateConfig({ ...cfg(1), seed: 1.5 })).toThrow(RangeError);
    expect(() => validateConfig({ ...cfg(1), anchorDate: "2026-13-01" })).toThrow(RangeError);
    expect(() => validateConfig({ ...cfg(1), profile: "x" as "demo-v1" })).toThrow(RangeError);
    expect(validateConfig(cfg(0xffffffff))).toBe(ANCHOR);
  });
});

describe("fleet and sessions (§5, §6)", () => {
  const plan = planFleet(cfg(1));

  it("has 3 vehicles with the pre-registered variants and calibration dates", () => {
    expect(plan.vehicles.map((v) => [v.vehicleId, v.variant, v.rateHz])).toEqual([["V-01", "cam-A", 100], ["V-02", "cam-B", 50], ["V-03", "cam-B", 200]]);
    expect(plan.vehicles.map((v) => ANCHOR - dayOf(v.calibration["camera-front"] ?? ""))).toEqual([62, 17, 50]);
    expect(plan.vehicles.every((v) => v.synthetic && v.label.startsWith("SYN test vehicle"))).toBe(true);
  });

  it("has 40 sessions with the §6.1 counts per vehicle and build", () => {
    expect(plan.driveSessions).toHaveLength(40);
    const count = (v: string, b: string): number => plan.driveSessions.filter((s) => s.vehicleId === v && s.build === b).length;
    expect([count("V-01", "4.11.0"), count("V-01", "4.11.3"), count("V-01", "4.12.0")]).toEqual([4, 4, 5]);
    expect([count("V-02", "4.11.0"), count("V-02", "4.11.3"), count("V-02", "4.12.0")]).toEqual([4, 4, 6]);
    expect([count("V-03", "4.11.0"), count("V-03", "4.11.3"), count("V-03", "4.12.0")]).toEqual([4, 4, 5]);
    expect(plan.driveSessions.map((s) => s.sessionId)).toEqual(Array.from({ length: 40 }, (_, i) => `DS-${String(i + 1).padStart(4, "0")}`));
  });

  it("puts 2 cam-A and 3 cam-B sessions on the final weekend, and history before the triage mark", () => {
    const weekend = plan.driveSessions.filter((s) => s.weekend);
    expect(weekend.filter((s) => s.variant === "cam-A")).toHaveLength(2);
    expect(weekend.filter((s) => s.variant === "cam-B")).toHaveLength(3);
    for (const s of weekend) expect([-2, -1]).toContain(dayOf(s.date) - ANCHOR);
    const mark = dayOf(plan.triagedMark) * 86400 + 17 * 3600;
    expect(plan.triagedMark).toBe("2026-11-13T17:00:00Z");
    for (const s of plan.driveSessions.filter((x) => !x.weekend)) expect(s.startEpoch + s.durationMin * 60).toBeLessThan(mark);
  });

  it("keeps dates in build windows, km in route ranges and ≈ 6,400 km in total", () => {
    const windows: Record<string, [number, number]> = { "4.11.0": [-42, -29], "4.11.3": [-28, -15], "4.12.0": [-14, -1] };
    let total = 0;
    for (const s of plan.driveSessions) {
      const [lo, hi] = windows[s.build] ?? [0, 0];
      const off = dayOf(s.date) - ANCHOR;
      expect(off >= lo && off <= hi).toBe(true);
      const [kLo, kHi] = s.route === "highway" ? [140, 260] : [60, 140];
      expect(s.km >= kLo && s.km <= kHi).toBe(true);
      expect(s.odd).toEqual([s.route, s.light, s.weather]);
      total += s.km;
    }
    expect(total).toBeGreaterThan(5000);
    expect(total).toBeLessThan(8000);
  });

  it("G-T10: every cluster x build has an eligible historical session and every planted role a weekend one", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const p = planFleet(cfg(seed));
      const hist = (b: string): DriveSessionRecord[] => p.driveSessions.filter((s) => s.build === b && !s.weekend);
      for (const c of CLUSTERS) for (const b of ["4.11.0", "4.11.3", "4.12.0"]) expect(hist(b).some((s) => isEligible(c, s))).toBe(true);
      for (const r of PLANTED) expect(p.driveSessions.some((s) => s.weekend && r.fits(s))).toBe(true);
      const routes = (v: string, b: string): Set<string> => new Set(p.driveSessions.filter((s) => s.variant === v && s.build === b).map((s) => s.route));
      for (const b of ["4.11.0", "4.11.3", "4.12.0"]) {
        expect(routes("cam-A", b)).toEqual(new Set(["highway", "urban"]));
        expect(routes("cam-B", b).has("highway") && routes("cam-B", b).has("rural")).toBe(true);
      }
    }), { numRuns: 300 });
  });
});

describe("events (§7)", () => {
  it("counts stay in a plausible range; ids are sorted by occurredAt; Monday = after the mark", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const p = planFleet(cfg(seed));
      expect(p.events.length).toBeGreaterThanOrEqual(10);
      expect(p.events.length).toBeLessThanOrEqual(70);
      expect(p.events.filter((e) => e.planted)).toHaveLength(7);
      const mark = dayOf(p.triagedMark) * 86400 + 17 * 3600;
      p.events.forEach((e, i) => {
        expect(e.eventId).toBe(`E-${String(i + 1).padStart(3, "0")}`);
        if (i > 0) expect(e.occurredEpoch).toBeGreaterThanOrEqual(p.events[i - 1]?.occurredEpoch ?? 0);
        expect(e.monday).toBe(e.occurredEpoch > mark);
        if (e.planted) expect(e.monday).toBe(true);
        expect(e.frameCount).toBe(e.frameTimes.length);
        expect(e.frameTimes.at(-1)).toBe(0);
      });
      expect(p.events.some((e) => e.frameCount === 1)).toBe(true);
      expect(p.events.some((e) => e.frameCount === 4)).toBe(true);
    }), { numRuns: 100 });
  });

  it("averages ≈ 32 events over seeds (≈ 25 Poisson + 7 planted)", () => {
    let total = 0;
    for (let seed = 0; seed < 200; seed++) total += planFleet(cfg(seed)).events.length;
    expect(total / 200).toBeGreaterThan(26);
    expect(total / 200).toBeLessThan(38);
  });

  it("events sit on eligible sessions of their cluster", () => {
    const p = planFleet(cfg(5));
    for (const e of p.events) {
      const s = p.driveSessions.find((x) => x.sessionId === e.sessionId);
      expect(s).toBeDefined();
      const c = CLUSTERS.find((x) => x.id === e.archetype);
      if (c !== undefined && s !== undefined) expect(isEligible(c, s)).toBe(true);
      expect(s && e.occurredEpoch >= s.startEpoch && e.occurredEpoch <= s.startEpoch + s.durationMin * 60).toBe(true);
    }
  });

  it("plants both identical-text / different-signal pairs and the different-text / same-signal pair", () => {
    fc.assert(fc.property(seedArb, (seed) => {
      const p = planFleet(cfg(seed));
      const [p1a, p1b, p3a, p3b, n1] = ["P1a", "P1b", "P3a", "P3b", "N1"].map((r) => byRole(p, r));
      expect(p1a?.note).toBe(NOTE_DRIFTED_LEFT);
      expect(p1b?.note).toBe(NOTE_DRIFTED_LEFT);
      expect([p1a?.archetype, p1b?.archetype]).toEqual(["LC-A", "LC-C"]);
      expect(p3a?.note).toBe(NOTE_BRAKED_HARD);
      expect(p3b?.note).toBe(NOTE_BRAKED_HARD);
      expect([p3a?.archetype, p3b?.archetype]).toEqual(["LC-B", "LC-D"]);
      expect(n1?.archetype).toBe("NOVEL-1");
      expect(byRole(p, "AMB1")?.frameCondition).toBe("low-sun-boundary");
      const truth = buildTruth(cfg(seed));
      expect(truth.pairs.sameTextDifferentSignal).toEqual([[p1a?.eventId, p1b?.eventId], [p3a?.eventId, p3b?.eventId]]);
      const sm3 = byRole(p, "SM3");
      const lcc = p.events.filter((e) => e.archetype === "LC-C" && !e.planted);
      if (lcc.length === 0) expect(truth.pairs.sm3).toBe("missing");
      else {
        expect(sm3?.note).toBe(NOTE_STEERING_LIGHT);
        expect(truth.pairs.differentTextSameSignal).toEqual([[p1b?.eventId, sm3?.eventId]]);
        const historical = lcc.filter((e) => !e.monday);
        expect(truth.pairs.sm3).toBe(historical.length > 0 ? "ok" : "degraded");
        if (historical.length > 0) expect(sm3?.eventId).toBe(historical[0]?.eventId);
      }
    }), { numRuns: 100 });
  });

  it("assigns each quirk to exactly one non-planted eligible event", () => {
    for (let seed = 0; seed < 50; seed++) {
      const p = planFleet(cfg(seed));
      const all = p.events.flatMap((e) => e.quirks);
      expect(new Set(all).size).toBe(all.length);
      expect(all.length + p.quirksUnassigned.length).toBe(9);
      for (const e of p.events) {
        if (e.quirks.length > 0) expect(e.planted).toBe(false);
        if (e.quirks.includes("Q6")) expect(e.archetype === "LC-A" && e.monday).toBe(true);
        if (e.quirks.includes("Q5")) expect(e.archetype).toBe("LC-A");
      }
    }
  });
});

const DENY = [/LC-[A-D]/, /NOVEL/i, /lane-loss|late-brake|lateral-drift|phantom-brake|archetype|ground truth|latent/i, /@/, /\bI-\d+\b/, /\bA\d+\b/, /\bM\d+\b/];

describe("honesty (§16, G-T6)", () => {
  it("Jira-bound event text is marked synthetic and leaks no truth", () => {
    for (const seed of [1, 2, 3, 2026]) {
      const p = planFleet(cfg(seed));
      for (const e of p.events) {
        expect(e.summary.startsWith("[SYNTHETIC] Takeover: ")).toBe(true);
        expect(e.summary.length).toBeLessThanOrEqual(120);
        expect(e.labels).toEqual(["tt-synthetic", "tt-takeover"]);
        const text = JSON.stringify([e.summary, e.descriptionAdf, e.labels]);
        expect(text).toContain("Synthetic demo data.");
        for (const re of DENY) expect(re.test(text)).toBe(false);
      }
      for (const s of p.driveSessions) expect(s.label.endsWith("(synthetic)") && s.synthetic).toBe(true);
    }
  });
});

describe("scenarios, routing, truth (§11, §12, §14)", () => {
  const p = planFleet(cfg(1));

  it("has 10 scenarios with tag labels, SCN-07 in a property and SCN-06 without a variant", () => {
    expect(p.scenarios.map((s) => s.id)).toEqual(SCENARIO_ROWS.map((r) => r.id));
    for (const s of p.scenarios) {
      expect(s.summary.startsWith("[SYNTHETIC] Scenario: ")).toBe(true);
      expect(s.labels.slice(0, 2)).toEqual(["tt-synthetic", "tt-scenario"]);
    }
    const s7 = p.scenarios.find((s) => s.id === "SCN-07");
    expect(s7?.labels).toEqual(["tt-synthetic", "tt-scenario"]);
    expect(s7?.property).toEqual({ v: 1, type: "cut-in-response", variant: "cam-B", cond: ["normal"], odd: ["highway"] });
    expect(p.scenarios.find((s) => s.id === "SCN-06")?.labels.some((l) => l.startsWith("variant:"))).toBe(false);
    expect(p.scenarios.find((s) => s.id === "SCN-10")?.labels).toContain("cond:blur-rain");
  });

  it("leaves exactly the deliberate gap (independent mini-oracle, set containment)", () => {
    const sig = (id: string): { type: string; variant: string; chips: string[]; odd: string } => {
      const c = CLUSTERS.find((x) => x.id === id);
      return { type: c?.expectedType ?? "", variant: c?.variant ?? "", chips: [...(c?.chips ?? [])], odd: c?.odd ?? "" };
    };
    const covers = (id: string): boolean => {
      const s = sig(id);
      return SCENARIO_ROWS.some(({ tags: t }) => {
        const cond = s.chips.length === 0 ? ["normal"] : s.chips;
        return t.type === s.type && (t.variant === "any" || t.variant === s.variant) && (t.cond.includes("any") || cond.every((c) => t.cond.includes(c))) && t.odd.includes(s.odd);
      });
    };
    expect({ A: covers("LC-A"), B: covers("LC-B"), C: covers("LC-C"), D: covers("LC-D") }).toEqual({ A: false, B: true, C: true, D: true });
    expect(SCENARIO_ROWS.filter((r) => r.tags.type === "lane-loss").map((r) => r.id)).toEqual(["SCN-05", "SCN-06"]);
  });

  it("routes types to the expected components", () => {
    expect(routeType(p.routing, "lane-loss")).toBe("Perception");
    expect(routeType(p.routing, "phantom-brake")).toBe("Perception");
    expect(routeType(p.routing, "late-brake")).toBe("Planning");
    expect(routeType(p.routing, "cut-in-response")).toBe("Planning");
    expect(routeType(p.routing, "lateral-drift")).toBe("Controls");
    expect(routeType(p.routing, "unknown")).toBe("project-lead");
  });

  it("truth is pure, covers every event and matches the plan", () => {
    const t1 = buildTruth(cfg(9));
    const t2 = buildTruth(cfg(9));
    expect(JSON.stringify(t1)).toBe(JSON.stringify(t2));
    const plan = planFleet(cfg(9));
    expect(t1.events.map((e) => e.eventId)).toEqual(plan.events.map((e) => e.eventId));
    expect(t1.paramsHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(t1.expectedCoverage).toEqual({ "LC-A": "uncovered", "LC-B": "covered", "LC-C": "covered", "LC-D": "covered" });
    expect(t1.expectedOwner).toEqual({ "LC-A": "Perception", "LC-B": "Planning", "LC-C": "Controls", "LC-D": "Perception" });
    for (const e of t1.events) {
      if (e.quirks.includes("Q6")) expect(e.expectedMismatch).toBe("type");
      if (e.roles.includes("AMB1") || e.roles.includes("AMB2")) expect(e.boundary.length).toBe(2);
      if (e.latent === "LC-A" && !e.roles.includes("AMB1")) expect(e.expectedChips).toEqual(["low-sun-glare"]);
      expect(e.frames.length).toBeGreaterThan(0);
    }
    expect(t1.clusters.find((c) => c.id === "LC-A")?.trueOnsetBuild).toBe("4.12.0");
  });

  it("shifting the anchor shifts dates only", () => {
    const a = planFleet(cfg(4));
    const b = planFleet({ ...cfg(4), anchorDate: "2026-11-23" });
    expect(b.events.map((e) => e.occurredEpoch - (a.events.find((x) => x.key === e.key)?.occurredEpoch ?? 0))).toEqual(a.events.map(() => 7 * 86400));
    expect(b.events.map((e) => e.note)).toEqual(a.events.map((e) => e.note));
  });
});
