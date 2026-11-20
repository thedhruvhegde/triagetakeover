/**
 * Cluster board (`jira:projectPage` "Takeover clusters", PRD US-12, US-14, US-17, US-18).
 *
 * Every number on this page comes from `getBoard` (the resolver computes onset and coverage);
 * the page itself only formats. Writes (Mark triaged, Re-sync now, scenario stub) need a click.
 */
import Button from "@atlaskit/button/new";
import {
  ApiErrorMessage,
  Notice,
  ConditionChips,
  ConfidenceBadge,
  Disclaimer,
  EvidenceLink,
  EvidenceList,
  GapGrid,
  IssueLink,
  Loading,
  OnsetBadge,
  Section,
  StateChip,
  state,
  StatusToast,
  SyntheticBadge,
  Warnings,
  colors,
  font,
  formatInstant,
  formatNumber,
  numericCell,
  plural,
  space,
  tableStyle,
  tdStyle,
  thStyle,
} from "@tt/ui-shared";
import { useState } from "react";
import type { BoardClusterRow, BoardView, CoverageView, NovelQueueItem, ProposedGroup } from "../../common/api.js";
import type { TtClient } from "../../common/api.js";
import { AppFrame, Muted, Row, useLoadable } from "../../common/ui.js";
import { ClusterDetails } from "./ClusterDetails.js";
import { ResyncControl } from "./Resync.js";

export interface BoardDeps {
  readonly client: TtClient;
  /** From the project page context; undefined when the context could not be read. */
  readonly projectKey: string | undefined;
  /** Opens the intake in a bridge Modal (SPIKE-C2). Resolves when it closes. */
  readonly openIntake: (projectKey: string) => Promise<"closed" | "unavailable">;
  /** Re-sync progress poll interval; tests use a small value. */
  readonly pollMs?: number;
}

export function BoardApp({ deps }: { readonly deps: BoardDeps }) {
  const { projectKey } = deps;
  if (projectKey === undefined) {
    return (
      <AppFrame label="Takeover clusters">
        <Notice appearance="warning" title="No project in context">
          <p>Open this page from a Jira project (Project › Takeover clusters).</p>
        </Notice>
      </AppFrame>
    );
  }
  return <Board deps={deps} projectKey={projectKey} />;
}

