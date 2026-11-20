/**
 * Real TwgPort: Teamwork Graph curated queries, always AS THE USER
 * (`api.asUser().requestTeamworkGraph`, ARCHITECTURE §11; the app cannot call TWG as itself).
 *
 * Every outcome is classified, never thrown:
 * - `ok` with data;
 * - `empty`: no rows. Missing scopes fail SILENTLY with empty results, so this is reported as
 *   "possibly a missing scope or no data";
 * - `not-permitted`: "User is not permitted to query this organization" (community reports,
 *   rovo-mcp-twg §1 item 6);
 * - `error`: anything else, including the 4 s timeout and GraphQL validation errors.
 *
 * SPIKE-T1: the curated field names come from the TWG docs (`atlassianUserInTeams`,
 * `atlassianTeamMembers`, Relay pagination, `first` ≤ 25), but the exact argument names,
 * wrapper fields and team ARI format are UNVERIFIED until the schema
 * (`GET /gateway/api/graphql/twg/schema`) is read on the demo site. The queries live in this
 * file only, and the parser below reads the result structurally (first Relay connection found),
 * so a schema correction is a one-line change. A mismatching schema yields `error` with the
 * GraphQL message, which the diagnostics panel shows; nothing is invented.
 * SPIKE-R1: TWG from inside Rovo actions may fail; actions do not depend on members (D8).
 */
import type { APIResponse } from "@forge/api";
import { TWG_MEMBERS_FIRST, TWG_NOT_PERMITTED_TEXT, TWG_TIMEOUT_MS, type TwgOutcome, type TwgPort, type TwgTeam, type TwgTeamMembers } from "../../ports/twg";

/** `requestTeamworkGraph(query, variables, operationName)`, bound to `api.asUser()`. */
export type TwgRequester = (query: string, variables: Record<string, unknown>, operationName: string) => Promise<APIResponse>;

/** SPIKE-T1: curated query texts (unverified argument shapes). */
export const TWG_QUERIES = {
  userInTeams: {
    operationName: "TtUserInTeams",
    query: `query TtUserInTeams($userId: ID!, $first: Int) {
  atlassianUserInTeams(userId: $userId, first: $first) {
    edges { node { id displayName } }
  }
}`,
  },
  teamMembers: {
    operationName: "TtTeamMembers",
    query: `query TtTeamMembers($teamId: ID!, $first: Int) {
  atlassianTeamMembers(teamId: $teamId, first: $first) {
    edges { node { id accountId displayName } }
  }
}`,
  },
} as const;

/** Atlassian user ARI for an accountId (format VERIFIED in TWG docs: `ari:cloud:identity::user/<id>`). */
export function userAri(accountId: string): string {
  return accountId.startsWith("ari:") ? accountId : `ari:cloud:identity::user/${accountId}`;
}

/** accountId from a user node (`accountId`, or the tail of a user ARI). */
function accountIdOf(node: Readonly<Record<string, unknown>>): string | undefined {
  if (typeof node["accountId"] === "string" && node["accountId"] !== "") return node["accountId"];
  const id = node["id"];
  if (typeof id === "string") {
    const m = /^ari:cloud:identity::user\/(.+)$/.exec(id);
    if (m?.[1] !== undefined) return m[1];
  }
  return undefined;
}

type Rec = Readonly<Record<string, unknown>>;
const isRec = (u: unknown): u is Rec => typeof u === "object" && u !== null && !Array.isArray(u);

/** Nodes of the first Relay connection (`edges[].node` or `nodes[]`) found depth-first in `data`. */
export function firstConnectionNodes(data: unknown): Rec[] | null {
  if (!isRec(data)) return null;
  if (Array.isArray(data["edges"])) return data["edges"].map((e) => (isRec(e) && isRec(e["node"]) ? e["node"] : null)).filter((n): n is Rec => n !== null);
  if (Array.isArray(data["nodes"])) return data["nodes"].filter(isRec);
  for (const v of Object.values(data)) {
    const found = firstConnectionNodes(v);
    if (found !== null) return found;
  }
  return null;
}

type Raw = { readonly kind: "data"; readonly data: unknown } | { readonly kind: "fail"; readonly outcome: TwgOutcome<never> };

function errorsText(errors: unknown): string {
  if (!Array.isArray(errors)) return "";
  return errors
    .map((e) => (isRec(e) && typeof e["message"] === "string" ? e["message"] : ""))
    .filter((m) => m !== "")
    .join("; ")
    .slice(0, 300);
}

