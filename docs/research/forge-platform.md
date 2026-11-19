# Forge platform capabilities (state as of 2026-11-19)

Researched 2026-11-19. Most of this comes from the live developer.atlassian.com pages, fetched with curl. Each page's own "Last updated" date is given in parentheses, because Forge changes fast. Labels used below:
- **VERIFIED**: read on an official Atlassian page.
- **INFERRED** or **UNCERTAIN**: my own reasoning, or something I could not confirm.

---

## Key facts

1. **Node / CLI.** VERIFIED. The Forge CLI needs Node **22.x (>=22.23.4) or 24.x (>=24.22.1)**. The latest `@forge/cli` on npm is **15.1.0**, published 2026-11-09, with `engines.node = ^22.23.4 || ^24.22.1 || >=26.12.1`. Function runtimes are `nodejs24.x | nodejs22.x | nodejs20.x`. Node 20 reached end-of-life on 2026-04-30, so use `nodejs24.x` or `nodejs22.x`. [getting-started (Aug 26 2026)], [nodejs-runtime (Sep 21 2026)], [npm registry].
2. **CI deploy with a token works.** VERIFIED. Set the `FORGE_EMAIL` and `FORGE_API_TOKEN` environment variables. The token is an **Atlassian API *scoped* token** created with "Create API token with scopes" with Forge selected as the app. When these are set, the CLI uses them without `forge login` and ignores the keychain. This is also the documented route for headless Linux machines without libsecret. Non-interactive install: `forge install --upgrade --site X --product jira --non-interactive -e staging`. [getting-started], [set-up-cicd (Dec 11 2025)].
3. **Function limits.** VERIFIED. [limits-invocation (Sep 1 2026)].
   - Runtime: UI resolver and user invocations get **25 s**. Web triggers, actions and `rovo:agentConnector` get **55 s**. Async-event consumers and scheduled triggers can run up to **900 s (15 min)** with `timeoutSeconds`; their default is 55 s.
   - Memory: up to **1024 MB** (512 MB by default, set with `runtime.memoryMB`).
   - Payloads: **5 MB** invocation payload. Front-end `invoke` request **500 KB**, response **5 MB**.
   - Egress: **100 egress requests per runtime-minute**.
   - Disk: **512 MB** of `/tmp`.
4. **Storage options.** VERIFIED. [storage-reference (Sep 28 2026)].
   - KVS and Custom Entity Store (`@forge/kvs`): GA.
   - **Forge SQL**: GA. It is TiDB/MySQL-compatible with one database per installation. Dev installs are capped at 128 MiB and production at 1 GiB.
   - **Object Store**: **Preview**. Objects up to 1 GB. Not supported on Bitbucket.
5. **Forge LLMs is GA** (announced 2026-07-29). VERIFIED.
   - Package `@forge/llm` with `chat()`, `stream()`, `list()` and tool calling. It needs an `llm` module in the manifest (`model: [claude]`).
   - Models: Claude Haiku 4.5, Sonnet 4.5/4.6/5, Opus 4.6/4.7/4.8/5.
   - Text only.
   - Limits: 100 requests/min and 500k tokens/min per installation.
   - The app **stays eligible for Runs on Atlassian**.
   - **There is NO free allowance. All tokens are billed to the developer.** For example, Haiku 4.5 costs $1/$5 per 1M input/output tokens and Opus 4.6 costs $5/$25. [forge-llms-api (Jul 23 2026)], [forge-llms-api-pricing (Jul 23 2026)], [forge-llms-models (Aug 3 2026)], [GA blog].
