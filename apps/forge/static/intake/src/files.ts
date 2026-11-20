/**
 * File picking: classify, size-check and read the user's files with the File API (US-04 AC1).
 */
import { CANONICAL_CHANNELS, CHANNEL_SPECS } from "@tt/engine";
import type { PickedFile } from "./jira.js";

/** Per-JPEG limit before downscale (PRD US-04 AC1). */
export const JPEG_MAX_BYTES = 10 * 1024 * 1024;

/** Header row with the canonical names, plus a `#` comment line with units (the parser skips it). */
export const TEMPLATE_CSV = [
  `# units: ${CANONICAL_CHANNELS.filter((c) => c !== "takeover_time")
    .map((c) => `${c} [${CHANNEL_SPECS[c].unit}]`)
    .join(", ")}`,
  CANONICAL_CHANNELS.filter((c) => c !== "takeover_time").join(","),
].join("\n");

export interface ReadLimits {
  readonly csvMaxBytes: number;
  readonly framesMax: number;
  readonly haveCsv: boolean;
  readonly haveFrames: number;
}

export interface ReadResult {
  readonly csv: PickedFile | null;
  readonly frames: PickedFile[];
  readonly errors: string[];
}

export function isCsvName(name: string, type: string): boolean {
  return /\.csv$/i.test(name) || type === "text/csv";
}

export function isJpegName(name: string, type: string): boolean {
  return /\.jpe?g$/i.test(name) || type === "image/jpeg";
}

/** JPEG SOI marker check, so a renamed PNG gets a clear message instead of a decode error. */
export function looksLikeJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function bytesOf(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}

export async function readFiles(files: readonly File[], limits: ReadLimits): Promise<ReadResult> {
  let csv: PickedFile | null = null;
  const frames: PickedFile[] = [];
  const errors: string[] = [];
  let haveCsv = limits.haveCsv;
  for (const f of files) {
    if (isCsvName(f.name, f.type)) {
      if (csv !== null) {
        errors.push(`Only one CSV per event: kept ${csv.name}, ignored ${f.name}.`);
        continue;
      }
      if (f.size > limits.csvMaxBytes) {
        errors.push(`${f.name} is ${(f.size / (1024 * 1024)).toFixed(1)} MB; the limit is ${Math.round(limits.csvMaxBytes / (1024 * 1024))} MB.`);
        continue;
      }
      if (haveCsv) errors.push(`${f.name} replaces the CSV picked before.`);
      csv = { name: f.name, type: "text/csv", bytes: await bytesOf(f) };
      haveCsv = true;
    } else if (isJpegName(f.name, f.type)) {
      if (limits.haveFrames + frames.length >= limits.framesMax) {
        errors.push(`At most ${limits.framesMax} JPEGs per event: ignored ${f.name}.`);
        continue;
      }
      if (f.size > JPEG_MAX_BYTES) {
        errors.push(`${f.name} is larger than 10 MB.`);
        continue;
      }
      const bytes = await bytesOf(f);
      if (!looksLikeJpeg(bytes)) {
        errors.push(`${f.name} is not a JPEG file.`);
        continue;
      }
      frames.push({ name: f.name, type: "image/jpeg", bytes });
    } else {
      errors.push(`${f.name} is not a CSV or JPEG file.`);
    }
  }
  return { csv, frames, errors };
}
