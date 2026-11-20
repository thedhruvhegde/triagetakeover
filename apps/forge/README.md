# @tt/forge: the Takeover Triage Forge app (Jira)

Status: **built and tested offline; never deployed.** Everything the manifest references
exists: ports and in-memory fakes, services, the `ui-resolver`, both consumers (`tt-recluster`,
`tt-seed`), the 9 Rovo actions / MCP tools, the real Forge adapters (`src/adapters/forge`), the
UI Kit screens (admin, Triage now) and the three Custom UI apps (`static/{board,panel,intake}`).
`pnpm check` is green, and `pnpm check:deploy` bundles the app with the Forge CLI's own webpack
config offline (SPIKE-M2). There is no Forge login yet, so `forge lint`, `forge deploy` and every
platform behaviour in [docs/SPIKES.md](../../docs/SPIKES.md) are unverified. Nothing below the
"Deploying" heading has been run.

Specs: [ARCHITECTURE](../../docs/ARCHITECTURE.md) (§2 manifest, §3 scopes, §7 storage, §8 queues,
§10 Rovo/MCP, §14 security), [PRD](../../docs/PRD.md), [SEED_DATA](../../docs/SEED_DATA.md).

## Layout

```
apps/forge/
├── manifest.yml                 # ALL modules, scopes, entities. Owned by the foundation package:
│                                #   later work reports needed changes instead of editing it.
├── scripts/validate-manifest.mjs  # offline validation with @forge/manifest (what `forge lint` uses)
├── scripts/forge-bundle-check.cjs # bundles src/ with the Forge CLI's own webpack configs (SPIKE-M2)
├── scripts/check-bundle-size.mjs  # §13 Custom UI budgets on static/*/dist
├── src/
│   ├── ports/                   # interfaces the services depend on
│   │   ├── result.ts            # PortError / PortResult (engine Result shape), error kinds
│   │   ├── jira.ts              # JiraGateway { asUser(): JiraUserPort; asApp(): JiraPort }
│   │   ├── storage.ts           # StoragePort (KVS + custom entities), KvsKeys (§7.4), TTLs
│   │   ├── entities.ts          # entity row types + ENTITY_SPECS (mirror of the manifest, §7.3)
│   │   ├── properties.ts        # tt.* property keys, labels, JQL aliases (mirror of the manifest)
│   │   ├── twg.ts               # TwgPort (asUser only), classified outcomes
│   │   ├── queue.ts             # QueuePort, ReclusterJob, SeedJob (§8)
│   │   ├── clock.ts             # Clock, IdSource
│   │   └── index.ts             # Ports bundle injected into services
│   ├── adapters/memory/         # in-memory fakes of every port (for tests)
│   │   ├── jira.ts              # MemoryJiraSite: permissions, 404-for-hidden, 32,768 B property
│   │   │                        #   limit, link types, attachments as bytes, call log, faults
│   │   ├── jql.ts               # JQL subset incl. ttV/ttType/ttVariant/ttBuild/ttOccurred aliases
│   │   ├── storage.ts           # MemoryStorage: KVS with TTL, entity indexes, paging
│   │   ├── twg.ts, queue.ts, clock.ts
│   │   └── index.ts             # createMemoryWorld(): one fake site + storage + queues + TWG
│   └── validation/              # untrusted input: action inputs, resolver payloads, queue jobs
├── resources/agent/prompt.txt   # Rovo agent prompt (§10.1)
├── resources/icons/             # panel.svg, agent.svg
├── skills/monday-takeover-triage/SKILL.md   # Rovo skill; byte-identical OSS copy at /skills
└── test/                        # vitest: fakes, validation, manifest mirrors
```

Also under `src/`: `index.ts` (`uiResolver`, `recluster`, `seedStep`), `actions.ts` + `actions/`
(Rovo/MCP envelope layer), `adapters/forge/` (requestJira, KVS + entities, queues, TWG),
`consumers/`, `services/` (incl. `services/seed/`), `frontend/` (UI Kit). Custom UI lives in
`static/{board,panel,intake}` (Vite, builds to `static/*/dist`) with shared components in
`packages/ui-shared`.

**Import rule (SPIKE-M2, found offline):** the Forge bundler (webpack) does not map a `./x.js`
specifier to `x.ts`, so code under `src/` uses extensionless relative imports. ESLint enforces
it; tests (not bundled by Forge) may keep `.js`.

## Services and the UI contract

- `src/contract/ui-api.ts`: every `invoke(method, payload)` the UI makes, with JSON request and
  response types and the `ApiResponse` envelope (`{ok, data, warnings}` / `{ok:false, error}`).
  Custom UI imports types only. The file header documents the intake protocol (browser decode,
  browser attachment upload with the `uploadAttachment` fallback, then `commitEvent`).
- `src/services/`: one module per concern (commit, match, triage = accept/split/undo, route,
  onset, coverage, board, panel with lazy re-processing, recluster, resync, diagnostics, config,
  intake, admin; `seed/` is the demo seed chain). Services take a `ServiceContext`
  (`src/context.ts`) or, in consumers, raw `Ports`.
