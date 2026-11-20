/**
 * Intake (PRD US-04..US-06): "File a takeover" (create mode, from the board) and
 * "Add telemetry" (attach mode, from an issue). Protocol: see `src/contract/ui-api.ts`.
 *
 * 1. Pick one CSV and 1–4 JPEGs. Files are read with the File API and processed in a Web Worker
 *    (SPIKE-C3, main-thread fallback) by the engine; images are decoded in the browser only.
 * 2. Unrecognised headers open the column-mapping step.
 * 3. Preview: plot, type, features, chips. Nothing is created before the user confirms.
 * 4. Confirm: create the issue (create mode), upload the originals (SPIKE-I2 + fallback),
 *    then `commitEvent`; the result shows the match.
 */
import Button from "@atlaskit/button/new";
import { FEATURE_IDS, FEATURE_SPECS, type EngineError, type EventContext, type MappingPreset } from "@tt/engine";
import {
  ApiErrorMessage,
  ConditionChips,
  ConfidenceBadge,
  EvidenceLink,
  Loading,
  Notice,
  Section,
  SignalPlot,
  WhyTable,
  colors,
  font,
  formatNumber,
  space,
  useNavigator,
  type ClientError,
  type WhyRowLike,
} from "@tt/ui-shared";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { CommitResult, IntakeContext, TtClient } from "../../common/api.js";
import type { ViewTarget } from "../../common/context.js";
import { AppFrame, Card, Muted, Row, TextField, useLoadable } from "../../common/ui.js";
import { buildThumbs, createIssue, uploadOriginals, withAttachmentIds, type PickedFile, type RequestJira, type ThumbEncoder } from "./jira.js";
import { MappingEditor } from "./Mapping.js";
import { mappingStatus, needsMappingStep, presetFits } from "./mapping-status.js";
import type { InspectResult, ProcessResult } from "./pipeline.js";
import type { Processor } from "./processor.js";
import { readFiles, TEMPLATE_CSV } from "./files.js";

export interface IntakeDeps {
  readonly client: TtClient;
  readonly target: ViewTarget;
  readonly processor: Processor;
  readonly requestJira: RequestJira;
  readonly encodeThumb: ThumbEncoder;
  /** Closes the modal (bridge `view.close`); a no-op outside a modal. */
  readonly close: (payload?: unknown) => Promise<void>;
  readonly appVersion?: string;
}

export function IntakeApp({ deps }: { readonly deps: IntakeDeps }) {
  const { target, client } = deps;
  const req = target.mode === "attach" && target.issueKey !== undefined ? { issueKey: target.issueKey } : target.projectKey !== undefined ? { projectKey: target.projectKey } : null;
  const title = target.mode === "attach" ? `Add telemetry${target.issueKey !== undefined ? ` to ${target.issueKey}` : ""}` : "File a takeover";
  if (req === null) {
    return (
      <AppFrame label={title}>
        <Notice appearance="warning" title="Nothing to attach to">
          <p style={{ margin: 0 }}>Open the intake from the board (“File takeover”) or from an issue (“Add telemetry”).</p>
        </Notice>
      </AppFrame>
    );
  }
  return <IntakeLoader deps={deps} req={req} title={title} client={client} />;
}

function IntakeLoader({ deps, req, title, client }: { readonly deps: IntakeDeps; readonly req: { issueKey: string } | { projectKey: string }; readonly title: string; readonly client: TtClient }) {
  const ctx = useLoadable(() => client.call("getIntakeContext", req));
  const v = ctx.value;
  return (
    <AppFrame label={title}>
      <h1 style={{ font: "var(--ds-font-heading-medium, normal 653 20px/24px sans-serif)", margin: `0 0 ${space.s}` }}>{title}</h1>
      {v.state === "loading" && <Loading label="Preparing the intake…" />}
      {v.state === "error" && <ApiErrorMessage error={v.error} onRetry={ctx.reload} title="The intake could not start" />}
      {v.state === "ready" && <Intake deps={deps} ctx={v.data} />}
    </AppFrame>
  );
}

