/**
 * In-memory Teamwork Graph. Models the §11 classification: `ok`, `empty` (no data or a
 * silently missing scope), `not-permitted` and `error`, per user. Like the real API it is only
 * usable as a user: build one per invocation with the caller's accountId.
 */
import type { TwgOutcome, TwgPort, TwgTeam, TwgTeamMembers } from "../../ports/twg";
import { TWG_MEMBERS_FIRST, TWG_NOT_PERMITTED_TEXT } from "../../ports/twg";

export type TwgMode = "normal" | "scopes-missing" | "not-permitted" | "error";

export class MemoryTwgDirectory {
  readonly calls: { readonly as: string; readonly op: string; readonly arg: string }[] = [];
  private readonly teams = new Map<string, { name: string; members: string[] }>();
  private mode: TwgMode = "normal";

  addTeam(team: { readonly ari: string; readonly name: string; readonly members?: readonly string[] }): void {
    this.teams.set(team.ari, { name: team.name, members: [...(team.members ?? [])] });
  }

  addMember(teamAri: string, accountId: string): void {
    const t = this.teams.get(teamAri);
    if (t === undefined) throw new RangeError(`no team ${teamAri}`);
    if (!t.members.includes(accountId)) t.members.push(accountId);
  }

  /** `scopes-missing` → every query is `empty` (silent failure); `not-permitted`/`error` as named. */
  setMode(mode: TwgMode): void {
    this.mode = mode;
  }

  /** A TwgPort acting as `accountId` (TWG is asUser only, §11). */
  asUser(accountId: string): TwgPort {
    return {
      teamsOfUser: async (userId) => {
        await Promise.resolve();
        this.calls.push({ as: accountId, op: "teamsOfUser", arg: userId });
        const forced = this.forced<readonly TwgTeam[]>();
        if (forced !== null) return forced;
        const teams = [...this.teams.entries()].filter(([, t]) => t.members.includes(userId)).map(([ari, t]) => ({ ari, name: t.name }));
        teams.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        return teams.length === 0 ? { status: "empty" } : { status: "ok", value: teams };
      },
      teamMembers: async (teamAri, opts = {}) => {
        await Promise.resolve();
        this.calls.push({ as: accountId, op: "teamMembers", arg: teamAri });
        const forced = this.forced<TwgTeamMembers>();
        if (forced !== null) return forced;
        const t = this.teams.get(teamAri);
        if (t === undefined) return { status: "empty", message: "no such team, or a missing scope" };
        const first = Math.max(1, Math.min(opts.first ?? TWG_MEMBERS_FIRST, 100));
        return { status: "ok", value: { team: { ari: teamAri, name: t.name }, memberAccountIds: [...t.members].sort().slice(0, first) } };
      },
    };
  }

  private forced<T>(): TwgOutcome<T> | null {
    switch (this.mode) {
      case "normal":
        return null;
      case "scopes-missing":
        return { status: "empty", message: "possibly a missing scope or no data" };
      case "not-permitted":
        return { status: "not-permitted", message: TWG_NOT_PERMITTED_TEXT };
      case "error":
        return { status: "error", message: "Teamwork Graph request failed" };
    }
  }
}
