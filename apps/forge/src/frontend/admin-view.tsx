/**
 * "Takeover Triage setup" (jira:adminPage, UI Kit, PRD row "admin page"):
 * - Demo data: load / remove the SYNTHETIC demo seed, with step progress (US-01);
 * - Project: pick the project, issue types, link type, JQL, thresholds;
 * - Team mapping: routing rules to a Teamwork Graph team, a component or a project role (US-15);
 * - Re-sync now, with progress (US-02 AC4);
 * - Diagnostics: each platform check with its plain-language consequence.
 *
 * Every call goes through the ui-resolver contract (`call`); nothing here talks to Jira directly.
 */
import { Box, Button, DynamicTable, Heading, Inline, Label, Lozenge, ProgressBar, SectionMessage, Select, Spinner, Stack, Text, Textfield, Toggle } from "@forge/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOT_A_SAFETY_TOOL,
  type AdminState,
  type ApiError,
  type DiagnosticsView,
  type ProjectConfigView,
  type ResyncStatus,
  type RoutingRuleInput,
  type SeedJobView,
  type SeedReportView,
  type SeedStartMode,
  type TakeoverTypeName,
  type UiRequest,
} from "../contract/ui-api";
import type { Caller } from "./api";
import { DIAGNOSTIC_LABELS, countsText, errorText, normaliseProjectKey, parseNumberField, resyncActive, resyncText, seedActive, seedProgress } from "./format";

export interface AdminViewProps {
  readonly call: Caller;
  /** Seed used by "Load demo data" unless the admin changes it (seedgen DEFAULT_SEED). */
  readonly defaultSeed: number;
  /** Initial project key in the picker (the demo project). */
  readonly defaultProjectKey?: string;
  /** Show staging-only tools such as "Simulate TWG error" (§11). */
  readonly showStagingTools?: boolean;
  /** Poll interval for seed and re-sync progress. */
  readonly pollMs?: number;
}

const TAKEOVER_TYPE_OPTIONS: readonly TakeoverTypeName[] = ["cut-in-response", "late-brake", "phantom-brake", "lane-loss", "lateral-drift", "unknown"];

function ErrorBox({ error, title }: { readonly error: ApiError; readonly title: string }) {
  return (
    <SectionMessage appearance={error.code === "forbidden-or-not-found" ? "warning" : "error"} title={title}>
      <Text>{errorText(error)}</Text>
      {(error.details ?? []).map((d) => (
        <Text key={`${d.path ?? ""}:${d.message}`}>{d.path !== undefined ? `${d.path}: ${d.message}` : d.message}</Text>
      ))}
    </SectionMessage>
  );
}

function Warnings({ warnings }: { readonly warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <SectionMessage appearance="information">
      {warnings.map((w) => (
        <Text key={w}>{w}</Text>
      ))}
    </SectionMessage>
  );
}

/** Calls `tick` every `ms` while `active`; stops on unmount. */
function usePoll(active: boolean, ms: number, tick: () => Promise<void>): void {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = (): void => {
      timer = setTimeout(() => {
        void tickRef.current().finally(() => {
          if (!stopped) loop();
        });
      }, ms);
    };
    loop();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active, ms]);
}