6. **Forge pricing is live.** VERIFIED. Billing began 2026-01-01, with invoices from 2026-02-01. Each app gets a free monthly allowance, for example 200,000 GB-s of compute, 0.1 GB of KVS reads and 0.1 GB of KVS writes. **LLM and Containers have no free allowance.** Usage in dev and staging environments **is billed**. No payment method is needed while usage stays within the free threshold. Going over it starts a 14-day "pre-dunning" period. [forge-platform-pricing (Aug 12 2026)], [billing-for-developer-spaces (Aug 25 2026)].
7. **Runs on Atlassian (RoA).** VERIFIED. The badge is applied automatically when an app does not egress data (analytics egress is the only exception) and uses only Atlassian compute and storage. Check it with `forge eligibility`. The following break eligibility: Forge Remote, `permissions.external.fetch.backend` egress, and **dynamic** web triggers (only *static* web triggers qualify). Forge LLMs and Forge Containers keep eligibility. [runs-on-atlassian (Aug 24 2026)], [web-trigger module (Oct 13 2026)], [containers-reference (Nov 11 2026)].
8. **Forge Containers is in Preview.** VERIFIED. Services are stateless, have no `@forge/*` SDK (they use REST only), and must run as a non-root user with UID 1000. They are deployed through `forge deploy`. Adding one is a major version bump. They are billed per vCPU-hour and GiB-hour with **no free allowance**. [containers-reference (Nov 11 2026)], [pricing].
9. **Forge Workflows (`@forge/workflows`) is in EAP.** VERIFIED; the page was updated on the day of research (Nov 19 2026). It provides typed task chains with fan-out, retries, sleep and waitForSignal, built on async events. **It needs an EAP sign-up and the API may change.** [workflows-api (Nov 19 2026)].
10. **Distribution.** VERIFIED. Deploy to **production**, then go to Developer Console → Distribution → Edit → "Sharing" (or "Sharing within organization"), select the products, and copy the installation link. Only a site admin can install from the link. An app that already has a `license` in the manifest or has been submitted to Marketplace cannot be shared by link. [distribute-your-apps (Oct 30 2026)].
11. **Test sites.**
    - `forge site provision` and `forge install --demo-site` give you a **demo site**: enterprise Jira, Confluence, JSM **and Rovo**, with seeded data, active for 90 days. VERIFIED. [provision-a-demo-development-site (Aug 14 2026)].
    - The classic free developer instance has 5 Jira users, 5 Confluence users and 1 JSM agent. VERIFIED. [marketplace getting-started (Apr 21 2026)]. The `go.atlassian.com/cloud-dev` short link itself could not be fetched from this sandbox (blocked by the proxy). Community pages say it points to the developer-site signup. UNCERTAIN.

---

## Details

### A. UI: UI Kit vs Custom UI (VERIFIED, [ui-kit/overview (Jul 7 2026)], [custom-ui (May 21 2026)], [user-interface (Mar 3 2025)])
- **UI Kit**
  - React-based. It uses `@forge/react` (with `react@18`) and renders natively in the host page with Atlassian Design System components. There is no React DOM, so custom HTML, portals and refs may not work.
  - It can load only images as resources. Entry point: `src/frontend/index.jsx` calling `ForgeReconciler.render`.
- **Custom UI**
  - Static HTML/JS/CSS in an **iframe**, built with any framework. Declared via `resources: [{key, path}]`, where `path` contains `index.html`.
  - Talks to the backend via `@forge/bridge` (`invoke`, `requestJira`, and so on).
  - External browser calls need `permissions.external.fetch.client` and other CSP entries. [add-content-security-and-egress-controls (Oct 7 2026)].
  - Multiple entry points per resource are in Preview.
- **Frame component.** Embeds a Custom-UI-style static bundle inside a UI Kit app, with an Events API for two-way messaging. This is a middle path for things like canvas or charting libraries.
- Tunnel hot-reload with UI works in Chrome and Firefox only. [tunneling (Oct 15 2026)].

### B. Module inventory (VERIFIED from the module index pages, fetched 2026-11-19)
- **Jira.** Source: [index-jira]. I took these module slugs from the index links and did not open each module page.
  - Panels and issue view: `jira:issuePanel`, issue context, issue glance, issue action, issue activity, issue-view background script.
  - Pages and dashboards: project page, project settings page, global page, admin page, personal settings page, dashboard gadget, dashboard background script, global background script.
  - Workflow: workflow **validator**, **condition**, **post function**.
  - Actions: backlog, board, sprint and issue-navigator actions, command palette.
  - Fields and query: custom field, custom field type, entity property, JQL function.
  - Other: UI modifications, time-tracking provider, global and project permission, action validator.
