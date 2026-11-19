# Pain points that Atlassian cross-product context could solve

Research date: 2026-11-19. Author: research sub-agent for Codegeist 2026 (deadline Dec 22 2026, 12:00pm PST / 3:00pm EST).

**What this is based on.** Pages marked **VERIFIED** were read in full with `curl` from the allowed hosts:

- community.atlassian.com
- marketplace.atlassian.com (REST API `/rest/2/addons`)
- developer.atlassian.com
- www.atlassian.com
- codegeist2026.devpost.com

Pages marked **SNIPPET** were seen only as web-search result summaries. Their hosts were blocked in this session:

- support.atlassian.com
- reddit.com
- news.ycombinator.com
- github.com repos
- vendor blogs such as itemis and Ketryx

A summary can be wrong, so treat SNIPPET items as leads to check. **INFERRED** marks my own reasoning.

**Reddit and Hacker News.** These could not be fetched. WebSearch also returned almost no Reddit or HN threads for these topics (it said so explicitly several times). So practitioner quotes here come mainly from the Atlassian Community.

---

## 1. Key facts

1. **Cross-product change propagation has been an open gap for years.** This means a Confluence requirement change reaching Jira, tests and code.
   - The traceability open letter on Atlassian Community (2025-06-03) cites the first request in 2009 (JRASERVER-19108). It says: "Teams lose track of requirement changes. Developers and testers miss critical context." **VERIFIED** [S1]
   - Users asked the same thing in 2019 [S2] and 2024 [S3]. Both times the only answer was "watch both" or subscribe to emails. **VERIFIED**
   - JRASERVER-71219, "Jira ticket watch a linked Confluence page", was still "Gathering Interest". **SNIPPET** [S4]

2. **Suspect links *inside Jira* are already crowded prior art.** Apps that offer them:
   - easeRequirements/R4J suspect logic [S5]
   - Tracestitch ("get flagged when a requirement changes under linked work") [M]
   - ArtUp Trace ("catch links that go stale when a requirement changes") [M]
   - Requira ("see every change's impact") [M]
   - Links Explorer ("change impact traced") [M]
   - Requirement Yogi (Confluence) could not auto-suspect as of May 2023; the vendor said it was "working on Automations" [S6]

   All **VERIFIED** from Marketplace listings or posts. Gap (INFERRED): these work inside one product's data model. None of the listings I read claims to flag Jira requirements, tests *and* Confluence specs as suspect because a Bitbucket PR, a JSM incident or a field issue changed. That cross-product trigger is the gap.

3. **Atlassian already ships AI for several "obvious" software-team ideas.** Avoid copying these:
   - **AI change risk assessment in JSM.** GA on 2026-03-31 for Service Collection Premium/Enterprise. It uses 10+ parameters: failed deployments (Bitbucket/GitHub/GitLab), missing rollback or test plans, recurring incidents, freeze windows and dependencies. It explains its evidence and suggests mitigations. **VERIFIED** [S7]
   - **Rovo Dev "Code Reviewer".** Checks a PR against the linked Jira work item's acceptance criteria and sorts each one as met, missing, or needs manual check. **SNIPPET** of support.atlassian.com [S8]. Atlassian says it cut its own PR cycle time 45%. **VERIFIED** [S9]
   - **Rovo Ops AI post-incident review drafts.** Built from the incident record, alerts, swarm channel and change history. Also suggests root causes. **SNIPPET** [S10]
   - **Decision Director agent.** Evaluates decision documents, finds related decisions and suggests experts. **VERIFIED** [S11]
   - **Confluence page owners / Verified pages,** plus a native automation template that un-verifies inactive pages. **SNIPPET** [S12]
   - **Jira native approvals** (Premium/Enterprise). **SNIPPET** [S13]

