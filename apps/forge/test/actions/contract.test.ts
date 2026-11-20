/**
 * Action contract tests (ARCHITECTURE §10.3, §16): every action, called the way each caller
 * (Rovo chat on an issue / project / nowhere, Automation, MCP) is assumed to call it
 * (SPIKE-A2 fixtures), returns a schema-valid envelope, writes nothing unless confirmed, and
 * cites issue keys that really exist.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { ACTION_KEYS, type ActionKey } from "../../src/validation/actions.js";
import { CONFIRMATION_DATA_SCHEMA, DATA_SCHEMAS, ENVELOPE_SCHEMA, jsonBytes, NO_USER_MESSAGE, type ActionEnvelope } from "../../src/actions/index.js";
import { FORBIDDEN_OR_NOT_FOUND_MESSAGE } from "../../src/services/errors.js";
import { ADMIN, ENGINEER, OUTSIDER } from "../services/helpers.js";
import { FIXTURE_NAMES, invocationArgs, loadFixture } from "./contexts.js";
import { validate } from "./json-schema.js";
import { actionWorld, type ActionWorld } from "./world.js";

/** Schema-checks one envelope and returns it. */
function check(key: ActionKey, env: ActionEnvelope<unknown>): ActionEnvelope<unknown> {
  const problems = validate(env, ENVELOPE_SCHEMA);
  if (env.ok && env.status !== "needs-confirmation") problems.push(...validate(env.data, DATA_SCHEMAS[key]));
  if (env.status === "needs-confirmation") problems.push(...validate(env.data, CONFIRMATION_DATA_SCHEMA));
  if (!env.ok) expect(env.error).toBeDefined();
  expect(problems, `${key}: ${problems.join("\n")}`).toEqual([]);
  expect(jsonBytes(env)).toBeLessThanOrEqual(50_000);
  expect(JSON.parse(JSON.stringify(env))).toEqual(env);
  return env;
}

/** Every evidence issue key must be a real issue (cited keys are never invented). */
async function expectRealKeys(w: ActionWorld, env: ActionEnvelope<unknown>): Promise<string[]> {
  const jira = w.sw.ctx(ADMIN).ports.jira.asUser();
  const keys = [...new Set(env.evidence.flatMap((e) => (e.kind === "issue" || e.kind === "scenario") && e.key !== undefined ? [e.key] : []))];
  for (const k of keys) expect((await jira.getIssue(k)).ok, `evidence ${k} exists`).toBe(true);
  for (const k of env.headline.match(/\b[A-Z][A-Z0-9_]{1,9}-\d+\b/g) ?? []) expect((await jira.getIssue(k)).ok, `headline key ${k} exists`).toBe(true);
  return keys;
}

function data<T = Record<string, unknown>>(env: ActionEnvelope<unknown>): T {
  return env.data as T;
}

function jiraWrites(w: ActionWorld): number {
  return w.sw.world.site.writesBy(`user:${ENGINEER}`).length + w.sw.world.site.writesBy("app").length;
}

/** Inputs per action for the context matrix: explicit keys, CREATE verbs unconfirmed. */
function matrixInputs(w: ActionWorld): { readonly [K in ActionKey]: Record<string, unknown> } {
  return {
    "get-cluster-for-event": { issueKey: w.novelKey },
    "explain-match": { issueKey: w.novelKey },
    "build-regression-check": { build: "4.12.0", projectKey: "TTDEMO" },
    "list-novel-since": { projectKey: "TTDEMO", limit: 5 },
    "list-coverage-gaps": { projectKey: "TTDEMO", minEvents: 2, includePartial: true, limit: 10 },
    "suggest-owner": { clusterKey: w.ll.clusterKey },
    "link-event": { issueKey: w.pendingKey, clusterKey: w.ll.clusterKey, userConfirmed: false },
    "create-cluster": { issueKey: w.novelKey, userConfirmed: false },
    "create-scenario-stub": { clusterKey: w.ll.clusterKey, userConfirmed: false },
  };
}

const CREATE: ReadonlySet<ActionKey> = new Set(["link-event", "create-cluster", "create-scenario-stub"]);

