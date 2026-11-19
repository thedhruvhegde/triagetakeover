/**
 * End-to-end evaluation harness (SEED_DATA §14.4, §15.1 S4–S8): generated files go through the
 * real engine intake path, history is proposed by HAC and accepted as at seed time, the Monday
 * batch is assigned, then onset, coverage and routing run on the engine's own clusters.
 *
 * Truth is used only to score the result, never to build it.
 */
import {
  applyHolm,
  compareSemver,
  conditionSignature,
  coverageVerdict,
  evaluateRules,
  listCoverageGaps,
  onsetScan,
  processEventFiles,
  proposeClusters,
  scenarioTestFromIssue,
  type BuildExposure,
  type ClusterInput,
  type ConditionSignature,
  type CoverageResult,
  type OnsetResult,
  type RoutingRule,
  type ScenarioTest,
  type TtEventV1,
} from "../../../engine/src/index.js";
import { generateEventFiles, planFleet, buildTruth, type FleetPlanOutput, type GroundTruth, type LatentId, type RoleId, type SeedConfig } from "../../src/index.js";

/**
 * Thresholds, from SEED_DATA §14.4 (measured on evaluation seeds 1000–1019 while writing this test:
 * ARI mean 0.866, min 0.750; ARI without boundary events min 0.872; type and chip accuracy 1.00).
 * - ARI ≥ 0.80 is E3's pass mark. The deficit from 1.0 is by design: AMB1/AMB2 straddle a rule or
 *   chip threshold, and the Q6 file has no lane_conf so it becomes lateral-drift (truth
 *   `expectedMismatch`). Both end up as singletons, which ARI counts as errors.
 * - Without the boundary events, ARI ≥ 0.85.
 * - E5 and E6 (type and chip accuracy on clean events) ≥ 0.95; E4 false novel ≤ 1.
 */
export const ARI_MIN = 0.8;
export const ARI_NO_BOUNDARY_MIN = 0.85;
export const ACCURACY_MIN = 0.95;
export const FALSE_NOVEL_MAX = 1;

export const ANCHOR_DATE = "2026-11-16";
export const seedConfig = (seed: number, frames: SeedConfig["frames"] = "fast"): SeedConfig => ({ seed, anchorDate: ANCHOR_DATE, profile: "demo-v1", frames });

/** Adjusted Rand index (Hubert–Arabie) between two labelings of the same items. */
export function adjustedRandIndex(a: readonly string[], b: readonly string[]): number {
  if (a.length !== b.length) throw new RangeError("labelings differ in length");
  const n = a.length;
  const c2 = (x: number): number => (x * (x - 1)) / 2;
  const count = (xs: readonly string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
    return m;
  };
  const joint = count(a.map((x, i) => `${x}\u0000${b[i] ?? ""}`));
  const sumIJ = [...joint.values()].reduce((s, v) => s + c2(v), 0);
  const sumA = [...count(a).values()].reduce((s, v) => s + c2(v), 0);
  const sumB = [...count(b).values()].reduce((s, v) => s + c2(v), 0);
  const expected = (sumA * sumB) / c2(n);
  const max = (sumA + sumB) / 2;
  return max === expected ? 1 : (sumIJ - expected) / (max - expected);
}

/** Issue number of a generator event id `E-017`. */
const issueNumber = (eventId: string): number => Number(eventId.slice(2));

/** What the engine made of one event, plus the truth used to score it. */
export interface EventOutcome {
  readonly eventId: string;
  readonly latent: LatentId;
  readonly monday: boolean;
  readonly roles: readonly RoleId[];
  readonly boundary: boolean;
  readonly q6: boolean;
  readonly expectedType: string;
  readonly expectedChips: readonly string[];
  readonly event: TtEventV1;
  /** Final engine label: accepted/matched cluster key, `P:<id>` (new proposal) or `N:<key>` (novel). */
  readonly label: string;
  readonly labelKind: "cluster" | "proposed" | "novel";
}

export interface ClusterOutcome {
  readonly key: string;
  /** Latent cluster most members belong to (by accepted history). */
  readonly majority: LatentId;
  readonly purity: number;
  readonly bucket: ClusterInput["bucket"];
  readonly members: readonly string[];
  readonly onset: OnsetResult;
  readonly pHolm: number | null;
  readonly verdict: string;
  readonly signature: ConditionSignature;
  readonly coverage: CoverageResult;
  /** Verdict of the independent coverage oracle (E8) on the same members. */
  readonly oracle: OracleVerdict;
  readonly owner: string;
}

