/**
 * Scenario coverage (ARCHITECTURE §5.10, PRD US-17, US-18).
 *
 * Scenario tests are found asUser with the configured JQL (or the engine's default candidates)
 * and tagged ONLY from `type:/variant:/cond:/odd:` labels or a `tt.scenario` property; there
 * is no free-text tagging. Verdicts, the 2D gap grid and the stub are engine templates.
 */
import {
  COVERAGE_DIMENSIONS,
  coverageVerdict,
  effectiveChips,
  gapGrid,
  hasAnyTag,
  scenarioJqlCandidates,
  scenarioStub,
  scenarioTestFromIssue,
  signatureText,
  type ConditionSignature,
  type ScenarioTest,
  type StubEvent,
  type TakeoverType,
} from "@tt/engine";
import type { ConditionChipName, CoverageView, GapGridView, ScenarioStubView, TakeoverTypeName } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import type { JiraIssue, JiraPort } from "../ports/jira";
import { LABELS, PROPERTY_KEYS, SYNTHETIC_SUMMARY_PREFIX } from "../ports/properties";
import { readIssueAsUser, requireAccount, requireBrowse, userPort } from "./auth";
import { clusterInputOf, compareKeys, clusterIndex, clusterRefOf, loadProjectClusters, queryAll, type Keyed } from "./index-store";
import { currentClusterCache, distancesToMedoid, readMemberExtras } from "./clusters";
import { buildComparator, loadProjectConfig, type ProjectConfig } from "./config";
import { done, fail, fromPortError, type ServiceResult } from "./errors";
import { confidence, dedupeEvidence, issueEvidence, jqlEvidence } from "./evidence";
import { fillMissingProperties, isClusterIssue, readIssuesByKey, resolveLinkType } from "./jira-io";
import type { EventRow } from "../ports/entities";

export const MAX_SCENARIO_PAGES = 5;

export interface ScenarioTestSet {
  readonly jql: string;
  readonly state: CoverageView["state"];
  readonly tests: readonly ScenarioTest[];
  readonly message?: string;
}

/** Finds scenario tests (asUser: permission-filtered by Jira). */
export async function loadScenarioTests(jira: JiraPort, config: ProjectConfig): Promise<ScenarioTestSet> {
  const project = await jira.getProject(config.projectKey);
  const testType = project.ok && project.value.issueTypes.some((t) => t.name.toLowerCase() === "test");
  const candidates = scenarioJqlCandidates(config.scenarioJql === "" ? undefined : config.scenarioJql, testType);
  let lastError: string | undefined;
  for (const jql of candidates) {
    const issues: JiraIssue[] = [];
    let token: string | undefined;
    let failed = false;
    for (let page = 0; page < MAX_SCENARIO_PAGES; page++) {
      const r = await jira.searchJql({ jql, properties: [PROPERTY_KEYS.scenario], maxResults: 100, ...(token !== undefined ? { nextPageToken: token } : {}) });
      if (!r.ok) {
        failed = true;
        lastError = r.error.message;
        break;
      }
      issues.push(...r.value.issues);
      token = r.value.nextPageToken;
      if (token === undefined) break;
    }
    if (failed || issues.length === 0) continue;
    // SPIKE-E3: issues without tag labels may carry tags in tt.scenario that search did not return.
    const needProp = issues.filter((i) => !(PROPERTY_KEYS.scenario in i.properties) && !hasAnyTag(scenarioTestFromIssue({ key: i.key, labels: i.labels }).test.tags)).slice(0, 50);
    const filled = needProp.length > 0 ? await fillMissingProperties(jira, needProp, [PROPERTY_KEYS.scenario]) : { ok: true as const, value: [] };
    const byKey = new Map(issues.map((i) => [i.key, i]));
    if (filled.ok) for (const f of filled.value) byKey.set(f.key, f);
    const tests = [...byKey.values()].map((i) => {
      const prop = i.properties[PROPERTY_KEYS.scenario];
      return scenarioTestFromIssue({ key: i.key, labels: i.labels, ...(prop !== undefined ? { property: prop } : {}) }).test;
    });
    return { jql, state: "ok", tests: tests.sort((a, b) => compareKeys(a.key, b.key)) };
  }
  const shown = candidates.join(" OR ");
  if (lastError !== undefined && candidates.length === 1) return { jql: shown, state: "jql-error", tests: [], message: `The scenario JQL was rejected: ${lastError}` };
  return { jql: shown, state: "no-scenario-tests", tests: [] };
}

export function signatureView(sig: ConditionSignature): CoverageView["signature"] {
  return { type: sig.type, variant: sig.variant, chips: effectiveChips(sig) as readonly ConditionChipName[], odd: sig.odd, text: signatureText(sig) };
}

