/**
 * Scenario-test tag sources (ARCHITECTURE §5.10, PRD US-17 AC2).
 *
 * Tags come only from `type:` / `variant:` / `cond:` / `odd:` labels or from a `tt.scenario`
 * property with the same keys. There is no free-text or LLM tagging.
 */
import {
  COVERAGE_DIMENSIONS,
  SCENARIO_LABEL,
  parseTtScenario,
  tagsFromLabels,
  type CoverageDimension,
  type EngineError,
  type ScenarioTags,
  type TtScenario,
} from "../schema/index.js";

/** Default scenario-test JQL. */
export const DEFAULT_SCENARIO_JQL = `labels = ${SCENARIO_LABEL}`;
/** Fallback JQL, used only when the site has a `Test` issue type. */
export const TEST_TYPE_SCENARIO_JQL = "issuetype = Test";

/**
 * JQL queries to try in order until one returns issues: the configured query alone when the
 * admin set one, else the default label query, then `issuetype = Test` if that type exists.
 */
export function scenarioJqlCandidates(configured: string | undefined, testTypeExists: boolean): readonly string[] {
  const trimmed = configured?.trim() ?? "";
  if (trimmed !== "") return [trimmed];
  return testTypeExists ? [DEFAULT_SCENARIO_JQL, TEST_TYPE_SCENARIO_JQL] : [DEFAULT_SCENARIO_JQL];
}

/** One scenario test as the coverage verdict sees it. */
export interface ScenarioTest {
  /** Issue key, e.g. `TTDEMO-41`. */
  readonly key: string;
  readonly tags: ScenarioTags;
}

/** Converts a validated `tt.scenario` property to tags. Empty arrays mean "unspecified". */
export function tagsFromProperty(p: TtScenario): ScenarioTags {
  const out: { [K in CoverageDimension]?: readonly string[] } = { type: [p.type], variant: [p.variant] };
  if (p.cond.length > 0) out.cond = [...new Set<string>(p.cond)].sort();
  if (p.odd.length > 0) out.odd = [...new Set(p.odd)].sort();
  return out;
}

/** Raw data the service reads for one scenario issue. */
export interface ScenarioIssueInput {
  readonly key: string;
  readonly labels: readonly string[];
  /** Raw `tt.scenario` property value, if the issue has one (untrusted). */
  readonly property?: unknown;
}

export interface ScenarioTestParse {
  readonly test: ScenarioTest;
  /** Where the tags came from. */
  readonly source: "property" | "labels";
  /** Validation errors of a present but invalid property (the labels are used instead). */
  readonly propertyErrors: readonly EngineError[];
}

/**
 * Reads a scenario issue's tags. A valid `tt.scenario` property wins over labels (it is the
 * explicit, structured source). An invalid property is reported and the labels are used.
 */
export function scenarioTestFromIssue(issue: ScenarioIssueInput): ScenarioTestParse {
  if (issue.property !== undefined) {
    const parsed = parseTtScenario(issue.property);
    if (parsed.ok) return { test: { key: issue.key, tags: tagsFromProperty(parsed.value) }, source: "property", propertyErrors: [] };
    return { test: { key: issue.key, tags: tagsFromLabels(issue.labels) }, source: "labels", propertyErrors: parsed.error };
  }
  return { test: { key: issue.key, tags: tagsFromLabels(issue.labels) }, source: "labels", propertyErrors: [] };
}

/** True when the tags specify at least one coverage dimension. */
export function hasAnyTag(tags: ScenarioTags): boolean {
  return COVERAGE_DIMENSIONS.some((d) => (tags[d]?.length ?? 0) > 0);
}
