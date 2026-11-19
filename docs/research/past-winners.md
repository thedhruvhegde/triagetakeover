# Codegeist past winners (2023–2025) and the 2026 competitive landscape

Research date: 2026-11-19. Method: official Atlassian blog winner posts (fetched with curl; WebFetch could not resolve www.atlassian.com from this session), each winner's Devpost project page (fetched with curl: "Built With" tags, prize badges, "What it does" / "How we built it"), the live codegeist2026.devpost.com pages, and the public Devpost search JSON endpoint (`https://devpost.com/software/search?query=...`) for a sample of submissions.

Labels: **VERIFIED** means I read it on an official page (Atlassian blog or Devpost). **INFERRED** means my own analysis or a heuristic.

---

## Key facts

- **2025 winners (VERIFIED)** were published 2026-02-09 ([blog](https://www.atlassian.com/blog/developer/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition)). The categories were Software Teams, Business Teams and Specialized Industries, the same three used in 2026. First place in each:
  - **Secure Notes for Jira**: encrypted, burn-after-reading notes. Pure Forge (SQL, KVS, Realtime), no AI.
  - **Frank.**: HR/people management in Jira, Confluence and Rovo.
  - **FleetOps**: computer vision on incident photos, which identifies the vehicle in Jira Assets and creates the ticket. Rovo agent.
- **2024 winners (VERIFIED)** were published 2025-01-29 ([blog](https://www.atlassian.com/blog/developer/codegeist-2024-winners)). First places:
  - Images for Confluence
  - Compass Whiteboard
  - Runbook Rabbit (Rovo + JSM)
  - Campaign Analyser (Google Analytics + Jira + Rovo)
- **2023 "Codegeist Unleashed" winners (VERIFIED)** were published 2023-11-16 ([blog](https://www.atlassian.com/blog/development/codegeist-unleashed-2023-winners)). 2023 was an AI-themed year with more than 1,700 participants and $172.5K in prizes. First places:
  - Ada AI (PR code review)
  - Tably (Confluence pages as databases)
  - GoMood (Jira sentiment), which also won the live Stage Show.
- **Winners are mostly concrete and native, not chatbots (INFERRED).** About half of the main-prize winners use little or no AI, for example Secure Notes, Images for Confluence, Compass Whiteboard, File Approvals, File Field Cloud and Compliant Workflows. Winning apps solve a specific, painful workflow inside the product UI, and AI is an add-on where it is used at all.
- **Prizes stack (VERIFIED).** In 2025, all three first-place apps and the two 2nd-place Business/Industries apps also won Best Rovo Apps. In 2024, Compass Whiteboard won 1st place plus Runs on Atlassian. Targeting one main category plus one or two bonuses is the proven play.
- **Automotive, vision and manufacturing have won before (VERIFIED).**
  - FleetOps (vision → Assets) won 1st in Specialized Industries in 2025.
  - Graph Goose (Teamwork Graph → 3D OBJ models for automotive/manufacturing) and Manufacturing 3d visualizer won Runs on Atlassian bonuses in 2025.
  - This is a strong fit for an ADAS/CV background.
- **2026 state (VERIFIED, [Devpost](https://codegeist2026.devpost.com/)).**
  - 4,369 participants.
  - The gallery is not published yet ("The hackathon managers haven't published this gallery yet").
  - The only discussion thread confirms that judges' sites will have Rovo, the Teamwork Graph API and Forge LLMs ([thread](https://codegeist2026.devpost.com/forum_topics/45901-will-judges-test-environments-have-rovo-enabled)).
- **2026 is already very crowded (INFERRED from about 299 public 2026-era Devpost projects).** "Decision memory / decision drift" (Confluence decisions vs Jira work) appears in about **47** projects, and **10 are literally named "Precedent"**. "Evidence/cited quotes" appears in about 56, MCP in about 151, and "context for AI coding agents" in about 24. Avoid the decision-memory space.

---

## Details

### 2025: Codegeist 2025 Atlassian Williams Racing Edition

Source: [winners post](https://www.atlassian.com/blog/developer/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition), dated 2026-02-09, by Karen White.

**Prizes:** 1st place $15,000 + 2 TEAM 2026 tickets. 2nd place and 3rd place got cash; the post does not state the amounts. The kickoff/search snippets say $8,000 and $5,000 (unverified for 2025, but the same amounts appear on the 2026 page).

**Bonus tracks:** Best Runs on Atlassian, Best Rovo Apps (rovo:agent and action modules), and Best Apps Built Using Rovo Dev.

The "Built With" column below comes from each Devpost page. Those tags are self-reported by the entrants.

| Place / Category | App | What it does (Devpost) | Built with / products | Also won | Why it likely won (INFERRED) |
|---|---|---|---|---|---|
| 1st Software Teams | [Secure Notes for Jira](https://devpost.com/software/secure-notes-for-jira-coegvb) | Zero-trust, client-side AES-GCM encrypted notes in Jira issues. One-time view, expiry, and an audit/compliance dashboard. | Forge Custom UI (issue panel, modal, global page), @forge/sql, @forge/kvs (setSecret), @forge/realtime, forge-sql-orm (Drizzle), React/Vite/TS | – | Real security pain. Deep, polished use of new Forge storage primitives. Fully on-platform. No AI needed. |
| 1st Business Teams | [Frank.](https://devpost.com/software/mystery-nt6xau) | HR/people solution: employees modelled as Jira work items, onboarding turns Confluence docs into tasks, and a permission-aware Rovo Q&A. | forge-rovo-agent, forge-rovo-actions, Custom UI + UI Kit, custom fields, KVS, SQL, workflows/automations; "fully Runs on Atlassian" | Best Rovo Apps | Novel audience (HR) built on native primitives. Clear permission story. Multi-product use (Jira + Confluence + Rovo). |
| 1st Specialized Industries | [FleetOps](https://devpost.com/software/fleetops-smart-incident-reporting-for-fleet-operations) | AI analyses photos attached to JSM incidents, identifies the vehicle in **Jira Assets**, and generates accurate tickets. | Assets, JSM, Rovo agent, OCR/vision ("ia"), TypeScript | Best Rovo Apps | Tangible industry workflow, visual demo, and **image AI** that goes beyond text summarisation. Team used JPD + RICE to pick the idea. |
| 2nd Software Teams | [Sherlock Sync](https://devpost.com/software/copycat-la20vz) | Bitbucket merge → web trigger → Forge queue → LLM (Claude Sonnet 4.5 via AWS) → updates Confluence docs. | Bitbucket, Confluence, Forge storage/queues, AWS Lambda | – | Living-docs pain, event-driven architecture, cross-product. |
| 2nd Business Teams | [Sidekick4All](https://devpost.com/software/sidekick4all-time-tracking-and-capacity-management) | Two-way Jira ↔ Google/Microsoft calendar sync: issues become focus blocks, meetings become worklogs. | Custom UI, Forge SQL, entity properties, Google Calendar + MS Graph APIs, OAuth | Best Rovo Apps | Everyday pain (timesheets), integration depth. |
| 2nd Specialized Industries | [YardMaster](https://devpost.com/software/test-6y0chd) | Physical logistics yard as a Jira workflow (gate → dock → gate-out), photos, auto dock assignment, conversational queries. | Jira, Confluence, Rovo, Forge, React | Best Rovo Apps | Clever mapping of the physical world onto Jira workflows. Non-tech users. |
| 3rd Software Teams | [AI Backlog for Jira](https://devpost.com/software/ai-backlog-for-jira) | AI classifies the backlog into strategy topics and drafts capacity-aware sprints. | Forge + Forge Remote, OpenAI (embeddings + chat), Custom UI/atlaskit | Best Rovo Apps | Planning that goes beyond a summary. Note that it used an external LLM. |
| 3rd Business Teams | [File Field Cloud](https://devpost.com/software/file-field-cloud) | Dedicated attachment custom fields (type/size limits, required for transitions) in Jira/JSM, including the portal. | **Forge Object Storage (EAP)**, Forge custom fields, Jira full page, Rovo Dev | Runs on Atlassian | Early adopter of a new Forge capability. Clear admin pain. |
| 3rd Specialized Industries | [Compliant Workflows for Jira](https://devpost.com/software/compliant-workflows-for-jira) | Audits Jira workflows against regulatory rules (pharma, medtech, fintech) and gives guided automated fixes. | Forge, atlaskit, React, TS | – | Regulated-industry expertise turned into rules. |

**Runs on Atlassian bonus:**
- [Graph Goose](https://devpost.com/software/graph-goose-your-teamwork-graph-mapped-to-the-real-world): Teamwork Graph shown as interactive 3D OBJ models "for automotive, manufacturing".
- [Asset QR Manager](https://devpost.com/software/asset-qr-manager): QR labels ↔ Jira Assets.
- [Immutable Ledger](https://devpost.com/software/immutable-ledger): hash-chained, SOX-style audit trail.
- [Manufacturing 3d visualizer](https://devpost.com/software/manfucaturing-3d-visualizer): Confluence + three.js.
- [PitStop Comment Manager](https://devpost.com/software/pitstop-comment-manager-for-your-team-that-runs-on-atlassian)
- File Field Cloud

**Best Rovo Apps bonus:**
- AI Backlog, FleetOps, Frank., Sidekick4All and YardMaster (all listed above)
- [Smart Data Generator for Jira](https://devpost.com/software/smart-data-generator-for-jira): generates realistic test data.

**Best Rovo Dev bonus:**
- [Sync for Confluence](https://devpost.com/software/sync-for-confluence): Confluence → Zendesk.
- [Risk Manager](https://devpost.com/software/risk-manager-lgm9o5)
- [EpicStory](https://devpost.com/software/epicstory): epic → backlog.
- [PitstopX](https://devpost.com/software/pitstopx)
- [Rovo Autonomous Team Orchestrator](https://devpost.com/software/rovo-autonomous-team-orchestrator)
- [DevOps Commander](https://devpost.com/software/devops-commander)

The blog notes: "AI featured prominently, powering everything from visual diagnostic tools to predictive insights."

### 2024: Codegeist 2024

Source: [winners post](https://www.atlassian.com/blog/developer/codegeist-2024-winners), dated 2025-01-29, by Helen Rincon.

**Categories:** Teamwork Foundations, World-Class Software Development, High-Velocity Service Management, and Executive Strategy and Planning.

**Bonuses:** Runs on Atlassian (top 4), Connect to Forge migration (top 3), and Rovo (top 3).

The search snippet from the Marketplace page says "$170,000 in prizes" and "$20,000 first place". I did not verify this on that page.

| Place / Category | App | What it does | Built with | Also won |
|---|---|---|---|---|
| 1st Teamwork Foundations | [Images for Confluence](https://devpost.com/software/capable-images-for-confluence-asset-library-image-manager) (Capable) | Central image asset library for Confluence pages | Forge, React, AWS | – |
| 2nd Teamwork Foundations | [File Approvals for Jira](https://devpost.com/software/file-approvals-for-jira) | File markup and feedback inside Jira | Forge, atlaskit, pdf.js | Runs on Atlassian |
| 3rd Teamwork Foundations | [JiraDoc AI](https://devpost.com/software/jiradoc-ai) | Turns Jira data into Confluence documentation with Rovo | Jira, Confluence, Rovo | – |
| 1st Software Dev | [Compass Whiteboard](https://devpost.com/software/compass-whiteboard) | Visual component-dependency / C4 whiteboard in Compass, with scorecards and analysis | React Flow, Redux, atlaskit | Runs on Atlassian |
| 2nd Software Dev | [Integrate with AWS for Jira](https://devpost.com/software/integrate-with-aws-for-jira) | Links AWS resources to issues via CloudFormation / Resource Explorer | AWS CDK, Lambda, EventBridge, Step Functions | – |
| 3rd Software Dev | [Flowsense](https://devpost.com/software/flowsense-intelligent-fowboards) | AI-assisted user-journey flowboards | Custom UI, OpenAI, Rovo, Lambda | – |
| 1st Service Mgmt | [Runbook Rabbit](https://devpost.com/software/runbook-rabbit-let-rovo-be-your-jira-agent-s-new-assistant) | Rovo reads company runbooks and highlights the relevant sections for JSM agents based on issue fields/comments. "Entirely runs on Rovo and Jira Automations." | Forge, Rovo, React, tRPC | Rovo |
| 2nd Service Mgmt | [Apwide Booking](https://devpost.com/software/apwide-booking) | Resource booking in Jira (rooms, devices, vehicles), conflict detection, Booking Rovo agent | Forge, Rovo | – |
| 3rd Service Mgmt | [SLA Insights & Bottleneck Analytics for JSM](https://devpost.com/software/sla-insights-and-bottleneck-analytics-for-jsm) | SLA analytics, trends and prediction | React, chart.js | – |
| 1st Exec Strategy | [Campaign Analyser](https://devpost.com/software/marketing-campaign-tracker) | Google Analytics + Jira campaign tracking with Rovo recommendations | Forge storage, Google, Rovo | Rovo |
| 2nd Exec Strategy | [Budgety](https://devpost.com/software/budgety-financial-management-assistant) | Rovo agent for budget analysis and cost categorisation | Forge, Rovo | Rovo |
| 3rd Exec Strategy | [Team Stress Analytics](https://devpost.com/software/stress-vx1inl) | Workload, deadline and SLA stress metrics for Jira | React, chart.js | Runs on Atlassian |

Other bonus winners:
- **Runs on Atlassian:** also [Projects Insight Edge](https://devpost.com/software/projects-insight-edge).
- **Connect to Forge:** [Metaview](https://devpost.com/software/metaview-epwa0s), [Issue Merger for Jira with Rovo agent](https://devpost.com/software/issue-merger-for-jira-b6uxk7) and [See All Unresolved Comments](https://devpost.com/software/see-all-unresolved-comments).

Many 2024 winners were existing Marketplace vendors, for example Capable and Apwide. A third-party blog claims Capable's first place ([gocapable.com](https://www.gocapable.com/blog/celebrating-the-winners-of-atlassian-codegeist-2024)); I did not fetch it.

### 2023: Codegeist Unleashed

Source: [winners post](https://www.atlassian.com/blog/development/codegeist-unleashed-2023-winners), dated 2023-11-16. 1,700+ participants, 80+ countries, $172,500. The gallery is at [codegeistunleashed.devpost.com/project-gallery](https://codegeistunleashed.devpost.com/project-gallery); that subdomain was blocked from this session.

The blog lists winners in order. The 1st/2nd/3rd placements come from the Devpost badges.

**Developer Experience**
1. [Ada AI](https://devpost.com/software/cyborg-coder): PR code review and descriptions (Forge, LangChain, OpenAI).
2. [Junebug](https://devpost.com/software/junebug-ai-driven-security-for-bitbucket): GPT security scanning of Bitbucket repos that raises Jira issues.
3. [TLDR This Issue](https://devpost.com/software/tldr-this-issue): Jira issue summary + actionable insights with a privacy focus (UI Kit, async events, GPT-3.5).

**Collaboration**
1. [Tably](https://devpost.com/software/tably-turn-confluence-pages-into-databases): Confluence pages as databases.
2. [videoloGGy](https://devpost.com/software/gg_ai): "Give life to your page", AI video (Synthesia, OCR, TF).
3. [Nutshell for Confluence](https://devpost.com/software/nutshell-for-confluence): video recordings turned into docs and meeting notes.

**Data-Driven Insights**
1. [GoMood](https://devpost.com/software/secretia-project) (Deiser): sentiment and emotion trends in Jira. Also won the live Stage Show.
2. [ConnieAI](https://devpost.com/software/connie-ai): existing Confluence AI assistant with new features.
3. [AI Feedback Analyzer](https://devpost.com/software/ai-feedback-analyzer): feedback categorisation and sentiment.

**Special categories**
- **Responsible AI:** AI Release Notes, Meeting Miner, Rock Your Sprint Review, Scrum Masterika, Voice It Up.
- **Storytelling:** GPT Insights for Jira, Intelligent Helper (JSM), Magic Links AI, Magic Stories, VectorIA.
- **Best of Region:** AGile AI Assistant, AI Comment Assistant, deep-a, Spothelp.

All 2023 winners used external LLMs (OpenAI). Rovo and Forge LLM did not exist for builders yet.

### Codegeist 2026 (live)

Source: [codegeist2026.devpost.com](https://codegeist2026.devpost.com/), read 2026-11-19 (VERIFIED).

**Basics:** $120K prizes. 1st/2nd/3rd place pay $15K/$8K/$5K, with three winners each. Categories: Software Teams, Business Teams, Specialized Industries (the page names "healthcare, finance, manufacturing, automotive").

**Bonuses:** 6 winners × $1,500 each in four tracks:
- Best Agents: rovo:agent, rovo:agentConnector, or reusable rovo:skill/rovo:action.
- Best app with Atlassian MCP: a Forge app exposing an MCP server.
- Best Teamwork Graph integration.
- Best Marketplace-published app: listing or review-ticket link.

**Judging:** five criteria at 20% each:
- Technological Implementation: "not just a shallow wrapper or a single hardcoded demo path".
- Design: "complete, coherent product experience".
- Potential Impact: "credible, specific case ... real audience".
- Innovation: "differ from existing concepts".
- Presentation: video under 5 minutes, end-to-end.

**Other notes:**
- Forge LLMs are optional, and no credits are provided.
- The gallery is unpublished.
- Updates: Build Session on 2026-11-17 ([updates](https://codegeist2026.devpost.com/updates)).
- Discussion: judges' sites have Rovo, the TWG API and Forge LLMs; list requirements in the testing instructions ([thread](https://codegeist2026.devpost.com/forum_topics/45901-will-judges-test-environments-have-rovo-enabled)).

#### 2026 crowding sample (INFERRED)

**Method:**
1. I queried the Devpost search JSON for "rovo", "atlassian forge" and "codegeist", about 690 pages, giving 1,951 unique projects.
2. I bucketed them by thumbnail photo-ID range, which rises over time. Calibration points:
   - 2023 winners are around 2.64M.
   - 2024 winners are around 3.15–3.19M.
   - 2025 winners are around 4.10M.
   - Known 2026 entries are around 5.97M.
3. That gives 299 projects in the 2026 band (≥5.6M), 297 of them Atlassian-related. Spot checks of [Ship Context](https://devpost.com/software/ship-context), [Scrutineer](https://devpost.com/software/scrutineer-u5ycit) and [TraceGuard](https://devpost.com/software/traceguard-3rkv6g) show "codegeist2026.devpost.com" on their pages.
4. Theme counts come from keyword regexes on name, tagline and tags. They are approximate and overlap.

**Limits:** this is a lower bound and a biased sample. It covers only projects with public pages that matched those queries, and 4,369 people are registered.

| Theme (2026 sample, n≈299) | Count | Notes |
|---|---|---|
| Mentions MCP | ~151 | MCP is the default 2026 bonus play; expect heavy competition for 6 MCP prizes |
| "Evidence / cited / verbatim quotes" | ~56 | Grounded-citation framing is now table stakes |
| **Decision memory / decision drift** (Confluence decision vs Jira work) | **~47** | Very saturated: at least 10 projects named "Precedent", plus "Decision Memory" ×3, "Decision Ledger" ×3, "Decision Trail" ×2, Tether, Accord, Recall, Déjà Vu, Tripwire... |
| AI coding-agent context/guard | ~24 | "Hand context to Claude Code/Cursor" |
| Teamwork Graph (explicit) | ~23 | |
| Incident / postmortem | ~20 | |
| Handoff / shift handover | ~16 | |
| Stale docs / drift | ~15 | |
| Release readiness / go-no-go gate | ~13 | |
| Traceability | ~12 | Includes safety-critical ones (below) |
| Sprint/standup/retro | ~7 | Was the top cluster in 2025 (~31 of 232); people have moved on |
| Automotive/vehicle | ~3–5 | [Scrutineer](https://devpost.com/software/scrutineer-u5ycit) (ISO 26262 traceability release gate, Jira + Confluence), [TraceGuard](https://devpost.com/software/traceguard-3rkv6g) (traceability for safety-critical changes), [Haulboard](https://devpost.com/software/shiftline-equipment-downtime-and-shift-handover-for-jira) (mining fleet downtime), [Change impact check](https://devpost.com/software/change-impact-check) (part drawing revisions). Medical: [Heliotrope](https://devpost.com/software/heliotrope) (IEC 62304 / ISO 14971), [Change Radius](https://devpost.com/software/change-radius) |
| Image / vision / video | ~6 | Few CV-heavy entries: CoSign (ASL), Simulant (accessibility personas) |

For comparison, the 2025 sample (n≈232) was led by sprint/retro (~31), blockers/risk (~30), chat/Q&A (~22) and compliance (~21). MCP (~3) and Teamwork Graph (~2) were rare.

---

## Recurring winning patterns (INFERRED from the tables above)

1. **Specific workflow, specific user, inside the native UI.** Examples: an encrypted note in the issue panel, attachment fields on the JSM portal, runbook sections highlighted for the agent. Generic "AI assistant for Jira" entries have rarely placed since 2023.
2. **Map the physical or industry world onto Jira primitives.** Vehicles become Assets (FleetOps), yard moves become workflow transitions (YardMaster), employees become work items (Frank), QR codes become Assets. Specialized Industries is winnable with domain expertise plus Jira modelling.
3. **Use new platform features early.** Forge SQL/KVS secrets/Realtime (Secure Notes), Forge Object Storage EAP (File Field), Rovo agents in 2024, Compass in 2024. The 2026 equivalents are Teamwork Graph, rovo:agentConnector/rovo:skill, MCP and Forge LLM.
4. **Runs on Atlassian / no egress wins bonuses and builds trust.** Six such bonuses in 2025, four in 2024. Several main winners were also fully on-platform.
5. **AI as a feature, not the product.** Many main winners have no LLM at all. Where AI wins, it is grounded in Atlassian data and does something verifiable, such as identifying a vehicle in Assets, picking a runbook section, or drafting capacity-aware sprints.
6. **Stack bonuses with the main category.** 2025: 1st place + Best Rovo for all three category leaders.
7. **Experienced Marketplace vendors dominate the top spots** (Capable, Apwide, Deiser and others). A solo entrant has to win on polish, a sharp problem and a strong video.

## Over-represented / crowded idea types (avoid or differentiate hard)

- Decision memory / "has the team already decided this" / decision drift (2026: ~47+).
- MCP server "so AI agents can query Jira", including claim checking and context packs.
- Release readiness / go-no-go gates, stale-doc detectors, handoff checkers.
- Historically: Jira issue summarisers / TLDR, sprint review / retro / standup generators, Confluence chatbots / Q&A, backlog triage and labelling, AI release notes, sentiment analysis. All of these were done and won in 2023 and were heavily repeated in 2025.
- Safety-critical traceability (ISO 26262 / IEC 62304) already has at least four 2026 entries. An ADAS angle must differ from "traceability matrix + release gate".

## Gaps (few or no visible entries; INFERRED, so verify again before committing)

- **Computer vision on attachments beyond FleetOps.** Examples: screenshots, dashcam/test-drive frames, drawings, defect photos. Only about 6 vision entries were seen in 2026.
- **Automotive test and validation operations rather than requirements traceability.** Examples: drive-log / scenario triage (an ADAS disengagement or test-failure intake → clustered Jira issues with frame thumbnails), sensor calibration and maintenance tracking via Assets, scenario-coverage dashboards. Not seen in the sample.
- **Physical-asset workflows with QR, photo or Assets** in other industries (labs, field service, construction). Few seen, and they are proven winners (FleetOps, Asset QR, YardMaster).
- **Business-team niches** like Frank (HR): legal intake, procurement, facilities. Some exist (Grant Desk, Tickmark, 72 Hours), but density is low.
- **Teamwork Graph *write* (connector ingesting external data into the graph).** Most TWG mentions seem to consume rather than ingest (INFERRED; the search can't confirm this).

## Implications for idea selection

- Pick **Specialized Industries (automotive/ADAS test ops)** or a vision-centric Software Teams app. It has a proven win precedent (FleetOps 1st, Graph Goose bonus), low 2026 density, and it plays to CV/Playwright strengths.
- **Do not build decision-memory, generic MCP-over-Jira, summariser, standup or retro bots.** The Innovation criterion (20%) explicitly rewards being "different from existing concepts".
- Design for **two or three bonuses at once**: Rovo agent/skill + Teamwork Graph connector + (optionally) MCP. Keep it Runs-on-Atlassian-like (Forge LLM, Forge storage) for trust, but note that 2026 has no Runs on Atlassian bonus.
- Model the domain in **native primitives** (Assets objects, custom fields, workflow transitions, issue panels) and show a full end-to-end demo path. Judges test installs; "not a single hardcoded demo path".
- Invest in the **video and the problem statement**. Winners all have a crisp one-sentence pain + user.

---

## Uncertainties / open questions

- Exact 2025 2nd/3rd place amounts are not stated in the winners post. The search snippet of the kickoff says $8K/$5K (not verified on the page).
- The 2024 total and 1st-place amount ($170K / $20K) come from a search snippet of [marketplace.atlassian.com/codegeist](https://marketplace.atlassian.com/codegeist), not read directly.
- 2023 placements (1st/2nd/3rd) come from Devpost badges. The blog only lists names in order.
- I could not read 2023–2025 galleries or total submission counts: `codegeistxawr.devpost.com`, `codegeist.devpost.com` and `codegeistunleashed.devpost.com` were refused by the session proxy (403), and WebFetch could not resolve www.atlassian.com.
- The 2026 crowding sample is heuristic:
  - Year assignment uses photo-ID ranges. Projects without photos (389) were excluded.
  - Themes come from keyword matching.
  - The sample covers only search-matched public pages.
  - Treat the counts as relative signals, not totals.
- "Built With" tags are self-reported and may be incomplete. For example, Compass Whiteboard does not list "forge".
- Judges' reasoning is never published, so the "why it won" column is inference.

## Sources

- 2025 winners: https://www.atlassian.com/blog/developer/meet-the-winners-of-codegeist-2025-atlassian-williams-racing-edition (datePublished 2026-02-09)
- 2024 winners: https://www.atlassian.com/blog/developer/codegeist-2024-winners (datePublished 2025-01-29)
- 2023 winners: https://www.atlassian.com/blog/development/codegeist-unleashed-2023-winners (datePublished 2023-11-16)
- Devpost project pages: https://devpost.com/software/<slug> for every app linked above (fetched 2026-11-19)
- Codegeist 2026 overview, gallery, updates and discussion: https://codegeist2026.devpost.com/ , /project-gallery , /updates , /forum_topics/45901-will-judges-test-environments-have-rovo-enabled
- Devpost search API sample: https://devpost.com/software/search?query=rovo (also "atlassian forge", "codegeist")
- Unverified snippets: https://www.gocapable.com/blog/celebrating-the-winners-of-atlassian-codegeist-2024 , https://marketplace.atlassian.com/codegeist , https://www.atlassian.com/blog/developer/codegeist-2025-kickoff
