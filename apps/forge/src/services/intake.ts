/**
 * Intake support (PRD US-04–US-06, ARCHITECTURE §1.1): context for the modal, the asUser
 * issue-creation fallback, the SPIKE-I2 attachment-upload fallback and mapping presets.
 * Decoding happens in the browser (D1); the server only receives derived JSON and, for the
 * fallback, the original file bytes to store as a Jira attachment (it never reads them back).
 */
import { CSV_MAX_BYTES, MAX_EVENT_FRAMES, PROPERTY_LIMIT_BYTES, base64Decode, parseMappingPreset } from "@tt/engine";
import type { IntakeContext } from "../contract/ui-api";
import { UPLOAD_FALLBACK_MAX_BYTES } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { KvsKeys } from "../ports/storage";
import { LABELS, PROPERTY_KEYS } from "../ports/properties";
import { sanitizeText } from "../validation/inputs";
import { readIssueAsUser, requireBrowse, userPort } from "./auth";
import { attachmentReportOf, recordAttachmentOutcome } from "./commit";
import { loadProjectConfig } from "./config";
import { detailsOf, done, fail, fromPortError, type ServiceResult } from "./errors";
import { issueUrl } from "./evidence";
import { compareKeys, loadProjectEvents } from "./index-store";

export const ALLOWED_UPLOAD_TYPES = ["text/csv", "text/plain", "image/jpeg"] as const;
const FILENAME_RE = /^[A-Za-z0-9 ._()+-]{1,120}$/;
const PRESET_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export async function getIntakeContext(ctx: ServiceContext, input: { projectKey?: string; issueKey?: string }): Promise<ServiceResult<IntakeContext>> {
  let projectKey = input.projectKey;
  let existingEvent = false;
  if (input.issueKey !== undefined) {
    const issue = await readIssueAsUser(ctx, input.issueKey, { properties: [PROPERTY_KEYS.event] });
    if (!issue.ok) return issue;
    projectKey = issue.value.projectKey;
    existingEvent = PROPERTY_KEYS.event in issue.value.properties;
  }
  if (projectKey === undefined) return fail("invalid-input", "A project or an issue is required.");
  const browse = await requireBrowse(ctx, projectKey);
  if (!browse.ok) return browse;
  const { config, warnings } = await loadProjectConfig(ctx.ports.storage, projectKey);
  const presets = await ctx.ports.storage.queryByPrefix(`preset:${projectKey}:`, { limit: 50 });
  const events = await loadProjectEvents(ctx.ports.storage, projectKey);
  const rows = events.ok ? events.value : [];
  const w = [...warnings];
  if (existingEvent) w.push("This issue already has signal data; adding telemetry replaces it.");
  return done(
    {
      projectKey,
      ...(input.issueKey !== undefined ? { issueKey: input.issueKey } : {}),
      mode: input.issueKey !== undefined ? "attach" : "create",
      eventIssueType: config.eventIssueType,
      labels: [LABELS.takeover],
      presets: presets.ok ? presets.value.items.map((kv) => ({ id: kv.key.slice(`preset:${projectKey}:`.length), preset: kv.value })) : [],
      ruleThresholds: { ...config.ruleThresholds },
      chipThresholds: { ...config.chipThresholds },
      knownVariants: [...new Set(rows.map((r) => r.value.variant))].sort(),
      knownBuilds: [...new Set(rows.map((r) => r.value.build))].sort(compareKeys),
      limits: { csvMaxBytes: CSV_MAX_BYTES, framesMax: Math.min(4, MAX_EVENT_FRAMES), uploadFallbackMaxBytes: UPLOAD_FALLBACK_MAX_BYTES, propertyMaxBytes: PROPERTY_LIMIT_BYTES },
      existingEvent,
    },
    w,
  );
}

