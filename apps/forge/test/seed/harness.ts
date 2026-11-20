/**
 * Seed test harness: a site WITHOUT the demo project (the seed creates it), a memoised event
 * generator shared by every test in a worker (generation is deterministic and is the CPU cost),
 * a queue driver that runs the `tt-seed` chain like the platform would (including duplicate
 * deliveries and crash → redelivery), and a full-state snapshot of Jira + storage.
 *
 * All data is SYNTHETIC (seedgen); nothing here imitates a real fleet or person.
 */
import { DEFAULT_SEED } from "@tt/seedgen";
import { createMemoryWorld, type MemoryWorld, type QueuedJob } from "../../src/adapters/memory/index.js";
import { createServiceContext, type ServiceContext } from "../../src/context.js";
import { runReclusterJob } from "../../src/consumers/recluster-job.js";
import { runSeedStep, type SeedOutcome, type SeedRunOptions } from "../../src/consumers/seed-job.js";
import type { Ports } from "../../src/ports/index.js";
import type { JiraIssue } from "../../src/ports/jira.js";
import { PROPERTY_KEYS } from "../../src/ports/properties.js";
import { defaultGenerator, memoizeGenerator, type GeneratedEvent } from "../../src/services/seed/generate.js";
import { startSeed, type StartSeedInput } from "../../src/services/seed/service.js";
import { ADMIN, ENGINEER, OUTSIDER, must } from "../fixtures.js";

export { ADMIN, ENGINEER, OUTSIDER, must, DEFAULT_SEED };

const CACHE = new Map<string, GeneratedEvent>();
/** Shared across the tests of a worker: the files and the engine result per event are deterministic. */
export const memoGenerate = memoizeGenerator(defaultGenerator, CACHE);

export const FAST: SeedRunOptions = { generate: memoGenerate, budgetMs: 1e12, nowMs: () => 0 };

export interface SeedWorld {
  readonly world: MemoryWorld;
  ctx(accountId?: string): ServiceContext;
}

export function seedWorld(opts: Parameters<typeof createMemoryWorld>[0] = {}): SeedWorld {
  const world = createMemoryWorld(opts);
  world.site.addUser({ accountId: ADMIN, displayName: "Site Admin", globalAdmin: true });
  world.site.addUser({ accountId: ENGINEER, displayName: "Triage Engineer" });
  world.site.addUser({ accountId: OUTSIDER, displayName: "Other Team" });
  return { world, ctx: (accountId = ADMIN) => createServiceContext(world.ports({ accountId }), { accountId }) };
}

export class CrashError extends Error {
  constructor(readonly op: string) {
    super(`simulated crash after ${op}`);
  }
}

const MUTATING = new Set([
  "set", "setIfAbsent", "delete", "putEntity", "deleteEntity",
  "createIssue", "bulkCreateIssues", "updateIssue", "deleteIssue", "setIssueProperty", "deleteIssueProperty",
  "createIssueLink", "deleteIssueLink", "createComponent", "addComment", "uploadAttachment", "createProject",
  "pushSeed", "pushRecluster",
]);

/** Counts mutating port calls; when the count reaches `crashAt`, the call completes and then the invocation "dies". */
export class CrashPlan {
  writes = 0;
  /** Write index (1-based) → `step:port.op`, recorded on a clean run. */
  readonly log: string[] = [];
  currentStep = "";
  constructor(public crashAt = 0) {}

  wrap<T extends object>(target: T, port: string): T {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const plan = this;
    return new Proxy(target, {
      get(t, p, r) {
        const v: unknown = Reflect.get(t, p, r);
        if (typeof v !== "function" || typeof p !== "string" || !MUTATING.has(p)) return v;
        const fn = v as (...args: unknown[]) => Promise<unknown>;
        return async (...args: unknown[]) => {
          const out = await fn.apply(t, args);
          plan.writes++;
          plan.log.push(`${plan.currentStep}:${port}.${p}`);
          if (plan.writes === plan.crashAt) throw new CrashError(`${port}.${p}`);
          return out;
        };
      },
    });
  }

  ports(base: Ports): Ports {
    const jira = base.jira;
    return {
      ...base,
      jira: { asApp: () => this.wrap(jira.asApp(), "jira"), asUser: () => this.wrap(jira.asUser(), "jira") },
      storage: this.wrap(base.storage, "storage"),
      queue: this.wrap(base.queue, "queue"),
    };
  }
}

export interface ChainResult {
  readonly outcomes: SeedOutcome[];
  readonly deliveries: number;
  readonly crashes: number;
  readonly stepsSeen: string[];
}

export interface DriveOptions extends SeedRunOptions {
  readonly crash?: CrashPlan;
  /** Deliver every message twice (at-least-once queue). */
  readonly duplicate?: boolean;
  /** Called before each delivery (e.g. to inject a fault). */
  readonly before?: (job: QueuedJob, n: number) => void | Promise<void>;
  readonly maxDeliveries?: number;
}