interface Fields {
  summary: string;
  description: string;
  occurredAt: string;
  vehicleId: string;
  variant: string;
  build: string;
  odd: string;
  driveSessionId: string;
  manualTakeover: string;
}

const EMPTY_FIELDS: Fields = { summary: "", description: "", occurredAt: "", vehicleId: "", variant: "", build: "", odd: "", driveSessionId: "", manualTakeover: "" };

/** `datetime-local` value (no zone) → ISO-8601 in UTC; the field is labelled UTC. */
export function localToIsoUtc(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)) return `${value}Z`;
  return null;
}

export function oddTags(text: string): string[] {
  return [...new Set(text.split(",").map((t) => t.trim()).filter((t) => t !== ""))];
}

/** Field-level validation before the engine runs (the engine re-validates everything). */
export function validateFields(f: Fields, mode: "create" | "attach"): Partial<Record<keyof Fields, string>> {
  const e: Partial<Record<keyof Fields, string>> = {};
  if (mode === "create" && f.summary.trim() === "") e.summary = "Enter a summary (e.g. the driver note).";
  if (f.summary.length > 255) e.summary = "At most 255 characters.";
  if (localToIsoUtc(f.occurredAt) === null) e.occurredAt = "Enter the event time.";
  if (f.vehicleId.trim() === "") e.vehicleId = "Enter the vehicle id.";
  if (f.variant.trim() === "") e.variant = "Enter the sensor variant (e.g. cam-B).";
  if (f.build.trim() === "") e.build = "Enter the software build (e.g. 4.12.0).";
  if (f.manualTakeover.trim() !== "" && !Number.isFinite(Number(f.manualTakeover))) e.manualTakeover = "Enter a number (seconds, in the CSV time base).";
  if (oddTags(f.odd).some((t) => t.length > 64)) e.odd = "Each tag is at most 64 characters.";
  return e;
}

const CTX_PATH_FIELD: Readonly<Record<string, keyof Fields>> = {
  "ctx.occurredAt": "occurredAt",
  "ctx.vehicleId": "vehicleId",
  "ctx.variant": "variant",
  "ctx.build": "build",
  "ctx.odd": "odd",
  "ctx.driveSessionId": "driveSessionId",
};

/** Plain-language line for an engine error, naming the row / column (US-04 AC6). */
export function describeEngineError(e: EngineError): string {
  const where = [e.row !== undefined ? `row ${e.row}` : null, e.column !== undefined ? `column “${e.column}”` : null].filter((x) => x !== null).join(", ");
  return `${where !== "" ? `${where}: ` : ""}${e.message}${e.path !== undefined && e.path !== "" && where === "" ? ` (${e.path})` : ""}`;
}

/** Why-table rows for the preview: this event's features, with the n/a reason. */
export function featureRows(result: ProcessResult): WhyRowLike[] {
  const sig = result.event.sig;
  return FEATURE_IDS.map((id) => {
    const spec = FEATURE_SPECS[id];
    const v = sig.features[id];
    const flag = sig.flags[id];
    const note = v === undefined ? (flag === "channel-coverage" ? "n/a (channel coverage too low)" : "n/a (channel not mapped)") : flag === "clamped" ? "clamped" : "";
    return { feature: id, key: spec.key, label: spec.key, unit: spec.unit, eventValue: v ?? null, referenceValue: null, z: null, contribution: null, note };
  });
}

type Stage =
  | { readonly s: "edit" }
  | { readonly s: "processing" }
  | { readonly s: "preview"; readonly result: ProcessResult }
  | { readonly s: "submitting"; readonly result: ProcessResult; readonly step: string; readonly issueKey?: string }
  | { readonly s: "commit-failed"; readonly result: ProcessResult; readonly issueKey: string; readonly error: ClientError; readonly retry: () => void }
  | { readonly s: "done"; readonly commit: CommitResult; readonly createdVia?: "browser" | "backend" };

