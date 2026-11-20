/**
 * Expanded board row: onset bars + "How is this computed?", the coverage verdict with its tests
 * and missing dimensions, and the scenario-stub flow (preview first, create on confirm; US-18).
 */
import Button from "@atlaskit/button/new";
import { ApiErrorMessage, ConfidenceBadge, EvidenceLink, EvidenceList, IssueLink, OnsetBadge, OnsetBars, OnsetHowTo, colors, font, space, type ClientError } from "@tt/ui-shared";
import { useState } from "react";
import type { BoardClusterRow, ScenarioStubView, TtClient } from "../../common/api.js";
import { Card, Muted, Row } from "../../common/ui.js";

export function ClusterDetails({ row, client, onChanged }: { readonly row: BoardClusterRow; readonly client: TtClient; readonly onChanged: () => void }) {
  const c = row.coverage;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: space.m }}>
      <div>
        <h3 style={{ font: font.body, fontWeight: 600, margin: `0 0 ${space.xs}` }}>Build onset</h3>
        <OnsetBadge onset={row.onset} showWords />
        {row.onset.message !== undefined && <p style={{ font: font.small, color: colors.subtle }}>{row.onset.message}</p>}
        <div style={{ margin: `${space.s} 0` }}>
          <OnsetBars onset={row.onset} />
        </div>
        <OnsetHowTo onset={row.onset} />
        <div style={{ marginTop: space.xs }}>
          <ConfidenceBadge confidence={row.onset.confidence} label="Onset confidence" testId={`tt-onset-confidence-${row.cluster.key}`} />
        </div>
        <EvidenceList evidence={row.onset.evidence} />
      </div>
      <div>
        <h3 style={{ font: font.body, fontWeight: 600, margin: `0 0 ${space.xs}` }}>Scenario coverage</h3>
        <p style={{ margin: `0 0 ${space.xs}` }} data-testid="tt-coverage-text">
          {c.text}
        </p>
        <p style={{ font: font.small, color: colors.subtle, margin: `0 0 ${space.xs}` }}>Condition signature: {c.signature.text}</p>
        {c.tests.length > 0 && (
          <p style={{ font: font.small, margin: `0 0 ${space.xs}` }}>
            Tests:{" "}
            {c.tests.map((t, i) => (
              <span key={t}>
                {i > 0 ? ", " : ""}
                <IssueLink issueKey={t} />
              </span>
            ))}
          </p>
        )}
        {c.missing.length > 0 && <p style={{ font: font.small, margin: `0 0 ${space.xs}` }}>Missing dimensions: {c.missing.join(", ")}</p>}
        <ConfidenceBadge confidence={c.confidence} label="Coverage match" testId={`tt-coverage-confidence-${row.cluster.key}`} />
        <EvidenceList evidence={c.evidence} />
        {c.verdict !== "covered" && c.state !== "jql-error" && <StubFlow clusterKey={row.cluster.key} client={client} onCreated={onChanged} />}
        {row.pendingSuggestions.length > 0 && (
          <p style={{ font: font.small, marginTop: space.s }}>
            Suggested members (not linked):{" "}
            {row.pendingSuggestions.map((k, i) => (
              <span key={k}>
                {i > 0 ? ", " : ""}
                <IssueLink issueKey={k} />
              </span>
            ))}
          </p>
        )}
        {row.medoidKey !== null && (
          <p style={{ font: font.small }}>
            Representative event: <IssueLink issueKey={row.medoidKey} />
          </p>
        )}
        {row.owner !== null && (
          <p style={{ font: font.small }}>
            Owner rule #{row.owner.ruleIndex + 1}: {row.owner.ruleText} → {row.owner.team}. <Muted>Use Route on the cluster issue to resolve the contact.</Muted>
          </p>
        )}
      </div>
    </div>
  );
}

type StubState =
  | { readonly s: "idle" }
  | { readonly s: "loading" }
  | { readonly s: "preview"; readonly stub: ScenarioStubView }
  | { readonly s: "creating"; readonly stub: ScenarioStubView }
  | { readonly s: "created"; readonly stub: ScenarioStubView }
  | { readonly s: "error"; readonly error: ClientError };

export function StubFlow({ clusterKey, client, onCreated }: { readonly clusterKey: string; readonly client: TtClient; readonly onCreated: () => void }) {
  const [st, setSt] = useState<StubState>({ s: "idle" });
  const preview = async (): Promise<void> => {
    setSt({ s: "loading" });
    const r = await client.call("previewScenarioStub", { clusterKey });
    setSt(r.ok ? { s: "preview", stub: r.data } : { s: "error", error: r.error });
  };
  const create = async (stub: ScenarioStubView): Promise<void> => {
    setSt({ s: "creating", stub });
    const r = await client.call("createScenarioStub", { clusterKey });
    if (r.ok) {
      setSt({ s: "created", stub: r.data });
      onCreated();
    } else setSt({ s: "error", error: r.error });
  };
  if (st.s === "idle" || st.s === "loading") {
    return (
      <p>
        <Button onClick={() => void preview()} isDisabled={st.s === "loading"} testId="tt-create-stub">
          Create scenario stub…
        </Button>
      </p>
    );
  }
  if (st.s === "error") return <ApiErrorMessage error={st.error} onRetry={() => void preview()} title="Scenario stub" />;
  const stub = st.stub;
  if (st.s === "created" && stub.created !== undefined) {
    return (
      <Card testId="tt-stub-created">
        <p style={{ margin: 0 }} role="status">
          Created scenario stub <EvidenceLink evidence={{ kind: "scenario", key: stub.created.key, url: stub.created.url, label: stub.created.key }} />, linked to {clusterKey} and {stub.linkedEvents.length} representative events.
        </p>
      </Card>
    );
  }
  return (
    <Card testId="tt-stub-preview">
      <p style={{ margin: `0 0 ${space.xs}`, fontWeight: 600 }}>Preview (nothing is created yet)</p>
      <p style={{ margin: `0 0 ${space.xs}` }}>{stub.summary}</p>
      <p style={{ font: font.small, margin: `0 0 ${space.xs}` }}>Labels: {stub.labels.join(", ")}</p>
      <pre style={{ font: font.code, whiteSpace: "pre-wrap", background: colors.sunken, padding: space.s, borderRadius: 3, maxHeight: 200, overflow: "auto" }}>{stub.description}</pre>
      <p style={{ font: font.small, margin: `0 0 ${space.xs}` }}>
        Links to {clusterKey} and:{" "}
        {stub.linkedEvents.map((k, i) => (
          <span key={k}>
            {i > 0 ? ", " : ""}
            <IssueLink issueKey={k} />
          </span>
        ))}
      </p>
      <p style={{ font: font.small, color: colors.subtle, margin: `0 0 ${space.xs}` }}>Description from the deterministic template (no generated text). {stub.why.join(" · ")}</p>
      <Row>
        <Button appearance="primary" onClick={() => void create(stub)} isDisabled={st.s === "creating"} testId="tt-stub-confirm">
          Create
        </Button>
        <Button appearance="subtle" onClick={() => setSt({ s: "idle" })} isDisabled={st.s === "creating"} testId="tt-stub-cancel">
          Cancel
        </Button>
      </Row>
    </Card>
  );
}
