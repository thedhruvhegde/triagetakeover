/**
 * TwgPort: Teamwork Graph lookups for team routing (ARCHITECTURE §11, D8).
 *
 * - Always called AS THE USER (`api.asUser().requestTeamworkGraph`); TWG cannot be called as
 *   the app, so this port must never be used from queue consumers or the seed (§8).
 * - Results are classified, never thrown: missing scopes fail silently, so `empty` means
 *   "possibly a missing scope or no data".
 * - Member lists may be shown in the UI but are never returned through actions/MCP (D8).
 *
 * SPIKE-T1: curated query names (`atlassianUserInTeams`, `atlassianTeamMembers`), argument
 * shapes and team ARI format are unverified. SPIKE-R1: TWG inside Rovo actions/MCP may fail;
 * actions may report `twgStatus: skipped`.
 */

export type TwgStatus = "ok" | "empty" | "not-permitted" | "error";

/** A classified TWG outcome. `value` exists only for `ok`. */
export type TwgOutcome<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "empty"; readonly message?: string }
  | { readonly status: "not-permitted"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export interface TwgTeam {
  /** Team ARI, e.g. `ari:cloud:identity::team/<uuid>` (format: SPIKE-T1). */
  readonly ari: string;
  readonly name: string;
}

export interface TwgTeamMembers {
  readonly team: TwgTeam;
  /** First page only (`first: 25`, §11). */
  readonly memberAccountIds: readonly string[];
}

export interface TwgPort {
  /** Teams the given user belongs to (admin team picker; stretch US-27 filter). */
  teamsOfUser(accountId: string): Promise<TwgOutcome<readonly TwgTeam[]>>;
  /** Team name and the first page of members. */
  teamMembers(teamAri: string, opts?: { readonly first?: number }): Promise<TwgOutcome<TwgTeamMembers>>;
}

/** Adapter deadline per TWG call (§11). */
export const TWG_TIMEOUT_MS = 4000;
/** Members page size (§11). */
export const TWG_MEMBERS_FIRST = 25;
/** Text the platform returns for an org the user cannot query (§11 classification). */
export const TWG_NOT_PERMITTED_TEXT = "User is not permitted to query this organization";