export function AdminView({ call, defaultSeed, defaultProjectKey = "TTDEMO", showStagingTools = false, pollMs = 2000 }: AdminViewProps) {
  const [projectInput, setProjectInput] = useState(defaultProjectKey);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [state, setState] = useState<AdminState | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (pk: string) => {
      setLoading(true);
      setError(null);
      const r = await call("getAdminState", { projectKey: pk });
      setLoading(false);
      if (r.ok) {
        setProjectKey(pk);
        setState(r.data);
        setWarnings(r.warnings);
      } else {
        setState(null);
        setError(r.error);
      }
    },
    [call],
  );

  const typedKey = normaliseProjectKey(projectInput);

  return (
    <Stack space="space.300">
      <Heading size="large">Takeover Triage setup</Heading>
      <Text>{NOT_A_SAFETY_TOOL}</Text>

      <Stack space="space.100">
        <Heading size="small">Project</Heading>
        <Label labelFor="tt-project">Project key</Label>
        <Inline space="space.100" alignBlock="center">
          <Textfield id="tt-project" name="project" value={projectInput} onChange={(e) => setProjectInput(String(e.target.value ?? ""))} />
          <Button appearance="primary" isDisabled={typedKey === null || loading} onClick={() => typedKey !== null && void load(typedKey)}>
            Open
          </Button>
          {loading && <Spinner label="Loading" />}
        </Inline>
        {typedKey === null && projectInput.trim() !== "" && <Text>Project keys are 2–10 letters or digits, starting with a letter.</Text>}
        {state !== null && state.projects.length > 0 && (
          <Inline space="space.100" shouldWrap>
            <Text>Configured:</Text>
            {state.projects.map((p) => (
              <Button key={p} appearance="subtle" onClick={() => void load(p)}>
                {p}
              </Button>
            ))}
          </Inline>
        )}
        {error !== null && <ErrorBox error={error} title="Could not open the project" />}
        <Warnings warnings={warnings} />
      </Stack>

      <DemoDataSection call={call} projectKey={projectKey ?? typedKey} defaultSeed={defaultSeed} pollMs={pollMs} onChanged={() => projectKey !== null && void load(projectKey)} />

      {state !== null && projectKey !== null && (
        <>
          <ResyncSection call={call} projectKey={projectKey} initial={state.resync} pollMs={pollMs} />
          <ConfigSection call={call} projectKey={projectKey} state={state} showStagingTools={showStagingTools} onSaved={(config) => setState({ ...state, config })} />
          <TeamMappingSection call={call} projectKey={projectKey} state={state} onSaved={(config) => setState({ ...state, config })} />
          <DiagnosticsSection call={call} projectKey={projectKey} initial={state.diagnostics} />
        </>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------ demo data

function DemoDataSection({ call, projectKey, defaultSeed, pollMs, onChanged }: { readonly call: Caller; readonly projectKey: string | null; readonly defaultSeed: number; readonly pollMs: number; readonly onChanged: () => void }) {
  const [seedText, setSeedText] = useState(String(defaultSeed));
  const [job, setJob] = useState<SeedJobView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notes, setNotes] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const seed = parseNumberField(seedText, 0, 2 ** 31 - 1);
  const active = seedActive(job);

  usePoll(active, pollMs, async () => {
    if (job === null) return;
    const r = await call("getSeedJob", { jobId: job.jobId });
    if (r.ok) {
      setJob(r.data);
      if (r.data.state === "done") onChanged();
    } else setError(r.error);
  });

  const start = async (mode?: SeedStartMode): Promise<void> => {
    if (projectKey === null || seed === null || !Number.isInteger(seed)) return;
    setBusy(true);
    setError(null);
    setNotes([]);
    const r = await call("startSeed", { projectKey, seed, ...(mode !== undefined ? { mode } : {}) });
    setBusy(false);
    if (r.ok) {
      setJob(r.data);
      setNotes(r.warnings);
    } else setError(r.error);
  };

  const remove = async (): Promise<void> => {
    if (projectKey === null) return;
    setBusy(true);
    setError(null);
    setConfirmRemove(false);
    const r = await call("removeDemoData", { projectKey });
    setBusy(false);
    if (r.ok) {
      setJob(null);
      setNotes([`Removed ${r.data.removedIssues} demo issue(s) and ${r.data.removedRows} stored row(s).`, ...r.warnings]);
      onChanged();
    } else setError(r.error);
  };

  const progress = job !== null ? seedProgress(job) : null;
  // The seed service answers `conflict` with a `mode` detail naming the choices it accepts.
  const modeHint = error?.code === "conflict" ? (error.details ?? []).find((d) => d.path === "mode")?.message : undefined;
  return (
    <Stack space="space.100">
      <Heading size="small">Demo data</Heading>
      <Text>
        Loads generated SYNTHETIC demo data into {projectKey ?? "the project above"}: takeover events, scenario tests, vehicles and drive sessions, processed by the same engine as real uploads. Every
        item is labelled tt-synthetic and can be removed here.
      </Text>
      <Label labelFor="tt-seed">Seed</Label>
      <Inline space="space.100" alignBlock="center">
        <Textfield id="tt-seed" name="seed" value={seedText} onChange={(e) => setSeedText(String(e.target.value ?? ""))} />
        <Button appearance="primary" isDisabled={projectKey === null || seed === null || busy || active} onClick={() => void start()}>
          Load demo data
        </Button>
        {!confirmRemove ? (
          <Button isDisabled={projectKey === null || busy || active} onClick={() => setConfirmRemove(true)}>
            Remove demo data
          </Button>
        ) : (
          <>
            <Button appearance="danger" isDisabled={busy} onClick={() => void remove()}>
              Confirm remove
            </Button>
            <Button appearance="subtle" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
          </>
        )}
        {busy && <Spinner label="Working" />}
      </Inline>
      {confirmRemove && <Text>Deletes the tt-synthetic issues in {projectKey} and the app's demo rows. Other issues are not touched.</Text>}
      {job !== null && progress !== null && (
        <Box>
          <Inline space="space.100" alignBlock="center">
            <Lozenge appearance={job.state === "done" ? "success" : job.state === "failed" ? "removed" : "inprogress"}>{job.state}</Lozenge>
            <Text>{progress.label}</Text>
            <Text size="small">seed {job.seed}</Text>
          </Inline>
          {progress.fraction !== null ? <ProgressBar ariaLabel="Demo data progress" value={progress.fraction} /> : active && <ProgressBar ariaLabel="Demo data progress" isIndeterminate />}
          {progress.message !== null && <Text>{progress.message}</Text>}
          {Object.keys(job.counts).length > 0 && <Text size="small">{countsText(job.counts)}</Text>}
          {job.errors.map((e) => (
            <Text key={e}>{e}</Text>
          ))}
        </Box>
      )}
      {error !== null && <ErrorBox error={error} title="Demo data" />}
      {modeHint !== undefined && (
        <Inline space="space.100">
          {modeHint.includes("keep") && (
            <Button isDisabled={busy} onClick={() => void start("keep")}>
              Keep existing demo data
            </Button>
          )}
          {modeHint.includes("reset") && (
            <Button appearance="warning" isDisabled={busy} onClick={() => void start("reset")}>
              Reset: remove and load again
            </Button>
          )}
        </Inline>
      )}
      <Warnings warnings={notes} />
      {projectKey !== null && <SeedReportSection call={call} projectKey={projectKey} />}
    </Stack>
  );
}

/** ARI as text: 4 decimals, or "n/a" when it could not be computed. */
export function ariText(x: number | null): string {
  return x === null ? "n/a" : x.toFixed(4);
}

/** Admin-only seed report (ARCHITECTURE §9 step 6, SEED_DATA S10). Shows only what the service measured. */
function SeedReportSection({ call, projectKey }: { readonly call: Caller; readonly projectKey: string }) {
  const [report, setReport] = useState<SeedReportView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await call("getSeedReport", { projectKey });
    setBusy(false);
    if (r.ok) setReport(r.data);
    else setError(r.error);
  };
  return (
    <Box>
      <Button appearance="subtle" isDisabled={busy} onClick={() => void load()}>
        {report === null ? "Show seed report" : "Refresh seed report"}
      </Button>
      {error !== null && <ErrorBox error={error} title="Seed report" />}
      {report !== null && (
        <Stack space="space.050">
          <Text>
            Seed {report.seed} ({report.isDefaultSeed ? "default seed" : `default is ${report.defaultSeed}`}), generator {report.generator}, anchor {report.anchorDate}, {report.frames} frames.
          </Text>
          <Text size="small">{countsText(report.counts)}</Text>
          <Text>
            Engine vs this generator (adjusted Rand index): all events {ariText(report.accuracy.ariAll)}; without the {report.accuracy.boundaryEvents} boundary events {ariText(report.accuracy.ariExcludingBoundary)}; historical
            proposal {ariText(report.accuracy.ariHistoryProposal)}. {report.accuracy.note}
          </Text>
          <Text size="small">Planted: {report.planted.map((p) => `${p.role} ${p.issueKey ?? "(not created)"}`).join(" · ")}</Text>
          <Text size="small">{report.defaultSeedRule}</Text>
          {report.honesty.map((h) => (
            <Text key={h} size="small">
              {h}
            </Text>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ------------------------------------------------------------------ re-sync

function ResyncSection({ call, projectKey, initial, pollMs }: { readonly call: Caller; readonly projectKey: string; readonly initial: ResyncStatus; readonly pollMs: number }) {
  const [status, setStatus] = useState<ResyncStatus>(initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setStatus(initial), [initial]);

  usePoll(resyncActive(status), pollMs, async () => {
    const r = await call("getResyncStatus", { projectKey });
    if (r.ok) setStatus(r.data);
    else setError(r.error);
  });

  const request = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await call("requestResync", { projectKey });
    setBusy(false);
    if (r.ok) setStatus(r.data);
    else setError(r.error);
  };

  return (
    <Stack space="space.100">
      <Heading size="small">Re-sync</Heading>
      <Text>Rebuilds this project's takeover index from Jira (event properties and cluster links). Runs in the background; the board updates when it finishes.</Text>
      <Inline space="space.100" alignBlock="center">
        <Button isDisabled={busy || resyncActive(status)} onClick={() => void request()}>
          Re-sync now
        </Button>
        <Text>{resyncText(status)}</Text>
      </Inline>
      {resyncActive(status) && <ProgressBar ariaLabel="Re-sync progress" isIndeterminate />}
      {Object.keys(status.counts).length > 0 && <Text size="small">{countsText(status.counts)}</Text>}
      {error !== null && <ErrorBox error={error} title="Re-sync" />}
    </Stack>
  );
}

// ------------------------------------------------------------------ project config

type ConfigPatch = UiRequest<"saveProjectConfig">["config"];

interface Draft {
  enabled: boolean;
  eventIssueType: string;
  clusterIssueType: string;
  scenarioIssueType: string;
  linkType: string;
  eventJql: string;
  scenarioJql: string;
  routeField: string;
  tau: string;
  k: string;
  calibrationWindowDays: string;
  fallbackProjectRoleId: string;
  simulateTwgError: boolean;
  ruleThresholds: Record<string, string>;
  chipThresholds: Record<string, string>;
}

function draftOf(c: ProjectConfigView): Draft {
  const str = (r: Readonly<Record<string, number>>): Record<string, string> => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]));
  return {
    enabled: c.enabled,
    eventIssueType: c.eventIssueType,
    clusterIssueType: c.clusterIssueType,
    scenarioIssueType: c.scenarioIssueType,
    linkType: c.linkType,
    eventJql: c.eventJql,
    scenarioJql: c.scenarioJql,
    routeField: c.routeField,
    tau: String(c.tau),
    k: String(c.k),
    calibrationWindowDays: String(c.calibrationWindowDays),
    fallbackProjectRoleId: c.fallbackProjectRoleId,
    simulateTwgError: c.simulateTwgError,
    ruleThresholds: str(c.ruleThresholds),
    chipThresholds: str(c.chipThresholds),
  };
}

/** Draft → patch; local number problems are reported before anything is sent. */
export function patchOf(d: Draft, includeStaging: boolean): { readonly patch: ConfigPatch; readonly problems: readonly string[] } {
  const problems: string[] = [];
  const n = (label: string, text: string, min: number, max: number, integer = false): number => {
    const v = parseNumberField(text, min, max);
    if (v === null || (integer && !Number.isInteger(v))) {
      problems.push(`${label}: expected ${integer ? "an integer" : "a number"} from ${min} to ${max}`);
      return NaN;
    }
    return v;
  };
  const nums = (label: string, r: Record<string, string>): Record<string, number> => Object.fromEntries(Object.entries(r).map(([k, t]) => [k, n(`${label} ${k}`, t, 0, 1e6)]));
  const patch: ConfigPatch = {
    enabled: d.enabled,
    eventIssueType: d.eventIssueType,
    clusterIssueType: d.clusterIssueType,
    scenarioIssueType: d.scenarioIssueType,
    linkType: d.linkType,
    eventJql: d.eventJql,
    scenarioJql: d.scenarioJql,
    routeField: d.routeField,
    tau: n("τ (match threshold)", d.tau, 0.05, 10),
    k: n("k (neighbours)", d.k, 1, 15, true),
    calibrationWindowDays: n("Calibration window (days)", d.calibrationWindowDays, 1, 3650, true),
    fallbackProjectRoleId: d.fallbackProjectRoleId,
    ruleThresholds: nums("Rule threshold", d.ruleThresholds),
    chipThresholds: nums("Chip threshold", d.chipThresholds),
    ...(includeStaging ? { simulateTwgError: d.simulateTwgError } : {}),
  };
  return { patch, problems };
}

interface Option {
  readonly label: string;
  readonly value: string;
}
const opt = (v: string, label = v): Option => ({ label, value: v });
const optionValue = (o: unknown): string | undefined => (typeof o === "object" && o !== null && typeof (o as { value?: unknown }).value === "string" ? (o as { value: string }).value : undefined);

function TextField({ id, label, value, onChange }: { readonly id: string; readonly label: string; readonly value: string; readonly onChange: (v: string) => void }) {
  return (
    <Box>
      <Label labelFor={id}>{label}</Label>
      <Textfield id={id} name={id} value={value} onChange={(e) => onChange(String(e.target.value ?? ""))} />
    </Box>
  );
}

function ConfigSection({ call, projectKey, state, showStagingTools, onSaved }: { readonly call: Caller; readonly projectKey: string; readonly state: AdminState; readonly showStagingTools: boolean; readonly onSaved: (c: ProjectConfigView) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(state.config));
  const [problems, setProblems] = useState<readonly string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(draftOf(state.config)), [state.config]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setDraft((d) => ({ ...d, [k]: v }));
  const typeOptions = state.issueTypes.map((t) => opt(t));
  const roleOptions = [opt("", "None"), ...state.roles.map((r) => opt(r.id, r.name))];

  const save = async (): Promise<void> => {
    const { patch, problems: local } = patchOf(draft, showStagingTools);
    setProblems(local);
    setSaved(null);
    setError(null);
    if (local.length > 0) return;
    setBusy(true);
    const r = await call("saveProjectConfig", { projectKey, config: patch });
    setBusy(false);
    if (r.ok) {
      onSaved(r.data);
      setSaved(`Saved${r.data.updatedAt !== null ? ` at ${r.data.updatedAt}` : ""}.`);
    } else setError(r.error);
  };

  const typeSelect = (id: "eventIssueType" | "clusterIssueType" | "scenarioIssueType", label: string) => (
    <Box>
      <Label labelFor={id}>{label}</Label>
      <Select id={id} name={id} options={typeOptions} value={opt(draft[id])} onChange={(o: unknown) => set(id, optionValue(o) ?? draft[id])} />
    </Box>
  );

  return (
    <Stack space="space.150">
      <Heading size="small">Settings for {projectKey}</Heading>
      <Toggle id="tt-enabled" label="Enabled for this project" isChecked={draft.enabled} onChange={(e) => set("enabled", e.target.checked === true)} />
      {typeSelect("eventIssueType", "Takeover event issue type")}
      {typeSelect("clusterIssueType", "Cluster issue type")}
      {typeSelect("scenarioIssueType", "Scenario test issue type")}
      <TextField id="tt-link-type" label="Link type (event → cluster)" value={draft.linkType} onChange={(v) => set("linkType", v)} />
      <TextField id="tt-event-jql" label="Event JQL" value={draft.eventJql} onChange={(v) => set("eventJql", v)} />
      <TextField id="tt-scenario-jql" label="Scenario test JQL" value={draft.scenarioJql} onChange={(v) => set("scenarioJql", v)} />
      <TextField id="tt-route-field" label='Route field ("component" or customfield_NNNNN)' value={draft.routeField} onChange={(v) => set("routeField", v)} />
      <Inline space="space.200" shouldWrap>
        <TextField id="tt-tau" label="τ (match threshold)" value={draft.tau} onChange={(v) => set("tau", v)} />
        <TextField id="tt-k" label="k (neighbours)" value={draft.k} onChange={(v) => set("k", v)} />
        <TextField id="tt-calibration" label="Calibration window (days)" value={draft.calibrationWindowDays} onChange={(v) => set("calibrationWindowDays", v)} />
      </Inline>
      <Box>
        <Label labelFor="tt-fallback-role">Fallback project role (routing)</Label>
        <Select
          id="tt-fallback-role"
          name="tt-fallback-role"
          options={roleOptions}
          value={roleOptions.find((o) => o.value === draft.fallbackProjectRoleId) ?? opt(draft.fallbackProjectRoleId)}
          onChange={(o: unknown) => set("fallbackProjectRoleId", optionValue(o) ?? "")}
        />
      </Box>
      <ThresholdFields title="Takeover-type rule thresholds" prefix="rule" values={draft.ruleThresholds} onChange={(v) => set("ruleThresholds", v)} />
      <ThresholdFields title="Image chip thresholds" prefix="chip" values={draft.chipThresholds} onChange={(v) => set("chipThresholds", v)} />
      {showStagingTools && (
        <Box>
          <Toggle id="tt-simulate-twg" label="Simulate TWG error" isChecked={draft.simulateTwgError} onChange={(e) => set("simulateTwgError", e.target.checked === true)} />
          <Text size="small">Staging only. Forces a simulated Teamwork Graph error so the routing fallback can be shown; anything shown with it on is simulated.</Text>
        </Box>
      )}
      <Inline space="space.100" alignBlock="center">
        <Button appearance="primary" isDisabled={busy} onClick={() => void save()}>
          Save settings
        </Button>
        {busy && <Spinner label="Saving" />}
        {saved !== null && <Text>{saved}</Text>}
      </Inline>
      {problems.length > 0 && (
        <SectionMessage appearance="error" title="Fix these first">
          {problems.map((p) => (
            <Text key={p}>{p}</Text>
          ))}
        </SectionMessage>
      )}
      {error !== null && <ErrorBox error={error} title="Settings were not saved" />}
    </Stack>
  );
}

function ThresholdFields({ title, prefix, values, onChange }: { readonly title: string; readonly prefix: string; readonly values: Record<string, string>; readonly onChange: (v: Record<string, string>) => void }) {
  const keys = Object.keys(values).sort();
  if (keys.length === 0) return null;
  return (
    <Stack space="space.050">
      <Text as="strong">{title}</Text>
      <Inline space="space.150" shouldWrap>
        {keys.map((k) => (
          <TextField key={k} id={`tt-${prefix}-${k}`} label={k} value={values[k] ?? ""} onChange={(v) => onChange({ ...values, [k]: v })} />
        ))}
      </Inline>
    </Stack>
  );
}

// ------------------------------------------------------------------ team mapping

type TargetKind = "team" | "component" | "role";

/** One-line description of a routing rule, as the admin entered it. */
export function ruleText(rule: RoutingRuleInput, state: Pick<AdminState, "components" | "roles">): string {
  const list = (v: string | readonly string[] | undefined): string => (v === undefined ? "any" : typeof v === "string" ? v : v.join(" or "));
  const when = `type ${list(rule.match.type)}, variant ${list(rule.match.variant)}${rule.match.component !== undefined ? `, component ${list(rule.match.component)}` : ""}`;
  const t = rule.team;
  const target =
    t.teamAri !== undefined
      ? `team ${t.label ?? t.teamAri}`
      : t.componentId !== undefined
        ? `component ${state.components.find((c) => c.id === t.componentId)?.name ?? t.componentId}`
        : t.projectRoleId !== undefined
          ? `project role ${state.roles.find((r) => r.id === t.projectRoleId)?.name ?? t.projectRoleId}`
          : "no target";
  return `When ${when} → ${target}`;
}

function TeamMappingSection({ call, projectKey, state, onSaved }: { readonly call: Caller; readonly projectKey: string; readonly state: AdminState; readonly onSaved: (c: ProjectConfigView) => void }) {
  const [rules, setRules] = useState<readonly RoutingRuleInput[]>(state.config.routing);
  const [type, setType] = useState("");
  const [variant, setVariant] = useState("");
  const [kind, setKind] = useState<TargetKind>("component");
  const [target, setTarget] = useState("");
  const [label, setLabel] = useState("");
  const [teams, setTeams] = useState<{ readonly status: string; readonly message: string; readonly teams: readonly { ari: string; name: string }[] } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRules(state.config.routing), [state.config.routing]);

  const findTeams = async (): Promise<void> => {
    setBusy(true);
    const r = await call("listMyTeams", {});
    setBusy(false);
    if (r.ok) setTeams(r.data);
    else setError(r.error);
  };

  const add = (): void => {
    if (target === "") return;
    const teamName = label.trim() !== "" ? label.trim() : teams?.teams.find((t) => t.ari === target)?.name;
    const team: RoutingRuleInput["team"] =
      kind === "team"
        ? { teamAri: target, ...(teamName !== undefined ? { label: teamName } : {}) }
        : kind === "component"
          ? { componentId: target }
          : { projectRoleId: target };
    const match: RoutingRuleInput["match"] = { ...(type !== "" ? { type } : {}), ...(variant.trim() !== "" ? { variant: variant.trim() } : {}) };
    setRules([...rules, { match, team }]);
    setTarget("");
    setLabel("");
    setSaved(null);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await call("saveProjectConfig", { projectKey, config: { routing: rules } });
    setBusy(false);
    if (r.ok) {
      onSaved(r.data);
      setSaved("Team mapping saved.");
    } else setError(r.error);
  };

  const kindOptions = [opt("component", "Component (its lead)"), opt("role", "Project role"), opt("team", "Atlassian team (Teamwork Graph)")];
  const typeOptions = [opt("", "Any type"), ...TAKEOVER_TYPE_OPTIONS.map((t) => opt(t))];
  const targetOptions =
    kind === "component" ? state.components.map((c) => opt(c.id, c.name)) : kind === "role" ? state.roles.map((r) => opt(r.id, r.name)) : (teams?.teams ?? []).map((t) => opt(t.ari, t.name));

  return (
    <Stack space="space.150">
      <Heading size="small">Team mapping</Heading>
      <Text>Rules are checked in order; the first match suggests the owner. If a Teamwork Graph team cannot be resolved, routing falls back to the component lead, then the project role.</Text>
      {rules.length === 0 ? (
        <Text>No rules yet.</Text>
      ) : (
        rules.map((r, i) => (
          <Inline key={`${i}:${ruleText(r, state)}`} space="space.100" alignBlock="center">
            <Text>
              {i + 1}. {ruleText(r, state)}
            </Text>
            <Button appearance="subtle" onClick={() => setRules(rules.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </Inline>
        ))
      )}
      <Inline space="space.150" shouldWrap alignBlock="end">
        <Box>
          <Label labelFor="tt-rule-type">Takeover type</Label>
          <Select id="tt-rule-type" name="tt-rule-type" options={typeOptions} value={typeOptions.find((o) => o.value === type)} onChange={(o: unknown) => setType(optionValue(o) ?? "")} />
        </Box>
        <TextField id="tt-rule-variant" label="Sensor variant (optional)" value={variant} onChange={setVariant} />
        <Box>
          <Label labelFor="tt-rule-kind">Route to</Label>
          <Select
            id="tt-rule-kind"
            name="tt-rule-kind"
            options={kindOptions}
            value={kindOptions.find((o) => o.value === kind)}
            onChange={(o: unknown) => {
              const v = optionValue(o);
              if (v === "team" || v === "component" || v === "role") {
                setKind(v);
                setTarget("");
              }
            }}
          />
        </Box>
        {targetOptions.length > 0 && (
          <Box>
            <Label labelFor="tt-rule-target">Target</Label>
            <Select id="tt-rule-target" name="tt-rule-target" options={targetOptions} value={targetOptions.find((o) => o.value === target) ?? null} onChange={(o: unknown) => setTarget(optionValue(o) ?? "")} />
          </Box>
        )}
      </Inline>
      {kind === "team" && (
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Button isDisabled={busy} onClick={() => void findTeams()}>
              Find my teams
            </Button>
            {teams !== null && <Text size="small">{teams.status === "ok" ? teams.message : `Teamwork Graph: ${teams.status}. ${teams.message}`}</Text>}
          </Inline>
          <TextField id="tt-rule-team-ari" label="…or paste a team ARI" value={target} onChange={setTarget} />
          <TextField id="tt-rule-team-label" label="Team name shown in suggestions (optional)" value={label} onChange={setLabel} />
        </Stack>
      )}
      <Inline space="space.100" alignBlock="center">
        <Button isDisabled={target === ""} onClick={add}>
          Add rule
        </Button>
        <Button appearance="primary" isDisabled={busy} onClick={() => void save()}>
          Save team mapping
        </Button>
        {saved !== null && <Text>{saved}</Text>}
      </Inline>
      {error !== null && <ErrorBox error={error} title="Team mapping" />}
    </Stack>
  );
}

// ------------------------------------------------------------------ diagnostics

function DiagnosticsSection({ call, projectKey, initial }: { readonly call: Caller; readonly projectKey: string; readonly initial: DiagnosticsView | null }) {
  const [view, setView] = useState<DiagnosticsView | null>(initial);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setView(initial), [initial]);

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    const r = await call("runDiagnostics", { projectKey });
    setBusy(false);
    if (r.ok) setView(r.data);
    else setError(r.error);
  };

  return (
    <Stack space="space.100">
      <Heading size="small">Diagnostics</Heading>
      <Text>Checks each platform dependency separately and says what happens if it is missing.</Text>
      <Inline space="space.100" alignBlock="center">
        <Button isDisabled={busy} onClick={() => void run()}>
          Run diagnostics
        </Button>
        {busy && <Spinner label="Running diagnostics" />}
        {view !== null && <Text size="small">Last run {view.ranAt}</Text>}
      </Inline>
      {view !== null && (
        <DynamicTable
          caption="Diagnostics"
          head={{
            cells: [
              { key: "check", content: "Check" },
              { key: "status", content: "Status" },
              { key: "consequence", content: "What it means" },
            ],
          }}
          rows={view.checks.map((c) => ({
            key: c.id,
            cells: [
              { key: "check", content: c.label },
              { key: "status", content: <Lozenge appearance={DIAGNOSTIC_LABELS[c.status].appearance}>{DIAGNOSTIC_LABELS[c.status].text}</Lozenge> },
              { key: "consequence", content: `${c.consequence}${c.detail !== undefined ? ` (${c.detail})` : ""}${c.spike !== undefined ? ` [${c.spike}]` : ""}` },
            ],
          }))}
        />
      )}
      {error !== null && <ErrorBox error={error} title="Diagnostics" />}
    </Stack>
  );
}