function Intake({ deps, ctx }: { readonly deps: IntakeDeps; readonly ctx: IntakeContext }) {
  const { client, processor } = deps;
  const nav = useNavigator();
  const mode = ctx.mode;
  const [csv, setCsv] = useState<PickedFile | null>(null);
  const [frames, setFrames] = useState<PickedFile[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [inspect, setInspect] = useState<InspectResult | null>(null);
  const [inspectErrors, setInspectErrors] = useState<readonly EngineError[]>([]);
  const [preset, setPreset] = useState<MappingPreset | null>(null);
  const [presetId, setPresetId] = useState<string | undefined>(undefined);
  const [showMapping, setShowMapping] = useState(false);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [processErrors, setProcessErrors] = useState<readonly EngineError[]>([]);
  const [attachOriginals, setAttachOriginals] = useState(true);
  const [stage, setStage] = useState<Stage>({ s: "edit" });
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editable = stage.s === "edit" || stage.s === "preview" || stage.s === "processing";

  useEffect(() => () => processor.dispose(), [processor]);

  const invalidate = (): void => {
    setProcessErrors([]);
    setStage((st) => (st.s === "preview" ? { s: "edit" } : st));
  };

  const onFiles = async (list: FileList | readonly File[]): Promise<void> => {
    invalidate();
    const picked = await readFiles(Array.from(list), { csvMaxBytes: ctx.limits.csvMaxBytes, framesMax: ctx.limits.framesMax, haveCsv: csv !== null, haveFrames: frames.length });
    setFileErrors(picked.errors);
    if (picked.frames.length > 0) setFrames((cur) => [...cur, ...picked.frames].slice(0, ctx.limits.framesMax));
    if (picked.csv !== null) {
      setCsv(picked.csv);
      const r = await processor.inspect(picked.csv.bytes);
      if (!r.ok) {
        setInspect(null);
        setInspectErrors(r.errors);
        return;
      }
      setInspectErrors([]);
      setInspect(r);
      const saved = ctx.presets.find((p) => isPreset(p.preset) && presetFits(p.preset, r.headers));
      if (saved !== undefined && isPreset(saved.preset)) {
        setPreset(saved.preset);
        setPresetId(saved.id);
        setShowMapping(needsMappingStep(mappingStatus(saved.preset)));
      } else {
        setPreset(r.suggested);
        setPresetId(undefined);
        setShowMapping(needsMappingStep(r));
      }
    }
  };

  const setField = (k: keyof Fields, value: string): void => {
    invalidate();
    setFields((f) => ({ ...f, [k]: value }));
  };

  const runPreview = async (): Promise<void> => {
    if (csv === null || preset === null) return;
    const errs = validateFields(fields, mode);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const occurredAt = localToIsoUtc(fields.occurredAt) ?? "";
    const eventCtx: EventContext = {
      occurredAt,
      vehicleId: fields.vehicleId.trim(),
      variant: fields.variant.trim(),
      build: fields.build.trim(),
      odd: oddTags(fields.odd),
      ...(fields.driveSessionId.trim() !== "" ? { driveSessionId: fields.driveSessionId.trim() } : {}),
    };
    setStage({ s: "processing" });
    const r = await processor.process({
      csv: csv.bytes,
      frames: frames.map((f) => f.bytes),
      ctx: eventCtx,
      ...(presetId !== undefined || preset !== inspect?.suggested ? { preset, presetId: presetId ?? "custom" } : {}),
      ...(fields.manualTakeover.trim() !== "" ? { manualTakeoverTime: Number(fields.manualTakeover) } : {}),
      ruleThresholds: ctx.ruleThresholds,
      chipThresholds: ctx.chipThresholds,
      ...(deps.appVersion !== undefined ? { app: deps.appVersion } : {}),
    });
    if (!r.ok) {
      setProcessErrors(r.errors);
      const fe: Partial<Record<keyof Fields, string>> = {};
      for (const e of r.errors) {
        const k = e.path === undefined ? undefined : CTX_PATH_FIELD[e.path.replace(/\[\d+\]$/, "")];
        if (k !== undefined) fe[k] = e.message;
      }
      setFieldErrors(fe);
      setStage({ s: "edit" });
      return;
    }
    setProcessErrors([]);
    setStage({ s: "preview", result: r });
  };

  const commit = async (result: ProcessResult, issueKey: string, ids: readonly (string | null)[], report: CommitResult["attachments"], createdVia?: "browser" | "backend"): Promise<void> => {
    setStage({ s: "submitting", result, step: "Saving the signal data and matching…", issueKey });
    const decodable = result.frames.map((f) => f.ok);
    const event = withAttachmentIds(result.event, ids[0] ?? null, ids.slice(1), decodable);
    const thumbs = buildThumbs(result.thumbs, deps.encodeThumb);
    const r = await client.call("commitEvent", { issueKey, event, ...(thumbs !== undefined ? { thumbs } : {}), attachments: report });
    if (r.ok) setStage({ s: "done", commit: r.data, ...(createdVia !== undefined ? { createdVia } : {}) });
    else setStage({ s: "commit-failed", result, issueKey, error: r.error, retry: () => void commit(result, issueKey, ids, report, createdVia) });
  };

  const submit = async (result: ProcessResult): Promise<void> => {
    if (csv === null) return;
    let issueKey = ctx.issueKey;
    let createdVia: "browser" | "backend" | undefined;
    if (mode === "create" || issueKey === undefined) {
      setStage({ s: "submitting", result, step: "Creating the issue…" });
      const created = await createIssue(deps.requestJira, client, {
        projectKey: ctx.projectKey,
        issueType: ctx.eventIssueType,
        summary: fields.summary.trim(),
        description: fields.description,
        labels: ctx.labels,
      });
      if (!created.ok) {
        setStage({ s: "preview", result });
        setProcessErrors([{ code: "E_CREATE", message: `The issue could not be created: ${created.message}` }]);
        return;
      }
      issueKey = created.issue.key;
      createdVia = created.issue.via;
    }
    let ids: (string | null)[] = [];
    let report: CommitResult["attachments"] = { via: "none", status: "skipped" };
    if (attachOriginals) {
      setStage({ s: "submitting", result, step: "Uploading the original files…", issueKey });
      const up = await uploadOriginals(deps.requestJira, client, issueKey, [csv, ...frames], ctx.limits.uploadFallbackMaxBytes);
      ids = [...up.ids];
      report = up.report;
    }
    await commit(result, issueKey, ids, report, createdVia);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    if (editable) void onFiles(e.dataTransfer.files);
  };

  if (stage.s === "done") return <Done commit={stage.commit} mode={mode} onOpen={() => void nav.navigate(`/browse/${encodeURIComponent(stage.commit.issueKey)}`)} onClose={() => void deps.close({ issueKey: stage.commit.issueKey })} />;

  const preview = stage.s === "preview" || stage.s === "submitting" || stage.s === "commit-failed" ? stage.result : null;
  const canPreview = csv !== null && preset !== null && mappingStatus(preset).missingRequired.length === 0 && !showMapping && editable && stage.s !== "processing";

  return (
    <div>
      <p style={{ margin: `0 0 ${space.s}`, color: colors.subtle }}>
        {mode === "attach" ? `Attach signal data to ${ctx.issueKey ?? "this issue"}.` : `Creates a takeover issue in ${ctx.projectKey}.`} Nothing is created or written until you confirm the preview. Files are processed in your browser; only derived values (signature, image
        statistics, a 10 Hz telemetry window, small grayscale thumbnails) are stored on the issue.
      </p>
      {mode === "attach" && (
        <p style={{ margin: `0 0 ${space.s}`, font: font.small, color: colors.subtle }} data-testid="tt-reselect-note">
          Pick the files from your computer, even if they are already attached to the issue: the app does not read existing attachments (the server never reads attachment content, and reading them in the browser is not verified yet, SPIKE-I3).
        </p>
      )}
      {ctx.existingEvent && mode === "attach" && (
        <Notice appearance="warning" title="This issue already has signal data">
          <p style={{ margin: 0 }}>Saving replaces its stored signature.</p>
        </Notice>
      )}

      <Section title="1. Files" testId="tt-intake-files">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          data-testid="tt-dropzone"
          style={{ border: `2px dashed ${dragging ? colors.focus : colors.border}`, borderRadius: 6, padding: space.m, background: dragging ? colors.information : colors.sunken }}
        >
          <p style={{ margin: `0 0 ${space.s}` }}>Drop one telemetry CSV (≤ {Math.round(ctx.limits.csvMaxBytes / (1024 * 1024))} MB) and 1 to {ctx.limits.framesMax} dashcam JPEGs here, or</p>
          <label htmlFor="tt-file-input" style={{ font: font.small, fontWeight: 600, color: colors.subtle, display: "block" }}>
            Choose files
          </label>
          <input
            id="tt-file-input"
            ref={fileInput}
            type="file"
            multiple
            accept=".csv,text/csv,.jpg,.jpeg,image/jpeg"
            disabled={!editable}
            data-testid="tt-file-input"
            onChange={(e) => {
              const files = e.target.files;
              if (files !== null) void onFiles(Array.from(files));
              e.target.value = "";
            }}
          />
        </div>
        <ul style={{ margin: `${space.s} 0 0`, paddingLeft: space.m, font: font.small }} data-testid="tt-file-list">
          {csv !== null && (
            <li>
              CSV: {csv.name} ({Math.round(csv.bytes.byteLength / 1024)} KB{inspect !== null ? `, ${inspect.rowCount} rows, ${inspect.headers.length} columns` : ""}){" "}
              <button type="button" onClick={() => { setCsv(null); setInspect(null); setPreset(null); setInspectErrors([]); invalidate(); }} disabled={!editable} style={{ font: font.small }}>
                Remove
              </button>
            </li>
          )}
          {frames.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              JPEG: {f.name} ({Math.round(f.bytes.byteLength / 1024)} KB){" "}
              <button type="button" onClick={() => { setFrames(frames.filter((_, j) => j !== i)); invalidate(); }} disabled={!editable} style={{ font: font.small }}>
                Remove
              </button>
            </li>
          ))}
          {csv === null && frames.length === 0 && <li>No files yet.</li>}
        </ul>
        {fileErrors.length > 0 && (
          <div role="alert" data-testid="tt-file-errors">
            <ul style={{ margin: `${space.xs} 0 0`, paddingLeft: space.m, color: colors.dangerText, font: font.small }}>
              {fileErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        {inspectErrors.length > 0 && (
          <div role="alert" data-testid="tt-csv-errors">
            <Notice appearance="error" title="The CSV could not be read">
              <ul style={{ margin: 0, paddingLeft: space.m }}>
                {inspectErrors.map((e, i) => (
                  <li key={`${i}-${e.code}`}>{describeEngineError(e)}</li>
                ))}
              </ul>
            </Notice>
          </div>
        )}
        <details style={{ marginTop: space.s, font: font.small }}>
          <summary style={{ cursor: "pointer", color: colors.link }}>Template CSV (canonical column names and units)</summary>
          <pre data-testid="tt-template-csv" style={{ font: font.code, background: colors.sunken, padding: space.s, borderRadius: 3, overflowX: "auto" }}>
            {TEMPLATE_CSV}
          </pre>
          <Muted>Other header names are fine: the app suggests a mapping and you can adjust it. Include about 15 s before and 5 s after the takeover.</Muted>
        </details>
      </Section>

      {inspect !== null && preset !== null && (
        <>
          {showMapping ? (
            <MappingEditor
              headers={inspect.headers}
              preset={preset}
              reason={needsMappingStep(mappingStatus(preset)) ? "Some columns were not recognised. Map them to the canonical channels." : null}
              onChange={(p) => {
                invalidate();
                setPreset(p);
                setPresetId(undefined);
              }}
              onApply={() => setShowMapping(false)}
              onSave={async (id) => {
                const r = await client.call("saveMappingPreset", { projectKey: ctx.projectKey, id, preset });
                if (!r.ok) return r.error.message;
                setPresetId(id);
                return null;
              }}
            />
          ) : (
            <p style={{ font: font.small, color: colors.subtle }} data-testid="tt-mapping-summary">
              Column mapping: {presetId !== undefined ? `saved preset “${presetId}”` : preset === inspect.suggested ? "suggested from the headers" : "custom"} ({mappingStatus(preset).mappedSignals} signal channels).{" "}
              <button type="button" onClick={() => setShowMapping(true)} disabled={!editable} data-testid="tt-edit-mapping" style={{ font: font.small }}>
                Edit column mapping
              </button>
            </p>
          )}
        </>
      )}

      <Section title="2. Event details" testId="tt-intake-fields">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: space.s }}>
          {mode === "create" && <TextField id="tt-f-summary" label="Summary" required value={fields.summary} onChange={(e) => setField("summary", e.target.value)} error={fieldErrors.summary ?? null} maxLength={255} hint="e.g. the driver's note" />}
          <TextField id="tt-f-occurred" label="Event time (UTC)" type="datetime-local" step={1} required value={fields.occurredAt} onChange={(e) => setField("occurredAt", e.target.value)} error={fieldErrors.occurredAt ?? null} />
          <TextField id="tt-f-vehicle" label="Vehicle id" required value={fields.vehicleId} onChange={(e) => setField("vehicleId", e.target.value)} error={fieldErrors.vehicleId ?? null} maxLength={128} />
          <TextField id="tt-f-variant" label="Sensor variant" required list="tt-variants" value={fields.variant} onChange={(e) => setField("variant", e.target.value)} error={fieldErrors.variant ?? null} maxLength={64} />
          <TextField id="tt-f-build" label="Software build" required list="tt-builds" value={fields.build} onChange={(e) => setField("build", e.target.value)} error={fieldErrors.build ?? null} maxLength={64} />
          <TextField id="tt-f-odd" label="ODD tags" value={fields.odd} onChange={(e) => setField("odd", e.target.value)} error={fieldErrors.odd ?? null} hint="comma-separated, e.g. highway" />
          <TextField id="tt-f-session" label="Drive session id" value={fields.driveSessionId} onChange={(e) => setField("driveSessionId", e.target.value)} error={fieldErrors.driveSessionId ?? null} maxLength={128} />
          <TextField id="tt-f-tto" label="Takeover time (optional)" inputMode="decimal" value={fields.manualTakeover} onChange={(e) => setField("manualTakeover", e.target.value)} error={fieldErrors.manualTakeover ?? null} hint="seconds, CSV time base; otherwise detected" />
        </div>
        <datalist id="tt-variants">
          {ctx.knownVariants.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
        <datalist id="tt-builds">
          {ctx.knownBuilds.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        {mode === "create" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: space.s }}>
            <label htmlFor="tt-f-desc" style={{ font: font.small, fontWeight: 600, color: colors.subtle }}>
              Description (optional)
            </label>
            <textarea id="tt-f-desc" rows={3} value={fields.description} onChange={(e) => setField("description", e.target.value)} style={{ font: font.body, padding: space.xs, border: `1px solid ${colors.border}`, borderRadius: 3, background: colors.surface, color: colors.text }} />
          </div>
        )}
        <div style={{ marginTop: space.m }}>
          <Button appearance={preview === null ? "primary" : "default"} onClick={() => void runPreview()} isDisabled={!canPreview} testId="tt-intake-preview">
            {stage.s === "processing" ? "Computing…" : preview === null ? "Compute preview" : "Recompute preview"}
          </Button>
          {csv === null && <Muted> Add a CSV first.</Muted>}
          {showMapping && <Muted> Finish the column mapping first.</Muted>}
        </div>
        {stage.s === "processing" && <Loading label={`Computing the signature${processor.mode() === "worker" ? "" : " (main thread)"}…`} />}
        {processErrors.length > 0 && (
          <div role="alert" data-testid="tt-process-errors">
            <Notice appearance="error" title="Fix these before continuing">
              <ul style={{ margin: 0, paddingLeft: space.m }}>
                {processErrors.map((e, i) => (
                  <li key={`${i}-${e.code}`}>{describeEngineError(e)}</li>
                ))}
              </ul>
            </Notice>
          </div>
        )}
      </Section>

      {preview !== null && (
        <PreviewSection
          result={preview}
          frames={frames}
          mode={mode}
          issueKey={ctx.issueKey}
          busy={stage.s === "submitting"}
          attachOriginals={attachOriginals}
          onAttachOriginals={setAttachOriginals}
          onCreate={() => void submit(preview)}
          processorMode={processor.mode()}
        />
      )}
      {stage.s === "submitting" && (
        <div role="status" aria-live="polite" data-testid="tt-submit-progress">
          <Loading label={stage.step} />
        </div>
      )}
      {stage.s === "commit-failed" && (
        <div data-testid="tt-commit-failed">
          <ApiErrorMessage error={{ ...stage.error, retryable: true }} onRetry={stage.retry} title={`${stage.issueKey} exists, but its signal data was not saved`} />
        </div>
      )}
    </div>
  );
}

