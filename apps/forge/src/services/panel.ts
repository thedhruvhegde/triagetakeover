/**
 * The issue panel (PRD US-09–US-13, ARCHITECTURE §7.5 lazy re-processing).
 *
 * - Event issue: verified signature (D2), match card with why-rows, signal plot data for the
 *   event and its top-3 neighbours, thumbnails, chips with the rule that fired, triage history,
 *   undo, calibration chip (US-23) and evidence. Opening it re-indexes a missing or stale row.
 * - Cluster issue: members, onset and coverage for that cluster.
 * - No `tt.event`: the honest "No signal data" state (US-13 AC1), never a guess from text.
 */
import {
  ENGINE_VERSION,
  FEATURE_IDS,
  FEATURE_KEYS,
  FEATURE_SHORT_LABELS,
  FEATURE_SPECS,
  calibrationAge,
  decodeTelemetryValues,
  isRecord,
  parseTtEvent,
  parseTtThumbs,
  type TtEvent,
} from "@tt/engine";
import type { ChipView, PanelEventView, PanelView, TelemetrySeries, WhyRowView } from "../contract/ui-api";
import { NOT_A_SAFETY_TOOL } from "../contract/ui-api";
import type { ServiceContext } from "../context";
import { PROPERTY_KEYS } from "../ports/properties";
import { readIssueAsUser, requireBrowse, userPort } from "./auth";
import { loadProjectSnapshot } from "./board";
import { coverageView, loadScenarioTests } from "./coverage";
import { done, fail, type ServiceResult } from "./errors";
import { round } from "./evidence";
import { eventSummaryOfRow } from "./index-store";
import { isClusterIssue } from "./jira-io";
import { computeMatch, loadEventContext, matchInputsOf, NO_SIGNAL_MESSAGE, stripExtras } from "./match";
import { refreshRow } from "./refresh";
import { ownerHint } from "./route";
import { readUndoStack } from "./undo";
import { IMAGE_ATTESTATION_NOTE } from "./verify";
import { decodeProposal } from "./index-store";

export function telemetrySeries(key: string, event: TtEvent): TelemetrySeries | null {
  const d = decodeTelemetryValues(event.tel);
  if (!d.ok) return null;
  const channels: Record<string, (number | null)[]> = {};
  for (const [k, values] of Object.entries(d.value)) channels[k] = values.map((x) => (Number.isFinite(x) ? round(x, 4) : null));
  return { key, hz: event.tel.hz, tStart: event.tel.tStart, channels };
}

function featureRows(event: TtEvent): WhyRowView[] {
  return FEATURE_IDS.map((id) => {
    const v = event.sig.features[id];
    const flag = event.sig.flags[id];
    return {
      feature: id,
      key: FEATURE_KEYS[id],
      label: FEATURE_SHORT_LABELS[id],
      unit: FEATURE_SPECS[id].unit,
      eventValue: v ?? null,
      referenceValue: null,
      z: null,
      contribution: null,
      note: flag === "channel-unmapped" ? "n/a (channel not mapped)" : flag === "channel-coverage" ? "n/a (channel coverage too low)" : flag === "clamped" ? "clamped" : "",
    };
  });
}

function chipViews(event: TtEvent): ChipView[] {
  const img = event.img;
  if (img === undefined) return [];
  return img.chips.map((chip) => ({ chip, rules: img.chipRules.filter((r) => r.chip === chip).map((r) => `${r.metric} ${r.value} ${r.op} ${r.threshold}`) }));
}

/** Oldest stale sensor calibration of the event's vehicle (US-23, informational). */
async function calibrationChip(ctx: ServiceContext, event: TtEvent, windowDays: number): Promise<PanelEventView["calibration"]> {
  const v = await ctx.ports.storage.getEntity("vehicle", event.ctx.vehicleId);
  if (!v.ok || v.value === undefined || !isRecord(v.value.calibration)) return null;
  let worst: { chip: string; days: number } | null = null;
  for (const at of Object.values(v.value.calibration)) {
    if (typeof at !== "string") continue;
    const a = calibrationAge(event.ctx.occurredAt, at, windowDays);
    if (a !== null && a.chip !== null && (worst === null || a.days > worst.days)) worst = { chip: a.chip, days: a.days };
  }
  return worst;
}

