/**
 * Event view of the issue panel: result card (match / ambiguous / novel / first-of-kind /
 * accepted) with confidence, the signal plot + chips, the top-3 neighbours side by side on the
 * same axes plus an overlay, the why-table, Accept / Split / Route / Undo, triage history, and
 * the lazy re-processing state (§7.5).
 */
import Button from "@atlaskit/button/new";
import {
  ConditionChips,
  ConfidenceBadge,
  Disclaimer,
  EvidenceLink,
  EvidenceList,
  IssueLink,
  Notice,
  OverlayPlot,
  Section,
  SignalPlot,
  StatusToast,
  SyntheticBadge,
  WhyTable,
  colors,
  displayChannels,
  font,
  formatInstant,
  formatNumber,
  sharedDomain,
  space,
  type Domain,
} from "@tt/ui-shared";
import { useState } from "react";
import type { ClusterRef, ExplainView, MatchView, PanelEventView, TriageActionResult, TtClient } from "../../common/api.js";
import { Card, Muted, Row, TextField } from "../../common/ui.js";
import { RouteFlow } from "./Route.js";

const RESULT_TITLE: Readonly<Record<MatchView["result"], string>> = {
  match: "Matches a cluster",
  ambiguous: "Ambiguous: two clusters are close",
  novel: "Proposed new cluster",
  "first-of-kind": "First of its kind in this bucket",
  accepted: "Accepted",
};

/** Cluster Accept would link to: the match, else the nearest alternative (human decides). */
export function acceptCandidates(match: MatchView): readonly ClusterRef[] {
  if (match.result === "accepted") return [];
  const out: ClusterRef[] = [];
  if (match.cluster !== undefined) out.push(match.cluster);
  for (const a of match.alternatives) if (!out.some((c) => c.key === a.key)) out.push(a);
  return out;
}

/** The cluster Route applies to: accepted or matched cluster. */
export function routeCluster(view: PanelEventView): string | undefined {
  return view.triage.clusterKey ?? (view.match.result === "accepted" || view.match.result === "match" ? view.match.cluster?.key : undefined);
}

interface Toast {
  readonly text: string;
  readonly tone: "success" | "error" | "info";
  readonly proposed?: readonly string[];
}

