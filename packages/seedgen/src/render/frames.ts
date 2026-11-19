/**
 * Per-event frame generation: scene parameters, rendering, JPEG encode and COM splice (§9).
 */
import type { Rng } from "../rng/index.js";
import { FRAME_SIZES } from "../plan/profile.js";
import type { ConditionChip, EventSpec, FrameCondition, SeedConfig } from "../types.js";
import { comText, encodeJpeg, spliceComSegment } from "../jpeg/index.js";
import { renderFrame, type SunSpec } from "./scene.js";

/** Chips a frame of this condition should produce (§9.4). */
export const EXPECTED_CHIPS: Readonly<Record<FrameCondition, readonly ConditionChip[]>> = {
  day: ["normal"],
  overcast: ["normal"],
  "low-sun": ["low-sun-glare"],
  "low-sun-decoy": ["normal"],
  "low-sun-boundary": ["low-sun-glare"],
  night: ["night"],
  rain: ["blur-rain"],
  "night-rain": ["night", "blur-rain"],
};

/** Frame times actually rendered: `fast` keeps at most the last 2 frames of Monday events (§15.1). */
export function renderedFrameTimes(cfg: SeedConfig, e: EventSpec): readonly number[] {
  return cfg.frames === "fast" && e.monday && e.frameTimes.length > 2 ? e.frameTimes.slice(-2) : e.frameTimes;
}

/** Sun placement and size for an event, or null when the condition has no sun (§9.2). */
export function sunFor(rng: Rng, condition: FrameCondition, w: number, h: number): SunSpec | null {
  if (condition !== "low-sun" && condition !== "low-sun-boundary" && condition !== "low-sun-decoy") return null;
  const x = w / 2 + rng.range(-0.08, 0.08) * w;
  const y = rng.range(0.3, 0.38) * h;
  if (condition === "low-sun") return { x, y, blobFraction: rng.range(0.01, 0.016), sheenFraction: rng.range(0.025, 0.04) };
  if (condition === "low-sun-boundary") return { x, y, blobFraction: rng.range(0.0035, 0.0045), sheenFraction: 0 };
  return { x, y, blobFraction: rng.range(0.0015, 0.0025), sheenFraction: 0 };
}

/** Visible watermark lines (§9.3). */
export function watermarkLines(seed: number, eventId: string): readonly [string, string] {
  return [`SYNTHETIC - Takeover Triage demo - seed ${seed} - ${eventId}`, "Not real vehicle data"];
}

/** File name of frame k (1-based). */
export const frameFileName = (eventId: string, k: number): string => `SYNTHETIC_${eventId}_f${k}.jpg`;

/** Renders and encodes every frame of an event. */
export function generateFrames(root: Rng, cfg: SeedConfig, e: EventSpec): { name: string; bytes: Uint8Array; tRel: number }[] {
  const { width, height, quality } = FRAME_SIZES[cfg.frames];
  const sun = sunFor(root.fork(`event:${e.key}:frames:scene`), e.frameCondition, width, height);
  const lines = watermarkLines(cfg.seed, e.eventId);
  return renderedFrameTimes(cfg, e).map((tRel, idx) => {
    const k = idx + 1;
    const drift = sun === null ? null : { ...sun, x: sun.x + 3 * tRel * (width / 1280) };
    const rgba = renderFrame({
      width, height, variant: e.variant, condition: e.frameCondition, rng: root.fork(`event:${e.key}:frames:${tRel}`), sun: drift, watermark: lines,
    });
    const bytes = spliceComSegment(encodeJpeg(rgba, width, height, quality), comText(cfg.seed, e.eventId));
    return { name: frameFileName(e.eventId, k), bytes, tRel };
  });
}