- **Confluence.** Source: [index-confluence]. `macro`, content byline item, content action, context menu, **page banner**, global page, global settings, space page, space settings, custom content, homepage feed, background script, content property.
- **JSM.** Source: [index-jsm].
  - Portal: header, footer, subheader, request detail, request detail panel, request view action, request-create property panel, profile panel, user menu action.
  - Other: **queue page**, organization panel, Assets import type, JSM UI modifications.
- **Bitbucket.** Source: [index-bitbucket].
  - Checks and pipelines: **`bitbucket:mergeCheck`**, dynamic pipelines provider.
  - Repository pages and panels: main menu page, settings menu page, code overview card/panel/action, code file viewer, PR action, PR card, PR overview panel.
  - Project and workspace pages: project settings menu page, workspace global page, workspace settings page, workspace personal settings page.
  - Merge checks are triggered by PR-specific events and must return pass or fail. A workspace admin must enable "Custom merge checks", and the check is configured at repo, project or workspace level as Required or Not required. [bitbucket-merge-check (Jan 13 2026)].
- **Common.** Source: [index-common]. `function`, `trigger` (product events), `scheduledTrigger`, `webtrigger`, `consumer` (async events), `event`, `api-route`, `llm`, `sql`, `object-store`, `pre-uninstall-trigger`.
- **Global.** `global-full-page`, `global-ui`. [index-global].
- **Automation.** `automation-action` (Jira automation action). [index-automation].
- **Rovo.** Source: [rovo-index (Oct 29 2026)]. `rovo:agent`, `action`, `rovo:skill` (Preview), `rovo:mcp` (Preview; exposes actions as tools in Rovo Studio), and `rovo:agentConnector` (remote agents that can be assigned to Jira work items and @mentioned).
- **Teamwork Graph.** `teamwork-graph-connector` (ingests data into the Teamwork Graph) and `teamwork-graph-smart-link`. [index-teamwork-graph (Oct 7 2025)].
- Limit: **150 modules per app**, 10 resources per app, 25 environments per app, 100 MB app size, and 100 apps per developer. [limits-app-developer (Dec 1 2025)].

### C. Triggers and background work (VERIFIED)
- **Product event `trigger`.** Source: [trigger module (Oct 9 2026)], [events-reference/jira].
  - Subscribes to events such as `avi:jira:created:issue`, `avi:jira:updated:issue`, `avi:jira:commented:issue`, `avi:jira:assigned:issue`, `avi:jira:mentioned:comment`, `avi:jira:viewed:issue`, `avi:jira:created:worklog` and `avi:jira:released:version`. There are about 60 Jira event types; Confluence and Bitbucket have their own.
  - **Delivery can take up to 3 minutes** (queued and asynchronous). Plan for this in a live demo.
  - Supports `filter` (`ignoreSelf`, `expression`), `payload.include.propertyPaths`, and dynamic modules created at runtime via `/forge/installation/v2/dynamic/module/`.
- **`scheduledTrigger`.** Source: [scheduled-trigger module (Jun 17 2026)], [limits-scheduled-trigger].
  - Intervals: `fiveMinute | hour | day | week`. At most **5 per app** and only **1 at fiveMinute**.
  - The first run happens about 5 minutes after deploy. Runs are spread across installations and duplicates are possible. Errors are not retried.
  - Supports `timeoutSeconds` up to 900 and the filter `appIsLicensed`.
- **`webtrigger`.** Source: [web-trigger module (Oct 13 2026)], [runtime web-trigger].
  - Get the URL with `forge webtrigger create` or the runtime API. There is **no auth by default**, so implement your own.
  - Web triggers are "dynamic" by default, which counts as egress and breaks RoA. Use the "static" type to stay eligible.
  - Management limits: Get 1,000/min, Create 500/min, Delete 500/min.
- **Async events.** `@forge/events` `Queue({key}).push(...)` delivers to a `consumer` module. Source: [async-events-api (Sep 1 2026)], [limits-async-events (Feb 26 2026)].
  - Delays up to 15 min (`delayInSeconds`). Concurrency control uses a key and a limit. Retries carry `retryContext`.
  - Limits: 50 events per push, **500 events/min per installation**, 200 KB per push (100 KB per event for long-running consumers), retryData up to 4 KB, cyclic depth 1000.
