# Codegeist 2026 research brief (solo entrant)

Compiled 2026-11-19 from the six research files in this folder. It adds no new facts. Every claim points to its source file and section, and through that file to the official URL.

**Labels** (carried over from the source files):
- **VERIFIED**: read on an official page.
- **INFERRED**: the researcher's reasoning, or this brief's planning advice.
- **UNCERTAIN**: not confirmed.
- **COMMUNITY/SNIPPET**: seen only in search summaries. community.developer.atlassian.com and several other hosts were blocked.

**Source files:** [rules.md](rules.md), [past-winners.md](past-winners.md), [forge-platform.md](forge-platform.md), [rovo-mcp-twg.md](rovo-mcp-twg.md), [marketplace.md](marketplace.md), [pain-points.md](pain-points.md)

---

## 1. TL;DR

1. **Deadline and payout.** The deadline is **Tue Dec 22, 2026, 12:00 pm PT (3:00 pm EST)**. Nothing can be changed after it. Our internal target is **Sun Dec 20**. One submission can win **at most one Grand Prize plus one Bonus Prize**, which is $16,500 at most. VERIFIED ([rules.md, Key facts and §8](rules.md)).
2. **Category.** Grand prizes are awarded per category. **Specialized Industries explicitly names "automotive"**. It has proven precedent: FleetOps (vision, Jira Assets) won 1st there in 2025. It also had few automotive entries in the 2026 sample (about 3–5). VERIFIED / INFERRED ([rules.md §3](rules.md), [past-winners.md, Key facts and 2026 crowding](past-winners.md)).
3. **Stage One is pass/fail on theme fit and use of the required APIs/SDKs** (rules §6). *[Critic fix: the earlier wording "pass/fail on installability" was wrong. Installability is a separate submission requirement (rules §4), so an app that fails to install is still effectively out.]* Judges install from a Forge **"Sharing" installation link** on their own sites, following our written instructions. Design for **no external API keys and no external services**. VERIFIED / INFERRED ([rules.md §5, §6, Implications](rules.md)).
4. **Judging.** Five criteria at 20% each. **Technological Implementation is the first tie-breaker.** That criterion penalises "a shallow wrapper or a single hardcoded demo path", so the app must work on the judge's own data. VERIFIED ([rules.md §7](rules.md)).
5. **AI.** Use **Forge LLMs** (GA; Claude models; no keys; keeps Runs on Atlassian eligibility). It is **text only, with no image input**, and every token is billed to us with no free tier. VERIFIED ([forge-platform.md, Key fact 5](forge-platform.md)).
6. **One architecture can qualify for three bonuses (Agents, MCP, TWG)** by sharing one set of `action` modules. Only one bonus can be won, so **pick a primary bonus** and build that one deep. VERIFIED / INFERRED ([rovo-mcp-twg.md §4.1–4.2](rovo-mcp-twg.md)).
7. **Biggest technical risk: Teamwork Graph API access.** Community reports describe "User is not permitted to query this organization", especially **inside Rovo actions**. Spike this in week 1. COMMUNITY ([rovo-mcp-twg.md, Key fact 6](rovo-mcp-twg.md)).
8. **Marketplace bonus.** A review-ticket link is enough; approval is not needed. But it needs **two Forge app IDs**, because a submitted app cannot be shared by link. It also needs an irreversible public Developer Space, KYC, and a review of 1 week to 15 business days. To use it, **submit the listing by Dec 3**. VERIFIED ([marketplace.md, Key facts 1, 4–9 and §5](marketplace.md)).
9. **Avoid crowded spaces:**
   - decision memory or decision drift (about 47 entries in the sample, 10 named "Precedent")
   - generic MCP over Jira (about 151 entries mention MCP)
   - summarisers, standup and retro bots
   - change-risk scoring, PR review against acceptance criteria, and PIR drafting (Atlassian ships these)
   - plain medtech traceability matrices

   INFERRED / VERIFIED ([past-winners.md, Crowded](past-winners.md), [pain-points.md §4](pain-points.md)).
10. **Strongest open gap:** cross-product, *semantic* change propagation. A change in Confluence, Bitbucket or JSM flags the specific dependent requirements, tests and docs as suspect, with evidence of what changed. Users have asked for this since 2009, and existing apps only flag suspect links inside Jira. Other gaps: automotive test and validation ops with vision, SOTIF feedback, and SOX evidence packs. INFERRED ([pain-points.md §1, §4](pain-points.md), [past-winners.md, Gaps](past-winners.md)).

---

## 2. Hard constraints from the rules (quoted)

