/**
 * The nine Rovo actions / MCP tools (ARCHITECTURE §10.3, PRD §7) as a thin shaping layer over
 * the domain services. No engine logic lives here: every number comes from a service result,
 * and every headline is built deterministically from those numbers.
 *
 * - GET actions never write Jira content. (`get-cluster-for-event` refreshes the app's own
 *   index row for the event, exactly like "Triage now" does; §7.5 lazy re-processing.)
 * - CREATE actions require `userConfirmed: true`. Without it they return
 *   `status: needs-confirmation` with a preview of the change and write nothing. They are
 *   idempotent: repeating a call returns the existing link, cluster or stub.
 * - Members of a TWG team are never returned (D8).
 */
import { isRecord, parseTtTriage } from "@tt/engine";
import type { ClusterRef, Confidence, EventSummary, Evidence, OnsetView, RouteSourceName } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { PROPERTY_KEYS } from "../ports/properties";
import * as S from "../services/index";
import type { ServiceResult } from "../services/errors";
import type { ActionInputs, ActionKey } from "../validation/actions";
import { capText, failure, fromServiceError, LIMITS, invalidInput, success, UNDO_HINT, whyRows, type ActionEnvelope } from "./envelope";
import type { ActionInvocation } from "./invocation";

export type ActionHandler<K extends ActionKey> = (inputs: ActionInputs[K], inv: ActionInvocation, ctx: ServiceContext) => Promise<ActionEnvelope<unknown>>;

// ------------------------------------------------------------------ formatting

/** Distances and thresholds: 2 decimals; +∞ (null) as "∞". */
export function fmtD(x: number | null): string {
  return x === null ? "∞" : x.toFixed(2);
}

/** p-values: 3 significant digits, scientific below 0.001. */
export function fmtP(p: number | null): string {
  if (p === null) return "n/a";
  if (p === 0) return "0";
  return p < 0.001 ? p.toExponential(1) : p.toPrecision(3).replace(/\.?0+$/, "");
}

function fmtRate(x: number | null): string {
  return x === null ? "n/a" : x.toFixed(2);
}

function quote(c: Pick<ClusterRef, "key" | "name">): string {
  return `${c.key} "${c.name}"`;
}

function listKeys(keys: readonly string[], max = 8): string {
  return keys.length <= max ? keys.join(", ") : `${keys.slice(0, max).join(", ")} and ${keys.length - max} more`;
}

const SYNTHETIC_CAVEAT = "This is SYNTHETIC demo data from the Takeover Triage seed generator, not fleet data.";

function eventRef(e: EventSummary): { key: string; type: string; variant: string; build: string; chips: string[]; occurredAt: string; synthetic: boolean } {
  return { key: e.key, type: e.type, variant: e.variant, build: e.build, chips: [...e.chips], occurredAt: e.occurredAt, synthetic: e.synthetic };
}

function clusterRef(c: ClusterRef): ClusterRef {
  return { key: c.key, id: c.id, name: c.name, bucket: c.bucket, memberCount: c.memberCount, url: c.url };
}

// ------------------------------------------------------------------ shared plumbing

/** Runs a service call; on failure returns the mapped envelope. */
async function call<T>(r: Promise<ServiceResult<T>>): Promise<{ ok: true; value: T; warnings: readonly string[] } | { ok: false; env: ActionEnvelope<unknown> }> {
  const res = await r;
  if (!res.ok) return { ok: false, env: fromServiceError(res.error) };
  return { ok: true, value: res.value.value, warnings: res.value.warnings };
}

function needIssueKey(inputs: { readonly issueKey?: string }, inv: ActionInvocation): string | undefined {
  return inputs.issueKey ?? inv.focusIssueKey;
}

const ISSUE_HINT = "Give the takeover issue key (for example TTDEMO-12), or ask from the issue itself so its key is in context.";
const PROJECT_HINT = "Give the Jira project key (for example TTDEMO), or ask from inside the project.";

function missingIssue(): ActionEnvelope<unknown> {
  return invalidInput([{ input: "issueKey", message: "required: no issue key was given and no issue is in context" }], ISSUE_HINT);
}

/**
 * The project for project-level actions: the input, else the project in context, else the
 * only project Takeover Triage is enabled for (with a warning). The services then check the
 * caller's Browse permission, so this fallback reveals nothing they could not open.
 */
