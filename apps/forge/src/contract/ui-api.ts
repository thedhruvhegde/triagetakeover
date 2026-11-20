/**
 * The typed resolver contract between the Forge `ui-resolver` function and every UI surface
 * (Custom UI: board, panel, intake; UI Kit: admin, triage-now).
 *
 * - One method name per `invoke(name, payload)` call. Request and response types are plain
 *   JSON: no `undefined` inside arrays, no `Infinity` / `NaN` (non-finite numbers are sent as
 *   `null` or as the string `"∞"` where §10.3 says so), no Dates, no Maps.
 * - Every response is an {@link ApiResponse} envelope. The resolver never throws to the UI.
 * - Custom UI imports TYPES from this file (`import type { ... } from ".../contract/ui-api"`).
 *   The only runtime exports are {@link UI_METHODS} and {@link API_ERROR_CODES}; they have no
 *   dependencies, so importing them does not pull server code into a bundle.
 * - Identity always comes from the invocation context (never from a payload field), §14.
 * - Every recommendation (match, split proposal, route, onset verdict, coverage verdict, stub)
 *   carries `evidence` (issue keys with links), a `confidence` with its definition, and `why`.
 *
 * Intake protocol (create and attach modes, ARCHITECTURE §1.1, SPIKE-I2):
 *  1. `getIntakeContext` → issue type, thresholds, presets, known variants/builds.
 *  2. The browser (Web Worker) runs the engine `processEventFiles` on the picked files and
 *     shows the preview. Nothing is created before the user confirms.
 *  3. Create mode: the browser creates the issue with `requestJira` asUser
 *     (`POST /rest/api/3/issue`, labels incl. `tt-takeover`). If that is not possible, it calls
 *     `createTakeoverIssue` (same fields, created asUser by the resolver). Attach mode uses the
 *     issue in context and skips this step.
 *  4. Attachments (for humans only; the server never reads them back, D1): the browser uploads
 *     the ORIGINAL files with `requestJira` multipart (`X-Atlassian-Token: no-check`,
 *     SPIKE-I2 unverified). On failure it falls back to `uploadAttachment` once per file
 *     (base64, ≤ {@link UPLOAD_FALLBACK_MAX_BYTES} decoded bytes per file, because `invoke`
 *     payloads are limited to 500 KB). If that also fails, it continues without attachments;
 *     the result banner says "raw files not attached".
 *  5. The browser writes the returned attachment ids into `event.source.csv.attachmentId` /
 *     `event.source.frames[i].attachmentId` and calls `commitEvent` with the `tt.event` JSON,
 *     the optional `tt.thumbs` JSON and an {@link AttachmentReport}. The resolver re-validates
 *     the schema, recomputes the signature from the telemetry (D2), writes the properties
 *     asUser, updates the index, matches synchronously and returns a {@link MatchView}.
 */

// ------------------------------------------------------------------ envelope

export const API_ERROR_CODES = [
  "invalid-input",
  "forbidden-or-not-found",
  "not-configured",
  "conflict",
  "property-too-large",
  "rate-limited",
  "unavailable",
  "not-implemented",
  "error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorDetail {
  /** Dotted input path, e.g. `event.sig.features.F3`; absent for whole-request problems. */
  readonly path?: string;
  readonly message: string;
}

export interface ApiError {
  readonly code: ApiErrorCode;
  /** Plain-language, safe to show. Never says whether a hidden issue exists (§10.3). */
  readonly message: string;
  /** True when retrying later may succeed (rate limit, outage). */
  readonly retryable: boolean;
  readonly details?: readonly ApiErrorDetail[];
}

export type ApiResponse<T> =
  | { readonly ok: true; readonly data: T; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: ApiError };

// ------------------------------------------------------------------ shared building blocks

export type EvidenceKind = "issue" | "attachment" | "property" | "driveSessions" | "scenario" | "jql" | "rule";