4. **Other Codegeist 2026 entrants are already public on GitHub in the regulated-traceability space.** All **SNIPPET** (search titles only; not opened):
   - "Trace" (Wayo2003): "Audit-ready traceability for regulated software teams… Rovo agent… Apps for Specialized Industries"
   - "TraceGuard" (shaon5775): requirement→test→risk matrix, "6 kinds of gap", release verdict; IEC 62304 / ISO 14971 / ISO 26262 / GxP
   - "PhaseAdviser": ASPICE/automotive checks
   - "TraceFlow": decision lineage across Jira and Confluence
   - "Accord": "decision drift" between Confluence decisions and Jira releases
   - "ANTICIPATE": "decision firewall"
   - Others: "Postmortem Pilot", "flakelens", "Deja-vu CI", "Retrace", "codecontext-specguard", "jira-release-scribe", "standup-compass" [S14]

   The Devpost gallery is not published yet, and 4,372 participants are registered. **VERIFIED** [S15]

5. **Regulated-domain incumbents on Marketplace** (Cloud installs from the API, read 2026-11-19, **VERIFIED** [M]):

   | App | Installs | Rating |
   |---|---|---|
   | Xray | 25,071 | 4.3★ |
   | Zephyr | 14,654 | — |
   | Zephyr Essential | 9,759 | — |
   | AIO Tests | 3,401 | — |
   | RTM (Deviniti) | 1,942 | — |
   | R4J | 1,890 | — |
   | Requirement Yogi Confluence | 1,582 | — |
   | Requirement Yogi Jira | 976 | — |
   | SoftComply Risk Manager Plus | 559 | — |
   | SoftComply Risk Manager | 548 | — |
   | Ketryx | 286 | — |
   | Links Explorer | 213 | — |
   | Requira | 104 | — |

   Newer small apps aimed at ISO 26262 / ASPICE / IEC 62304, several on Forge:
   - Grava (1 install; "alternative to DOORS and Jama… ISO 26262, ASPICE… AI quality checks, FMEA")
   - 4Spec (ASIL/DAL classification, e-signatures, on Forge)
   - Design Control for Jira (Qity; already ships "a Rovo agent that drafts and reviews them")
   - Clearlane IEC 62304 Test Management
   - Safety Risk for Jira
   - MedTech Compliance Tracker

6. **Atlassian is not ISO 26262 certified and is not pursuing it.** Atlassian replied to a community user on 2023-12-13: "As of this writing, Atlassian isn't pursuing an ISO 26262 certification." **VERIFIED** [S16]. Implication (INFERRED): a tool in an ISO 26262 chain needs a tool-confidence argument (ISO 26262-8 cl.11). A credible pitch is therefore "assistant that surfaces evidence for a human", not "the compliance tool".

7. **Practitioners keep describing the same gap: links, not consistency.**
   - Lucian Irimie, 2026-02-20, on decisions: "teams often document decisions in Confluence, but the operational impact still lives in Jira… Have you seen teams formalise the linking pattern… Or does it tend to rely on manual discipline?" **VERIFIED** [S17]
   - The ASPICE 4.0 literature (itemis, "Link Coverage 100%, ASPICE Assessment Still at Risk") stresses that linked items can disagree in *content*. Assessors want evidence of consistency, not just links. **SNIPPET** [S18]. This is a natural LLM task and none of the apps I checked advertises it explicitly (INFERRED).

---

## 2. Details

### 2.1 Software teams

