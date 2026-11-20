/**
 * "Triage now" (jira:issueAction, UI Kit): runs the synchronous match for the issue in context
 * and shows a compact result: result kind, cluster, confidence with its definition, the
 * deterministic headlines, the top why-rows and evidence links.
 *
 * Read-only on purpose: Accept / Split / Route live in the Takeover signature panel, where
 * Undo is. The copy says so instead of offering a button that would bypass Undo.
 */
import { Box, Button, DynamicTable, Heading, Inline, Link, Lozenge, SectionMessage, Spinner, Stack, Text } from "@forge/react";
import { useCallback, useEffect, useState } from "react";
import { NOT_A_SAFETY_TOOL, type ApiError, type MatchView } from "../contract/ui-api";
import type { Caller } from "./api";
import { RESULT_LABELS, errorText, num, percent, topWhyRows } from "./format";

export interface TriageViewProps {
  readonly call: Caller;
  /** Issue key from the module context, when the host provides it (else the resolver uses its own context). */
  readonly issueKey?: string;
  readonly onClose?: () => void;
}

type State = { readonly kind: "loading" } | { readonly kind: "error"; readonly error: ApiError } | { readonly kind: "ready"; readonly match: MatchView; readonly warnings: readonly string[] };

export function TriageView({ call, issueKey, onClose }: TriageViewProps) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const run = useCallback(async () => {
    setState({ kind: "loading" });
    // Without a key the resolver takes the issue from its own module context (ui-handlers withFocus).
    const r = await call("triageNow", issueKey !== undefined ? { issueKey } : ({} as { issueKey: string }));
    setState(r.ok ? { kind: "ready", match: r.data, warnings: r.warnings } : { kind: "error", error: r.error });
  }, [call, issueKey]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <Stack space="space.200">
      {state.kind === "loading" && (
        <Inline space="space.100" alignBlock="center">
          <Spinner label="Matching" />
          <Text>Matching this takeover against the clusters…</Text>
        </Inline>
      )}
      {state.kind === "error" && (
        <SectionMessage appearance={state.error.code === "forbidden-or-not-found" ? "warning" : "error"} title="Triage could not run">
          <Text>{errorText(state.error)}</Text>
          {state.error.retryable && <Button onClick={() => void run()}>Try again</Button>}
        </SectionMessage>
      )}
      {state.kind === "ready" && <MatchResult match={state.match} warnings={state.warnings} />}
      <Text size="small">{NOT_A_SAFETY_TOOL}</Text>
      {onClose !== undefined && (
        <Inline alignInline="end">
          <Button appearance="subtle" onClick={onClose}>
            Close
          </Button>
        </Inline>
      )}
    </Stack>
  );
}

function MatchResult({ match, warnings }: { readonly match: MatchView; readonly warnings: readonly string[] }) {
  const label = RESULT_LABELS[match.result];
  const why = topWhyRows(match.why, 3);
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Heading size="small">{match.event.key}</Heading>
        <Lozenge appearance={label.appearance} isBold>
          {label.text}
        </Lozenge>
        {match.event.synthetic && <Lozenge appearance="default">SYNTHETIC</Lozenge>}
        {match.event.tampered && <Lozenge appearance="removed">Signature recomputed</Lozenge>}
      </Inline>
      <Text>{match.message}</Text>
      {match.cluster !== undefined && (
        <Text>
          Cluster: <Link href={match.cluster.url}>{`${match.cluster.key} ${match.cluster.name}`}</Link> ({match.cluster.memberCount} events)
        </Text>
      )}
      {match.result === "ambiguous" && match.alternatives.length > 0 && (
        <Text>
          Also close: {match.alternatives.map((a) => a.key).join(", ")}
        </Text>
      )}
      <Box>
        <Text>
          <Text as="strong">Confidence {percent(match.confidence.value)}</Text>
          {` — ${match.confidence.definition}`}
        </Text>
        <Text size="small">
          d* = {num(match.dStar)}, τ = {num(match.tau)}
        </Text>
      </Box>
      {match.headlines.length > 0 && (
        <Stack space="space.050">
          {match.headlines.map((h) => (
            <Text key={h}>{h}</Text>
          ))}
        </Stack>
      )}
      {why.length > 0 && (
        <DynamicTable
          caption="Top contributors to the distance"
          head={{
            cells: [
              { key: "feature", content: "Feature" },
              { key: "event", content: "This event" },
              { key: "ref", content: "Cluster" },
              { key: "share", content: "Share" },
            ],
          }}
          rows={why.map((w) => ({
            key: w.feature,
            cells: [
              { key: "feature", content: `${w.feature} ${w.label}` },
              { key: "event", content: `${num(w.eventValue)} ${w.unit}`.trim() },
              { key: "ref", content: `${num(w.referenceValue)} ${w.unit}`.trim() },
              { key: "share", content: percent(w.contribution) },
            ],
          }))}
        />
      )}
      {match.evidence.length > 0 && (
        <Stack space="space.050">
          <Text as="strong">Evidence</Text>
          {match.evidence.slice(0, 6).map((e) => (
            // UNVERIFIED: site-relative hrefs in UI Kit `Link` (fallback: `router.navigate`).
            <Link key={`${e.kind}:${e.url}`} href={e.url}>
              {e.label}
            </Link>
          ))}
        </Stack>
      )}
      {warnings.map((w) => (
        <SectionMessage key={w} appearance="information">
          <Text>{w}</Text>
        </SectionMessage>
      ))}
      <Text size="small">Accept, split or route this event from the Takeover signature panel, where each change can be undone.</Text>
    </Stack>
  );
}