export interface TwgOptions {
  readonly timeoutMs?: number;
}

export class ForgeTwg implements TwgPort {
  private readonly timeoutMs: number;

  constructor(
    private readonly request: TwgRequester,
    opts: TwgOptions = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? TWG_TIMEOUT_MS;
  }

  private async call(q: { readonly query: string; readonly operationName: string }, variables: Record<string, unknown>): Promise<Raw> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.timeoutMs);
    });
    try {
      const res = await Promise.race([this.request(q.query, variables, q.operationName), timeout]);
      if (res === "timeout") return { kind: "fail", outcome: { status: "error", message: `Teamwork Graph did not answer within ${this.timeoutMs / 1000} s` } };
      const text = await res.text();
      if (text.includes(TWG_NOT_PERMITTED_TEXT)) return { kind: "fail", outcome: { status: "not-permitted", message: TWG_NOT_PERMITTED_TEXT } };
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = undefined;
      }
      if (!res.ok) return { kind: "fail", outcome: { status: "error", message: `Teamwork Graph answered HTTP ${res.status}${isRec(body) ? `: ${errorsText(body["errors"])}` : ""}` } };
      if (!isRec(body)) return { kind: "fail", outcome: { status: "error", message: "Teamwork Graph answered with a non-JSON body" } };
      const errs = errorsText(body["errors"]);
      if (errs !== "" && (body["data"] === null || body["data"] === undefined)) return { kind: "fail", outcome: { status: "error", message: errs } };
      return { kind: "data", data: body["data"] };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Teamwork Graph request failed";
      if (message.includes(TWG_NOT_PERMITTED_TEXT)) return { kind: "fail", outcome: { status: "not-permitted", message: TWG_NOT_PERMITTED_TEXT } };
      return { kind: "fail", outcome: { status: "error", message: message.slice(0, 300) } };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async teamsOfUser(accountId: string): Promise<TwgOutcome<readonly TwgTeam[]>> {
    const raw = await this.call(TWG_QUERIES.userInTeams, { userId: userAri(accountId), first: TWG_MEMBERS_FIRST });
    if (raw.kind === "fail") return raw.outcome;
    const nodes = firstConnectionNodes(raw.data);
    if (nodes === null) return { status: "empty", message: "possibly a missing scope or no data" };
    const teams: TwgTeam[] = [];
    for (const n of nodes) {
      const ari = typeof n["id"] === "string" ? n["id"] : undefined;
      const name = typeof n["displayName"] === "string" ? n["displayName"] : typeof n["name"] === "string" ? n["name"] : undefined;
      if (ari !== undefined && name !== undefined) teams.push({ ari, name });
    }
    teams.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return teams.length === 0 ? { status: "empty", message: "possibly a missing scope or no data" } : { status: "ok", value: teams };
  }

  async teamMembers(teamAri: string, opts: { readonly first?: number } = {}): Promise<TwgOutcome<TwgTeamMembers>> {
    const first = Math.max(1, Math.min(opts.first ?? TWG_MEMBERS_FIRST, TWG_MEMBERS_FIRST));
    const raw = await this.call(TWG_QUERIES.teamMembers, { teamId: teamAri, first });
    if (raw.kind === "fail") return raw.outcome;
    const nodes = firstConnectionNodes(raw.data);
    const ids = (nodes ?? []).map(accountIdOf).filter((x): x is string => x !== undefined);
    if (ids.length === 0) return { status: "empty", message: "possibly a missing scope or no data" };
    // SPIKE-T1: the members query may not return the team's display name; the ARI stands in
    // until the schema shows where the name lives (services label it from the routing rule).
    const name = teamNameOf(raw.data) ?? teamAri;
    return { status: "ok", value: { team: { ari: teamAri, name }, memberAccountIds: [...new Set(ids)].slice(0, first) } };
  }
}

/** A `displayName`/`name` on the connection's parent object, when the schema returns one. */
function teamNameOf(data: unknown): string | undefined {
  if (!isRec(data)) return undefined;
  for (const v of Object.values(data)) {
    if (isRec(v)) {
      if (typeof v["displayName"] === "string" && (Array.isArray(v["edges"]) || Array.isArray(v["nodes"]))) return v["displayName"];
      const inner = teamNameOf(v);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}