async function resolveProject(ctx: ServiceContext, inputs: { readonly projectKey?: string }, inv: ActionInvocation): Promise<{ ok: true; projectKey: string; warnings: string[] } | { ok: false; env: ActionEnvelope<unknown> }> {
  if (inputs.projectKey !== undefined) return { ok: true, projectKey: inputs.projectKey, warnings: [] };
  if (inv.focusProjectKey !== undefined) return { ok: true, projectKey: inv.focusProjectKey, warnings: [] };
  const g = await S.loadGlobalConfig(ctx.ports.storage);
  const only = g.projects.length === 1 ? g.projects[0] : g.projects.length === 0 ? g.demoProjectKey : undefined;
  if (only !== undefined) return { ok: true, projectKey: only, warnings: [`No project was given; used ${only}, the only project Takeover Triage is set up for.`] };
  return { ok: false, env: invalidInput([{ input: "projectKey", message: "required: no project key was given and no project is in context" }], PROJECT_HINT) };
}

function needsConfirmation(wouldDo: string, preview: Record<string, unknown>, evidence: readonly Evidence[], warnings: readonly string[] = []): ActionEnvelope<unknown> {
  return failure({
    status: "needs-confirmation",
    error: { code: "invalid-input", message: "Not done: this change needs the user's explicit confirmation (userConfirmed: true).", retryable: false },
    // The question must survive the 300-character cap, so the description is shortened instead.
    headline: `Not done yet. ${capText(wouldDo, LIMITS.headline - 30)} Shall I do it?`,
    data: { wouldDo, written: false, preview },
    evidence,
    nextSteps: ["Restate the exact change to the user and ask \"Shall I do it?\". Call again with userConfirmed true only after they agree."],
    warnings,
  });
}

// ------------------------------------------------------------------ get-cluster-for-event

const getClusterForEvent: ActionHandler<"get-cluster-for-event"> = async (inputs, inv, ctx) => {
  const key = needIssueKey(inputs, inv);
  if (key === undefined) return missingIssue();
  const r = await call(S.triageNow(ctx, key));
  if (!r.ok) return r.env;
  const m = r.value;
  const ev = m.event;
  const accepted = m.result === "accepted";
  const result = accepted ? "match" : m.result;
  const alt = m.alternatives[0];
  let headline: string;
  let status: ActionEnvelope["status"] = "ok";
  const nextSteps: string[] = [];
  switch (m.result) {
    case "accepted":
      headline = `${ev.key} is accepted into ${m.cluster !== undefined ? quote(m.cluster) : "a cluster"}${m.dStar !== null ? `; nearest other member at d=${fmtD(m.dStar)} (τ=${fmtD(m.tau)})` : ""}.`;
      break;
    case "match":
      headline = `${ev.key} matches ${m.cluster !== undefined ? quote(m.cluster) : "a cluster"}: nearest accepted member at d=${fmtD(m.dStar)} ≤ τ=${fmtD(m.tau)} (confidence ${m.confidence.value.toFixed(2)}).`;
      nextSteps.push(`If the user wants to accept it, offer link-event (${ev.key} → ${m.cluster?.key ?? "the cluster"}).`);
      break;
    case "ambiguous":
      status = "ambiguous";
      headline = `${ev.key} is ambiguous: ${m.cluster !== undefined ? quote(m.cluster) : "one cluster"} and ${alt !== undefined ? quote(alt) : "another cluster"} are both close (d*=${fmtD(m.dStar)}, τ=${fmtD(m.tau)}).`;
      nextSteps.push("Call explain-match against each cluster so the user can choose; do not link without their decision.");
      break;
    case "novel":
      status = "novel";
      headline = alt !== undefined ? `${ev.key} matches no cluster: the nearest, ${quote(alt)}, is at d=${fmtD(m.dStar)} > τ=${fmtD(m.tau)}.` : `${ev.key} matches no cluster in its bucket (d*=${fmtD(m.dStar)}, τ=${fmtD(m.tau)}).`;
      nextSteps.push("Call explain-match to show why it did not fit.", "If the user wants a new cluster for it, offer create-cluster.");
      break;
    case "first-of-kind":
      status = "novel";
      headline = `${ev.key} is the first of its kind in bucket ${ev.type} x ${ev.variant}: fewer than 2 accepted events to compare with, so no match is made.`;
      nextSteps.push("If the user wants to start a cluster with it, offer create-cluster.");
      break;
  }
  return success({
    status,
    headline,
    data: {
      event: eventRef(ev),
      result,
      accepted,
      ...(m.cluster !== undefined ? { cluster: clusterRef(m.cluster) } : {}),
      alternatives: m.alternatives.map(clusterRef),
      dStar: m.dStar,
      tau: m.tau,
      neighbours: m.neighbours.slice(0, 3).map((n) => ({ key: n.key, d: n.d, clusterKey: n.clusterKey })),
      message: m.message,
      rules: [...m.headlines],
    },
    confidence: m.confidence,
    why: whyRows(m.why),
    evidence: m.evidence,
    caveats: ev.synthetic ? [SYNTHETIC_CAVEAT] : [],
    nextSteps,
    warnings: r.warnings,
  });
};