export interface SeedRun {
  readonly seed: number;
  readonly truth: GroundTruth;
  readonly plan: FleetPlanOutput;
  readonly events: readonly EventOutcome[];
  readonly clusters: readonly ClusterOutcome[];
  readonly failures: readonly { eventId: string; codes: readonly string[] }[];
  /** `list-coverage-gaps` over the accepted clusters, in its ranking order. */
  readonly gaps: readonly { readonly clusterKey: string; readonly verdict: string; readonly text: string }[];
}

/** Yields to the event loop (long synchronous runs starve the test runner's RPC). */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** S4: generate files and run each through `processEventFiles`. */
async function processAll(cfg: SeedConfig, plan: FleetPlanOutput): Promise<{ events: Map<string, TtEventV1>; failures: SeedRun["failures"] }> {
  const events = new Map<string, TtEventV1>();
  const failures: { eventId: string; codes: readonly string[] }[] = [];
  for (const e of plan.events) {
    await tick();
    const files = generateEventFiles(cfg, e.eventId, plan);
    const r = processEventFiles(
      { csv: files.csv.bytes, frames: files.frames.map((f) => f.bytes) },
      { ctx: { occurredAt: e.occurredAt, vehicleId: e.vehicleId, variant: e.variant, build: e.build, driveSessionId: e.sessionId, odd: e.odd }, synthetic: true },
    );
    if (r.ok) events.set(e.eventId, r.value.event);
    else failures.push({ eventId: e.eventId, codes: r.error.map((x) => x.code) });
  }
  return { events, failures };
}

const toInput = (eventId: string, ev: TtEventV1, state: ClusterInput["state"], clusterKey?: string): ClusterInput => ({
  key: eventId,
  issueNumber: issueNumber(eventId),
  bucket: { type: ev.sig.type, variant: ev.ctx.variant },
  features: ev.sig.features,
  chips: ev.img?.chips ?? [],
  state,
  ...(clusterKey === undefined ? {} : { clusterKey }),
});

/** S6: HAC over history only; proposals of size ≥ 2 become accepted clusters `CL-<n>`. */
function acceptHistory(plan: FleetPlanOutput, events: ReadonlyMap<string, TtEventV1>): Map<string, string> {
  const history = plan.events.filter((e) => !e.monday && events.has(e.eventId));
  const proposal = proposeClusters(history.map((e) => toInput(e.eventId, events.get(e.eventId) as TtEventV1, "unassigned")));
  const accepted = new Map<string, string>();
  proposal.proposed.forEach((p, i) => {
    for (const m of p.members) accepted.set(m, `CL-${i + 1}`);
  });
  return accepted;
}

/** Seeded routing rules in the engine's rule shape (SEED_DATA §12). */
export function routingRules(plan: FleetPlanOutput): RoutingRule[] {
  return plan.routing.rules.map((r) => ({
    match: r.match.type === undefined ? {} : { type: r.match.type },
    team: "component" in r.team ? { componentId: r.team.component, label: r.team.component } : { projectRoleId: "project-lead", label: "project-lead" },
  }));
}

/** S3: scenario tests through the real tag parser (labels, or the `tt.scenario` property). */
export function scenarioTests(plan: FleetPlanOutput): ScenarioTest[] {
  return plan.scenarios.map((s) => scenarioTestFromIssue({ key: s.id, labels: s.labels, ...(s.property === null ? {} : { property: s.property }) }).test);
}

/** Onset inputs for a cluster: accepted members per build, km of the cluster variant's sessions. */
function onsetInputs(plan: FleetPlanOutput, variant: string, memberIds: readonly string[]): BuildExposure[] {
  const builds = [...new Set(plan.driveSessions.map((s) => s.build))].sort(compareSemver);
  const byId = new Map(plan.events.map((e) => [e.eventId, e]));
  return builds.map((build) => ({
    build,
    events: memberIds.filter((id) => byId.get(id)?.build === build).length,
    km: plan.driveSessions.filter((s) => s.variant === variant && s.build === build).reduce((sum, s) => sum + s.km, 0),
  }));
}