describe("action contract over every invocation context (SPIKE-A2 fixtures)", () => {
  let w: ActionWorld;
  beforeAll(async () => {
    w = await actionWorld();
  });

  it("has a fixture for Rovo chat, Automation and MCP", () => {
    expect(FIXTURE_NAMES).toEqual(expect.arrayContaining(["rovo-chat-issue", "rovo-chat-project", "rovo-chat-global", "automation", "automation-no-actor", "mcp", "mcp-nested-inputs"]));
  });

  for (const name of FIXTURE_NAMES) {
    it(`${name}: all 9 actions return schema-valid envelopes and write nothing to Jira`, async () => {
      const f = loadFixture(name, { issueKey: w.novelKey });
      const before = jiraWrites(w);
      for (const key of ACTION_KEYS) {
        const env = check(key, await w.handlers[key](...invocationArgs(f, matrixInputs(w)[key])));
        if (name === "automation-no-actor") {
          expect(env.status, key).toBe("forbidden-or-not-found");
          expect(env.error?.code).toBe("no-user");
          expect(env.headline).toBe(NO_USER_MESSAGE);
        } else if (CREATE.has(key)) {
          expect(env.status, key).toBe("needs-confirmation");
          expect(data(env)["written"]).toBe(false);
          expect(env.headline).toMatch(/Shall I do it\?$/);
        } else {
          expect(env.ok, `${key}: ${env.headline}`).toBe(true);
          await expectRealKeys(w, env);
        }
      }
      expect(jiraWrites(w)).toBe(before);
    });
  }

  it("absolutises citation links only from a trusted Atlassian site URL", async () => {
    const issue = loadFixture("rovo-chat-issue", { issueKey: w.novelKey });
    const env = await w.handlers["get-cluster-for-event"](...invocationArgs(issue, {}));
    expect(env.evidence.filter((e) => e.kind === "issue").every((e) => e.url.startsWith("https://example-site.atlassian.net/browse/"))).toBe(true);
    const mcp = loadFixture("mcp");
    const rel = await w.handlers["get-cluster-for-event"](...invocationArgs(mcp, { issueKey: w.novelKey }));
    expect(rel.evidence.find((e) => e.kind === "issue")?.url).toBe(`/browse/${w.novelKey}`);
    const evil = { ...mcp, payloadContext: { jira: { url: "https://evil.example.com/browse/X-1" } } };
    const env2 = await w.handlers["get-cluster-for-event"](...invocationArgs(evil, { issueKey: w.novelKey }));
    expect(env2.evidence.every((e) => !e.url.includes("evil"))).toBe(true);
  });
});

