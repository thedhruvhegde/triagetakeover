/**
 * Browser-side Jira writes for intake, as the current user (`requestJira`, ARCHITECTURE §1.1):
 * create the issue (create mode) and upload the ORIGINAL files as attachments (SPIKE-I2), each
 * with its resolver fallback. Also the `tt.thumbs` encoder (canvas, browser only).
 */
import { TT_THUMBS_TARGET_BYTES, base64Encode, parseTtThumbs, serializedSize, type TtEventV1, type TtThumbs } from "@tt/engine";
import type { AttachmentReport, TtClient } from "../../common/api.js";
import type { ThumbRaster } from "./pipeline.js";

export type RequestJira = (path: string, init?: RequestInit) => Promise<Response>;

/** Plain text → minimal ADF document (`description` in REST v3 must be ADF). */
export function adfDoc(text: string): unknown {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  return { type: "doc", version: 1, content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) };
}

export interface NewIssue {
  readonly projectKey: string;
  readonly issueType: string;
  readonly summary: string;
  readonly description: string;
  readonly labels: readonly string[];
}

export interface CreatedIssue {
  readonly key: string;
  readonly id: string;
  readonly via: "browser" | "backend";
}

/** POST /rest/api/3/issue from the browser; on any failure, the `createTakeoverIssue` resolver (asUser). */
export async function createIssue(requestJira: RequestJira, client: TtClient, issue: NewIssue): Promise<{ ok: true; issue: CreatedIssue } | { ok: false; message: string }> {
  const fields: Record<string, unknown> = {
    project: { key: issue.projectKey },
    issuetype: { name: issue.issueType },
    summary: issue.summary,
    labels: [...issue.labels],
    ...(issue.description.trim() !== "" ? { description: adfDoc(issue.description) } : {}),
  };
  try {
    const res = await requestJira("/rest/api/3/issue", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ fields }) });
    if (res.ok) {
      const body = (await res.json()) as { key?: unknown; id?: unknown };
      if (typeof body.key === "string" && typeof body.id === "string") return { ok: true, issue: { key: body.key, id: body.id, via: "browser" } };
    }
  } catch {
    // fall through to the resolver
  }
  const r = await client.call("createTakeoverIssue", { projectKey: issue.projectKey, summary: issue.summary, ...(issue.description.trim() !== "" ? { description: issue.description } : {}) });
  if (r.ok) return { ok: true, issue: { key: r.data.key, id: r.data.id, via: "backend" } };
  return { ok: false, message: r.error.message };
}

export interface PickedFile {
  readonly name: string;
  readonly type: string;
  readonly bytes: Uint8Array;
}

export interface UploadOutcome {
  /** Attachment id per input file (same order), or null when that file was not attached. */
  readonly ids: readonly (string | null)[];
  readonly report: AttachmentReport;
}

/**
 * The resolver fallback accepts only `[A-Za-z0-9 ._()+-]{1,120}` file names (services/intake.ts).
 * Other characters (umlauts, `#`, `,`, brackets, ...) become `_`; the extension is kept when
 * the name is shortened. The browser path keeps the original name.
 */
export function fallbackFilename(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ._()+-]/g, "_").trim();
  const base = cleaned === "" || /^[._ ]+$/.test(cleaned) ? "file" : cleaned;
  if (base.length <= 120) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : "";
  return base.slice(0, 120 - ext.length) + ext;
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/**
 * Uploads the original files (for humans; the server never reads them back, D1).
 * 1. One multipart POST from the browser with `X-Atlassian-Token: no-check` (SPIKE-I2, unverified).
 * 2. On failure, the `uploadAttachment` resolver once per file, base64, ≤ `fallbackMaxBytes`.
 * 3. Otherwise continue without attachments; the report says so ("raw files not attached").
 */