/** A link to the data a statement is based on (§10.3 `evidence`). `url` is site-relative. */
export interface Evidence {
  readonly kind: EvidenceKind;
  readonly key?: string;
  readonly id?: string;
  /** Site-relative, e.g. `/browse/TTDEMO-12`. Custom UI opens it with `router.navigate`. */
  readonly url: string;
  readonly label: string;
}

/** A confidence value always travels with its definition and inputs (PRD US-09 AC4). */
export interface Confidence {
  /** 0..1. */
  readonly value: number;
  readonly definition: string;
  readonly inputs?: Readonly<Record<string, number>>;
}

/** One row of the why-table (§5.7). */
export interface WhyRowView {
  /** `F1`..`F10`. */
  readonly feature: string;
  /** Descriptive key, e.g. `peakLatOffset`. */
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly eventValue: number | null;
  readonly referenceValue: number | null;
  readonly z: number | null;
  /** Share of the signal distance, 0..1 (sums to 1 over present features); null when n/a. */
  readonly contribution: number | null;
  /** e.g. "n/a (channel not mapped)", "clamped". */
  readonly note: string;
}

export type ConditionChipName = "night" | "low-sun-glare" | "blur-rain" | "normal";
export type TakeoverTypeName = "cut-in-response" | "late-brake" | "phantom-brake" | "lane-loss" | "lateral-drift" | "unknown";

/** §10.3 `clusterRef`. */
export interface ClusterRef {
  readonly key: string;
  readonly id: string;
  readonly name: string;
  /** `"<type>|<variant>"`. */
  readonly bucket: string;
  readonly memberCount: number;
  readonly url: string;
}

export interface EventSummary {
  readonly key: string;
  readonly id: string;
  readonly type: TakeoverTypeName;
  readonly variant: string;
  readonly build: string;
  readonly bucket: string;
  readonly chips: readonly ConditionChipName[];
  /** ISO-8601. */
  readonly occurredAt: string;
  readonly vehicleId: string;
  readonly synthetic: boolean;
  /** The stored signature differed from the one recomputed from telemetry (§6.1 integrity). */
  readonly tampered: boolean;
  /** Engine version the stored property was computed with. */
  readonly engine: string;
}

export interface Neighbour {
  readonly key: string;
  /** null when the distance is +∞ (insufficient feature overlap). */
  readonly d: number | null;
  readonly clusterKey: string;
}

// ------------------------------------------------------------------ match / triage

export type MatchResultKind = "match" | "ambiguous" | "novel" | "first-of-kind" | "accepted";

/**
 * Result of matching one event (§5.8 step 2), used by the panel, "Triage now" and intake.
 * `accepted` means a human already linked it; `cluster` is then that cluster.
 */
export interface MatchView {
  readonly event: EventSummary;
  readonly result: MatchResultKind;
  readonly cluster?: ClusterRef;
  /** The runner-up when ambiguous; the nearest cluster when novel. */
  readonly alternatives: readonly ClusterRef[];
  readonly dStar: number | null;
  readonly tau: number;
  readonly confidence: Confidence;
  readonly neighbours: readonly Neighbour[];
  /** Event vs the cluster profile (the matched one, the nearest one when novel). Empty for first-of-kind. */
  readonly why: readonly WhyRowView[];
  /** Deterministic rule texts, e.g. "Bucket: lane-loss x cam-B", "Nearest: TTDEMO-5 d=0.21 < τ=1.00". */
  readonly headlines: readonly string[];
  readonly evidence: readonly Evidence[];
  /** Plain-language state for the card, e.g. "Proposed new cluster", "First of its kind in this bucket". */
  readonly message: string;
}

export interface ExplainView {
  readonly event: EventSummary;
  readonly cluster: ClusterRef;
  readonly bucketRule: string;
  readonly sameBucket: boolean;
  readonly dSig: number | null;
  readonly dCond: number;
  readonly d: number | null;
  readonly tau: number;
  readonly decision: "within-tau" | "exceeds-tau";
  readonly topContributors: readonly string[];
  readonly chipDifference: readonly ConditionChipName[];
  readonly why: readonly WhyRowView[];
  readonly headline: string;
  readonly evidence: readonly Evidence[];
  readonly confidence: Confidence;
}