describe("the four conversation starters each have an action path with real issue keys", () => {
  let w: ActionWorld;
  beforeAll(async () => {
    w = await actionWorld();
  });

  it('"Which clusters started on 4.12.0?" → build-regression-check {build}', async () => {
    const f = loadFixture("rovo-chat-project");
    const env = check("build-regression-check", await w.handlers["build-regression-check"](...invocationArgs(f, { build: "4.12.0" })));
    expect(env.status).toBe("ok");
    const d = data<{ scope: string; results: { cluster: { key: string }; onset: { verdict: string; pRaw: number; pHolm: number; onsetBuild: string } }[]; holmFamilySize: number }>(env);
    expect(d.scope).toBe("build");
    const ll = d.results.find((r) => r.cluster.key === w.ll.clusterKey);
    expect(ll?.onset.verdict).toBe("regression-likely");
    expect(ll?.onset.onsetBuild).toBe("4.12.0");
    expect(ll?.onset.pRaw).toBeCloseTo(0.0013146, 6);
    expect(ll?.onset.pHolm).toBeCloseTo(2 * 0.0013146, 6);
    expect(d.holmFamilySize).toBe(2);
    expect(env.headline).toContain(`1 cluster(s) in TTDEMO show a rate increase starting at build 4.12.0: ${w.ll.clusterKey} regression-likely`);
    expect(env.headline).toContain("p_raw=0.00131, p_holm=0.00263");
    expect(env.headline).toContain(`no evidence of an increase (${w.ld.clusterKey})`);
    expect(env.caveats).toContain("Screening signal, not a causal attribution.");
    expect(env.confidence?.definition).toMatch(/not the probability that the build caused/);
    expect(await expectRealKeys(w, env)).toContain(w.ll.clusterKey);
  });

  it('"Why didn\'t this takeover match its nearest cluster?" → explain-match on the issue in context', async () => {
    const f = loadFixture("rovo-chat-issue", { issueKey: w.novelKey });
    const env = check("explain-match", await w.handlers["explain-match"](...invocationArgs(f, {})));
    const d = data<{ event: { key: string }; cluster: { key: string }; decision: string; d: number; tau: number; topContributors: string[] }>(env);
    expect(d.event.key).toBe(w.novelKey);
    expect(d.cluster.key).toBe(w.ll.clusterKey);
    expect(d.decision).toBe("exceeds-tau");
    expect(d.d).toBeGreaterThan(d.tau);
    expect(env.headline).toMatch(new RegExp(`^${w.novelKey} does not fit ${w.ll.clusterKey} "Lane-loss · cam-B": d=\\d+\\.\\d\\d > τ=1\\.00`));
    expect(env.headline).toContain("Largest contributors: lateral offset (F1)");
    expect(env.why?.length).toBeGreaterThan(0);
    expect(env.why?.[0]?.feature).toBe(d.topContributors[0]);
    expect(await expectRealKeys(w, env)).toEqual(expect.arrayContaining([w.novelKey, w.ll.clusterKey]));
  });

  it('"What\'s novel since I last triaged?" → list-novel-since (defaults to Mark triaged)', async () => {
    const f = loadFixture("rovo-chat-project");
    const env = check("list-novel-since", await w.handlers["list-novel-since"](...invocationArgs(f, {})));
    const d = data<{ since: string; sinceSource: string; events: { key: string; reason: string; nearestCluster?: { key: string } }[] }>(env);
    expect(d.sinceSource).toBe("mark-triaged");
    expect(d.since).toBe(w.markAt);
    expect(d.events.map((e) => e.key)).toEqual([w.novelKey]);
    expect(d.events[0]?.nearestCluster?.key).toBe(w.ll.clusterKey);
    expect(env.headline).toContain(`1 novel event(s) in TTDEMO since ${w.markAt}`);
    expect(env.caveats).toContain("This is SYNTHETIC demo data from the Takeover Triage seed generator, not fleet data.");
    expect(await expectRealKeys(w, env)).toEqual([w.novelKey, w.ll.clusterKey]);
  });

  it('"Which clusters have no scenario coverage?" → list-coverage-gaps', async () => {
    const f = loadFixture("rovo-chat-project");
    const env = check("list-coverage-gaps", await w.handlers["list-coverage-gaps"](...invocationArgs(f, {})));
    const d = data<{ scenarioCount: number; gaps: { cluster: { key: string }; verdict: string; text: string }[] }>(env);
    expect(d.scenarioCount).toBe(1);
    expect(d.gaps.map((g) => g.cluster.key)).toEqual([w.ll.clusterKey]);
    expect(d.gaps[0]?.verdict).toBe("uncovered");
    expect(d.gaps[0]?.text).toBe("0 scenario tests cover lane-loss x normal x cam-B x highway");
    expect(env.headline).toContain(`${w.ll.clusterKey} (0 scenario tests cover lane-loss x normal x cam-B x highway)`);
    expect(await expectRealKeys(w, env)).toContain(w.ll.clusterKey);
  });
});