| Pain | Evidence (who / when) | Native Atlassian coverage | Marketplace coverage | Remaining gap (INFERRED) |
|---|---|---|---|---|
| **Requirement or spec in Confluence changes and devs or testers don't know** | Balaji Vijayakumar, 2019-10-25: "how does the JIRA ticket get updates… when anyone has made changes to the confluence page?… this is not just linking." [S2]. MM_od50f0, 2024-02-29: "Is there any mechanism allowing to notify user (who is working or worked on this issue in past) if this linked confluence page was modified?" [S3]. Open letter, 2025-06-03 [S1]. **VERIFIED** | None. The only advice is to watch both. JRASERVER-71219 is "Gathering Interest" (SNIPPET [S4]) | C4J notifications, Exalate sync (SNIPPET [S4]). Requirement Yogi links only | **Semantic diff:** say *what* changed in the page and *which* acceptance criteria, tests and open PRs that change invalidates |
| **Deployment / change risk** | JSM GA post: "many teams still rely on manual judgment, scattered context, and tribal knowledge to assess change risk" [S7] **VERIFIED** | **Covered:** JSM AI risk assessment (Premium/Enterprise) [S7] | — | Low novelty unless you go to regulated or functional-safety change impact, which JSM explicitly defers ("future releases… compliance and business risk") [S7] |
| **Incident to change linkage** | ZigiWave post, 2026-04-02, calls the manual bridge "a workaround wearing an integration costume" and says "Zero traceability after the fact. Post-incident reviews are only…" [S19] **VERIFIED** (vendor post). Community answers (SNIPPET [S20]) confirm there is no native "caused-by" link type; Opsgenie had "Add Potential Cause" | Rovo Ops investigation and PIR drafts use change history (SNIPPET [S10]) | Various ITSM sync tools | Closing the loop *back to requirements, tests and docs*: an incident should update the runbook or Confluence and create a regression-test gap. Postmortem Pilot (competitor) does incident → PIR [S14] |
| **Code review context** | Blog consensus: a Jira link alone does not carry intent (SNIPPET [S21]) | **Covered:** Rovo Dev Code Reviewer checks acceptance criteria [S8][S9] | Bito, Aude, sielTrace and similar [M] | Reviewing a PR against *Confluence design decisions / ADRs*, safety requirements, and "who knows this code" (TWG ownership). Code Reviewer reads only Jira fields (SNIPPET [S8]) |
| **Onboarding to unfamiliar areas / who owns this** | Single-expert dependency and walkthrough knowledge "vanishes" (SNIPPET [S22]). Rovo needs ownership: "If no team clearly owns a service, Rovo won't know who to assign work to" (SNIPPET [S23]) | TWG relationship `AtlassianTeamOwnsCompassComponent` exists (Forge EAP) **VERIFIED** [S24]. Compass catalog and scorecards are reportedly moving to DX (SNIPPET [S23]); risky to depend on Compass | Unblocked, Sourcegraph and similar (outside Atlassian) | An "area dossier" built from TWG (people, decisions, incidents, docs, PRs) is plausible but close to what Rovo Search/Chat already does generically |
| **Decisions lost / decision drift** | Lucian Irimie, 2026-02-20: "decisions often get buried in comments or spread across multiple issues and Confluence pages. A few months later, it becomes hard to understand: why a certain option was chosen, who approved…, what alternatives were considered." Garth Bond: "I have the same challenges." [S17] **VERIFIED** | Confluence Decision macro and Decision report, but the report "can't retrieve decisions made in a Jira issue" (SNIPPET [S25]). Decision Director agent [S11] | Decision Log for Confluence; Simple Decision Log for Jira (SNIPPET [S25]) | **Crowded among Codegeist entrants** (Accord, TraceFlow, ANTICIPATE [S14]). Only enter with a sharp twist |
| **Stale docs** | Jay Maechtlen, 2026-07-07: "When an environment changes on an irregular schedule, how do you even predict the lifecycle… By looking at Jira tickets or other factors which seem to affect this particular content?" Rob Hean: page owner updating it "Practically… almost never happens". [S26]. Kris Klima (K15t), 2026-07-14: aim for "a system where any update to whatever you're documenting triggers documentation work." [S27] **VERIFIED** | Page owner, Verified pages, automation template (SNIPPET [S12]) | Evergreen, Stagbane Page Health Auditor, Stale Content Auditor, Breeze (SNIPPET [S12]); GitHub links for Confluence [M] | **Time-based staleness is crowded. Event-driven staleness is not obviously covered:** a merged PR, closed epic, incident or config change should mark the specific Confluence section that describes it as suspect. This is exactly what Maechtlen and Klima asked for |
| **Scale / governance across many teams** | Pallab, 2026-07-23: "Everything works fine until you have several teams… dependencies everywhere, approvals, testing…" Calogero Bonasia: "ownership is fragmented, workflows have grown independently, terminology differs across teams." [S28] **VERIFIED** | — | Many config-governance apps | Vague; weak hackathon fit |

### 2.2 Business teams

