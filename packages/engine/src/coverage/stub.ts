/**
 * Scenario-test stub from a coverage gap (ARCHITECTURE §5.10, PRD US-18, US-21 AC4).
 *
 * Everything here is template output: identical input gives identical summary, labels,
 * links and description. There is no LLM narrative.
 */
import { SCENARIO_LABEL, type ConditionChip, type ConditionSignature, type CoverageResult } from "../schema/index.js";
import { effectiveChips, signatureText } from "./signature.js";
import { compareIssueKeysNatural } from "./verdict.js";

/** Representative events linked from a stub: the medoid plus the next 2 nearest. */
export const STUB_REPRESENTATIVES = 3;
/** Jira summary length limit. */
export const SUMMARY_MAX_LENGTH = 255;

/** A cluster member as the stub sees it. */
export interface StubEvent {
  readonly key: string;
  /** Distance to the cluster medoid (0 for the medoid itself). */
  readonly distanceToMedoid: number;
  readonly occurredAt?: string;
  readonly vehicleId?: string;
  readonly build?: string;
  readonly chips?: readonly ConditionChip[];
  readonly odd?: readonly string[];
}

/**
 * Picks the `n` members nearest the medoid: by distance ascending (non-finite last), then
 * key. The medoid (distance 0) therefore comes first.
 */
export function representativeEvents(members: readonly StubEvent[], n: number = STUB_REPRESENTATIVES): StubEvent[] {
  const dist = (e: StubEvent): number => (Number.isFinite(e.distanceToMedoid) ? e.distanceToMedoid : Number.POSITIVE_INFINITY);
  return [...members].sort((a, b) => dist(a) - dist(b) || compareIssueKeysNatural(a.key, b.key)).slice(0, Math.max(0, n));
}

/** Turns a tag value into a valid Jira label value (labels cannot contain spaces). */
function labelValue(v: string): string {
  return v.trim().replace(/\s+/g, "-");
}

/** Labels for a stub: `tt-scenario` plus one label per signature value on every dimension. */
export function stubLabels(sig: ConditionSignature): string[] {
  const labels = [
    SCENARIO_LABEL,
    `type:${labelValue(sig.type)}`,
    `variant:${labelValue(sig.variant)}`,
    ...effectiveChips(sig).map((c) => `cond:${c}`),
    ...sig.odd.map((o) => `odd:${labelValue(o)}`),
  ];
  return [...new Set(labels)];
}

/** Stub summary: `Scenario: <name> (from <clusterKey>)`, with the name shortened to fit 255 characters. */
export function stubSummary(clusterName: string, clusterKey: string): string {
  const suffix = ` (from ${clusterKey})`;
  const room = SUMMARY_MAX_LENGTH - "Scenario: ".length - suffix.length;
  const name = clusterName.trim();
  const shown = name.length <= room ? name : `${name.slice(0, Math.max(0, room - 3))}...`;
  return `Scenario: ${shown}${suffix}`;
}

export interface EvidenceTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

const EVIDENCE_HEADER = ["Event", "Role", "Distance", "Occurred", "Vehicle", "Build", "Chips", "ODD"] as const;
const DASH = "-";

function roleOf(i: number): string {
  return i === 0 ? "medoid" : `nearest ${i}`;
}

/** Evidence table rows for the representative events (missing values shown as `-`). */
export function evidenceTable(events: readonly StubEvent[]): EvidenceTable {
  const rows = events.map((e, i) => [
    e.key,
    roleOf(i),
    Number.isFinite(e.distanceToMedoid) ? e.distanceToMedoid.toFixed(2) : DASH,
    e.occurredAt ?? DASH,
    e.vehicleId ?? DASH,
    e.build ?? DASH,
    e.chips !== undefined && e.chips.length > 0 ? e.chips.join(", ") : DASH,
    e.odd !== undefined && e.odd.length > 0 ? e.odd.join(", ") : DASH,
  ]);
  return { header: [...EVIDENCE_HEADER], rows };
}

export interface ScenarioStubInput {
  readonly clusterKey: string;
  /** Cluster display name (`tt.cluster.nameDet` or the user's edited name). */
  readonly clusterName: string;
  readonly signature: ConditionSignature;
  /** All cluster members; the representatives are chosen from these. */
  readonly members: readonly StubEvent[];
  /** Coverage before the stub, quoted in the description when given. */
  readonly coverage?: CoverageResult;
}

export interface ScenarioStub {
  readonly summary: string;
  readonly labels: readonly string[];
  readonly links: { readonly cluster: string; readonly events: readonly string[] };
  readonly evidence: EvidenceTable;
  /** Plain-text description (Markdown-style table); the service converts it to ADF. */
  readonly description: string;
  readonly narrativeSource: "template";
}

function markdownRow(cells: readonly string[]): string {
  return `| ${cells.map((c) => c.replace(/\|/g, "/")).join(" | ")} |`;
}

/** Renders the templated description text. */
function describeStub(input: ScenarioStubInput, evidence: EvidenceTable): string {
  const sig = input.signature;
  const lines = [
    `Scenario stub created by Takeover Triage from cluster ${input.clusterKey} (${input.clusterName.trim()}).`,
    "",
    "Condition signature:",
    `- Takeover type: ${sig.type}`,
    `- Sensor variant: ${sig.variant}`,
    `- Conditions: ${effectiveChips(sig).join(", ")}`,
    `- ODD: ${sig.odd.length > 0 ? sig.odd.join(", ") : "unspecified"}`,
    `- Signature: ${signatureText(sig)}`,
    "",
  ];
  if (input.coverage !== undefined) lines.push(`Coverage before this stub: ${input.coverage.text}.`, "");
  lines.push(
    `Evidence (${input.members.length} member events; ${evidence.rows.length} representative: the medoid and the nearest members):`,
    markdownRow(evidence.header),
    markdownRow(evidence.header.map(() => "---")),
    ...evidence.rows.map(markdownRow),
    "",
    "To do: define the test procedure and pass criteria for this scenario.",
  );
  return lines.join("\n");
}

/** Builds the scenario stub for a cluster (deterministic template, US-18). */
export function scenarioStub(input: ScenarioStubInput): ScenarioStub {
  const reps = representativeEvents(input.members);
  const evidence = evidenceTable(reps);
  return {
    summary: stubSummary(input.clusterName, input.clusterKey),
    labels: stubLabels(input.signature),
    links: { cluster: input.clusterKey, events: reps.map((e) => e.key) },
    evidence,
    description: describeStub(input, evidence),
    narrativeSource: "template",
  };
}