/** Runs queued `tt-seed` messages until the queue is empty (then any queued `tt-recluster`). */
export async function driveSeed(sw: SeedWorld, opts: DriveOptions = {}): Promise<ChainResult> {
  const { crash, duplicate, before, maxDeliveries, ...run } = opts;
  const outcomes: SeedOutcome[] = [];
  const stepsSeen: string[] = [];
  let deliveries = 0;
  let crashes = 0;
  const pending: QueuedJob[] = [];
  const pull = (): void => {
    pending.push(...sw.world.queue.take("tt-seed"));
  };
  pull();
  while (pending.length > 0) {
    if (deliveries > (maxDeliveries ?? 2000)) throw new Error("seed chain did not finish");
    const job = pending.shift() as QueuedJob;
    const body = job.body as { step: string };
    await before?.(job, deliveries);
    const copies = duplicate === true ? 2 : 1;
    for (let c = 0; c < copies; c++) {
      deliveries++;
      if (crash !== undefined) crash.currentStep = body.step;
      const ports = crash !== undefined ? crash.ports(sw.world.ports({})) : sw.world.ports({});
      try {
        const o = await runSeedStep(ports, job.body, { generate: memoGenerate, budgetMs: 1e12, nowMs: () => 0, ...run });
        outcomes.push(o);
        stepsSeen.push(body.step);
      } catch (e) {
        if (!(e instanceof CrashError)) throw e;
        crashes++;
        // The platform redelivers the message after a crash.
        pending.unshift(job);
        pull();
        break;
      }
    }
    pull();
  }
  for (let guard = 0; guard < 50; guard++) {
    const jobs = sw.world.queue.take("tt-recluster");
    if (jobs.length === 0) break;
    for (const j of jobs) await runReclusterJob(sw.world.ports({}), j.body);
  }
  return { outcomes, deliveries, crashes, stepsSeen };
}

/** startSeed as the admin + the whole chain. */
export async function loadDemo(sw: SeedWorld, input: Partial<StartSeedInput> = {}, opts: DriveOptions = {}): Promise<{ jobId: string; chain: ChainResult }> {
  const r = await startSeed(sw.ctx(ADMIN), { projectKey: "TTDEMO", seed: DEFAULT_SEED, frames: "fast", ...input });
  if (!r.ok) throw new Error(`startSeed failed: ${JSON.stringify(r.error)}`);
  const chain = await driveSeed(sw, opts);
  return { jobId: r.value.value.jobId, chain };
}

const ALL_PROPS = Object.values(PROPERTY_KEYS);

/** Everything observable in Jira and app storage for a project, minus run measurements. */
export async function snapshotState(sw: SeedWorld, projectKey = "TTDEMO"): Promise<unknown> {
  const app = sw.world.site.gateway({}).asApp();
  const issues: JiraIssue[] = [];
  let token: string | undefined;
  do {
    const r = must(await app.searchJql({ jql: `project = ${projectKey}`, properties: ALL_PROPS, fields: ["issuelinks"], maxResults: 100, ...(token !== undefined ? { nextPageToken: token } : {}) }));
    issues.push(...r.issues);
    token = r.nextPageToken;
  } while (token !== undefined);
  const jira = [];
  for (const i of issues) {
    const att = must(await app.getAttachments(i.id)).map((a) => `${a.filename}:${a.size}:${a.mimeType}`);
    const comments = must(await app.getComments(i.id)).map((c) => c.body);
    jira.push({
      id: i.id,
      key: i.key,
      summary: i.summary,
      type: i.issueType,
      labels: [...i.labels].sort(),
      components: i.components.map((c) => c.name),
      description: i.description ?? "",
      properties: i.properties,
      links: (i.links ?? []).map((l) => `${l.type.name}:${l.inwardIssue.key}->${l.outwardIssue.key}`).sort(),
      attachments: att.sort(),
      comments,
    });
  }
  const components = (await app.getProjectComponents(projectKey)).ok ? must(await app.getProjectComponents(projectKey)).map((c) => `${c.name}:${c.leadAccountId ?? ""}`) : [];
  const st = sw.world.storage;
  const kv: Record<string, unknown> = {};
  for (const k of st.keys()) {
    let v = must(await st.get(k));
    if (k.startsWith("job:seed:") && typeof v === "object" && v !== null) {
      const { stats: _s, updatedAt: _u, ...rest } = v as Record<string, unknown>;
      void _s;
      void _u;
      v = rest;
    }
    if (k === "seed:report" && typeof v === "object" && v !== null) {
      const { timings: _t, calls: _c, ...rest } = v as Record<string, unknown>;
      void _t;
      void _c;
      v = rest;
    }
    kv[k] = v;
  }
  const rows: Record<string, unknown[]> = {};
  const q = async (entity: "event" | "cluster" | "vehicle" | "drive-session", index: string, partitions: (string | number | boolean)[][]) => {
    const out: unknown[] = [];
    for (const partition of partitions) {
      let cursor: string | undefined;
      do {
        const r = must(await st.queryEntities(entity, { index, partition, limit: 100, ...(cursor !== undefined ? { cursor } : {}) }));
        out.push(...r.items);
        cursor = r.nextCursor;
      } while (cursor !== undefined);
    }
    rows[entity] = out.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  await q("event", "by-status", ["accepted", "proposed", "novel", "unassigned"].map((s) => [projectKey, s]));
  await q("cluster", "by-project", [[projectKey]]);
  await q("vehicle", "by-variant", [["cam-A"], ["cam-B"]]);
  await q("drive-session", "by-variant", [["cam-A"], ["cam-B"]]);
  return { jira, components, kv, rows, issueCount: sw.world.site.issueCount() };
}
