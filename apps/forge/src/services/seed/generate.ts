/**
 * Generate-and-compute for one seeded event (SEED_DATA §15.1 S4): seedgen writes the files,
 * then the engine's `processEventFiles` — the same function the intake Web Worker calls —
 * turns them into `tt.event` (PRD US-01 AC2: nothing precomputed). The seed never passes
 * generator internals (archetype, roles) into anything that reaches Jira or the index.
 *
 * Also: small `tt.thumbs` previews from the generated frames (decoded and downscaled with the
 * engine, re-encoded with seedgen's JPEG encoder), and ADF → plain text for issue descriptions
 * (the JiraPort takes plain text; the adapter turns it back into ADF paragraphs).
 */
import {
  TT_THUMBS_TARGET_BYTES,
  base64Encode,
  decodeJpeg,
  downscale,
  processEventFiles,
  serializedSize,
  type ChipThresholds,
  type EngineError,
  type RuleThresholds,
  type TtEvent,
  type TtThumbs,
} from "@tt/engine";
import { encodeJpeg, generateEventFiles, type AdfNode, type EventFiles, type EventSpec, type FleetPlanOutput, type SeedConfig } from "@tt/seedgen";

export interface GeneratedEvent {
  readonly files: EventFiles;
  /** The engine's result, or why it rejected the files (the issue then keeps no signal data). */
  readonly event: { readonly ok: true; readonly value: TtEvent } | { readonly ok: false; readonly error: readonly EngineError[] };
  readonly thumbs: TtThumbs | undefined;
}

export interface GenerateOptions {
  readonly ruleThresholds: RuleThresholds;
  readonly chipThresholds: ChipThresholds;
}

/** Pluggable so tests can memoise the (deterministic, CPU-heavy) generation across replays. */
export type EventGenerator = (cfg: SeedConfig, plan: FleetPlanOutput, spec: EventSpec, opts: GenerateOptions) => GeneratedEvent;

/** Longest thumbnail side in pixels and JPEG quality for `tt.thumbs`. */
export const THUMB_MAX_SIDE = 128;
export const THUMB_QUALITY = 45;

/** `tt.thumbs` from generated frames; frames are dropped from the end until the 12 KB target fits. */
export function thumbsFromFrames(frames: readonly Uint8Array[]): TtThumbs | undefined {
  const out: { w: number; h: number; jpegB64: string }[] = [];
  for (const bytes of frames.slice(0, 4)) {
    const img = decodeJpeg(bytes);
    if (!img.ok) continue;
    const small = downscale(img.value, THUMB_MAX_SIDE);
    if (!small.ok) continue;
    const jpeg = encodeJpeg(small.value.data, small.value.width, small.value.height, THUMB_QUALITY);
    out.push({ w: small.value.width, h: small.value.height, jpegB64: base64Encode(jpeg) });
  }
  while (out.length > 0) {
    const t: TtThumbs = { v: 1, frames: out };
    const size = serializedSize(t);
    if (size.ok && size.value <= TT_THUMBS_TARGET_BYTES) return t;
    out.pop();
  }
  return undefined;
}

export const defaultGenerator: EventGenerator = (cfg, plan, spec, opts) => {
  const files = generateEventFiles(cfg, spec.eventId, plan);
  const r = processEventFiles(
    { csv: files.csv.bytes, frames: files.frames.map((f) => f.bytes) },
    {
      ctx: { occurredAt: spec.occurredAt, vehicleId: spec.vehicleId, variant: spec.variant, build: spec.build, driveSessionId: spec.sessionId, odd: [...spec.odd] },
      synthetic: true,
      thresholds: opts.ruleThresholds,
      chipThresholds: opts.chipThresholds,
    },
  );
  return {
    files,
    event: r.ok ? { ok: true, value: r.value.event } : { ok: false, error: r.error },
    thumbs: thumbsFromFrames(files.frames.map((f) => f.bytes)),
  };
};

/** Memoising wrapper (per process); keys are `(seed, anchor, frames, eventId)`. */
export function memoizeGenerator(gen: EventGenerator, cache: Map<string, GeneratedEvent> = new Map()): EventGenerator {
  return (cfg, plan, spec, opts) => {
    const key = `${cfg.seed}|${cfg.anchorDate}|${cfg.frames}|${spec.eventId}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const v = gen(cfg, plan, spec, opts);
    cache.set(key, v);
    return v;
  };
}

// ------------------------------------------------------------------ ADF → text

function inline(n: AdfNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  return (n.content ?? []).map(inline).join("");
}

function blocks(n: AdfNode, out: string[]): void {
  switch (n.type) {
    case "paragraph":
    case "heading":
      out.push(inline(n));
      return;
    case "table":
      for (const row of n.content ?? []) {
        const cells = (row.content ?? []).map((c) => (c.content ?? []).map(inline).join(" ").trim());
        out.push(cells.length === 2 ? `${cells[0] ?? ""}: ${cells[1] ?? ""}` : cells.join(" | "));
      }
      return;
    default:
      for (const c of n.content ?? []) blocks(c, out);
  }
}

/** Plain-text rendering of a seedgen ADF description (banner, note, metadata table, files line). */
export function adfToText(doc: { readonly content: readonly AdfNode[] }): string {
  const out: string[] = [];
  for (const n of doc.content) blocks(n, out);
  return out.filter((l) => l.trim() !== "").join("\n");
}

/**
 * The item marker every seeded description carries (seedgen's banner, and the cluster origin
 * line the seed writes): "Generated by Takeover Triage (seed <n>, <itemId>)". A retried step
 * uses it to adopt an issue whose create succeeded but whose `tt.seed` write did not.
 */
export function itemMarker(seed: number, itemId: string): string {
  return `Generated by Takeover Triage (seed ${seed}, ${itemId})`;
}

const MARKER_RE = /Generated by Takeover Triage \(seed (\d{1,10}), ([A-Za-z0-9-]{1,40})\)/;

export function parseItemMarker(text: string | undefined): { seed: number; itemId: string } | null {
  if (text === undefined) return null;
  const m = MARKER_RE.exec(text);
  if (m === null || m[1] === undefined || m[2] === undefined) return null;
  return { seed: Number(m[1]), itemId: m[2] };
}
