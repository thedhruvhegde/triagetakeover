/**
 * Routing rules, pure part (ARCHITECTURE §5.11, PRD US-15 AC1 and AC4).
 *
 * Admin mappings are an ordered list of `{match, team}`. The first match wins; a rule with
 * an empty `match` is the default and must be last.
 */
import { INVALID, TAKEOVER_TYPES, arrayOf, joinPath, object, oneOf, run, str } from "../schema/index.js";
import type { Decoder, Result, TakeoverType } from "../schema/index.js";

/** One value or a set of alternatives (`type ∈ {late-brake, cut-in-response}`). */
export type MatchValue<T extends string = string> = T | readonly T[];

export interface RoutingMatch {
  readonly type?: MatchValue<TakeoverType>;
  /** Jira component name or id, compared verbatim with the subject's components. */
  readonly component?: MatchValue;
  readonly variant?: MatchValue;
}

/** Where a rule routes to. The service resolves it to people (TwgPort / JiraPort, §11). */
export interface TeamRef {
  /** Atlassian Team ARI (resolved through the Teamwork Graph, as the user). */
  readonly teamAri?: string;
  /** Jira component id (its lead is the first fallback). */
  readonly componentId?: string;
  /** Jira project role id (its actors are the second fallback). */
  readonly projectRoleId?: string;
  /** Display label for rule text, e.g. "Perception". */
  readonly label?: string;
}

export interface RoutingRule {
  readonly match: RoutingMatch;
  readonly team: TeamRef;
}

/** What is being routed (a cluster). */
export interface RoutingSubject {
  readonly type: TakeoverType;
  readonly variant: string;
  /** Components already set on the cluster issue (names or ids). */
  readonly components?: readonly string[];
}

export interface RuleEvaluation {
  /** 0-based index of the matching rule. */
  readonly ruleIndex: number;
  readonly ruleText: string;
  readonly teamRef: TeamRef;
}

/** Maximum rules accepted from config. */
export const MAX_ROUTING_RULES = 50;

function asList<T extends string>(v: MatchValue<T>): readonly T[] {
  return typeof v === "string" ? [v as T] : (v as readonly T[]);
}

/** True when the rule has no conditions (the default rule). */
export function isDefaultRule(rule: RoutingRule): boolean {
  const m = rule.match;
  return m.type === undefined && m.component === undefined && m.variant === undefined;
}

/** True when every condition of `rule` holds for `subject`. */
export function ruleMatches(rule: RoutingRule, subject: RoutingSubject): boolean {
  const { type, component, variant } = rule.match;
  if (type !== undefined && !asList(type).includes(subject.type)) return false;
  if (variant !== undefined && !asList(variant).includes(subject.variant)) return false;
  if (component !== undefined) {
    const have = subject.components ?? [];
    if (!asList(component).some((c) => have.includes(c))) return false;
  }
  return true;
}

function conditionText(name: string, v: MatchValue | undefined): string | null {
  if (v === undefined) return null;
  const list = asList(v);
  return list.length === 1 ? `${name} = ${list[0] ?? ""}` : `${name} in {${list.join(", ")}}`;
}

/** Display text for a team ref: the label, else the first configured target. */
export function teamRefText(t: TeamRef): string {
  if (t.label !== undefined && t.label.trim() !== "") return t.label.trim();
  if (t.teamAri !== undefined) return `team ${t.teamAri}`;
  if (t.componentId !== undefined) return `component ${t.componentId}`;
  if (t.projectRoleId !== undefined) return `project role ${t.projectRoleId}`;
  return "nobody";
}

/** Deterministic rule text, e.g. `type in {late-brake, cut-in-response} -> Planning`. */
export function ruleText(rule: RoutingRule): string {
  const conds = [conditionText("type", rule.match.type), conditionText("component", rule.match.component), conditionText("variant", rule.match.variant)].filter(
    (c): c is string => c !== null,
  );
  return `${conds.length > 0 ? conds.join(" and ") : "default"} -> ${teamRefText(rule.team)}`;
}

/** Evaluates rules in order; the first match wins. Returns null when nothing matches. */
export function evaluateRules(rules: readonly RoutingRule[], subject: RoutingSubject): RuleEvaluation | null {
  const i = rules.findIndex((r) => ruleMatches(r, subject));
  const rule = rules[i];
  return rule === undefined ? null : { ruleIndex: i, ruleText: ruleText(rule), teamRef: rule.team };
}

// ---- Validation of untrusted config (`config:<projectKey>.routing[]`) ----

const tag = str({ minLength: 1, maxLength: 128 });

/** One value or a non-empty array of values. */
function matchValue<T extends string>(item: Decoder<T>): Decoder<MatchValue<T>> {
  const list = arrayOf(item, { minLength: 1, maxLength: 32 });
  return (u, path, errs) => (Array.isArray(u) ? list(u, path, errs) : item(u, path, errs));
}

const ruleDecoder: Decoder<RoutingRule> = object({
  match: object({}, { type: matchValue(oneOf(TAKEOVER_TYPES)), component: matchValue(tag), variant: matchValue(tag) }),
  team: object({}, { teamAri: tag, componentId: tag, projectRoleId: tag, label: str({ maxLength: 128 }) }),
});

const rulesDecoder: Decoder<readonly RoutingRule[]> = (u, path, errs) => {
  const rules = arrayOf(ruleDecoder, { maxLength: MAX_ROUTING_RULES })(u, path, errs);
  if (rules === INVALID) return INVALID;
  let bad = false;
  rules.forEach((r, i) => {
    const p = `${path}[${i}]`;
    const t = r.team;
    if (t.teamAri === undefined && t.componentId === undefined && t.projectRoleId === undefined) {
      errs.push({ code: "E_ROUTING_RULE", message: "team needs teamAri, componentId or projectRoleId", path: joinPath(p, "team") });
      bad = true;
    }
    if (isDefaultRule(r) && i !== rules.length - 1) {
      errs.push({ code: "E_ROUTING_RULE", message: "the default rule (empty match) must be last", path: joinPath(p, "match") });
      bad = true;
    }
  });
  return bad ? INVALID : rules;
};

/**
 * Validates an untrusted routing rule list. Every rule needs at least one team target, and
 * a rule with an empty match must be last (later rules would be unreachable).
 */
export function parseRoutingRules(u: unknown): Result<readonly RoutingRule[]> {
  return run(rulesDecoder, u);
}