// ------------------------------------------------------------------ explain-match

const explainMatch: ActionHandler<"explain-match"> = async (inputs, inv, ctx) => {
  const key = needIssueKey(inputs, inv);
  if (key === undefined) return missingIssue();
  const r = await call(S.explainMatch(ctx, key, inputs.clusterKey));
  if (!r.ok) return r.env;
  const x = r.value;
  const labelOf = new Map(x.why.map((w) => [w.feature, w.label]));
  const top = x.topContributors.length > 0 ? ` Largest contributors: ${x.topContributors.map((f) => `${labelOf.get(f) ?? f} (${f})`).join(", ")}.` : "";
  const verdict = x.decision === "within-tau" ? `fits ${quote(x.cluster)}: d=${fmtD(x.d)} ≤ τ=${fmtD(x.tau)}` : `does not fit ${quote(x.cluster)}: d=${fmtD(x.d)} > τ=${fmtD(x.tau)}`;
  const headline = `${x.event.key} ${verdict} (signal ${fmtD(x.dSig)}, conditions ${fmtD(x.dCond)}).${x.sameBucket ? "" : " The buckets differ, so the matcher never compares them."}${top}`;
  return success({
    headline,
    data: {
      event: eventRef(x.event),
      cluster: clusterRef(x.cluster),
      bucketRule: x.bucketRule,
      sameBucket: x.sameBucket,
      dSig: x.dSig,
      dCond: x.dCond,
      d: x.d,
      tau: x.tau,
      decision: x.decision,
      topContributors: [...x.topContributors],
      chipDifference: [...x.chipDifference],
      engineHeadline: x.headline,
    },
    confidence: x.confidence,
    why: whyRows(x.why),
    evidence: x.evidence,
    caveats: [
      "d combines the signal distance (standardised features) with a condition distance; τ is the project's novelty threshold.",
      "explain-match measures the distance to the cluster profile (per-feature median); get-cluster-for-event uses the nearest accepted member, so the two numbers can differ slightly.",
      ...(x.event.synthetic ? [SYNTHETIC_CAVEAT] : []),
    ],
    nextSteps: x.decision === "exceeds-tau" ? ["If the user wants a new cluster for this event, offer create-cluster."] : [`If the user wants to accept it, offer link-event (${x.event.key} → ${x.cluster.key}).`],
    warnings: r.warnings,
  });
};

// ------------------------------------------------------------------ build-regression-check

/** OnsetView → §10.3 `onset` (nulls omitted, `∞` kept as a string). */
export function onsetData(o: OnsetView): Record<string, unknown> {
  const out: Record<string, unknown> = { verdict: o.verdict };
  if (o.onsetBuild !== null) out["onsetBuild"] = o.onsetBuild;
  out["k1"] = o.k1;
  out["e1Km"] = o.e1Km;
  out["k2"] = o.k2;
  out["e2Km"] = o.e2Km;
  if (o.ratePer1000kmBefore !== null) out["ratePer1000kmBefore"] = o.ratePer1000kmBefore;
  if (o.ratePer1000kmAfter !== null) out["ratePer1000kmAfter"] = o.ratePer1000kmAfter;
  if (o.rateRatio !== null) out["rateRatio"] = o.rateRatio;
  if (o.rrCi95 !== null) out["rrCi95"] = [...o.rrCi95];
  if (o.pRaw !== null) out["pRaw"] = o.pRaw;
  if (o.pScan !== null) out["pScan"] = o.pScan;
  if (o.pHolm !== null) out["pHolm"] = o.pHolm;
  out["boundariesTested"] = o.boundariesTested;
  out["exposureFilter"] = o.exposureFilter;
  out["buildsWithoutExposure"] = [...o.buildsWithoutExposure];
  out["builds"] = o.builds.map((b) => ({ build: b.build, events: b.events, km: b.km }));
  out["headline"] = o.headline;
  if (o.message !== undefined) out["message"] = o.message;
  return out;
}

function onsetSentence(c: ClusterRef, o: OnsetView): string {
  if (o.verdict === "not-enough-data") return `${c.key}: not enough data (${o.message ?? "no test possible"})`;
  return `${c.key} ${o.verdict}${o.onsetBuild !== null ? ` at ${o.onsetBuild}` : ""} (${fmtRate(o.ratePer1000kmBefore)} → ${fmtRate(o.ratePer1000kmAfter)} per 1,000 km, p_raw=${fmtP(o.pRaw)}, p_holm=${fmtP(o.pHolm)})`;
}

