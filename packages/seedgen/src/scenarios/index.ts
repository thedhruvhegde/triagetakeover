/**
 * Scenario-test issues (SEED_DATA §11): 10 issues with deterministic condition tags and one
 * deliberate gap (lane-loss x low-sun-glare x cam-B x highway has no covering test).
 * The text is fixed, so no randomness is needed.
 */
import { simpleDescription } from "../text/index.js";
import type { LatentId, ScenarioIssueSpec, ScenarioPropertySeed, ScenarioTagsSeed } from "../types.js";

interface ScenarioRow {
  readonly id: string;
  readonly title: string;
  readonly tags: ScenarioTagsSeed;
  readonly intendedCovers: readonly LatentId[];
}

export const SCENARIO_ROWS: readonly ScenarioRow[] = [
  { id: "SCN-01", title: "Lead decelerates, night, urban", tags: { type: "late-brake", variant: "cam-A", cond: ["night"], odd: ["urban"] }, intendedCovers: ["LC-B"] },
  { id: "SCN-02", title: "Lead stops, daytime highway", tags: { type: "late-brake", variant: "any", cond: ["normal"], odd: ["highway"] }, intendedCovers: [] },
  { id: "SCN-03", title: "Overpass shadow, no object", tags: { type: "phantom-brake", variant: "cam-A", cond: ["normal"], odd: ["highway"] }, intendedCovers: ["LC-D"] },
  { id: "SCN-04", title: "Wide curve, assist hand-back", tags: { type: "lateral-drift", variant: "any", cond: ["normal"], odd: ["rural"] }, intendedCovers: ["LC-C"] },
  { id: "SCN-05", title: "Faded markings in rain", tags: { type: "lane-loss", variant: "cam-A", cond: ["blur-rain"], odd: ["rural"] }, intendedCovers: [] },
  { id: "SCN-06", title: "Lane-loss at night (no variant label)", tags: { type: "lane-loss", cond: ["night"], odd: ["urban"] }, intendedCovers: [] },
  { id: "SCN-07", title: "Motorcycle cut-in (tags in property)", tags: { type: "cut-in-response", variant: "cam-B", cond: ["normal"], odd: ["highway"] }, intendedCovers: [] },
  { id: "SCN-08", title: "Crosswind drift", tags: { type: "lateral-drift", variant: "cam-B", cond: ["normal"], odd: ["highway"] }, intendedCovers: [] },
  { id: "SCN-09", title: "Phantom brake in low sun", tags: { type: "phantom-brake", variant: "cam-B", cond: ["low-sun-glare"], odd: ["highway"] }, intendedCovers: [] },
  { id: "SCN-10", title: "Late brake, night and rain", tags: { type: "late-brake", variant: "cam-A", cond: ["night", "blur-rain"], odd: ["urban"] }, intendedCovers: ["LC-B"] },
];

/** The scenario whose tags live in the `tt.scenario` property instead of labels. */
export const PROPERTY_SCENARIO_ID = "SCN-07";

/** Tag labels for a scenario (`type:`, `variant:`, `cond:`, `odd:`); an absent dimension has no label. */
export function tagLabels(tags: ScenarioTagsSeed): string[] {
  const out = [`type:${tags.type}`];
  if (tags.variant !== undefined) out.push(`variant:${tags.variant}`);
  for (const c of tags.cond) out.push(`cond:${c}`);
  for (const o of tags.odd) out.push(`odd:${o}`);
  return out;
}

/** `tt.scenario` property value, schema v1 (ARCHITECTURE §6.1): `{v, type, variant?, cond[], odd[]}`. */
export function scenarioProperty(tags: ScenarioTagsSeed): ScenarioPropertySeed {
  const out: Record<string, number | string | readonly string[]> = { v: 1, type: tags.type, cond: tags.cond, odd: tags.odd };
  if (tags.variant !== undefined) out["variant"] = tags.variant;
  return out;
}

/** Builds the 10 scenario issue specs. */
export function buildScenarios(seed: number): ScenarioIssueSpec[] {
  return SCENARIO_ROWS.map((row) => {
    const inProperty = row.id === PROPERTY_SCENARIO_ID;
    return {
      id: row.id,
      title: row.title,
      summary: `[SYNTHETIC] Scenario: ${row.title}`,
      labels: ["tt-synthetic", "tt-scenario", ...(inProperty ? [] : tagLabels(row.tags))],
      tags: row.tags,
      tagsInProperty: inProperty,
      property: inProperty ? scenarioProperty(row.tags) : null,
      intendedCovers: row.intendedCovers,
      descriptionAdf: simpleDescription(seed, row.id, `Scenario test (fictional): ${row.title}.`),
    };
  });
}