- **Realtime.** Forge Realtime exists, and there is a tutorial on long-running LLM jobs using it. I did not read its limits page. [limits-realtime] was not fetched.

### D. Storage (VERIFIED)
- **KVS and Custom Entity Store** (`@forge/kvs`). Source: [limits-kvs-ce (Sep 28 2026)].
  - Throughput: 1000 RPS per installation. 4000 reads and 4000 writes per minute, counted in 10 KB units, so batching helps.
  - Size and shape: keys up to 500 characters; values up to **240 KiB**; object depth 31.
  - Transactions: up to 25 operations and 4 MB.
  - Custom entities: up to 20 per app, 7 indexes and 50 attributes each. A complex query allows up to 100 conditions (`beginsWith`, `contains`, `isGreaterThan`, and so on). Use `kvs.setSecret` for secrets.
- **Forge SQL.** Source: [storage-reference/sql (Jun 17 2026)], [limits-sql (Dec 1 2025)].
  - Storage per install: 1 GiB in prod, 256 MiB in staging, 128 MiB in dev or custom environments.
  - Rates and query limits: 200 tables, 150 DML RPS, 25 DDL per minute, 16 MiB memory per query, 4 MiB response, 5 s SELECT timeout. No foreign keys and one statement per call.
  - The schema is managed through queued DDL and a migration runner, run from a scheduled trigger or consumer.
  - Adding `sql` to an existing app is a major version bump.
- **Object Store (Preview).** Source: [storage-reference/object-store (Sep 28 2026)], [limits-object-store].
  - Objects up to 1 GB. 5000 requests/min and 1000 pre-signed URL requests per second per installation.
  - Uploads and downloads must use the frontend components (UI Kit FilePicker / FileCard / `useObjectStore` hook). Adding it is a major version bump. Keeps RoA eligibility.
- All hosted storage is per installation **and per product**: Jira data is not visible from Confluence. Data is kept for 28 days after uninstall. [storage-reference].

### E. Egress, Remote, Containers (VERIFIED)
- **Backend egress.** Declare hosts under `permissions.external.fetch.backend`; otherwise calls from functions fail. `forge lint --fix` adds missing entries automatically. Changing permissions means a major version and admin re-consent (`forge install --upgrade`). Customer-managed egress is available via `permissions.external.configurable.enabled`. [runtime-egress-permissions (Oct 7 2026)].
- **Client-side egress and CSP** (Custom UI): `permissions.external.fetch.client`, plus fonts, images, styles, scripts and frames. [add-content-security-and-egress-controls].
- **Forge Remote** is GA; no Preview banner was seen. It calls your own backend from the frontend or from functions, and can send events and scheduled triggers to a remote. The remote can call back into Atlassian APIs and Forge storage via GraphQL using the Forge Invocation Token. **Using it makes the app ineligible for RoA.** Events sent to Forge Remote have a **5 s** runtime limit. [remote (May 22 2026)], [limits-invocation].
- **Forge Container services (Preview).** You run your own container images on Atlassian compute. It is "fully supported" but opt-in, with a shorter deprecation window.
  - Containers are stateless and reach Forge storage only via REST. Image tags are immutable. Service key is limited to 19 characters. Deployment is canary-based, and service deletion requires a support ticket.
  - Container REST API limits: `/v1/installations` 100/min and `/v1/installation/<id>` 10/min per app.
  - Sources: [containers-reference (Nov 11 2026)], [limits-containers (Oct 15 2026)].

### F. Environments and CLI (VERIFIED)
- **Environments.** `forge create` sets up `development`, `staging` and `production`, plus custom dev environments via `forge environments create` (up to 25). Source: [environments-and-versions (Oct 30 2024)].
  - App title suffix: `(DEVELOPMENT)` or `(STAGING)`.
  - `forge tunnel` **only works in development** and custom dev environments; `forge logs` does not work in production.
  - Env vars: `forge variables set [--encrypt] KEY val -e <env>`. A redeploy is needed after changes. In a tunnel, use the prefix `FORGE_USER_VAR_`.