const buildRegressionCheck: ActionHandler<"build-regression-check"> = async (inputs, inv, ctx) => {
  const proj = await resolveProject(ctx, inputs, inv);
  if (!proj.ok) return proj.env;
  const pk = proj.projectKey;
  const r = await call(S.buildRegressionCheck(ctx, pk, { ...(inputs.clusterKey !== undefined ? { clusterKey: inputs.clusterKey } : {}), ...(inputs.build !== undefined ? { build: inputs.build } : {}) }));
  if (!r.ok) return r.env;
  const v = r.value;
  const warnings = [...proj.warnings, ...r.warnings];
  const caveats = [...S.ONSET_CAVEATS, `Holm correction runs across the ${v.holmFamilySize} cluster(s) in ${pk} that could be tested.`, ...v.results.flatMap((x) => x.onset.caveats)];
  const evidence: Evidence[] = v.results.flatMap((x) => [S.issueEvidence(x.cluster.key, `Cluster: ${x.cluster.name}`, x.cluster.id), ...x.onset.evidence]);
  const nextSteps: string[] = [];
  const data = { projectKey: pk, scope: v.scope, ...(inputs.build !== undefined && v.scope === "build" ? { build: inputs.build } : {}), results: v.results.map((x) => ({ cluster: clusterRef(x.cluster), onset: onsetData(x.onset) })), holmFamilySize: v.holmFamilySize };
  const top = v.results[0];
  const confidence: Confidence | undefined = top === undefined ? undefined : { ...top.onset.confidence, definition: `For ${top.cluster.key}: ${top.onset.confidence.definition}` };
  for (const x of v.results) if (x.onset.message !== undefined) nextSteps.push(`${x.cluster.key}: ${x.onset.message}`);
  if (v.results.some((x) => x.onset.verdict === "regression-likely")) nextSteps.push("Call suggest-owner for each regression-likely cluster.");

  if (v.scope === "cluster") {
    const x = v.results[0];
    if (x === undefined) return failure({ status: "error", error: { code: "error", message: "The regression check returned no result.", retryable: true } });
    return success({
      status: x.onset.verdict === "not-enough-data" ? "not-enough-data" : "ok",
      headline: `${quote(x.cluster)}: ${x.onset.headline}`,
      data,
      ...(confidence !== undefined ? { confidence } : {}),
      evidence,
      caveats,
      nextSteps,
      warnings,
    });
  }

  const build = inputs.build ?? "";
  if (v.results.length === 0) {
    // Say how many clusters could not be screened, so "none" is not over-claimed.
    const snap = await S.loadProjectSnapshot(ctx, pk);
    const untested = snap.ok ? snap.value.value.clusters.filter((c) => c.onset.verdict === "not-enough-data") : [];
    const total = snap.ok ? snap.value.value.clusters.length : 0;
    if (total === 0) {
      return success({
        status: "not-enough-data",
        headline: `${pk} has no clusters with accepted events yet, so there is nothing to screen against build ${build}.`,
        data,
        evidence: [],
        caveats,
        nextSteps: ["Accept events into clusters first (Triage now, or the board's proposed groups)."],
        warnings,
      });
    }
    return success({
      status: untested.length > 0 ? "not-enough-data" : "ok",
      headline: `No cluster in ${pk} has its estimated onset at build ${build}${untested.length > 0 ? `; ${untested.length} of ${total} cluster(s) could not be tested (${untested[0]?.onset.message ?? "not enough data"})` : ` (${total} cluster(s) screened)`}.`,
      data,
      evidence: untested.slice(0, 10).map((c) => S.issueEvidence(c.ref.key, `Cluster not tested: ${c.ref.name}`, c.ref.id)),
      caveats,
      nextSteps: untested.length > 0 ? [`${untested[0]?.onset.message ?? "Add drive sessions"} (affects ${listKeys(untested.map((c) => c.ref.key))}).`] : [],
      warnings,
    });
  }
  const allNoData = v.results.every((x) => x.onset.verdict === "not-enough-data");
  // The scan places every testable cluster's best boundary somewhere; only regression-likely
  // and inconclusive ones "started" there. Say which is which instead of lumping them.
  const signal = v.results.filter((x) => x.onset.verdict === "regression-likely" || x.onset.verdict === "inconclusive");
  const quiet = v.results.filter((x) => x.onset.verdict === "no-evidence");
  const headline =
    signal.length > 0
      ? `${signal.length} cluster(s) in ${pk} show a rate increase starting at build ${build}: ${signal.slice(0, 3).map((x) => onsetSentence(x.cluster, x.onset)).join("; ")}${signal.length > 3 ? `; and ${signal.length - 3} more` : ""}.${quiet.length > 0 ? ` ${quiet.length} other cluster(s) have their best boundary there but no evidence of an increase (${listKeys(quiet.map((x) => x.cluster.key), 4)}).` : ""}`
      : `No cluster in ${pk} shows evidence of a rate increase starting at build ${build}: ${v.results.slice(0, 3).map((x) => onsetSentence(x.cluster, x.onset)).join("; ")}${v.results.length > 3 ? `; and ${v.results.length - 3} more` : ""}.`;
  return success({
    status: allNoData ? "not-enough-data" : "ok",
    headline,
    data,
    ...(confidence !== undefined ? { confidence } : {}),
    evidence,
    caveats,
    nextSteps,
    warnings,
  });
};