function majorityOf(latents: readonly LatentId[]): { majority: LatentId; purity: number } {
  const counts = new Map<LatentId, number>();
  for (const l of latents) counts.set(l, (counts.get(l) ?? 0) + 1);
  let best: [LatentId, number] = ["NOVEL-1", 0];
  for (const [l, c] of counts) if (c > best[1] || (c === best[1] && l < best[0])) best = [l, c];
  return { majority: best[0], purity: latents.length === 0 ? 0 : best[1] / latents.length };
}

/** Runs the whole pipeline for one seed. */
export async function runSeed(seed: number, frames: SeedConfig["frames"] = "fast"): Promise<SeedRun> {
  const cfg = seedConfig(seed, frames);
  const plan = planFleet(cfg);
  const truth = buildTruth(cfg);
  const truthById = new Map(truth.events.map((t) => [t.eventId, t]));
  const { events, failures } = await processAll(cfg, plan);
  const accepted = acceptHistory(plan, events);

  // S8: the board's recluster over everything (accepted history + unassigned rest).
  const inputs = plan.events.filter((e) => events.has(e.eventId)).map((e) => {
    const ev = events.get(e.eventId) as TtEventV1;
    const ck = accepted.get(e.eventId);
    return ck === undefined ? toInput(e.eventId, ev, "unassigned") : toInput(e.eventId, ev, "accepted", ck);
  });
  const board = proposeClusters(inputs);
  const label = new Map<string, { label: string; kind: EventOutcome["labelKind"] }>();
  for (const [id, ck] of accepted) label.set(id, { label: ck, kind: "cluster" });
  for (const a of board.assigned) label.set(a.key, { label: a.result.clusterKey, kind: "cluster" });
  for (const p of board.proposed) for (const m of p.members) label.set(m, { label: `P:${p.id}`, kind: "proposed" });
  for (const k of board.novel) label.set(k, { label: `N:${k}`, kind: "novel" });

  const outcomes: EventOutcome[] = inputs.map((inp) => {
    const t = truthById.get(inp.key);
    const l = label.get(inp.key);
    if (t === undefined || l === undefined) throw new Error(`no truth or label for ${inp.key}`);
    return {
      eventId: inp.key, latent: t.latent, monday: t.monday, roles: t.roles, boundary: t.boundary.length > 0, q6: t.expectedMismatch === "type",
      expectedType: t.expectedType, expectedChips: t.expectedChips, event: events.get(inp.key) as TtEventV1, label: l.label, labelKind: l.kind,
    };
  });

  // Onset (accepted members only, Holm across the accepted clusters), coverage and routing.
  const tests = scenarioTests(plan);
  const rules = routingRules(plan);
  const clusterKeys = [...new Set(accepted.values())];
  const raw = clusterKeys.map((key) => {
    const members = [...accepted].filter(([, ck]) => ck === key).map(([id]) => id);
    const first = events.get(members[0] as string) as TtEventV1;
    const bucket = { type: first.sig.type, variant: first.ctx.variant };
    const signature = conditionSignature(bucket, members.map((id) => {
      const ev = events.get(id) as TtEventV1;
      return { chips: ev.img?.chips, odd: ev.ctx.odd };
    }));
    const rule = evaluateRules(rules, { type: bucket.type, variant: bucket.variant });
    return {
      key, members, bucket, signature, ...majorityOf(members.map((id) => truthById.get(id)?.latent ?? "NOVEL-1")),
      onset: onsetScan(onsetInputs(plan, bucket.variant, members)),
      coverage: coverageVerdict(signature, tests),
      oracle: coverageOracle(
        bucket,
        members.map((id) => ({ chips: events.get(id)?.img?.chips ?? [], odd: events.get(id)?.ctx.odd ?? [] })),
        plan,
      ),
      owner: rule?.teamRef.label ?? "none",
    };
  });
  const clusters: ClusterOutcome[] = applyHolm(raw);
  const gaps = listCoverageGaps(clusters.map((c) => ({ key: c.key, signature: c.signature, events: c.members.length })), tests);
  return { seed, truth, plan, events: outcomes, clusters, failures, gaps };
}

// ---------------------------------------------------------------- independent coverage oracle (E8)

export type OracleVerdict = "covered" | "partial" | "uncovered";