function Board({ deps, projectKey }: { readonly deps: BoardDeps; readonly projectKey: string }) {
  const { client } = deps;
  const board = useLoadable(() => client.call("getBoard", { projectKey }));
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [busy, setBusy] = useState<"triage" | "intake" | null>(null);

  const markTriaged = async (): Promise<void> => {
    setBusy("triage");
    const r = await client.call("markTriaged", { projectKey });
    setBusy(null);
    if (r.ok) {
      setToast({ text: `Marked triaged at ${formatInstant(r.data.at)}. New events are counted from now.`, tone: "success" });
      board.reload();
    } else setToast({ text: r.error.message, tone: "error" });
  };

  const fileTakeover = async (): Promise<void> => {
    setBusy("intake");
    const outcome = await deps.openIntake(projectKey);
    setBusy(null);
    if (outcome === "unavailable") {
      setToast({ text: "The intake dialog could not be opened here. Create the issue in Jira, then use the issue action “Add telemetry (Takeover Triage)”.", tone: "error" });
      return;
    }
    board.reload();
  };

  const v = board.value;
  return (
    <AppFrame label="Takeover clusters">
      <header style={{ display: "flex", flexWrap: "wrap", gap: space.m, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
          <h1 style={{ font: "normal 700 28px/32px var(--tt-font, sans-serif)", letterSpacing: "-0.02em", margin: 0, color: colors.text }}>Takeover clusters · {projectKey}</h1>
          {v.state === "ready" && <SyntheticBadge show={v.data.synthetic} />}
        </div>
        <Row>
          <Button appearance="primary" onClick={() => void fileTakeover()} isDisabled={busy === "intake"} testId="tt-file-takeover">
            File takeover
          </Button>
          <Button onClick={() => void markTriaged()} isDisabled={busy === "triage" || v.state !== "ready" || v.data.empty} testId="tt-mark-triaged">
            Mark triaged
          </Button>
          <ResyncControl client={client} projectKey={projectKey} initial={v.state === "ready" ? v.data.resync : null} pollMs={deps.pollMs ?? 2000} onDone={board.reload} onMessage={(text, tone) => setToast({ text, tone })} />
        </Row>
      </header>
      <StatusToast message={toast?.text ?? null} tone={toast?.tone ?? "info"} />
      {v.state === "loading" && <Loading label="Loading the cluster board…" />}
      {v.state === "error" && <ApiErrorMessage error={v.error} onRetry={board.reload} title="The board could not be loaded" />}
      {v.state === "ready" && (
        <>
          <Warnings warnings={v.warnings} />
          {v.data.empty ? <EmptyBoard onFile={() => void fileTakeover()} /> : <BoardBody board={v.data} client={client} onChanged={board.reload} />}
          <Disclaimer text={v.data.disclaimer} />
        </>
      )}
    </AppFrame>
  );
}

function EmptyBoard({ onFile }: { readonly onFile: () => void }) {
  return (
    <div data-testid="tt-board-empty" style={{ margin: `${space.l} 0` }}>
      <Notice appearance="information" title="No takeover events in this project yet">
        <p>Takeover Triage groups takeover tickets by what the vehicle did. To get started, either:</p>
        <ul>
          <li>
            <strong>File a takeover</strong> from a telemetry CSV and 1 to 4 dashcam JPEGs, or
          </li>
          <li>
            <strong>Load demo data</strong> on the admin page (Jira settings › Apps › <em>Takeover Triage setup</em>). It creates a SYNTHETIC fleet: no real vehicles or people.
          </li>
        </ul>
        <p>
          <Button appearance="primary" onClick={onFile} testId="tt-empty-file-takeover">
            File a takeover
          </Button>
        </p>
      </Notice>
    </div>
  );
}

function SinceLastTriage({ board }: { readonly board: BoardView }) {
  const s = board.sinceLastTriage;
  return (
    <p data-testid="tt-since-triage" style={{ font: font.body, margin: `${space.s} 0` }}>
      {s.source === "none" || s.at === null ? (
        <>Not triaged yet. Click “Mark triaged” after the meeting to count new events from then on.</>
      ) : (
        <>
          Since last triage ({formatInstant(s.at)}
          {s.by !== null ? ` by ${s.by}` : ""}): <strong>{plural(s.newEvents, "new event")}</strong>.
        </>
      )}{" "}
      <Muted>
        {plural(board.totals.events, "event")} · {plural(board.totals.clusters, "cluster")} · {board.totals.accepted} accepted · {board.totals.proposed} proposed · {board.totals.novel} novel · {board.unassignedCount} unassigned
      </Muted>
    </p>
  );
}

export function coverageText(c: CoverageView): string {
  if (c.state === "no-scenario-tests") return "No scenario tests found";
  if (c.state === "jql-error") return "Scenario JQL rejected";
  if (c.verdict === "covered") return `Covered by ${plural(c.tests.length, "test")}`;
  if (c.verdict === "partial") return `Partially covered (missing: ${c.missing.join(", ")})`;
  return "0 scenario tests";
}

function BoardBody({ board, client, onChanged }: { readonly board: BoardView; readonly client: TtClient; readonly onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <SinceLastTriage board={board} />
      <Section title="Clusters" testId="tt-clusters">
        {board.clusters.length === 0 ? (
          <p style={{ color: colors.subtle }}>No clusters yet. Accept a match or split an event from the issue panel to create one.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle} data-testid="tt-cluster-table">
              <caption style={{ textAlign: "left", font: font.small, color: colors.subtle, paddingBottom: space.xs }}>
                Clusters in {board.projectKey}. Onset p-values are a screening signal, Holm-corrected across the {board.holmFamilySize} clusters with enough data for a test; raw and adjusted values are both shown.
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>Cluster</th>
                  <th scope="col" style={{ ...thStyle, textAlign: "right" }}>Events (new)</th>
                  <th scope="col" style={thStyle}>Type</th>
                  <th scope="col" style={thStyle}>Conditions</th>
                  <th scope="col" style={thStyle}>Builds seen</th>
                  <th scope="col" style={thStyle}>Onset</th>
                  <th scope="col" style={thStyle}>Coverage</th>
                  <th scope="col" style={thStyle}>Owner</th>
                  <th scope="col" style={thStyle}>Status</th>
                </tr>
              </thead>
              {board.clusters.map((row) => (
                <ClusterRowView key={row.cluster.key} row={row} expanded={open === row.cluster.key} onToggle={() => setOpen(open === row.cluster.key ? null : row.cluster.key)} client={client} onChanged={onChanged} />
              ))}
            </table>
          </div>
        )}
      </Section>
      <NovelQueue items={board.novel} />
      <ProposedGroups groups={board.proposedGroups} />
      <Section title="Scenario coverage gaps" testId="tt-coverage">
        <p style={{ font: font.small, color: colors.subtle, margin: `0 0 ${space.s}` }}>
          {plural(board.scenarioCount, "scenario test")} found with <code>{board.scenarioJql}</code>. Peach cells (marked !) have events but no test.
        </p>
        <GapGrid grid={board.gapGrid} />
      </Section>
      {board.caveats.length > 0 && (
        <Section title="Caveats" level={3}>
          <ul style={{ margin: 0, paddingLeft: space.m, font: font.small, color: colors.subtle }} data-testid="tt-caveats">
            {board.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Section>
      )}
      <p style={{ font: font.small, color: colors.subtlest }}>Board computed {formatInstant(board.builtAt)}.</p>
    </>
  );
}

function ClusterRowView({ row, expanded, onToggle, client, onChanged }: { readonly row: BoardClusterRow; readonly expanded: boolean; readonly onToggle: () => void; readonly client: TtClient; readonly onChanged: () => void }) {
  const detailsId = `tt-cluster-details-${row.cluster.key}`;
  return (
    <tbody data-testid={`tt-cluster-row-${row.cluster.key}`}>
      <tr style={expanded ? { background: state.featuredTint, boxShadow: `inset 4px 0 0 ${state.featured}` } : undefined}>
        <th scope="row" style={{ ...tdStyle, textAlign: "left", fontWeight: 400 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailsId}
              onClick={onToggle}
              data-testid={`tt-expand-${row.cluster.key}`}
              style={{ background: "transparent", border: 0, padding: 0, font: font.body, fontWeight: 600, color: colors.text, cursor: "pointer", textAlign: "left" }}
            >
              <span aria-hidden="true">{expanded ? "▾ " : "▸ "}</span>
              {row.cluster.name}
            </button>
            <span style={{ font: font.small }}>
              <EvidenceLink evidence={{ kind: "issue", key: row.cluster.key, url: row.cluster.url, label: row.cluster.key }} />
            </span>
          </div>
        </th>
        <td style={numericCell}>
          {row.acceptedCount}
          {row.newSinceTriage > 0 && <span style={{ fontWeight: 600 }}> (+{row.newSinceTriage})</span>}
          {row.pendingSuggestions.length > 0 && <div style={{ font: font.small, color: colors.subtle }}>{row.pendingSuggestions.length} suggested</div>}
        </td>
        <td style={tdStyle}>{row.type}</td>
        <td style={tdStyle}>
          <ConditionChips chips={row.conditions} emptyText="none" />
        </td>
        <td style={tdStyle}>{row.buildsSeen.join(", ") || "–"}</td>
        <td style={tdStyle}>
          <OnsetBadge onset={row.onset} />
        </td>
        <td style={tdStyle} data-testid={`tt-coverage-${row.cluster.key}`} data-verdict={row.coverage.verdict ?? row.coverage.state}>
          {row.coverage.verdict === "uncovered" ? (
            <StateChip tone="gap">{coverageText(row.coverage)}</StateChip>
          ) : row.coverage.verdict === "covered" ? (
            <StateChip tone="covered">{coverageText(row.coverage)}</StateChip>
          ) : row.coverage.verdict === "partial" ? (
            <StateChip tone="inconclusive">{coverageText(row.coverage)}</StateChip>
          ) : (
            <span>{coverageText(row.coverage)}</span>
          )}
        </td>
        <td style={tdStyle}>{row.owner === null ? <Muted>no rule</Muted> : row.owner.team}</td>
        <td style={tdStyle}>{row.status}</td>
      </tr>
      {expanded && (
        <tr id={detailsId}>
          <td colSpan={9} style={{ ...tdStyle, background: state.surface, padding: space.m }}>
            <ClusterDetails row={row} client={client} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </tbody>
  );
}

function NovelQueue({ items }: { readonly items: readonly NovelQueueItem[] }) {
  return (
    <Section title={`Novel queue (${items.length})`} testId="tt-novel-queue">
      {items.length === 0 ? (
        <p style={{ color: colors.subtle, margin: 0 }}>No novel events: every event is within τ of a cluster or already triaged.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {items.map((n) => (
            <li key={n.event.key} data-testid={`tt-novel-${n.event.key}`} style={{ padding: `${space.xs} 0`, borderBottom: `1px solid ${colors.border}` }}>
              <Row>
                <StateChip tone="novel">Novel</StateChip>
                <IssueLink issueKey={n.event.key} />
                <span>
                  {n.event.type} · {n.event.variant} · build {n.event.build}
                </span>
                <ConditionChips chips={n.event.chips} emptyText="no chips" />
                <Muted>{n.reason === "first-of-kind" ? "first-of-kind" : `d* ${formatNumber(n.dStar, 2)} > τ ${formatNumber(n.tau, 2)}`}</Muted>
              </Row>
              <div style={{ font: font.small, color: colors.subtle }}>
                {n.message}
                {n.nearestCluster !== undefined && (
                  <>
                    {" "}
                    Nearest: <EvidenceLink evidence={{ kind: "issue", key: n.nearestCluster.key, url: n.nearestCluster.url, label: `${n.nearestCluster.name} (${n.nearestCluster.key})` }} />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ProposedGroups({ groups }: { readonly groups: readonly ProposedGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <Section title={`Proposed groups (${groups.length})`} testId="tt-proposed-groups">
      <p style={{ font: font.small, color: colors.subtle, margin: `0 0 ${space.s}` }}>Unassigned events the engine would group together. Nothing is linked until someone splits or accepts from the issue panel.</p>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {groups.map((g) => (
          <li key={g.id} style={{ padding: `${space.xs} 0`, borderBottom: `1px solid ${colors.border}` }}>
            <Row>
              <strong>{g.name}</strong>
              <Muted>{g.bucket}</Muted>
              <ConfidenceBadge confidence={g.confidence} testId={`tt-group-confidence-${g.id}`} />
            </Row>
            <div style={{ font: font.small }}>
              Members:{" "}
              {g.members.map((m, i) => (
                <span key={m}>
                  {i > 0 ? ", " : ""}
                  <IssueLink issueKey={m} />
                </span>
              ))}
            </div>
            {g.why.length > 0 && <div style={{ font: font.small, color: colors.subtle }}>{g.why.join(" · ")}</div>}
            <EvidenceList evidence={g.evidence} />
          </li>
        ))}
      </ul>
    </Section>
  );
}