export function coverageView(sig: ConditionSignature, set: ScenarioTestSet): CoverageView {
  const signature = signatureView(sig);
  const jqlEv = jqlEvidence(set.jql, `Scenario tests: ${set.jql}`);
  if (set.state !== "ok") {
    const text = set.state === "jql-error" ? (set.message ?? "The scenario JQL was rejected.") : `No scenario tests found (looked for: ${set.jql})`;
    return { state: set.state, verdict: null, signature, tests: [], missing: [], text, scenarioJql: set.jql, confidence: confidence(0, "No scenario tests to compare with."), evidence: [jqlEv] };
  }
  const r = coverageVerdict(sig, set.tests);
  const matched = COVERAGE_DIMENSIONS.length - r.missing.length;
  return {
    state: "ok",
    verdict: r.verdict,
    signature,
    tests: r.tests,
    missing: r.missing,
    text: r.verdict === "covered" ? `Covered by ${r.tests.length} test(s): ${r.tests.join(", ")}` : r.verdict === "partial" ? `Partially covered by ${r.tests[0] ?? "a test"}; missing ${r.missing.join(", ")}` : r.text,
    scenarioJql: set.jql,
    confidence: confidence(r.verdict === "covered" ? 1 : matched / COVERAGE_DIMENSIONS.length, "Share of the 4 signature dimensions (type, variant, cond, odd) matched by the best scenario test; 1 when covered", { matched }),
    evidence: [...r.tests.map((k) => ({ kind: "scenario" as const, key: k, url: `/browse/${k}`, label: `Scenario test ${k}` })), jqlEv],
  };
}

export function gapGridView(clusters: readonly { signature: ConditionSignature; events: number }[], set: ScenarioTestSet): GapGridView {
  const g = gapGrid(clusters, set.tests);
  return {
    columns: g.columns as readonly TakeoverTypeName[],
    rows: g.rows.map((r) => ({ dimension: r.dimension, value: r.value, cells: r.cells.map((c) => ({ type: c.type as TakeoverType, events: c.events, tests: c.tests, gap: c.gap })) })),
  };
}

// ------------------------------------------------------------------ scenario stub (US-18)

interface StubContext {
  readonly cluster: JiraIssue;
  readonly config: ProjectConfig;
  readonly stub: ReturnType<typeof scenarioStub>;
  readonly signature: ConditionSignature;
  readonly coverage: CoverageView;
  readonly synthetic: boolean;
  readonly members: readonly string[];
  readonly clusterName: string;
}

async function stubContext(ctx: ServiceContext, clusterKey: string): Promise<ServiceResult<StubContext>> {
  const read = await readIssueAsUser(ctx, clusterKey, { properties: [PROPERTY_KEYS.cluster] });
  if (!read.ok) return read;
  const cluster = read.value;
  const browse = await requireBrowse(ctx, cluster.projectKey);
  if (!browse.ok) return browse;
  if (!isClusterIssue(cluster)) return fail("invalid-input", `${clusterKey} is not a Takeover Triage cluster issue.`);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const { config, warnings } = await loadProjectConfig(ctx.ports.storage, cluster.projectKey);
  const rows = await loadProjectClusters(ctx.ports.storage, cluster.projectKey);
  if (!rows.ok) return fromPortError(rows.error, "Reading the cluster index");
  const idx = clusterIndex(rows.value);
  const row = idx.byId.get(cluster.id);
  if (row === undefined) return fail("invalid-input", `${clusterKey} is not indexed yet; run Re-sync now.`);
  const memberRows = await queryAll(ctx.ports.storage, "event", { index: "by-cluster", partition: [cluster.id] });
  if (!memberRows.ok) return fromPortError(memberRows.error, "Reading cluster members");
  const members: Keyed<EventRow>[] = memberRows.value.filter((m) => m.value.status === "accepted");
  if (members.length === 0) return fail("invalid-input", `${clusterKey} has no accepted members, so it has no condition signature yet.`);
  const cache = await currentClusterCache(jira.value, row, members, (id) => idx.keyOf(id), buildComparator(config));
  if (!cache.ok) return fromPortError(cache.error, "Reading member events");
  const extras = await readMemberExtras(jira.value, members.map((m) => m.value.issueKey));
  if (!extras.ok) return fromPortError(extras.error, "Reading member events");
  const inputs = members.map((m) => clusterInputOf(m.value, (id) => idx.keyOf(id)));
  const dist = distancesToMedoid(inputs, cache.value.cache.medoidKey);
  const stubMembers: StubEvent[] = members.map((m) => {
    const ev = extras.value.get(m.value.issueKey)?.event;
    return {
      key: m.value.issueKey,
      distanceToMedoid: dist.get(m.value.issueKey) ?? Infinity,
      build: m.value.build,
      ...(ev !== undefined ? { occurredAt: ev.ctx.occurredAt, vehicleId: ev.ctx.vehicleId, odd: ev.ctx.odd, chips: ev.img?.chips ?? [] } : {}),
    };
  });
  const tests = await loadScenarioTests(jira.value, config);
  const sig = cache.value.cache.signature;
  const engineCoverage = tests.state === "ok" ? coverageVerdict(sig, tests.tests) : undefined;
  const clusterName = clusterRefOf(cluster.id, row).name;
  const stub = scenarioStub({ clusterKey, clusterName, signature: sig, members: stubMembers, ...(engineCoverage !== undefined ? { coverage: engineCoverage } : {}) });
  return done({ cluster, config, stub, signature: sig, coverage: coverageView(sig, tests), synthetic: row.synthetic, members: members.map((m) => m.value.issueKey), clusterName }, warnings);
}

