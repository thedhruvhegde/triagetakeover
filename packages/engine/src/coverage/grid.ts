/**
 * 2D coverage gap view (ARCHITECTURE §5.10, PRD US-17 AC4).
 *
 * Rows are condition chips, then ODD tags; columns are takeover types. Each cell counts the
 * events of clusters with that row value and type, and the scenario tests tagged for both
 * (a wildcard counts everywhere on its dimension). A cell is a gap when events > 0 and
 * tests = 0 (shown red).
 */
import { CONDITION_CHIPS, COVERAGE_WILDCARD, TAKEOVER_TYPES } from "../schema/index.js";
import type { ConditionSignature, ScenarioTags, TakeoverType } from "../schema/index.js";
import { effectiveChips } from "./signature.js";

export interface GapCell {
  readonly type: TakeoverType;
  readonly events: number;
  readonly tests: number;
  /** events > 0 and tests = 0. */
  readonly gap: boolean;
}

export interface GapRow {
  readonly dimension: "cond" | "odd";
  readonly value: string;
  /** One cell per grid column, in column order. */
  readonly cells: readonly GapCell[];
}

export interface GapGrid {
  readonly columns: readonly TakeoverType[];
  readonly rows: readonly GapRow[];
}

export interface GridCluster {
  readonly signature: ConditionSignature;
  readonly events: number;
}

export interface GridTest {
  readonly tags: ScenarioTags;
}

/** True when tag list `values` is present and contains `v` or the wildcard. */
function tagged(values: readonly string[] | undefined, v: string): boolean {
  return values !== undefined && (values.includes(v) || values.includes(COVERAGE_WILDCARD));
}

/** Values a cluster contributes to a row dimension. */
function clusterRowValues(sig: ConditionSignature, dim: "cond" | "odd"): readonly string[] {
  return dim === "cond" ? effectiveChips(sig) : sig.odd;
}

/** Sorted ODD values seen in clusters or tests (wildcard excluded). */
function oddRowValues(clusters: readonly GridCluster[], tests: readonly GridTest[]): string[] {
  const set = new Set<string>();
  for (const c of clusters) for (const v of c.signature.odd) set.add(v);
  for (const t of tests) for (const v of t.tags.odd ?? []) if (v !== COVERAGE_WILDCARD) set.add(v);
  return [...set].sort();
}

function buildRow(dim: "cond" | "odd", value: string, columns: readonly TakeoverType[], clusters: readonly GridCluster[], tests: readonly GridTest[]): GapRow {
  const cells = columns.map((type): GapCell => {
    let events = 0;
    for (const c of clusters) if (c.signature.type === type && clusterRowValues(c.signature, dim).includes(value)) events += c.events;
    const nTests = tests.filter((t) => tagged(t.tags.type, type) && tagged(t.tags[dim], value)).length;
    return { type, events, tests: nTests, gap: events > 0 && nTests === 0 };
  });
  return { dimension: dim, value, cells };
}

/**
 * Builds the gap grid. Chip rows are always all four {@link CONDITION_CHIPS} (stable layout;
 * clusters without signal chips count under `normal`). ODD rows are the values observed.
 */
export function gapGrid(clusters: readonly GridCluster[], tests: readonly GridTest[], columns: readonly TakeoverType[] = TAKEOVER_TYPES): GapGrid {
  const rows = [
    ...CONDITION_CHIPS.map((chip) => buildRow("cond", chip, columns, clusters, tests)),
    ...oddRowValues(clusters, tests).map((v) => buildRow("odd", v, columns, clusters, tests)),
  ];
  return { columns: [...columns], rows };
}