describe("GET actions", () => {
  let w: ActionWorld;
  const mcp = () => loadFixture("mcp");
  beforeAll(async () => {
    w = await actionWorld();
  });

  it("get-cluster-for-event: novel, match (pending suggestion) and accepted", async () => {
    const novel = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(mcp(), { issueKey: w.novelKey })));
    expect(novel.status).toBe("novel");
    expect(data(novel)["result"]).toBe("novel");
    expect(novel.confidence?.value).toBe(0);
    const pending = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(mcp(), { issueKey: w.pendingKey })));
    expect(pending.status).toBe("ok");
    expect(data<{ result: string; cluster: { key: string }; neighbours: unknown[] }>(pending)).toMatchObject({ result: "match", accepted: false, cluster: { key: w.ll.clusterKey } });
    expect(data<{ neighbours: unknown[] }>(pending).neighbours.length).toBeLessThanOrEqual(3);
    expect(pending.confidence?.definition).toMatch(/d\* is the distance/);
    const member = w.ll.members[1] ?? "";
    const accepted = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(mcp(), { issueKey: member })));
    expect(data(accepted)).toMatchObject({ result: "match", accepted: true });
    expect(accepted.headline).toContain(`${member} is accepted into ${w.ll.clusterKey}`);
  });

  it("no signal data: says so and how to add it", async () => {
    const env = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(mcp(), { issueKey: w.noSignalKey })));
    expect(env.status).toBe("no-signal-data");
    expect(env.nextSteps?.[0]).toMatch(/Add telemetry/);
  });

  it("hidden and missing issues give the same answer (no existence leak)", async () => {
    const outsider = { ...mcp(), invocationContext: { principal: { accountId: OUTSIDER } } };
    const hidden = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(outsider, { issueKey: w.novelKey })));
    const missing = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(mcp(), { issueKey: "TTDEMO-9999" })));
    expect(hidden.status).toBe("forbidden-or-not-found");
    expect(missing.status).toBe("forbidden-or-not-found");
    expect(hidden.error?.message).toBe(FORBIDDEN_OR_NOT_FOUND_MESSAGE);
    expect(missing.error?.message).toBe(hidden.error?.message);
    const board = check("list-novel-since", await w.handlers["list-novel-since"](...invocationArgs(outsider, { projectKey: "TTDEMO" })));
    expect(board.status).toBe("forbidden-or-not-found");
    expect(board.evidence).toEqual([]);
  });

  it("explicit, lower-case and string-typed inputs are accepted; garbage is an explicit invalid-input", async () => {
    const lower = check("explain-match", await w.handlers["explain-match"](...invocationArgs(mcp(), { issueKey: w.novelKey.toLowerCase(), clusterKey: w.ll.clusterKey.toLowerCase() })));
    expect(lower.ok).toBe(true);
    const bad = check("explain-match", await w.handlers["explain-match"](...invocationArgs(mcp(), { issueKey: "not a key" })));
    expect(bad.status).toBe("invalid-input");
    expect(bad.error?.message).toMatch(/issueKey: not a valid issue key/);
    expect(bad.nextSteps?.[0]).toMatch(/^Inputs: issueKey/);
    const neither = check("build-regression-check", await w.handlers["build-regression-check"](...invocationArgs(mcp(), { projectKey: "TTDEMO" })));
    expect(neither.status).toBe("invalid-input");
    expect(neither.error?.message).toMatch(/one of clusterKey or build is required/);
    const limit = check("list-novel-since", await w.handlers["list-novel-since"](...invocationArgs(mcp(), { projectKey: "TTDEMO", limit: "lots" })));
    expect(limit.status).toBe("invalid-input");
    const since = check("list-novel-since", await w.handlers["list-novel-since"](...invocationArgs(mcp(), { projectKey: "TTDEMO", since: "last friday" })));
    expect(since.error?.message).toMatch(/since: expected ISO-8601/);
    const unknown = check("suggest-owner", await w.handlers["suggest-owner"](...invocationArgs(mcp(), { clusterKey: w.ll.clusterKey, members: true, accountId: ADMIN })));
    expect(unknown.ok).toBe(true);
  });

  it("missing issue key with no issue in context asks for it", async () => {
    const env = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(loadFixture("rovo-chat-global"), {})));
    expect(env.status).toBe("invalid-input");
    expect(env.error?.code).toBe("missing-input");
    expect(env.nextSteps?.[0]).toMatch(/Give the takeover issue key/);
  });

  it("project-level actions without a project fall back to the only configured project, with a warning", async () => {
    const env = check("list-novel-since", await w.handlers["list-novel-since"](...invocationArgs(mcp(), {})));
    expect(env.ok).toBe(true);
    expect(env.warnings[0]).toMatch(/used TTDEMO, the only project/);
  });

  it("list-novel-since honours an explicit since and the limit", async () => {
    const env = check("list-novel-since", await w.handlers["list-novel-since"](...invocationArgs(mcp(), { projectKey: "TTDEMO", since: "2026-11-17", limit: 3 })));
    expect(data(env)).toMatchObject({ sinceSource: "input", since: "2026-11-17T00:00:00.000Z", events: [] });
    expect(env.headline).toBe("No novel takeover events in TTDEMO since 2026-11-17T00:00:00.000Z (the time given).");
  });

  it("build-regression-check for one cluster and for a build no cluster starts on", async () => {
    const one = check("build-regression-check", await w.handlers["build-regression-check"](...invocationArgs(mcp(), { clusterKey: w.ll.clusterKey, projectKey: "TTDEMO" })));
    expect(data(one)["scope"]).toBe("cluster");
    expect(one.headline).toMatch(/^TTDEMO-\d+ "Lane-loss · cam-B": Regression likely at 4\.12\.0/);
    const none = check("build-regression-check", await w.handlers["build-regression-check"](...invocationArgs(mcp(), { build: "9.9.9", projectKey: "TTDEMO" })));
    expect(none.ok).toBe(true);
    expect(none.headline).toBe("No cluster in TTDEMO has its estimated onset at build 9.9.9 (2 cluster(s) screened).");
  });

  it("suggest-owner never returns TWG members (D8)", async () => {
    const env = check("suggest-owner", await w.handlers["suggest-owner"](...invocationArgs(mcp(), { clusterKey: w.ll.clusterKey })));
    expect(env.headline).toBe(`Suggested owner for ${w.ll.clusterKey}: Perception (from the component lead; rule #1: type = lane-loss -> Perception).`);
    expect(JSON.stringify(env)).not.toContain("members");
    expect(env.confidence?.value).toBe(1);
    const notCluster = check("suggest-owner", await w.handlers["suggest-owner"](...invocationArgs(mcp(), { clusterKey: w.novelKey })));
    expect(notCluster.status).toBe("invalid-input");
    expect(notCluster.error?.message).toMatch(/is not a Takeover Triage cluster issue/);
  });

  it("suggest-owner and create-scenario-stub default clusterKey to the issue in context", async () => {
    const f = loadFixture("rovo-chat-issue", { issueKey: w.ll.clusterKey });
    const env = check("suggest-owner", await w.handlers["suggest-owner"](...invocationArgs(f, {})));
    expect(env.ok).toBe(true);
    expect(env.warnings[0]).toBe(`clusterKey was not given; used the issue in context, ${w.ll.clusterKey}.`);
  });

  it("an unexpected adapter failure is an error envelope, never a throw", async () => {
    w.sw.world.site.failNext("getIssue", "unavailable", 1);
    const env = check("get-cluster-for-event", await w.handlers["get-cluster-for-event"](...invocationArgs(mcp(), { issueKey: w.novelKey })));
    expect(env.status).toBe("error");
    expect(env.error?.retryable).toBe(true);
  });
});