// ------------------------------------------------------------------ list-novel-since

const SINCE_TEXT = { "mark-triaged": 'the team\'s last "Mark triaged"', input: "the time given", "7d-default": '7 days ago (nobody has used "Mark triaged" yet)' } as const;

const listNovelSince: ActionHandler<"list-novel-since"> = async (inputs, inv, ctx) => {
  const proj = await resolveProject(ctx, inputs, inv);
  if (!proj.ok) return proj.env;
  const pk = proj.projectKey;
  const r = await call(S.listNovelSince(ctx, pk, { ...(inputs.since !== undefined ? { since: inputs.since } : {}), limit: inputs.limit }));
  if (!r.ok) return r.env;
  const v = r.value;
  const keys = v.events.map((e) => e.event.key);
  const headline =
    keys.length === 0
      ? `No novel takeover events in ${pk} since ${v.since} (${SINCE_TEXT[v.sinceSource]}).`
      : `${keys.length} novel event(s) in ${pk} since ${v.since} (${SINCE_TEXT[v.sinceSource]}): ${v.events
          .slice(0, 5)
          .map((e) => (e.reason === "first-of-kind" ? `${e.event.key} (first of its kind)` : `${e.event.key} (nearest ${e.nearestCluster?.key ?? "cluster"} at d=${fmtD(e.dStar)} > τ=${fmtD(e.tau)})`))
          .join(", ")}${keys.length > 5 ? `, and ${keys.length - 5} more` : ""}.`;
  return success({
    headline,
    data: {
      projectKey: pk,
      since: v.since,
      sinceSource: v.sinceSource,
      events: v.events.map((e) => ({
        ...eventRef(e.event),
        reason: e.reason,
        ...(e.nearestCluster !== undefined ? { nearestCluster: clusterRef(e.nearestCluster) } : {}),
        dStar: e.dStar,
        tau: e.tau,
        message: e.message,
      })),
    },
    evidence: v.events.flatMap((e) => e.evidence),
    caveats: [
      ...(v.sinceSource === "mark-triaged" ? ['"Mark triaged" is one team-wide time, not a per-person time.'] : []),
      ...(inputs.limit < 25 && v.events.length >= inputs.limit ? [`Only the newest ${inputs.limit} are listed; raise limit (max 25) to see more.`] : []),
      ...(v.events.some((e) => e.event.synthetic) ? [SYNTHETIC_CAVEAT] : []),
    ],
    nextSteps: keys.length > 0 ? ["Call explain-match for each novel event to show why it did not fit."] : [],
    warnings: [...proj.warnings, ...r.warnings],
  });
};

// ------------------------------------------------------------------ list-coverage-gaps

