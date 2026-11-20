/**
 * Validation of resolver payloads and queue job bodies.
 *
 * Resolver payloads come from Custom UI / UI Kit (`invoke(...)`) and are untrusted even though
 * our own frontend sends them (§14). Queue bodies are produced by our own code but are still
 * re-checked, because consumers must survive a malformed or stale job without crashing.
 */
import {
  checkPropertySize,
  err,
  object,
  oneOf,
  ok,
  parseTtEvent,
  parseTtThumbs,
  run,
  str,
  num,
  TT_EVENT_TARGET_BYTES,
  TT_THUMBS_TARGET_BYTES,
  type Decoder,
  type EngineError,
  type Result,
  type TtEvent,
  type TtThumbs,
} from "@tt/engine";
import { RECLUSTER_REASONS, type ReclusterJob, type SeedJob } from "../ports/queue";
import { bucket, isoInstant, issueKey, projectKey, seed } from "./inputs";

/** Forge `invoke` request limit (VERIFIED): 500 KB. Intake drafts are ≈ 20 KB. */
export const INVOKE_PAYLOAD_MAX_BYTES = 500 * 1024;

/** Runs a decoder over a resolver payload; errors keep engine paths for the UI. */
export function decodePayload<T>(decoder: Decoder<T>, payload: unknown): Result<T, readonly EngineError[]> {
  return run(decoder, payload);
}

/** `commitEvent` payload (§1.1 step 16): the event draft computed in the browser. */
export interface CommitDraft {
  readonly issueKey: string;
  readonly event: TtEvent;
  readonly thumbs?: TtThumbs;
}

/**
 * Validates a `commitEvent` payload: issue key, full `tt.event` schema (engine decoder),
 * optional `tt.thumbs`, and the property size targets (12 KB each; hard limit 32,768 B).
 * It does NOT recompute `sig` from `tel` (D2); the service does that with the engine.
 */
export function parseCommitDraft(payload: unknown): Result<CommitDraft, readonly EngineError[]> {
  const size = checkPropertySize(payload, INVOKE_PAYLOAD_MAX_BYTES);
  if (!size.ok) return size;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return err([{ code: "E_SCHEMA_INVALID", message: "expected object", path: "" }]);
  }
  const p = payload as Record<string, unknown>;
  const errors: EngineError[] = [];
  const key = run(issueKey, p["issueKey"]);
  if (!key.ok) errors.push(...key.error.map((e) => ({ ...e, path: "issueKey" })));
  const event = parseTtEvent(p["event"]);
  if (!event.ok) errors.push(...event.error.map((e) => ({ ...e, path: prefix("event", e.path) })));
  let thumbs: TtThumbs | undefined;
  if (p["thumbs"] !== undefined) {
    const t = parseTtThumbs(p["thumbs"]);
    if (t.ok) thumbs = t.value;
    else errors.push(...t.error.map((e) => ({ ...e, path: prefix("thumbs", e.path) })));
  }
  if (event.ok) {
    const s = checkPropertySize(event.value, TT_EVENT_TARGET_BYTES);
    if (!s.ok) errors.push(...s.error.map((e) => ({ ...e, path: "event" })));
  }
  if (thumbs !== undefined) {
    const s = checkPropertySize(thumbs, TT_THUMBS_TARGET_BYTES);
    if (!s.ok) errors.push(...s.error.map((e) => ({ ...e, path: "thumbs" })));
  }
  if (errors.length > 0 || !key.ok || !event.ok) return err(errors);
  return ok({ issueKey: key.value, event: event.value, ...(thumbs !== undefined ? { thumbs } : {}) });
}

function prefix(root: string, path: string | undefined): string {
  return path === undefined || path === "" ? root : `${root}.${path}`;
}

const reclusterJob: Decoder<ReclusterJob> = object(
  { projectKey, reason: oneOf(RECLUSTER_REASONS), requestedAt: isoInstant },
  { bucket, requestedBy: str({ minLength: 1, maxLength: 128 }) },
);

const seedJob: Decoder<SeedJob> = object({
  jobId: str({ pattern: /^[A-Za-z0-9_-]{1,64}$/ }),
  step: str({ pattern: /^[A-Za-z0-9_-]{1,32}$/ }),
  cursor: num({ integer: true, min: 0, max: 1_000_000 }),
  seed,
});

/** Validates a `tt-recluster` job body. A `resync` job never carries a bucket. */
export function parseReclusterJob(body: unknown): Result<ReclusterJob, readonly EngineError[]> {
  const r = run(reclusterJob, body);
  if (r.ok && r.value.reason === "resync" && r.value.bucket !== undefined) {
    return err([{ code: "E_SCHEMA_INVALID", message: "resync jobs cover every bucket", path: "bucket" }]);
  }
  return r;
}

/** Validates a `tt-seed` job body. */
export function parseSeedJob(body: unknown): Result<SeedJob, readonly EngineError[]> {
  return run(seedJob, body);
}
