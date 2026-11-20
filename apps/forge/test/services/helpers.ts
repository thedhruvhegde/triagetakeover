/**
 * Service test helpers: a synthetic `tt.event` builder whose `sig` really is what the engine
 * computes from its `tel` (so server verification, D2, passes), and a world with a service
 * context factory over the in-memory fakes.
 *
 * All values here are SYNTHETIC test inputs, not fleet data.
 */
import {
  ENGINE_VERSION,
  WINDOW_N,
  analyzeSignal,
  quantiseWindow,
  windowFromValues,
  type ConditionChip,
  type TtEvent,
} from "@tt/engine";
import { createServiceContext, type ServiceContext, type ServiceContextFactory } from "../../src/context.js";
import type { MemoryWorld } from "../../src/adapters/memory/index.js";
import { demoWorld, ADMIN, ENGINEER, OUTSIDER, must } from "../fixtures.js";

export { ADMIN, ENGINEER, OUTSIDER, must };

export interface SynthSignal {
  /** Lateral drift: peak |lane_offset| (m) and seconds since it rose above 0.30 m. */
  readonly peak?: number;
  readonly drift?: number;
  /** Minimum lane confidence in [-3 s, 0]. */
  readonly laneConfMin?: number;
  readonly speed?: number;
  readonly torque?: number;
  readonly yaw?: number;
}

export interface SynthContext {
  readonly variant?: string;
  readonly build?: string;
  readonly occurredAt?: string;
  readonly vehicleId?: string;
  readonly odd?: readonly string[];
  readonly chips?: readonly ConditionChip[];
  readonly synthetic?: boolean;
}

const HEX = "ab".repeat(32);

function series(f: (t: number) => number): number[] {
  return Array.from({ length: WINDOW_N }, (_, i) => f(-15 + i / 10));
}

/** Builds a consistent event: sig is computed by the engine from the quantised window. */
export function synthEvent(s: SynthSignal = {}, c: SynthContext = {}): TtEvent {
  const peak = s.peak ?? 0.8;
  const drift = s.drift ?? 1.5;
  const conf = s.laneConfMin ?? 0.15;
  const speed = s.speed ?? 30;
  const torque = s.torque ?? 4;
  const yaw = s.yaw ?? 0.01;
  const window = windowFromValues({
    lane_offset: series((t) => (t < -drift ? 0.1 : t <= 0 ? 0.31 + ((peak - 0.31) * (t + drift)) / drift : peak * Math.max(0, 1 - t / 3))),
    lane_conf: series((t) => (t >= -3 && t <= 0 ? conf : 0.9)),
    ttc: series(() => 10),
    brake: series(() => 0),
    speed: series(() => speed),
    steer_torque: series((t) => (Math.abs(t) <= 0.2 ? torque : 0.5)),
    yaw_rate: series((t) => (t >= -2 && t <= 0 ? yaw : 0)),
  });
  const { tel, window: decoded } = quantiseWindow(window, "ratio");
  const { insufficientChannels, ...sig } = analyzeSignal(decoded, { brakeUnit: "ratio" });
  void insufficientChannels;
  const chips = c.chips ?? ["normal"];
  return {
    v: 1,
    engine: ENGINE_VERSION,
    app: "1.0.0",
    synthetic: c.synthetic ?? true,
    ctx: {
      occurredAt: c.occurredAt ?? "2026-11-14T09:00:00Z",
      vehicleId: c.vehicleId ?? "V-01",
      variant: c.variant ?? "cam-B",
      build: c.build ?? "4.12.0",
      odd: [...(c.odd ?? ["highway", "day", "dry"])],
    },
    mapping: { presetId: "default", hash: `sha256:${HEX}` },
    source: { csv: { sha256: HEX, rows: 2000, rawHz: 100 }, frames: [] },
    takeover: { source: "flag", confidence: "high" },
    sig,
    img: {
      attested: "client",
      median: { meanY: 120, p5: 20, p95: 240, glare: 0.01, sunBlob: chips.includes("low-sun-glare") ? 0.01 : 0.001, lapVar: 200, contrast: 50, darkFrac: 0.05 },
      hist32: Array.from({ length: 32 }, () => 0),
      chips: [...chips],
      chipRules: chips.includes("low-sun-glare") ? [{ chip: "low-sun-glare", metric: "sunBlob", op: ">=", value: 0.01, threshold: 0.004 }] : [],
    },
    tel,
  };
}