- **CLI commands** (from the sidebar of [cli-reference]): assistant, autocomplete, build, console, containers, create, custom-scopes, deploy, developer-spaces, eligibility, environments, feedback, install, list, lint, login, logout, logs, manifest, module, providers, register, settings, show, site, storage, tunnel, uninstall, variables, version, webtrigger, whoami.
- **`forge install` options** include `--site`, `--product`, `--demo-site`, `--upgrade`, `--confirm-scopes`, `--non-interactive`, `--license`, `--major-version`, `-e`. [cli-reference/install (Oct 12 2026)].
- **`forge eligibility [-e env] [-v major]`** reports whether the app is RoA-eligible and why not. [cli-reference/eligibility (Oct 12 2026)].
- **Tunnel** runs functions locally via **Cloudflare** (CLI 10.1.0 and later) and watches files to rebuild. [tunneling (Oct 15 2026)].
- **Developer Spaces.** Every new Forge app must be created in a Developer Space, which is the unit of billing. [developer-spaces-introduction (Dec 10 2025)].

### G. Network hosts the CLI contacts (VERIFIED, [use-forge-cli-on-corporate-network (Aug 17 2026)])

| Host | Purpose | Needed? |
|---|---|---|
| `api.atlassian.com` | GraphQL backend for all CLI operations, including login | Required |
| `forge-templates-bifrost.prod-east.frontend.public.atl-paas.net` | Templates for `forge create` (CLI 12.20.1 and later) | Required |
| `forge-templates.us-west-2.prod.public.atl-paas.net` | Legacy templates; deprecated, removed after 2026-11-26 | Only for CLI before 12.20.1 |
| `forge-node-runtime.prod-east.frontend.public.atl-paas.net` (CNAME of `d1i66qtumh4yze.cloudfront.net`) | Runtime packages | Required to deploy |
| `forge-cdn-tmp-prod.s3.us-west-2.amazonaws.com` | Upload of UI Kit and Custom UI resources | Required to deploy UI |
| `deployment-artifacts-914424261525-us-west-2.s3.us-west-2.amazonaws.com`, `deployment-artifacts-372253104996-us-west-2.s3.us-west-2.amazonaws.com`, `deployment-artifacts-149731130117-us-west-2.s3.us-west-2.amazonaws.com` | App bundle upload (depends on shard) | Required to deploy (allow all 3) |
| `registry.npmjs.org`, `github.com`, `objects.githubusercontent.com` | CLI install and dependencies | Required |
| `developer.atlassian.com` | `forge lint` downloads OpenAPI specs to check scopes | Optional (use `--no-verify` to skip) |
| `as.atlassian.com`, `o55978.ingest.sentry.io`, `app.launchdarkly.com` | Analytics, errors, feature flags | Optional |
| Cloudflare tunnel endpoints | `forge tunnel` | Optional |
| `forge-outbound-proxy.services.atlassian.com` | Egress from the app is routed through this; it matters when TLS inspection is on during a tunnel | Tunnel with egress |

Proxy support: `forge settings set proxy http://...` or `FORGE_PROXY`. The docs also mention `TUNNEL_NO_TLS_VERIFY=true` for TLS interception during a tunnel. Turn off usage tracking with `forge settings set usage-tracking false` (corporate-network page) or `usage-analytics false` (CI page).

### H. Distribution (VERIFIED, [distribute-your-apps (Oct 30 2026)])
- **Statuses**
  - Not sharing: only contributors can install, via the CLI.
  - Sharing within organization: only users in the app owner's org can install.
  - Sharing: anyone with the link can install.
- **Steps:** `forge deploy -e production` → Developer Console → app → Distribution → Edit → Sharing → fill in app details → select products. If you select both Jira and Confluence, the app installs only on sites that have both. Then copy the installation link.
- You can regenerate the link, which disables the old one.
- Updates reach users through Connected apps or the link. Bulk upgrades (`forge version bulk-upgrade`) work for major versions that do not escalate privileges.

---

