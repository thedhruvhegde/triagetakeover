# Rovo, MCP and Teamwork Graph: deep dive for Codegeist 2026

Research date: 2026-11-19. All doc pages were read through curl from developer.atlassian.com, codegeist2026.devpost.com and www.atlassian.com, and each one's "Last updated" date is noted. community.developer.atlassian.com (CDAC) was **blocked** by the network proxy, so CDAC threads are known only from search-result summaries. Those are marked UNCERTAIN.

Legend: **[V]** = verified on an official page; **[I]** = inferred or uncertain; **[C]** = community or third-party report, not verified.

---

## 1. Key facts

1. **What each bonus requires (from the official rules, live Devpost page) [V]** ([rules](https://codegeist2026.devpost.com/rules), [overview](https://codegeist2026.devpost.com/)):
   - *Best Agents – Rovo/Assignable agents* ($1,500 x 6): "a Forge app including the `rovo:agent` module, the `rovo:agentConnector` module, or apps with reusable `rovo:skill` and `rovo:action` modules that other agents can invoke as tools."
   - *Best app with Atlassian MCP* ($1,500 x 6): "a Forge app that exposes tools via the Atlassian MCP server using the `rovo:mcp` module. These can also be combined with open-source skill.md files which users can add to their third party agents."
   - *Best apps with Teamwork Graph integration* ($1,500 x 6): "connects data into the graph and/or consumes data from the Teamwork Graph API."
   - **"The same Submission can win up to one Grand Prize and one Bonus Prize."** [V] ([rules](https://codegeist2026.devpost.com/rules)). One app can *qualify* for all three bonuses but can **win only one**. The sponsor "reserve[s] the right to reassign a Project from one Category or Bonus Prize to another."
2. **Rovo on a dev site [V]:** The official Codegeist resources page says to run `forge site provision`. This gives a free demo site with Jira, Confluence, JSM, **Rovo Enterprise**, Studio and seeded data, active for 90 days. You then install with `forge install --demo-site` ([Devpost resources](https://codegeist2026.devpost.com/resources); [Provision a demo development site](https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/), updated Aug 14, 2026). Classic free developer sites (go.atlassian.com/cloud-dev) reportedly show **no Rovo Chat/agents** [C] ([CDAC thread](https://community.developer.atlassian.com/t/rovo-chat-agents-not-available-on-free-developer-site-for-codegeist-2026/103526), [CDAC thread 2](https://community.developer.atlassian.com/t/forge-rovo-agent-installed-but-rovo-not-visible-on-free-dev-site-codegeist-2026/103668)).
3. **Status by module (late 2026) [V]:**

   | Module / feature | Status | Source (last updated) |
   |---|---|---|
   | `rovo:agent` | No Preview/EAP banner on the page (GA) | [rovo-agent](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/) (Oct 2, 2026) |
   | `action` | No banner (GA) | [rovo-action](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/) (Aug 3, 2026) |
   | `rovo:skill` | **Preview**: deployable to dev, staging and prod | [rovo-skill](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/) (Oct 29, 2026) |
   | `rovo:agentConnector` | No banner; A2A 1.0; **Jira only** | [rovo-agent-connector](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/) (Oct 9, 2026) |
   | `rovo:mcp` | **Preview**; third-party client access is also Preview | [rovo-mcp](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) (Oct 29, 2026) |
   | Teamwork Graph API | **Preview** ("available to all users") | [scopes](https://developer.atlassian.com/platform/teamwork-graph/scopes/) (Sep 15, 2026) |
   | `requestTeamworkGraph` bridge | **Preview** | [bridge ref](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/requestTeamworkGraph/) (Nov 10, 2026) |
   | `graph:connector` (TWG connectors) | **GA** (announced Jun 25, 2026) | [Atlassian blog](https://www.atlassian.com/blog/development/building-teamwork-graph-connectors-forge) |

   None of these modules requires an EAP application on the current official pages. The one exception is the community reports about TWG API access in item 6.
4. **The Forge-hosted MCP endpoint is `https://mcp.atlassian.com/forge/<appId>`** [V]. Auth is OAuth 2.1 consent, over a remote (HTTP) MCP transport. Example: `claude mcp add --transport http ... https://mcp.atlassian.com/forge/<appId>`. External exposure is **off by default**: an admin must enable it per site in *Atlassian Administration > Apps > Sites > your site > Connected apps > [app] > Tools* ([rovo-mcp](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/); [MCP hello world](https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-mcp/), Oct 29, 2026).
5. **The Teamwork Graph API is read-only** [V]. It is GraphQL at `/gateway/api/graphql/twg`, using curated query fields or **persisted Cypher** queries. **Raw `cypherQuery` is unavailable to new apps.** The API always runs **as the user** (`api.asUser().requestTeamworkGraph` or the bridge); "Forge apps can't call the Teamwork Graph API as the app" ([call the TWG API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/), Feb 11, 2026; [bridge](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/requestTeamworkGraph/)). Writes into the graph go only through a `graph:connector` (`@forge/teamwork-graph` SDK, `graph.setObjects`), and the app must be **installed in Jira**.
6. **Risk [C]:** Several community threads report `"User is not permitted to query this organization"` from TWG. In one, the call works from a UI resolver but fails **inside a Rovo action**. Others report the error intermittently on some sites, and one Codegeist repo claims the org needed TWG API access via a form ([CDAC 104086](https://community.developer.atlassian.com/t/requestteamworkgraph-works-from-a-ui-resolver-but-returns-user-is-not-permitted-to-query-this-organization-inside-a-rovo-action/104086), [CDAC 103690](https://community.developer.atlassian.com/t/teamwork-graph-curated-fields-intermittently-return-user-is-not-permitted-to-query-this-organization/103690), [blast-radius repo](https://github.com/palashpawar/blast-radius)). I found **no official access-request form** on the current docs. **Spike this in week 1.**
7. **Possible "API or connector, not both" restriction [V, but stale]:** The TWG landing page says: "Currently, an app can either call the Teamwork Graph API or provide a custom connector, but it can't do both at the same time" ([Connecting to TWG](https://developer.atlassian.com/platform/teamwork-graph/), **updated Nov 19, 2025**, which is a year old). A newer page, [Querying data from Forge connectors](https://developer.atlassian.com/platform/teamwork-graph/querying-ingested-data/) (Feb 3, 2026), describes querying connector-ingested data via the API but does not say whether the same app can do both. **Assume the restriction still holds** unless a spike proves otherwise.

---

## 2. Details

### 2.1 `rovo:agent` [V] ([source](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/), Oct 2, 2026)
- Properties: `key` (req.), `name` (req., **at most 30 chars**), `description`, `icon` (resource path or absolute URL), `prompt` (req.; inline string or `resource:<key>;path/to/prompt.txt`, which needs CLI 10.6.0 or later), `conversationStarters[]`, `actions[]` (action module keys), `skills[]` (rovo:skill keys, Preview), `followUpPrompt`.
- Data access: an app-based agent sees only data in the workspace or product where the app is installed. For cross-product access, configure multi-app compatibility.
- Interaction points: the Rovo Chat side panel (Jira and Confluence), the `/ai` editor toolbar in Confluence and Jira, **Automation rules** (async; the response is available as a smart value), and programmatic launch via the Forge bridge `rovo` API.
- Guidance: keep agent-wide role and tone in `prompt`; put task-specific multi-step procedures in `rovo:skill`; put executable operations in `action`.
- Example:
```yaml
modules:
  rovo:agent:
    - key: risk-agent
      name: "My Risk Register Assistant"
      description: A Rovo Agent that helps you manage your project risks
      prompt: resource:agent-resource;prompts/agent-prompt.txt
      conversationStarters:
        - Fetch my active project risks
      actions: [fetch-all-risks, create-risk]
      skills: [risk-triage]          # Preview
resources:
  - key: agent-resource
    path: resource/agent
```
- Safety screening: Atlassian screens agents "at our sole discretion" and may block a deployment.

### 2.2 `action` module (the "rovo:action" in the rules) [V] ([source](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/), Aug 3, 2026)
- The manifest key is **`action`**, not `rovo:action`. Properties: `key`, `name`, `function` **or** `endpoint` (Forge Remote), `actionVerb` (`GET | CREATE | UPDATE | DELETE | TRIGGER`), `description` (the LLM uses it to decide when to call the action), and `inputs` (map of `inputName -> {title, type: string|integer|number|boolean, required, description}`).
- **Agents triggered by Automation will not invoke CREATE/UPDATE/DELETE/TRIGGER actions.** Only GET actions run from Automation.
- Data limit: **5 MB** per action.
- The handler receives `(payload, context)`. `payload` holds the LLM-extracted inputs plus a deterministic `payload.context` (cloudId, moduleKey, and a `jira{issueKey, projectKey…}` or `confluence{contentId, spaceKey…}` object). The user's `accountId` is in `context`. **Never use inputs for authorization.**
- The handler returns a string or JSON, which the agent turns into natural language.
- **Confirmation:** the current module reference has **no `confirmation` property**. I found nothing that documents a per-action confirmation flag [I]. Rovo's own UI behaviour for write verbs was not verified.
- The same `action` keys can be listed in `rovo:mcp.tools`, which exposes them to customer-built Rovo Studio agents and to external MCP clients.

### 2.3 `rovo:skill` (Preview) [V] ([source](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/), Oct 29, 2026)
- Manifest: `key`, `source.dir` (a directory containing `SKILL.md`), and optional `dependencies.tools[]` (action keys from the **same app**).
- `SKILL.md` follows the open **Agent Skills specification**. It needs YAML frontmatter with `name` (1–64 chars, lowercase or hyphens, must equal the directory name) and `description` (1–1,024 chars, aim for 50 or more). Optional fields: `compatibility`, `metadata`, `license`, and `allowed-tools` (space-separated; must include every dependency tool).
- Limits: body at most 500 lines (CLI warning); skill dir at most 100 MB; **no executable scripts**; **no skill-to-skill dependencies**; **no explicit invocation by name**, because the agent selects a skill by its description.
- A Forge agent can use only the skills listed in its own `skills` property. The docs do not say whether customer-built Rovo Studio agents can attach a Forge `rovo:skill` [I]. The rules' wording ("reusable rovo:skill and rovo:action modules that other agents can invoke as tools") suggests the actions-as-tools route goes through `rovo:mcp`.
- No extra scopes or consent step.

### 2.4 `rovo:agentConnector` [V] ([source](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/), Oct 9, 2026)
- Registers an **externally hosted AI agent** in **Jira only** (`productContexts: [jira]`). Users can **assign work items** to it, @mention it in comments, and chat with it in Rovo Chat. This is what the "Assignable agents" part of the bonus name refers to.
- The remote must implement an **A2A 1.0** server over JSON-RPC 2.0 (`protocols.agent2Agent.version: '1.0'`, `jsonRpcTransport.endpoint: <endpoint key>`, `streaming: true|false`). It is reached via a Forge `endpoint` plus `remotes`.
- Timeouts: sync 55 s; SSE stream 900 s (Jira reconnects). Overall: 30 min for a chat trigger, 60 min for a work-item trigger.
- `read:jira-work` scope is required. GitHub-style `<details>` collapsibles are supported in responses.
- Side effects: the app's system user is no longer mentionable (CLI 13.3 or later asks for approval on deploy). In non-production environments, invocations fail unless the triggering user is an **app contributor**. Add the judges or test users as contributors, or deploy to production for the demo.
- Implication [I]: this needs your own hosted backend. It is **not Runs on Atlassian**, because data leaves to your server.

### 2.5 `rovo:mcp` (Preview) [V] ([module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/), [tutorial](https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-mcp/), both Oct 29, 2026; [Jira reader tutorial](https://developer.atlassian.com/platform/forge/read-jira-issues-with-a-rovo-mcp-tool/))
- **At most one `rovo:mcp` per app.** Properties: `key`, `name` (at most 30 chars), `tools[]` (action keys, each under 64 chars, **at most 50**).
- Tools are plain `action` modules, so there is no separate MCP code. You can scaffold with `forge module add` (Rovo > rovo:mcp). CLI 13.3.0 or later is required, Rovo must be activated, and the runtime example is `nodejs24.x`.
- Consumption paths:
  1. **Rovo Studio**: Create agent > Tools > Add tools > *Connected apps* > pick your tools.
  2. **Third-party MCP clients (Preview)**: the endpoint is `https://mcp.atlassian.com/forge/<appId-uuid>`. The client opens an **OAuth 2.1** consent screen where the user picks a site (only sites with the app installed *and* exposure enabled), reviews scopes and tools, and approves. Tools run subject to the user's own permissions.
- **Hosting [I]:** Atlassian hosts and fronts the MCP server, so you do not write an MCP transport. The docs show HTTP transport (`--transport http`). I found no spec for SSE vs streamable-HTTP.
- When several products have different versions of the app installed, the tools come from the latest version.

### 2.6 The Atlassian Rovo MCP Server vs Forge-hosted MCP [V] ([About](https://developer.atlassian.com/cloud/rovo-mcp/), [Getting started](https://developer.atlassian.com/cloud/rovo-mcp/guides/getting-started/), Sep 2, 2026)
| | Atlassian Rovo MCP Server | Forge `rovo:mcp` |
|---|---|---|
| Endpoint | `https://mcp.atlassian.com/v2/mcp` (`?tools=all` for full list) | `https://mcp.atlassian.com/forge/<appId>` |
| Tools | Atlassian's built-ins: Jira, Confluence, JSM, Bitbucket, Loom, Goals/Projects/Teams, **Teamwork Graph context**, Rovo Search, code search; dynamic `discover` tool | **Your** app's `action`s (up to 50) |
| Auth | OAuth 2.1, or API token if the org admin enables it | OAuth 2.1 consent; admin must enable tools per site |
| Cost | "Some tools consume Rovo credits"; "most enriched TWG API and tool calls are 1–10 Rovo credits per call" | Forge platform usage. Credits are not documented for Forge tools [I] |
| Counts for "Best MCP" bonus? | **No**: the rules require a Forge app with `rovo:mcp` | **Yes** |

Atlassian also publishes a separate **Forge MCP Server** (Forge docs and knowledge for coding agents, no auth) ([forge-mcp](https://developer.atlassian.com/platform/forge/ai-development-toolkit/forge-mcp/)). It is useful while you develop but does not count for the bonus.

### 2.7 Teamwork Graph API (Preview) [V]
- **Model:** Objects (typed, identified by ARI, e.g. `ari:cloud:identity::user/<id>`) and typed relationships (e.g. `atlassian_user_is_in_atlassian_team`, `jira_space_has_jira_work_item`, `atlassian_user_assigned_jira_work_item`) ([call the API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/); [object types](https://developer.atlassian.com/platform/teamwork-graph/api-reference/object-types/ExternalSpace/); [relationship types](https://developer.atlassian.com/platform/teamwork-graph/api-reference/relationship-types/overview)).
- **Object families** (each has its own scope, [scopes](https://developer.atlassian.com/platform/teamwork-graph/scopes/)):
  - Jira: WorkItem, Comment, Status, Priority, RemoteLink, Worklog, Space, Board, Sprint, Version.
  - Confluence: Page, BlogPost, Comment, Database, Folder, Space, Whiteboard.
  - Atlassian: User, Team, TeamType, Goal, GoalUpdate, Project, ProjectUpdate, HomeTag, HomeComment, AssetsObject.
  - Loom (5 types), Compass (3), Opsgenie team, Focus (3), Talent (2).
  - ~29 `External*` types from connectors: WorkItem, Document, PullRequest, Deployment, Build, Commit, Branch, Repository, Service, Vulnerability, Design, Conversation, Message, CalendarEvent, Dashboard, DataTable, Deal, Customer*, etc.
- **Scopes:** `read:graph:<object>:<product>`, e.g. `read:graph:issue:jira`, `read:graph:user:atlassian`. **All read-only.** The old EAP scopes `read:graph:jira` and `read:graph:confluence` are retired. Forge caps an app at **50 scopes**. You need a scope for **every type traversed, including intermediate hops**. **A missing scope fails closed: you get an empty or partial result with no error.** Admins can toggle individual scopes, and changes take about 1 minute.
- **Query styles:**
  1. **Curated queries** are typed GraphQL fields with no registration step. Examples: `atlassianUserAssignedJiraWorkItems`, `atlassianUserPullRequests`, `atlassianUserGoalsAndProjects`, `atlassianUserInTeams`, `atlassianTeamMembers`, `spacesByAtlassianTeam`, `atlassianTeamsBySpace`, `jiraSpaceWorkItems`, `jiraWorkItemGoals`, `jiraWorkItemComments`, `jiraWorkItemLinkedExternalPullRequests/Deployments/Designs`, `confluencePageContributors/Owners/Creator/LinkedConfluencePages`, `atlassianUserRecentlyViewed`, `atlassianUserWorkQuery`, Loom/calendar fields. Results use Relay pagination, `first` at most **25** ([curated queries](https://developer.atlassian.com/platform/teamwork-graph/curated-queries/), Sep 25, 2026). The catalog is the schema: `GET https://<site>.atlassian.net/gateway/api/graphql/twg/schema`.
  2. **Persisted Cypher.** Register once, either in TWG Labs Query Builder (`https://teamwork-graph.atlassian.com/query-builder`) or via `POST https://<site>.atlassian.net/gateway/api/twg/cypher-queries` with `{appId, name, cypher, paramsSchema}`. You get a `queryKey`; wait about 1 minute for propagation (`QUERY_NOT_FOUND` until then). Execute with GraphQL `customQuery(queryKey, queryParams, first<=25)`. Queries are immutable and owned by the app, only app contributors can register them, and no dynamic Cypher text is allowed ([persisted Cypher](https://developer.atlassian.com/platform/teamwork-graph/persisted-cypher-queries/), Sep 15, 2026).
- **Calling:** backend `api.asUser().requestTeamworkGraph(query, vars)` (`@forge/api`) or frontend `requestTeamworkGraph` (`@forge/bridge`). Always **as user**, with results permission-filtered per user.
- **Limits** ([limitations](https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/), Sep 18, 2025, older page):
  - Forge apps only.
  - API only for apps installed in **Jira or Confluence**.
  - **Installing an app with TWG scopes requires org-admin permissions.**
  - Runs on Atlassian is recommended, and Atlassian says it "will implement policies and controls to ensure data accessed via the Teamwork Graph API is not egressed".
  - 1-month notice for breaking changes.

### 2.8 Teamwork Graph connectors: `graph:connector` (GA) [V] ([module](https://developer.atlassian.com/platform/forge/manifest-reference/modules/teamwork-graph-connector/), Apr 14, 2026; [tutorial](https://developer.atlassian.com/platform/teamwork-graph/build-a-teamwork-graph-connector/), Sep 18, 2026)
- `npm i @forge/teamwork-graph` (tutorial: use `@forge/teamwork-graph@5.3.1` or later). Ingest with `graph.setObjects({...})` (bulk objects, users, groups, relationships, ACLs).
- Manifest:
  - `key`, `name`, `icons.light/dark`, `objectTypes[]`.
  - Optional `capabilities{replicatesPermissions, syncFidelity: append|upsert|mirror, supportsIncrementalSync}`.
  - Optional `auth.provider`.
  - `datasource.formConfiguration{instructions, form[], validateConnection.function}` and `datasource.onConnectionChange.function` (receives `CREATED|UPDATED|DELETED`; Atlassian deletes the data automatically on disconnect).
- Scopes: `write:object:jira`, `read:object:jira`, `delete:object:jira`, plus `permissions.external.fetch.backend` for the source system.
- The admin connects it in *Atlassian Administration > Apps > Sites > Connected apps > [app] > Connections*.
- Ingested data appears in Rovo Search, Chat, Agents and Atlassian Analytics. **Install into Jira only.**
- **Data restrictions (legal):** you must not ingest emails, calendar entries, meeting recordings, HRIS data, regulated financial or health data, or GDPR special-category data. Use synthetic data for the demo.
- Queryable back via the API only for mapped types (ExternalDocument, PullRequest, Deployment, Build, Commit, Branch, Repository, Service, WorkItem, Conversation, Message, Design, FeatureFlag, Deal, CustomerOrg…). **Not queryable:** Project, Space, Video, and all Test* types ([querying ingested data](https://developer.atlassian.com/platform/teamwork-graph/querying-ingested-data/), Feb 3, 2026).
- For production ingestion, see the platform-managed orchestration layer ("Build an orchestrated connector", referenced in the tutorial).

---

## 3. Uncertainties and open questions

1. **TWG API access in practice [C].** Community reports of "User is not permitted to query this organization" (from a Rovo action, or intermittent per site) and a claim that a form is needed. The official Preview docs say "available to all users" and list no form. *Not found:* an official access-request URL (searched the TWG docs, call-the-API, scopes and bridge pages). **Test on the demo site in week 1**, both from a UI resolver and from an action invoked by Rovo and by an external MCP client.
2. **Can one app use a connector and the TWG API at once?** The Nov 2025 page says no; no newer statement was found. It may affect the architecture (see 4.2).
3. **TWG API inside `rovo:mcp` tools called by external clients:** is this allowed? The "no egress of TWG data" policy intent [V, limitations page] could conflict with returning graph data to a third-party LLM client [I]. Not documented either way.
4. **Is an org admin needed to install TWG-scoped apps on the demo site?** You are presumably admin of your provisioned site [I]. Judges' sites: unknown. A CDAC thread asks whether judges' test sites have Rovo ([CDAC 103823](https://community.developer.atlassian.com/t/codegeist-2026-will-judges-test-sites-have-rovo-enabled-and-is-the-forge-llm-module-available-on-them/103823)); answer not read (CDAC was blocked).
5. **Whether `rovo:skill` can be used by other agents.** Docs: only by Forge agents that list it. Not documented for Rovo Studio or third-party agents.
6. **Action confirmation UX** for CREATE/UPDATE verbs: not documented in the module reference.
7. **Rovo credit cost** of Forge MCP tool calls and Forge agents on the demo site: not found.
8. The **TWG changelog** page is rendered by JavaScript and its text was not readable through curl, so recent changelog entries were not checked ([changelog](https://developer.atlassian.com/platform/teamwork-graph/changelog/)).

---

## 4. Implications for idea selection

### 4.1 You can win only one bonus [V]
"Up to one Grand Prize and one Bonus Prize" per submission. Qualifying for all three still helps: the sponsor can reassign the project to whichever bonus it is strongest in, and the demo looks deeper. But **pick a primary bonus** to optimise the write-up and video for. Agents is probably the most crowded [I]. MCP and TWG are newer and likely have fewer strong entries [I].

### 4.2 One coherent architecture that qualifies for Agents, MCP and TWG
Shared core: **one set of `action` modules** backed by Forge functions (Runs on Atlassian where possible). The same action keys are referenced three ways:

```yaml
modules:
  action:                      # the tool layer (shared)
    - key: get-context-for-issue   # GET: calls TWG curated query / persisted Cypher asUser
    - key: find-related-work       # GET: TWG traversal (issue -> PRs/deployments/goals/teams)
    - key: create-finding          # CREATE: writes a Jira comment/issue via requestJira
  rovo:agent:                  # Best Agents
    - key: domain-agent
      prompt: resource:...;prompt.txt
      actions: [get-context-for-issue, find-related-work, create-finding]
      skills: [triage-playbook]
  rovo:skill:                  # reusable playbook (Preview); also publish SKILL.md as OSS for 3rd-party agents
    - key: triage-playbook
      source: { dir: skills/triage-playbook }
      dependencies: { tools: [get-context-for-issue, find-related-work] }
  rovo:mcp:                    # Best MCP
    - key: domain-mcp
      name: Domain MCP
      tools: [get-context-for-issue, find-related-work, create-finding]
permissions:
  scopes: [read:graph:issue:jira, read:graph:user:atlassian, read:graph:team:atlassian,
           read:graph:project:jira, read:graph:pull-request:external, read:jira-work, write:jira-work]
```
- **TWG bonus via *consume*:** the GET actions call the TWG API (curated queries first, persisted Cypher for custom hops). This alone satisfies "consumes data from the TWG API".
- **Optional TWG *ingest*:** a **second, separate Forge app** with `graph:connector` that pushes domain data (e.g. synthetic ADAS test-run or scenario records mapped to `ExternalWorkItem`/`ExternalDocument`/`ExternalBuild`, linked to Jira issues via associations). This avoids the possible "connector and API in one app" restriction. Main app is installed in Jira (Jira or Confluence for the API); connector app in Jira.
- **MCP demo:** show the same tools in (a) a Rovo Studio custom agent and (b) Claude Code or Cursor via `https://mcp.atlassian.com/forge/<appId>`. Ship an open-source `SKILL.md` in the repo; the rules explicitly reward this.
- **"Assignable" flavour (optional, higher cost):** add `rovo:agentConnector` (A2A 1.0) only if you are willing to host a remote backend. It is Jira-only, loses Runs on Atlassian, and needs app-contributor workarounds in non-prod. Not needed to qualify.
- Choose GET-verb actions for anything that should run from Automation (write verbs are skipped there).

### 4.3 Design constraints to respect
- Parse `payload.context` for issue or page identity; don't trust LLM inputs.
- 5 MB action payload; 25 rows per TWG page; at most 50 MCP tools; at most 50 scopes; agent and MCP names at most 30 chars.
- Missing TWG scopes give silent empty results. Build a "diagnostics" view that queries each hop separately.
- A TWG call needs a user identity, so it is not possible from scheduled or app-context jobs ("can't call as the app").

---

## 5. Action items

1. **Get a Rovo-enabled site:** `npm i -g @forge/cli@latest && forge login && forge site provision`, then `forge install --demo-site`. Note the 90-day expiry (covers Dec 22). See [Devpost resources](https://codegeist2026.devpost.com/resources) and [Provision a demo site](https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/). Do not rely on a classic free dev site for Rovo.
2. **Week-1 spike:** deploy a minimal app with `rovo:agent` + `action` + `rovo:mcp` whose action calls `api.asUser().requestTeamworkGraph` (`echo`, then `atlassianUserInTeams`). Test from the UI, from Rovo Chat, and from Claude Code via MCP. If you hit "not permitted to query this organization", post on CDAC with the tag `codegeist-2026` and raise a ticket at the [Atlassian Ecosystem Help Center](https://ecosystem.atlassian.net/servicedesk) [I: URL not verified this session].
3. **Enable external MCP** on the demo site: Admin > Apps > Sites > Connected apps > [app] > Tools ([rovo-mcp docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)).
4. **Register persisted Cypher** queries in [TWG Labs Query Builder](https://teamwork-graph.atlassian.com/query-builder) (you must be an app contributor).
5. Use **CLI 13.3.0 or later** (needed for rovo:mcp and agentConnector).
6. No EAP sign-up was found to be required for these modules. Forge Realtime is EAP but is not needed.

---

## 6. Sources

Official, read via curl (last-updated dates are in the sections above):
- https://codegeist2026.devpost.com/ , /rules , /resources
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-action/
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-skill/
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent-connector/
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/
- https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-mcp/
- https://developer.atlassian.com/platform/forge/build-a-hello-world-rovo-agent/ (Mar 3, 2025)
- https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/
- https://developer.atlassian.com/platform/forge/runs-on-atlassian/ (Aug 24, 2026)
- https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/requestTeamworkGraph/
- https://developer.atlassian.com/cloud/rovo-mcp/ and /guides/getting-started/
- https://developer.atlassian.com/platform/teamwork-graph/ (Nov 19, 2025)
- https://developer.atlassian.com/platform/teamwork-graph/ways-to-integrate/ (Nov 28, 2025)
- https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/ (Sep 18, 2025)
- https://developer.atlassian.com/platform/teamwork-graph/scopes/
- https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/
- https://developer.atlassian.com/platform/teamwork-graph/curated-queries/
- https://developer.atlassian.com/platform/teamwork-graph/persisted-cypher-queries/
- https://developer.atlassian.com/platform/teamwork-graph/querying-ingested-data/
- https://developer.atlassian.com/platform/teamwork-graph/api-reference/overview/
- https://developer.atlassian.com/platform/forge/manifest-reference/modules/teamwork-graph-connector/
- https://developer.atlassian.com/platform/teamwork-graph/build-a-teamwork-graph-connector/
- https://www.atlassian.com/blog/development/building-teamwork-graph-connectors-forge (Jun 25, 2026)

Community and third-party, known only from search summaries (CDAC was blocked by the proxy):
- https://community.developer.atlassian.com/t/rovo-chat-agents-not-available-on-free-developer-site-for-codegeist-2026/103526
- https://community.developer.atlassian.com/t/forge-rovo-agent-installed-but-rovo-not-visible-on-free-dev-site-codegeist-2026/103668
- https://community.developer.atlassian.com/t/rovo-disabled-on-site-despite-teamwork-collection-premium-cant-test-forge-rovo-agent-codegeist-2026/103575
- https://community.developer.atlassian.com/t/codegeist-2026-will-judges-test-sites-have-rovo-enabled-and-is-the-forge-llm-module-available-on-them/103823
- https://community.developer.atlassian.com/t/requestteamworkgraph-works-from-a-ui-resolver-but-returns-user-is-not-permitted-to-query-this-organization-inside-a-rovo-action/104086
- https://community.developer.atlassian.com/t/teamwork-graph-curated-fields-intermittently-return-user-is-not-permitted-to-query-this-organization/103690
- https://community.developer.atlassian.com/t/reading-the-teamwork-graph-api-from-a-forge-rovo-agent-the-failures-that-return-http-200-or-an-empty-list/103629
- https://github.com/palashpawar/blast-radius
- https://dev.to/mihai_leanzero/atlassian-teamwork-graph-api-forge-rovo-agent-3mcc