- **Approvals and handoffs.**
  - Jira native approvals capture decisions "reducing… lost approvals in email or chat", but only on Premium/Enterprise (SNIPPET [S13]).
  - Comala Document Management, Comala Document Control (699 installs), AppFox Workflows and AURA (297) cover Confluence page approvals [M] (VERIFIED listing summaries).
  - Gap (INFERRED): approvals are recorded, but whether an approved thing changed afterwards is not. An approval on a Confluence page or Jira item stays "approved" after the underlying content changes. That is the same suspect-link mechanic as in engineering, and a business-team flavour of the same core engine.
- **Decision tracking / knowledge decay.** Same evidence as 2.1 [S17][S26][S27]. Crowded among entrants.
- **Cross-tool handoffs.** "The Change Was Approved in ServiceNow, Nobody in Jira Knew It" (community, vendor-authored; SNIPPET [S29]).

### 2.3 Specialised industries

#### Automotive / ADAS (ISO 26262, ASPICE, SOTIF)

What the standards demand (secondary sources, SNIPPET):
- **ASPICE:** bidirectional traceability *and* consistency. ASPICE 4.0 explicitly asks for evidence that linked items agree in content [S18].
- **Impact analysis on change.** Change impact analysis is "a core ASPICE requirement for automotive software" (Deviniti App Central article, SNIPPET [S30]).
- **SOTIF (ISO 21448):** field monitoring that feeds discovered triggering conditions back into development, and an ever-growing scenario catalogue linked to the ODD and to validation scenarios (SNIPPET [S31]).

Practitioner and community evidence (VERIFIED):
- Mariam Seyranyan, 2023-12-13: "it is crucial to preliminarily assess whether our project management tools (Confluence, Jira) comply with ISO26262." Atlassian replied that it isn't pursuing certification [S16].
- Mirijam Forliano (TESVOLT AG, an energy-storage company working to functional-safety-type standards), 2023-05-04: "I have to set it manually, which is prone to errors. I don't know how to ensure consistency between requirements when I can't really see that one of the requirements has changed." She also asked for per-requirement change history [S6].
- Deviniti post (vendor, 2026-02-25) quoting HALready (functional-safety consultancy): "You might build a feature perfectly, only to realize during the certification phase that it doesn't meet the safety requirement defined six months ago in a PDF." [S32]

Prior art (Marketplace, VERIFIED [M]):
- **Requirements:** R4J (suspect schemes, baselines), RTM, Requira, Grava (explicitly ISO 26262/ASPICE, AI quality checks, FMEA), 4Spec (ASIL/DAL classification), NSYS
- **External ALM:** SodiusWillert OSLC Connect (IBM DOORS Next, Polarion, Windchill, Cameo; 48 installs); OpsHub sync connectors for Jama, Codebeamer and Polarion
- **Tests:** Xray / Xray Enterprise
- **Platform:** Ketryx markets a Jira connector for automotive (ISO 26262, ASPICE, UNECE R156); SNIPPET [S33]
- **Not found:** no Marketplace result for "safety case" (GSN / safety argument) or "SOTIF" / "triggering condition" apps. The `safety case` query returned only AI test generators [M]. Possible white space (INFERRED).

Gaps (INFERRED):
- Content-level **consistency checking** across the V-model chain (system req → SW req → design in Confluence → code in Bitbucket → Xray test), rather than link completeness
- **Cross-product suspect propagation**, e.g. a Bitbucket PR touching a safety-relevant component marks its requirements and tests suspect
- **Field-issue / incident → HARA / SOTIF triggering-condition feedback**
- **Safety case evidence freshness:** "which claims in my safety case now rest on suspect evidence?"

#### Medical device software (IEC 62304, FDA design controls)

- **The need.** IEC 62304 requires traceability among requirements, implementation, verification and risk controls. Auditors flag gaps "in either direction", and a stale matrix "looks worse than a single missing record" (SNIPPET [S34]). Ketryx and Greenlight Guru, both vendors, say Jira alone is "not usually sufficient as the complete compliance record" (SNIPPET [S35]).
- **Prior art (VERIFIED [M]):**
  - Ketryx Lifecycle Management (286 installs; Part 11, 13485, 62304, 14971)
  - SoftComply suite: Risk Manager / Plus (FMEA, hazard analysis), Document Manager, Validation for Confluence, Static Snapshots
  - Design Control for Jira (already has a Rovo agent)
  - Clearlane IEC 62304 Test Management
  - Safety Risk for Jira
  - MedTech Compliance Tracker
