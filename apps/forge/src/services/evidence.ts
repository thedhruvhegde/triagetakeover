/**
 * Evidence links, confidence objects and JSON-safety helpers shared by every service.
 * PRD requirement: every recommendation carries evidence (issue keys), a confidence with its
 * definition, and a "why".
 */
import { FEATURE_KEYS, FEATURE_SHORT_LABELS, type ExplainedWhyRow, type FeatureId } from "@tt/engine";
import type { Confidence, Evidence, WhyRowView } from "../contract/ui-api";

/** Site-relative issue URL (Custom UI opens it with `router.navigate`, §14: no pop-ups). */
export function issueUrl(key: string): string {
  return `/browse/${key}`;
}

export function issueEvidence(key: string, label: string, id?: string): Evidence {
  return { kind: "issue", key, url: issueUrl(key), label, ...(id !== undefined ? { id } : {}) };
}

export function jqlEvidence(jql: string, label: string): Evidence {
  return { kind: "jql", url: `/issues/?jql=${encodeURIComponent(jql)}`, label };
}

export function propertyEvidence(issueKey: string, propertyKey: string, label: string): Evidence {
  return { kind: "property", key: issueKey, url: `/rest/api/3/issue/${issueKey}/properties/${propertyKey}`, label };
}

export function ruleEvidence(label: string): Evidence {
  return { kind: "rule", url: "", label };
}

/** Finite number or null (contract types never carry Infinity / NaN). */
export function finiteOrNull(x: number | null | undefined): number | null {
  return x === null || x === undefined || !Number.isFinite(x) ? null : x;
}

/** Rounds for display-stable JSON (keeps full precision for p-values elsewhere). */
export function round(x: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function confidence(value: number, definition: string, inputs?: Readonly<Record<string, number>>): Confidence {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const clean: Record<string, number> = {};
  for (const [k, x] of Object.entries(inputs ?? {})) if (Number.isFinite(x)) clean[k] = x;
  return { value: v, definition, ...(Object.keys(clean).length > 0 ? { inputs: clean } : {}) };
}

export const MATCH_CONFIDENCE_DEFINITION = "clamp(1 − d*/τ, 0, 1): d* is the distance to the nearest accepted member of the cluster, τ the novelty threshold";

/** Engine why-row → contract row. */
export function whyRowView(r: ExplainedWhyRow): WhyRowView {
  const id = r.feature as FeatureId;
  return {
    feature: id,
    key: FEATURE_KEYS[id],
    label: FEATURE_SHORT_LABELS[id],
    unit: r.unit,
    eventValue: finiteOrNull(r.eventValue),
    referenceValue: finiteOrNull(r.referenceValue),
    z: finiteOrNull(r.z),
    contribution: finiteOrNull(r.contribution),
    note: r.note,
  };
}

/** De-duplicates evidence by kind+key+label and caps it at the §10.3 limit (30). */
export function dedupeEvidence(items: readonly Evidence[], max = 30): Evidence[] {
  const seen = new Set<string>();
  const out: Evidence[] = [];
  for (const e of items) {
    const id = `${e.kind}|${e.key ?? ""}|${e.label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}
