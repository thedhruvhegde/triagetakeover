/**
 * Components and ordered routing rules (SEED_DATA §12). First match wins; the last rule is the
 * default (project lead). The component lead is the admin running the seed; no fake users.
 */
import type { ComponentName, LatentId, RoutingSeed, TakeoverType } from "../types.js";

export const COMPONENTS: readonly ComponentName[] = ["Perception", "Planning", "Controls"];

/** Builds the routing seed written to `config:<projectKey>.routing[]`. */
export function buildRouting(): RoutingSeed {
  return {
    components: COMPONENTS.map((name) => ({ name, lead: "admin" })),
    rules: [
      { match: { type: ["lane-loss"] }, team: { component: "Perception" }, text: "type = lane-loss → Perception" },
      { match: { type: ["phantom-brake"] }, team: { component: "Perception" }, text: "type = phantom-brake → Perception" },
      { match: { type: ["late-brake", "cut-in-response"] }, team: { component: "Planning" }, text: "type ∈ {late-brake, cut-in-response} → Planning" },
      { match: { type: ["lateral-drift"] }, team: { component: "Controls" }, text: "type = lateral-drift → Controls" },
      { match: {}, team: { projectLead: true }, text: "default → project lead" },
    ],
  };
}

/** Applies the rules to a type: the matched component, or "project-lead" for the default rule. */
export function routeType(routing: RoutingSeed, type: TakeoverType): ComponentName | "project-lead" {
  for (const rule of routing.rules) {
    if (rule.match.type !== undefined && !rule.match.type.includes(type)) continue;
    return "component" in rule.team ? rule.team.component : "project-lead";
  }
  return "project-lead";
}

/** Expected owner per latent cluster (§12 truth). */
export const EXPECTED_OWNER: Readonly<Record<LatentId, ComponentName>> = {
  "LC-A": "Perception", "LC-B": "Planning", "LC-C": "Controls", "LC-D": "Perception", "NOVEL-1": "Perception",
};
