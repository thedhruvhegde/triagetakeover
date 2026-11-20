/**
 * Route: owner suggestion (rule → TWG team as the user → component lead → project role) with
 * the source and "why" always shown (PRD US-15 AC3/AC4), then Confirm writes the component or
 * field and a comment (US-11 AC3). TWG members are shown here only (never via actions, D8).
 */
import Button from "@atlaskit/button/new";
import { ApiErrorMessage, ConfidenceBadge, EvidenceList, colors, font, space, type ClientError } from "@tt/ui-shared";
import { useState } from "react";
import type { RouteView, TriageActionResult, TtClient } from "../../common/api.js";
import { Card, Muted, Row } from "../../common/ui.js";

export const ROUTE_SOURCE_LABEL: Readonly<Record<RouteView["source"], string>> = {
  twg: "Teamwork Graph, as you",
  component: "Project component lead",
  "project-role": "Project role",
  none: "No owner found",
};

type RouteState =
  | { readonly s: "idle" }
  | { readonly s: "loading" }
  | { readonly s: "suggested"; readonly route: RouteView }
  | { readonly s: "applying"; readonly route: RouteView }
  | { readonly s: "error"; readonly error: ClientError };

export interface RouteFlowProps {
  readonly client: TtClient;
  /** The issue the panel is on (event or cluster). */
  readonly issueKey: string;
  readonly clusterKey: string;
  readonly onApplied: (result: TriageActionResult) => void;
  readonly onError: (message: string) => void;
}

export function RouteFlow({ client, issueKey, clusterKey, onApplied, onError }: RouteFlowProps) {
  const [st, setSt] = useState<RouteState>({ s: "idle" });
  const suggest = async (): Promise<void> => {
    setSt({ s: "loading" });
    const r = await client.call("suggestOwner", { clusterKey });
    setSt(r.ok ? { s: "suggested", route: r.data } : { s: "error", error: r.error });
  };
  const apply = async (route: RouteView): Promise<void> => {
    setSt({ s: "applying", route });
    const r = await client.call("applyRoute", { issueKey, clusterKey });
    if (r.ok) {
      setSt({ s: "idle" });
      onApplied(r.data);
    } else {
      setSt({ s: "suggested", route });
      onError(r.error.message);
    }
  };
  if (st.s === "idle" || st.s === "loading") {
    return (
      <Button onClick={() => void suggest()} isDisabled={st.s === "loading"} testId="tt-route">
        Route…
      </Button>
    );
  }
  if (st.s === "error") return <ApiErrorMessage error={st.error} onRetry={() => void suggest()} title="Owner suggestion" />;
  const route = st.route;
  return (
    <Card testId="tt-route-card">
      <p style={{ margin: `0 0 ${space.xs}` }}>
        Suggested owner for {clusterKey}: <strong>{route.team?.name ?? "none"}</strong>
        {route.contact !== undefined && <> · contact {route.contact.displayName ?? route.contact.accountId}</>}
      </p>
      <p style={{ margin: `0 0 ${space.xs}`, font: font.small }} data-testid="tt-route-source" data-source={route.source}>
        Source: {ROUTE_SOURCE_LABEL[route.source]}
        {route.twgStatus !== "ok" && route.twgStatus !== "skipped" && <> (Teamwork Graph: {route.twgStatus})</>}
      </p>
      {route.fallbackReason !== undefined && <p style={{ margin: `0 0 ${space.xs}`, font: font.small, color: colors.warningText }}>{route.fallbackReason}</p>}
      <p style={{ margin: `0 0 ${space.xs}`, font: font.small }}>Rule #{route.rule.index + 1}: {route.rule.text}</p>
      {route.members !== undefined && route.members.length > 0 && (
        <p style={{ margin: `0 0 ${space.xs}`, font: font.small }} data-testid="tt-route-members">
          Team members: {route.members.map((m) => m.displayName ?? m.accountId).join(", ")}
        </p>
      )}
      <ul style={{ margin: `0 0 ${space.xs}`, paddingLeft: space.m, font: font.small, color: colors.subtle }}>
        {route.why.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {route.hops.length > 0 && (
        <details style={{ font: font.small, marginBottom: space.xs }}>
          <summary style={{ cursor: "pointer", color: colors.link }}>Lookup steps</summary>
          <ol style={{ margin: 0, paddingLeft: space.m }}>
            {route.hops.map((h, i) => (
              <li key={`${i}-${h.step}`}>
                {h.step} ({h.ref}): {h.outcome}
                {h.detail !== "" && <Muted> · {h.detail}</Muted>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <ConfidenceBadge confidence={route.confidence} label="Routing confidence" testId="tt-route-confidence" />
      <EvidenceList evidence={route.evidence} />
      <Row>
        <Button appearance="primary" onClick={() => void apply(route)} isDisabled={st.s === "applying" || route.source === "none"} testId="tt-route-confirm">
          Confirm route
        </Button>
        <Button appearance="subtle" onClick={() => setSt({ s: "idle" })} isDisabled={st.s === "applying"} testId="tt-route-cancel">
          Cancel
        </Button>
      </Row>
      {route.applies !== undefined && (
        <p style={{ font: font.small, color: colors.subtle, margin: `${space.xs} 0 0` }}>
          Confirm sets {route.applies.componentId !== undefined ? `component ${route.applies.componentId}` : `field ${route.applies.fieldId ?? ""}`} on {clusterKey} and adds a comment mentioning the contact. Undo reverts the field.
        </p>
      )}
    </Card>
  );
}