- **Gap (INFERRED):** this domain is the most crowded of the three regulated ones, both on Marketplace and among Codegeist entrants (Trace, TraceGuard).

#### Finance (SOX ITGC change management)

- **The need.** Auditors sample changes and ask for "the request, review, approval, test and deployment for each". Evidence breaks when "approval evidence ends up scattered across Slack threads and source control PRs". The classic failure is "the emergency hotfix pushed at 2am with no retroactive ticket" (all SNIPPET, vendor or guide blogs [S36]).
- **Prior art.** JSM change management with Bitbucket deployment gating (Atlassian blog, SNIPPET [S20]); JSM AI risk assessment [S7]. Marketplace (VERIFIED [M]): Configuration Manager for Jira (4,196 installs; config change, not code), Cardinal Ruler, Work item History, FirstTry Audit Evidence, Access Evidence, Certia (access reviews).
- **Not found:** an app on Marketplace that, given an auditor's sample, assembles the PR → approval → JSM change → deployment → ticket evidence pack and flags SoD violations (same author and approver) or unticketed deploys. Searched "SOX change", "audit evidence", "change management SOX" [M]. Possible gap (INFERRED), and notably *unclaimed* by the Codegeist entrants found (SNIPPET search returned no SOX entries [S14]).

---

## 3. Uncertainties / open questions

- **Reddit, HN, support.atlassian.com, GitHub and vendor blogs could not be fetched.** WebFetch failed DNS for every host, including allowed ones; `curl` worked only for the five allowed hosts. Every support.atlassian.com fact (Code Reviewer, PIR drafts, Verified pages, native approvals) is SNIPPET-level and should be confirmed before you rely on it.
- **Few genuine Reddit or HN quotes.** WebSearch returned essentially no Reddit or HN threads on these topics, so I cannot cite genuine Reddit or HN quotes. Community.atlassian.com quotes are real but come partly from vendor-adjacent posters (ZigiWave, Deviniti, K15t, MetaFrazo). Those are labelled where relevant.
- **Install counts differ between sources.** Marketplace numbers come from the `/rest/2/addons` API's `totalInstalls` (likely Cloud-only), which differ from the open letter's figures (e.g. Xray 32,300+ there vs 25,071 in the API).
- **Competitor repos are unverified.** The GitHub entries were seen only as search titles or snippets. Their scope, quality and whether they will actually be submitted are unknown. Recommendation: have the developer open them (links in S14) to calibrate novelty.
- **Compass's future.** A competitor (Cortex) says Compass access ends 2027-12-31, and Atlassian's page talks about moving the catalog to DX (SNIPPET [S23]). Avoid building on Compass-specific data.
- **JSM AI risk assessment roadmap.** It explicitly says compliance and business risk parameters will come in "future releases" [S7]. Atlassian may move into regulated change risk itself.
- **ISO 21448 and ISO 26262 normative wording.** I did not read the standards themselves. All requirement statements come from secondary sources.

---

## 4. Implications for idea selection (INFERRED)

1. **Do not build:** generic change risk scoring, PR-vs-acceptance-criteria review, PIR drafting, time-based stale-page detection, or a plain decision log. Atlassian ships these natively [S7][S8][S10][S11][S12], or Marketplace and other entrants already cover them.
2. **Do not build a plain "Jira traceability matrix + gap report + Rovo agent" for medtech.** At least two Codegeist entrants (Trace, TraceGuard) plus Design Control for Jira (which already has a Rovo agent) occupy that space.
3. **Highest-novelty white space for this developer** (ADAS background, Specialized Industries track) is **cross-product change propagation with semantic consistency checking**:
   - **Trigger:** any change anywhere in the graph — a Confluence spec section edit, a Bitbucket PR merged on a safety-relevant component, a JSM incident or field issue, or a changed approval.
   - **Engine:** use Teamwork Graph and Jira links to find dependents (requirements, tests, design pages, safety-case claims, approvals). Then use the LLM to judge whether each dependent is still *consistent in content*, not just still linked.
   - **Output:** precise suspect flags with "why" evidence, a re-verification task list, and an ASPICE/ISO 26262-style impact-analysis record for auditors.
   - **Evidence it is wanted:** the 2009→2025 request chain [S1–S4], Forliano's quote [S6], Maechtlen and Klima [S26][S27], and ASPICE 4.0 consistency [S18].
   - **How it differs from R4J, Tracestitch and others:** they flag in-Jira link suspects mechanically, while this would be cross-product and semantic.
   - **Fit with bonus prizes:** Rovo agent + actions (bonus), TWG consumption (bonus), and optionally an MCP server exposing `impact_of(change)` (bonus).