/**
 * A re-implementation of ARCHITECTURE §5.10 that shares no code with the engine: it reads the
 * generator's own structured scenario tags (not the labels) and derives the signature itself.
 * Majority is "present in at least half of the members"; no signal chip means `normal`.
 *
 * Note on SEED_DATA §11: it says a rural-majority LC-A "is still uncovered (SCN-05 is cam-A and
 * blur-rain)". Under §5.10 (authoritative) SCN-05 then matches `type` and `odd:rural`, which is
 * `partial`. Engine and oracle both say `partial`; the e2e tests accept it on such seeds.
 */
export function coverageOracle(
  bucket: { readonly type: string; readonly variant: string },
  members: readonly { readonly chips: readonly string[]; readonly odd: readonly string[] }[],
  plan: FleetPlanOutput,
): OracleVerdict {
  const half = (pred: (m: (typeof members)[number]) => boolean): boolean => 2 * members.filter(pred).length >= members.length;
  const chips = ["night", "low-sun-glare", "blur-rain"].filter((c) => half((m) => m.chips.includes(c)));
  const cluster: Record<string, readonly string[]> = {
    type: [bucket.type],
    variant: [bucket.variant],
    cond: chips.length > 0 ? chips : ["normal"],
    odd: ["highway", "rural", "urban"].filter((r) => half((m) => m.odd.includes(r))),
  };
  const covers = (test: Record<string, readonly string[] | undefined>, dim: string): boolean => {
    const v = test[dim];
    return v !== undefined && v.length > 0 && (v.includes("any") || (cluster[dim] ?? []).every((x) => v.includes(x)));
  };
  let best: OracleVerdict = "uncovered";
  for (const s of plan.scenarios) {
    const t = { type: [s.tags.type], variant: s.tags.variant === undefined ? undefined : [s.tags.variant], cond: s.tags.cond, odd: s.tags.odd };
    const hits = ["type", "variant", "cond", "odd"].filter((d) => covers(t, d));
    if (hits.length === 4) return "covered";
    if (hits.includes("type") && hits.length >= 2) best = "partial";
  }
  return best;
}

// ---------------------------------------------------------------- scoring

const roleEvent = (run: SeedRun, role: RoleId): EventOutcome | undefined => run.events.find((e) => e.roles.includes(role));

export interface SeedMetrics {
  readonly seed: number;
  readonly events: number;
  readonly historyClusters: number;
  readonly ari: number;
  readonly ariNoBoundary: number;
  readonly typeAccuracyClean: number;
  readonly chipAccuracyClean: number;
  /** P1a/P1b and P3a/P3b land in different engine clusters. */
  readonly sameTextSplit: readonly boolean[];
  /** P1b shares a cluster with the "steering went light" member; null when sm3 is not ok. */
  readonly differentTextMerged: boolean | null;
  readonly novel1Novel: boolean;
  readonly falseNovel: number;
  readonly laVerdict: string;
  readonly laOnsetBuild: string | null;
  readonly laPHolm: number | null;
  readonly flatRegressionLikely: number;
  /** E8: engine verdict equals the independent oracle for every accepted cluster. */
  readonly coverageMatchesOracle: boolean;
  /** Engine verdicts equal SEED_DATA §11's expected verdicts for the four latent clusters. */
  readonly coverageMatches: boolean;
  readonly laCoverage: string | null;
  /** The gap-list text for the lane-loss cluster (uncovered or partial). */
  readonly laGap: string | null;
  readonly routingMatches: boolean;
  readonly failures: number;
}

/** The engine cluster that represents a latent cluster: the purest accepted cluster with that majority. */
export function clusterFor(run: SeedRun, latent: LatentId): ClusterOutcome | undefined {
  return run.clusters.filter((c) => c.majority === latent).sort((a, b) => b.members.length - a.members.length || (a.key < b.key ? -1 : 1))[0];
}

