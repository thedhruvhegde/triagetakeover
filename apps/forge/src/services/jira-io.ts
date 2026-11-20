/**
 * Jira reads shared by several services: batched property reads with the SPIKE-E3 fallback,
 * membership derived from issue links (the source of truth, D3), and link-type resolution.
 */
import { isRecord, parseTtCluster, parseTtTriage, type TtCluster, type TtTriage } from "@tt/engine";
import { memoize, type ServiceContext } from "../context";
import type { IssueLink, JiraIssue, JiraPort } from "../ports/jira";
import { PROPERTY_KEYS, LABELS, jqlQuote } from "../ports/properties";
import { ok, type PortResult } from "../ports/result";
import { DEFAULT_LINK_TYPE, FALLBACK_LINK_TYPE, type ProjectConfig } from "./config";
import { compareKeys } from "./index-store";

/** Keys per `key in (...)` search (well under JQL length limits). */
export const KEYS_PER_SEARCH = 50;

/**
 * Reads issues by key with the given properties via JQL `key in (...)`. SPIKE-E3: when the
 * search does not return properties, each missing property is read individually.
 * Issues the principal cannot see are silently absent (as in Jira).
 */
export async function readIssuesByKey(jira: JiraPort, keys: readonly string[], properties: readonly string[], opts: { readonly links?: boolean } = {}): Promise<PortResult<Map<string, JiraIssue>>> {
  const out = new Map<string, JiraIssue>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += KEYS_PER_SEARCH) {
    const chunk = unique.slice(i, i + KEYS_PER_SEARCH);
    const jql = `key in (${chunk.map(jqlQuote).join(", ")})`;
    let token: string | undefined;
    do {
      const r = await jira.searchJql({ jql, properties, maxResults: 100, ...(opts.links === true ? { fields: ["issuelinks"] } : {}), ...(token !== undefined ? { nextPageToken: token } : {}) });
      if (!r.ok) return r;
      for (const issue of r.value.issues) out.set(issue.key, issue);
      token = r.value.nextPageToken;
    } while (token !== undefined);
  }
  const filled = await fillMissingProperties(jira, [...out.values()], properties);
  if (!filled.ok) return filled;
  return ok(new Map(filled.value.map((i) => [i.key, i])));
}

/** SPIKE-E3 fallback: per-issue property GETs for properties a search did not return. */
export async function fillMissingProperties(jira: JiraPort, issues: readonly JiraIssue[], properties: readonly string[]): Promise<PortResult<JiraIssue[]>> {
  const out: JiraIssue[] = [];
  for (const issue of issues) {
    const missing = properties.filter((p) => !(p in issue.properties));
    if (missing.length === 0) {
      out.push(issue);
      continue;
    }
    const props: Record<string, unknown> = { ...issue.properties };
    for (const p of missing) {
      const r = await jira.getIssueProperty(issue.id, p);
      if (!r.ok) {
        if (r.error.kind === "not-found") continue;
        return r;
      }
      if (r.value !== null) props[p] = r.value.value;
    }
    out.push({ ...issue, properties: props });
  }
  return ok(out);
}

/** True when an issue is a cluster issue (label or `tt.cluster` property). */
export function isClusterIssue(issue: JiraIssue): boolean {
  return issue.labels.includes(LABELS.cluster) || PROPERTY_KEYS.cluster in issue.properties;
}

export function triageOf(issue: JiraIssue): TtTriage | null {
  const raw = issue.properties[PROPERTY_KEYS.triage];
  if (raw === undefined) return null;
  const r = parseTtTriage(raw);
  return r.ok ? r.value : null;
}

export function clusterPropOf(issue: JiraIssue): TtCluster | null {
  const raw = issue.properties[PROPERTY_KEYS.cluster];
  if (raw === undefined) return null;
  const r = parseTtCluster(raw);
  return r.ok ? r.value : null;
}

export interface LinkedCluster {
  readonly clusterId: string;
  readonly clusterKey: string;
  readonly linkId: string;
}

/**
 * Accepted membership from Jira links (D3): the links between the event and known cluster
 * issues (any link type, either direction). With several, the one named by `tt.triage`
 * wins, else the lowest issue number; the caller warns about the extra links.
 */
export function membershipFromLinks(eventId: string, links: readonly IssueLink[], isCluster: (issueId: string) => boolean, triage: TtTriage | null): { chosen: LinkedCluster | null; all: LinkedCluster[] } {
  const all: LinkedCluster[] = [];
  for (const l of links) {
    const other = l.inwardIssue.id === eventId ? l.outwardIssue : l.outwardIssue.id === eventId ? l.inwardIssue : null;
    if (other === null || !isCluster(other.id)) continue;
    if (all.some((x) => x.clusterId === other.id)) continue;
    all.push({ clusterId: other.id, clusterKey: other.key, linkId: l.id });
  }
  all.sort((a, b) => compareKeys(a.clusterKey, b.clusterKey));
  const named = triage?.state === "accepted" && triage.clusterKey !== undefined ? all.find((x) => x.clusterKey === triage.clusterKey) : undefined;
  return { chosen: named ?? all[0] ?? null, all };
}

/** Link type to write: the configured one, else "Relates", else "Duplicate", else the first (§15 #17). */
export async function resolveLinkType(ctx: ServiceContext, jira: JiraPort, config: ProjectConfig): Promise<{ name: string; inward: string; outward: string; fellBack: boolean } | null> {
  return memoize(ctx, `linktype:${config.linkType}`, async () => {
    const r = await jira.getIssueLinkTypes();
    if (!r.ok) return { name: config.linkType, inward: "", outward: "", fellBack: false };
    const find = (n: string) => r.value.find((t) => t.name.toLowerCase() === n.toLowerCase());
    const t = find(config.linkType) ?? find(FALLBACK_LINK_TYPE) ?? find(DEFAULT_LINK_TYPE) ?? r.value[0];
    if (t === undefined) return null;
    return { name: t.name, inward: t.inward, outward: t.outward, fellBack: t.name.toLowerCase() !== config.linkType.toLowerCase() };
  });
}

/** Defensive string read from an untrusted object. */
export function stringAt(u: unknown, key: string): string | undefined {
  return isRecord(u) && typeof u[key] === "string" ? u[key] : undefined;
}