4. **Alternative white spaces,** less crowded but further from the developer's domain:
   - **SOX change-evidence pack** assembler (Bitbucket PR + JSM change + deployment + approvals, with SoD checks)
   - **SOTIF triggering-condition feedback loop** (field issue → scenario catalogue → requirement and test gap)
   - **"Safety-case evidence freshness" view.** No Marketplace hit for "safety case".
5. **Positioning:** frame it as decision support that keeps a human in the loop ("suspect, please re-verify"), not as certified compliance tooling. Atlassian is not ISO 26262 certified [S16], and JSM's own AI docs say not to auto-approve.
6. **Generality for judges:** the same engine serves business teams too ("approval is now stale because the contract page changed"). That makes it easier to pitch beyond automotive while keeping the ADAS demo.

---

## 5. Sources

Dates in brackets are the post's `dateCreated` where visible.

**Community, Atlassian, Devpost and Marketplace pages (read in full)**

- [S1] Open letter "Traceability for Atlassian: The Missing AI Enabler", Vitaly Oborsky [2025-06-03]: https://community.atlassian.com/forums/Atlassian-Platform-articles/Traceability-for-Atlassian-The-Missing-AI-Enabler-Open-Letter/ba-p/3036514
- [S2] "Confluence page updates to be reflected in the linked JIRA ticket" [2019-10-25]: https://community.atlassian.com/t5/Confluence-questions/Confluence-page-updates-to-be-reflected-in-the-linked-JIRA/qaq-p/1211759
- [S3] "Jira notification if confluence page was changed" [2024-02-29]: https://community.atlassian.com/t5/Jira-questions/Jira-notification-if-confluence-page-was-changed/qaq-p/2625237
- [S5] easeRequirements suspect configuration docs (SNIPPET): https://easesolutions.atlassian.net/wiki/spaces/REQ4J/pages/5406964/Configuring+Suspect+Schemes
- [S6] "Requirements Yogi Suspect Property", Mirijam Forliano [2023-05-04]: https://community.atlassian.com/forums/Confluence-questions/Requirements-Yogi-Suspect-Property/qaq-p/2350065
- [S7] "AI Risk Assessment is now generally available in Jira Service Management" [2026-03-31]: https://community.atlassian.com/forums/Jira-Service-Management-articles/AI-Risk-Assessment-is-now-generally-available-in-Jira-Service/ba-p/3214684
- [S9] Atlassian blog "How we cut PR cycle time with AI code reviews": https://www.atlassian.com/blog/rovo/how-we-cut-pr-cycle-time-with-ai-code-reviews
- [S11] Rovo use case "Decision Director": https://www.atlassian.com/software/rovo/use-cases/decision-director
- [S15] Codegeist 2026 Devpost overview and gallery (gallery not yet published; 4,372 participants): https://codegeist2026.devpost.com/ and https://codegeist2026.devpost.com/project-gallery
- [S16] "My inquiry is related to ISO 26262 Certification" [2023-12-13]: https://community.atlassian.com/forums/Jira-questions/My-inquiry-is-related-to-ISO-26262-Certification/qaq-p/2558285
- [S17] "Best practice for tracking key decisions and major changes in Jira Cloud?" [2026-02-20]: https://community.atlassian.com/forums/Jira-Cloud-Admins-discussions/Best-practice-for-tracking-key-decisions-and-major-changes-in/m-p/3195082
- [S19] "Your Bitbucket Repo and Your ITSM Tool Are Not Talking" (vendor post) [2026-04-02]: https://community.atlassian.com/forums/App-Central-discussions/Your-Bitbucket-Repo-and-Your-ITSM-Tool-Are-Not-Talking-Here-Is/td-p/3215709
- [S24] TWG relationship AtlassianTeamOwnsCompassComponent: https://developer.atlassian.com/platform/teamwork-graph/api-reference/relationship-types/atlassian-team-owns-compass-component
- [S26] "content governance – determining ownership and expected lifespan" [2026-07-07]: https://community.atlassian.com/forums/Confluence-questions/content-governance-determining-ownership-and-expected-lifespan/qaa-p/3259716
- [S27] "How do teams keep Confluence organized?" [2026-07-14]: https://community.atlassian.com/forums/discussion/3261835/how-do-teams-keep-confluence-organized
- [S28] "Does anyone else feel Jira gets harder to manage as more teams get involved?" [2026-07-23]: https://community.atlassian.com/forums/Enterprise-discussions/Does-anyone-else-feel-Jira-gets-harder-to-manage-as-more-teams/td-p/3266492
- [S32] "Spreadsheets vs. enterprise giants" (Deviniti, vendor) [2026-02-25]: https://community.atlassian.com/forums/App-Central-articles/Spreadsheets-vs-enterprise-giants-Finding-the-middle-ground-for/bc-p/3197194
- [M] Marketplace REST API, read 2026-11-19, e.g. `https://marketplace.atlassian.com/rest/2/addons?text=traceability&hosting=cloud` and `/rest/2/addons/{key}`. Listings:
  - Xray: key com.xpandit.plugins.xray
  - R4J: com.easesolutions.jira.plugins.requirements
  - RTM: com.deviniti.atlassian.apps.rtm
  - Requira: com.deviniti.atlassian.apps.requira
  - Requirement Yogi: com.playsql.requirementyogi / requirementyogijira
  - Grava: io.quietworks.grava
  - 4Spec: https://marketplace.atlassian.com/apps/2896869665/4spec-requirements-test-management-for-jira
  - Tracestitch: company.greatwork.tracestitch
  - ArtUp Trace: com.artuplabs.trace
  - Links Explorer: https://marketplace.atlassian.com/apps/1211120/links-explorer-traceability-matrix-hierarchy-dependency
  - Trace Gap: club.bobook.tracegap
  - Ketryx: https://marketplace.atlassian.com/apps/1228398/ketryx-lifecycle-management-for-jira
  - Design Control for Jira: com.qity.apps.designcontrol
  - Clearlane: com.clearlaneapps.tests
  - SoftComply Risk Manager (Plus): com-softcomply-riskmanager-cloud / -plus
  - SodiusWillert OSLC Connect: com.sodius.oslc.app.jira
  - Comala Document Control: https://marketplace.atlassian.com/apps/1215729/comala-document-control
  - Comala Document Management: https://marketplace.atlassian.com/apps/142/comala-document-management
  - Decision Log for Confluence: https://marketplace.atlassian.com/apps/2435494237/decision-log-for-confluence
  - Simple Decision Log: https://marketplace.atlassian.com/apps/1962325789/simple-decision-log-for-jira
  - Evergreen: https://marketplace.atlassian.com/apps/1279909983/evergreen-stale-pages-content-review-for-confluence
  - Stagbane: https://marketplace.atlassian.com/apps/1110488446/stagbane-page-health-auditor-for-confluence
  - Stale Content Auditor: https://marketplace.atlassian.com/apps/1040161133/stale-content-auditor-for-confluence
  - Configuration Manager for Jira: com.botronsoft.jira.configurationmanager