export async function getPanel(ctx: ServiceContext, issueKey: string): Promise<ServiceResult<PanelView>> {
  const first = await readIssueAsUser(ctx, issueKey, { properties: [PROPERTY_KEYS.event, PROPERTY_KEYS.cluster] });
  if (!first.ok) return first;
  const browse = await requireBrowse(ctx, first.value.projectKey);
  if (!browse.ok) return browse;
  if (isClusterIssue(first.value) && !(PROPERTY_KEYS.event in first.value.properties)) return clusterPanel(ctx, first.value.projectKey, first.value.id);
  if (!(PROPERTY_KEYS.event in first.value.properties)) return done({ kind: "no-signal-data", issueKey: first.value.key, message: "No signal data." });

  const ecr = await loadEventContext(ctx, issueKey, [PROPERTY_KEYS.thumbs]);
  if (!ecr.ok) {
    if (ecr.error.schemaErrors !== undefined) return done({ kind: "invalid-signal-data", issueKey: first.value.key, message: ecr.error.message, errors: ecr.error.schemaErrors });
    if (ecr.error.noSignal === true) return done({ kind: "no-signal-data", issueKey: first.value.key, message: NO_SIGNAL_MESSAGE });
    return { ok: false, error: stripExtras(ecr.error) };
  }
  const ec = ecr.value;
  const event = ec.verified.event;
  const m = computeMatch(matchInputsOf(ec));
  const refreshed = await refreshRow(ctx, ec, m.membership);
  const jira = userPort(ctx);
  if (!jira.ok) return jira;

  const neighbourTelemetry: TelemetrySeries[] = [];
  for (const n of m.view.neighbours.slice(0, 3)) {
    const p = await jira.value.getIssueProperty(n.key, PROPERTY_KEYS.event);
    if (!p.ok || p.value === null) continue;
    const parsed = parseTtEvent(p.value.value);
    if (!parsed.ok) continue;
    const s = telemetrySeries(n.key, parsed.value);
    if (s !== null) neighbourTelemetry.push(s);
  }
  const thumbsRaw = ec.issue.properties[PROPERTY_KEYS.thumbs];
  const thumbs = thumbsRaw === undefined ? null : parseTtThumbs(thumbsRaw);
  const triage = ec.triage;
  const lastAccept = [...(triage?.history ?? [])].reverse().find((h) => h.action.endsWith("accept") || h.action === "split");
  const undo = (await readUndoStack(ctx.ports.storage, ec.identity.key)).at(-1);
  const attachments = await jira.value.getAttachments(ec.identity.id);
  const telemetry = telemetrySeries(ec.identity.key, event);
  if (telemetry === null) return fail("invalid-input", "The stored telemetry could not be decoded.");
  const warnings = [...new Set([...ec.warnings, ...refreshed.warnings])];
  if (thumbs !== null && !thumbs.ok) warnings.push("The stored thumbnails are not valid and are not shown.");
  const view: PanelEventView = {
    kind: "event",
    match: m.view,
    features: featureRows(event),
    chips: chipViews(event),
    imageNote: event.img === undefined ? "No frames were decoded; condition chips are n/a." : IMAGE_ATTESTATION_NOTE,
    telemetry,
    neighbourTelemetry,
    thumbs: thumbs !== null && thumbs.ok ? thumbs.value.frames.map((f) => ({ w: f.w, h: f.h, dataUri: `data:image/jpeg;base64,${f.jpegB64}` })) : [],
    triage: {
      state: triage?.state ?? "none",
      ...(triage?.clusterKey !== undefined ? { clusterKey: triage.clusterKey } : {}),
      ...(triage !== null ? { by: triage.by, at: triage.at } : {}),
      viaDemoSeed: lastAccept?.action === "seed-accept",
      history: (triage?.history ?? []).map((h) => ({ action: h.action, by: h.by, at: h.at, ...(h.clusterKey !== undefined ? { clusterKey: h.clusterKey } : {}) })),
    },
    undo: undo === undefined ? { available: false } : { available: true, action: undo.action, summary: undo.summary },
    index: { reprocessed: refreshed.reprocessed, ...(refreshed.reason !== undefined ? { reason: refreshed.reason } : {}), outOfSync: refreshed.outOfSync },
    calibration: await calibrationChip(ctx, event, ec.config.calibrationWindowDays),
    propertyVersion: { v: event.v, engine: event.engine, app: event.app, currentEngine: ENGINE_VERSION },
    attachments: attachments.ok
      ? attachments.value.map((a) => ({ kind: "attachment" as const, id: a.id, key: ec.identity.key, url: `/secure/attachment/${a.id}/${encodeURIComponent(a.filename)}`, label: `${a.filename} (${a.size} B)` }))
      : [],
    warnings,
    disclaimer: NOT_A_SAFETY_TOOL,
  };
  return done(view, warnings);
}

async function clusterPanel(ctx: ServiceContext, projectKey: string, clusterId: string): Promise<ServiceResult<PanelView>> {
  const snap = await loadProjectSnapshot(ctx, projectKey);
  if (!snap.ok) return snap;
  const s = snap.value.value;
  const c = s.clusters.find((x) => x.id === clusterId);
  const row = s.index.byId.get(clusterId);
  if (c === undefined || row === undefined) {
    return fail("invalid-input", "This cluster has no accepted members in the index yet. Accept events into it, or run Re-sync now.");
  }
  const jira = userPort(ctx);
  if (!jira.ok) return jira;
  const tests = await loadScenarioTests(jira.value, s.config);
  const pending = s.events.filter((e) => e.value.status === "proposed" && (() => { const p = decodeProposal(e.value.proposalId); return p.kind === "suggest" && p.clusterId === clusterId; })()).map((e) => e.value.issueKey);
  return done(
    {
      kind: "cluster",
      cluster: c.ref,
      members: c.members.map((m) => eventSummaryOfRow(m.key, m.value)),
      pendingSuggestions: pending,
      onset: c.onset,
      coverage: coverageView(c.cache.signature, tests),
      owner: s.config.routing.length > 0 ? ownerHint(s.config, row.bucket) : null,
      disclaimer: NOT_A_SAFETY_TOOL,
    },
    snap.value.warnings,
  );
}