const listCoverageGaps: ActionHandler<"list-coverage-gaps"> = async (inputs, inv, ctx) => {
  const proj = await resolveProject(ctx, inputs, inv);
  if (!proj.ok) return proj.env;
  const pk = proj.projectKey;
  const r = await call(S.listCoverageGapsFor(ctx, pk, { minEvents: inputs.minEvents, includePartial: inputs.includePartial, limit: inputs.limit }));
  if (!r.ok) return r.env;
  const v = r.value;
  const warnings = [...proj.warnings, ...r.warnings];
  const data = {
    projectKey: pk,
    scenarioJql: v.scenarioJql,
    scenarioCount: v.scenarioCount,
    state: v.state,
    gaps: v.gaps.map((g) => ({
      cluster: clusterRef(g.cluster),
      signature: { type: g.signature.type, variant: g.signature.variant, chips: [...g.signature.chips], odd: [...g.signature.odd], text: g.signature.text },
      verdict: g.verdict,
      missingDims: [...g.missingDims],
      ...(g.bestTest !== undefined ? { bestTest: g.bestTest } : {}),
      text: g.text,
    })),
  };
  const jqlEv = S.jqlEvidence(v.scenarioJql, "Scenario tests searched");
  if (v.state === "no-scenario-tests") {
    return success({
      status: "not-enough-data",
      headline: `No scenario tests were found (looked for: ${v.scenarioJql}), so coverage cannot be computed for ${pk}.`,
      data,
      evidence: [jqlEv],
      nextSteps: ["Label scenario-test issues tt-scenario with tags such as type:lane-loss, variant:cam-B, cond:low-sun-glare, odd:highway, or set the scenario JQL on the Takeover Triage admin page."],
      warnings,
    });
  }
  if (v.state === "jql-error") {
    return success({
      status: "not-enough-data",
      headline: `The scenario-test search was rejected by Jira (JQL: ${v.scenarioJql}), so coverage cannot be computed for ${pk}.`,
      data,
      evidence: [jqlEv],
      nextSteps: ["Fix the scenario JQL on the Takeover Triage admin page."],
      warnings,
    });
  }
  const uncovered = v.gaps.filter((g) => g.verdict === "uncovered");
  const partial = v.gaps.filter((g) => g.verdict === "partial");
  const headline =
    v.gaps.length === 0
      ? `No coverage gaps in ${pk}: every cluster with at least ${inputs.minEvents} event(s) is covered${inputs.includePartial ? "" : " or only partially covered (partial gaps were excluded)"} by the ${v.scenarioCount} scenario test(s) found.`
      : `${v.gaps.length} cluster(s) in ${pk} lack scenario coverage (${uncovered.length} uncovered, ${partial.length} partial; ${v.scenarioCount} scenario tests searched): ${v.gaps
          .slice(0, 3)
          .map((g) => `${g.cluster.key} (${g.text})`)
          .join("; ")}${v.gaps.length > 3 ? `; and ${v.gaps.length - 3} more` : ""}.`;
  return success({
    headline,
    data,
    evidence: [...v.gaps.flatMap((g) => g.evidence), jqlEv],
    caveats: ["Coverage compares tag labels (type, variant, conditions, ODD) of scenario-test issues with each cluster's condition signature; it does not run or judge the tests."],
    nextSteps: v.gaps.length > 0 ? ["Call suggest-owner for each uncovered cluster.", "If the user asks, offer create-scenario-stub for a cluster (needs their confirmation)."] : [],
    warnings,
  });
};

// ------------------------------------------------------------------ suggest-owner

const SOURCE_TEXT: { readonly [K in RouteSourceName]: string } = { twg: "Teamwork Graph team", component: "component lead", "project-role": "project role", none: "no source" };

const suggestOwner: ActionHandler<"suggest-owner"> = async (inputs, _inv, ctx) => {
  const r = await call(S.suggestOwner(ctx, inputs.clusterKey, { includeMembers: false }));
  if (!r.ok) return r.env;
  const v = r.value;
  const rule = v.rule.index >= 0 ? `rule #${v.rule.index + 1}: ${v.rule.text}` : v.rule.text;
  const who = v.team?.name ?? v.contact?.displayName ?? (v.contact !== undefined ? "a contact" : undefined);
  const headline = v.source === "none" || who === undefined ? `No owner could be resolved for ${v.clusterKey}${v.fallbackReason !== undefined ? `: ${v.fallbackReason}` : ""}.` : `Suggested owner for ${v.clusterKey}: ${who} (from the ${SOURCE_TEXT[v.source]}; ${rule}).`;
  return success({
    status: v.source === "none" ? "not-enough-data" : "ok",
    headline,
    data: {
      clusterKey: v.clusterKey,
      source: v.source,
      ...(v.team !== undefined ? { team: { name: v.team.name, ref: v.team.ref, source: v.team.source } } : {}),
      ...(v.contact !== undefined ? { contact: { accountId: v.contact.accountId, ...(v.contact.displayName !== undefined ? { displayName: v.contact.displayName } : {}), source: v.contact.source } } : {}),
      rule: { index: v.rule.index, text: v.rule.text },
      twgStatus: v.twgStatus,
      ...(v.fallbackReason !== undefined ? { fallbackReason: v.fallbackReason } : {}),
      reasons: [...v.why],
    },
    confidence: v.confidence,
    evidence: v.evidence,
    caveats: ["Routing is rule-based (the admin's routing rules), not learned."],
    nextSteps: v.source === "none" ? ["Ask a project administrator to add routing rules on the Takeover Triage admin page."] : ["Routing is applied from the cluster's issue panel (Route), not by this action."],
    warnings: r.warnings,
  });
};