- `src/resolvers/ui-handlers.ts` validates payloads and dispatches; `ui-resolver.ts` registers
  them with `@forge/resolver`. `src/consumers/recluster-job.ts` is the consumer logic,
  `recluster.ts` / `seed-step.ts` the Forge wiring.
- Index encoding (`services/index-store.ts`): `event.status` + `proposalId` (`c:<clusterId>`
  suggestion, `p:<key>` HAC group, `n:<clusterId>` novel with nearest, `f:` first of its kind).
- Extra KVS keys beyond §7.4: `undo:<issueKey>` (undo stack, 30-day TTL) and `diag:attachments`
  (last attachment-upload outcome per path, for diagnostics).

## How the pieces fit

- **Services** (`src/services/`) take a `Ports` object and call the pure engine
  (`@tt/engine`). They never import `@forge/*`. Resolvers, action handlers and consumers are thin
  wrappers that build `Ports` from the Forge runtime and call a service.
- **Auth is explicit at every call site**: `ports.jira.asUser()` for anything a human triggered
  (and for authorising index-derived data, §14), `ports.jira.asApp()` in consumers. Only the user
  port has `getMyPermissions`/`getMyself`. TWG exists only on user invocations (`ports.twg` is
  undefined in consumers, §8).
- **Errors are values**: every port returns `PortResult<T>` (`{ok:true,value}` or
  `{ok:false,error:{kind,…}}`). `isForbiddenOrNotFound` maps to the action status
  `forbidden-or-not-found` without leaking which one.
- **Tests run on fakes**: `createMemoryWorld()` gives a deterministic Jira site (ids from 20001,
  keys `TTDEMO-1…`), storage, queues, TWG directory, `FakeClock` and `SequentialIds`.
  `world.ports({ accountId })` is a resolver/action invocation; `world.ports({})` is a consumer.
  Fault injection (`site.failNext("setIssueProperty", "rate-limited")`) and SPIKE simulations
  (`aliasesIndexed: false` for SPIKE-E1, `searchReturnsProperties: false` for SPIKE-E3,
  `projectCreation: "nobody"` for SPIKE-S1, `attachmentUpload` for SPIKE-I2) cover the §15 paths.

The JQL fake understands: `=`, `!=`, `>`, `>=`, `<`, `<=`, `~`, `IN`, `NOT IN`, `IS [NOT] EMPTY`,
`AND`, `OR`, `NOT`, parentheses and `ORDER BY` on `project`, `issuetype`, `labels`, `key`,
`summary`, `text`, `component`, `reporter`, `created`, `updated` and the manifest's property
aliases. Anything else is a 400, as in Jira. Keep production JQL inside this subset.

## Commands

From the repository root:

```bash
pnpm install
pnpm check                     # typecheck (incl. ui-shared + static/*) + lint + tests + validate:manifest
pnpm build                     # what forge deploy needs: engine/seedgen dist + Vite builds of board/panel/intake
pnpm validate:manifest:strict  # also fails when a resource path (static/*/dist) is missing
pnpm check:size                # §13: ≤ 1.2 MB gzip per Custom UI resource; JPEG decoder only in intake
pnpm check:bundle              # Forge CLI's webpack configs, offline (skips if @forge/cli is not installed)
pnpm check:deploy              # build + strict manifest + sizes + bundle check
```

## Deploying (needs the developer's Atlassian account; NOT YET RUN)

None of these steps has been executed. They need an Atlassian API token, which is never committed
and never written into this repository. Platform behaviour marked SPIKE-* is still unverified;
[docs/SPIKES.md](../../docs/SPIKES.md) lists the check that closes each one. Expect `forge lint` to
report manifest details the offline schema does not catch (SPIKE-M1). CI's `deploy-staging.yml`
is skipped until the `FORGE_EMAIL` / `FORGE_API_TOKEN` secrets exist and the app is registered.

1. Install the CLI (pinned major 15, ARCHITECTURE §16.4) and log in non-interactively:

   ```bash
   npm install -g @forge/cli@15.1.0
   forge settings set usage-analytics false
   export FORGE_EMAIL="you@example.com"          # your Atlassian account email
   export FORGE_API_TOKEN="<api token>"            # from id.atlassian.com → Security → API tokens
   forge whoami                                    # verifies the token
   ```

2. Register the app. This replaces the placeholder
   `ari:cloud:ecosystem::app/00000000-0000-0000-0000-000000000000` in `manifest.yml` with the real id:

   ```bash
   cd apps/forge
   forge register "Takeover Triage"               # CLI 15.1: `forge register [options] [name]`
   ```

3. Build (engine/seedgen dist and the Custom UI bundles), check, lint and deploy to development:

   ```bash
   pnpm check:deploy                               # from the repository root
   forge lint
   forge deploy -e development --non-interactive --inspect
   ```

4. Install on the demo site (Jira only). TWG scopes need an organization admin to grant them:

   ```bash
   forge install --site <demo-site>.atlassian.net --product jira -e development --non-interactive
   ```

5. Later (ARCHITECTURE §16.4): `forge deploy -e staging`, `forge eligibility -e staging` for Runs on
   Atlassian, and the same with `production` for the release.