export interface TriageActionResult {
  readonly action: "accept" | "split" | "route" | "undo";
  /** What was written, in plain language (shown and announced, US-19 AC3). */
  readonly summary: string;
  readonly created: boolean;
  readonly alreadyDone: boolean;
  readonly cluster?: ClusterRef;
  readonly link?: { readonly id: string; readonly type: string; readonly inward: string; readonly outward: string };
  /** Split: unassigned events of the bucket that would now match the new cluster (NOT linked). */
  readonly proposedMembers: readonly string[];
  readonly nameSource?: "user" | "deterministic";
  readonly undoAvailable: boolean;
  readonly evidence: readonly Evidence[];
}

// ------------------------------------------------------------------ routing

export type RouteSourceName = "twg" | "component" | "project-role" | "none";
export type TwgStatusName = "ok" | "empty" | "error" | "skipped";

export interface RouteHop {
  readonly step: "twg" | "component" | "project-role";
  readonly ref: string;
  readonly outcome: string;
  readonly detail: string;
}

export interface RouteView {
  readonly clusterKey: string;
  readonly rule: { readonly index: number; readonly text: string };
  readonly source: RouteSourceName;
  readonly team?: { readonly name: string; readonly ref: string; readonly source: Exclude<RouteSourceName, "none"> };
  readonly contact?: { readonly accountId: string; readonly displayName?: string; readonly source: Exclude<RouteSourceName, "none"> };
  /** TWG members (UI only; never returned through actions or MCP, D8). */
  readonly members?: readonly { readonly accountId: string; readonly displayName?: string }[];
  readonly twgStatus: TwgStatusName;
  readonly hops: readonly RouteHop[];
  readonly fallbackReason?: string;
  /** e.g. "Rule #1 (type = lane-loss -> Perception) matched; owner from component lead". */
  readonly why: readonly string[];
  readonly confidence: Confidence;
  readonly evidence: readonly Evidence[];
  /** What "Route" would write (component id or field), so the UI can confirm it. */
  readonly applies?: { readonly componentId?: string; readonly fieldId?: string };
}

// ------------------------------------------------------------------ onset

export type OnsetVerdictName = "regression-likely" | "inconclusive" | "no-evidence" | "not-enough-data";

/** §10.3 `onset` plus presentation fields. */
export interface OnsetView {
  readonly verdict: OnsetVerdictName;
  readonly onsetBuild: string | null;
  readonly k1: number;
  readonly e1Km: number;
  readonly k2: number;
  readonly e2Km: number;
  readonly ratePer1000kmBefore: number | null;
  readonly ratePer1000kmAfter: number | null;
  /** `"∞"` when there were no events before the boundary. */
  readonly rateRatio: number | "∞" | null;
  readonly rrCi95: readonly [number | "∞", number | "∞"] | null;
  readonly pRaw: number | null;
  readonly pScan: number | null;
  readonly pHolm: number | null;
  readonly holmFamilySize: number;
  readonly boundariesTested: number;
  readonly exposureFilter: string;
  readonly buildsWithoutExposure: readonly string[];
  readonly builds: readonly { readonly build: string; readonly events: number; readonly km: number }[];
  readonly headline: string;
  /** Present for not-enough-data, e.g. "Exposure unknown. Add drive sessions." */
  readonly message?: string;
  readonly caveats: readonly string[];
  readonly confidence: Confidence;
  readonly evidence: readonly Evidence[];
}

// ------------------------------------------------------------------ coverage

export interface ConditionSignatureView {
  readonly type: TakeoverTypeName;
  readonly variant: string;
  readonly chips: readonly ConditionChipName[];
  readonly odd: readonly string[];
  /** e.g. `lane-loss x low-sun-glare x cam-B x highway`. */
  readonly text: string;
}