// ------------------------------------------------------------------ link-event

const linkEvent: ActionHandler<"link-event"> = async (inputs, _inv, ctx) => {
  const { issueKey, clusterKey } = inputs;
  if (issueKey === clusterKey) return invalidInput([{ input: "clusterKey", message: "must differ from issueKey" }]);
  if (!inputs.userConfirmed) {
    // Read-only preview: authorises both issues (asUser) and shows the fit.
    const x = await call(S.explainMatch(ctx, issueKey, clusterKey));
    if (!x.ok) return x.env;
    const pk = issueKey.replace(/-\d+$/, "");
    const { config } = await S.loadProjectConfig(ctx.ports.storage, pk);
    const fit = `${x.value.decision === "within-tau" ? "within" : "beyond"} the novelty threshold (d=${fmtD(x.value.d)}, τ=${fmtD(x.value.tau)})`;
    return needsConfirmation(
      `This would link ${issueKey} to cluster ${quote(x.value.cluster)} with link type "${config.linkType}" (Relates if that type is missing), and record the acceptance on ${issueKey}. The event is ${fit}.`,
      { issueKey, clusterKey, linkType: config.linkType, decision: x.value.decision, d: x.value.d, tau: x.value.tau },
      x.value.evidence,
      x.warnings,
    );
  }
  const r = await call(S.acceptMatch(ctx, issueKey, clusterKey));
  if (!r.ok) return r.env;
  const v = r.value;
  const link = v.link ?? { id: "", type: "", inward: issueKey, outward: clusterKey };
  const already = v.alreadyDone;
  return success({
    headline: already ? `Nothing new was written: ${v.summary}` : `Done: ${v.summary}`,
    data: {
      created: !already && v.created,
      alreadyLinked: already,
      link: { ...(link.id !== "" ? { id: link.id } : {}), type: link.type, inward: link.inward, outward: link.outward },
      ...(v.cluster !== undefined ? { cluster: clusterRef(v.cluster) } : {}),
      summary: v.summary,
      undo: UNDO_HINT,
    },
    evidence: v.evidence,
    nextSteps: [UNDO_HINT],
    warnings: r.warnings,
  });
};

// ------------------------------------------------------------------ create-cluster

/** An earlier `create-cluster` / Split from this event, found in tt.triage history (idempotency). */
async function priorSplit(ctx: ServiceContext, issueKey: string): Promise<{ clusterKey: string; at: string } | null> {
  const read = await S.readIssueAsUser(ctx, issueKey, { properties: [PROPERTY_KEYS.triage] });
  if (!read.ok) return null;
  const raw = read.value.properties[PROPERTY_KEYS.triage];
  if (!isRecord(raw)) return null;
  const t = parseTtTriage(raw);
  if (!t.ok || t.value.state !== "accepted" || t.value.clusterKey === undefined) return null;
  const current = t.value.clusterKey;
  const split = [...t.value.history].reverse().find((h) => h.action === "split" && h.clusterKey === current);
  return split === undefined ? null : { clusterKey: current, at: split.at };
}