**Search snippets only (not read in full)**

- [S4] JRASERVER-71219: https://jira.atlassian.com/browse/JRASERVER-71219 ; also JRASERVER-45184: https://jira.atlassian.com/browse/JRASERVER-45184
- [S8] "Check acceptance criteria in a code review": https://support.atlassian.com/rovo/docs/check-acceptance-criteria-in-a-code-review/
- [S10] "Create a PIR in Incident Command Center": https://support.atlassian.com/jira-service-management-cloud/docs/create-a-pir-in-incident-command-center/ ; Investigate incidents with Rovo: https://support.atlassian.com/ja/jira-service-management-cloud/docs/investigate-incidents-with-rovo/
- [S12] Verified pages: https://community.atlassian.com/forums/Confluence-articles/Verified-Pages-Now-Available-in-Confluence/ba-p/2664827 ; stale pages: https://community.atlassian.com/forums/App-Central-articles/How-to-Find-and-Fix-Stale-Pages-in-Confluence/ba-p/3199981
- [S13] Jira approvals announcement: https://jirareleases.atlassian.com/announcements/approvals-that-keep-work-moving
- [S14] Codegeist 2026 GitHub repos (titles/snippets only):
  - https://github.com/Wayo2003/trace
  - https://github.com/shaon5775/traceguard
  - https://github.com/thinhquoc17091989-sudo/PhaseAdviser
  - https://github.com/Soham-0047/traceflow
  - https://github.com/ZNLong2203/Accord-codegeist-2026
  - https://github.com/toskaman/anticipate-codegeist-2026
  - https://github.com/Esimuda/postmortem-pilot
  - https://github.com/FERBIN12/flakelens
  - https://github.com/BaptisteFaisy/deja-vu-ci
  - https://github.com/05TIME/retrace
  - https://github.com/Gieez/codecontext-specguard
  - https://github.com/jbzhu1029-creator/jira-release-scribe
  - https://github.com/Wwang1119/standup-compass-codegeist-2026