export function scoreSeed(run: SeedRun): SeedMetrics {
  const ev = run.events;
  const clean = ev.filter((e) => !e.boundary && !e.q6);
  const sameChips = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
  const p = (r: RoleId): EventOutcome | undefined => roleEvent(run, r);
  const split = (a: RoleId, b: RoleId): boolean => {
    const x = p(a), y = p(b);
    return x !== undefined && y !== undefined && x.label !== y.label;
  };
  const p1b = p("P1b"), sm3 = p("SM3"), n1 = p("N1");
  const la = clusterFor(run, "LC-A");
  const flat = (["LC-B", "LC-C", "LC-D"] as const).flatMap((l) => run.clusters.filter((c) => c.majority === l));
  const latentClusters = ["LC-A", "LC-B", "LC-C", "LC-D"] as const;
  const coverageMatches = latentClusters.every((l) => {
    const c = clusterFor(run, l);
    return c === undefined || c.coverage.verdict === run.truth.expectedCoverage[l];
  });
  const routingMatches = latentClusters.every((l) => {
    const c = clusterFor(run, l);
    return c === undefined || c.owner === run.truth.expectedOwner[l];
  });
  const noBoundary = ev.filter((e) => !e.boundary);
  return {
    seed: run.seed,
    events: ev.length,
    historyClusters: run.clusters.length,
    ari: adjustedRandIndex(ev.map((e) => e.latent), ev.map((e) => e.label)),
    ariNoBoundary: adjustedRandIndex(noBoundary.map((e) => e.latent), noBoundary.map((e) => e.label)),
    typeAccuracyClean: clean.filter((e) => e.event.sig.type === e.expectedType).length / clean.length,
    chipAccuracyClean: clean.filter((e) => sameChips(e.event.img?.chips ?? [], e.expectedChips)).length / clean.length,
    sameTextSplit: [split("P1a", "P1b"), split("P3a", "P3b")],
    differentTextMerged: run.truth.pairs.sm3 === "ok" && p1b !== undefined && sm3 !== undefined ? p1b.label === sm3.label : null,
    novel1Novel: n1 !== undefined && n1.labelKind !== "cluster",
    // Q6 events are expected type mismatches (truth `expectedMismatch`), so they are not "false" novelty.
    falseNovel: ev.filter((e) => e.latent !== "NOVEL-1" && !e.boundary && !e.q6 && e.roles.length === 0 && e.labelKind === "novel").length,
    laVerdict: la?.verdict ?? "missing",
    laOnsetBuild: la?.onset.onsetBuild ?? null,
    laPHolm: la?.pHolm ?? null,
    flatRegressionLikely: flat.filter((c) => c.verdict === "regression-likely").length,
    coverageMatches,
    coverageMatchesOracle: run.clusters.every((c) => c.coverage.verdict === c.oracle),
    laCoverage: la?.coverage.verdict ?? null,
    laGap: run.gaps.find((g) => g.clusterKey === la?.key)?.text ?? null,
    routingMatches,
    failures: run.failures.length,
  };
}

/** Criterion 2 of SEED_DATA §13.1, from the plan alone: every latent cluster has ≥ 2 historical events. */
export function enoughHistory(plan: FleetPlanOutput): boolean {
  return (["LC-A", "LC-B", "LC-C", "LC-D"] as const).every((l) => plan.events.filter((e) => e.archetype === l && !e.monday).length >= 2);
}

/** SEED_DATA §13.1 demo criteria for picking the default seed. */
export function demoCriteria(run: SeedRun, m: SeedMetrics = scoreSeed(run)): Readonly<Record<string, boolean>> {
  const p1b = roleEvent(run, "P1b");
  const lcC = clusterFor(run, "LC-C");
  const latent = ["LC-A", "LC-B", "LC-C", "LC-D"] as const;
  return {
    "1 LC-A regression-likely on 4.12.0": m.laVerdict === "regression-likely" && m.laOnsetBuild === "4.12.0",
    "2 every latent cluster has >= 2 historical events": enoughHistory(run.plan),
    "3 same-text pairs split and P1b joins LC-C": m.sameTextSplit.every(Boolean) && p1b !== undefined && lcC !== undefined && p1b.label === lcC.key,
    "4 NOVEL-1 is novel": m.novel1Novel,
    "5 all four coverage verdicts match": latent.every((l) => {
      const c = clusterFor(run, l);
      return c !== undefined && c.coverage.verdict === run.truth.expectedCoverage[l];
    }),
  };
}

export function meetsDemoCriteria(run: SeedRun, m: SeedMetrics = scoreSeed(run)): boolean {
  return Object.values(demoCriteria(run, m)).every(Boolean);
}