function stubView(c: StubContext, created?: { key: string; id: string }, reused = false): ScenarioStubView {
  const s = c.stub;
  return {
    clusterKey: c.cluster.key,
    summary: summaryOf(c),
    labels: labelsOf(c),
    description: s.description,
    linkedEvents: s.links.events,
    narrativeSource: "template",
    ...(created !== undefined ? { created: { ...created, url: `/browse/${created.key}` }, reused } : {}),
    evidence: dedupeEvidence([issueEvidence(c.cluster.key, `Cluster: ${c.clusterName}`, c.cluster.id), ...s.links.events.map((k, i) => issueEvidence(k, i === 0 ? "Medoid event" : `Representative event ${i + 1}`)), ...c.coverage.evidence]),
    confidence: c.coverage.confidence,
    why: [`Signature: ${signatureText(c.signature)}`, `Coverage now: ${c.coverage.text}`, "Description, labels and links are a deterministic template (no AI text)."],
  };
}

function summaryOf(c: StubContext): string {
  return (c.synthetic ? `${SYNTHETIC_SUMMARY_PREFIX} ${c.stub.summary}` : c.stub.summary).slice(0, 255);
}

function labelsOf(c: StubContext): string[] {
  return c.synthetic ? [...c.stub.labels, LABELS.synthetic] : [...c.stub.labels];
}

/** Template preview; nothing is written (US-18 AC2). */
export async function previewScenarioStub(ctx: ServiceContext, clusterKey: string): Promise<ServiceResult<ScenarioStubView>> {
  const c = await stubContext(ctx, clusterKey);
  if (!c.ok) return c;
  const warnings = [...c.value.warnings];
  if (c.value.value.coverage.verdict === "covered") warnings.push(`${clusterKey} is already covered: ${c.value.value.coverage.text}.`);
  return done(stubView(c.value.value), warnings);
}

/**
 * Creates the stub issue asUser: template summary/description, tag labels + `tt-scenario`,
 * a `tt.scenario` property with the same tags, and links to the cluster and the 3
 * representative events. If a stub for this cluster already exists (linked to it), that one is
 * returned instead of creating a duplicate.
 */
export async function createScenarioStub(ctx: ServiceContext, clusterKey: string): Promise<ServiceResult<ScenarioStubView>> {
  const by = requireAccount(ctx);
  if (!by.ok) return by;
  const cr = await stubContext(ctx, clusterKey);
  if (!cr.ok) return cr;
  const c = cr.value.value;
  const warnings = [...cr.value.warnings];
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const linkedKeys = (c.cluster.links ?? []).map((l) => (l.inwardIssue.id === c.cluster.id ? l.outwardIssue.key : l.inwardIssue.key));
  if (linkedKeys.length > 0) {
    const linked = await readIssuesByKey(jira.value, linkedKeys, []);
    if (linked.ok) {
      const existing = [...linked.value.values()].find((i) => i.labels.includes(LABELS.scenario) && i.summary.includes(`(from ${clusterKey})`));
      if (existing !== undefined) {
        warnings.push(`A scenario stub for ${clusterKey} already exists: ${existing.key}. Nothing new was created.`);
        return done(stubView(c, { key: existing.key, id: existing.id }, true), warnings);
      }
    }
  }
  if (c.coverage.verdict === "covered") warnings.push(`${clusterKey} was already covered (${c.coverage.text}); the stub was created as requested.`);
  const created = await jira.value.createIssue({ projectKey: c.cluster.projectKey, issueType: c.config.scenarioIssueType, summary: summaryOf(c), description: c.stub.description, labels: labelsOf(c) });
  if (!created.ok) return fromPortError(created.error, "Creating the scenario stub");
  const sig = c.signature;
  const prop = { v: 1, type: sig.type, variant: sig.variant, cond: [...effectiveChips(sig)], odd: [...sig.odd] };
  const p = await jira.value.setIssueProperty(created.value.id, PROPERTY_KEYS.scenario, prop);
  if (!p.ok) warnings.push("The tt.scenario property could not be written; the tag labels still carry the tags.");
  const lt = await resolveLinkType(ctx, jira.value, { ...c.config, linkType: "Relates" });
  if (lt === null) warnings.push("No issue link type exists on this site; the stub is not linked.");
  else {
    for (const target of [c.cluster.key, ...c.stub.links.events]) {
      const l = await jira.value.createIssueLink({ type: lt.name, inwardIssue: created.value.id, outwardIssue: target });
      if (!l.ok) warnings.push(`Could not link the stub to ${target}.`);
    }
  }
  return done(stubView(c, created.value), warnings);
}
