# @tt/ui-shared

Presentational React 18 + Atlaskit components shared by the Custom UI apps in
`apps/forge/static/*`. All colours and spacing come from `@atlaskit/tokens`, so the components
follow the host's light or dark theme.

Props are typed structurally, using engine types only (ARCHITECTURE §4). They have the same shapes
as the `ui-api` contract views, so a contract value can be passed straight in. This package never
imports `apps/*` or `@forge/bridge`. Navigation goes through `NavigationProvider` instead; the
apps give it `router.open` / `router.navigate`.

| Export | What |
|---|---|
| `SignalPlot` | <ul><li>The 201-sample, 10 Hz window as stacked SVG strips, with the takeover marker at t = 0.</li><li>The SVG has `role="img"` and a text description of every channel.</li><li>Takes `domains` for shared axes.</li></ul> |
| `OverlayPlot` | <ul><li>The event plus up to 3 neighbours on the same axes.</li><li>Each series has its own colour and dash pattern, so colour is never the only cue.</li></ul> |
| `WhyTable` | <ul><li>Feature value, reference value, z and share of the distance, ranked.</li><li>Shows n/a notes, the condition (Hamming) term, and the bucket and headline rule texts.</li></ul> |
| `ConditionChips` | <ul><li>Chips with the rule that fired.</li><li>Optional caption "Image statistics, not scene understanding."</li></ul> |
| `ConfidenceBadge` | <ul><li>A value plus its definition and inputs.</li><li>A keyboard toggle shows the definition.</li></ul> |
| `EvidenceLink`, `IssueLink`, `EvidenceList` | <ul><li>Real `href`s; a click calls the navigator.</li><li>Never `target=_blank`.</li></ul> |
| `GapGrid` | <ul><li>Conditions x takeover types, as events / tests.</li><li>A gap is marked with text, not only colour.</li><li>Optional cell selection through buttons.</li></ul> |
| `OnsetBadge`, `OnsetBars`, `OnsetHowTo` | <ul><li>The verdict, with p_raw and p_holm.</li><li>The p-value in plain words, with no causal claim.</li><li>Per-build bars of events per 1,000 km.</li><li>A formula and inputs expander.</li></ul> |
| `Notice`, `ApiErrorMessage`, `Warnings`, `Loading`, `StatusToast`, `Section`, `SyntheticBadge`, `Disclaimer` | Status and layout pieces. `StatusToast` is a polite live region. |
| `createUiClient`, `createFakeClient`, `readEnvelope` | <ul><li>A typed client over any `{method: {req, res}}` map.</li><li>It never throws, and it validates the envelope.</li></ul> |
| `format*`, `pValueInWords`, plot math | Pure, deterministic helpers. They do not use `Date` or the browser locale. |

Tests: `pnpm vitest run packages/ui-shared`. Typecheck: `pnpm --filter @tt/ui-shared typecheck`.