All quotes are VERIFIED from the [Official Rules](https://codegeist2026.devpost.com/rules), as recorded in [rules.md](rules.md). The Official Rules prevail over the overview, the resources page and forum posts (rules section 11, [rules.md, Uncertainty 2](rules.md)).

| Constraint | Quote | Source |
|---|---|---|
| Platform | "Entrants must build an app using Atlassian's Forge platform and integrate with at least one Atlassian product or platform capability (Jira, Confluence, Jira Service Management, Bitbucket, Teamwork Graph, Rovo)" | [rules.md §3](rules.md) |
| New or rebuilt code | "Projects must be either newly created by the Entrant, not yet published prior to The Hackathon Submission Period, or ... must have been updated or rebuilt in the Forge platform after the start of the Hackathon Submission Period and must have a Forge manifest file and include at least one Forge module." | [rules.md §4](rules.md) |
| Ownership | "Be the original work of the Entrant, be solely owned by the Entrant, and not violate the IP rights of any other person or entity." INFERRED: no employer ADAS code, datasets or proprietary text. | [rules.md §4–5](rules.md) |
| Video | "should be less than five (5) minutes. Judges are not required to watch beyond five minutes"; "must be uploaded to and made publicly visible on YouTube"; "must not include third party trademarks, or copyrighted music ... unless the Entrant has permission". The overview adds that it should show "any relevant bonus prize specifics". | [rules.md §5](rules.md) |
| Installation link | "Provide access to an installation link for the judges and review team to test your application." Instructions: [distribute-your-apps](https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app) | [rules.md §5–6](rules.md) |
| Setup instructions | "Detailed instructions must be provided for all configuration steps that must be taken, and any integrations that must be installed and configured." | [rules.md §5](rules.md) |
| Functionality | "must be capable of being successfully installed in a judge's test environment via an installation link, it must run consistently ... and it must function as depicted in the video and/or expressed in the text description." | [rules.md §5](rules.md) |
| Bonus write-up | "Select the Category and Bonus Prizes the Project is submitted into. Provide any applicable write-up associated with the Bonus Prize selected." | [rules.md §5](rules.md) |
| Stacking | "The same Submission can win up to one Grand Prize and one Bonus Prize." | [rules.md §8](rules.md) |
| No edits after deadline | "Once the Submission Period has ended, you may not make any changes or alterations to your Submission" | [rules.md §9](rules.md) |
| Third-party services | "If a Project integrates any third-party SDK, APIs and/or data, Entrant must be authorized to use them" | [rules.md §3](rules.md) |
| Multiple entries | Each must be "unique and substantially different" | [rules.md §8](rules.md) |
| Eligibility | Must be of the age of majority. Solo entry is allowed. Excluded locations: Brazil, Quebec, Russia, Belarus, Crimea, Cuba, Iran, North Korea, Syria, Sudan, Myanmar, and OFAC-designated places. Also excluded: employees and families of Atlassian or Devpost, and judges and their employers. | [rules.md §2](rules.md) |
| No sponsor support | The project must not be "developed ... with financial or preferential support from the Sponsor or Administrator" | [rules.md §2](rules.md) |

**Bonus definitions** (VERIFIED, [rules.md §8](rules.md), [rovo-mcp-twg.md, Key fact 1](rovo-mcp-twg.md)):
- **Best Agents:** "a Forge app including the rovo:agent module, the rovo:agentConnector module, or apps with reusable rovo:skill and rovo:action modules that other agents can invoke as tools."
- **Best MCP:** "exposes tools via the Atlassian MCP server using the rovo:mcp module. These can also be combined with open-source skill.md files". The wording differs across pages; the rules prevail.
- **Best TWG:** "connects data into the graph and/or consumes data from the Teamwork Graph API."
- **Best Marketplace:** "published to the Marketplace or submitted for listing. Provide either the link to the listing or link to the Marketplace review ticket."

**What is not required:**
- A public repository or open-source licence was NOT FOUND in the rules ([rules.md §5](rules.md)).
- "Runs on Atlassian" is **not** a 2026 hackathon requirement or bonus ([rules.md §12](rules.md)).

---

## 3. Key dates and the submission-critical timeline

### Fixed dates (VERIFIED, [rules.md §1](rules.md))

| Date | Event |
|---|---|
| Tue Oct 27, 2026 9:00 am PT | Submission period opened |
| Tue Nov 17, 2026 | Build Session (already held; [recording](https://youtu.be/6h-utBbScWE)) |
| **Tue Dec 22, 2026 12:00 pm PT / 3:00 pm EST** | **Submission deadline** |
| Tue Jan 5, 2027 1:00 pm PT to Wed Feb 3, 2027 5:00 pm PT | Judging period. Judges test then. |
| ~Mon Feb 15, 2027 9:00 am PT | Winners announced |
| ~mid-Feb 2027 | A demo site provisioned around Nov 19 expires (90 days). INFERRED ([rules.md §10](rules.md)) |

### Working plan (INFERRED)

This plan merges [marketplace.md §5](marketplace.md) with the rules and platform constraints. The Marketplace rows apply only if that bonus is pursued.

| When | Milestone |
|---|---|
| **Thu Nov 19 – Fri Nov 21** | Accounts and access (see Section 9). Join Devpost. Provision the demo site. Open the Devpost submission form and save a draft. |
| **Mon Nov 23 – Fri Nov 27** | **Week-1 spike:** `rovo:agent` + `action` + `rovo:mcp`, with an action calling `api.asUser().requestTeamworkGraph`. Test from the UI, from Rovo Chat and from an external MCP client ([rovo-mcp-twg.md §5](rovo-mcp-twg.md)). Settle scopes and egress, aiming for zero egress. Run `forge eligibility`. *Decide the primary bonus at the end of this week.* |
| Mon Nov 30 | (Marketplace) Publish the Developer Space. This is irreversible and public. |
| Tue Dec 1 – Wed Dec 2 | (Marketplace) Register the `appname-mp` copy, deploy it to production, set it to Sharing, and smoke-test it on a fresh site. Get `npm audit` to zero critical or high findings. Prepare the assets, the Privacy & Security answers and the scope justifications. |
| **Thu Dec 3** | (Marketplace) Submit the listing. |
| Fri Dec 4 | (Marketplace) Confirm you can open the ECOHELP ticket. Start Partner Verification (14-day limit). |
| **Tue Dec 8** | (Marketplace) **Hard target to have the ticket URL in hand**, including resubmission if the scan rejects the first ticket. |
| Dec 8 – ~Dec 16 | Build depth on the judges' copy only. Replace hardcoded demo paths. Write the setup instructions. |
| ~Dec 16 – Dec 19 | Deploy to production. Test the **installation link on a second, clean site** ([rules.md, Action 6](rules.md)). Record the video (under 5 minutes, bonus specifics on screen, no copyrighted music). Upload it as public on YouTube. |
| **Sun Dec 20** | **Submit on Devpost.** An early submission also helps the "first 300" swag order ([rules.md, Uncertainty 10](rules.md)). |
| Tue Dec 22, 3:00 pm EST | Hard deadline. Buffer only. |
| **Jan 5 – Feb 3, 2027 (ideally to ~Feb 15)** | **Production freeze.** No breaking deploys. The link and the deployment must stay live ([rules.md §10](rules.md)). |

---

## 4. Platform facts that constrain the design

All VERIFIED from [forge-platform.md](forge-platform.md) unless labelled otherwise.

### Toolchain ([Key fact 1–2](forge-platform.md))
- Node **22.x (>=22.23.4) or 24.x (>=24.22.1)**. Latest `@forge/cli` is 15.1.0. Use the `nodejs24.x` or `nodejs22.x` runtime (Node 20 reached end-of-life on 2026-04-30).
- Headless or CI use: set `FORGE_EMAIL` and `FORGE_API_TOKEN`, using a *scoped* API token.
- `rovo:mcp` and `agentConnector` need **CLI 13.3.0 or later** ([rovo-mcp-twg.md §2.5, §5](rovo-mcp-twg.md)).

### Function limits ([Key fact 3](forge-platform.md))

| Invocation type | Limit |
|---|---|
| UI resolvers | **25 s** |
| Web triggers, actions, `rovo:agentConnector` | **55 s** |
| Async-event consumers, scheduled triggers | **up to 900 s** (set `timeoutSeconds`) |

- Memory: 1024 MB at most.
- Payloads: invoke request 500 KB, response 5 MB.
- Egress: 100 requests per runtime-minute.
- Disk: 512 MB of `/tmp`.
- INFERRED: run LLM or bulk work in an async consumer and report progress through storage or Realtime ([Implication 2](forge-platform.md)).

### Storage ([Key fact 4, §D](forge-platform.md))

| Option | Status | Main limits |
|---|---|---|
| KVS / Custom Entities | GA | Values up to 240 KiB; 4000 reads and 4000 writes per minute |
| Forge SQL | GA | 128 MiB in dev, 1 GiB in prod; 5 s SELECT timeout; no foreign keys |
| Object Store | **Preview** | Objects up to 1 GB; frontend components only; not on Bitbucket |

- All storage is **per installation and per product**: Jira data is not visible from Confluence.
- Adding `sql` or Object Store to an existing app is a **major version bump**.

### Triggers ([§C](forge-platform.md))
- **Product events can take up to 3 minutes to arrive.** For the video, trigger from a UI action instead.
- `scheduledTrigger`: at most 5 per app, only 1 at five-minute frequency, no retries, duplicates possible.
- Web triggers have no auth by default, and **dynamic** web triggers break Runs on Atlassian (RoA). Use static ones.
- Async events: up to 500 events per minute per installation, 200 KB per push.

### LLM ([Key fact 5–6](forge-platform.md))
- `@forge/llm` offers `chat` and `stream` with tool calling. Models: Haiku 4.5 through Opus 5. **Text only.**
- Limits: 100 requests and 500k tokens per minute per installation.
- *[Critic addition, VERIFIED on the models page (Aug 3, 2026)]:* the "not sooner than" retirement dates for `claude-haiku-4-5` (Oct 15, 2026) and `claude-sonnet-4-5` (Sep 29, 2026) have already passed. Use `claude-sonnet-5`, `claude-opus-5` or `claude-sonnet-4-6`, and read the model ID from config. The pricing page (Jul 23, 2026) lists only Opus 4.6, Sonnet 4.5 and Haiku 4.5, so **the price of Sonnet 5 and Opus 5 is not published**.
- **No free allowance.** For example, Haiku costs $1/$5 per 1M input/output tokens.
- Adding LLM to an existing app is a major version bump ([marketplace.md §2.7](marketplace.md)).
- UNCERTAIN: whether LLM calls are blocked when no payment method is on file. Add a card before the demo.

### Vision ([Implication 1](forge-platform.md))
- Vision ideas **cannot send images to Forge LLMs**. They would need Forge Containers (Preview, paid, opt-in, access steps UNCERTAIN) or an external remote, which loses RoA and adds a judge-setup burden. INFERRED.

### Runs on Atlassian ([Key fact 7](forge-platform.md))
- RoA is lost with Forge Remote, `external.fetch.backend` egress or dynamic web triggers. Forge LLMs and Containers keep it. Check with `forge eligibility`.

### Other limits
- Avoid **Forge Workflows**: it is EAP, behind a sign-up, and its API may change ([Key fact 9](forge-platform.md)).
- At most 150 modules per app, 100 MB app size, 25 environments ([§B](forge-platform.md)).

### Test sites
- **Use `forge site provision`.** It gives Jira, Confluence, JSM and **Rovo**, active for 90 days, one site at a time.
- Classic free developer sites reportedly **lack Rovo**. COMMUNITY ([rovo-mcp-twg.md, Key fact 2](rovo-mcp-twg.md)).
- If the app is shared for both Jira and Confluence, it installs only on sites that have both ([forge-platform.md §H](forge-platform.md)).

---

## 5. Rovo / MCP / Teamwork Graph: status and a one-architecture plan

### Status (VERIFIED, [rovo-mcp-twg.md, Key fact 3](rovo-mcp-twg.md))

| Feature | Status | Access needed? |
|---|---|---|
| `rovo:agent` | GA (no banner) | No |
| `action` (the "rovo:action" in the rules; the manifest key is `action`) | GA | No |
| `rovo:skill` | **Preview** (dev, staging and prod allowed) | No |
| `rovo:agentConnector` | No banner. A2A 1.0, **Jira only**, needs your own hosted backend (no RoA) | No, but needs hosting |
| `rovo:mcp` | **Preview**. Third-party client access is also Preview. **Only one per app**, at most 50 tools. | No. **A site admin must enable external exposure** per site. |
| Teamwork Graph API (read-only, **as user only**) | **Preview**, "available to all users" | Officially no. **COMMUNITY reports a form or access errors** ([Key fact 6](rovo-mcp-twg.md)) |
| `requestTeamworkGraph` bridge | Preview | — |
| `graph:connector` (TWG ingest) | **GA** (Jun 25, 2026) | No. Install into Jira only. |
| Forge Workflows | EAP | Sign-up ([forge-platform.md, Key fact 9](forge-platform.md)) |

**Notes:**
- Judges' sites will have Rovo, the TWG API and Forge LLMs. This comes from an informal Devpost manager forum reply, not from the rules ([rules.md §11](rules.md)).
- Installing an app with **TWG scopes needs an org admin** ([rovo-mcp-twg.md §2.7](rovo-mcp-twg.md)).

**TWG gotchas** ([rovo-mcp-twg.md §2.7, §4.3](rovo-mcp-twg.md)):
- **Raw `cypherQuery` is unavailable to new apps.** Use curated queries or persisted Cypher.
- Pages return at most 25 rows.
- **A missing scope fails closed and silently** (an empty result, no error).
- There is no app-context call, so TWG cannot be queried from scheduled jobs.
- Possible rule that an app can **either** call the TWG API **or** provide a connector, not both. The source page is a year old. Assume it still holds (UNCERTAIN, [Key fact 7](rovo-mcp-twg.md)).

**Rovo gotchas** ([rovo-mcp-twg.md §2.2](rovo-mcp-twg.md), [marketplace.md §2.5](marketplace.md)):
- **Automation-triggered agents run only GET actions.**
- Take identity from `payload.context`, never from LLM inputs.
- Treat action inputs as untrusted, because of prompt injection.
- Agent and MCP names are limited to 30 characters.

### One-architecture plan to earn the bonuses honestly

Based on [rovo-mcp-twg.md §4.2](rovo-mcp-twg.md); the choices below are INFERRED.

```yaml
action:      # one shared tool layer, implemented as Forge functions (RoA where possible)
  - get-context-for-<thing>   # GET: TWG curated query / persisted Cypher, called asUser  -> TWG "consume"
  - find-related-<thing>      # GET: TWG traversal (issue -> PRs / deployments / goals / teams)
  - create-<finding>          # CREATE: writes a Jira comment or issue
rovo:agent:  [domain-agent]   # uses the actions and the skill                            -> Best Agents
rovo:skill:  [playbook]       # SKILL.md; also published as an open-source file in the repo
rovo:mcp:    [domain-mcp]     # tools: the same action keys                               -> Best MCP
```

**Why this is honest:** each bonus criterion is met by a real module that does real work.
- Agents: `rovo:agent` with actions.
- MCP: `rovo:mcp`, demonstrated in both Rovo Studio and Claude Code or Cursor via `https://mcp.atlassian.com/forge/<appId>`, plus an open-source `SKILL.md`.
- TWG: "consumes data from the TWG API" through the GET actions.

**Optional TWG ingest:** a **second, separate app** with `graph:connector`, carrying synthetic domain data only. Connectors must not ingest emails, calendars, HR, health or regulated financial data. This sidesteps the possible "API or connector, not both" rule ([§2.8](rovo-mcp-twg.md)).

**Skip `rovo:agentConnector`.** It needs hosting, loses RoA and has non-production contributor caveats. It is not needed to qualify.

**Primary bonus:**
- Agents is likely the most crowded. MCP appears in about 151 of roughly 299 sampled 2026 entries ([past-winners.md](past-winners.md)). TWG is newer, but it carries the access risk ([rovo-mcp-twg.md §4.1](rovo-mcp-twg.md)).
- INFERRED: lead with **TWG** if the week-1 spike passes inside Rovo actions. If it fails, lead with **Agents** and keep TWG calls only in UI resolvers.

**Open risks:**
- Returning TWG data through MCP to third-party LLMs may conflict with Atlassian's stated intent of "no egress of TWG data" (UNCERTAIN, [Uncertainty 3](rovo-mcp-twg.md)).
- The Rovo credit cost of Forge tools is unknown.

---

## 6. Marketplace timeline

All VERIFIED from [marketplace.md](marketplace.md) unless labelled otherwise.

### What the bonus needs
- A listing link **or** a review-ticket link. Approval is not required ([Key fact 1](marketplace.md)).
- One bonus only, so the Marketplace bonus competes with Agents, MCP and TWG for the same slot ([Key fact 2](marketplace.md)).

### Two app IDs
"Apps that ... have been submitted for listing on Marketplace can't be shared via installation link" ([Key fact 4](marketplace.md)). So keep:
- `appname`, shared by link for the judges
- `appname-mp`, submitted to Marketplace

Script both from one codebase ([§4](marketplace.md)). UNCERTAIN: whether judges accept that the two apps differ ([rules.md, Uncertainty 3](rules.md)).

### Prerequisites ([Key facts 5–9, §2.1, §2.3](marketplace.md))
- Developer Space with a billing account and billing consent. UNCERTAIN whether a card is required.
- 2-step verification.
- A Developer Community contact.
- An ecosystem.atlassian.net account.
- Publish the space: **irreversible**, and the name and email become public.
- Privacy policy, EULA (Atlassian's standard one can be used), documentation and a support channel.
- Privacy & Security tab: treat it as mandatory.
- Scope and egress justifications.
- One-time **Partner Verification**: forms within 14 days plus a Stripe ID check with photo ID and selfie. UNCERTAIN how a sole individual is verified.

### Review times
Official pages disagree ([Key fact 7](marketplace.md)):
- "within one week"
- "5-10 business days to start"
- "10-15 business days"

No page says free apps are reviewed faster. COMMUNITY reports describe reviews stuck for weeks or months and ECOHELP tickets that submitters cannot open.

### Vulnerability scan
- Critical or high findings reject the ticket, and resubmitting creates a **new** ticket ([Key fact 10](marketplace.md)).
- Get `npm audit` to zero critical or high findings first.

### Listing rules
- The listing is locked during review ([§2.1 step 9](marketplace.md)).
- Major versions (new scopes, LLM, SQL) are re-reviewed, so decide the scopes and LLM use before submitting ([§2.7](marketplace.md)).
- Do not start the name with "Jira", "Confluence" or "Rovo" ([§4](marketplace.md)).
- Preview modules are allowed in production; EAP-only features block a listing ([Key fact 11](marketplace.md)).

### Dates
Submit by **Thu Dec 3**. Have the ticket URL by **Tue Dec 8**. Put screenshots of the ticket and listing in the write-up and the video ([§5, Uncertainty 7](marketplace.md)).

**Verdict (INFERRED):** the bonus is mechanical but carries a lot of overhead for a solo entrant ([rules.md, Implications](rules.md)). Pursue it only if TWG and Agents look weak after the spike, or if an early free listing is wanted anyway.

---

## 7. Prior art, crowded spaces and open gaps

### What past winners did

From [past-winners.md](past-winners.md), VERIFIED winners with INFERRED patterns:
- **They solve a specific workflow for a specific user, inside the native UI.** About half of the main-prize winners use little or no AI. Examples: Secure Notes (2025 1st, Software), File Field Cloud, Compass Whiteboard.
- **They map the physical or industry world onto Jira primitives.** FleetOps (photos to Assets; 2025 1st, Specialized Industries), YardMaster, Frank. (HR), Asset QR.
- **They adopt new platform features early.** The 2026 equivalents are TWG, `rovo:skill`, `rovo:mcp` and Forge LLM.
- **They stack a bonus on a category win.** All three 2025 first-place apps also won Best Rovo.
- **Experienced Marketplace vendors dominate the top spots.** A solo entrant has to win on polish, problem sharpness and the video.
- **Automotive and manufacturing have won before:** FleetOps, Graph Goose (TWG to 3D), Manufacturing 3d visualizer.

### Crowded: avoid, or differentiate hard

| Space | Evidence | Source |
|---|---|---|
| Decision memory / decision drift | About 47 in the 2026 sample, at least 10 named "Precedent". Atlassian ships the Decision Director agent. | [past-winners.md](past-winners.md), [pain-points.md §1.3](pain-points.md) |
| MCP server "so AI agents can query Jira", context packs | About 151 mention MCP | [past-winners.md](past-winners.md) |
| Release go/no-go gates, stale docs (time-based), handoff checkers | About 13, about 15 and about 16 entries. Several Marketplace stale-page apps exist. | [past-winners.md](past-winners.md), [pain-points.md §2.1](pain-points.md) |
| Summarisers, standup, retro, sprint review, Confluence Q&A, sentiment, release notes | Won in 2023 and heavily repeated since | [past-winners.md](past-winners.md) |
| Change-risk scoring | **JSM AI Risk Assessment is GA** (2026-03-31) | [pain-points.md §1.3](pain-points.md), VERIFIED |
| PR review against acceptance criteria | Rovo Dev Code Reviewer | SNIPPET, [pain-points.md §1.3](pain-points.md) |
| PIR / postmortem drafting | Rovo Ops AI | SNIPPET, [pain-points.md §1.3](pain-points.md) |
| Medtech traceability matrix + Rovo agent | Trace, TraceGuard, Design Control for Jira (already has a Rovo agent), Ketryx, SoftComply | [pain-points.md §1.4–1.5, §2.3](pain-points.md) |
| ISO 26262 traceability + release gate | Scrutineer, TraceGuard, PhaseAdviser; Grava and 4Spec on Marketplace | [past-winners.md](past-winners.md), [pain-points.md §1.5](pain-points.md) |
| In-Jira suspect links | R4J, Tracestitch, ArtUp Trace, Requira, Links Explorer | [pain-points.md §1.2](pain-points.md), VERIFIED |

### Open gaps (all INFERRED; verify before committing)

- **Cross-product semantic change propagation.** A Confluence section edit, a merged Bitbucket PR or a JSM incident marks the specific dependent requirements, tests and docs as suspect, with *content-consistency* evidence ([pain-points.md §1.1–1.2, §4.3](pain-points.md)).
- **Event-driven doc staleness.** A merged PR or closed epic flags the Confluence section that describes it ([pain-points.md §2.1](pain-points.md)).
- **Approval staleness.** Something was approved, then its content changed. This is the business-team flavour of the same engine ([pain-points.md §2.2](pain-points.md)).
- **Automotive test and validation operations.** Drive-log or scenario triage, disengagement intake into clustered issues with frame thumbnails, sensor calibration through Assets, scenario coverage. None were seen in the sample ([past-winners.md, Gaps](past-winners.md)). Note: vision there hits the Forge LLM text-only limit (Section 4).
- **SOTIF triggering-condition feedback loop.** "Safety-case evidence freshness" got no Marketplace hit for "safety case" ([pain-points.md §2.3](pain-points.md)).
- **SOX change-evidence pack** (PR, approval, JSM change, deployment, with segregation-of-duties checks). No Marketplace app or entrant was found ([pain-points.md §2.3](pain-points.md)).
- **TWG write.** Connectors that ingest external data; most entrants seem to consume only ([past-winners.md, Gaps](past-winners.md)).

---

## 8. Strongest pain points, with quotes

| Pain | Quote | Who / when / label |
|---|---|---|
| Spec changes don't reach Jira, tests or devs | "Teams lose track of requirement changes. Developers and testers miss critical context." | Open letter, 2025-06-03. The first request dates to 2009 (JRASERVER-19108). VERIFIED [S1] |
| Same | "how does the JIRA ticket get updates… when anyone has made changes to the confluence page?… this is not just linking." | Balaji Vijayakumar, 2019-10-25, VERIFIED [S2] |
| Same | "Is there any mechanism allowing to notify user ... if this linked confluence page was modified?" | MM_od50f0, 2024-02-29, VERIFIED [S3] |
| Consistency between requirements (functional safety) | "I have to set it manually, which is prone to errors. I don't know how to ensure consistency between requirements when I can't really see that one of the requirements has changed." | Mirijam Forliano (TESVOLT AG), 2023-05-04, VERIFIED [S6] |
| Late discovery of safety mismatch | "You might build a feature perfectly, only to realize during the certification phase that it doesn't meet the safety requirement defined six months ago in a PDF." | Deviniti (vendor) quoting HALready, 2026-02-25, VERIFIED [S32] |
| Links are not consistency (ASPICE 4.0) | Assessors want evidence that linked items agree in content | itemis, SNIPPET [S18] |
| Event-driven doc updates | "a system where any update to whatever you're documenting triggers documentation work." | Kris Klima (K15t), 2026-07-14, VERIFIED [S27] |
| Docs go stale | "By looking at Jira tickets or other factors which seem to affect this particular content?" and, on the page owner updating it, "Practically… almost never happens" | Jay Maechtlen / Rob Hean, 2026-07-07, VERIFIED [S26] |
| Decisions lost (crowded) | "decisions often get buried in comments or spread across multiple issues and Confluence pages." | Lucian Irimie, 2026-02-20, VERIFIED [S17] |
| Incident to change linkage | "a workaround wearing an integration costume"; "Zero traceability after the fact." | ZigiWave (vendor), 2026-04-02, VERIFIED [S19] |
| Tool qualification | "As of this writing, Atlassian isn't pursuing an ISO 26262 certification." | Atlassian reply, 2023-12-13, VERIFIED [S16]. INFERRED: pitch it as a "surface evidence for a human" assistant, not as a compliance tool. |

All quotes come from [pain-points.md §1–2](pain-points.md); the [S#] references point to its §5. Reddit and HN could not be fetched, and some posters are vendor-adjacent ([pain-points.md §3](pain-points.md)).

---

## 9. ACTION ITEMS for the developer today

Compiled from [rules.md, Action items](rules.md), [forge-platform.md, Action items](forge-platform.md), [rovo-mcp-twg.md §5](rovo-mcp-twg.md) and [marketplace.md §6](marketplace.md).

### Required (all paths)

1. **Check eligibility.** Confirm your country of residence is not excluded, your employer has no Atlassian or Devpost conflict and employs no judge, and no employer IP will be used ([rules.md §2, §4](rules.md)).
2. **Join the hackathon on Devpost:** https://codegeist2026.devpost.com/. Open "Enter a Submission" now to see the required fields, and save a draft ([rules.md, Uncertainty 1](rules.md)).
3. **Install the toolchain.** Install Node 22 or 24 (`nvm install 22`), then `npm i -g @forge/cli@15`. CLI 13.3.0 or later is needed for `rovo:mcp` ([forge-platform.md](forge-platform.md)).
4. **Create an Atlassian API scoped token** (choose Forge as the app): https://id.atlassian.com/manage-profile/security/api-tokens. rules.md links https://id.atlassian.com/manage/api-tokens. Then run `forge login`, or export `FORGE_EMAIL` and `FORGE_API_TOKEN` for headless use.
5. **Provision the Rovo-enabled demo site:** `forge site provision`, then `forge install --demo-site`. It lasts 90 days. Guides: https://codegeist2026.devpost.com/resources and https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/. Do not rely on a classic free developer site for Rovo.
6. **Set up the Developer Space and a payment method** in the Developer Console (https://developer.atlassian.com/console/myapps/). Add a card if you will use Forge LLMs, which have no free allowance: https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/
7. **Register on the Atlassian Developer Community** for help (use the tag `codegeist-2026`): https://community.developer.atlassian.com/. Ask rule questions in writing at https://codegeist2026.devpost.com/forum_topics.
8. **Watch the Build Session recording:** https://youtu.be/6h-utBbScWE
9. **Plan the week-1 TWG, Rovo and MCP spike** (Section 5).
   - Enable external MCP: Admin > Apps > Sites > Connected apps > [app] > Tools ([rovo-mcp docs](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)).
   - Register persisted Cypher queries in the [TWG Labs Query Builder](https://teamwork-graph.atlassian.com/query-builder).
   - If you get "not permitted to query this organization", post on the Developer Community and raise a ticket at https://ecosystem.atlassian.net/servicedesk. That URL was not verified ([rovo-mcp-twg.md §5](rovo-mcp-twg.md)).

### Optional access requests

10. **Forge Workflows EAP sign-up.** It is linked from https://developer.atlassian.com/platform/forge/runtime-reference/workflows-api/. Do not depend on it.
11. **No EAP sign-up was found to be required** for `rovo:agent`, `action`, `rovo:skill`, `rovo:mcp`, the TWG API or `graph:connector` ([rovo-mcp-twg.md, Key fact 3](rovo-mcp-twg.md)). No official TWG access form was found on the current docs, but the COMMUNITY claims are not disproved. *[Critic fix: the earlier wording "There is no official TWG access form" overstated what was checked.]*

### Only if you pursue the Marketplace bonus (do these by Nov 21)

12. Turn on **2-step verification**: https://developer.atlassian.com/platform/marketplace/security-partners-2sv/
13. Create an **ecosystem.atlassian.net account**, for ECOHELP ticket access and the security contact role: https://ecosystem.atlassian.net/servicedesk/customer/portal/34
14. Give **billing consent** on the Developer Space (link in item 6).
15. Check that your app name is free on Marketplace.
16. Have ready a photo ID, a phone with a camera, a physical address and a tax ID for KYC. The verification form is at https://ecosystem.atlassian.net/servicedesk/customer/portal/34/group/110/create/4219
17. Later steps, scheduled in Section 3:
    - Publish the space (Nov 30): https://developer.atlassian.com/platform/forge/developer-space/publish-developer-space/
    - Create the listing (Dec 3): https://marketplace.atlassian.com/manage/apps/create

### Before submitting

18. Run `forge deploy -e production`. Then go to Developer Console > Distribution > **Sharing** ([distribute-your-apps](https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app)).
19. **Do not add a `license` to the judges' copy.** Test the link on a second, clean site. Run `forge eligibility -e production`.

---

## 10. Uncertainties, ranked by impact

| # | Uncertainty | Impact | Mitigation | Source |
|---|---|---|---|---|
| 1 | **TWG API access errors** ("not permitted to query this organization"), especially inside Rovo actions; an alleged access form | Could break the TWG bonus and core features | Spike in week 1. Keep a UI-resolver fallback. Ask on the Developer Community. | [rovo-mcp-twg.md, KF6, U1](rovo-mcp-twg.md) |
| 2 | **Judges' sites:** product mix, Rovo, TWG, LLM, org-admin rights. The only assurance is an informal forum reply. | A failed install fails Stage One | Minimise products and scopes. Write explicit "Requires…" setup notes. Use no external keys. | [rules.md §11, U8–9](rules.md), [rovo-mcp-twg.md, U4](rovo-mcp-twg.md) |
| 3 | **Can one app both call the TWG API and run a connector?** The source page is a year old. | Architecture | Use two apps if ingest is needed | [rovo-mcp-twg.md, KF7, U2](rovo-mcp-twg.md) |
| 4 | **Marketplace review and ECOHELP access.** Ticket timing and visibility; judges accepting a separate copy; KYB for an individual | The bonus could slip | Submit Dec 3, add screenshots, or skip the bonus | [marketplace.md §3](marketplace.md), [rules.md, U3](rules.md) |
| 5 | **TWG data through MCP to third-party clients** vs Atlassian's no-egress intent | MCP and TWG demo legitimacy | Keep MCP tools to derived findings; check with Atlassian | [rovo-mcp-twg.md, U3](rovo-mcp-twg.md) |
| 6 | **Forge LLM billing without a payment method** | The demo could fail | Add a card early | [forge-platform.md, Uncertainties](forge-platform.md) |
| 7 | **Devpost form fields** (repo URL, bonus write-up box) | Late surprises | Open the form today | [rules.md, U1](rules.md) |
| 8 | **Which rubric applies to bonuses**, and whether selecting several bonuses dilutes an entry | Strategy | Pick one primary bonus; still select the others the app qualifies for | [rules.md, U4–5](rules.md) |
| 9 | **How long the app must stay live** (not stated) | Disqualification risk during judging | Keep it live and frozen through ~Feb 15, 2027 | [rules.md §10, U7](rules.md) |
| 10 | **Competitor data quality.** The crowding counts are a heuristic lower bound; GitHub entrants were seen as titles only. | Novelty misjudged | Open the competitor repos in [pain-points.md S14](pain-points.md) | [past-winners.md, Uncertainties](past-winners.md) |
| 11 | **SNIPPET-level native features** (Rovo Code Reviewer, PIR drafts, Verified pages, approvals); JSM risk assessment adding compliance risk "in future releases" | Atlassian may already cover the idea | Confirm in a browser before committing | [pain-points.md §3](pain-points.md) |
| 12 | **Minor gaps:** `rovo:skill` reuse by Rovo Studio or third-party agents; action confirmation UX; Rovo credit cost; Forge Containers opt-in steps; Realtime status (forge-platform.md says it exists, rovo-mcp-twg.md calls it EAP); the stale Forge and TWG changelogs | Low to medium | Check as needed | [rovo-mcp-twg.md §3](rovo-mcp-twg.md), [forge-platform.md, Uncertainties](forge-platform.md) |

Minor inconsistency: registered participants are given as 4,368, 4,369 and 4,372 across the files, depending on when each was read.

---

## 11. Implications for ideation: heuristics for Phase B

All INFERRED, synthesised from the "Implications" sections of every source file.

1. **Choose Specialized Industries (automotive / ADAS)** unless an idea is much stronger elsewhere. It has explicit category wording, FleetOps precedent, low automotive density, and it fits the developer's domain.
2. **Innovation filter.** Reject any idea that lands in a Section 7 crowded row, or that Atlassian ships natively. It must "differ from existing concepts".
3. **Name one user and one painful moment.** Every winner has a one-sentence pain and a one-sentence user. Back it with a Section 8 quote.
4. **Model the domain in native primitives:** issue panels, custom fields, workflow validators, Assets, Confluence macros and page banners, Bitbucket merge checks. "AI as a feature, not the product."
5. **Make it cross-product and semantic, not just linked.** The strongest gap is content-consistency across Confluence, Jira, Bitbucket and JSM. Pitch it as human-in-the-loop ("suspect, please re-verify"), never as certified compliance.
6. **Use the platform's own AI.** Forge LLM for text, Rovo for agents. No external keys, no Forge Remote, static web triggers only, aiming for RoA. Vision ideas need a plan for Forge LLM's no-image-input limit; otherwise prefer text and metadata signals.
7. **One shared `action` layer** behind `rovo:agent`, `rovo:skill` and `rovo:mcp`, with TWG reads inside GET actions. Choose one primary bonus after the week-1 spike.
8. **Respect the time budgets:**
   - 25 s resolvers, so put LLM work in async consumers
   - product events take up to 3 minutes, so use UI actions for the demo
   - TWG pages hold 25 rows and fail silently on missing scopes, so build a diagnostics view
9. **Judge-proof install.** The minimum set of products and scopes, a one-click seed-data action, and real behaviour on any site's data. Avoid a single hardcoded path, because it counts against the first tie-breaker.
10. **The demo must show the feature in under 5 minutes.** Pick an idea whose payoff is visible on screen within about 30 seconds of a triggering action, and show the bonus modules explicitly.
11. **Business-team generality.** Prefer engines that also serve a non-automotive use case, such as stale approvals or SOX evidence. It widens the impact story and allows category reassignment.
12. **Scope for solo delivery by Dec 20.** No EAP dependencies, at most one Preview storage feature, and lock major-version changes (scopes, LLM, SQL) early, especially if a Marketplace copy is in play.

---

## Critic review

Reviewed 2026-11-19 by a separate critic pass. The official pages below were re-fetched live (curl) the same day. Text inside *[Critic fix]* or *[Critic addition]* earlier in this brief was added by this review. No existing content was deleted.

### A. Spot-checks of the most decision-critical claims (live official pages)

| # | Claim in brief | Verdict | Evidence (live page) |
|---|---|---|---|
| 1 | Deadline Dec 22, 2026 12:00 pm PT; 1st/2nd/3rd awarded "1 per Category"; one Grand + one Bonus at most; five criteria at 20% each; Technological Implementation is the first tie-breaker; new or rebuilt-on-Forge projects only | **VERIFIED** | [rules](https://codegeist2026.devpost.com/rules) §1, §4, §6, §8; [overview](https://codegeist2026.devpost.com/) ("Technological Implementation - 20%" etc.) |
| 2 | TL;DR 3: "Stage One is pass/fail on installability" | **REFUTED, fixed inline.** Stage One tests whether the project "reasonably fits the theme and reasonably applies the required APIs/SDKs". Installability is a separate submission requirement in §4. The practical advice (design for zero-config install) still stands. | [rules](https://codegeist2026.devpost.com/rules) §6 |
| 3 | `rovo:mcp` is Preview, at most one per app, at most 50 tools, name at most 30 chars, endpoint `https://mcp.atlassian.com/forge/<appId>`, external exposure off by default and turned on by an admin | **VERIFIED** (Last updated Oct 29, 2026) | [rovo:mcp](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/) |
| 4 | TWG API: Preview, "available to all users", `asUser` only, raw `cypherQuery` unavailable to new apps, and the "either call the API or provide a connector, not both" rule | **VERIFIED, still live.** The call page is still dated Feb 11, 2026. The landing page (Nov 19, 2025) still says "an app can either call the Teamwork Graph API or provide a custom connector, but it can't do both at the same time". The limitations page (Sep 18, 2025) still states the no-egress intent. **The two-app plan in §5 stays necessary.** New detail: the call page says "The organization admin must grant the requested scopes", but the scopes page says "The site admin grants that scope". Assume judges need org-admin rights. | [call TWG API](https://developer.atlassian.com/platform/teamwork-graph/call-the-teamwork-graph-api/), [TWG landing](https://developer.atlassian.com/platform/teamwork-graph/), [limitations](https://developer.atlassian.com/platform/teamwork-graph/limitations-and-considerations/), [scopes](https://developer.atlassian.com/platform/teamwork-graph/scopes/) |
| 5 | Apps submitted to Marketplace (or with a `license`) cannot be shared by link, and installers must be site admins | **VERIFIED** (Last updated Oct 30, 2026) | [distribute-your-apps](https://developer.atlassian.com/platform/forge/distribute-your-apps/) |
| 6 | Forge LLMs: text only, no free allowance, Haiku 4.5 at $1/$5 | **VERIFIED, with a caveat added inline (§4 LLM).** The retirement dates for Haiku 4.5 and Sonnet 4.5 have already passed, and no price is published for Sonnet 5 or Opus 5. | [models](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-models/) (Aug 3, 2026), [pricing](https://developer.atlassian.com/platform/forge/runtime-reference/forge-llms-api-pricing/) (Jul 23, 2026) |
| 7 | Judges' sites will have Rovo, the TWG API and Forge LLMs | **VERIFIED as a forum reply only** (Janet Fang, Devpost). It is still the only topic in the forum. The question it answers adds that the TWG **connector page shows "Rovo is disabled on this site" on sites without Rovo**, so TWG ingest also depends on Rovo. | [forum topic 45901](https://codegeist2026.devpost.com/forum_topics/45901-will-judges-test-environments-have-rovo-enabled) |
| 8 | Demo site: enterprise Jira, Confluence, JSM and Rovo, 90 days, one active site per developer | **VERIFIED.** Note that **Bitbucket is not included.** | [provision a demo site](https://developer.atlassian.com/platform/forge/provision-a-demo-development-site/) |
| 9 | Automation-triggered agents run only GET actions | **VERIFIED**: "Agents triggered by automation rules will not invoke actions with actionVerb CREATE, UPDATE, DELETE, and TRIGGER." | rovo-action module page (fetched earlier today) |

### B. Other corrections and inconsistencies

- **§9 item 11 (fixed inline).** "There is no official TWG access form" overstated the evidence. The researcher only failed to *find* one, and the community reports still stand.
- **Registered participants:** the overview now shows **4,372**. The 4,368 in rules.md is out of date.
- **Realtime status (§10 row 12).** The live Forge nav lists "Realtime", "Realtime limits" and a "Handling long-running LLM processes with Forge Realtime" tutorial with **no EAP or Preview tag**, while Preview items such as Containers and Object Store are tagged. The 2025 winner Secure Notes also used `@forge/realtime`. So the "Realtime is EAP" line in rovo-mcp-twg.md §5 is **probably outdated**, but its limits page was not opened.
- **rules.md §11** says `forge site provision` needs "Node.js 20 or later". That conflicts with the CLI 15.x engine requirement of Node 22 or 24. Follow forge-platform.md and use Node 22 or 24.
- **Do not confuse three different "MCP" things** (rovo-mcp-twg.md §2.6). Only **`rovo:mcp`** qualifies for the MCP bonus under the rules wording. Neither the **Atlassian Rovo MCP Server** (Atlassian's own hosted server for Jira and Confluence data) nor the **Forge MCP Server** (a docs and dev-assistant tool for coding agents) counts as "exposing tools via the rovo:mcp module".
- **Scope cap.** Forge caps an app at **50 scopes**, and every TWG object type traversed needs its own scope, including intermediate hops (scopes page). A TWG-heavy design together with Jira, Confluence and LLM scopes can reach this limit. Budget scopes early, because new scopes are also a major version.

### C. Answers to questions the brief left open

| Question | Answer | Confidence |
|---|---|---|
| Per-category or overall judging? | Grand prizes: **1st, 2nd and 3rd per category**, ranked by "the highest overall scores based on the applicable Judging Criteria" for that prize. There is no cross-category overall winner. Bonus prizes (6 per bonus) are **not** per category, so they appear to pool all categories. Atlassian can reassign the category. | VERIFIED (rules §6, §8). Bonus pooling is INFERRED. |
| Is the TWG API usable on a free dev site? | **Not documented either way.** The TWG docs list no edition or site-type requirement. The forum question shows TWG features gated on Rovo being enabled, and community reports say classic free dev sites lack Rovo. **Use the `forge site provision` demo site**, which has enterprise editions and Rovo. Whether TWG *queries* (not connectors) work without Rovo is unknown. | UNCERTAIN |
| Does Forge have an MCP server module? | **Yes: `rovo:mcp` (Preview).** It exposes up to 50 of the app's `action` modules as tools to Rovo Studio agents and, in Preview, to third-party MCP clients at `mcp.atlassian.com/forge/<appId>` once an admin enables it. | VERIFIED |
| Does Rovo work on a dev site? | **Demo site: yes** (Rovo enterprise edition, VERIFIED). **Classic free developer site: reportedly no** (COMMUNITY only). | Mixed |
| New-project requirement? | The project must be newly created and "not yet published prior to" Oct 27, 2026, **or** be an existing project "updated or rebuilt in the Forge platform after the start" with a Forge manifest and at least one Forge module. A public repo is not required. | VERIFIED (rules §4) |

### D. Remaining critical unknowns (not resolvable from public pages)

1. **Bitbucket on judges' sites.** The demo site does not include Bitbucket, and nothing says judges have a Bitbucket workspace. A Bitbucket Forge app installs into a *workspace*, not a site. The brief's "strongest gap" (cross-product change propagation via Bitbucket PRs) therefore carries an **install-path risk**. Make Bitbucket optional, with Jira and Confluence as the core, or confirm on the forum.
2. **Multi-product install.** A Jira + Confluence app installs only on sites that have both, and storage is per product. Cross-product ideas need multi-app compatibility (see the "Migrating a Forge app to support multiple Atlassian apps" guide; not yet read). Spike this in week 1 along with TWG.
3. **Judges' admin rights.** TWG scopes need an org or site admin grant, and external MCP exposure needs an admin toggle. The installer must be a site admin, but org-admin rights are not confirmed.
4. **TWG "not permitted to query this organization" inside Rovo actions** (COMMUNITY). This is still the biggest technical risk. It can only be settled by a spike.
5. **Whether TWG data returned through `rovo:mcp` to third-party clients breaches the no-egress intent.** It is not documented.
6. **Costs:** the price per token of Sonnet 5 and Opus 5, and the Rovo credit cost of Forge actions on judges' sites.
7. **The Devpost form fields and the bonus write-up box.** Opening the form needs a login.
8. **Whether the bonus prizes use the same five-criteria scores**, and whether selecting several bonuses matters.