export interface CoverageView {
  /** `no-scenario-tests`: the JQL found nothing (US-13 AC4); `jql-error`: the JQL was rejected. */
  readonly state: "ok" | "no-scenario-tests" | "jql-error";
  readonly verdict: "covered" | "partial" | "uncovered" | null;
  readonly signature: ConditionSignatureView;
  readonly tests: readonly string[];
  readonly missing: readonly string[];
  /** Deterministic sentence (engine), or "No scenario tests found (looked for: <JQL>)". */
  readonly text: string;
  readonly scenarioJql: string;
  readonly confidence: Confidence;
  readonly evidence: readonly Evidence[];
}

export interface GapGridView {
  readonly columns: readonly TakeoverTypeName[];
  readonly rows: readonly {
    readonly dimension: "cond" | "odd";
    readonly value: string;
    readonly cells: readonly { readonly type: TakeoverTypeName; readonly events: number; readonly tests: number; readonly gap: boolean }[];
  }[];
}

export interface ScenarioStubView {
  readonly clusterKey: string;
  readonly summary: string;
  readonly labels: readonly string[];
  readonly description: string;
  readonly linkedEvents: readonly string[];
  readonly narrativeSource: "template";
  /** Present after `createScenarioStub`. */
  readonly created?: { readonly key: string; readonly id: string; readonly url: string };
  /** True when `createScenarioStub` found an existing stub for this cluster and wrote nothing. */
  readonly reused?: boolean;
  readonly evidence: readonly Evidence[];
  readonly confidence: Confidence;
  readonly why: readonly string[];
}

// ------------------------------------------------------------------ board

export interface OwnerHint {
  readonly ruleIndex: number;
  readonly ruleText: string;
  /** Label of the rule's team ref; resolving people happens in `suggestOwner`. */
  readonly team: string;
}

export interface BoardClusterRow {
  readonly cluster: ClusterRef;
  readonly type: TakeoverTypeName;
  readonly variant: string;
  readonly conditions: readonly ConditionChipName[];
  readonly buildsSeen: readonly string[];
  readonly acceptedCount: number;
  /** Accepted members plus pending suggestions that occurred after the last "Mark triaged". */
  readonly newSinceTriage: number;
  /** Unassigned events the engine suggests for this cluster (not linked). */
  readonly pendingSuggestions: readonly string[];
  readonly onset: OnsetView;
  readonly coverage: CoverageView;
  readonly owner: OwnerHint | null;
  readonly status: string;
  readonly medoidKey: string | null;
}

export interface NovelQueueItem {
  readonly event: EventSummary;
  readonly reason: "exceeds-tau" | "first-of-kind";
  readonly nearestCluster?: ClusterRef;
  readonly dStar: number | null;
  readonly tau: number;
  readonly message: string;
  readonly evidence: readonly Evidence[];
}

export interface ProposedGroup {
  /** Deterministic id: the smallest member key. */
  readonly id: string;
  readonly bucket: string;
  readonly name: string;
  readonly members: readonly string[];
  readonly why: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly confidence: Confidence;
}

export interface ResyncStatus {
  readonly projectKey: string;
  readonly state: "idle" | "pending" | "running" | "done" | "failed";
  readonly requestedBy?: string;
  readonly requestedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly phase?: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly message?: string;
}

export interface BoardView {
  readonly projectKey: string;
  /** No indexed events: show "File a takeover" and "Load demo data" (US-02 AC2). */
  readonly empty: boolean;
  readonly clusters: readonly BoardClusterRow[];
  readonly novel: readonly NovelQueueItem[];
  readonly proposedGroups: readonly ProposedGroup[];
  readonly unassignedCount: number;
  readonly sinceLastTriage: { readonly at: string | null; readonly by: string | null; readonly newEvents: number; readonly source: "mark-triaged" | "none" };
  readonly gapGrid: GapGridView;
  readonly scenarioJql: string;
  readonly scenarioCount: number;
  readonly holmFamilySize: number;
  readonly resync: ResyncStatus;
  readonly totals: { readonly events: number; readonly accepted: number; readonly proposed: number; readonly novel: number; readonly clusters: number };
  readonly synthetic: boolean;
  readonly caveats: readonly string[];
  readonly disclaimer: string;
  readonly builtAt: string;
}