## Uncertainties / open questions
- **Tunnel Node version.** The tunneling page says to match the "currently Node.js 20" runtime. The runtime page says Node 20 reached end-of-life on 2026-04-30, and the CLI requires Node 22 or 24. The tunnel page is probably stale. INFERRED: use Node 22 or 24 locally and `nodejs22.x` or `nodejs24.x` in the manifest.
- **The CI/CD tutorial is stale** (Dec 2025). It uses `node:18` and suggests pinning `@forge/cli@12`. The current CLI is 15.1.0 and needs Node 22 or later. INFERRED: use a `node:22` or `node:24` image and pin `@forge/cli@15`.
- **LLM billing and payment method.** The GA blog says you need no "changes to your app's billing setup", but LLM use has no free tier. So any LLM call creates a cost above $0, which would start pre-dunning if no payment method is on file. UNCERTAIN whether LLM calls are blocked without a payment method. I found no page that says so. Cost is likely tiny, cents, for hackathon testing. INFERRED: add a payment method to the Developer Space before the demo.
- **Forge Containers access.** It is Preview and "opt-in", but I did not find the exact opt-in steps or whether a sign-up is needed. Check the roadmap and "Managing a service" pages if containers are considered.
- **Forge Workflows** is EAP, behind a sign-up form, and was updated today. Do not depend on it for a Dec 22 deadline unless access is confirmed. Plain async events cover the same need.
- **Changelog.** The Forge changelog page renders client-side and could not be scraped, so I did not review recent breaking changes from the last 30 days. Look in a browser: https://developer.atlassian.com/platform/forge/changelog/
- **Realtime limits** and individual module pages (issue glance, page banner and others) were not opened; only their existence was verified from the index pages.
- **`go.atlassian.com/cloud-dev`** was not reachable from this sandbox. The demo-site route (`forge site provision`) is documented and includes Rovo, so it is probably the better choice.
- **Rovo on demo vs developer sites.** The demo site explicitly includes Rovo. Whether the free 5-user developer instance has Rovo enabled is not verified here (belongs to the Rovo research topic).

---

## Implications for idea selection
1. **AI ideas should use Forge LLMs, not external OpenAI or Anthropic keys.** Forge LLMs is GA, needs no API keys, offers Claude Sonnet 5 and Opus 5, and keeps the app **eligible for Runs on Atlassian**. An external AI call adds a `fetch.backend` entry, which is egress and loses RoA. Budget: each token costs money (Haiku 4.5 is $1/$5 per 1M tokens), and the limit is 100 requests/min per installation. There is no image input, so **CV ideas for an ADAS background cannot send images to Forge LLMs**. Any CV inference would need Containers (Preview, paid, opt-in) or an external remote (loses RoA).
2. **Timeouts shape the architecture.** UI resolvers get 25 s. Anything with an LLM or bulk work should run in an async-event consumer (up to 15 min) and push progress via storage polling or Realtime. LLM inference itself is capped at 5 minutes.
3. **A live demo must tolerate event latency of up to 3 minutes** for product-event triggers. For an instant "wow", trigger from the UI with an explicit action button or resolver rather than relying on `avi:jira:updated:issue` during the video.
4. **Storage choice.** KVS or custom entities cover most hackathon needs; values are limited to 240 KiB. Forge SQL is available if relational queries help (128 MiB in dev). Object Store (Preview) can hold uploaded files such as logs, traces, or ADAS test artifacts up to 1 GB, but the UI must use its FilePicker components, and it is not available on Bitbucket.
5. **Bitbucket merge checks plus Jira workflow validators** are verified, well-documented module types. They are good hooks for "quality gate" or "traceability" ideas, for example ADAS requirements → tests → PR gating. A merge check needs a workspace admin to enable custom merge checks in your own test workspace, which is easy to do yourself.
6. **Rovo plus Teamwork Graph modules** (`rovo:agent`, `action`, `rovo:skill`, `rovo:mcp`, `teamwork-graph-connector`) are first-class Forge modules. Skill and MCP are in Preview. Rovo credits are paid by the customer, not the developer. See the separate Rovo research.
7. **Avoid EAP-only features** (Workflows) unless access arrives quickly. Preview features (Object Store, Containers, rovo:skill, rovo:mcp) are usable in production but are opt-in.
8. Keep under 150 modules and 5 scheduled triggers. Use static web triggers if any are needed, to stay RoA-eligible.

---

