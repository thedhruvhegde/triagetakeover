/**
 * A small SYNTHETIC world for the action contract tests, built through the real services on
 * the in-memory fakes:
 *
 * - LL: a lane-loss x cam-B cluster with 8 accepted events, all on build 4.12.0, against
 *   3,100 km on 4.11.3 and 2,400 km on 4.12.0 (the PRD worked example), so its onset is
 *   at 4.12.0.
 * - LD: a lateral-drift x cam-B cluster with 3 accepted events on mixed builds, covered
 *   by the only scenario test.
 * - "Mark triaged" at 2026-11-14T17:00Z. After it: one far lane-loss event (novel) and
 *   one close lane-loss event (a pending suggestion for LL).
 * - A routing rule: lane-loss → component "Perception" (lead: the site admin).
 * - An issue with no signal data.
 *
 * Every value is generated test data, labelled SYNTHETIC.
 */
import { buildActionHandlers, type ForgeActionHandler } from "../../src/actions/index.js";
import type { ActionKey } from "../../src/validation/actions.js";
import { saveProjectConfig } from "../../src/services/config.js";
import { acceptMatch, splitEvent } from "../../src/services/triage.js";
import { ADMIN, drainRecluster, farLaneLoss, fileEvent, laneLoss, lateralDrift, must, serviceWorld, value, type ServiceWorld } from "../services/helpers.js";

export interface ActionWorld {
  readonly sw: ServiceWorld;
  readonly handlers: { readonly [K in ActionKey]: ForgeActionHandler };
  readonly ll: { readonly clusterKey: string; readonly members: readonly string[] };
  readonly ld: { readonly clusterKey: string; readonly members: readonly string[] };
  readonly novelKey: string;
  readonly pendingKey: string;
  readonly noSignalKey: string;
  readonly scenarioKey: string;
  readonly markAt: string;
}

export async function actionWorld(): Promise<ActionWorld> {
  const sw = serviceWorld({ startIso: "2026-11-01T00:00:00.000Z" });
  const admin = sw.ctx(ADMIN);
  const comp = must(await admin.ports.jira.asUser().createComponent({ projectKey: "TTDEMO", name: "Perception", leadAccountId: ADMIN }));
  value(await saveProjectConfig(admin, "TTDEMO", { routing: [{ match: { type: "lane-loss" }, team: { componentId: comp.id, label: "Perception" } }], scenarioIssueType: "Test" }));

  for (const [build, km] of [["4.11.3", 3100], ["4.12.0", 2400]] as const) {
    must(await sw.world.storage.putEntity("drive-session", `DS-${build}`, { sessionId: `DS-${build}`, vehicleId: "V-01", variant: "cam-B", build, date: 0, km, odd: ["highway"], source: "test", synthetic: true }));
  }

  // LL: 8 accepted lane-loss events on 4.12.0.
  const llSeed = await fileEvent(sw, laneLoss(0, { build: "4.12.0", occurredAt: "2026-11-02T10:00:00Z" }));
  const llSplit = value(await splitEvent(sw.ctx(), llSeed.key));
  const llKey = llSplit.cluster?.key ?? "";
  const llMembers = [llSeed.key];
  for (let i = 1; i < 8; i++) {
    const e = await fileEvent(sw, laneLoss(i % 2 === 0 ? i * 0.25 : -i * 0.25, { build: "4.12.0", occurredAt: `2026-11-0${2 + (i % 7)}T1${i}:00:00Z`, vehicleId: `V-0${1 + (i % 3)}` }));
    value(await acceptMatch(sw.ctx(), e.key, llKey));
    llMembers.push(e.key);
  }

  // LD: 3 accepted lateral-drift events on mixed builds.
  const ldSeed = await fileEvent(sw, lateralDrift(0, { build: "4.11.3", occurredAt: "2026-11-05T09:00:00Z" }));
  const ldSplit = value(await splitEvent(sw.ctx(), ldSeed.key));
  const ldKey = ldSplit.cluster?.key ?? "";
  const ldMembers = [ldSeed.key];
  for (const [i, build] of [[1, "4.12.0"], [2, "4.11.3"]] as const) {
    const e = await fileEvent(sw, lateralDrift(i * 0.5, { build, occurredAt: `2026-11-0${5 + i}T09:00:00Z` }));
    value(await acceptMatch(sw.ctx(), e.key, ldKey));
    ldMembers.push(e.key);
  }

  // The only scenario test covers LD's signature exactly.
  const scenario = must(await admin.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Test", summary: "[SYNTHETIC] SCN-01 lateral drift, cam-B, highway", labels: ["tt-scenario", "tt-synthetic", "type:lateral-drift", "variant:cam-B", "cond:normal", "odd:highway"] }));

  // Mark triaged, then Monday's events.
  const markAt = "2026-11-14T17:00:00.000Z";
  sw.world.clock.set(markAt);
  must(await sw.world.storage.set("triaged:TTDEMO", { at: markAt, by: ADMIN }));
  sw.world.clock.set("2026-11-16T12:00:00.000Z");
  const novel = await fileEvent(sw, farLaneLoss(0, { build: "4.12.0", occurredAt: "2026-11-16T08:00:00Z" }));
  const pending = await fileEvent(sw, laneLoss(0.5, { build: "4.12.0", occurredAt: "2026-11-16T09:00:00Z" }));
  const plain = must(await sw.ctx().ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary: "[SYNTHETIC] Takeover without telemetry", labels: ["tt-takeover", "tt-synthetic"] }));
  await drainRecluster(sw);

  return {
    sw,
    handlers: buildActionHandlers(sw.factory),
    ll: { clusterKey: llKey, members: llMembers },
    ld: { clusterKey: ldKey, members: ldMembers },
    novelKey: novel.key,
    pendingKey: pending.key,
    noSignalKey: plain.key,
    scenarioKey: scenario.key,
    markAt,
  };
}