// ------------------------------------------------------------------ panel

export interface TelemetrySeries {
  readonly key: string;
  readonly hz: number;
  readonly tStart: number;
  /** Channel → samples (null where the codec stored NaN / masked). */
  readonly channels: Readonly<Record<string, readonly (number | null)[]>>;
}

export interface ChipView {
  readonly chip: ConditionChipName;
  /** e.g. "sunBlob 0.009 >= 0.004". */
  readonly rules: readonly string[];
}

export interface TriageHistoryEntry {
  readonly action: string;
  readonly by: string;
  readonly at: string;
  readonly clusterKey?: string;
}

export interface PanelEventView {
  readonly kind: "event";
  readonly match: MatchView;
  readonly features: readonly WhyRowView[];
  readonly chips: readonly ChipView[];
  readonly imageNote: string;
  readonly telemetry: TelemetrySeries;
  /** Top-3 neighbours on the same axes (US-10 AC2); may be fewer. */
  readonly neighbourTelemetry: readonly TelemetrySeries[];
  readonly thumbs: readonly { readonly w: number; readonly h: number; readonly dataUri: string }[];
  readonly triage: { readonly state: "accepted" | "rejected" | "none"; readonly clusterKey?: string; readonly by?: string; readonly at?: string; readonly viaDemoSeed: boolean; readonly history: readonly TriageHistoryEntry[] };
  readonly undo: { readonly available: boolean; readonly action?: string; readonly summary?: string };
  /** Lazy re-processing (§7.5): what happened on this open. */
  readonly index: { readonly reprocessed: boolean; readonly reason?: string; readonly outOfSync: boolean };
  readonly calibration: { readonly chip: string; readonly days: number } | null;
  readonly propertyVersion: { readonly v: number; readonly engine: string; readonly app: string; readonly currentEngine: string };
  readonly attachments: readonly Evidence[];
  readonly warnings: readonly string[];
  readonly disclaimer: string;
}

export interface PanelClusterView {
  readonly kind: "cluster";
  readonly cluster: ClusterRef;
  readonly members: readonly EventSummary[];
  readonly pendingSuggestions: readonly string[];
  readonly onset: OnsetView;
  readonly coverage: CoverageView;
  readonly owner: OwnerHint | null;
  readonly disclaimer: string;
}

export interface PanelNoDataView {
  readonly kind: "no-signal-data";
  readonly issueKey: string;
  /** "No signal data." (US-13 AC1). The UI offers "Add telemetry". */
  readonly message: string;
}

export interface PanelInvalidView {
  readonly kind: "invalid-signal-data";
  readonly issueKey: string;
  readonly message: string;
  readonly errors: readonly ApiErrorDetail[];
}

export type PanelView = PanelEventView | PanelClusterView | PanelNoDataView | PanelInvalidView;

// ------------------------------------------------------------------ intake

export interface AttachmentReport {
  readonly via: "browser" | "backend" | "none";
  readonly status: "uploaded" | "failed" | "skipped";
  readonly error?: string;
}

export interface IntakeContext {
  readonly projectKey: string;
  readonly issueKey?: string;
  readonly mode: "create" | "attach";
  readonly eventIssueType: string;
  readonly labels: readonly string[];
  readonly presets: readonly { readonly id: string; readonly preset: unknown }[];
  readonly ruleThresholds: Readonly<Record<string, number>>;
  readonly chipThresholds: Readonly<Record<string, number>>;
  readonly knownVariants: readonly string[];
  readonly knownBuilds: readonly string[];
  readonly limits: { readonly csvMaxBytes: number; readonly framesMax: number; readonly uploadFallbackMaxBytes: number; readonly propertyMaxBytes: number };
  readonly existingEvent: boolean;
}