- [S18] itemis, "Link Coverage 100%, ASPICE Assessment Still at Risk": https://www.itemis.com/en/blog/compliance-intelligence/requirements-traceability/aspice-traceability-vs-consistency/
- [S20] JSM/Bitbucket change management: https://www.atlassian.com/blog/it-teams/a-modern-approach-to-change-management-with-bitbucket-and-jira-service-management ; JSM link incidents: https://support.atlassian.com/jira-service-management-cloud/docs/link-incident-records-to-a-task-in-another-project/
- [S21] PR description context: https://www.racecondition.software/blog/pr-descriptions
- [S22] Onboarding knowledge loss: https://arxiv.org/html/2603.25391v1 ; https://github.blog/developer-skills/application-development/how-github-engineers-learn-new-codebases
- [S23] Atlassian "closing the AI context gap": https://www.atlassian.com/blog/company-news/closing-the-ai-context-gap ; Compass→DX: https://support.atlassian.com/compass/docs/what-is-compass/ ; Cortex (competitor): https://www.cortex.io/post/atlassian-compass-end-of-life-what-to-do-next
- [S25] Decision report limits: https://community.atlassian.com/forums/Jira-questions/Do-decisions-in-Jira-snyc-to-Confluence-decision-reports/qaq-p/3106288
- [S29] "The Change Was Approved in ServiceNow, Nobody in Jira Knew It": https://community.atlassian.com/forums/App-Central-discussions/The-Change-Was-Approved-in-ServiceNow-Nobody-in-Jira-Knew-It/td-p/3258490
- [S30] "What is a Requirements Traceability Matrix…": https://community.atlassian.com/forums/App-Central-articles/What-is-a-Requirements-Traceability-Matrix-and-How-to-Generate/ba-p/3258571
- [S31] SOTIF triggering conditions: https://arxiv.org/pdf/2302.00551 ; https://hardwareaireview.pages.dev/articles/what-is-sotif-a-complete-guide-to-iso-21448-and-safety-of-the-intended-functiona
- [S33] Ketryx automotive connector: https://www.ketryx.com/use-case/jira-connector-for-automotive
- [S34] Medical device RTM / DHF: https://www.disher.com/blog/design-history-file-fda-scrutiny-part-2 ; https://dev.to/beefedai/traceability-matrix-best-practices-for-medical-device-vv-592
- [S35] https://www.greenlight.guru/blog/samd-dev-tools-compliance ; https://www.ketryx.com/blog/iec-62304-requirements-traceability-matrix-rtm-in-jira-a-guide-for-medical-device-companies
- [S36] SOX change evidence: https://www.systemshardening.com/articles/cicd/sox-compliant-deployment-pipeline/ ; https://coraa.ai/blog/sox-change-management-controls-what-to-test-beyond-itgc-basics ; https://changeriskintel.com/posts/sox-change-control-requirements-mapped-to-itsm/