/** A lane-loss-like event (bucket lane-loss|variant). Small `jitter` keeps it within τ of its siblings. */
export function laneLoss(jitter = 0, c: SynthContext = {}): TtEvent {
  return synthEvent({ peak: 0.8 + jitter * 0.02, drift: 1.5 + jitter * 0.05, laneConfMin: 0.15 + jitter * 0.01, speed: 30 + jitter * 0.3 }, c);
}

/** A lane-loss event far (> τ) from {@link laneLoss} but in the same bucket (construction-zone-like). */
export function farLaneLoss(jitter = 0, c: SynthContext = {}): TtEvent {
  return synthEvent({ peak: 1.4 + jitter * 0.02, drift: 0.4 + jitter * 0.02, laneConfMin: 0.02, speed: 20 + jitter * 0.3, torque: 7, yaw: 0.08 }, c);
}

/** A lateral-drift-like event (lane confidence stays high). */
export function lateralDrift(jitter = 0, c: SynthContext = {}): TtEvent {
  return synthEvent({ peak: 0.8 + jitter * 0.02, drift: 4 + jitter * 0.05, laneConfMin: 0.85, speed: 22 + jitter * 0.3, torque: 2.5 }, c);
}

export interface ServiceWorld {
  readonly world: MemoryWorld;
  readonly factory: ServiceContextFactory;
  /** A resolver invocation as `accountId` (default the engineer). */
  ctx(accountId?: string): ServiceContext;
  /** A consumer invocation (no user, no TWG). */
  consumer(): ServiceContext;
}

export function serviceWorld(opts: Parameters<typeof demoWorld>[0] = {}): ServiceWorld {
  const world = demoWorld(opts);
  const factory: ServiceContextFactory = (inv) => createServiceContext(world.ports(inv.accountId !== undefined ? { accountId: inv.accountId } : {}), inv);
  return {
    world,
    factory,
    ctx: (accountId = ENGINEER) => factory({ accountId }),
    consumer: () => factory({}),
  };
}

/** Creates an issue as the user and commits the event through the real intake service. */
export async function fileEvent(sw: ServiceWorld, event: TtEvent, accountId = ENGINEER, summary = "[SYNTHETIC] Takeover"): Promise<{ key: string; id: string }> {
  const { commitEvent } = await import("../../src/services/commit.js");
  const ctx = sw.ctx(accountId);
  const ref = must(await ctx.ports.jira.asUser().createIssue({ projectKey: "TTDEMO", issueType: "Task", summary, labels: ["tt-takeover", "tt-synthetic"] }));
  const r = await commitEvent(ctx, { issueKey: ref.key, event, attachments: { via: "browser", status: "uploaded" } });
  if (!r.ok) throw new Error(`commit failed: ${JSON.stringify(r.error)}`);
  return ref;
}

/** Runs every queued tt-recluster job with the consumer logic. */
export async function drainRecluster(sw: ServiceWorld): Promise<number> {
  const { runReclusterJob } = await import("../../src/consumers/recluster-job.js");
  let n = 0;
  for (let guard = 0; guard < 50; guard++) {
    const jobs = sw.world.queue.take("tt-recluster");
    if (jobs.length === 0) break;
    for (const j of jobs) {
      await runReclusterJob(sw.world.ports({}), j.body);
      n++;
    }
  }
  return n;
}

/** Unwraps a ServiceResult. */
export function value<T>(r: { readonly ok: true; readonly value: { readonly value: T } } | { readonly ok: false; readonly error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value.value;
}

/** Asserts the value survives a JSON round trip unchanged (no Infinity, NaN, undefined in arrays). */
export function jsonSafe(v: unknown): boolean {
  const walk = (x: unknown): boolean => {
    if (typeof x === "number") return Number.isFinite(x);
    if (Array.isArray(x)) return x.every((y) => y !== undefined && walk(y));
    if (x !== null && typeof x === "object") return Object.values(x).every((y) => y === undefined || walk(y));
    return true;
  };
  return walk(v);
}
