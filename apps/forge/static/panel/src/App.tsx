/**
 * Issue panel "Takeover signature" (`jira:issuePanel`, PRD US-09..US-11, US-13, US-15).
 *
 * Opening the panel calls `getPanel`, which may lazily re-process the event (§7.5); the four
 * view kinds are rendered as-is: event, cluster, the honest "No signal data." state, and
 * invalid signal data. Accept / Split / Route / Undo each need a click (US-11 AC5).
 */
import Button from "@atlaskit/button/new";
import { ApiErrorMessage, Loading, Notice, Warnings, colors, font, space } from "@tt/ui-shared";
import { useState } from "react";
import type { PanelInvalidView, PanelNoDataView, TtClient } from "../../common/api.js";
import { AppFrame, useLoadable } from "../../common/ui.js";
import { ClusterPanel } from "./ClusterPanel.js";
import { EventPanel } from "./EventPanel.js";

export interface PanelDeps {
  readonly client: TtClient;
  /** From the issue panel context; undefined when it could not be read. */
  readonly issueKey: string | undefined;
  readonly projectKey?: string;
  /** Opens the intake in attach mode (bridge Modal, SPIKE-C2). Resolves when it closes. */
  readonly openAddTelemetry: (issueKey: string, projectKey: string | undefined) => Promise<"closed" | "unavailable">;
}

export function PanelApp({ deps }: { readonly deps: PanelDeps }) {
  if (deps.issueKey === undefined) {
    return (
      <AppFrame label="Takeover signature">
        <Notice appearance="warning" title="No issue in context">
          <p style={{ margin: 0 }}>This panel only works on a Jira issue.</p>
        </Notice>
      </AppFrame>
    );
  }
  return <Panel deps={deps} issueKey={deps.issueKey} />;
}

function Panel({ deps, issueKey }: { readonly deps: PanelDeps; readonly issueKey: string }) {
  const { client } = deps;
  const panel = useLoadable(() => client.call("getPanel", { issueKey }));
  const v = panel.value;
  return (
    <AppFrame label="Takeover signature">
      {v.state === "loading" && <Loading label="Loading the takeover signature…" />}
      {v.state === "error" && <ApiErrorMessage error={v.error} onRetry={panel.reload} title="The takeover signature could not be loaded" />}
      {v.state === "ready" && (
        <>
          <Warnings warnings={v.warnings} />
          {v.data.kind === "event" && <EventPanel view={v.data} client={client} issueKey={issueKey} onChanged={panel.reload} />}
          {v.data.kind === "cluster" && <ClusterPanel view={v.data} client={client} onChanged={panel.reload} />}
          {(v.data.kind === "no-signal-data" || v.data.kind === "invalid-signal-data") && <NoData view={v.data} deps={deps} issueKey={issueKey} onChanged={panel.reload} />}
        </>
      )}
    </AppFrame>
  );
}

/** "No signal data. [Add telemetry]" (PRD US-13 AC1): no guess from the issue text. */
function NoData({ view, deps, issueKey, onChanged }: { readonly view: PanelNoDataView | PanelInvalidView; readonly deps: PanelDeps; readonly issueKey: string; readonly onChanged: () => void }) {
  const [unavailable, setUnavailable] = useState(false);
  const add = async (): Promise<void> => {
    const outcome = await deps.openAddTelemetry(issueKey, deps.projectKey);
    if (outcome === "unavailable") setUnavailable(true);
    else onChanged();
  };
  const invalid = view.kind === "invalid-signal-data";
  return (
    <div data-testid={invalid ? "tt-panel-invalid" : "tt-panel-empty"} style={{ display: "flex", flexDirection: "column", gap: space.s, alignItems: "flex-start" }}>
      <p style={{ font: font.body, margin: 0 }}>
        <strong>{invalid ? "Invalid signal data." : "No signal data."}</strong> {view.message !== "No signal data." ? view.message : ""}
      </p>
      {invalid && view.errors.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: space.m, font: font.small, color: colors.subtle }}>
          {view.errors.map((e, i) => (
            <li key={`${i}-${e.path ?? ""}`}>
              {e.path !== undefined && <code>{e.path}: </code>}
              {e.message}
            </li>
          ))}
        </ul>
      )}
      <p style={{ font: font.small, color: colors.subtle, margin: 0 }}>The app does not guess a takeover type from the issue text. Add a telemetry CSV (and optionally dashcam stills) to compute the signature.</p>
      <Button appearance="primary" onClick={() => void add()} testId="tt-add-telemetry">
        {invalid ? "Replace telemetry" : "Add telemetry"}
      </Button>
      {unavailable && (
        <Notice appearance="warning">
          <p style={{ margin: 0 }}>The intake dialog could not be opened from the panel. Use the issue action “Add telemetry (Takeover Triage)” in the issue’s ••• menu.</p>
        </Notice>
      )}
    </div>
  );
}