export function EventPanel({ view, client, issueKey, onChanged }: { readonly view: PanelEventView; readonly client: TtClient; readonly issueKey: string; readonly onChanged: () => void }) {
  const m = view.match;
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [splitName, setSplitName] = useState("");
  const candidates = acceptCandidates(m);
  const [picked, setChoice] = useState<string | undefined>(undefined);
  const choice = picked !== undefined && candidates.some((c) => c.key === picked) ? picked : candidates[0]?.key;
  const routeKey = routeCluster(view);

  const done = (r: TriageActionResult): void => {
    setToast({ text: r.summary, tone: "success", ...(r.proposedMembers.length > 0 ? { proposed: r.proposedMembers } : {}) });
    onChanged();
  };
  const run = async (name: string, f: () => Promise<{ ok: true; data: TriageActionResult } | { ok: false; error: { message: string } }>): Promise<void> => {
    setBusy(name);
    const r = await f();
    setBusy(null);
    if (r.ok) done(r.data);
    else setToast({ text: r.error.message, tone: "error" });
  };
  const accept = (clusterKey: string): Promise<void> => run("accept", () => client.call("acceptMatch", { issueKey, clusterKey }));
  const split = (): Promise<void> => run("split", () => client.call("splitEvent", { issueKey, ...(splitName.trim() !== "" ? { name: splitName.trim() } : {}) }));
  const undo = (): Promise<void> => run("undo", () => client.call("undoLast", { issueKey }));

  const neighbours = view.neighbourTelemetry.slice(0, 3);
  const all = [view.telemetry, ...neighbours];
  const channels = displayChannels(view.telemetry);
  const domains: Record<string, Domain> = Object.fromEntries(channels.map((c) => [c, sharedDomain(all, c)]));
  const ref = m.cluster ?? m.alternatives[0];

  return (
    <div>
      <Row>
        <SyntheticBadge show={m.event.synthetic} />
        {view.calibration !== null && (
          <span data-testid="tt-calibration" style={{ font: font.small, color: colors.warningText }}>
            Calibration: {view.calibration.chip} ({view.calibration.days} days)
          </span>
        )}
      </Row>
      {(view.index.reprocessed || view.index.outOfSync) && (
        <div data-testid="tt-reprocess" data-reprocessed={view.index.reprocessed ? "true" : "false"} data-out-of-sync={view.index.outOfSync ? "true" : "false"}>
          <Notice appearance={view.index.outOfSync ? "warning" : "information"} title={view.index.outOfSync ? "Index out of sync" : "Re-processed on open"}>
            <p style={{ margin: 0 }}>
              {view.index.reprocessed ? `This event was re-indexed now because ${view.index.reason ?? "its index row was missing or stale"}; a recluster of its bucket was queued.` : ""}
              {view.index.outOfSync ? " The Jira links differ from the index; the links are used. “Re-sync now” on the board repairs the rest." : ""}
            </p>
          </Notice>
        </div>
      )}
      {m.event.tampered && (
        <Notice appearance="warning" title="Signature recomputed">
          <p style={{ margin: 0 }}>The stored signature did not match the telemetry; the panel shows the values recomputed from the telemetry.</p>
        </Notice>
      )}

      <Card testId="tt-result-card">
        <div data-result={m.result} style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          <h2 style={{ font: "var(--ds-font-heading-small, normal 653 16px/20px sans-serif)", margin: 0 }}>{RESULT_TITLE[m.result]}</h2>
          <p style={{ margin: 0 }}>
            {m.message}
            {m.cluster !== undefined && (
              <>
                {" "}
                <EvidenceLink evidence={{ kind: "issue", key: m.cluster.key, url: m.cluster.url, label: `${m.cluster.name} (${m.cluster.key})` }} />
              </>
            )}
          </p>
          <Row>
            {m.result !== "first-of-kind" && <ConfidenceBadge confidence={m.confidence} />}
            <Muted>
              {m.event.type} · {m.event.variant} · build {m.event.build} · {formatInstant(m.event.occurredAt)}
              {m.dStar !== null && ` · d* ${formatNumber(m.dStar, 2)} vs τ ${formatNumber(m.tau, 2)}`}
            </Muted>
          </Row>
          {view.triage.state === "accepted" && (
            <p style={{ margin: 0, font: font.small }} data-testid="tt-triage-state">
              Accepted into {view.triage.clusterKey !== undefined ? <IssueLink issueKey={view.triage.clusterKey} /> : "a cluster"}
              {view.triage.by !== undefined && ` by ${view.triage.by}`}
              {view.triage.at !== undefined && ` at ${formatInstant(view.triage.at)}`}
              {view.triage.viaDemoSeed && " (accepted during demo seed)"}.
            </p>
          )}
          <EvidenceList evidence={m.evidence} />
        </div>
      </Card>

      <section aria-label="Triage actions" data-testid="tt-actions" style={{ display: "flex", flexDirection: "column", gap: space.s, margin: `${space.s} 0` }}>
        {candidates.length > 1 && m.result === "ambiguous" && (
          <fieldset style={{ border: `1px solid ${colors.border}`, borderRadius: 4, padding: space.s, margin: 0 }}>
            <legend style={{ font: font.small, color: colors.subtle }}>Accept into</legend>
            {candidates.map((c) => (
              <label key={c.key} style={{ display: "flex", gap: space.xs, alignItems: "center", font: font.body }}>
                <input type="radio" name="tt-accept-choice" value={c.key} checked={choice === c.key} onChange={() => setChoice(c.key)} />
                {c.name} ({c.key})
              </label>
            ))}
          </fieldset>
        )}
        <Row>
          {candidates.length > 0 && choice !== undefined && (
            <Button appearance="primary" onClick={() => void accept(choice)} isDisabled={busy !== null} testId="tt-accept">
              {m.result === "novel" ? `Accept into nearest (${choice}) anyway` : `Accept into ${choice}`}
            </Button>
          )}
          {m.result !== "accepted" && (
            <>
              <TextField id="tt-split-name" label="New cluster name (optional)" value={splitName} onChange={(e) => setSplitName(e.target.value)} maxLength={80} placeholder="deterministic name if empty" />
              <Button onClick={() => void split()} isDisabled={busy !== null} testId="tt-split">
                Split into new cluster
              </Button>
            </>
          )}
          {view.undo.available && (
            <Button appearance="warning" onClick={() => void undo()} isDisabled={busy !== null} testId="tt-undo">
              Undo {view.undo.action ?? "last action"}
            </Button>
          )}
        </Row>
        {view.undo.available && view.undo.summary !== undefined && <Muted>Undo reverts: {view.undo.summary}</Muted>}
        {routeKey !== undefined && <RouteFlow client={client} issueKey={issueKey} clusterKey={routeKey} onApplied={done} onError={(text) => setToast({ text, tone: "error" })} />}
        <p style={{ font: font.small, color: colors.subtle, margin: 0 }}>The app proposes; nothing is linked or changed until you click.</p>
      </section>
      <StatusToast message={toast?.text ?? null} tone={toast?.tone ?? "info"}>
        {toast?.proposed !== undefined && (
          <span style={{ font: font.small }}>
            Would also match (not linked):{" "}
            {toast.proposed.map((k, i) => (
              <span key={k}>
                {i > 0 ? ", " : ""}
                <IssueLink issueKey={k} />
              </span>
            ))}
          </span>
        )}
      </StatusToast>

      <Section title="Signal" testId="tt-signal-section">
        <div data-testid="tt-panel-plot">
          <SignalPlot series={view.telemetry} domains={domains} title={`Telemetry of ${view.telemetry.key}: 15 s before to 5 s after the takeover (t = 0)`} />
        </div>
        <div style={{ marginTop: space.s }}>
          <ConditionChips chips={view.chips} showRules caption emptyText="n/a (no frames decoded)" />
        </div>
        <p style={{ font: font.small, color: colors.subtlest, margin: `${space.xs} 0 0` }}>{view.imageNote}</p>
      </Section>

      {neighbours.length > 0 && (
        <Section title={`Nearest events (${neighbours.length})`} testId="tt-neighbours-plots">
          <p style={{ font: font.small, color: colors.subtle, margin: `0 0 ${space.s}` }}>Side by side on the same axes, aligned at the takeover (t = 0).</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: space.m }}>
            {all.map((s, i) => {
              const nb = i === 0 ? undefined : m.neighbours.find((n) => n.key === s.key);
              return (
                <figure key={s.key} style={{ margin: 0 }} data-testid={`tt-neighbour-${s.key}`}>
                  <figcaption style={{ font: font.small, marginBottom: space.xs }}>
                    {i === 0 ? <strong>{s.key} (this event)</strong> : <IssueLink issueKey={s.key} />}
                    {nb !== undefined && <Muted> · d {nb.d === null ? "∞" : formatNumber(nb.d, 2)} · {nb.clusterKey}</Muted>}
                  </figcaption>
                  <SignalPlot series={s} channels={channels} domains={domains} width={360} stripHeight={44} testId={`tt-neighbour-plot-${s.key}`} />
                </figure>
              );
            })}
          </div>
          <details style={{ marginTop: space.s }}>
            <summary style={{ cursor: "pointer", color: colors.link, font: font.small }}>Overlay on one plot</summary>
            <OverlayPlot event={view.telemetry} neighbours={neighbours} channels={channels} />
          </details>
        </Section>
      )}

      <Section title="Why this result" testId="tt-why-section">
        <WhyTable rows={m.why.length > 0 ? m.why : view.features} headlines={m.headlines} referenceLabel={ref !== undefined && m.why.length > 0 ? `Cluster ${ref.key}` : "Reference"} />
        {m.why.length === 0 && <Muted>No cluster to compare with yet: these are this event’s features.</Muted>}
        {m.alternatives.length > 0 && <ExplainOther client={client} issueKey={issueKey} clusters={m.alternatives} />}
      </Section>

      {view.thumbs.length > 0 && (
        <Section title="Frames (thumbnails)" level={3}>
          <Row>
            {view.thumbs.map((t, i) => (
              <img key={i} src={t.dataUri} width={t.w} height={t.h} alt={`Grayscale thumbnail of dashcam frame ${i + 1} (${t.w}×${t.h}) stored with the event`} style={{ borderRadius: 3, border: `1px solid ${colors.border}` }} />
            ))}
          </Row>
        </Section>
      )}

      <Section title="Record" level={3} testId="tt-record">
        {view.triage.history.length > 0 && (
          <ol style={{ margin: `0 0 ${space.s}`, paddingLeft: space.m, font: font.small }} data-testid="tt-history">
            {view.triage.history.map((h, i) => (
              <li key={`${i}-${h.at}`}>
                {h.action} by {h.by} at {formatInstant(h.at)}
                {h.clusterKey !== undefined && <> ({h.clusterKey})</>}
              </li>
            ))}
          </ol>
        )}
        <p style={{ font: font.small, color: colors.subtle, margin: 0 }} data-testid="tt-property-version">
          tt.event v{view.propertyVersion.v} · engine {view.propertyVersion.engine}
          {view.propertyVersion.engine !== view.propertyVersion.currentEngine && ` (current ${view.propertyVersion.currentEngine})`} · app {view.propertyVersion.app}
        </p>
        <EvidenceList evidence={view.attachments} label="Attachments" />
      </Section>
      {view.warnings.length > 0 && (
        <ul style={{ font: font.small, color: colors.warningText }}>
          {view.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <Disclaimer text={view.disclaimer} />
    </div>
  );
}

/** "Why not <other cluster>?" via `explainMatch` (US-10). */
function ExplainOther({ client, issueKey, clusters }: { readonly client: TtClient; readonly issueKey: string; readonly clusters: readonly ClusterRef[] }) {
  const [state, setState] = useState<{ key: string; view: ExplainView | null; error: string | null } | null>(null);
  const explain = async (clusterKey: string): Promise<void> => {
    setState({ key: clusterKey, view: null, error: null });
    const r = await client.call("explainMatch", { issueKey, clusterKey });
    setState({ key: clusterKey, view: r.ok ? r.data : null, error: r.ok ? null : r.error.message });
  };
  return (
    <div style={{ marginTop: space.s }} data-testid="tt-explain-other">
      <Row>
        {clusters.map((c) => (
          <Button key={c.key} appearance="subtle" onClick={() => void explain(c.key)} testId={`tt-explain-${c.key}`}>
            Compare with {c.name} ({c.key})
          </Button>
        ))}
      </Row>
      {state?.error !== null && state?.error !== undefined && <p style={{ color: colors.dangerText, font: font.small }}>{state.error}</p>}
      {state?.view !== null && state?.view !== undefined && (
        <Card testId="tt-explain-result">
          <p style={{ margin: `0 0 ${space.xs}` }}>{state.view.headline}</p>
          <p style={{ margin: `0 0 ${space.xs}`, font: font.small, color: colors.subtle }}>
            {state.view.bucketRule} · d_sig {formatNumber(state.view.dSig, 2)} + d_cond {formatNumber(state.view.dCond, 2)} = d {formatNumber(state.view.d, 2)} {state.view.decision === "within-tau" ? "≤" : ">"} τ {formatNumber(state.view.tau, 2)}
          </p>
          <WhyTable rows={state.view.why} referenceLabel={`Cluster ${state.view.cluster.key}`} conditionTerm={{ dCond: state.view.dCond, chipDifference: state.view.chipDifference }} testId="tt-explain-why" />
        </Card>
      )}
    </div>
  );
}