/** Fallback when the browser cannot create the issue itself. Created asUser with `tt-takeover`. */
export async function createTakeoverIssue(ctx: ServiceContext, input: { projectKey: string; summary: string; description?: string }): Promise<ServiceResult<{ key: string; id: string; url: string }>> {
  const browse = await requireBrowse(ctx, input.projectKey);
  if (!browse.ok) return browse;
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const summary = sanitizeText(input.summary, 255);
  if (summary === "") return fail("invalid-input", "A summary is required.", [{ path: "summary", message: "must not be empty" }]);
  const { config } = await loadProjectConfig(ctx.ports.storage, input.projectKey);
  const description = input.description === undefined ? undefined : input.description.slice(0, 20_000);
  const r = await jira.value.createIssue({ projectKey: input.projectKey, issueType: config.eventIssueType, summary, labels: [LABELS.takeover], ...(description !== undefined ? { description } : {}) });
  if (!r.ok) return fromPortError(r.error, "Creating the issue");
  return done({ key: r.value.key, id: r.value.id, url: issueUrl(r.value.key) });
}

/**
 * SPIKE-I2 fallback: uploads one original file (base64) asUser. Limited to
 * {@link UPLOAD_FALLBACK_MAX_BYTES} decoded bytes because `invoke` payloads are ≤ 500 KB.
 */
export async function uploadAttachmentFallback(ctx: ServiceContext, input: { issueKey: string; filename: string; mimeType: string; dataBase64: string }): Promise<ServiceResult<{ attachmentId: string; filename: string; size: number }>> {
  const issue = await readIssueAsUser(ctx, input.issueKey);
  if (!issue.ok) return issue;
  if (!FILENAME_RE.test(input.filename)) return fail("invalid-input", "The file name has unsupported characters.", [{ path: "filename", message: "letters, digits, space and ._()+- only, ≤ 120 characters" }]);
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(input.mimeType)) return fail("invalid-input", "Only CSV and JPEG files are accepted.", [{ path: "mimeType", message: `one of ${ALLOWED_UPLOAD_TYPES.join(", ")}` }]);
  if (input.dataBase64.length > Math.ceil((UPLOAD_FALLBACK_MAX_BYTES * 4) / 3) + 4) return fail("invalid-input", `The file is larger than ${Math.floor(UPLOAD_FALLBACK_MAX_BYTES / 1024)} KB, the limit for the fallback upload.`);
  const bytes = base64Decode(input.dataBase64);
  if (bytes === null) return fail("invalid-input", "The file data is not valid base64.", [{ path: "dataBase64", message: "invalid base64" }]);
  if (bytes.byteLength > UPLOAD_FALLBACK_MAX_BYTES) return fail("invalid-input", `The file is larger than ${Math.floor(UPLOAD_FALLBACK_MAX_BYTES / 1024)} KB, the limit for the fallback upload.`);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const r = await jira.value.uploadAttachment(issue.value.id, { filename: input.filename, mimeType: input.mimeType, bytes });
  await recordAttachmentOutcome(ctx, attachmentReportOf({ via: "backend", status: r.ok ? "uploaded" : "failed", ...(r.ok ? {} : { error: r.error.message }) }));
  if (!r.ok) return fromPortError(r.error, "Uploading the attachment");
  return done({ attachmentId: r.value.id, filename: r.value.filename, size: r.value.size });
}

export async function saveMappingPreset(ctx: ServiceContext, input: { projectKey: string; id: string; preset: unknown }): Promise<ServiceResult<{ id: string }>> {
  const browse = await requireBrowse(ctx, input.projectKey);
  if (!browse.ok) return browse;
  if (!PRESET_ID_RE.test(input.id)) return fail("invalid-input", "Preset ids use letters, digits, _ and - (at most 40).", [{ path: "id", message: "invalid id" }]);
  const p = parseMappingPreset(input.preset);
  if (!p.ok) return fail("invalid-input", "The mapping preset is not valid.", detailsOf(p.error, "preset"));
  const w = await ctx.ports.storage.set(KvsKeys.preset(input.projectKey, input.id), p.value);
  if (!w.ok) return fromPortError(w.error, "Saving the preset");
  return done({ id: input.id });
}