function isPreset(u: unknown): u is MappingPreset {
  return typeof u === "object" && u !== null && "columns" in u && "brakeUnit" in u;
}

const TAKEOVER_SOURCE: Readonly<Record<string, string>> = { flag: "takeover flag column", manual: "entered takeover time", heuristic: "detected from the signals" };

function PreviewSection(props: {
  readonly result: ProcessResult;
  readonly frames: readonly PickedFile[];
  readonly mode: "create" | "attach";
  readonly issueKey: string | undefined;
  readonly busy: boolean;
  readonly attachOriginals: boolean;
  readonly onAttachOriginals: (on: boolean) => void;
  readonly onCreate: () => void;
  readonly processorMode: "worker" | "main-thread";
}) {
  const { result } = props;
  const ev = result.event;
  const rows = useMemo(() => featureRows(result), [result]);
  const chips = ev.img === undefined ? [] : ev.img.chips.map((chip) => ({ chip, rules: (ev.img?.chipRules ?? []).filter((r) => r.chip === chip).map((r) => `${r.metric} ${formatNumber(r.value, 3)} ${r.op} ${r.threshold}`) }));
  const tooBig = result.eventBytes > 12 * 1024;
  return (
    <Section title="3. Preview" testId="tt-intake-preview-section">
      <Card testId="tt-preview-summary">
        <Row>
          <strong data-testid="tt-preview-type">Takeover type: {ev.sig.type}</strong>
          <Muted>
            rule {ev.sig.ruleId} · takeover at {formatNumber(result.tTo, 2)} s ({TAKEOVER_SOURCE[ev.takeover.source] ?? ev.takeover.source}, {ev.takeover.confidence} confidence)
          </Muted>
        </Row>
        <div style={{ marginTop: space.xs }}>
          <ConditionChips chips={chips} showRules caption emptyText="n/a (no frames decoded)" />
        </div>
        {result.insufficientChannels && (
          <p style={{ color: colors.warningText, margin: `${space.xs} 0 0` }}>None of lane_offset, ttc or brake is mapped: the type is “unknown” and matching uses fewer features.</p>
        )}
      </Card>
      <div data-testid="tt-preview-plot">
        <SignalPlot series={{ key: "preview", ...result.series }} title="Preview of the 10 Hz telemetry window, 15 s before to 5 s after the takeover" />
      </div>
      <WhyTable rows={rows} caption="Features computed from the telemetry" referenceLabel="Reference" testId="tt-preview-features" />
      {props.frames.length > 0 && (
        <ul style={{ font: font.small, paddingLeft: space.m }} data-testid="tt-frame-outcomes">
          {props.frames.map((f, i) => {
            const o = result.frames[i];
            return (
              <li key={`${f.name}-${i}`} style={{ color: o?.ok === true ? colors.text : colors.dangerText }}>
                {f.name}: {o?.ok === true ? `decoded ${o.width}×${o.height}` : `not usable (${o?.message ?? "unknown error"}); it is left out of the image statistics`}
              </li>
            );
          })}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <Notice appearance="warning" title="CSV warnings">
          <ul style={{ margin: 0, paddingLeft: space.m }} data-testid="tt-csv-warnings">
            {result.warnings.map((w, i) => (
              <li key={`${i}-${w.code}`}>
                {w.row !== undefined && `row ${w.row}: `}
                {w.column !== undefined && `column “${w.column}”: `}
                {w.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <p style={{ font: font.small, color: tooBig ? colors.dangerText : colors.subtle }}>
        Stored property size: {(result.eventBytes / 1024).toFixed(1)} KB of the 12 KB target.{props.processorMode === "main-thread" ? " Computed on the main thread (Web Worker unavailable)." : ""}
      </p>
      <label style={{ display: "flex", gap: space.xs, alignItems: "center", font: font.body, margin: `${space.s} 0` }}>
        <input type="checkbox" checked={props.attachOriginals} onChange={(e) => props.onAttachOriginals(e.target.checked)} disabled={props.busy} data-testid="tt-attach-originals" />
        Attach the original files to the issue (for people; the app never reads them back)
      </label>
      <Button appearance="primary" onClick={props.onCreate} isDisabled={props.busy || tooBig} testId="tt-intake-create">
        {props.mode === "create" ? "Create issue" : `Save to ${props.issueKey ?? "issue"}`}
      </Button>
    </Section>
  );
}

function Done({ commit, mode, onOpen, onClose }: { readonly commit: CommitResult; readonly mode: "create" | "attach"; readonly onOpen: () => void; readonly onClose: () => void }) {
  const m = commit.match;
  const attached = commit.attachments.status === "uploaded";
  return (
    <div data-testid="tt-intake-done">
      <Notice appearance="success" title={mode === "create" ? `Created ${commit.issueKey}` : `Saved signal data to ${commit.issueKey}`}>
        <p style={{ margin: 0 }} role="status">
          {m.message}
          {m.cluster !== undefined && (
            <>
              {" "}
              <EvidenceLink evidence={{ kind: "issue", key: m.cluster.key, url: m.cluster.url, label: `${m.cluster.name} (${m.cluster.key})` }} />
            </>
          )}
        </p>
        <Row>
          <span data-testid="tt-intake-result" data-result={m.result}>
            Result: {m.result}
          </span>
          {m.result !== "first-of-kind" && <ConfidenceBadge confidence={m.confidence} />}
        </Row>
        <Muted>Accept, Split and Route are in the issue panel; nothing was linked automatically.</Muted>
      </Notice>
      {!attached && (
        <div data-testid="tt-attachments-banner">
          <Notice appearance="warning" title="Raw files not attached">
            <p style={{ margin: 0 }}>{commit.attachments.status === "skipped" ? "You chose not to attach the original files." : (commit.attachments.error ?? "The upload failed.")} The signature, thumbnails and telemetry window were saved.</p>
          </Notice>
        </div>
      )}
      <Row>
        <Button appearance="primary" onClick={onOpen} testId="tt-intake-open">
          Open {commit.issueKey}
        </Button>
        <Button onClick={onClose} testId="tt-intake-close">
          Close
        </Button>
      </Row>
    </div>
  );
}
