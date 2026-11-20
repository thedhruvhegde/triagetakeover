/**
 * Cluster view of the issue panel (the issue is a `tt-cluster` issue): members, suggestions,
 * onset, coverage, owner hint and Route.
 */
import { Disclaimer, EvidenceList, IssueLink, OnsetBadge, OnsetBars, OnsetHowTo, Section, StatusToast, SyntheticBadge, colors, font, formatInstant, space } from "@tt/ui-shared";
import { useState } from "react";
import type { PanelClusterView, TtClient } from "../../common/api.js";
import { Muted } from "../../common/ui.js";
import { RouteFlow } from "./Route.js";

export function ClusterPanel({ view, client, onChanged }: { readonly view: PanelClusterView; readonly client: TtClient; readonly onChanged: () => void }) {
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const c = view.cluster;
  return (
    <div data-testid="tt-panel-cluster">
      <SyntheticBadge show={view.members.some((m) => m.synthetic)} />
      <h2 style={{ font: "var(--ds-font-heading-small, normal 653 16px/20px sans-serif)", margin: `${space.s} 0 ${space.xs}` }}>Cluster: {c.name}</h2>
      <Muted>
        {c.bucket.replace("|", " · ")} · {c.memberCount} accepted members
      </Muted>
      <div style={{ margin: `${space.s} 0` }}>
        <RouteFlow
          client={client}
          issueKey={c.key}
          clusterKey={c.key}
          onApplied={(r) => {
            setToast({ text: r.summary, tone: "success" });
            onChanged();
          }}
          onError={(text) => setToast({ text, tone: "error" })}
        />
        {view.owner !== null && (
          <p style={{ font: font.small, color: colors.subtle, margin: `${space.xs} 0 0` }}>
            Owner rule #{view.owner.ruleIndex + 1}: {view.owner.ruleText} → {view.owner.team}
          </p>
        )}
      </div>
      <StatusToast message={toast?.text ?? null} tone={toast?.tone ?? "success"} />
      <Section title="Build onset" testId="tt-cluster-onset">
        <OnsetBadge onset={view.onset} showWords />
        <div style={{ margin: `${space.s} 0` }}>
          <OnsetBars onset={view.onset} />
        </div>
        <OnsetHowTo onset={view.onset} />
        <EvidenceList evidence={view.onset.evidence} />
      </Section>
      <Section title="Scenario coverage" testId="tt-cluster-coverage">
        <p style={{ margin: 0 }}>{view.coverage.text}</p>
        <EvidenceList evidence={view.coverage.evidence} />
      </Section>
      <Section title={`Members (${view.members.length})`} testId="tt-cluster-members">
        <ul style={{ margin: 0, paddingLeft: space.m, font: font.small }}>
          {view.members.map((m) => (
            <li key={m.key}>
              <IssueLink issueKey={m.key} /> · {m.type} · build {m.build} · {formatInstant(m.occurredAt)}
            </li>
          ))}
        </ul>
        {view.pendingSuggestions.length > 0 && (
          <p style={{ font: font.small, marginTop: space.s }}>
            Suggested (not linked):{" "}
            {view.pendingSuggestions.map((k, i) => (
              <span key={k}>
                {i > 0 ? ", " : ""}
                <IssueLink issueKey={k} />
              </span>
            ))}
          </p>
        )}
      </Section>
      <Disclaimer text={view.disclaimer} />
    </div>
  );
}