## Action items (developer)
1. Install Node 22 or 24 (`nvm install 22`), then `npm i -g @forge/cli@15`.
2. Create an **Atlassian API scoped token** with Forge selected as the app: https://id.atlassian.com/manage-profile/security/api-tokens. Use it with `forge login`, or export `FORGE_EMAIL` and `FORGE_API_TOKEN` for headless or CI use.
3. Get a test site: `forge site provision` gives a demo site with Jira, Confluence, JSM and Rovo for 90 days, or use the free developer site via https://go.atlassian.com/cloud-dev.
4. Open the Developer Console (developer.atlassian.com → profile → Developer Console) and create or confirm a **Developer Space**. **Add a payment method** if you plan to use Forge LLMs or Containers, because neither has a free allowance. https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/
5. Optional: sign up for the Forge Workflows EAP, linked from https://developer.atlassian.com/platform/forge/runtime-reference/workflows-api/.
6. Before submitting: run `forge deploy -e production`, then in the Developer Console go to Distribution → **Sharing** to get the installation link for judges. Do NOT add a `license` to the manifest, because a licensed app cannot be shared by link.
7. Run `forge eligibility -e production` to confirm Runs on Atlassian status, if that is relevant to the judging criteria (see rules research).

---

## Sources
- [getting-started] https://developer.atlassian.com/platform/forge/getting-started/ (Aug 26 2026)
- [nodejs-runtime] https://developer.atlassian.com/platform/forge/function-reference/nodejs-runtime/ (Sep 21 2026)
- [runtime-reference] https://developer.atlassian.com/platform/forge/runtime-reference/
- [npm registry] https://registry.npmjs.org/@forge/cli (latest 15.1.0, published 2026-11-09)
- [set-up-cicd] https://developer.atlassian.com/platform/forge/set-up-cicd/ (Dec 11 2025)
- [use-forge-cli-on-corporate-network] https://developer.atlassian.com/platform/forge/enterprise/use-forge-cli-on-corporate-network/ (Aug 17 2026)
- [limits overview] https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/
- [limits-invocation] https://developer.atlassian.com/platform/forge/limits-invocation/ (Sep 1 2026)
- [limits-async-events] https://developer.atlassian.com/platform/forge/limits-async-events/ (Feb 26 2026)
- [limits-kvs-ce] https://developer.atlassian.com/platform/forge/limits-kvs-ce/ (Sep 28 2026)
- [limits-sql] https://developer.atlassian.com/platform/forge/limits-sql/ (Dec 1 2025)
- [limits-object-store] https://developer.atlassian.com/platform/forge/limits-object-store/ (Sep 28 2026)
- [limits-llm] https://developer.atlassian.com/platform/forge/limits-llm/ (Sep 30 2026)
- [limits-containers] https://developer.atlassian.com/platform/forge/limits-containers/ (Oct 15 2026)
- [limits-web-trigger] https://developer.atlassian.com/platform/forge/limits-web-trigger/ (Dec 1 2025)
- [limits-scheduled-trigger] https://developer.atlassian.com/platform/forge/limits-scheduled-trigger/ (Dec 1 2025)
- [limits-app-developer] https://developer.atlassian.com/platform/forge/limits-app-developer/ (Dec 1 2025)
- [storage-reference] https://developer.atlassian.com/platform/forge/storage-reference/ (Sep 28 2026)
- [storage-reference/sql] https://developer.atlassian.com/platform/forge/storage-reference/sql/ (Jun 17 2026)
- [storage-reference/object-store] https://developer.atlassian.com/platform/forge/storage-reference/object-store/ (Sep 28 2026)
- [forge-llms-api] https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api/ (Jul 23 2026)
- [forge-llms-api-reference] https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-reference/ (Aug 3 2026)
- [forge-llms-models] https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-models/ (Aug 3 2026)
- [forge-llms-api-pricing] https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/ (Jul 23 2026)
- [llm module] https://developer.atlassian.com/platform/forge/manifest-reference/modules/llm/ (Jul 23 2026)
- [GA blog] https://www.atlassian.com/blog/development/forge-llms-api-is-now-ga-heres-how-you-can-build-ai-native-apps-on-atlassian (Jul 29 2026)
- [forge-platform-pricing] https://developer.atlassian.com/platform/forge/forge-platform-pricing/ (Aug 12 2026)
- [billing-for-developer-spaces] https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/ (Aug 25 2026)
- [developer-spaces-introduction] https://developer.atlassian.com/platform/forge/developer-space/developer-spaces-introduction/ (Dec 10 2025)
- [runs-on-atlassian] https://developer.atlassian.com/platform/forge/runs-on-atlassian/ (Aug 24 2026)
- [runtime-egress-permissions] https://developer.atlassian.com/platform/forge/runtime-egress-permissions/ (Oct 7 2026)
- [add-content-security-and-egress-controls] https://developer.atlassian.com/platform/forge/add-content-security-and-egress-controls/ (Oct 7 2026)
- [remote] https://developer.atlassian.com/platform/forge/remote/ (May 22 2026)
- [containers-reference] https://developer.atlassian.com/platform/forge/containers-reference/ (Nov 11 2026)
- [workflows-api] https://developer.atlassian.com/platform/forge/runtime-reference/workflows-api/ (Nov 19 2026)
- [build-long-running-workflows] https://developer.atlassian.com/platform/forge/build-long-running-workflows/ (Nov 19 2026)
- [environments-and-versions] https://developer.atlassian.com/platform/forge/environments-and-versions/ (Oct 30 2024)
- [staging-and-production-apps] https://developer.atlassian.com/platform/forge/staging-and-production-apps/ (Oct 30 2024)
- [cli-reference] https://developer.atlassian.com/platform/forge/cli-reference/
- [cli-reference/install] https://developer.atlassian.com/platform/forge/cli-reference/install/ (Oct 12 2026)
- [cli-reference/eligibility] https://developer.atlassian.com/platform/forge/cli-reference/eligibility/ (Oct 12 2026)
- [tunneling] https://developer.atlassian.com/platform/forge/tunneling/ (Oct 15 2026)
- [distribute-your-apps] https://developer.atlassian.com/platform/forge/distribute-your-apps/ (Oct 30 2026)
- [provision-a-demo-development-site] https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/ (Aug 14 2026)
- [marketplace getting-started] https://developer.atlassian.com/platform/marketplace/getting-started/ (Apr 21 2026)
- [ui-kit/overview] https://developer.atlassian.com/platform/forge/ui-kit/overview/ (Jul 7 2026)
- [custom-ui] https://developer.atlassian.com/platform/forge/custom-ui/ (May 21 2026)
- [user-interface] https://developer.atlassian.com/platform/forge/user-interface/ (Mar 3 2025)
- [index-jira] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jira/
- [index-confluence] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-confluence/
- [index-jsm] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-jsm/
- [index-bitbucket] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-bitbucket/
- [index-common] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-common/
- [index-global] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-global/
- [index-automation] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-automation/
- [rovo-index] https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-index/ (Oct 29 2026)
- [index-teamwork-graph] https://developer.atlassian.com/platform/forge/manifest-reference/modules/index-teamwork-graph/ (Oct 7 2025)
- [bitbucket-merge-check] https://developer.atlassian.com/platform/forge/manifest-reference/modules/bitbucket-merge-check/ (Jan 13 2026)
- [trigger module] https://developer.atlassian.com/platform/forge/manifest-reference/modules/trigger/ (Oct 9 2026)
- [events-reference/jira] https://developer.atlassian.com/platform/forge/events-reference/jira/
- [scheduled-trigger module] https://developer.atlassian.com/platform/forge/manifest-reference/modules/scheduled-trigger/ (Jun 17 2026)
- [web-trigger module] https://developer.atlassian.com/platform/forge/manifest-reference/modules/web-trigger/ (Oct 13 2026)
- [runtime web-trigger] https://developer.atlassian.com/platform/forge/runtime-reference/web-trigger/ (Oct 13 2026)
- [async-events-api] https://developer.atlassian.com/platform/forge/runtime-reference/async-events-api/ (Sep 1 2026)
- [whats-coming / release phases] https://developer.atlassian.com/platform/forge/whats-coming/ (Aug 28 2026)
- Not scraped (client-rendered): https://developer.atlassian.com/platform/forge/changelog/
