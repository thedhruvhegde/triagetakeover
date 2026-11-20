# Custom UI resources: board, panel, intake

Three Vite + React 18 + Atlaskit apps. Each one builds to `static/<name>/dist`, and that folder is
the `resources:` path in `manifest.yml`. They talk to the backend only through
`invoke(method, payload)` on the typed contract in
[`src/contract/ui-api.ts`](../src/contract/ui-api.ts). The intake also writes to Jira as the
current user with `requestJira`.

**Status:** built and tested offline, in jsdom with a mocked bridge. They have **never been loaded
in Jira**: there is no Forge login, so nothing has been deployed or tunnelled. Behaviour that
depends on the platform is marked with its SPIKE id (ARCHITECTURE §17).

| Resource | Module | What it shows |
|---|---|---|
| `board` | `jira:projectPage` "Takeover clusters" | <ul><li>cluster rows with onset and coverage columns</li><li>novel queue and proposed groups</li><li>the gap grid</li><li>since-last-triage, with **Mark triaged** and **Re-sync now** (with progress)</li><li>**File takeover**, which opens the intake in a bridge `Modal` (SPIKE-C2)</li><li>an empty state that points to "Load demo data"</li></ul> |
| `panel` | `jira:issuePanel` "Takeover signature" | <ul><li>the trace with the takeover marker, plus chips and the rule that fired each one</li><li>the result card (match / ambiguous / novel / first-of-kind / accepted) with its confidence</li><li>the top-3 neighbours side by side on shared axes, plus an overlay</li><li>the why-table</li><li>Accept / Split / Route / Undo</li><li>"No signal data. [Add telemetry]"</li><li>the lazy re-processing notice</li><li>the cluster view</li></ul> |
| `intake` | the board's `Modal` (mode `create`), and `jira:issueAction` "Add telemetry" (mode `attach`) | <ul><li>drop one CSV and 1–4 JPEGs</li><li>processing in a Web Worker (SPIKE-C3, falls back to the main thread)</li><li>the column-mapping step and presets</li><li>a preview: plot, type, features, chips</li><li>after confirm: create the issue, upload the originals (SPIKE-I2, with a resolver fallback), then `commitEvent`</li></ul> |

## Layout

```
static/
├── vite.shared.ts        # base "./", engine aliased to source, feature-gate stub, engine tree-shaking
├── common/               # @tt/static-common: source shared by the three apps (bundled into each)
│   ├── forge.ts          # the ONLY @forge/bridge import: invoke, router, Modal, view, requestJira
│   ├── context.ts        # defensive view-context reader (SPIKE-A2 / C2)
│   ├── api.ts            # TtClient = UiClient<UiApi> + contract type re-exports
│   ├── ui.tsx            # AppFrame, useLoadable, TextField/SelectField, Card, Row
│   ├── feature-gates-stub.ts  # build-time stand-in for Atlaskit's feature-gate client (see below)
│   ├── testing.tsx       # fake client, recording navigator, contract fixture builders (TEST-* keys)
│   ├── jsdom-setup.ts    # matchMedia / ResizeObserver / feature-flag resolver for jsdom tests
│   └── dev-harness.tsx   # mounts an app with a mocked bridge for `vite` dev (dev.html)
├── board/   src/{App,ClusterDetails,Resync,main}.tsx   test/   dev/   index.html  dev.html
├── panel/   src/{App,EventPanel,ClusterPanel,Route,main}.tsx  test/  dev/
└── intake/  src/{App,Mapping,main}.tsx, pipeline.ts, mapping-status.ts, processor.ts, worker.ts,
             jira.ts, files.ts   test/   dev/
```

The presentational components (SignalPlot, OverlayPlot, WhyTable, ConditionChips, ConfidenceBadge,
EvidenceLink, GapGrid, OnsetBadge/OnsetBars/OnsetHowTo, Notice) live in
[`packages/ui-shared`](../../../packages/ui-shared). That package imports engine types only.

## Commands

```sh
pnpm --filter "@tt/static-*" build       # vite build → static/<app>/dist
pnpm --filter @tt/static-board typecheck # (also panel, intake, common, @tt/ui-shared)
pnpm vitest run apps/forge/static packages/ui-shared
pnpm --filter @tt/static-intake dev      # then open http://localhost:5173/dev.html
```

Every app takes its platform dependencies as props: client, navigator, modal opener, requestJira,
processor and thumbnail encoder. The tests and `dev.html` render the real `App` with fakes.
`main.tsx` is the only entry that wires `@forge/bridge`.

## Platform assumptions (unverified)

- **SPIKE-C1:** components use React `style` attributes and Atlaskit's compiled CSS, so the
  manifest needs `permissions.content.styles: unsafe-inline`, which it already has.
- **SPIKE-C2:** `new Modal({resource: "intake", size: "xlarge", context})` is assumed to open the
  intake resource from the board and the panel, with the `context` arriving as
  `extension.modal`. If it fails, the app says so and points to the "Add telemetry" issue
  action.
- **SPIKE-C3:** the intake starts a same-origin module worker. If that throws, errors or goes
  silent for 30 s, the app processes on the main thread and loads the pipeline lazily.
- **SPIKE-I2:** the intake uploads attachments from the browser as multipart `requestJira`
  calls with `X-Atlassian-Token: no-check`. If that fails, it calls `uploadAttachment` once
  per file (≤ 360 KB). If that fails too, it continues, and the result shows "Raw files not
  attached".
- **SPIKE-A2:** the view-context field names (`extension.project.key`, `extension.issue.key`,
  `extension.modal`) are read defensively.
- **Not in the SPIKE register:** we assume `view.theme.enable()` supplies the `--ds-*` token
  CSS for dark mode. If it does not, every `token()` call falls back to its light-theme value,
  so the page stays readable but is always light.

## Bundle notes

- **Feature-gate stub.** Atlaskit asks `@atlaskit/feature-gate-js-client` for platform gates.
  Inside a Custom UI iframe that client is never initialised, so every gate is already `false`.
  `common/feature-gates-stub.ts` gives the same answers without about 400 KB of Statsig client
  source, and it guarantees that no feature-gate network code ships.
- **No Atlaskit SectionMessage or Tooltip.** Both pull in IconButton, Tooltip, top-layer and
  popper, about 450 KB of source. `Notice` in ui-shared and the inline definition toggle on
  `ConfidenceBadge` replace them.
- **Engine tree-shaking.** Engine modules are marked side-effect free, so board and panel carry
  no CSV or JPEG code. The intake's main chunk loads the pipeline only for the main-thread
  fallback; the worker has its own copy.