export async function uploadOriginals(requestJira: RequestJira, client: TtClient, issueKey: string, files: readonly PickedFile[], fallbackMaxBytes: number): Promise<UploadOutcome> {
  if (files.length === 0) return { ids: [], report: { via: "none", status: "skipped" } };
  try {
    const form = new FormData();
    for (const f of files) form.append("file", new Blob([toBlobPart(f.bytes)], { type: f.type }), f.name);
    const res = await requestJira(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`, { method: "POST", headers: { "X-Atlassian-Token": "no-check", Accept: "application/json" }, body: form });
    if (res.ok) {
      const body = (await res.json()) as unknown;
      const list = Array.isArray(body) ? (body as { id?: unknown; filename?: unknown }[]) : [];
      const used = new Set<number>();
      const ids = files.map((f) => {
        const idx = list.findIndex((a, i) => !used.has(i) && a.filename === f.name && (typeof a.id === "string" || typeof a.id === "number"));
        if (idx < 0) return null;
        used.add(idx);
        return String(list[idx]?.id);
      });
      if (ids.every((x) => x !== null)) return { ids, report: { via: "browser", status: "uploaded" } };
    }
  } catch {
    // fall through to the backend fallback
  }
  const ids: (string | null)[] = [];
  const problems: string[] = [];
  for (const f of files) {
    if (f.bytes.byteLength > fallbackMaxBytes) {
      ids.push(null);
      problems.push(`${f.name} is larger than ${Math.round(fallbackMaxBytes / 1024)} KB`);
      continue;
    }
    const r = await client.call("uploadAttachment", { issueKey, filename: fallbackFilename(f.name), mimeType: f.type, dataBase64: base64Encode(f.bytes) });
    ids.push(r.ok ? r.data.attachmentId : null);
    if (!r.ok) problems.push(`${f.name}: ${r.error.message}`);
  }
  const attached = ids.filter((x) => x !== null).length;
  if (attached === files.length) return { ids, report: { via: "backend", status: "uploaded" } };
  return { ids, report: { via: attached > 0 ? "backend" : "none", status: "failed", error: `${files.length - attached} of ${files.length} files not attached (${problems.join("; ")})` } };
}

/** Writes attachment ids into `source.csv` / `source.frames` (frames: only the decodable ones are listed). */
export function withAttachmentIds(event: TtEventV1, csvId: string | null, frameIds: readonly (string | null)[], decodable: readonly boolean[]): TtEventV1 {
  const ids = frameIds.filter((_, i) => decodable[i] === true);
  return {
    ...event,
    source: {
      csv: { ...event.source.csv, ...(csvId !== null ? { attachmentId: csvId } : {}) },
      frames: event.source.frames.map((f, i) => {
        const id = ids[i];
        return id !== null && id !== undefined ? { ...f, attachmentId: id } : f;
      }),
    },
  };
}

/** Encodes one grayscale raster as base64 JPEG with a canvas; null when no canvas is available. */
export type ThumbEncoder = (raster: ThumbRaster) => string | null;

export const canvasThumbEncoder: ThumbEncoder = (raster) => {
  try {
    if (typeof document === "undefined" || typeof ImageData === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = raster.w;
    canvas.height = raster.h;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(raster.rgba), raster.w, raster.h), 0, 0);
    const url = canvas.toDataURL("image/jpeg", 0.6);
    const comma = url.indexOf(",");
    return url.startsWith("data:image/jpeg") && comma > 0 ? url.slice(comma + 1) : null;
  } catch {
    return null;
  }
};

/** `tt.thumbs` from the rasters; frames are dropped from the end until the 12 KB target fits. */
export function buildThumbs(rasters: readonly ThumbRaster[], encode: ThumbEncoder): TtThumbs | undefined {
  const frames: { w: number; h: number; jpegB64: string }[] = [];
  for (const r of rasters.slice(0, 4)) {
    const b64 = encode(r);
    if (b64 !== null && b64.length >= 4) frames.push({ w: r.w, h: r.h, jpegB64: b64 });
  }
  while (frames.length > 0) {
    const t: TtThumbs = { v: 1, frames: [...frames] };
    const size = serializedSize(t);
    if (size.ok && size.value <= TT_THUMBS_TARGET_BYTES && parseTtThumbs(t).ok) return t;
    frames.pop();
  }
  return undefined;
}