const createCluster: ActionHandler<"create-cluster"> = async (inputs, _inv, ctx) => {
  const { issueKey } = inputs;
  // Preview / replay check first: authorises the event and tells us its current state.
  const m = await call(S.triageNow(ctx, issueKey));
  if (!m.ok) return m.env;
  const match = m.value;
  if (match.result === "accepted" && match.cluster !== undefined) {
    const prior = await priorSplit(ctx, issueKey);
    if (prior !== null && prior.clusterKey === match.cluster.key) {
      const row = await ctx.ports.storage.getEntity("cluster", match.cluster.id);
      const nameSource = row.ok && row.value !== undefined && row.value.nameDet !== match.cluster.name ? "user" : "deterministic";
      return success({
        headline: `Nothing new was written: ${issueKey} already seeds cluster ${quote(match.cluster)} (split at ${prior.at}).`,
        data: { created: false, cluster: clusterRef(match.cluster), seededWith: issueKey, proposedMembers: [], nameSource, summary: `Cluster ${match.cluster.key} already exists for ${issueKey}.`, undo: UNDO_HINT },
        evidence: [S.issueEvidence(issueKey, "Seed event"), S.issueEvidence(match.cluster.key, "Existing cluster", match.cluster.id)],
        nextSteps: [UNDO_HINT],
        warnings: m.warnings,
      });
    }
    return failure({
      status: "error",
      error: { code: "conflict", message: `${issueKey} is already accepted into ${match.cluster.key}. Undo that in the Takeover signature panel first, then split.`, retryable: false },
      evidence: [S.issueEvidence(issueKey, "Event"), S.issueEvidence(match.cluster.key, `Current cluster: ${match.cluster.name}`, match.cluster.id)],
      nextSteps: ["Open the event's Takeover signature panel and use Undo, then ask again."],
      warnings: m.warnings,
    });
  }
  if (!inputs.userConfirmed) {
    const name = inputs.name !== undefined ? `"${inputs.name}"` : `the template name for bucket ${match.event.type} x ${match.event.variant}`;
    return needsConfirmation(
      `This would create a new cluster issue named ${name} in ${issueKey.replace(/-\d+$/, "")}, seeded with ${issueKey} and linked to it. Other unassigned events that would then match are only proposed, never linked.`,
      { issueKey, ...(inputs.name !== undefined ? { name: inputs.name } : {}), bucket: match.event.bucket, currentResult: match.result },
      match.evidence,
      m.warnings,
    );
  }
  const r = await call(S.splitEvent(ctx, issueKey, inputs.name));
  if (!r.ok) return r.env;
  const v = r.value;
  if (v.cluster === undefined) return failure({ status: "error", error: { code: "error", message: "The cluster was not created.", retryable: true } });
  return success({
    headline: `Done: ${v.summary}`,
    data: { created: true, cluster: clusterRef(v.cluster), seededWith: issueKey, proposedMembers: [...v.proposedMembers], nameSource: v.nameSource ?? (inputs.name !== undefined ? "user" : "deterministic"), summary: v.summary, undo: UNDO_HINT },
    evidence: v.evidence,
    nextSteps: [UNDO_HINT, ...(v.proposedMembers.length > 0 ? [`Proposed members were NOT linked: ${listKeys(v.proposedMembers)}. Offer link-event for any the user wants.`] : [])],
    warnings: r.warnings,
  });
};

// ------------------------------------------------------------------ create-scenario-stub

const createScenarioStub: ActionHandler<"create-scenario-stub"> = async (inputs, _inv, ctx) => {
  const { clusterKey } = inputs;
  if (!inputs.userConfirmed) {
    const p = await call(S.previewScenarioStub(ctx, clusterKey));
    if (!p.ok) return p.env;
    const s = p.value;
    return needsConfirmation(
      `This would create the scenario-test stub "${s.summary}" with labels ${s.labels.join(", ")}, linked to ${clusterKey}${s.linkedEvents.length > 0 ? ` and to ${listKeys(s.linkedEvents)}` : ""}. If a stub for ${clusterKey} already exists, that one is returned instead.`,
      { clusterKey, summary: s.summary, labels: [...s.labels], linkedEvents: [...s.linkedEvents], narrativeSource: s.narrativeSource },
      s.evidence,
      p.warnings,
    );
  }
  const r = await call(S.createScenarioStub(ctx, clusterKey));
  if (!r.ok) return r.env;
  const s = r.value;
  if (s.created === undefined) return failure({ status: "error", error: { code: "error", message: "The scenario stub was not created.", retryable: true } });
  // The service reuses an existing stub (linked to the cluster) and flags it.
  const existed = s.reused === true;
  return success({
    headline: existed ? `Nothing new was written: the scenario stub ${s.created.key} for ${clusterKey} already exists.` : `Done: created scenario stub ${s.created.key} "${s.summary}" with ${s.labels.length} tag labels, linked to ${clusterKey}${s.linkedEvents.length > 0 ? ` and ${listKeys(s.linkedEvents)}` : ""}.`,
    data: {
      created: !existed,
      stub: { key: s.created.key, id: s.created.id, url: s.created.url, labels: [...s.labels], summary: s.summary },
      clusterKey,
      linkedEvents: [...s.linkedEvents],
      narrativeSource: s.narrativeSource,
    },
    confidence: s.confidence,
    evidence: [S.issueEvidence(s.created.key, "Scenario stub", s.created.id), ...s.evidence],
    caveats: ["The stub text is a fixed template from the cluster's signature; a test engineer must write the actual scenario."],
    nextSteps: existed ? [] : ["To remove the stub, delete the issue in Jira."],
    warnings: r.warnings,
  });
};

// ------------------------------------------------------------------ registry

export const ACTION_HANDLERS: { readonly [K in ActionKey]: ActionHandler<K> } = {
  "get-cluster-for-event": getClusterForEvent,
  "explain-match": explainMatch,
  "build-regression-check": buildRegressionCheck,
  "list-novel-since": listNovelSince,
  "list-coverage-gaps": listCoverageGaps,
  "suggest-owner": suggestOwner,
  "link-event": linkEvent,
  "create-cluster": createCluster,
  "create-scenario-stub": createScenarioStub,
};