export interface CommitResult {
  readonly issueKey: string;
  readonly propertyBytes: { readonly event: number; readonly thumbs: number | null };
  readonly recomputed: boolean;
  readonly match: MatchView;
  readonly attachments: AttachmentReport;
}

// ------------------------------------------------------------------ admin

export interface RoutingRuleInput {
  readonly match: { readonly type?: string | readonly string[]; readonly component?: string | readonly string[]; readonly variant?: string | readonly string[] };
  readonly team: { readonly teamAri?: string; readonly componentId?: string; readonly projectRoleId?: string; readonly label?: string };
}

export interface ProjectConfigView {
  readonly projectKey: string;
  readonly enabled: boolean;
  readonly eventIssueType: string;
  readonly clusterIssueType: string;
  readonly scenarioIssueType: string;
  readonly eventJql: string;
  readonly scenarioJql: string;
  readonly tau: number;
  readonly k: number;
  readonly linkType: string;
  readonly routeField: string;
  readonly routing: readonly RoutingRuleInput[];
  readonly buildOrder: "semver" | readonly string[];
  readonly calibrationWindowDays: number;
  readonly fallbackProjectRoleId: string;
  /** Staging-only "Simulate TWG error" (§11); the UI captions any use as simulated. */
  readonly simulateTwgError: boolean;
  /** Takeover-type rule thresholds (§5.4), e.g. `llLaneConf`. */
  readonly ruleThresholds: Readonly<Record<string, number>>;
  /** Image chip thresholds (§5.5), e.g. `sunBlobAtLeast`. */
  readonly chipThresholds: Readonly<Record<string, number>>;
  readonly params: string;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

export type DiagnosticStatus = "pass" | "fail" | "unknown" | "skipped";

export interface DiagnosticCheck {
  readonly id: string;
  readonly label: string;
  readonly status: DiagnosticStatus;
  /** Plain-language consequence, e.g. "TWG unavailable: routing uses project components". */
  readonly consequence: string;
  readonly detail?: string;
  readonly spike?: string;
}

export interface DiagnosticsView {
  readonly ranAt: string;
  readonly checks: readonly DiagnosticCheck[];
}

export interface AdminState {
  readonly config: ProjectConfigView;
  readonly projects: readonly string[];
  readonly resync: ResyncStatus;
  readonly diagnostics: DiagnosticsView | null;
  readonly components: readonly { readonly id: string; readonly name: string; readonly leadAccountId?: string }[];
  readonly roles: readonly { readonly id: string; readonly name: string }[];
  readonly issueTypes: readonly string[];
}

export interface SeedJobView {
  readonly jobId: string;
  readonly state: string;
  readonly step: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
  readonly seed: number;
  // Progress detail (always sent by `services/seed`, optional so a UI renders a bare view too).
  readonly projectKey?: string;
  readonly stepLabel?: string;
  /** 0-based index of the current step and the chain length (progress bar). */
  readonly stepIndex?: number;
  readonly stepCount?: number;
  readonly message?: string;
  readonly boardReady?: boolean;
  /** `uploading` = "raw files uploading"; `skipped` = SPIKE-I2 refused, thumbnails remain. */
  readonly attachments?: "pending" | "uploading" | "done" | "skipped";
  readonly warnings?: readonly string[];
  readonly startedAt?: string;
  readonly updatedAt?: string;
  readonly boardReadyAt?: string;
  readonly finishedAt?: string;
}

/** What to do when demo data already exists: report the conflict (default), keep it, or remove and reload. */
export type SeedStartMode = "start" | "keep" | "reset";

/** Admin-only seed report (ARCHITECTURE §9 step 6). Measures the engine against the SYNTHETIC generator only. */
export interface SeedReportView {
  readonly v: 1;
  readonly projectKey: string;
  readonly seed: number;
  readonly anchorDate: string;
  readonly frames: "full" | "fast";
  readonly profile: string;
  readonly generator: string;
  readonly paramsHash: string;
  readonly defaultSeed: number;
  readonly isDefaultSeed: boolean;
  readonly defaultSeedRule: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly planted: readonly { readonly role: string; readonly eventId: string; readonly issueKey: string | null }[];
  readonly accuracy: {
    readonly ariAll: number | null;
    readonly ariExcludingBoundary: number | null;
    readonly ariHistoryProposal: number | null;
    readonly events: number;
    readonly boundaryEvents: number;
    readonly latentClusters: number;
    readonly engineGroups: number;
    readonly note: string;
  };
  readonly attachments: "pending" | "uploading" | "done" | "skipped";
  readonly failedEvents: readonly string[];
  readonly timings: { readonly totalMs: number; readonly steps: Readonly<Record<string, { readonly runs: number; readonly ms: number }>> };
  readonly calls: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly honesty: readonly string[];
}

// ------------------------------------------------------------------ method map

/** Request (`req`) and response data (`res`) of every resolver method. */
export interface UiApi {
  // Board (project page)
  /** Cluster board: rows with onset + coverage, novel queue, proposed groups, gap grid, since-last-triage. */
  getBoard: { req: { projectKey: string }; res: BoardView };
  /** Sets "Mark triaged" (team-wide timestamp, US-12 AC3) to now. */
  markTriaged: { req: { projectKey: string }; res: { at: string; by: string } };
  /** "Re-sync now": enqueues the index rebuild (deduped while one is pending). */
  requestResync: { req: { projectKey: string }; res: ResyncStatus };
  /** Progress of the latest Re-sync (`resync:<projectKey>`). */
  getResyncStatus: { req: { projectKey: string }; res: ResyncStatus };
  /** Onset results for one cluster or every cluster whose onset is `build` (Holm across the board view). */
  buildRegressionCheck: { req: { projectKey: string; clusterKey?: string; build?: string }; res: { scope: "cluster" | "build"; results: readonly { cluster: ClusterRef; onset: OnsetView }[]; holmFamilySize: number } };