describe("CREATE actions: confirmation, idempotency, honest reporting", () => {
  it("link-event: preview without confirmation, link once, then 'already linked'", async () => {
    const w = await actionWorld();
    const f = loadFixture("rovo-chat-issue", { issueKey: w.pendingKey });
    const before = jiraWrites(w);
    const preview = check("link-event", await w.handlers["link-event"](...invocationArgs(f, { clusterKey: w.ll.clusterKey })));
    expect(preview.status).toBe("needs-confirmation");
    expect(preview.headline).toContain(`This would link ${w.pendingKey} to cluster ${w.ll.clusterKey} "Lane-loss · cam-B" with link type "Duplicate"`);
    expect(jiraWrites(w)).toBe(before);
    const done = check("link-event", await w.handlers["link-event"](...invocationArgs(f, { clusterKey: w.ll.clusterKey, userConfirmed: true })));
    expect(done.ok).toBe(true);
    expect(data(done)).toMatchObject({ created: true, alreadyLinked: false, link: { type: "Duplicate", inward: w.pendingKey, outward: w.ll.clusterKey } });
    expect(done.nextSteps).toContain("Use Undo in the Takeover signature issue panel.");
    expect(jiraWrites(w)).toBeGreaterThan(before);
    const again = check("link-event", await w.handlers["link-event"](...invocationArgs(f, { clusterKey: w.ll.clusterKey, userConfirmed: "TRUE" })));
    expect(data(again)).toMatchObject({ created: false, alreadyLinked: true });
    expect(again.headline).toMatch(/^Nothing new was written/);
  });

  it("link-event: moving an accepted event is a conflict, not a silent move", async () => {
    const w = await actionWorld();
    const env = check("link-event", await w.handlers["link-event"](...invocationArgs(loadFixture("mcp"), { issueKey: w.ll.members[1], clusterKey: w.ld.clusterKey, userConfirmed: true })));
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe("conflict");
    expect(env.nextSteps?.[0]).toMatch(/Undo/);
  });

  it("create-cluster: preview, create, and a repeat returns the same cluster", async () => {
    const w = await actionWorld();
    const f = loadFixture("rovo-chat-issue", { issueKey: w.novelKey });
    const preview = check("create-cluster", await w.handlers["create-cluster"](...invocationArgs(f, { name: "Construction zone lane loss" })));
    expect(preview.headline).toContain('This would create a new cluster issue named "Construction zone lane loss"');
    const done = check("create-cluster", await w.handlers["create-cluster"](...invocationArgs(f, { name: "Construction zone lane loss", userConfirmed: true })));
    const d = data<{ created: boolean; cluster: { key: string; name: string }; nameSource: string; seededWith: string }>(done);
    expect(d).toMatchObject({ created: true, nameSource: "user", seededWith: w.novelKey, cluster: { name: "Construction zone lane loss" } });
    expect((await w.sw.ctx(ADMIN).ports.jira.asUser().getIssue(d.cluster.key)).ok).toBe(true);
    const again = check("create-cluster", await w.handlers["create-cluster"](...invocationArgs(f, { userConfirmed: true })));
    expect(data(again)).toMatchObject({ created: false, cluster: { key: d.cluster.key }, nameSource: "user" });
    expect(again.headline).toMatch(/^Nothing new was written/);
  });

  it("create-cluster on an event accepted elsewhere is a conflict", async () => {
    const w = await actionWorld();
    const env = check("create-cluster", await w.handlers["create-cluster"](...invocationArgs(loadFixture("mcp"), { issueKey: w.ll.members[2], userConfirmed: true })));
    expect(env.error?.code).toBe("conflict");
  });

  it("create-scenario-stub: preview lists labels, create once, repeat returns the existing stub", async () => {
    const w = await actionWorld();
    const f = loadFixture("automation", { issueKey: w.ll.clusterKey });
    const before = jiraWrites(w);
    const preview = check("create-scenario-stub", await w.handlers["create-scenario-stub"](...invocationArgs(f, { clusterKey: w.ll.clusterKey })));
    expect(preview.headline).toContain("type:lane-loss");
    expect(jiraWrites(w)).toBe(before);
    const done = check("create-scenario-stub", await w.handlers["create-scenario-stub"](...invocationArgs(f, { clusterKey: w.ll.clusterKey, userConfirmed: true })));
    const d = data<{ created: boolean; stub: { key: string; labels: string[] }; linkedEvents: string[] }>(done);
    expect(d.created).toBe(true);
    expect(d.stub.labels).toEqual(expect.arrayContaining(["tt-scenario", "type:lane-loss", "variant:cam-B", "odd:highway"]));
    expect(d.linkedEvents.length).toBeGreaterThan(0);
    await expectRealKeys(w, done);
    const again = check("create-scenario-stub", await w.handlers["create-scenario-stub"](...invocationArgs(f, { clusterKey: w.ll.clusterKey, userConfirmed: true })));
    expect(data(again)).toMatchObject({ created: false, stub: { key: d.stub.key } });
  });

  it("userConfirmed must be literally true: other values never write", async () => {
    const w = await actionWorld();
    const before = jiraWrites(w);
    for (const v of [false, "false", "no", 1, "yes please"]) {
      const env = check("create-cluster", await w.handlers["create-cluster"](...invocationArgs(loadFixture("mcp"), { issueKey: w.novelKey, userConfirmed: v })));
      expect(env.ok).toBe(false);
      expect(["needs-confirmation", "invalid-input"]).toContain(env.status);
    }
    expect(jiraWrites(w)).toBe(before);
  });
});
