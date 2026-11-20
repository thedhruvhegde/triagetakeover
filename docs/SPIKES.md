# SPIKE status (2026-11-20)

This file tracks every platform assumption in [ARCHITECTURE §17](ARCHITECTURE.md#17-spike-register), [SEED_DATA §17](SEED_DATA.md#17-spike-register) and the build reports. For each one it gives the status after the offline build and the exact check that closes it on deploy day.

**The app has never been deployed.** The Forge CLI is installed (15.1.0) but not logged in. So nothing here has been seen on a real Jira site.

- **"addressed offline"** means the code has the documented fallback, is tested against in-memory fakes that simulate the failure, or both. It does **not** mean the platform behaves as assumed.
- **"pending (needs deployed app)"** means only a deployed app on a real site can answer the question.

Code marks each assumption with a `SPIKE-<id>` comment. To list them: `grep -rn "SPIKE-" apps packages --include=*.ts --include=*.tsx`.

## Deploy-day setup (run once, in order)

```bash
pnpm install --frozen-lockfile
pnpm check                      # typecheck + lint + tests + manifest
pnpm check:deploy               # build engine/seedgen dist + Vite x3, strict manifest, §13 budgets, Forge bundler check
npm install -g @forge/cli@15.1.0
forge settings set usage-analytics false
export FORGE_EMAIL=... FORGE_API_TOKEN=...   # never committed
forge whoami
cd apps/forge
forge register "Takeover Triage"            # replaces the placeholder app id in manifest.yml
forge lint                                   # closes SPIKE-M1 (or lists what to fix)
forge deploy -e development --non-interactive --inspect   # --inspect keeps the bundle for SPIKE-M2
forge install --site <demo>.atlassian.net --product jira -e development --non-interactive
forge logs -e development --since 15m       # watch while running the checks below
```

Next, in Jira:

1. Open **Apps → Takeover Triage setup**.
2. Open TTDEMO, or any project you administer.
3. Click **Run diagnostics** and pick one issue. Diagnostics reports pass, fail or unknown for: storage, entity property write, JQL property index, search returns properties, both TWG hops, attachment upload, Rovo (always unknown) and project creation.
4. Click **Load demo data** (seed 2029).

## ARCHITECTURE §17

| ID | Assumption (short) | Status | Closes on deploy day with |
|---|---|---|---|
| SPIKE-I1 | Property writes at our sizes, asUser (browser + resolver) | **addressed offline**: adapter refuses values over 32,768 B before sending and maps Jira's oversize 400 to `property-too-large`; codec keeps tt.event ≈ 10–20 KB; fakes enforce the limit. Exact 400 text unverified | Diagnostics "Entity property write" on a picked issue = pass; then commit one intake event and check `GET /rest/api/3/issue/{key}/properties/tt.event` size. Optional: PUT 8/16/31/33 KB from the browser console of the panel |
| SPIKE-I2 | Multipart attachment upload via requestJira (browser and asApp backend) | **addressed offline**: browser upload → resolver base64 fallback (≤ 360 KB decoded) → "Raw files not attached" banner; seed skips the attachments phase on 403 and keeps thumbnails (tested) | File one takeover through the intake with 1 CSV + 1 JPEG. Diagnostics "Attachment upload" shows which path worked. The seed's job record `attachments` = `done` (backend path) or `skipped` |
| SPIKE-I3 | Browser can read attachment bytes | **pending (needs deployed app)**; not built: attach mode asks the user to re-select files (the documented fallback) | Not needed for MVP. If wanted: `requestJira('/rest/api/3/attachment/content/{id}')` from the intake iframe console |
| SPIKE-I4 | jpeg-js decode time/bundle size in the iframe for 4 x 1080p | **partly addressed offline**: decoder only in the intake worker/lazy chunk (`pnpm check:size` enforces it); intake dist 177 KB gzip. Decode time in a real iframe not measured | Intake with 4 x 1080p JPEGs; time it with DevTools Performance (the app does not display timings). Budget ≤ 3 s |
| SPIKE-C1 | Atlaskit needs `unsafe-inline` styles; RoA still eligible | **pending (needs deployed app)**; manifest declares `styles: unsafe-inline` | Board loads with no CSP errors in the console; `forge eligibility -e development` passes |
| SPIKE-C2 | Custom UI issueAction modal width; bridge `Modal` with `extension.modal` context | **addressed offline**: intake reads `extension.modal`, else the issue action context; if neither, says so and points to the issue action | Open "Add telemetry" on an issue and "File takeover" on the board; both show the intake at `xlarge` |
| SPIKE-C3 | Same-origin module Web Worker allowed by CSP | **addressed offline**: main-thread fallback on worker error or 30 s timeout, lazy pipeline chunk (tested in jsdom) | Intake processes files; the console shows no worker CSP error (else the main-thread fallback runs) |
| SPIKE-C4 *(new)* | `view.theme.enable()` provides the `--ds-*` token CSS (dark mode) in Custom UI | **addressed offline**: `token()` fallbacks give a readable light page | Switch Jira to dark theme; board/panel follow it |
| SPIKE-M1 | Manifest syntax under CLI 15 (`consumer`, `app.storage.entities`, `jira:entityProperty`, `render: native`, `rovo:*`), queue `concurrency` option, UI Kit `ForgeReconciler.render` shape, consumer handler `(event) → event.body`, `InvocationErrorCode.FUNCTION_RETRY_REQUEST` | **addressed offline**: full `@forge/manifest` 13.8 validation (`pnpm validate:manifest:strict`, 0 errors, 0 warnings); manifest↔code test (`apps/forge/test/manifest.test.ts`) | `forge lint` = 0 errors; `forge deploy` succeeds; click Re-sync now and watch `forge logs` for the `tt-recluster` consumer run |
| SPIKE-M2 | Forge bundler resolves pnpm workspace packages | **addressed offline**: `pnpm check:bundle` runs the CLI's own `@forge/bundler` 7.3.2 webpack configs offline. It found and we fixed a real failure: webpack does not map `./x.js` → `x.ts`, so `apps/forge/src` now uses extensionless relative imports (ESLint enforces it). With that, `index`/`actions` bundle and load, all 12 handlers are exported, the UI Kit resources compile, and `@tt/engine`/`@tt/seedgen` resolve through the workspace symlinks to their prebuilt `dist/`. **Default path: workspace symlink → prebuilt dist (`pnpm build:engine`, part of `pnpm build`).** Not verified: upload/packaging by `forge deploy`, and what `"type": "module"` (bundler metadata `esm: true`) changes at runtime | `forge deploy --inspect`; then any panel load or "Triage now" runs without `Cannot find module` in `forge logs`. Fallback if packaging breaks: `file:` deps on `packages/*/dist` (ARCHITECTURE §17) |
| SPIKE-E1 | `jira:entityProperty` indexes `tt.event` paths for JQL; lag | **addressed offline**: Re-sync falls back to `labels = tt-takeover` (tested with `aliasesIndexed: false`) | Diagnostics "Property index for JQL" = pass after one committed event; JQL `ttV = 1` in the issue navigator |
| SPIKE-E2 | Custom entity composite partitions, page size, cursors, float/any, `FAIL_IF_EXISTS` error code, KVS error codes | **addressed offline**: adapter pages with cursors at ≤ 100, matches error codes structurally; fakes model paging | Load demo data (≈ 43 entity writes + index queries); the board shows 4 clusters; Re-sync now completes with counts equal to the board |
| SPIKE-E3 | `/search/jql` returns issue properties (may cap at 5 keys) | **addressed offline**: per-issue property GET fallback (tested with `searchReturnsProperties: false`) | Diagnostics "Search returns properties" = pass/fail; either way Re-sync completes |
| SPIKE-A1 | asUser consent UX in resolvers; asUser in actions; no asUser in consumers | **addressed offline**: consumers use asApp only; missing consent maps to `unauthorized` ("Allow access") and is no longer reported as "no access" by the permission check (fixed during integration) | First open of the panel as a new user shows the consent prompt; a Rovo action call returns data (not `forbidden-or-not-found`) |
| SPIKE-A2 | Shape of resolver/action/MCP context (`accountId`, `extension.issue.key`, string-typed inputs, `payload.context`) | **addressed offline**: read defensively; 7 assumed fixtures in `apps/forge/test/fixtures/contexts/` (labelled ASSUMED) | Log one scrubbed context per surface (`forge logs`), replace the fixtures with recordings, re-run `pnpm test`. If MCP callers can set `payload.context.accountId`, remove that fallback in `actions/invocation.ts` |
| SPIKE-S1 | Project (and component) creation with `manage:jira-project`; template | **addressed offline**: refusal → honest message, seed into a picked project with labels (tested) | Load demo data into TTDEMO on a site without it; diagnostics "Demo project creation" records the outcome |
| SPIKE-S2 | Seed throughput vs rate limits/egress; bulk create ≤ 50 | **partly addressed offline**: ≈ 315 Jira calls per default seed (≈ 181 before the board is ready), 8 events per step, 420 s budget per step, measured on fakes only | Time "Load demo data" on the demo site; board ready ≤ 60 s target. If slow: `frames: "fast"` |
| SPIKE-S3 | Consumers can create issues/properties/links asApp in the new project | **addressed offline**: refusal → job fails with an honest message (tested) | Seed step "Historical events" completes; issues show the app as reporter |
| SPIKE-V1 | – | N/A (cut 2026-11-19) | – |
| SPIKE-T1 | TWG curated query shapes (`atlassianUserInTeams`, `atlassianTeamMembers`), team ARI format | **addressed offline**: queries isolated in `TWG_QUERIES` (`adapters/forge/twg.ts`); schema mismatch → `error` with the GraphQL message, never invented data; routing falls back to component lead, then project role; when TWG gives no display name, the rule's label is used (fixed during integration) | Diagnostics TWG hops = pass; if not, fetch the schema (`/gateway/api/graphql/twg/schema`) and fix `TWG_QUERIES` |
| SPIKE-R1 | TWG from resolver, Rovo action, MCP | **addressed offline**: actions never return members (D8); TWG failure → `twgStatus` reported | Ask the agent "Who owns <cluster>?"; check `twgStatus` in the action result |
| SPIKE-T2 | TWG data through MCP is acceptable | **addressed offline**: team name only, never members (schema forbids `members`) | Docs/forum answer |
| SPIKE-R2 | Jira Team field writable, value format | **addressed offline**: falls back to component + comment | Configure the Team field in admin, click Route on a cluster |
| SPIKE-R3 | Rovo action latency, credits, CREATE-verb UX | **addressed offline**: `userConfirmed` friction, `needs-confirmation` envelope | Time the 4 conversation starters in Rovo chat (p95 ≤ 5 s); try "link it" and check the confirmation turn |
| SPIKE-R4 | App `rovo:skill` attaches to the agent | **addressed offline**: playbook also inlined in the prompt | Agent settings show the skill; "Run the Monday triage" follows the 5 steps |
| SPIKE-L1, L2 | – | N/A (cut 2026-11-19) | – |
| SPIKE-P1 | Resolver cold start + entity query latency fit §13 | **addressed offline**: no board cache (computed per request) | Time board and panel loads (DevTools network, `forge logs` durations) against ≤ 2 s / ≤ 1.5 s |
| SPIKE-D1 | Personal-data reporting for stored accountIds | **pending** (docs) | Read the current Forge personal-data docs |
| SPIKE-Q1 | Playwright login for bot-QA | **pending (needs deployed app)**; no bot-QA built yet | – |
| SPIKE-N1 | Product name/trademark | **pending** (search) | – |
| SPIKE-X1, X2 | Second demo site; Rovo on a free developer site | **pending** | `forge site provision` docs; check Rovo on the clean site |

## SEED_DATA §17

| ID | Status | Closes with |
|---|---|---|
| SPIKE-G1 | N/A (cut) | – |
| SPIKE-G2 | **pending (needs deployed app)**. Locally (fakes, this machine), the history step took ≈ 12 s CPU for 18 events at fast frames. Production defaults to `full` frames, which has not been timed in a consumer | Time the seed's history step in `forge logs`; switch the default to `fast` (`DEFAULT_SEED_FRAMES` in `services/seed/service.ts`) if a step nears the 420 s budget |
| SPIKE-G3 | **addressed offline**: `seedgen-render.test.ts` checks the low-sun and night bands after JPEG encode in Node | – |
| SPIKE-G4 | **measured offline, below the prototype**: onset power ≈ 66 % over seeds 0–999, against the prototype's ≈ 71 % (ARCHITECTURE changelog 2026-11-19). The default seed 2029 is regression-likely (p_holm ≈ 0.00077) | Decide before the params freeze (Dec 4) whether to raise LC-A's 4.12.0 rate |

## Not in the register (raised by the build reports)

| Assumption | Where | Status | Closes with |
|---|---|---|---|
| UI Kit `Link` with a site-relative `href` navigates inside Jira | `src/frontend/triage-view.tsx` (UNVERIFIED comment) | `router.navigate` fallback | Click an evidence link in "Triage now" |
| Package `"type": "module"` makes the bundler set `esm: true` in the deploy metadata. The function bundle itself is CommonJS (`[name].cjs`) | `apps/forge/package.json` | unknown; part of SPIKE-M2 | `forge deploy` and one function call |
| `NeedsAuthenticationError` is the consent signal for asUser | `adapters/forge/http.ts` | mapped to `unauthorized` | SPIKE-A1 check |
| Route mention `[~accountid:X]` becomes an ADF mention node | `adapters/forge/adf.ts` | converted in the adapter (tested) | Route a cluster; the comment shows an @-mention |
| Queue `concurrency {key, limit: 1}` option and key charset | `adapters/forge/queue.ts` | part of SPIKE-M1 | Two quick Re-sync clicks run one at a time (`forge logs`) |