  // Panel + Triage now (issue)
  /** Issue panel: event view (lazy re-processing), cluster view, or the honest no-data state. */
  getPanel: { req: { issueKey: string }; res: PanelView };
  /** "Triage now": synchronous match with confidence, neighbours and why. */
  triageNow: { req: { issueKey: string }; res: MatchView };
  /** Why this event does or does not fit a cluster (default: best or accepted cluster). */
  explainMatch: { req: { issueKey: string; clusterKey?: string }; res: ExplainView };
  /** Accept: link event → cluster, record tt.triage, update the index. Idempotent. */
  acceptMatch: { req: { issueKey: string; clusterKey: string }; res: TriageActionResult };
  /** Split: new cluster issue seeded with this event; proposes (never links) others. */
  splitEvent: { req: { issueKey: string; name?: string }; res: TriageActionResult };
  /** Owner suggestion: rule → TWG team (asUser) → component lead → project role. */
  suggestOwner: { req: { clusterKey: string }; res: RouteView };
  /** Route: set the component (or configured field) on the cluster and comment the contact. */
  applyRoute: { req: { issueKey: string; clusterKey: string }; res: TriageActionResult };
  /** Undo the last Accept / Split / Route started from this issue's panel. */
  undoLast: { req: { issueKey: string }; res: TriageActionResult };

  // Coverage
  /** Template stub for a cluster's coverage gap, without creating anything (US-18 AC2 preview). */
  previewScenarioStub: { req: { clusterKey: string }; res: ScenarioStubView };
  /** Creates the stub issue (labels, tt.scenario, links to cluster + 3 representative events). */
  createScenarioStub: { req: { clusterKey: string }; res: ScenarioStubView };

  // Intake (create + attach modes)
  getIntakeContext: { req: { projectKey?: string; issueKey?: string }; res: IntakeContext };
  /** Fallback when the browser cannot create the issue itself (asUser). */
  createTakeoverIssue: { req: { projectKey: string; summary: string; description?: string }; res: { key: string; id: string; url: string } };
  /** SPIKE-I2 fallback: one original file as base64, uploaded asUser. */
  uploadAttachment: { req: { issueKey: string; filename: string; mimeType: string; dataBase64: string }; res: { attachmentId: string; filename: string; size: number } };
  /** Writes tt.event (+ tt.thumbs) after server-side verification, indexes and matches. */
  commitEvent: { req: { issueKey: string; event: unknown; thumbs?: unknown; attachments?: AttachmentReport }; res: CommitResult };
  /** Saves a column-mapping preset (`preset:<projectKey>:<id>`). */
  saveMappingPreset: { req: { projectKey: string; id: string; preset: unknown }; res: { id: string } };

  // Admin (UI Kit)
  getAdminState: { req: { projectKey: string }; res: AdminState };
  saveProjectConfig: { req: { projectKey: string; config: Partial<Omit<ProjectConfigView, "projectKey" | "params" | "updatedAt" | "updatedBy">> }; res: ProjectConfigView };
  /** Checks storage, property writes, JQL index, search properties, TWG hops, Rovo/MCP (unknown). */
  runDiagnostics: { req: { projectKey: string; issueKey?: string }; res: DiagnosticsView };
  /** TWG team picker for the routing config (asUser). Empty is "possibly a missing scope or no data". */
  listMyTeams: { req: Record<string, never>; res: { status: TwgStatusName | "not-permitted"; teams: readonly { ari: string; name: string }[]; message: string } };
  /** Demo seed (ARCHITECTURE §9): queues the `tt-seed` chain; `conflict` when demo data exists and no mode was chosen. */
  startSeed: { req: { projectKey: string; seed: number; mode?: SeedStartMode; frames?: "full" | "fast" }; res: SeedJobView };
  getSeedJob: { req: { jobId: string }; res: SeedJobView };
  /** Admin-only report of the last seed run (ARI vs the generator, timings, call counts, honesty notes). */
  getSeedReport: { req: { projectKey: string }; res: SeedReportView };
  removeDemoData: { req: { projectKey: string }; res: { removedIssues: number; removedRows: number } };
}

export type UiMethod = keyof UiApi;
export type UiRequest<M extends UiMethod> = UiApi[M]["req"];
export type UiResult<M extends UiMethod> = UiApi[M]["res"];

/** Every method name, in the order above. */
export const UI_METHODS = [
  "getBoard",
  "markTriaged",
  "requestResync",
  "getResyncStatus",
  "buildRegressionCheck",
  "getPanel",
  "triageNow",
  "explainMatch",
  "acceptMatch",
  "splitEvent",
  "suggestOwner",
  "applyRoute",
  "undoLast",
  "previewScenarioStub",
  "createScenarioStub",
  "getIntakeContext",
  "createTakeoverIssue",
  "uploadAttachment",
  "commitEvent",
  "saveMappingPreset",
  "getAdminState",
  "saveProjectConfig",
  "runDiagnostics",
  "listMyTeams",
  "startSeed",
  "getSeedJob",
  "getSeedReport",
  "removeDemoData",
] as const satisfies readonly UiMethod[];

/** Decoded size limit for one `uploadAttachment` call (base64 inflates by 4/3; invoke ≤ 500 KB). */
export const UPLOAD_FALLBACK_MAX_BYTES = 360 * 1024;

/** Disclaimer shown on the board and panel footer (§14). */
export const NOT_A_SAFETY_TOOL =
  "Takeover Triage surfaces evidence for engineers. It is not a safety tool and makes no safety or compliance claim.";
