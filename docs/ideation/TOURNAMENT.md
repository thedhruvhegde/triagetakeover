# Codegeist ideation tournament

This document records how the 40 candidate ideas were generated and scored, the full ranking, the three options worth building after an adversarial critique, and a single recommendation. The full text of every idea is in the appendix.

## 1. Method

**Generation.** Four lenses each produced 10 ideas, 40 in total:

- Software Teams
- Business Teams
- Specialized Industries
- A cross-cutting Forge platform lens (Teamwork Graph, Rovo agents, MCP). Its ideas are filed under whichever prize category each one best fits.

Ideas were written to a fixed template: one-liner, user and pain, what it does, modules and APIs, context usage, aha moment, bonus fit, technical risks, judge test data and deterministic core.

**Judging.** Three independent judges scored every idea on each criterion below. A deterministic weighted total was then computed for each idea from the judges' scores. "Spread" in the table is the disagreement between the three judges' totals. A high spread means the judges disagreed and the score is less reliable.

**Weights.**

| Criterion | Weight |
|---|---|
| technical_depth | 3 |
| product_completeness | 3 |
| impact | 3 |
| novelty | 3 |
| demo_clarity | 3 |
| feasibility | 3 |
| twg_essential | 2.5 |
| judge_reproducible | 2.5 |
| low_crowding | 2.5 |
| scope_control | 2 |
| category_odds | 2 |
| portfolio_value | 2 |
| platform_risk | 2 |
| bonus_fit | 1.5 |
| startup_potential | 1.5 |
| skills_leverage | 1.5 |
| data_safety | 1 |

**Changes from the developer's suggested weights.** Only one bonus prize can be won, so `bonus_fit` was cut to 1.5. Grand prizes are awarded per category, so `category_odds` (2) and `low_crowding` (2.5) were added. These two reward ideas that face few strong rivals in their own category.

**Critique.** An adversarial critic reviewed the top 5 against prior art on 2026-11-19, using 46 Devpost searches, 17 Atlassian Marketplace API queries and the Forge community forums. The critic then proposed one mutated idea that grafts parts of other ideas onto the winner. Section 3 takes the critique into account. The scores in section 2 do not.

## 2. Full ranking

The numbers are copied unchanged from the scoring run. Ties keep the order they had in the scoring output (I29 and I40 both scored 70.34; I05 and I28 both scored 68.59; I12 and I35 both scored 67.74).

| Rank | ID | Name | Category | Total | Judge spread |
|---:|---|---|---|---:|---:|
| 1 | I21 | Takeover Triage: ADAS disengagement intake that clusters itself | Specialized Industries | 74.53 | 0.9 |
| 2 | I27 | ODD Coverage Atlas: scenario coverage against the operational design domain | Specialized Industries | 71.84 | 3.72 |
| 3 | I22 | Trigger Ledger: SOTIF triggering-condition feedback loop | Specialized Industries | 71.03 | 2.44 |
| 4 | I24 | Argument Health: live GSN safety cases whose claims turn amber when evidence moves | Specialized Industries | 70.64 | 1.54 |
| 5 | I29 | Spec Ripple: Confluence safety-spec edits that mark dependent Jira requirements and tests suspect, with a semantic diff | Specialized Industries | 70.34 | 1.28 |
| 6 | I40 | Safety Case Pulse (GSN evidence freshness) | Specialized Industries | 70.34 | 3.85 |
| 7 | I33 | Triggering Condition Desk (SOTIF field loop) | Specialized Industries | 69.7 | 1.41 |
| 8 | I23 | Calibration Guard: sensor calibration and config integrity for validation runs | Specialized Industries | 69.02 | 2.05 |
| 9 | I25 | SOX Change Pack: auditor-sample evidence assembler with segregation-of-duties checks | Specialized Industries | 68.93 | 2.05 |
| 10 | I01 | Spec Ripple | Software Teams | 68.72 | 1.41 |
| 11 | I05 | Fix Fan-out | Software Teams | 68.59 | 6.15 |
| 12 | I28 | OTA Regression Radar: field-issue rates by software version, with a UNECE R156 impact record | Specialized Industries | 68.59 | 1.28 |
| 13 | I20 | SOX Change Evidence Pack | Business Teams | 68.25 | 2.56 |
| 14 | I11 | Promise Keeper: customer commitments vs the roadmap | Business Teams | 68.16 | 1.79 |
| 15 | I13 | Material Change Guard for approvals | Business Teams | 68.12 | 1.15 |
| 16 | I32 | ReqIF Delta: OEM requirement drops into the graph | Specialized Industries | 67.99 | 5.51 |
| 17 | I34 | Calibration Window: out-of-tolerance impact analysis | Specialized Industries | 67.86 | 4.1 |
| 18 | I12 | Policy Ripple: policy change to KB and macro drift | Business Teams | 67.74 | 2.69 |
| 19 | I35 | Fleet Regression Bisect | Specialized Industries | 67.74 | 3.85 |
| 20 | I04 | Backport Radar | Software Teams | 67.48 | 5.9 |
| 21 | I39 | Promise Keeper: customer commitments vs the roadmap | Business Teams | 67.26 | 0.9 |
| 22 | I31 | Ripple: section-level spec change propagation | Software Teams | 66.62 | 2.82 |
| 23 | I03 | Sunset Sweeper | Software Teams | 66.58 | 5.9 |
| 24 | I10 | Change Evidence Pack (SOX ITGC) | Business Teams | 65.64 | 5.9 |
| 25 | I30 | Vigilance Clock: medical-device complaint reportability and regulatory deadline router | Specialized Industries | 65.51 | 2.69 |
| 26 | I06 | Crash Twin | Software Teams | 65.38 | 3.21 |
| 27 | I36 | SOX Sample Binder | Business Teams | 65.04 | 2.95 |
| 28 | I26 | 510(k) Change Navigator: FDA software-change regulatory assessment inside the change request | Specialized Industries | 65 | 5.64 |
| 29 | I09 | Incident Flight Simulator | Software Teams | 63.55 | 3.21 |
| 30 | I15 | Budget Burn at the Moment of Approval | Business Teams | 63.16 | 3.72 |
| 31 | I37 | Policy Drift Guard for service-desk knowledge | Business Teams | 62.95 | 3.97 |
| 32 | I02 | Runbook Tripwire | Software Teams | 62.86 | 3.59 |
| 33 | I07 | Regression Lineage | Software Teams | 62.56 | 4.74 |
| 34 | I18 | Entitlement Guard for support agents | Business Teams | 61.97 | 2.44 |
| 35 | I14 | Launch Truth Check | Business Teams | 60.98 | 4.74 |
| 36 | I16 | Already Own It: duplicate-purchase check for procurement | Business Teams | 60.3 | 0.38 |
| 37 | I38 | Slip Radar: dependency-aware goal impact | Business Teams | 59.57 | 5.51 |
| 38 | I17 | KB Contradiction Radar | Business Teams | 58.76 | 1.15 |
| 39 | I19 | Goal Reality Check | Business Teams | 58.59 | 3.72 |
| 40 | I08 | Scar Tissue | Software Teams | 55.64 | 2.44 |

**What the ranking shows:**

- Specialized Industries takes the top 9 places.
- Several ideas are near-duplicates that came from different lenses:
  - Spec Ripple: I01, I29 and I31
  - SOX evidence: I10, I20, I25 and I36
  - Promise Keeper: I11 and I39
  - SOTIF: I22 and I33
  - GSN safety case: I24 and I40
  - Calibration: I23 and I34
- These clusters matter more than small score gaps.
- I05 Fix Fan-out (6.15), I04, I03 and I10 (5.9) had the largest judge spread, so their placings are the least certain.

## 3. Top 3 recommendation (after the critique)

The critic killed I29, I24, I27 and I22 as standalone entries:

- **I29:** Spec Guard and at least eight other 2026 entrants already cover it.
- **I24:** looks like existing traceability roll-ups to non-safety judges.
- **I27:** its core output depends on LLM tagging.
- **I22:** its statistics rest on an exposure number the judge types in.

The same objections apply to their twins: I40 is like I24, I33 is like I22, and I01 and I31 are like I29.

I21 survived, and the critic strengthened it into a mutated version. The next two options are the highest-ranked ideas that the critique does not undermine: I23 and I25.

### Option A: Takeover Triage+ (MUTATION of I21, with grafts from I22, I27 and optionally I24)

- **One-liner:** Weekend ADAS takeover tickets cluster themselves by what the car actually did, not by what the driver typed. Each cluster says which build it started on, whether that start is statistically real given the km driven per build, and whether any scenario test covers its conditions.
- **User and pain:** The ADAS validation lead of a 5 to 50 car test fleet faces 200 or more Monday-morning tickets that all say "car drifted left, took over", each with CSVs and dashcam stills attached.
  - Duplicates go to three perception engineers.
  - A genuinely new failure mode sits unread for a week.
  - Text-only duplicate finders cannot separate or merge these tickets correctly.
- **What it does:**
  - **Intake:** A Custom UI "File takeover" modal takes a CSV and 1 to 4 JPEGs, with column mapping. The browser parses the telemetry and decodes the frames locally, so the server never decodes images.
  - **Signatures:** Deterministic signal rules give the takeover type, peak lateral error, minimum TTC and takeover timing. Image metrics give condition chips: glare fraction, Laplacian blur, brightness for night and rain, and optionally dHash.
  - **Storage:** The downsampled telemetry (about 10 Hz x 20 s x 8 channels) and the metrics go in an issue entity property.
  - **Clustering:** Rule buckets (takeover type + build + sensor variant), then kNN within each bucket, with a fixed novelty threshold that produces "proposed new cluster".
  - **Explanations:** A "Why this match" table shows the feature vector, the per-feature distance and the rule that fired.
  - **I22 graft:** An exact Poisson onset test against real per-build drive km from drive-session records, for example "0 events in 3,100 km on 4.11.x vs 8 in 2,400 km on 4.12.0, p<0.01". It suggests a "Re-evaluate build" issue routed to the owning team.
  - **I27 graft:** Deterministic condition tags are compared with the tags on scenario-test issues: "0 scenario tests cover low-sun x cam-B x lane-loss". One click creates a scenario stub.
  - **Optional I24 graft:** A cluster baseline diff showing new events since the last triage.
- **Aha moment:** Two tickets with the identical text "car drifted left, took over".
  - Ticket A joins ADAS-311 "Lane-loss under low sun, cam-B" (8 events), with three near-identical plots side by side. It also shows "First seen 4.12.0, regression significant, 0 scenario tests cover this", and one click links it and creates the stub.
  - Ticket B is split into a late-brake, night cluster, with "Why: TTC and brake-onset distance 3.2x threshold".
  - Then, in Rovo Chat: "Which clusters started on 4.12.0?"
- **Modules and APIs:**
  - Jira-only core: Custom UI intake modal, jira:issuePanel (SVG signal plot, chips, similar plots, why-table, Accept / Split / Route), jira:issueAction "Triage now", jira:projectPage "Cluster board" with the build-onset check.
  - Storage: issue entity properties, plus KVS or Custom Entities for vectors (no Forge SQL).
  - Vehicle registry: in KVS, with an optional Assets adapter.
  - Optional: @forge/llm for symptom normalisation and cluster naming.
  - Agent: rovo:agent "Fleet Triage" with actions get-cluster-for-event, explain-match, build-regression-check, list-novel-since, create-cluster and link-event.
  - rovo:skill "Monday takeover triage playbook", and rovo:mcp exposing the same actions.
- **Primary category / bonus:** Specialized Industries / Rovo Agents. rovo:mcp also qualifies; select it as well, but write the bonus write-up for Agents.
- **Top risks:**
  1. The browser-side decode path and the entity-property size limit. Spike both on day 1. Server-side attachment download hits 403 BLOCKED_EGRESS via api.media.atlassian.com.
  2. Rovo credit cost and action latency on judges' sites.
  3. Strong Specialized Industries rivals: Lab QC and Clean Point.
  4. Scope creep beyond 30 days. Cut the JSM portal and Assets (both optional) and Forge SQL and the three.js cube (both dropped); dHash is stretch only.
  5. Seed circularity, since the same developer writes the generator and the classifier.
- **Why it could win:**
  - There is no disengagement, takeover or drive-log triage app on Devpost or the Marketplace.
  - Clustering on signals and conditions rather than words is a real, visible differentiator. The identical-text split demo proves it in seconds.
  - Signal plots and a build-regression statistic are things no text-similarity rival can show.
  - It is Jira-only, so it installs more easily than every multi-product rival.
  - The LLM is optional, and the core is deterministic and testable.
  - It follows the FleetOps precedent (a 2025 winner in a fleet domain, with Agents).
  - It has the highest score (74.53) and the lowest judge spread among the leaders (0.9).
- **Why it might not:**
  - The market is narrow, so the video has to pitch generality: robots, drones, e-scooters, industrial machines, or any ticket that carries a time-series.
  - Judges may suspect the seed is rigged. Mitigations: seeded noise, CSV column mapping for judges' own files, and a what-if sliders page.
  - Rovo Agents is the most contested bonus.
  - It is the heaviest build of the three.

### Option B: Calibration Guard (I23)

- **One-liner:** Test vehicles, sensors and calibrations are modelled as assets. A test run cannot be marked valid if the car's calibration had expired or did not match the plan, and a calibration later found bad marks every run since the last good check as suspect.
- **User and pain:** A validation test manager signs off a homologation or regression campaign. Two weeks before release, a curb strike is found to have knocked V3's camera 0.8 degrees out. Nobody can say which of the last 140 passed runs are still valid, because calibration lives in a spreadsheet and the runs live in Jira.
- **What it does:**
  - An app-installed schema: Vehicle, Sensor, CalibrationRecord and SWBuild.
  - A Forge workflow validator on "Executed -> Passed" checks that a valid calibration covered each required sensor on the run date, the residual threshold, the sensor variant against the test plan, and the build against the release candidate. It explains exactly why when it blocks.
  - A JSM "calibration incident" triggers back-propagation: runs between the last good calibration and the incident become "Suspect - calibration", with evidence and a re-test list grouped by test case.
  - A release dashboard shows the valid, suspect and unverifiable shares.
  - The LLM only drafts the re-test justification.
- **Aha moment:**
  1. A transition is blocked: "V3 front camera calibration expired 2 days before this run (CAL-88)".
  2. A "Curb strike V2" incident is filed. 23 Passed runs flip to Suspect, and the dashboard drops from 96% to 81% valid.
  3. A 9-case re-test plan is drafted.
- **Modules and APIs:** jira:workflowValidator, jira:issuePanel, jira:projectPage / version panel, a JSM request type and trigger, Assets REST via requestJira (with an app-storage fallback), Jira REST, @forge/llm, and a rovo:agent "Validation Integrity" with actions check-run-validity, find-runs-affected-by-calibration and propose-retest-plan.
- **Primary category / bonus:** Specialized Industries / Rovo Agents.
- **Top risks:**
  - Assets licensing on judges' sites; build an identical app-storage fallback.
  - Creating the schema programmatically may need admin rights.
  - Validators need a company-managed workflow, and they have latency limits.
  - It overlaps I34 Calibration Window.
- **Why it could win:**
  - It is almost fully deterministic interval logic, so it is highly reproducible and testable.
  - Blocking a transition is a very clear decision change.
  - No prior art was flagged.
  - It follows the FleetOps / Assets win pattern.
  - The judge spread is low (2.05).
- **Why it might not:**
  - The AI and novelty story is thin.
  - Its look (a validator plus a dashboard) can seem ordinary.
  - It depends on Assets.
  - It was not stress-tested by the critic, so unknown rivals may exist.
  - The vehicle registry and calibration date can be folded into Option A anyway, which makes it a feature of A as much as a product.

### Option C: SOX Change Pack (I25)

- **One-liner:** Paste an auditor's sample of changes and get a Confluence evidence page per change, with the request, approvals, implementer, tests and timestamps. Deterministic SOX ITGC checks cover segregation of duties, approval before deploy, emergency retro-approval and unapproved changes.
- **User and pain:** The IT compliance lead at a listed fintech or bank has 5 days to answer a PBC request for 25 sampled changes. Two days go on screenshots, and then she finds that change #17 was approved by its own implementer.
- **What it does:**
  - Seeded, reproducible sampling.
  - It collects the JSM change fields, approvals, the changelog (who transitioned to Implementing and Closed), linked work items, dev info and deployments via TWG where present, and test evidence.
  - Each control is a pure function with a control ID. The verdict is pass, exception or not applicable.
  - It generates a Confluence page tree (a summary, plus a child page per change with every claim linked to its source record) and an exception issue for each failure.
  - The LLM only drafts the exception narrative and management response.
- **Aha moment:**
  1. Paste "CHG-1..CHG-40, sample 10, seed 2026".
  2. About 40 s later the page shows "8 pass, 2 exceptions".
  3. CHG-17: "Approved by A. Rivera 14:02; implemented by A. Rivera 14:05. SoD violation ITGC-CM-03", with both timestamps linked to the history entries.
- **Modules and APIs:** jira:globalPage, the JSM approvals API and changelog via Jira REST, Confluence REST v2, TWG GET actions, Forge KVS, an async consumer, @forge/llm, and a rovo:agent "Audit Evidence" with actions build-evidence-pack, check-change-controls and list-exceptions. Optionally, a connector app for synthetic deployments.
- **Primary category / bonus:** Specialized Industries (finance and regulated) / Teamwork Graph, with Rovo Agents as the fallback.
- **Top risks:**
  - Judges' sites lack PR and deployment data, so the core must run on JSM and Jira history alone.
  - Every demo actor is the same judge account, so the seed needs implementer and approver user-picker fields.
  - Category ambiguity: it could be moved to Business Teams.
  - Four near-duplicates exist in this list (I10, I20, I36), which hints that other entrants could have the same idea.
  - It must never claim certification.
- **Why it could win:**
  - No Marketplace app or Codegeist entrant was found.
  - Auditors need determinism, which makes it testable and credible.
  - Clear money and time savings give it high startup potential.
  - The two-red-cells aha is instantly readable.
  - It runs on JSM data alone, with honest "not determinable" results where evidence is missing.
- **Why it might not:**
  - It is less visual.
  - The TWG bonus depends on dev-tool data that judges will not have.
  - The finance framing may land it in Business Teams.
  - Its prior-art check was lighter than the critic's check on the top 5.

### RECOMMENDATION: build Option A, Takeover Triage+ (the mutation of I21)

Takeover Triage+ is the only top-ranked idea that came through the prior-art critique intact, and the critique made it stronger:

- **Score:** it led the scoring at 74.53, almost 3 points clear, with the lowest judge spread at the top (0.9). Each of the four ideas ranked just below it was killed as a standalone entry.
- **No direct prior art:** no app on Devpost or the Atlassian Marketplace triages takeovers by signal, and every duplicate finder there compares text only.
- **A demo that proves the claim:** two tickets with the same wording land in different clusters, and two with different wording land in the same one.
- **The grafts are cheap:** they add a statistically honest build-regression verdict (I22) and a scenario-coverage gap (I27), both computed from data the seed really contains.
- **Easy install:** the core is Jira-only, while Spec Ripple, the GSN ideas and SOTIF all need a multi-product install.
- **Small LLM role:** the LLM is optional cosmetics, so the core does not depend on the model getting things right.
- **Precedent:** the FleetOps win fits both the category and the Agents bonus.

The real risks are engineering, not positioning. Spike the browser-side decode and entity-property path on day 1, hold the cut list, and keep Calibration Guard's vehicle and calibration registry as an optional part of A rather than a second project. If the day-1 spike fails and no workaround appears within the first week, fall back to Option C, which has the lowest platform risk.

## 4. Critic findings, top 5

| Rank | Idea | Verdict | Main findings |
|---|---|---|---|
| 1 | I21 Takeover Triage | **SURVIVE (best)** | See below. |
| 2 | I27 ODD Coverage Atlas | **KILL as primary, graft one part** | See below. |
| 3 | I22 Trigger Ledger | **KILL as standalone, graft the statistics** | See below. |
| 4 | I24 Argument Health | **KILL as primary** | See below. |
| 5 | I29 Spec Ripple (safety) | **KILL** | See below. |

**I21 Takeover Triage (SURVIVE):**

- **Prior art:** none on Devpost or the Marketplace. Adjacent entries such as Déjà Vu and ReviewPulse, and the Marketplace duplicate finders, are text-only. Clustering on signals and conditions is the real differentiator, so demonstrate both a split and a merge.
- **Attachment egress:** a Forge limit blocks server-side attachment download (403 BLOCKED_EGRESS via api.media.atlassian.com, ECO-88). The fix is browser-side intake and decoding, with metrics stored as issue entity properties. Spike it on day 1.
- **Assets:** make the core Jira-only, with an app-storage vehicle registry and an optional Assets adapter.
- **Reproducibility:** fight seed circularity with seeded noise, CSV column mapping, a "Why this match" table and a what-if sliders page.
- **Thin data:** use rule buckets first, then kNN within a bucket, plus a novelty threshold. Skip Forge SQL.
- **Scope:** cut the JSM portal, dHash and the MCP polish.
- **Agent:** "what's new since Friday?" is just JQL. The agent needs actions that only this engine can answer, plus a skill.
- **Ethics:** never score drivers, and use synthetic frames only.
- **Pitch:** present the engine as general. It fits any ticket that carries a time-series.

**I27 ODD Coverage Atlas (KILL as primary, graft one part):**

- **LLM dependence:** the core output depends on LLM tagging of free-text tests into ODD enums. If the tags are wrong, the holes are wrong, and the judge cannot tell.
- **Looks like a dashboard:** T-CAFE on the Marketplace already does pairwise generation.
- **Missing data:** exposure weighting needs field data that judges will not have.
- **Visuals:** the three.js cube risks a "visual over substance" critique.
- **Weak TWG fit:** the links it uses are plain Jira links.
- **Graft into A:** compare deterministic condition tags on clusters with scenario-test tags, in a small 2D gap view.

**I22 Trigger Ledger (KILL as standalone, graft the statistics):**

- **Unique, but fragile:** there is no SOTIF app on Devpost or the Marketplace. But its MATCH, BREACH and NOVEL outputs depend on LLM attribute extraction.
- **Assumed denominator:** the exposure km is typed in by the judge.
- **Heavy setup:** it needs a Confluence table parse and a Jira + JSM + Confluence install.
- **Slow aha:** about 2 minutes of ISO 21448 narration come before it lands.
- **TWG risk:** TWG access errors inside actions.
- **Graft into A:** a Poisson / Clopper-Pearson bound computed from real per-build drive km.

**I24 Argument Health (KILL as primary):**

- **No direct prior art, but it looks familiar:** there is no GSN or safety-case app. To non-safety judges, though, it looks like the Scrutineer and Tracewell roll-ups with a different notation, which judges cannot appreciate.
- **Scope:** about 2 weeks (DSL, elkjs layout, n-of-m semantics, baselines, multi-product install) before any aha.
- **Single source:** its evidence is Jira statuses only.
- **Bolted-on bonus:** TWG adds nothing that Jira links do not already give.
- **Salvage:** only the baseline-diff idea.

**I29 Spec Ripple, safety framing (KILL):**

- **Direct prior art:** Spec Guard (Codegeist 2026) already does spec-vs-work-item checks, before/after text on spec changes, quote-verified findings, a coverage map, a Rovo agent with 9 actions that are also MCP tools, and a JQL field.
- **Crowded space:** also Tracewell, Scrutineer, ChangeProof, Ripple, Golden Set, ScopeSync, Spec-to-Code Trace & Linter, Tether and Precedent. The brief's "strongest open gap" is filled.
- **Feature, not product:** the unit-aware fact diff is a feature, not a product.
- **Platform friction:** it needs a multi-product install, is exposed to the up-to-3-minute Confluence event lag, and section anchoring breaks when headings are renamed.
- **Twins:** the same verdict applies to I01 and I31 (Software Teams framings), and largely to I12 and I37.

**Wider context from the critic:** Specialized Industries already has strong 2026 entrants:

- Lab QC: a Westgard engine with an agent, MCP and a skill, the same pattern this plan uses.
- Clean Point: an 8D Rovo lead for IATF 16949.
- Scrutineer and TraceGuard (ISO 26262 traceability), Tracewell (suspect tests), Change Radius (IEC 62304 change impact) and Spec Guard.

Novelty alone will not win. The demo has to show something rivals cannot.

## 5. Appendix: full detail of every idea

The ideas appear in ID order, with their text unchanged from the generation step.

### I01: Spec Ripple

*Category: Software Teams. Rank 10 of 40, total 68.72, judge spread 1.41.*

**One-liner.** When someone edits a section of a Confluence API or feature spec, every Jira story, test and open bug that depends on that section is marked suspect, with a before/after diff and the clauses it affects.

**User and pain.** The QA lead or developer whose story was refined against v3 of a spec page, after a PM quietly edited the 'Rate limits' section to v4. Today nobody notices until sprint review or production (the open letter from 2025-06-03, JRASERVER-19108, the 2019 and 2024 community asks). Linking alone does not help: 'how does the Jira ticket get updates when anyone has changed the Confluence page... this is not just linking.'

**What it does.** Breaks each linked Confluence page into sections by heading anchors and keeps a fingerprint of each section's normalised text plus the identifiers it contains (endpoints, field names, numbers with units, MUST/SHALL clauses). On a page update, or on a 'Check now' button, it diffs the sections deterministically. It then finds dependents: Jira issues that link to the page, its smart links, or the section anchor, plus unlinked issues whose description or acceptance criteria share those identifiers (JQL text search, then token overlap). For each one it sets a 'Spec changed' flag (an issue property plus a glance badge) and shows a panel with the diff of the section, the identifier changes (e.g. 429 threshold 100/min -> 60/min) and the AC lines that quote the old value. Actions are Acknowledge (no impact), Re-verify (adds a checklist comment and moves the issue to a 'Needs re-verify' status if one is configured) and Dismiss. A Confluence byline/macro shows the page author the blast radius ('this edit touches 7 open issues in 3 projects') before they publish the next edit.

**Modules and APIs.** confluence:contentBylineItem + Confluence page-updated trigger (UI button for the demo, because events can lag 3 min); jira:issuePanel + jira:issueGlance; async consumer (900 s) for the diffs; KVS/Custom Entities for section fingerprints; Forge LLM only to write a one-paragraph 'what changed semantically' note and to classify ambiguous matches; rovo:agent 'Spec Ripple' with GET actions (list-suspects-for-page, explain-impact) and a CREATE action (create-reverify-task); optional TWG consume (ConfluencePage -> linked JiraWorkItem) to find dependents across projects.

**Context usage.** Joins Confluence page version history (v_n vs v_n-1 body storage), Jira issue links, remote links, AC text and status, and optionally TWG page-to-issue edges. Neither product alone can tell that an edit invalidated a specific acceptance criterion.

**Aha demo moment.** The PM changes '100 requests/min' to '60 requests/min' in the spec and publishes. A few seconds later the story PAY-142 opens with an amber 'Spec changed' glance. The panel shows the red and green section diff and highlights the AC line 'returns 429 after 100 req/min'. One click on Re-verify creates the checklist comment. The byline on the page reads '3 dependents re-verifying'.

**Bonus fit.** Primary: Teamwork Graph (consumes TWG page-to-issue relationships to find dependents across projects, persisted query). Also qualifies for Rovo Agents. Backup if the TWG spike fails: Agents.

**Technical risks.** Multi-product app (Jira + Confluence) installs only on sites that have both, and storage is per product, so fingerprints must live on the Confluence side and findings must be pushed to Jira through properties. Section anchoring breaks when headings are renamed (fall back to Jaccard similarity on the section body). False positives on common identifiers (mitigate with an IDF threshold). The Confluence update trigger lags. This is close to the brief's 'strongest gap', so expect a few rival entries, but they are mostly safety-traceability ones.

**Judge test data.** A 'Seed demo' admin page creates a Confluence 'Payments API spec' with 6 sections and 8 Jira stories and tests: 4 linked, 2 that only mention identifiers, and 2 decoys. Because the engine works on any real page with linked issues, judges can also edit their own page and see results.

**Deterministic core.** Section segmentation, normalisation, identifier extraction (regexes for paths, snake/camel identifiers, numbers with units, RFC-2119 keywords), section diff (Myers), dependent discovery (links plus IDF-weighted token overlap) and suspect-state transitions are all deterministic and unit-tested with fixture pages. The LLM writes only the human-readable 'semantic change' sentence and breaks ties on borderline matches, and its result is never the only reason an item is flagged.

### I02: Runbook Tripwire

*Category: Software Teams. Rank 32 of 40, total 62.86, judge spread 3.59.*

**One-liner.** When a Jira change, a JSM change request or a merged PR renames a config key, endpoint, CLI flag or service, the exact Confluence runbook paragraphs that still quote the old value get a 'stale since CHG-311' banner.

**User and pain.** The on-call SRE at 3 a.m. who follows a runbook step `kubectl rollout restart deploy/payments-api` when the deployment was renamed `payments-svc` two weeks ago in CHG-311. Docs owners 'practically... almost never' update pages (Rob Hean, 2026-07-07). Kris Klima asks for 'a system where any update... triggers documentation work'. Existing stale-page apps only look at page age.

**What it does.** Pulls 'old -> new' identifier pairs out of change records. It reads Jira issues and JSM change requests (description, custom fields, comments) with deterministic patterns (`renamed X to Y`, `X -> Y`, diff-style -/+ lines in code blocks, env var tables) and, if Bitbucket is present, merged PR diffs. It then searches Confluence (CQL text search, then an exact token match inside code blocks and inline code) for pages in runbook-labelled spaces that still contain the old identifier. Each hit is a 'tripwire': a content property on the page, a banner macro/byline listing each affected paragraph with a link to the change that broke it, and a JSM/Jira task for the page owner with a pre-drafted find-and-replace patch (old -> new in context). 'Apply suggestion' edits the page in place as a new version, only when the user confirms.

**Modules and APIs.** jira:issuePanel on change issues ('Docs this change will break'); JSM change request trigger plus a manual 'Scan docs' button; confluence:contentBylineItem + a macro for the banner; Confluence REST v2 (CQL search, page update); optional Bitbucket repository:pullRequest merge trigger; Forge LLM to phrase the patch rationale and to extract rename pairs from free text when the regexes miss; rovo:agent with a GET action (find-stale-runbook-steps for a change) and a CREATE action (open-doc-fix-task).

**Context usage.** Joins JSM change requests or Jira issues (what changed) with Confluence runbooks (what people execute), and optionally Bitbucket diffs. The value only exists in the join.

**Aha demo moment.** The demo approves the JSM change 'Rename payments-api deployment to payments-svc'. The change's panel immediately lists '3 runbook steps will break' with the exact lines. Opening the 'Payments failover' runbook shows a red banner over step 4 with 'stale since CHG-311 (approved 2 min ago)'. One click applies the patched command.

**Bonus fit.** Primary: Rovo Agents (an on-call agent answers 'is this runbook still valid?' using the find-stale-runbook-steps action). Teamwork Graph consumption (change -> linked pages) is a natural secondary.

**Technical risks.** Extracting rename pairs from free text is noisy (offer a structured 'Renames' field on the change form as the precise path). The Confluence page update must keep macros intact (edit storage format carefully). Multi-product install. Sherlock Sync (2025 2nd place) did 'merge -> update docs' with an LLM, so it is important to differentiate on precise identifier tripwires, JSM changes as the trigger and human-confirmed patches.

**Judge test data.** The seed creates a 'Runbooks' space with 4 pages of realistic kubectl, env var and curl steps, plus 3 JSM/Jira change issues containing renames. Judges can also type any 'rename A to B' change against their own pages.

**Deterministic core.** Rename-pair extraction regexes, code-block tokenisation, exact and boundary-aware matching, paragraph localisation, patch generation and banner state are deterministic. The LLM is a fallback extractor whose output is shown as 'inferred' and needs confirmation, and it writes the rationale text.

### I03: Sunset Sweeper

*Category: Software Teams. Rank 23 of 40, total 66.58, judge spread 5.9.*

**One-liner.** Turns a Confluence deprecation notice ('API v1 /orders sunsets Mar 31') into a living campaign: it finds every Jira project, open issue and Confluence page that still depends on the deprecated thing, opens one tracked task per owning team, and burns down on the notice page.

**User and pain.** The platform team lead deprecating an internal API, an SDK version or a feature flag, who spends weeks grepping Jira and Confluence and chasing teams over Slack. Then a straggler breaks on sunset day. Nothing native connects a deprecation announcement to the people still using the deprecated thing.

**What it does.** A 'Deprecation' macro on a Confluence page declares the identifiers (e.g. `/v1/orders`, `orders-client@2.x`, `LEGACY_CHECKOUT_FLAG`), the replacement and the sunset date. A scan job runs JQL text and CQL searches plus exact token matching to find dependents: open Jira issues, epics, components, and Confluence pages (how-tos, runbooks, onboarding). It groups them by owning team, using the Jira team field, the project lead or TWG team ownership. For each team it creates one Jira migration task with the evidence list (deep links and matching excerpts) and the due date, and links it back. The macro renders a burn-down: references remaining per team, tasks done and days to sunset. New references created after the announcement (someone writes a new ticket that uses v1) trigger an 'added after deprecation' warning glance on that issue.

**Modules and APIs.** Confluence macro (Custom UI) for the notice and burn-down; scheduledTrigger (daily) plus a 'Rescan' button; async consumer for the scan; Jira REST to create and link tasks; jira:issueGlance warning on new references; Forge SQL to track reference history for the burn-down; Forge LLM only for the migration-task description and a per-reference 'how to migrate' hint drawn from the notice text; rovo:agent 'Sunset' with actions get-campaign-status and find-references-to(identifier); TWG consume for team ownership (AtlassianTeam -> project/component).

**Context usage.** Joins the Confluence announcement, Jira issues and projects across teams, Confluence usage docs, and team ownership from TWG or Jira teams. It changes actions: tasks get created and routed, and new usage is flagged.

**Aha demo moment.** The demo inserts the macro on 'Deprecating Orders API v1'. Within about 20 s it shows '23 references across 4 teams', creates 4 linked tasks and draws the burn-down. The presenter then creates a new story that says 'call /v1/orders' and the warning glance appears on it immediately.

**Bonus fit.** Primary: Teamwork Graph (team ownership and cross-project traversal, which is natural here). Also qualifies for Rovo Agents. Marketplace is plausible because the app is generic and listable.

**Technical risks.** Search recall depends on Jira/Confluence text search tokenisation of paths and identifiers (post-filter with exact matching, and accept some misses). Team ownership data on judge sites is thin (fall back to the project lead). Scheduled triggers cannot call TWG as the app (run the TWG lookups in UI-triggered asUser scans). Creating issues across projects needs permissions.

**Judge test data.** The seed creates 3 projects, 15 issues that mention the identifiers in varied forms, 4 Confluence pages and a deprecation page. It also works on any real identifier a judge types into the macro.

**Deterministic core.** Search, exact-match filtering, grouping, task creation, burn-down metrics and the new-reference detection rule are deterministic. The LLM writes only the task prose and the per-reference migration hints.

### I04: Backport Radar

*Category: Software Teams. Rank 20 of 40, total 67.48, judge spread 5.9.*

**One-liner.** For teams that ship supported release lines, the moment a bug is fixed it computes which supported versions still need the fix, opens backport tasks, and lists the JSM customers running those versions.

**User and pain.** The release manager or maintenance-team lead of on-prem or LTS software (versions 4.2, 4.3 and 5.0 under support) who learns from a customer escalation that a security fix landed in 5.1 but never reached 4.3. Affects/Fix versions exist in Jira, but nobody does the set arithmetic against the support matrix that lives in a Confluence table.

**What it does.** Reads the support matrix from a Confluence page table (version, branch, end-of-support date, optionally customer orgs) or from Jira version metadata. When a bug moves to Done, or when someone presses 'Check backports', it computes (versions the bug affects, expanded by semver ranges such as '>=4.2') intersected with currently supported versions, minus versions already fixed or with a linked backport. It shows a matrix in an issue panel (fixed, pending, missing, out of support) and offers 'Create backport tasks' (one subtask or linked issue per missing line, tagged with the branch name). It finds JSM requests linked to the bug, or from organisations that the matrix or Assets map to the affected versions, and lists them as 'customers exposed until backported'. A project page shows a backport-debt dashboard across all bugs, sorted by severity and days exposed.

**Modules and APIs.** jira:issuePanel (matrix plus actions); jira:projectPage (debt dashboard); Jira issue-transitioned trigger plus a manual button; Confluence REST to parse the support-matrix table (optional; the matrix can also live in Forge storage via an admin page); JSM request search and organisations; optional Assets for customer -> deployed version; Forge LLM only to draft the customer-facing 'fix available in 4.3.7' note; rovo:agent actions get-backport-status(issue) and list-exposed-customers(version).

**Context usage.** Joins Jira versions and fix/affects fields, the Confluence support policy, and JSM customer requests and organisations (and optionally Assets). The decision it changes is which backports to create and which customers to warn.

**Aha demo moment.** The presenter resolves SEC-88 (fixVersion 5.1). The panel flips to a matrix: 5.0 has a fix (linked), 4.3 is MISSING (red), and 4.2 is out of support in 12 days. It shows '2 JSM customers on 4.3 exposed'. One click creates the 4.3 backport task, and the dashboard count drops.

**Bonus fit.** Primary: Rovo Agents (a 'release steward' agent answers 'what's exposed on 4.3?'). Marketplace also fits well: it is generic and needs no AI, so the listing review is easy.

**Technical risks.** Teams model versions in inconsistent ways (a parser for version names, plus an admin mapping UI). The customer-to-version mapping may not exist on judge sites (seeded config plus an Assets option). The project is mostly deterministic, which is good for reliability but weaker on 'AI' innovation, so the agent and the drafted notes carry that part. Jira+JSM only is a simple install, and Confluence is optional.

**Judge test data.** The seed creates versions 4.2-5.1, 12 bugs with mixed affects/fix states and existing backport links, a support-matrix page and 5 JSM requests from 3 organisations. It works on any project that has versions.

**Deterministic core.** Version parsing and range expansion, the set computation, link detection, exposure joins and the dashboard metrics are all deterministic and property-testable. The LLM handles only the customer notes and the agent's explanations.

### I05: Fix Fan-out

*Category: Software Teams. Rank 11 of 40, total 68.59, judge spread 6.15.*

**One-liner.** On release day it finds every open JSM ticket that today's Jira release actually resolves, including the unlinked ones, and drafts a reply for each support agent.

**User and pain.** The JSM support agent with 40 open 'waiting on dev' tickets who learns days later, or from an angry customer, that the fix shipped on Tuesday. Linked issues cover only the tickets someone remembered to link. Duplicates filed by other customers stay open, and SLAs burn.

**What it does.** When a Jira version is released, or someone presses 'Fan out' on the release page, it collects the fixed issues and builds a signature for each: error codes, stack-frame and log fingerprints, the component, and key phrases from the summary and description. It matches them against open JSM requests in mapped service projects. Matches are tiered: (1) directly linked, (2) linked to a duplicate of the issue, (3) the same error code or log fingerprint, (4) lexical similarity above a threshold. Each match shows its evidence, for example 'both contain ERR_PAYMENT_4012 and frame CheckoutService.capture'. Each matched request gets an internal note and a draft public reply ('Fixed in 3.4.0, released today; please update...') that the agent reviews and sends with one click. There is also 'Link and transition to Pending customer confirmation'. A release-page summary shows 'Resolves 17 customer tickets (9 unlinked)'.

**Modules and APIs.** jira:versionReleased trigger plus a button in a project page or release hub panel; JSM servicedesk APIs (request search, comments public/internal, transitions, links); JSM queue/request panel (jsm:... issue panel on requests) to show the 'Fixed by release' badge; KVS for signatures; Forge LLM to draft replies in the agent's language and tone (it gets the matched evidence only); rovo:agent with actions find-tickets-resolved-by(version) (GET) and post-draft-reply (CREATE, user-confirmed).

**Context usage.** Joins Jira Software release contents with JSM customer requests and their text, using fingerprints that neither product computes. It changes actions: it links, replies and transitions.

**Aha demo moment.** The presenter clicks Release on 3.4.0. The panel says 'Resolves 6 customer tickets, 4 of them never linked', each with highlighted evidence such as a matching error code. Opening one JSM request shows a ready-to-send reply. Send, and the request moves to 'Pending confirmation'.

**Bonus fit.** Primary: Rovo Agents (a support agent asks 'which of my tickets did today's release fix?'). Marketplace is a secondary option because it is generic.

**Technical risks.** Precision of the lexical tier (show the tier and the evidence, require a click, never auto-send). JSM APIs differ from Jira's (request vs issue endpoints). The release event may lag (use a manual button in the demo). Jira Software + JSM on the same site is likely on judge sites. Some overlap with native linked-issue automation, which is handled by focusing on unlinked matches.

**Judge test data.** The seed creates a software project with a 3.4.0 version of 8 fixed bugs and a JSM project with 15 requests: 2 linked, 4 matching by error code or stack trace with different wording, and the rest decoys. It also works on any real released version.

**Deterministic core.** Signature extraction (error-code regexes, stack-frame normalisation, component mapping), tiered matching, BM25 similarity with a threshold, and the link and transition logic are deterministic and have a precision/recall test set. The LLM drafts only the reply text.

### I06: Crash Twin

*Category: Software Teams. Rank 26 of 40, total 65.38, judge spread 3.21.*

**One-liner.** Groups bug reports by fingerprinting the stack traces, log snippets and error screenshots pasted into Jira and JSM, deterministically like Sentry but inside Jira, so the 14th customer report of the same crash is linked to the canonical bug and adds to its impact count instead of starting a new investigation.

**User and pain.** The triage engineer or dev on support rotation facing a JSM escalation queue where the same NullPointerException arrives with 9 different titles. Text-similarity duplicate finders (Merge Assistant, Find Duplicates) miss these because the titles differ. The real signal is in the stack trace or the error-dialog screenshot.

**What it does.** On issue or request creation, or from a 'Fingerprint' button, it extracts stack traces from the description, comments and text attachments (Java, JS, Python and .NET grammars). It normalises them by stripping line numbers, memory addresses, lambda and anonymous suffixes, generated ids and vendor/framework frames, then hashes the top N in-app frames plus the exception type. Log snippets are templated (numbers, UUIDs and timestamps replaced with tokens, Drain-style). Image attachments get a perceptual hash (dHash/pHash in pure JS on decoded PNG/JPEG) and an optional tesseract.js (WASM) OCR of the error text, which is then fingerprinted too. Matching fingerprints form a cluster with a canonical issue. A glance shows '1 of 14 reports, 6 customers, first seen 3.3.2'. 'Link as duplicate' and 'Move watchers and requesters' act on the cluster. A cluster view shows frequency by version and component.

**Modules and APIs.** jira:issueGlance + jira:issuePanel; issue-created triggers on Jira and JSM projects; async consumer for attachment download and image hashing (pngjs/jpeg-js plus a custom DCT; tesseract.js optional in the function, within memory and size limits); Forge SQL for fingerprints and clusters (indexed lookup); Forge LLM only to title the cluster in plain English and suggest which frame is the likely culprit; rovo:agent actions get-cluster(issue) and list-top-crashes(version); optional separate graph:connector app that writes 'duplicate-of / same-crash-as' relationships into TWG.

**Context usage.** Joins JSM customer requests (impact, organisations) with Jira bugs (fix ownership, versions), using artifact content that neither product parses. Bug priority changes based on real customer impact.

**Aha demo moment.** A new JSM request titled 'checkout broken again!!' arrives with a phone screenshot of an error dialog and a pasted trace. Within seconds its glance reads 'Same crash as PAY-311 (13 other reports, 5 customers)'. The panel shows the matching normalised frames side by side and the screenshot's near-identical pHash twin. 'Link and notify' merges it into the cluster.

**Bonus fit.** Primary: Rovo Agents. Teamwork Graph is possible by writing clusters through a separate connector app, the less crowded 'write' side, but that doubles the app count.

**Technical risks.** Grammars for stack-trace formats (scope to 3-4 languages). tesseract.js in a Forge function: cold start, language data size, the 1024 MB memory limit and the 25/55 s limits mean it must run in an async consumer; keep pHash as the reliable path and OCR as optional. Image decoding for HEIC and other odd formats (skip them). Attachment download needs the read:jira-work scope and 500 KB invoke payloads (fetch inside the function).

**Judge test data.** The seed generates about 40 synthetic bug reports from a procedural generator: 5 underlying crashes rendered with varied titles, line numbers, ids and framework noise, plus screenshots of error dialogs rendered with different window sizes and JPEG quality (made with node-canvas offline and attached on seed). Judges can paste any real stack trace.

**Deterministic core.** Trace parsing, normalisation, hashing, log templating, the pHash and Hamming threshold, and clustering are 100% deterministic and covered by golden-file tests. The LLM only names clusters and adds a hint about the suspect frame.

### I07: Regression Lineage

*Category: Software Teams. Rank 33 of 40, total 62.56, judge spread 4.74.*

**One-liner.** When a bug is filed or reopened as a regression, it finds the earlier fix that once closed the same defect and the changes shipped in between, so the bug goes straight to the right component and team with a likely culprit window.

**User and pain.** The engineer who picks up 'Export to CSV drops the last row' without knowing it was fixed 14 months ago in REP-77 by another team, and spends a day rediscovering the root cause. Regressions are the most expensive bugs to triage, because the knowledge exists but is buried in closed issues.

**What it does.** For a new or reopened bug it builds a defect signature (component, error codes, a normalised stack or log if present, key noun phrases) and searches resolved bugs (JQL with the resolution set, then BM25 plus the signature) for earlier twins. For the best twin it pulls its fix: fixVersion, linked PRs/commits from the development panel when available, the resolving comment, and the root-cause field or comment. It then computes the window between the twin's fixVersion and the first version the new bug affects, and lists the issues shipped in that window that touched the same component or labels, ranked by overlap. That is the suspect list. The panel shows a timeline from fixed (REP-77, v2.3), through 11 issues in the same component across v2.4-v2.9, to regressed (v2.9). It offers 'Link as regression-of', 'Route to the team that fixed it last time' (team, not individual) and 'Add regression test task'.

**Modules and APIs.** jira:issuePanel; issue-created and reopened triggers plus a button; Jira search, versions and dev-status (optional); optional TWG consume to traverse issue -> PR -> commit -> files when connected dev tools exist (a richer suspect list when present, graceful when absent); Forge LLM to summarise 'how it was fixed last time' from the twin's comments; rovo:agent actions find-prior-fix(issue) and list-suspect-changes(issue).

**Context usage.** Joins the current bug with Jira history across years and projects, versions and release order, the development panel or TWG code entities, and team ownership. The routing and linking decision changes.

**Aha demo moment.** A tester files 'CSV export missing final row'. The panel immediately shows 'Probable regression of REP-77 (fixed in v2.3)', with last time's root-cause comment ('off-by-one in paginator flush') and a 6-version suspect window in which REP-140 'Refactor paginator' is the top-ranked suspect. Clicking the link and routing buttons finishes triage in 30 seconds.

**Bonus fit.** Primary: Teamwork Graph (issue -> PR -> commit traversal is the showcase when dev data exists, with a Jira-only fallback). Also qualifies for Agents.

**Technical risks.** Judge sites probably lack dev-tool data, so the core must work on Jira versions, components and text alone, and the TWG code hops are only a bonus layer. Twin precision on short summaries (show a confidence score and the evidence, plus top-3 alternatives). This is near the 'similar issues' features natively in JSM (differentiate with the fix-window and suspect-change analysis, which is unique).

**Judge test data.** The seed creates a project history of about 60 resolved bugs across versions 2.0-2.9 with 4 planted regression chains (a fix, then a refactor in the same component, then a regression report) plus noise. Real data works wherever versions and components exist.

**Deterministic core.** Signature extraction, BM25 ranking, version ordering, window computation and suspect ranking (component and label overlap times recency) are deterministic. The LLM only condenses the earlier fix discussion.

### I08: Scar Tissue

*Category: Software Teams. Rank 40 of 40, total 55.64, judge spread 2.44.*

**One-liner.** Code-review context that remembers incidents: when a PR or Jira change touches a file, service or config that once caused a JSM incident, the reviewer sees the incident, its PIR lesson and the post-incident actions that are still open, right in the PR or issue.

**User and pain.** The reviewer approving a 'small' change to `db/migrations/` or `retry_policy.yaml` who has no idea that the same file caused a 2-hour outage in March and that the PIR said 'always run migration dry-run on staging first'. Rovo Dev reviews code against acceptance criteria, not against the organisation's incident history.

**What it does.** Builds an incident-scar index from resolved JSM incidents and their linked PIR Confluence pages: file paths, service names, config keys, feature flags and SQL table names extracted deterministically from the incident description, timeline comments, PIR text and linked Jira action items. When a Bitbucket PR is opened (optional) or a Jira issue in a dev project mentions or links touched paths or services, it matches against the index. It shows a 'Scar' card listing past incidents on these paths, the specific PIR lesson sentence (quote with deep link), and open action items from that PIR that are still not done ('add migration dry-run gate: OPS-210, open 94 days'). Reviewers can 'Acknowledge lesson' (recorded on the PR or issue as a comment). Optionally a Bitbucket merge check warns, without blocking, when a scar is high severity and unacknowledged.

**Modules and APIs.** Jira issue panel on dev issues (core path, needs no Bitbucket); optional bitbucket:repoPullRequestCard + bitbucket:mergeCheck; JSM incident queries and Confluence PIR page fetch; KVS/SQL scar index rebuilt by a scheduled trigger plus a button; Forge LLM to pick the single most relevant lesson sentence from a PIR (extractive, quoted verbatim) when there are several; rovo:agent action get-incident-history-for(paths|service) usable from Rovo Chat during review.

**Context usage.** Joins JSM incidents, Confluence PIRs, Jira action-item status and code changes (Bitbucket or path mentions in Jira). The reviewer's decision to approve, request a dry-run or chase the open action changes.

**Aha demo moment.** A story 'Tweak retry backoff in retry_policy.yaml' is opened. The Scar card glows: 'INC-58 (Sev1, Mar 12) was triggered by a change to this file', with the PIR lesson quoted ('backoff below 200ms caused thundering herd on ledger-db') and 'Action OPS-210 still open'. In the optional Bitbucket shot, the merge check warns until someone acknowledges.

**Bonus fit.** Primary: Rovo Agents (a reviewer asks Rovo 'has this file hurt us before?'). Teamwork Graph is secondary (incident -> linked pages and work items).

**Technical risks.** Bitbucket is likely absent on judge sites, so the Jira issue path must be the primary demo and Bitbucket shown as optional on a personal workspace. Incidents rarely name files explicitly (also match on service and config-key level, and the PIR template can include an 'Affected paths' field). Overlap with Rovo Ops incident investigation is low because this runs at review time. Incidents/postmortems have about 20 entries, so keep the pitch on review time, not on incidents.

**Judge test data.** The seed creates 6 JSM incidents with PIR pages (realistic timelines) and action items in a mix of states, and 5 dev stories that touch scarred and clean paths. Real sites with any incidents and PIR pages work too, at the service-name level.

**Deterministic core.** Entity extraction (path, service, config-key and table regexes plus a service list from Assets or components), index build, matching, severity and recency scoring, and open-action detection are deterministic. The LLM only selects and quotes a lesson sentence, which is always shown verbatim with its source link.

### I09: Incident Flight Simulator

*Category: Software Teams. Rank 29 of 40, total 63.55, judge spread 3.21.*

**One-liner.** Onboards new on-call engineers by replaying the team's own resolved JSM incidents as step-by-step drills: the alerts, comments and status changes arrive in real time order, the trainee chooses the next diagnostic step, and then sees what the real responders did and which runbook covered it.

**User and pain.** The engineer joining an on-call rotation for an unfamiliar service in 3 weeks, whose only preparation is reading old incident tickets out of order. Game-day tools (Rootly Academy, FireHydrant fire drills, incident.io tabletops) live outside Atlassian and use generic scenarios, not the team's own incident history in JSM.

**What it does.** Converts a resolved incident into a deterministic replay script from its changelog, comments, linked alerts, linked changes and timestamps: ordered events with the real time gaps compressed. In a full-page Jira app, the trainee sees events reveal as on a timeline. At decision points (each responder action recorded in the comments, such as 'checked ledger-db connections', 'rolled back CHG-90') the trainee picks or types their next step from options built from the actual actions plus plausible distractors taken from other incidents. They can open the runbooks and Confluence pages that existed at that time (the page version as of the incident date). The debrief shows the real path, time to mitigate, the runbook sections that would have shortened it, and gaps where no runbook covered the step, which gives a 'create runbook section' task for the service owner. Progress is private to the trainee, with no scores for managers.

**Modules and APIs.** jira:globalPage / jsm full page (Custom UI with a timeline player); JSM incident and changelog APIs; Confluence page version API (historical versions); Forge storage for replay scripts and private trainee progress; Forge LLM for (a) turning terse comments into readable narration and (b) generating distractor options and assessing free-text answers against the real actions, always with the deterministic real path as ground truth; rovo:agent 'Drill coach' with actions start-drill(service), next-event and reveal-debrief, so the drill also runs in Rovo Chat.

**Context usage.** Joins JSM incidents (timeline, changelog), linked Jira changes and fixes, Confluence runbooks and PIRs as of that date, and the services in Assets or components. The trainee's readiness changes, and runbook gaps become tasks.

**Aha demo moment.** The trainee picks 'payments-api'. INC-58 starts replaying: 02:14 'p99 latency alert', 02:16 'checkout errors spike'. They choose 'restart pods' and the simulator shows 'responders tried that, no effect, 12 min lost'. They open the runbook as it was on March 12 and find that step 3 was missing. The debrief reveals the actual fix (rollback of CHG-90) and offers 'Add this to the runbook'.

**Bonus fit.** Primary: Rovo Agents (a conversational drill coach agent is a natural, not bolted-on, use of an agent). Marketplace is secondary.

**Technical risks.** Comment quality varies (sparse incidents give short drills, so show a 'replay richness' score and filter for incidents with at least N events). Avoid any performance-scoring perception (private, opt-in, no manager view). Historical Confluence versions need the right API and permissions. The Innovation story is strong, but the judges' own JSM incident history may be empty (seed data is required).

**Judge test data.** The seed creates 4 richly commented incidents with timelines, linked changes, and runbook pages with version history, where an earlier version lacks a step that was added after the incident. These are generated by a script that writes realistic sequences. It works on any resolved incident that has comments.

**Deterministic core.** Replay script construction (event ordering, gap compression, decision-point detection from action verbs and linked changes), version-at-time lookup, the real-path debrief and runbook-gap detection are deterministic. The LLM narrates, generates distractors and grades free text, and is shown alongside the deterministic ground truth.

### I10: Change Evidence Pack (SOX ITGC)

*Category: Business Teams. Rank 24 of 40, total 65.64, judge spread 5.9.*

**One-liner.** Given an auditor's sample of changes or deployments, it assembles the request -> approval -> review -> test -> deployment evidence chain for each one from Jira, JSM, Confluence and Bitbucket or dev info, and flags segregation-of-duties breaks and unticketed hotfixes before the auditor does.

**User and pain.** The engineering manager or IT compliance analyst who receives a 25-change audit sample and spends 2-3 days screenshotting tickets, approvals and PRs. The classic finding is the 2 a.m. hotfix with no retroactive ticket, or the developer who approved their own change. No Marketplace app or 2026 entrant was found that assembles this chain.

**What it does.** The user pastes or imports a sample (change keys, deployment ids, or a date range from which it draws a random sample with a seeded RNG for reproducibility). For each item it walks the chain deterministically: JSM change request -> CAB approval records (approver, time) -> linked Jira work items -> development info (PRs, reviewers, merge time) and test evidence (linked test issues or a Confluence test-report page) -> deployment record (Jira deployments or a change implementation comment). It checks the control rules: an approval exists before deployment, approver differs from implementer and from PR author, the PR was reviewed by someone other than its author, emergency changes have a retro-approval within N days, and deployments have a ticket. Results are a per-item pass/exception grid with clickable evidence, and an exportable evidence pack (a Confluence page per sample with a frozen snapshot table and a hash of the evidence for tamper evidence). Exceptions can become JSM remediation tasks.

**Modules and APIs.** jira:globalPage (sample workspace) + JSM change request panel ('evidence chain: 4/5 complete'); JSM approvals API; Jira dev-status/deployments, or TWG consume for deployment and PR entities where connected; Confluence page creation for the pack; Forge SQL for samples and results; Forge LLM only for the auditor-facing narrative per exception; rovo:agent actions build-evidence(change), list-sod-violations(range). A Forge jira:deploymentInfoProvider-style seed or manual 'deployment record' issue type is used where no CI is connected.

**Context usage.** Joins JSM change and approvals, Jira work items, code review and deployment data (dev info, TWG or Bitbucket), and Confluence test reports. It changes decisions: an exception is remediated before the audit and an emergency change is flagged.

**Aha demo moment.** The presenter pastes 10 change keys and clicks Build. A grid fills: 8 green chains, 1 amber (approved 6 minutes after deploy), 1 red (implementer = approver = PR author). Clicking the red cell shows the 3 evidence links. 'Export pack' produces a Confluence page with snapshot tables and hashes.

**Bonus fit.** Primary: Teamwork Graph (deployment, PR and work-item traversal is the canonical TWG use) if dev data exists; otherwise Rovo Agents. Cross-category: Business Teams (or Specialized Industries, finance), because the buyer is compliance and finance IT, not developers.

**Technical risks.** Judge sites probably have no Bitbucket, CI or deployment data, so the chain must accept JSM/Jira-native stand-ins (seeded deployment issues) and degrade honestly ('link missing'), which risks feeling synthetic. Must be pitched as surfacing evidence for humans, not as a compliance certification. It falls outside the software-teams lens, so it competes in Business Teams. Approvals API shape differs per JSM project config.

**Judge test data.** The seed creates a JSM change project with 20 changes, including approvals, 3 planted SoD violations and 2 emergency changes (one without retro-approval), linked Jira stories and test pages, plus deployment-record issues. It works on the judge's own JSM changes for the approval checks even without dev data.

**Deterministic core.** Sampling, chain traversal, all control rules, the time-ordering checks and evidence hashing are fully deterministic and auditable (this matters for the audience). The LLM writes only exception narratives, clearly labelled.

### I11: Promise Keeper: customer commitments vs the roadmap

*Category: Business Teams. Rank 14 of 40, total 68.16, judge spread 1.79.*

**One-liner.** Pulls out every dated promise made to a customer in JSM tickets and Confluence account plans, ties it to the Jira epic that has to deliver it, and warns the account owner when that epic's dates no longer support the promise.

**User and pain.** A Customer Success Manager is 10 minutes from a QBR with a $400k account. Six weeks ago, in a JSM comment, they wrote 'SSO via Okta will be live before your March renewal'. The epic's fix version moved from Feb 28 to Apr 15 three weeks ago, and nobody told them. They find out on the call, from the customer.

**What it does.** (1) It scans JSM request comments, Confluence 'Account plan' pages and Jira issues labelled customer-facing for commitment statements: an actor, a deliverable, a date or relative deadline, and a customer org. (2) It resolves each deliverable to a Jira epic or version, first from explicit links and keys, then from a ranked TWG and JQL text match that the CSM confirms with one click. (3) A deterministic checker compares the promised date with the epic's due date, its fix-version release date and a throughput forecast (remaining issues / 4-week median closed rate). (4) Status per promise: Safe / At risk / Broken / Delivered. (5) Actions: an issue-glance badge on the JSM ticket, a 'Promises' tab on the Confluence account page, a weekly digest, and a Rovo agent that drafts a proactive 'heads-up' reply quoting the original promise and the new date, for the CSM to approve.

**Modules and APIs.** jira:issuePanel + jira:issueGlance (JSM request), confluence:contentBylineItem / macro on account page, jira:globalPage 'Promise board', trigger on avi:jira:updated:issue (fixVersion/duedate change -> re-evaluate dependents), scheduledTrigger daily, Forge SQL (promises, links, evaluations), @forge/llm (extraction with verbatim span offsets), rovo:agent 'Promise Keeper' + actions get-promises-for-customer / check-promise / draft-heads-up (CREATE comment), TWG API (issue->version->project, Confluence page->linked issues), rovo:mcp exposing the same actions.

**Context usage.** It joins JSM (where the promise was made, and the customer org) with Jira Software (epics, versions, sprint throughput) and Confluence (account plans). The promise and the reality sit in different products and are owned by different people, which is exactly why the gap goes unnoticed.

**Aha demo moment.** The PM drags an epic's fix version two months out on the Jira board. Within seconds (the demo uses a UI-triggered re-evaluation), the CSM's JSM ticket shows a red 'Promise broken: promised Mar 1, now forecast Apr 15' glance. One click shows the original comment highlighted, the version history diff and the drafted customer note.

**Bonus fit.** Primary: Rovo Agents (the agent and reusable actions are what CSMs talk to in Rovo Chat: 'which of my promises to Acme are at risk?'). Secondary: Teamwork Graph (cross-product traversal from ticket to epic to version).

**Technical risks.** Extraction precision on informal language ('should be soon'). Mitigate with a strict schema, needing both a date-like token and a commitment verb before an item counts. The epic-matching false positives are handled by the one-click confirm. JSM org field availability varies by site. Product events lag up to 3 min, so the demo uses the UI re-check button. The LLM cost of scanning history is capped by backfilling only the last 90 days.

**Judge test data.** A 'Seed demo' admin button creates 3 customer orgs, 12 JSM requests with promises of varying phrasing, 5 epics with versions and 2 Confluence account pages. It also runs on the judge's own data, since any JSM comment containing '(will|by|before) <date>' gets picked up. A diagnostics page shows the extraction count and the unmatched promises.

**Deterministic core.** Date normalisation (relative to the comment timestamp), the promise-to-epic link graph, forecast math (remaining scope / rolling throughput, P50/P85), the status state machine and change detection on version and due-date fields are all deterministic and unit-testable. The LLM is used only to extract commitment spans into a JSON schema and to write the heads-up draft.

### I12: Policy Ripple: policy change to KB and macro drift

*Category: Business Teams. Rank 18 of 40, total 67.74, judge spread 2.69.*

**One-liner.** When someone edits a Confluence policy page (refund window, expense limit, data-retention period), it finds every JSM knowledge-base article, canned response and open ticket that still states the old rule, and shows the exact sentence that is now wrong.

**User and pain.** A support operations lead at a SaaS company. Finance shortens the refund window from 30 to 14 days on the 'Refund Policy' Confluence page. For the next three weeks, agents keep quoting '30 days' from the KB article and the saved reply. A customer screenshots the article and demands the 30-day refund. Nobody knew which 9 articles repeated the rule.

**What it does.** (1) The admin marks Confluence pages as 'source-of-truth policies'. (2) On each new version, a deterministic diff extracts 'rule tuples' (subject, comparator, quantity, unit, condition), e.g. (refund, <=, 30, days, annual plans), using a numeric, unit and date parser over changed sentences. (3) It finds candidate dependents: JSM KB pages in linked spaces, request-type descriptions and the last 30 days of agent replies, ranked by CQL/JQL text search and TWG relationships. (4) Each candidate sentence that mentions the same subject with the old value is flagged 'contradicts policy v12', with a side-by-side view. The LLM only adjudicates ambiguous paraphrases. (5) It creates one Jira task per affected article for the KB owner, with a suggested redline. A banner on each affected KB page says 'This page may contradict Refund Policy (changed 2d ago)'. Open tickets where an agent quoted the old rule get an internal note.

**Modules and APIs.** confluence:contentBylineItem + page banner (confluence:contextMenu / contentAction), avi:confluence:updated:page trigger, async consumer (900s) for fan-out search, Confluence REST v2 (versions, body storage), CQL search, JSM KB via Confluence, Jira REST (comments JQL), Forge SQL (rule tuples, dependents), @forge/llm (paraphrase equivalence only), rovo:agent 'Policy Ripple' with actions find-contradictions / open-fix-tasks, TWG for page->linked issues/spaces.

**Context usage.** The policy is in Confluence (owned by Finance or Legal). The restatements are in JSM KB articles and in agent replies on JSM tickets (owned by Support). Without the cross-product join, only the policy owner knows the rule changed, and only Support knows where it is repeated.

**Aha demo moment.** Edit '30 days' to '14 days' on the policy page and click 'Check ripple'. A panel lists 6 KB articles and 3 recent agent replies, with the offending sentence highlighted in red and the new value beside it. Open one KB article and the warning banner is already there.

**Bonus fit.** Primary: Rovo Agents (a reusable 'find-policy-contradictions' action other agents can call, e.g. from a support agent before replying). Alternative: Teamwork Graph if the traversal spike passes.

**Technical risks.** The rule-tuple parser misses non-numeric policy changes (e.g. 'manager approval now required'). Mitigate by falling back to LLM diff classification over changed sentences only, labelled lower confidence. KB article volume on large sites is handled by limiting to linked spaces plus the top-N CQL hits. JSM KB lives in Confluence, so the app needs Jira+Confluence, which means a multi-product install (week-1 spike). Time-based stale-page apps exist but don't do content-consistency. Make that contrast explicit.

**Judge test data.** The seed creates a 'Policies' space with 3 policies (refunds, expenses, data retention), a KB space with 15 articles (9 restating rules, some paraphrased, some in tables) and 10 JSM tickets with agent replies. It works on judges' real pages, because any page can be marked as a policy.

**Deterministic core.** Version diffing, sentence segmentation, the quantity/unit/date extraction (with a unit-conversion table: weeks to days, 'two weeks'), tuple comparison, candidate retrieval and the ranking score, and the status lifecycle. The LLM is used only to (a) decide paraphrase equivalence when the deterministic match is partial and (b) phrase the suggested redline.

### I13: Material Change Guard for approvals

*Category: Business Teams. Rank 15 of 40, total 68.12, judge spread 1.15.*

**One-liner.** Re-opens a Jira approval only when the Confluence document it approved has changed materially (a money amount, a date, a party, a liability clause, a scope bullet), and sends the approver a redline of just those changes.

**User and pain.** A finance controller approved a vendor SOW ($48,000, 3 months) linked from a Jira procurement ticket. Afterwards, the requester edited the SOW page to $61,500 and added an auto-renewal clause, and the ticket still shows 'Approved'. Existing page-approval apps either ignore later edits or flip to 'changed' on every typo, so approvers are numb to re-approval requests.

**What it does.** (1) When a Jira issue transitions into an approved status, or a JSM approval completes, it snapshots the version of every linked Confluence page and attachment text. (2) On later page edits, a deterministic materiality engine diffs the snapshot against the current version and classifies each change: monetary (currency regex plus threshold %), dates and durations, named parties and emails, modal-obligation clauses ('shall/must/will automatically renew', 'indemnify', 'liability'), table rows in pricing tables, and bullets under scope headings. (3) A per-space policy decides which classes revoke approval (e.g. money > 5% or any new renewal or liability clause). (4) If material, it posts on the Jira issue 'Approval stale: 2 material changes since approval', transitions it back to 'Re-approval needed' (configurable), and notifies the original approver with a compact redline. Typos and formatting changes are logged and ignored. (5) The LLM writes a one-paragraph plain-English summary of the material changes.

**Modules and APIs.** jira:issuePanel 'Approval integrity', jira:workflowValidator (block 'Pay/Execute' transition while stale), avi:jira:updated:issue (status->approved) and avi:confluence:updated:page triggers, Confluence REST v2 versions, Forge KVS/SQL snapshots, @forge/llm (summary only), rovo:agent + action check-approval-integrity (GET) and request-reapproval (UPDATE), rovo:mcp.

**Context usage.** The approval decision lives in Jira or JSM. The thing approved lives in Confluence. Native and Marketplace page-approval apps track approvals inside Confluence only, and flip on any edit. This joins a Jira approval to the exact Confluence version it covered, and judges significance.

**Aha demo moment.** Approve the procurement ticket, then fix a typo on the SOW page: nothing happens, with a 'non-material change logged' line. Change $48,000 to $61,500 and add 'automatically renews': the ticket flips to 'Re-approval needed', the 'Mark paid' transition is blocked, and the approver sees a 2-line redline.

**Bonus fit.** Primary: Rovo Agents (a 'check-approval-integrity' action callable before any payment or contract step). Also Marketplace-friendly as a narrow, generic utility.

**Technical risks.** Prior art: Greenlight, Document Control, Appfox and Warsaw Dynamics invalidate Confluence page approvals on edit, so innovation must rest on the cross-product Jira approval link plus materiality classification. State that clearly in the pitch. Native Jira approvals are Premium/Enterprise only, so also support a plain workflow status. Workflow validators on team-managed projects behave differently. Table diffing in Confluence storage format is fiddly.

**Judge test data.** The seed creates a 'Procurement' project with an Approved status and validator, 4 linked SOW/contract pages with pricing tables and clauses, and a scripted 'make edits' button that applies one cosmetic and one material edit. Judges can link any of their own pages to any issue.

**Deterministic core.** Version snapshotting, the structural diff (paragraph/table/list aware), the materiality classifiers (money/date/party/clause lexicons, thresholds), the policy evaluation, the validator decision and the audit log. The LLM produces only the human summary, and it never decides materiality.

### I14: Launch Truth Check

*Category: Business Teams. Rank 35 of 40, total 60.98, judge spread 4.74.*

**One-liner.** Before a product-marketing launch page or blog draft in Confluence goes live, checks every product claim against the Jira epics, versions and statuses that make it true, and flags phrasing that needs legal review.

**User and pain.** A product marketing manager publishing launch copy on Dec 1 that says 'Now with SAML SSO, EU data residency and 2x faster exports'. EU residency was descoped to Q2 in Jira two weeks ago, in an epic she doesn't watch. Legal also never saw the '2x faster' claim, which needs substantiation. She finds out from a customer tweet.

**What it does.** (1) A Confluence byline or macro on a page tagged 'launch' runs the check. (2) The LLM splits the copy into atomic claims with verbatim spans. Each claim is matched to Jira epics and issues, from explicit links first, then by JQL text search and TWG relationships from the page's linked project or version. (3) A deterministic verdict per claim: Shipped (epic Done and fix version released before the launch date), Not yet true (open, descoped or version unreleased), Unbacked (no matching work found), or Needs substantiation (comparative or superlative claims, '#1', '2x', 'guaranteed', 'free', competitor names, matched by a lexicon). (4) It creates a JSM legal-review request containing only the flagged spans, and adds a red/green checklist to the page. (5) It re-checks automatically if a referenced epic's status or version changes before launch.

**Modules and APIs.** confluence:contentBylineItem + confluence:macro (claims checklist), avi:jira:updated:issue trigger for re-check, Jira REST/JQL, versions API, JSM request creation (portal request for 'Legal review'), Forge SQL, @forge/llm (claim segmentation + match rerank), TWG API (page -> linked issues/versions/projects), rovo:agent 'Launch checker' + actions check-claims (GET) / request-legal-review (CREATE), rovo:mcp.

**Context usage.** Marketing copy (Confluence) plus delivery reality (Jira Software versions and epics) plus legal intake (JSM). Three teams that rarely share a screen meet in one checklist.

**Aha demo moment.** Paste the launch copy and click 'Check claims'. Inline, 'SAML SSO' goes green with a link to the released version, 'EU data residency' goes red ('epic moved to Q2 on Nov 3 by J. Ng'), and '2x faster' goes amber with a 'Legal review requested JSM-88' chip.

**Bonus fit.** Primary: Teamwork Graph (page -> issue -> version traversal is the core of the check). Fallback: Rovo Agents.

**Technical risks.** Claim-to-epic matching on sites with poor epic naming. Mitigate with a manual 'pin to epic' option and confidence display. The 'MCP claim checking' entries are crowded, so the differentiation is the marketing-launch workflow, the release-date semantics and the legal intake. The JSM legal project has to exist (seeded or skipped). TWG access risk is handled with a JQL fallback.

**Judge test data.** The seed creates a 'Winter Launch' Confluence page, a Jira project with 8 epics across released, unreleased and descoped versions, and a JSM 'Legal' service project. It also runs on any judge page containing feature names that appear in their Jira.

**Deterministic core.** Verdict rules (status category, version released flag, release date vs launch date, descope detection via fix-version history), the substantiation lexicon and regexes, match scoring (key/link > title token overlap > LLM rerank), the re-check scheduler and the checklist state. The LLM handles only claim splitting and tie-break reranking.

### I15: Budget Burn at the Moment of Approval

*Category: Business Teams. Rank 30 of 40, total 63.16, judge spread 3.72.*

**One-liner.** Shows the approver of a JSM purchase or travel request exactly where the request leaves the cost centre's quarterly budget, which is kept as a plain Confluence table, including the already-approved and pending requests nobody added up.

**User and pain.** A marketing director gets 14 JSM purchase approvals a week, each looking reasonable on its own ($3k booth, $8k agency retainer). The budget lives in a Confluence page table that Finance updates monthly. At quarter close, Finance tells her she's at 118% and has to claw back commitments already promised to vendors.

**What it does.** (1) The admin points the app at a Confluence budget page whose table has cost centre, quarter and amount. The parser is deterministic and tolerant of column order, currency symbols and merged headers. (2) For every JSM request of the procurement or travel types, it extracts amount, currency, cost centre and vendor. Custom fields are used first. For free text, the LLM extracts into a schema and the requester confirms the values. (3) A deterministic ledger keeps committed (approved), pending (awaiting approval) and remaining amounts per cost centre and quarter, with currency conversion from a rates table on the same Confluence page. (4) The approver panel shows a burn bar: 'Approving this puts Q1 Marketing at 104% (committed 87%, pending 11%, this 6%)', plus the three largest prior commitments as links. (5) The policy can require a second approver or block approval above 100%. A Rovo agent answers 'what's left in Events this quarter?'

**Modules and APIs.** jira:issuePanel on JSM requests (approver view), jira:workflowValidator / approval condition, avi:jira:created/updated:issue triggers, Confluence REST v2 (budget page body parse), Forge SQL ledger, @forge/llm (free-text extraction only), rovo:agent 'Budget buddy' + actions get-remaining-budget (GET) / explain-commitments (GET), rovo:mcp, optional jira:dashboardGadget burn chart.

**Context usage.** The budget (Confluence, owned by Finance) joined with spend requests and approvals (JSM, owned by requesters and approvers). Approvers currently decide one ticket at a time with no aggregate view.

**Aha demo moment.** Open a $6k request as approver. The panel shows the bar crossing 100% in red and lists the two pending requests that cause it. Edit the Confluence budget cell from 50k to 60k, hit refresh, and the bar drops to 94% green.

**Bonus fit.** Primary: Rovo Agents (the budget query action is useful to every requester). Alternative: Marketplace (generic, low-scope utility).

**Technical risks.** Budget table formats vary, so ship a strict template plus a mapping UI rather than parsing arbitrary pages. The approver panel on JSM approvals and its visibility in the portal versus the agent view need checking. Currency: keep the rates on the Confluence page and avoid external egress. Multi-product install (Jira+Confluence). Budget apps exist for time tracking (Tempo); check for JSM spend-approval apps.

**Judge test data.** The seed creates a JSM 'Purchasing' project with request types and custom fields, a 'FY27 Budget' Confluence page with 5 cost centres, and 20 historic requests in mixed states and currencies, some with free-text-only amounts. Judges can point it at their own table.

**Deterministic core.** Table parsing and column mapping, the ledger arithmetic, quarter bucketing by needed-by date, currency conversion, the threshold policy and validator decisions. All are unit-testable with fixtures. The LLM only extracts amounts from free-text descriptions, and a human confirms them.

### I16: Already Own It: duplicate-purchase check for procurement

*Category: Business Teams. Rank 36 of 40, total 60.3, judge spread 0.38.*

**One-liner.** When someone files a JSM request to buy a new SaaS tool, it finds the tools the company already pays for that do the same job (in Assets, past requests and Confluence vendor pages), with seat counts, the owner and the renewal date, before anyone approves.

**User and pain.** An IT procurement analyst handles 'Please buy Loom for the design team ($2,400/yr)' the same week Sales renews Vidyard and the company already has 30 unused seats of a screen-recording tool bought last year. The analyst has to search Assets, old tickets and a vendor wiki by hand, so duplicates slip through.

**What it does.** (1) When a software-purchase request is created, it normalises the vendor and product name (alias table, domain, fuzzy match) and assigns a capability category from a fixed taxonomy (screen recording, whiteboarding, e-signature...). The LLM picks the category from the request's text, and the taxonomy is closed. (2) It searches Assets objects (Software, Licence), past JSM purchase requests and Confluence 'Vendor' pages for the same vendor or same category. (3) It renders an 'Existing options' card: Tool, owner team, seats purchased vs assigned (where Assets holds it), renewal date, contract page link. (4) The analyst can respond with one click: comment 'Already licensed: ask @owner for a seat' (a draft), link the duplicates, or mark it 'genuinely different' with a reason, which trains the alias table. (5) A renewal radar lists upcoming renewals with overlapping categories.

**Modules and APIs.** jira:issuePanel on JSM request, avi:jira:created:issue trigger, Assets (JSM CMDB) REST/AQL, JQL over past requests, Confluence CQL for vendor pages, Forge SQL (alias table, decisions), @forge/llm (closed-taxonomy classification + draft reply), rovo:agent + actions find-existing-tools / draft-reuse-reply, TWG optional, rovo:mcp.

**Context usage.** It joins Assets (what we own), JSM history (what was requested or rejected before) and Confluence (vendor or contract pages). No single team holds all three, and that is why duplicates get approved.

**Aha demo moment.** Submit 'Buy Loom for 6 designers' from the portal. The agent view immediately shows 'You already have: ScreenPal (Marketing, 40 seats, 12 unassigned, renews Feb 2)' and 'Similar request rejected in Aug (JSM-311)', with a ready-to-send reply.

**Bonus fit.** Primary: Rovo Agents (the 'do we already own X?' action is useful in Rovo Chat company-wide). Secondary: Teamwork Graph.

**Technical risks.** Assets availability and schema vary (Premium/Enterprise; the demo site is enterprise). Fall back to a Confluence vendor table when Assets is absent. Seat-usage data may not exist, so show it only if present. Keep it licence-level, never per-person activity, to avoid surveillance. Taxonomy coverage is limited, so ship ~40 categories and allow 'other'.

**Judge test data.** The seed creates an Assets schema 'Software' with 25 tools, a Confluence vendor space and 15 historical JSM purchase requests (approved and rejected). The demo includes requests for vendors not in any list, to show the category match working on unseen names.

**Deterministic core.** Vendor normalisation (alias map, domain extraction, Jaro-Winkler), the category-overlap join, seat and renewal arithmetic, the ranking and the decision log. The LLM only classifies free text into the closed taxonomy and drafts the reply.

### I17: KB Contradiction Radar

*Category: Business Teams. Rank 38 of 40, total 58.76, judge spread 1.15.*

**One-liner.** Finds knowledge-base articles that resolved JSM tickets now contradict ('the steps in KB-12 don't work any more, the setting moved to Admin > Billing'), and flags the exact section with the ticket evidence and a drafted fix.

**User and pain.** A support team lead owns 300 KB articles. Agents quietly work around wrong articles in their replies, and the fix never makes it back into the KB. Time-based 'stale page' reminders ask her to review all 300 every 6 months, which never happens. She needs to know which 5 articles are actually wrong this week, and where.

**What it does.** (1) It watches resolved JSM tickets where the agent linked or quoted a KB article, or where the portal shows the customer viewed an article before raising the request. (2) A deterministic correction-signal detector scans resolution comments for correction patterns ('no longer', 'moved to', 'instead', 'actually', 'the article is outdated', UI path strings like 'X > Y > Z' that differ from the article). (3) It clusters signals per article section by heading anchor and term overlap, and counts distinct tickets and agents. (4) Above a threshold (e.g. 3 tickets in 14 days), the LLM checks whether the replies contradict the section, quoting both. If confirmed, the section gets a banner 'Possibly wrong: 4 tickets suggest the path changed' and the owner gets a Jira task with a drafted replacement paragraph built from agent wording. (5) A deflection-failure metric per article (viewed then ticket raised) shows the impact.

**Modules and APIs.** confluence:contentBylineItem + inline banner macro, jira:issuePanel (agent 'Report KB issue' button to add an explicit signal), avi:jira:updated:issue (resolved) trigger, scheduledTrigger daily clustering, JSM KB linking APIs, Confluence REST v2, Forge SQL (signals, clusters), @forge/llm (contradiction confirmation + redraft), rovo:agent 'KB Radar' with action list-contradicted-articles / draft-kb-fix, rovo:mcp.

**Context usage.** Ticket resolutions in JSM are the ground truth of what actually works. The KB articles in Confluence are the claims. The join between the two, at section level, is what turns 'stale' into 'contradicted, here's proof'.

**Aha demo moment.** Resolve a third ticket whose reply says 'the export button moved to Reports > Exports'. The KB article immediately shows an amber banner on the 'How to export' section. Clicking it shows 3 ticket quotes beside the old sentence, and the drafted new paragraph is ready to accept.

**Bonus fit.** Primary: Rovo Agents (a support Rovo agent can call 'is this KB section contradicted?' before quoting it). Alternative: Teamwork Graph (ticket-article links).

**Technical risks.** The JSM KB 'article viewed' signal may not be exposed via API, so rely on explicit links and quotes plus the agent button. Crowded 'stale docs' (~15 entries): the pitch must stress event-driven, evidence-backed contradiction, not page age. Correction-pattern recall varies by team language, so the LLM confirms only above-threshold clusters to control cost.

**Judge test data.** The seed creates a KB space with 20 articles and 40 resolved JSM tickets, 3 clusters genuinely contradicting specific sections, plus noise tickets that mention articles positively. Judges can resolve their own tickets with correction phrases to see a new signal.

**Deterministic core.** Correction-pattern regex and lexicon, UI-path extraction and comparison, section anchoring, clustering, thresholds and decay, and deflection metrics. The LLM is used only to confirm contradiction on pre-filtered clusters and to draft the replacement paragraph.

### I18: Entitlement Guard for support agents

*Category: Business Teams. Rank 34 of 40, total 61.97, judge spread 2.44.*

**One-liner.** On every JSM ticket, shows the agent what this customer's contract actually entitles them to (response SLA, modules, included hours, out-of-scope items), and warns before the agent's reply promises something the contract doesn't include.

**User and pain.** A tier-2 support agent replies 'Sure, we'll build that custom report for you this week' to a Standard-plan customer whose order form excludes custom development. That creates an unpaid, unscoped commitment that engineering then has to honour or Sales has to walk back. Contract terms live in Confluence or a PDF the agent never opens.

**What it does.** (1) Contract summaries live as a structured Confluence page template per customer org, or as an Assets 'Contract' object: plan, SLA hours, included modules, support-hours bank, exclusions list and term dates. A deterministic parser reads it. (2) The issue panel shows an entitlement card plus the hours bank consumed so far (sum of worklogs on that org's tickets this term). (3) A 'Check reply' button, also run on comment create, checks the draft or posted reply. A deterministic first pass looks for commitment verbs and time phrases together with exclusion terms. The LLM then classifies the reply against the exclusions list, quoting the contract line. (4) If it's out of scope, it warns and suggests compliant wording, plus a one-click 'Route to Account Manager for paid scope' that creates a linked Jira Sales-ops task. (5) A monthly overage report per org feeds renewal conversations.

**Modules and APIs.** jira:issuePanel (JSM agent view), jira:issueAction 'Check reply', avi:jira:commented:issue trigger, Assets AQL or Confluence REST (contract page), Jira worklog API, Forge SQL, @forge/llm (scope classification + rewrite), rovo:agent 'Entitlements' with action get-entitlements (GET) / check-reply-scope (GET) / route-to-account-manager (CREATE), rovo:mcp.

**Context usage.** Contract terms (Confluence or Assets, owned by Sales and Legal), live support work (JSM tickets, worklogs) and account management (a Jira business project). The agent at the keyboard has none of the contract context today.

**Aha demo moment.** Type 'we'll build a custom dashboard for you by Friday' and click Check reply. A red line reads 'Custom development excluded (Order Form §4.2, Standard plan)', with a rewritten reply offering the paid Professional Services path and a 'Route to AM' button.

**Bonus fit.** Primary: Rovo Agents (entitlement lookup as a reusable action for any support agent). Alternative: Marketplace.

**Technical risks.** Contract data isn't standardised, so ship a template and an Assets schema and do not parse arbitrary PDFs. The 'check before send' hook doesn't exist in the JSM reply editor, so use a button plus a post-comment warning (the comment can be edited). Worklog-based hours need time logging to be in use. Do not score agents individually: the warnings go to the agent only, not to a leaderboard.

**Judge test data.** The seed creates 4 customer orgs with contract pages on different plans, 20 tickets with worklogs and sample risky and safe replies. Judges can create a contract page for any of their own orgs from the template.

**Deterministic core.** Contract template parsing, the entitlement data model, hours-bank arithmetic and term windows, the SLA calculation, the first-pass commitment and exclusion lexicon, and routing. The LLM does only the semantic scope match on flagged replies and suggests the rewrite.

### I19: Goal Reality Check

*Category: Business Teams. Rank 39 of 40, total 58.59, judge spread 3.72.*

**One-liner.** Before a goal owner posts their weekly 'On track' update in Atlassian Goals, computes what the linked Jira work actually says (scope growth, slipped due dates, forecast finish) and drafts an honest status update with links.

**User and pain.** A marketing ops lead owns the goal 'Launch partner portal by Jan 31'. Every Friday she writes 'On track' from memory. Meanwhile the three linked epics have grown 40% in scope, two due dates slipped, and the throughput forecast says Mar 10. Leadership finds out in the January review, when nothing can be cut any more.

**What it does.** (1) It traverses Goal -> linked projects, epics and work items through the Teamwork Graph, with JQL fallback. (2) A deterministic computation produces scope added since the goal's baseline date (issue count and story points), due dates that moved (from change history), blocked items, and a Monte Carlo forecast finish from the last 6 weeks of throughput. (3) It derives a suggested status (On track / At risk / Off track) with explicit rule thresholds, e.g. forecast P85 > target date gives At risk. (4) A Rovo agent drafts the weekly update: the three facts that matter, each linked, plus a proposed trade-off ('cutting EPIC-12 restores Jan 31 at P70'). (5) A Jira dashboard gadget shows every goal where the stated status disagrees with the computed one.

**Modules and APIs.** TWG API via requestTeamworkGraph (goal->project->issue persisted Cypher), Jira REST (changelog, JQL), jira:dashboardGadget 'Stated vs computed', jira:globalPage goal drill-down, scheduledTrigger weekly (note: TWG needs as-user, so computation is on page open), Forge SQL snapshots, @forge/llm (update drafting), rovo:agent 'Goal reality' + actions get-goal-reality (GET) / draft-goal-update, rovo:mcp.

**Context usage.** Goals (Atlassian Home/Goals, via TWG) plus delivery data (Jira issues, changelogs, sprints). The goal owner is often a business lead who doesn't read Jira boards, and this bridges the two.

**Aha demo moment.** Open the gadget: 'Partner portal: stated On track / computed At risk (forecast Mar 10 P85)'. Click it to see scope +38% with the 11 added issues and 2 slipped due dates. The draft update is ready and quotes each fact with a link.

**Bonus fit.** Primary: Teamwork Graph (the goal-to-work traversal is impossible without it, so the bonus is natural).

**Technical risks.** TWG access errors and the goal-object scopes (biggest risk), so spike in week 1. Fallback: a goal key in an epic custom field. Native AI may already draft goal updates (check Atlassian Home AI). Differentiation is the deterministic forecast and the stated-vs-computed disagreement. The ~13 release-readiness entries are adjacent. TWG can't run in scheduled jobs (no app context), so compute on page view.

**Judge test data.** The seed creates 3 Jira projects with backdated-style history, simulated by bulk-created and resolved issues with varied dates and due-date edits, and links goals where the API allows. Otherwise it uses a goal custom-field fallback. On a judge's site it works for any goal with linked work.

**Deterministic core.** Baseline scope diffing, changelog parsing for due-date moves, throughput Monte Carlo, the status rule engine and the disagreement detection, all testable on fixtures. The LLM only phrases the update.

### I20: SOX Change Evidence Pack

*Category: Business Teams. Rank 13 of 40, total 68.25, judge spread 2.56.*

**One-liner.** Given an auditor's sample of change tickets, assembles for each one the request, the approval, the test evidence and the deployment record across Jira, JSM and Confluence, flags segregation-of-duties violations and unticketed deploys, and exports a signed-off evidence page.

**User and pain.** An IT compliance analyst at a mid-size public company gets the external auditor's list of 25 sampled changes on a Monday and has until Friday. She screenshots the JSM change, the Jira story, the approver, the test-plan page and the deployment for each, and still misses that the approver of 3 changes was also the implementer.

**What it does.** (1) She pastes the sample (keys or a JQL) into a global page. (2) For each change, a deterministic collector gathers the JSM change request (risk, CAB approval, approver, timestamps), linked Jira work items, dev info and deployments (via the Jira dev-info/deployments API or TWG, where available), and the Confluence test-plan or UAT sign-off page linked from the issue. (3) Control checks are deterministic rules: approval timestamp before deployment timestamp; approver differs from assignee, implementer and PR author (SoD); test evidence exists and is dated before the deploy; emergency changes have a retro-approval within N days; deploy events with no linked change are reported as 'unticketed'. (4) Results are shown as a pass/fail matrix with clickable evidence per cell. (5) Export: it generates a Confluence evidence page per sample, with a frozen snapshot (versions pinned) and a summary for the auditor. The LLM writes only the narrative exception explanations, which the analyst edits.

**Modules and APIs.** jira:globalPage 'Audit sample', JSM REST (approvals, change fields), Jira dev-info/deployments + changelog, Confluence REST (create evidence page, version pin), TWG API (issue->PR->deployment traversal where Bitbucket/GitHub connected), Forge SQL (sample runs, results), async consumer for large samples, @forge/llm (exception narrative), rovo:agent 'Audit prep' + actions check-change-controls (GET) / build-evidence-page (CREATE), rovo:mcp.

**Context usage.** JSM (change and approval), Jira Software (work and deployments), Confluence (test evidence and the final pack), and optionally Bitbucket or GitHub via TWG. The control evidence is spread across all of them by design, and that is the pain.

**Aha demo moment.** Paste 10 change keys and click Run. The matrix fills in, with 2 red cells: 'SoD: approver = implementer (A. Patel)' and 'Deployed 14:02, approved 16:30'. Click 'Build pack' and a Confluence evidence page appears with every link and timestamp.

**Bonus fit.** Primary: Teamwork Graph (issue to PR to deployment traversal). Fallback: Rovo Agents. Could arguably compete in Specialized Industries (finance), but it's framed for internal audit and compliance business teams.

**Technical risks.** Deployment data needs a connected CI/CD, which judges likely lack, so the seed must write deployment records. Use the Jira deployments API via a seed action, or a graph:connector in a separate app. Bitbucket probably isn't on judges' sites, so make it optional. Never claim certified SOX compliance: present it as an evidence-assembly assistant. JSM change-management fields differ by template.

**Judge test data.** The seed creates a JSM change project, 25 changes with approvals (some violating SoD or timing), linked stories, Confluence test pages and synthetic deployment records. It works on a judge's real JSM changes for the approval and SoD checks even without deployments, which are shown as 'no deployment data'.

**Deterministic core.** All control rules (timestamp ordering, SoD identity comparison by accountId, retro-approval windows, unticketed deploy detection), the evidence collection and the snapshot pinning are fully deterministic and testable. The LLM handles only the exception narrative text.

### I21: Takeover Triage: ADAS disengagement intake that clusters itself

*Category: Specialized Industries. Rank 1 of 40, total 74.53, judge spread 0.9.*

**One-liner.** A safety driver files a takeover from the car. In about a minute it is parsed, fingerprinted from its signals and frames, matched to the vehicle's sensor setup in Assets, and folded into an existing failure cluster with a signal plot on the issue.

**User and pain.** Who: the ADAS validation lead running a test fleet of 5 to 50 cars. When: Monday morning, facing 200 or more weekend disengagement tickets that say 'car drifted left, took over'. Those tickets have CSV snippets and dashcam stills attached, and nobody can tell which are the same bug. Duplicates get assigned to three perception engineers. A real new failure mode sits unread in the pile for a week.

**What it does.** 1) A JSM request type or Jira issue type 'Disengagement' takes a free-text driver note, a short telemetry CSV or JSON (speed, yaw rate, lane offset, steering torque, brake, TTC, ego-lane confidence) and 1 to 4 JPEG frames. 2) An async consumer parses the signals and computes a deterministic event signature from rules: takeover type (lateral drift, late brake, phantom brake, cut-in response, lane-loss), the takeover time relative to the onset of drift, peak lateral error, and minimum TTC. 3) Pure-JS image math on the frames (jpeg-js decode, luminance histogram, saturated-pixel fraction for low-sun glare, Laplacian variance for rain or blur, mean brightness for night, dHash for near-duplicate frames) produces condition tags. 4) It looks up the vehicle in Assets: sensor set, SW build and calibration date. 5) It runs nearest-neighbour clustering over signature, condition and build vectors against open clusters. It links the new ticket to the best cluster as a duplicate or child, or proposes a new cluster. 6) Forge LLM only rewrites the messy driver note into a normalised one-line symptom, and drafts the cluster title and description. 7) An issue panel shows an SVG signal plot with the takeover marker, the condition chips, the top-3 similar events with their plots side by side, and buttons: 'Accept link', 'Split', 'Route to Perception/Planning'.

**Modules and APIs.** jira:issuePanel (Custom UI, signal plot and similar-events view), jira:issueAction 'Triage now' (the demo path, avoiding the 3-minute event lag), trigger on avi:jira:created:issue plus a consumer for async work (900 s), Jira REST (attachments, issue links, fields), Assets REST through requestJira, Forge SQL (event feature vectors for kNN), @forge/llm (symptom normalisation and cluster naming), rovo:agent 'Fleet Triage' with actions get-cluster-for-event, list-clusters-by-condition, create-cluster, link-event, plus a rovo:skill with the triage playbook.

**Context usage.** It joins the driver's narrative (Jira/JSM text), telemetry and frames (attachments), the vehicle's hardware, calibration and SW-build configuration (Assets), and the history of prior clusters and their resolutions (Jira links and SQL). The clustering is only meaningful because it knows the build and sensor set: the same symptom on a different camera variant becomes a separate cluster.

**Aha demo moment.** The driver submits a takeover from the JSM portal on a phone. The presenter clicks 'Triage now'. The panel shows the lateral-offset trace with the takeover marker, the chips 'low sun glare', 'build 4.12.0' and 'cam-variant B', and then: 'Matches cluster ADAS-311: Lane-loss under low sun, cam-variant B. 7 events, all on build >= 4.12.0.' The three most similar plots look nearly identical. One click links it. A Rovo prompt, 'what's new since Friday?', returns the one event that did not cluster.

**Bonus fit.** Primary: Rovo Agents (a real triage agent with GET and CREATE actions and a reusable skill). Secondary: rovo:mcp, which exposes the same actions so a perception engineer's Claude Code can pull clusters.

**Technical risks.** JPEG decoding and image math in a Forge function: keep frames to thumbnails of 640 px or less, within the 1024 MB and 900 s limits, and handle the attachment-download size. Assets may not exist or be licensed on judges' sites, so add a fallback that stores vehicle config in a Jira custom field or app storage. kNN quality on small data: use a hybrid of rules first, then distance. Forge SQL is a major-version decision, so make it on day 1. Keep the JSM portal path optional, because a plain Jira issue type must also work.

**Judge test data.** An admin page action, 'Generate test fleet', creates 3 vehicles (in Assets if available, otherwise in app storage) and about 30 disengagement issues. Each has a procedurally generated telemetry CSV (seeded random drift, brake and cut-in profiles) and procedurally rendered JPEG frames (a canvas-style road, a sun-glare blob, rain blur and night darkness, generated deterministically in JS). Judges can also file their own disengagement from a downloadable sample CSV or by editing values. The signatures are computed from the actual numbers they type, so nothing is hard-coded.

**Deterministic core.** Deterministic: CSV/JSON parsing, the event-signature rules (thresholds on lateral error, TTC and torque), the image metrics (histogram, glare fraction, blur variance, dHash), the Assets lookup, the feature-vector distance, the clustering and duplicate thresholds, and the link creation. These are unit-testable with fixtures and run in a headless harness. LLM: normalising the driver's free text into a symptom phrase, and naming and describing clusters.

### I22: Trigger Ledger: SOTIF triggering-condition feedback loop

*Category: Specialized Industries. Rank 3 of 40, total 71.03, judge spread 2.44.*

**One-liner.** Field complaints about ADAS behaviour are mapped onto a living catalogue of SOTIF triggering conditions. It raises the alarm when a condition is new, or when a known one's field rate breaks its residual-risk acceptance target, and it marks the affected SOTIF analysis sections and validation scenarios for re-work.

**User and pain.** Who: the SOTIF / functional-safety engineer who owns the ISO 21448 analysis for an AEB or lane-keep feature. When: a dealer or field-quality JSM queue fills with 'phantom braking under bridge' and 'LKA fought me in a construction zone' reports. ISO 21448 clause 13 requires field monitoring to feed discovered triggering conditions back into the analysis. In practice someone reads the queue quarterly and updates the Confluence analysis by hand, if ever. No Marketplace app was found for 'SOTIF' or 'triggering condition'.

**What it does.** 1) The catalogue: a Confluence page table (or Assets object type) of triggering conditions with ODD attributes (scene, weather, lighting, road feature, actor), the linked hazard, the acceptance criterion (for example 1e-7 per km, or N events per million km), and links to validation scenarios (Jira test issues). 2) For each new JSM field issue, the LLM extracts structured ODD attributes from the narrative into a fixed schema. Deterministic matching then scores the issue against catalogue entries (attribute overlap plus a feature match). 3) Outcomes: MATCH (increment the counter and recompute the rate against fleet km taken from a configurable exposure value), RATE BREACH (the computed upper confidence bound, Poisson or Clopper-Pearson, exceeds the acceptance criterion; this raises a Jira 'SOTIF re-evaluation' issue), or NOVEL (no entry above the threshold; it drafts a new catalogue row, flags the hazard-analysis Confluence section with a page banner, and creates a scenario stub). 4) The Confluence macro renders the catalogue with field counts, rate bars and status, and each count is clickable to the underlying JSM tickets.

**Modules and APIs.** JSM queue issue trigger plus a manual jira:issueAction 'Classify against SOTIF catalogue', confluence:contentBylineItem / macro 'Trigger Ledger', Confluence REST v2 (reads the table, writes the banner and an inline comment), Jira REST (creates the re-evaluation issue and scenario test stubs, adds links), @forge/llm (attribute extraction into a strict JSON schema), Teamwork Graph API GET actions (field issue to linked Confluence analysis to tests to owning team), rovo:agent 'SOTIF Analyst' with actions classify-field-issue, get-condition-rate, propose-new-condition.

**Context usage.** It joins field issues (JSM), the SOTIF analysis and catalogue (Confluence), validation scenarios (Jira tests), and the exposure and fleet data used to compute rates. TWG traversal finds which analysis pages and tests depend on a condition. Neither JSM nor Confluence can produce 'this condition is now out of tolerance' alone.

**Aha demo moment.** Three new field reports arrive about braking under overpasses. The macro row 'TC-07 Low overpass shadow at >80 km/h' turns red: '11 field events / 4.2M km. Upper 95% bound 4.1e-6 > target 1e-6. Re-evaluation ADAS-402 opened.' A fourth report, 'bird flock lifts off the road', comes back NOVEL with a drafted catalogue entry. The 'Hazard analysis: AEB' page now carries a banner: 'Section 4.3 rests on a condition with new field evidence.'

**Bonus fit.** Primary: Teamwork Graph (consumes the issue, page and test graph to find dependents; a natural fit). Fallback: Rovo Agents if the TWG spike fails inside actions.

**Technical risks.** TWG access errors in actions: keep a fallback path through Jira links and Confluence remote links. Parsing a Confluence table reliably: use a macro-owned table stored in app storage, with an 'export to page' option. The acceptance-rate statistics need a credible exposure number: make it a config field and show the formula. Positioning: an assistant that surfaces evidence, not a certified SOTIF tool. A Jira + Confluence multi-product install must be spiked early.

**Judge test data.** 'Load sample AEB/LKA programme' creates a Confluence catalogue page with 10 triggering conditions, a hazard-analysis page with sections, 15 scenario test issues and a JSM or Jira project with 40 synthetic field reports in varied wording. The judge types their own field report in plain English and sees it classified live. They can edit the acceptance criterion or exposure and watch the breach state change deterministically.

**Deterministic core.** Deterministic: catalogue schema, attribute-overlap matching and thresholds, Poisson upper-bound rate computation versus target, the state machine (match, breach, novel), banners, issue creation and links. LLM: free-text to ODD-attribute JSON extraction (schema-validated, with retry), and drafting the novel condition description and the re-evaluation rationale.

### I23: Calibration Guard: sensor calibration and config integrity for validation runs

*Category: Specialized Industries. Rank 8 of 40, total 69.02, judge spread 2.05.*

**One-liner.** It treats test vehicles, sensors and calibrations as Assets. It blocks a test run from being marked valid when the car's calibration had expired or did not match the test plan. When a calibration is later found bad, it marks every result recorded on that car since the last good check as suspect.

**User and pain.** Who: the validation test manager signing off a release's homologation or regression test campaign. When: two weeks before release, a technician finds the front camera on Vehicle 3 was knocked 0.8 degrees out of extrinsic calibration after a curb strike. Nobody can say which of the last 140 passed test runs used that car, or whether they still count. Calibration lives in a spreadsheet, test runs live in Jira, and the two are never joined.

**What it does.** 1) Assets schema (installed by the app): Vehicle, Sensor (camera, radar, lidar, with mount position), CalibrationRecord (date, method, extrinsic and intrinsic parameter hash, residual error, valid-until), and SWBuild. 2) Test Run issues carry Vehicle and Build fields. A Jira workflow validator on 'Executed -> Passed/Valid' checks deterministically that a valid calibration covered the run date for every required sensor, that the calibration residual is under the plan threshold, that the vehicle's sensor variant matches the test plan's required configuration, and that the build equals the release candidate. Failures block the transition and explain exactly why. 3) A 'Calibration incident' JSM request (curb strike, windscreen replacement, failed re-cal check) triggers a back-propagation job. It finds all runs on that vehicle between the last good calibration and the incident, marks them 'Suspect - calibration', adds a comment with evidence, and builds a re-test list grouped by test case. 4) A dashboard panel on the release version shows the share of 'valid', 'suspect' and 'unverifiable' evidence. LLM is used only to draft the re-test justification note.

**Modules and APIs.** jira:workflowValidator (Forge), jira:issuePanel (calibration context on each Test Run), jira:projectPage / version panel (evidence-integrity dashboard), JSM request type plus trigger, Assets REST (object schema creation, object reads and writes, AQL queries) through requestJira with Assets scopes, Jira REST (JQL, bulk field updates, comments), @forge/llm (re-test justification text), rovo:agent 'Validation Integrity' with actions check-run-validity, find-runs-affected-by-calibration, propose-retest-plan.

**Context usage.** It joins Assets (the vehicle, sensor and calibration timeline), Jira (test runs, test plans, release versions, workflow) and JSM (calibration incidents from workshop technicians). The value exists only in the join of time intervals across products.

**Aha demo moment.** The tester tries to move a run to Passed and the transition is blocked: 'Vehicle V3 front camera calibration expired 2 days before this run (CAL-88, valid-until Nov 30).' Then a technician files 'Curb strike V2'. Seconds after clicking 'Assess', 23 Passed runs flip to Suspect. The release dashboard drops from 96% valid to 81%, and a grouped re-test plan of 9 test cases is drafted.

**Bonus fit.** Primary: Rovo Agents ('which of my release evidence is unverifiable and why?'). It could also go for Teamwork Graph through a separate connector app that ingests calibration records, but that adds a second app.

**Technical risks.** Assets licensing and availability on judges' sites is the biggest risk (it may need JSM Premium). Build an app-storage fallback with an identical UI, and auto-detect Assets. Creating an Assets schema programmatically may need admin rights. Forge workflow validators need a company-managed workflow on the judge's project, so the seed creates it or the setup notes explain it. Validator latency limits apply, so keep the check to cached lookups.

**Judge test data.** 'Install sample test fleet' creates the Assets schema (or the storage fallback) with 4 vehicles, 12 sensors and a calibration history with one expired record and one out-of-tolerance record, plus a 'Validation' project with a test plan, 60 test runs across dates and a release version. Judges can add their own calibration record or change a valid-until date and immediately see validator results and suspect propagation change.

**Deterministic core.** Deterministic: interval-overlap logic (run date versus calibration validity), residual thresholds, config and variant matching, the validator decision, back-propagation queries and state updates, and the dashboard metrics. All of it is testable as pure functions over fixtures. LLM: only the human-readable re-test justification and an optional natural-language query in the agent.

### I24: Argument Health: live GSN safety cases whose claims turn amber when evidence moves

*Category: Specialized Industries. Rank 4 of 40, total 70.64, judge spread 1.54.*

**One-liner.** A Confluence macro renders a Goal Structuring Notation safety argument whose solution nodes are live Jira test results, requirements and Confluence analyses. When any piece of evidence changes, fails or is superseded, the suspect state propagates up the argument, so the safety manager sees which top-level claims are now unsupported.

**User and pain.** Who: the functional-safety manager preparing the ISO 26262 safety case (or a UL 4600 / SOTIF argument) for a release. When: at the confirmation-review or assessor meeting, the question is 'is this argument still true for build 4.13?'. Today the GSN is a Visio export pasted into Confluence in 2025. Nobody knows that 3 of its 40 evidence items were re-run and failed last week. No Marketplace hit exists for 'safety case'.

**What it does.** 1) A Confluence macro editor for GSN: goals, strategies, contexts, assumptions, justifications and solutions, authored as an indented outline or YAML and rendered as a proper GSN diagram (SVG, auto-layout). 2) Each solution node binds to evidence: a Jira issue with a status and fix version, a test result field, a Confluence page version, or a JQL query ('all ASIL-B tests for component LKA pass'). 3) Deterministic propagation: an evidence state (valid, failed, changed since the baseline version, missing) rolls up through the argument with defined semantics (an AND under a strategy, or n-of-m for redundant evidence). Goals become supported, weakened or unsupported. 4) 'Baseline' freezes the argument plus evidence versions. 'Diff to baseline' lists exactly which evidence moved and links to each one. 5) LLM, optional: draft an initial GSN skeleton from an existing safety-concept page, and write the 'argument delta' paragraph for the confirmation-review minutes.

**Modules and APIs.** macro (Confluence, Custom UI, SVG GSN renderer), confluence:contentBylineItem (argument health badge), Confluence REST v2 (page versions), Jira REST (JQL, issue states, versions) through the multi-product app, app storage / KVS (baselines), a scheduled trigger plus a manual 'Re-evaluate' button, @forge/llm (skeleton drafting and delta prose), Teamwork Graph GET actions (page to linked issues to builds), rovo:agent 'Safety Case Assistant' with actions evaluate-argument, list-weakened-goals, diff-since-baseline.

**Context usage.** The argument structure lives in Confluence. The evidence status lives in Jira (tests, requirements, versions), and optionally in field issues from JSM. The value is the semantic roll-up: one failed regression test becomes 'G2 Lane keeping is acceptably safe in ODD-urban is unsupported', which neither product can express.

**Aha demo moment.** A judge opens the seeded safety-case page and the diagram is all green. They transition one Jira test, 'TC-LKA-112 curve radius 150 m', to Failed and click Re-evaluate. The solution node goes red, its strategy goes amber and the top goal shows 'weakened: 1 of 3 sub-goals'. The byline badge on the page reads 'Safety case: 2 claims weakened since baseline B-4.12'. Clicking it lists the evidence that changed, each with a link.

**Bonus fit.** Primary: Teamwork Graph (consumes the page-issue-build graph to resolve and refresh evidence bindings). Alternative primary: Rovo Agents. Marketplace is plausible as a standalone free utility.

**Technical risks.** Auto-layout of GSN in SVG: use dagre/elkjs, bundled. A multi-product Jira + Confluence app must be spiked in week 1. Scheduled triggers cannot call TWG as the user, so refresh on page view through a resolver (25 s) or a user-initiated async job. Keep the semantic claims modest: it is a decision aid, not a certified tool (ISO 26262-8 tool confidence). Shares some DNA with traceability apps, but its argument-level roll-up is the differentiator.

**Judge test data.** 'Insert sample safety case' creates a Jira project with about 25 requirement and test issues across 2 fix versions, a safety-concept page, and a GSN macro already bound to those issues. Judges can also author a new GSN in the outline editor against any issue in their own site using JQL bindings, so the feature works on data never seen before.

**Deterministic core.** Deterministic: the GSN parser and validator (well-formedness rules such as a goal needing support), evidence binding and resolution, state roll-up semantics, baseline snapshots and diffs, and diagram layout. Property-based tests run on the propagation logic. LLM: generating a draft argument outline from prose, and the delta narrative.

### I25: SOX Change Pack: auditor-sample evidence assembler with segregation-of-duties checks

*Category: Specialized Industries. Rank 9 of 40, total 68.93, judge spread 2.05.*

**One-liner.** Paste an auditor's sample of 25 changes and get one Confluence evidence page per change. Each page has the request, approvals, implementer, test evidence and production timestamps, plus deterministic SOX ITGC checks: approver is not the implementer, approval came before deploy, emergency changes were ticketed after the fact in time, and the change was not unapproved.

**User and pain.** Who: the IT compliance lead at a listed fintech or bank whose change process runs on JSM change management and Jira. When: the external auditor's PBC (provided-by-client) request arrives with a sample of 25 production changes and a 5-day deadline. Someone spends two days screenshotting JSM approvals, Jira history and deployment records into Word, then discovers that change #17 was approved by the same engineer who implemented it. No Marketplace app or Codegeist entrant was found for this.

**What it does.** 1) Input: a list of keys or a JQL/date range plus a sampling method (random with a recorded seed, which auditors like because it is reproducible). 2) For each change it collects the JSM change request fields, approval records (who and when), the issue changelog (who transitioned to Implementing and Closed), linked Jira work items, development info if present (PRs, deployments via TWG), and test evidence attachments. 3) Deterministic control tests, configurable per control ID: SoD (requester, approver and implementer are distinct, using account IDs and an optional Assets or group mapping of roles); approval timestamp earlier than the implementation-start timestamp; CAB approval required for risk >= high; an emergency change has a retroactive approval within N business hours; the change has a back-out plan and test evidence; the change was closed within its window. 4) It generates a Confluence 'Evidence Pack FY26-Q4' page tree: a summary table with pass, exception and not-applicable per control, and a child page per change with every claim hyperlinked to the source record and its timestamp. 5) It creates an exception issue for each failure. LLM is used only to write the exception narrative and management-response draft.

**Modules and APIs.** jira:globalPage (sampling UI), JSM approvals and changelog via Jira REST, Confluence REST v2 (page tree generation), Teamwork Graph GET actions (change to linked PRs, deployments and builds when present), Forge KVS (sample manifest and seed), async consumer (25 changes x many API calls, 900 s), @forge/llm (exception narratives), rovo:agent 'Audit Evidence' with actions build-evidence-pack, check-change-controls and list-exceptions. Optionally a separate graph:connector app ingesting synthetic deployment records.

**Context usage.** It joins JSM change records and approvals, the Jira changelog (who did what and when), linked development and deployment objects (TWG), user and group membership for roles, and writes into Confluence. The SoD verdict needs at least three of these sources at once.

**Aha demo moment.** Paste 'CHG-1..CHG-40, sample 10, seed 2026'. Forty seconds later a Confluence page appears: '10 sampled, 8 pass, 2 exceptions'. Click exception CHG-17: 'Approved by A. Rivera 14:02; implemented (transition to Implementing) by A. Rivera 14:05. SoD violation, control ITGC-CM-03.' Both timestamps link to the history entries. The exception issue has already been raised with a drafted management response.

**Bonus fit.** Primary: Teamwork Graph (traverses change to work item to PR or deployment, which is the evidence chain auditors want). Fallback: Rovo Agents. Could also be submitted to Marketplace because it is generic enough.

**Technical risks.** Judges' sites probably lack Bitbucket and deployments, so the core must run on JSM and Jira history alone, with dev info as a bonus layer. Reading JSM approvals needs the JSM REST approval endpoints, and the judge needs a JSM project; seed it. Roles in the demo all map to one judge account, so the seed must simulate multiple actors. Use field-level 'implementer' and 'approver' user pickers set by the seed, and make the SoD source configurable. Category ambiguity: it could be reassigned to Business Teams. Frame it as finance / regulated.

**Judge test data.** 'Create sample change history' builds a JSM change project with 40 changes covering a realistic mix: normal, standard and emergency, with seeded approver and implementer fields, backdated-looking comments and attachments, and 4 planted control failures. The engine also runs against any JSM change project the judge already has, using whatever approvals exist, and reports 'not determinable' honestly where evidence is missing.

**Deterministic core.** Deterministic: seeded reproducible sampling, data collection, each control test as a pure function with timestamps and actor IDs, the pass/exception/NA verdict, and the page-tree and table generation. Auditors need determinism, which also makes it heavily unit-testable. LLM: only the exception narrative and the draft management response, clearly labelled as draft.

### I26: 510(k) Change Navigator: FDA software-change regulatory assessment inside the change request

*Category: Specialized Industries. Rank 28 of 40, total 65, judge spread 5.64.*

**One-liner.** When a medical-device software change request is raised in Jira, it walks the FDA 'Deciding When to Submit a 510(k) for a Software Change' decision flowchart. Each question is pre-answered by AI with cited evidence from the linked requirements, risk analysis and code-change items. A regulatory affairs reviewer confirms or overrides, and a signed assessment record is filed to Confluence.

**User and pain.** Who: the regulatory affairs specialist at a SaMD or medical-device software company. When: for every design change (a new alarm threshold, a refactor of the dose calculator, a library upgrade), RA must document whether it needs a new 510(k) (or, in the EU, whether it is a 'significant change' under MDCG 2020-3). They chase engineers for what the change touches and whether it affects a risk control. The rationale is often thin, and an FDA inspector who finds an undocumented 'letter to file' decision issues a 483 observation. Traceability apps exist (Ketryx, Design Control for Jira), but none of them pre-fills the regulatory decision logic.

**What it does.** 1) A Change Request issue gets a 'Regulatory assessment' panel. 2) The app encodes the FDA guidance flowchart questions as a deterministic decision tree (for example: Is the change made solely to strengthen cybersecurity? Does it introduce a new risk or modify an existing risk that could result in significant harm? Does it create or necessitate a change to a risk control measure? Does it change the clinical functionality or performance specification? And so on), plus the MDCG 2020-3 tree as an alternative profile. 3) It gathers context: linked design inputs (requirements), risk items (hazard and risk-control issues per ISO 14971), the SOUP register, the description of the changed code, and the intended-use page in Confluence. 4) For each node, the Forge LLM proposes Yes, No or Unknown with quoted evidence snippets and links. Answers below the confidence floor are forced to 'needs human'. 5) The tree is walked deterministically to an outcome: 'Document (letter to file)' or 'New 510(k) likely required', showing the exact path taken. 6) The RA reviewer edits answers, the outcome recomputes, and on 'Approve' a versioned Confluence assessment page is created and linked, with the approver and timestamp recorded. It can block the CR's 'Approved for implementation' transition until the assessment exists.

**Modules and APIs.** jira:issuePanel (decision-tree UI), jira:workflowValidator (requires a completed assessment), Jira REST (linked issues, fields), Confluence REST v2 (intended use, SOUP list, assessment record pages), @forge/llm (per-question evidence extraction with quotes), Forge KVS (answer history and audit trail), rovo:agent 'Reg Change Assessor' with actions assess-change, get-assessment-path, list-pending-assessments, plus a rovo:skill holding the decision-tree playbook as SKILL.md (open-source).

**Context usage.** It joins the change request (Jira), linked requirements and ISO 14971 risk controls (Jira issues or Assets), intended use and the SOUP list (Confluence), and prior assessments for similar changes (KVS). Each flowchart question needs a different source, so the join is the product.

**Aha demo moment.** Open CR-58, 'Change insulin bolus rounding from 0.1 U to 0.05 U'. The panel lights up the path: Q1 cybersecurity-only: No. Q2 new or modified risk: YES, quoting linked RC-12 'bolus rounding error mitigation' and its hazard 'overdose'. The outcome is 'New 510(k) likely - path 2b'. Then open CR-59, 'Upgrade logging library': it walks to 'Document only', citing the SOUP entry with a 'no safety classification' note. The judge flips one answer and the outcome recomputes instantly.

**Bonus fit.** Primary: Rovo Agents (an assessor agent plus a reusable rovo:skill playbook that other agents can call). Secondary: rovo:mcp, for an RA consultant's own client.

**Technical risks.** Domain accuracy: paraphrase the guidance questions (public US government text; cite the source and version) and position the app as decision support with a mandatory human sign-off, never automatic determination. LLM over-confidence: require quotes that actually appear in the source text, verified deterministically by substring check, otherwise downgrade to Unknown. Multi-product Jira + Confluence install. It sits in a crowded medtech space, but the regulatory-decision angle is distinct from matrices.

**Judge test data.** 'Load sample SaMD project' creates an insulin-calculator app project with 20 requirements, 8 hazards and risk controls, a SOUP and intended-use Confluence page, and 5 change requests spanning every outcome branch. Judges can write any new change request in plain English, link any issues, and watch the tree walk. Unknowns appear honestly when evidence is thin.

**Deterministic core.** Deterministic: the decision trees (FDA and MDCG profiles) as data, tree walking and outcome, quote verification against the source text, the confidence floor leading to 'needs human', the validator gate, the audit trail and Confluence record generation. LLM: per-question evidence retrieval and the proposed answer with a quote, and the summary paragraph of the rationale.

### I27: ODD Coverage Atlas: scenario coverage against the operational design domain

*Category: Specialized Industries. Rank 2 of 40, total 71.84, judge spread 3.72.*

**One-liner.** It turns the ODD definition (a PAS 1883 / ISO 34503-style taxonomy on a Confluence page) and a Jira library of scenario tests into a coverage map. The map shows which ODD attribute combinations have no validation scenario, weights the gaps by real field and disengagement exposure, and creates scenario test stubs for the worst holes in one click.

**User and pain.** Who: the scenario-based testing lead for an L2+ highway or urban feature. When: during release planning, the safety assessor asks 'show me how your 800 test scenarios cover the declared ODD'. The answer is a hand-maintained Excel pivot. Nobody knows that 'night x wet x construction zone x motorcycle cut-in' has zero coverage while 'day x dry x straight' has 140 near-duplicates.

**What it does.** 1) It parses the ODD taxonomy from a Confluence macro table (dimensions such as scenery, environment and dynamic elements, each with enumerated values) into a canonical schema. 2) It tags each scenario test issue with ODD values: structured fields if they exist, otherwise the LLM extracts values from the test description into the schema, validated against the enum. 3) It computes coverage deterministically: single-value coverage, pairwise (2-way) and 3-way combinatorial coverage, excluding combinations the ODD marks infeasible, with redundancy clusters. 4) It ranks gaps by exposure-weighted risk, using counts of field issues and disengagements per attribute combination taken from Jira/JSM labels or the Trigger Ledger or Takeover Triage outputs if present. 5) Visual: a 3D coverage cube / heatmap (three.js) where the user picks any 3 dimensions and empty cells glow. Click a cell to see the tests or create a stub. 6) It generates the top-N missing combinations as test stubs, using a covering-array algorithm to cover the most pairs with the fewest new scenarios, with an LLM-drafted scenario narrative.

**Modules and APIs.** jira:projectPage (Custom UI with a three.js coverage cube and 2D heatmaps), confluence macro (ODD taxonomy editor and canonical JSON), Jira REST (JQL over the test library, bulk create stubs), Forge SQL or KVS (tag cache), async consumer (bulk tagging), @forge/llm (description-to-ODD-tag extraction, scenario narrative), Teamwork Graph GET actions (tests to linked requirements and field issues for exposure weighting), rovo:agent 'Scenario Planner' with actions get-coverage-gaps, propose-scenarios, tag-test.

**Context usage.** It joins the ODD definition (Confluence), the test library (Jira test issues of any test tool's issue type), and field exposure evidence (JSM or disengagement issues). Coverage without exposure is a vanity metric. The weighting needs the second source.

**Aha demo moment.** The cube renders with 120 scenarios as dots. Rotate it, choose lighting x surface x actor, and a dark empty corner, 'night x wet x vulnerable road user', glows red with '6 field events, 0 scenarios'. Click 'Fill top gaps': the covering-array generator proposes 4 scenarios that close 31 uncovered pairs. One click creates them as Jira tests with drafted narratives.

**Bonus fit.** Primary: Teamwork Graph (test to requirement to field-issue traversal for weighting). Alternatively Rovo Agents. Plays to the three.js strength for the visual.

**Technical risks.** LLM tagging accuracy: constrain it to enums, show tags for human correction, and cache. Combinatorial explosion: cap dimensions and use pairwise/3-way, not the full cartesian product. three.js bundle size in Custom UI is fine. Risk of being seen as 'just a dashboard': the covering-array generator and stub creation make it a decision tool. Xray test issue types differ per site, so make the test type and JQL configurable.

**Judge test data.** 'Load sample highway-pilot ODD' creates a Confluence ODD page with 7 dimensions, a Jira project with about 120 scenario tests written in natural language with deliberate gaps and duplicates, and 50 field issues. Judges can paste their own taxonomy or point it at any project's issues with a JQL query. Tagging runs on whatever text exists.

**Deterministic core.** Deterministic: taxonomy parsing and validation, enum-constrained tag validation, t-way coverage computation, infeasibility constraints, the exposure weighting formula, the greedy covering-array generator (an AETG/IPOG-style algorithm), and stub creation. It is fully unit-testable. LLM: extracting ODD tags from free-text test descriptions, and writing scenario narratives for the generated stubs.

### I28: OTA Regression Radar: field-issue rates by software version, with a UNECE R156 impact record

*Category: Specialized Industries. Rank 12 of 40, total 68.59, judge spread 1.28.*

**One-liner.** It correlates incoming field and service complaints with the exact vehicle software version installed (from Assets), detects statistically significant rate increases after an over-the-air release, and opens a pre-filled R156 software-update impact assessment linked to the release, the suspect complaints and the changed components.

**User and pain.** Who: the OEM or Tier-1 software release manager responsible for the R156 Software Update Management System. When: one week after rolling OTA 5.3 to 20% of the fleet, service desks see more 'adaptive cruise disengages randomly' tickets. Nobody notices for a month, because complaints are not joined to the installed version, and the R156 impact-assessment record is written after the fact from memory.

**What it does.** 1) Assets holds vehicles (VIN-like ID, model, market) and their software-version history (or a Jira field on the complaint plus a version table in storage). 2) Each field complaint in JSM is matched to the vehicle's installed version on the complaint date (an interval join) and classified into a symptom category (the LLM maps the narrative onto a fixed taxonomy; deterministic keyword rules run first). 3) It computes the complaint rate per 1,000 vehicle-weeks per version and symptom, and runs a Poisson rate-ratio test or exact conditional binomial test between the new version and its predecessor, using staged-rollout exposure. Significant increases (p below threshold and minimum count) raise a 'Regression signal'. 4) The signal creates a Jira 'R156 impact assessment' issue linked to the Jira release version, its included work items (what changed), the affected components and the evidence complaints. It is pre-filled with R156 fields: affected systems, type-approval relevance question, rollback or hold recommendation. It can transition the rollout tracking issue to 'Hold' after human confirmation. 5) A version panel shows a small-multiples chart of rate by version per symptom with confidence intervals.

**Modules and APIs.** JSM trigger plus a manual 'Analyse' action, Assets REST (vehicle and SW-version history; storage fallback), Jira REST (versions, release work items, issue creation and links, transitions), jira:projectPage / version panel (rate charts), Forge SQL (exposure and complaint tables for aggregation), async consumer, @forge/llm (symptom classification and assessment draft), Teamwork Graph GET actions (release to work items to components to PRs), rovo:agent 'Release Safety Watch' with actions get-version-signal, compare-versions, open-impact-assessment.

**Context usage.** It joins JSM complaints, the Assets vehicle and software install history, and Jira release contents (what changed in the version). The statistical signal needs complaints plus installed-base exposure. The actionable record needs the release's change list.

**Aha demo moment.** The version panel for 5.3 shows the 'ACC unexpected disengage' rate at 4.1 per 1k vehicle-weeks versus 1.2 on 5.2. Rate ratio 3.4, p = 0.002, 19 complaints. A red badge opens R156-IA-7, already linked to the 12 work items in 5.3, with the two that touched the ACC component highlighted. One click on 'Recommend hold' moves the rollout ticket to Hold, with a comment carrying the evidence.

**Bonus fit.** Primary: Teamwork Graph (release to work item to component to PR traversal to show what changed). Fallback: Rovo Agents.

**Technical risks.** Assets availability, so use the storage fallback. Statistics on small counts must use exact tests and a minimum-count floor, and show the uncertainty honestly. R156 field content must be written as assistive, not as a legal record. Exposure data seeding must be realistic. It overlaps partly with Trigger Ledger: keep the focus here on software versions and releases, versus ODD conditions there.

**Judge test data.** 'Load sample fleet' creates 500 synthetic vehicles in a storage table (or Assets) with a staged rollout of versions 5.1 to 5.3 over 8 weeks, 3 Jira release versions with work items and components, and about 200 complaints generated from a Poisson process with one planted regression. Judges can file more complaints, change the version of a VIN, or add their own release and see the test statistics recompute.

**Deterministic core.** Deterministic: interval join of complaint date to installed version, keyword pre-classification, exposure computation, the Poisson rate-ratio and exact tests, thresholds, signal state, issue creation and linking, and charts. Statistical functions are tested against scipy reference values generated in Python. LLM: classifying free-text complaints into the symptom taxonomy when the rules miss, and drafting the R156 assessment narrative.

### I29: Spec Ripple: Confluence safety-spec edits that mark dependent Jira requirements and tests suspect, with a semantic diff

*Category: Specialized Industries. Rank 5 of 40, total 70.34, judge spread 1.28.*

**One-liner.** When a section of a Confluence system or safety specification changes, it computes what actually changed (numbers, units, conditions, shall-statements), finds the Jira requirements, tests and open work derived from that section, and marks only the ones whose content is now inconsistent as suspect, with side-by-side evidence. This is ASPICE 4.0 consistency, not just links.

**User and pain.** Who: the software requirements engineer on an ASPICE level 2/3 automotive project, plus the test engineer downstream. When: a systems engineer edits the 'Lane Keeping Functional Safety Concept' page, changing the maximum corrective steering torque from 3 Nm to 2.5 Nm and adding 'only above 60 km/h'. Twelve linked Jira requirements and 30 tests still say 3 Nm, and nobody is notified. The first request for this dates to 2009, and ASPICE assessors want content consistency, not link coverage.

**What it does.** 1) It indexes spec pages by section, using heading anchors and requirement IDs in the text, and stores a normalised snapshot per section. 2) On a page update, or on a 'Check ripple' click, it diffs the versions per section and extracts deterministic 'facts' from both versions: numeric values with units (a unit-aware parser), comparators, shall/should statements, condition clauses and requirement IDs. 3) It finds dependents through Jira remote links, mentions of the section ID in issue text, TWG relationships, and a requirement-ID index. 4) For each dependent it runs a deterministic fact comparison first: the requirement states 3 Nm and the section now says 2.5 Nm, so it is INCONSISTENT. For non-numeric changes it asks the LLM a constrained 'is this requirement still consistent with the new section text? quote the conflicting clause' question, and verifies the quotes by substring. 5) Suspect items get a 'Suspect: spec changed' flag (a custom field or label), a comment with old vs new quotes and a link to the exact page version diff. Owners get a review task, with 'Confirm still valid' or 'Update' actions that clear the flag and record who accepted it. 6) The page byline shows 'This section has 7 unresolved downstream suspects'.

**Modules and APIs.** Confluence trigger (avi:confluence:updated:page) plus a byline item 'Check ripple', Confluence REST v2 (page versions and body), Jira REST (search, comments, field updates, links), jira:issueGlance / issuePanel (suspect evidence and actions), Forge KVS / SQL (section snapshots and the fact index), async consumer, @forge/llm (constrained consistency judgement with quotes), Teamwork Graph GET actions (page to linked issues, including across projects), rovo:agent 'Consistency Checker' with actions check-section-impact, list-suspects, accept-suspect, plus rovo:mcp exposing the same tools.

**Context usage.** Fully cross-product: the spec in Confluence (with version history), requirements, tests and in-flight work in Jira, and TWG links between them. The semantic diff needs both page versions plus each dependent's text.

**Aha demo moment.** Edit the spec page, changing '3 Nm' to '2.5 Nm' and adding 'above 60 km/h'. Click 'Check ripple'. Within about 20 seconds the byline shows '5 suspects'. Of 12 linked items, the 5 that state 3 Nm or lack the speed condition are flagged and the other 7 are explicitly marked consistent. Open one test: red/green quotes, 'Requirement says: "limit torque to 3.0 Nm" / Spec v14 says: "limit to 2.5 Nm, only above 60 km/h"', and a 'View page diff v13 to v14' link.

**Bonus fit.** Primary: Teamwork Graph (page to issue relationships across projects are exactly what TWG serves). Secondary: rovo:mcp. Note that this is the brief's 'strongest open gap', framed for automotive. It could be argued for Software Teams as well.

**Technical risks.** Closest to crowded suspect-link and traceability space. The differentiators are cross-product triggering and content-level fact diffs, and these must be visible in the demo. Confluence-event lag of up to 3 minutes, so the demo uses the byline button. Section anchoring breaks when headings are renamed: fall back to fuzzy matching. LLM false positives, mitigated by the deterministic fact layer first and quote verification. A multi-product install is needed.

**Judge test data.** 'Load sample LKA spec' creates a 3-section Confluence spec plus 25 linked Jira requirements and tests with deliberate value mentions. Judges are told to edit any number or condition and click Check ripple. It also works on any existing page with links to issues on their site, because dependents are found from real links and mentions, not hard-coded IDs.

**Deterministic core.** Deterministic: section segmentation, version diffing, the unit-aware numeric and comparator fact extraction, the dependent lookup, fact-level contradiction detection, quote substring verification, suspect state and acceptance audit. LLM: only the consistency judgement for non-numeric prose changes (constrained JSON output plus verified quotes) and the one-line change summary.

### I30: Vigilance Clock: medical-device complaint reportability and regulatory deadline router

*Category: Specialized Industries. Rank 25 of 40, total 65.51, judge spread 2.69.*

**One-liner.** Every complaint in the JSM complaint queue gets a deterministic reportability decision path (FDA 21 CFR 803 MDR, EU MDR Article 87 serious incident), an AI pre-fill of each decision question with evidence from the complaint and device records, and a live countdown to the earliest legal reporting deadline that routes and escalates before it is missed.

**User and pain.** Who: the post-market surveillance / complaint-handling specialist at a medical device or SaMD company. When: a complaint arrives on Friday afternoon: 'the app showed a wrong glucose trend, the patient was hospitalised'. The clock started when the company became aware. EU MDR requires a report within 2 days for a serious public-health threat, 10 days for a death or unanticipated serious deterioration, otherwise 15 days. FDA requires 30 calendar days, or 5 work days for remedial action. Teams track this in spreadsheets, and late MDRs are a classic FDA 483 and warning-letter finding. Marketplace has complaint risk-scoring and CAPA apps, but no deadline-driven reportability router was found.

**What it does.** 1) A JSM complaint request type with an awareness date/time (defaulting to creation, editable with an audit trail), device or product (Assets or a field), market and narrative. 2) Decision trees encoded as data for FDA MDR (death? serious injury? malfunction that would likely cause or contribute to death or serious injury if it recurred? remedial action?) and EU MDR (serious incident? serious public-health threat? causal relationship?). 3) The LLM proposes an answer per question with quoted evidence from the narrative, linked prior complaints and the device's hazard list. Quotes are verified, and anything below the confidence floor goes to 'needs human'. 4) It walks the trees deterministically to an outcome per jurisdiction, plus the earliest due date computed from the awareness time with business-day logic where the rule needs it. 5) It sets JSM SLA-like due fields, routes to the vigilance officer group, posts escalation comments at 50% and 80% of the window (scheduled trigger), and blocks closure without a reportability decision signed by a qualified user. 6) It drafts the MedWatch 3500A / EU MIR form fields as a structured checklist for the human to transfer. It does not submit.

**Modules and APIs.** JSM request type plus queue, jira:issuePanel (decision path, countdown, form pre-fill), jira:workflowValidator (no closure without a decision), scheduledTrigger (deadline escalation sweep), Jira REST (fields, comments, assignments), Assets REST (device model and hazard references, with a storage fallback), @forge/llm (per-question evidence and pre-fill), Forge KVS (decision audit trail), rovo:agent 'Vigilance Assistant' with actions assess-reportability, list-due-reports, draft-report-fields, plus a rovo:skill with the decision-tree playbook.

**Context usage.** It joins the complaint narrative (JSM), the device record and its known hazards and risk file (Assets or Confluence), and similar prior complaints and their decisions (Jira history, for consistency). Deadlines depend on market and device data that are not on the ticket itself.

**Aha demo moment.** Submit a complaint: 'Patient hospitalised after the app displayed a falling trend arrow while glucose was rising.' The panel shows EU: serious incident, YES (quote 'hospitalised'), so a 10-day report is due Dec 3 09:14 CET. FDA: serious injury, YES, so a 30-day MDR is due Dec 23. A countdown ring appears, the ticket is routed to Vigilance Officers, and the MIR field checklist is pre-filled. Change the narrative to 'display glitch, no patient impact' and it recomputes to a malfunction assessment path with a different clock.

**Bonus fit.** Primary: Rovo Agents (a vigilance assistant plus a reusable skill). Secondary: rovo:mcp. Marketplace is plausible as a free utility.

**Technical risks.** Regulatory correctness: encode the rules from the primary text (21 CFR 803, MDR Art. 87, MDCG 2023-3 guidance), version them, and state clearly that it is decision support requiring a qualified human. Time-zone and business-day computation needs fixtures. Scheduled triggers have no retries and can fire twice, so make escalation idempotent. It needs a JSM project on the judges' site (seed it), and a fallback Jira issue type if JSM is absent. Healthcare ideas are more crowded than automotive ones, so the deadline angle must lead.

**Judge test data.** 'Load sample complaints' creates a JSM complaint project with 3 device products and their hazard lists, plus 15 complaints covering each outcome (death, serious injury, malfunction-only, non-reportable, public-health threat) and varied awareness times, including one already near its deadline. Judges type any new complaint narrative and see the decision path, quotes and deadlines computed live.

**Deterministic core.** Deterministic: the jurisdiction decision trees as versioned data, tree walking, deadline computation (calendar versus business days, time zones), routing, the escalation thresholds and the idempotent sweep, the closure validator, quote substring verification, the audit trail. Table-driven tests run on the deadlines. LLM: proposing answers to decision questions with quotes, and pre-filling the free-text report fields.

### I31: Ripple: section-level spec change propagation

*Category: Software Teams. Rank 22 of 40, total 66.62, judge spread 2.82.*

**One-liner.** When someone edits a Confluence spec section, Ripple marks the specific Jira acceptance criteria, tests and open PRs that the edit may now contradict as suspect, and quotes the before and after text.

**User and pain.** A QA lead on a payments team signs off a story on Thursday. On Tuesday the product manager had rewritten the 'Refund limits' section of the linked PRD. The story's acceptance criteria still say 'max 3 refunds' while the page now says 'max 2'. Nobody was told, because a Confluence-to-Jira link is not a notification. This matches the JRASERVER-19108 request chain (2009 to 2025) and Balaji's 'this is not just linking' quote.

**What it does.** 1. When a page is edited (a Confluence page-updated event, or a 'Check impact' byline button for demos), it snapshots the page and diffs it section by section (heading tree plus a normalised paragraph hash). 2. For each changed section it uses TWG to find dependents: confluencePageLinkedJiraWorkItems and remote links, then each work item's linked PRs, deployments and child test items. 3. A deterministic pre-filter (shared numbers, units, named entities, glossary terms between the changed section and each AC line) ranks candidate pairs. 4. Forge LLM classifies only the top pairs as CONSISTENT, CONTRADICTS or NEEDS-REVIEW, quoting the exact span. 5. It sets a 'Suspect' flag and an issue-panel card on each affected item showing the diff and the contradicting AC, offers 'Re-verify' and 'Not affected' buttons (a human always closes the loop), and writes an impact-analysis log page.

**Modules and APIs.** confluence:contentBylineItem and a page-updated trigger; jira:issuePanel and an issue glance; action modules (GET get-impact-for-page, GET get-suspects-for-issue, CREATE mark-reverified, CREATE file-impact-record); one rovo:agent ('Ripple Analyst') that answers 'what did this edit break?'; rovo:skill SKILL.md 'change-impact playbook'; rovo:mcp exposing get-impact-for-page so a dev's Claude Code can ask 'is my branch still consistent with the spec?'; TWG curated queries (confluencePageLinkedJiraWorkItems, jiraWorkItemLinkedExternalPullRequests, confluencePageOwners); Forge LLM; KVS for section snapshots; Forge SQL for the suspect ledger.

**Context usage.** It joins Confluence page history (the diff), the Jira work-item links and AC text, TWG edges to PRs and deployments, and page owners and contributors (who to notify). Without the cross-product join there is no product.

**Aha demo moment.** The demo changes '3' to '2' in the PRD's Refund section and clicks 'Check impact'. About 20 s later, the story's issue panel turns amber: 'AC #2 contradicts spec section 4.1 (edited by Priya 2 min ago): "max 3 refunds" vs "max 2 refunds"', with links to the open PR and the Xray test. It then asks the agent in Rovo Chat 'what else did Priya's edit touch?'.

**Bonus fit.** Primary: Teamwork Graph, because the dependent traversal is the core. It also qualifies for Agents (agent plus reusable actions) and MCP (rovo:mcp tools).

**Technical risks.** Prior art: the blast-radius GitHub repo and in-Jira suspect-link apps (R4J, Tracestitch), so differentiate on section-level semantic evidence. TWG can return 'not permitted' inside actions; fall back to the Jira and Confluence REST link APIs in resolvers. The app installs in both Jira and Confluence (multi-product install). Product events can lag 3 min, so the demo uses the byline button. Pair explosion on big pages; cap it with the deterministic pre-filter.

**Judge test data.** An admin 'Seed demo' button creates one Confluence PRD with 6 sections and a Jira project with 8 stories whose ACs reference it, 2 of them inconsistent by design. It also works on any existing page that has linked issues: the judge edits any section and clicks 'Check impact'. A diagnostics tab shows each TWG query's row count and missing-scope warnings.

**Deterministic core.** Section segmentation and hashing, the diff, link traversal, number, unit and entity overlap scoring, the suspect state machine (Suspect, Re-verified, Not affected) and the audit log are all deterministic and unit-testable on fixtures. The LLM only gives the per-pair consistency verdict with a quoted span, and the output is schema-validated. If the LLM fails, the item degrades to NEEDS-REVIEW.

### I32: ReqIF Delta: OEM requirement drops into the graph

*Category: Specialized Industries. Rank 16 of 40, total 67.99, judge spread 5.51.*

**One-liner.** A Tier-1 automotive supplier attaches the OEM's new ReqIF requirement export to Jira. A TWG connector loads every customer requirement into the graph, and an agent shows exactly which internal stories and tests the changed OEM requirements affect.

**User and pain.** A requirements engineer at a brake-ECU supplier receives version 7 of the OEM's 1,400-requirement ReqIF spec, exported from DOORS or Polarion. The deadline for the change-impact response is 10 working days, an ASPICE SYS.1/SUP.10 obligation. Today she diffs it by hand in Excel and searches Jira for the requirement IDs.

**What it does.** Connector app: it parses an attached .reqif or .reqifz (pure-JS XML) and upserts each SpecObject as an ExternalDocument or ExternalWorkItem. It keeps the stable OEM ID, the version, attributes (ASIL, status, text) and associations to the Jira items whose fields or text cite that ID, so Rovo Search can now find the OEM requirements. Consumer app: it runs a deterministic attribute-level diff between v6 and v7 (added, removed, text changed, ASIL raised, and so on). TWG returns the linked internal work items, tests and owning teams. The agent drafts the per-requirement impact response (Accept, Clarify or Reject, plus the affected items) into a Confluence table for the engineer to edit. Stories linked to changed requirements get a 'Customer requirement changed' flag.

**Modules and APIs.** App A (connector): graph:connector, a Jira issue action 'Ingest ReqIF', @forge/teamwork-graph setObjects. App B (consumer): action modules (GET diff-customer-spec, GET get-affected-work, CREATE create-impact-response-page, CREATE flag-items), a rovo:agent 'Customer Spec Analyst', rovo:mcp for querying the spec from a systems engineer's IDE, a jira:issuePanel, TWG queries over the ingested External objects and work items, Forge LLM, Forge SQL for the versioned requirement table.

**Context usage.** It joins a file arriving from outside Atlassian (made graph-native through the connector) with Jira stories and tests, the Confluence response page and team ownership from TWG. Writing inferred relationships into TWG is one of the open gaps.

**Aha demo moment.** The demo attaches v7.reqifz and clicks 'Ingest'. The issue panel reads '37 OEM requirements changed: 4 ASIL raised B to C, 3 removed'. A Rovo Search for 'BRK-SYS-0412' now finds the OEM requirement in the graph. The agent produces a pre-filled impact-response table that links 11 affected stories and 6 tests.

**Bonus fit.** Primary: Teamwork Graph (both ingest through the connector and consume, across two apps). Agents is secondary.

**Technical risks.** The 'API or connector, not both' rule forces two apps and two installs, so the judge setup is heavier. Mapped External types and querying them back must be checked. The connector requires Jira-only install and Rovo enabled. ReqIF variants (xhtml rich text, embedded OLE) need a tolerant parser. Large specs need async chunking (900 s consumer, 25 s resolver).

**Judge test data.** It ships two synthetic ReqIF files (v6 and v7, about 200 requirements, original text written by me rather than taken from any OEM), and a seed that creates stories citing the requirement IDs. Judges can also upload any ReqIF exported from open tools (Eclipse RMF/ProR sample files).

**Deterministic core.** ReqIF parsing, stable-ID matching, the attribute and text diff (token-level), ID-citation link inference (regex plus field match), affected-set traversal, and ASIL-escalation rules are deterministic, with fixture tests. The LLM only drafts the clarification wording and summarises the change rationale.

### I33: Triggering Condition Desk (SOTIF field loop)

*Category: Specialized Industries. Rank 7 of 40, total 69.7, judge spread 1.41.*

**One-liner.** It turns ADAS field complaints and test-driver disengagement reports in JSM into a living SOTIF triggering-condition catalogue, and shows which conditions have no validation scenario or test yet.

**User and pain.** A SOTIF safety engineer at an ADAS supplier gets 40 JSM tickets a week ('lane assist let go on wet bridge at dusk'). ISO 21448 requires field monitoring to feed discovered triggering conditions back into the scenario catalogue. In practice the tickets are closed as 'cannot reproduce' and never reach the catalogue or the test plan. No Marketplace app was found for 'SOTIF' or 'triggering condition'.

**What it does.** 1. When a request arrives (or on a bulk 'Triage' button), it extracts structured ODD attributes: road type, weather, lighting, speed band, feature state and SW version. Portal form fields are parsed deterministically, and the LLM extracts only what is in the free text. 2. It maps the attributes to a triggering-condition taxonomy (Jira issue type TC, with ODD attribute fields) using deterministic attribute matching and a similarity threshold. 3. It traverses the graph from TC to linked Scenario items, linked Xray or Jira test items, and their last results, and reports coverage gaps: no scenario, a scenario with no test, or a test last passed on an older SW version. 4. The agent proposes 'Create new TC' or 'Link to TC-17', and drafts the scenario stub and the safety-requirement review task for the engineer to approve.

**Modules and APIs.** jira:issuePanel on JSM requests, a jira:projectPage 'TC Catalogue' heatmap (ODD attributes x coverage), actions (GET classify-field-report, GET get-tc-coverage, CREATE link-report-to-tc, CREATE propose-scenario), a rovo:agent 'SOTIF Triage', rovo:skill 'ISO 21448 triage playbook', rovo:mcp so the simulation team can query uncovered TCs from their tooling, TWG for work-item links, comments and owning teams, Forge LLM for free-text attribute extraction.

**Context usage.** It joins JSM customer reports, the Jira TC and scenario catalogue, test items and results, SW version (fix versions), and the owning teams from TWG. It also changes a decision, because a 'cannot reproduce' ticket becomes a tracked TC with a gap.

**Aha demo moment.** Three differently worded tickets ('bridge, rain, evening', 'wet overpass at sunset', 'glare plus spray') arrive. All three cluster onto one new proposed TC 'wet elevated road + low sun', and the catalogue heatmap shows a red cell: no scenario, no test. One click creates the scenario stub, linked to the three reports.

**Bonus fit.** Primary: Agents (an assignable triage agent with reusable actions and a skill). TWG and MCP are secondary.

**Technical risks.** Taxonomy design must look credible to safety people, so it is seeded with a public-style ODD taxonomy along the lines of PAS 1883, written in my own words. It must not claim compliance. The coverage view needs a 'Test' issue type if Xray is absent, so it must not depend on Xray. JSM plus Jira-software project setup on the judge's site.

**Judge test data.** A seed creates a JSM space with 25 synthetic field reports, 10 TCs, 12 scenarios and tests, and deliberately leaves gaps. The agent works on any JSM request text; attributes it cannot extract are shown as 'unknown' and the request is still routed to a human.

**Deterministic core.** Form-field parsing, ODD attribute normalisation (enums, speed bands), TC matching by attribute overlap plus a threshold, coverage and gap computation, and the SW-version staleness rule are deterministic. The LLM only extracts attributes from free text into a strict JSON schema and drafts scenario descriptions.

### I34: Calibration Window: out-of-tolerance impact analysis

*Category: Specialized Industries. Rank 17 of 40, total 67.86, judge spread 4.1.*

**One-liner.** When a sensor or test-equipment calibration in Assets is found out of tolerance, it finds every test run and defect produced with that rig since the last good calibration, and marks those results suspect.

**User and pain.** A validation lead for an ADAS test fleet learns on Monday that test vehicle TV-07's front radar was 0.8 degrees misaligned at re-calibration. IATF 16949 / ISO 17025-style rules require assessing the validity of every previous result since the last good calibration. Today that means a day of spreadsheet archaeology across Jira test executions and drive tickets.

**What it does.** Assets holds vehicles, sensors and rigs, with calibration records (date, result, tolerance). When a calibration record is set to 'Out of tolerance', or on a button, it computes the suspect window [last in-tolerance cal, now]. It traverses the graph from the asset to linked test runs and drive sessions (Jira items referencing the asset, or connector-ingested run records) and then to the defects and requirements those runs verified. The result is a suspect list ranked by safety relevance (an ASIL field and pass or fail outcome). It drafts a re-test plan as Jira tasks grouped per scenario and posts a containment note to the defect owners. Each result can be dispositioned (Re-test, Still valid with justification, or Not affected).

**Modules and APIs.** Assets REST (objects and attributes), jira:issuePanel on runs and defects showing a 'Suspect: TV-07 radar out-of-cal window' banner, a jira:globalPage 'Containment board', actions (GET get-suspect-window, GET list-affected-results, CREATE create-retest-plan, CREATE record-disposition), a rovo:agent 'Cal Containment', rovo:mcp, TWG AssetsObject plus work-item queries, and an optional second app with graph:connector that ingests drive-session records as ExternalBuild objects.

**Context usage.** It joins Assets (equipment state and history), Jira test runs, defects and requirements (what each run proved), and teams from TWG (who must re-test). The aha comes from the time-window join across products.

**Aha demo moment.** The demo flips TV-07 radar calibration to 'Out of tolerance'. The containment board shows 'Window: Oct 12 to Nov 19, 23 runs, 4 ASIL-B verifications now unproven, 2 closed defects were verified only on TV-07'. It clicks 'Create re-test plan' and 5 grouped tasks appear, assigned to the owning teams.

**Bonus fit.** Primary: Teamwork Graph (AssetsObject plus work-item traversal). Agents is secondary. It echoes the FleetOps (Assets) win pattern.

**Technical risks.** Assets availability and its API on judges' sites (Assets ships with JSM Premium/Enterprise; the demo site likely has it, but this needs checking). TWG AssetsObject relationships may be thin, so fall back to the Assets and Jira REST APIs. Data modelling must be simple enough to seed automatically.

**Judge test data.** A seed creates an Assets schema (5 vehicles, 15 sensors, calibration history) and 40 test runs and defects spread across the dates. It works with any Assets object referenced by any Jira items through an object field.

**Deterministic core.** Interval math (the suspect window), traversal, ASIL-weighted ranking, 'verified only by suspect runs' set logic, re-test grouping and the disposition state machine are deterministic and fully testable. The LLM only writes the containment note and the justification text.

### I35: Fleet Regression Bisect

*Category: Specialized Industries. Rank 19 of 40, total 67.74, judge spread 3.85.*

**One-liner.** It ingests test-fleet drive-log summaries into the Teamwork Graph and uses rate-per-km statistics to name the software build that introduced a new disengagement cluster, then files one deduplicated defect against that build's PRs.

**User and pain.** An ADAS test-ops engineer sees 60 disengagement tickets a week from safety drivers, each a separate Jira issue. Is the jump in 'late braking on cut-in' disengagements real or just more kilometres driven? Which of the last 5 builds caused it? Today that takes a Python notebook outside Jira, and the answer never reaches the developers' PRs.

**What it does.** Connector app: it reads drive-session summary JSON or CSV attached to a Jira 'Drive Day' issue (km driven, build ID, events with type, speed, location bucket and timestamp) and ingests sessions as ExternalBuild and ExternalDeployment-like objects linked to build versions. Consumer app: it clusters events deterministically (event type plus speed band plus road type, with DBSCAN-style grouping on attributes). It computes the disengagements per 1000 km for each build with Poisson confidence intervals and a change-point test, and flags the first build where the rate rises significantly. TWG lists that build's linked PRs and commits and their authors' teams. The agent files one defect with the evidence table and links the raw tickets as duplicates.

**Modules and APIs.** Two apps (connector and consumer). Actions (GET get-rate-by-build, GET bisect-cluster, CREATE file-regression-defect, CREATE link-duplicates), a rovo:agent 'Fleet Bisect', rovo:mcp so a developer's Claude Code can ask 'did my build raise cut-in disengagements?', a jira:projectPage with a rate-by-build chart, TWG queries (jiraWorkItemLinkedExternalPullRequests, deployments, ingested builds), and Forge LLM for the defect narrative only.

**Context usage.** It joins the drive data (ingested into the graph), the safety drivers' Jira tickets, versions and releases, and PRs and teams from the dev-tool links. The answer, 'build 4.12 caused it, these 3 PRs', needs all of them.

**Aha demo moment.** The chart shows the rate flat across builds 4.9 to 4.11, then 3.4x at 4.12 (95% CI excludes 1). The agent says 'Change point at 4.12; 14 of 17 cut-in events share speed band 60-80 km/h', files DEF-311 linking 17 tickets as duplicates, and lists the 3 PRs merged into 4.12 that touch the 'cut-in' component.

**Bonus fit.** Primary: Teamwork Graph (connector ingest plus API consume). MCP is secondary.

**Technical risks.** PR and deployment data on judges' sites probably has no Bitbucket, so seed PRs as connector-ingested ExternalPullRequest objects, and check those are queryable back. The two-app install burden. The statistics must be explained simply in the video. It may overlap the Triggering Condition idea; pick one.

**Judge test data.** A synthetic generator (a seeded procedural drive-log simulator) produces 30 drive days across 6 builds with one injected regression. It runs on any CSV that has build, km and event columns, and with too few kilometres it reports 'insufficient exposure' instead of guessing.

**Deterministic core.** Clustering, exposure-normalised rates, Poisson confidence intervals, change-point detection, duplicate linking rules and build-to-PR traversal are all deterministic, with fixture tests that use the injected-regression generator. The LLM only writes the defect description.

### I36: SOX Sample Binder

*Category: Business Teams. Rank 27 of 40, total 65.04, judge spread 2.95.*

**One-liner.** An IT auditor pastes a SOX sample of 25 change IDs, and an agent assembles each change's request, approval, PR review, test and deployment chain from the graph, then flags segregation-of-duties breaks and unticketed deploys.

**User and pain.** An internal-audit or ITGC analyst has two weeks to test a sample of 25 production changes. For each one she takes screenshots of the JSM change, the Jira ticket, the PR approvals and the deployment log, then checks that the approver was not the author and that the approval came before the deploy. The classic failure is the 2am hotfix with no ticket. No Marketplace app does sampling-based SOX testing; the existing apps are config audit logs, plus Change Decision Evidence (approval drift only).

**What it does.** 1. The agent takes a sample (a list of keys, or 'random 25 from Q3 normal changes' with a reproducible seed). 2. For each change it traverses the graph: JSM change, linked work items, linked PRs (author, reviewers, merge time), deployments (environment, time) and approvals (approver, time). 3. It runs deterministic control tests: C1 the approver is not the PR author or the deployer; C2 approval is before the production deploy; C3 there is a test or QA status before the deploy; C4 every production deployment in the period has a ticket (reverse check: deployments without work items); C5 emergency changes have a retrospective approval within N days. 4. It writes a Confluence binder page: one row per sample, PASS or EXCEPTION per control, and clickable evidence links. Exceptions become JSM follow-up tasks routed to the control owner.

**Modules and APIs.** actions (GET draw-sample, GET get-change-evidence, GET run-control-tests, CREATE publish-binder, CREATE raise-exception), a rovo:agent 'SOX Binder', rovo:skill with an ITGC test-procedure SKILL.md, rovo:mcp so the auditor's own Claude client can pull the binder, TWG curated queries (jiraWorkItemLinkedExternalPullRequests/Deployments, user and team), the JSM approvals API, a Confluence page creation API, and an optional connector app seeding synthetic PR and deployment data for judge sites without Bitbucket or GitHub.

**Context usage.** It joins JSM changes and approvals, Jira tickets, PRs and deployments (from dev-tool links in the graph) and user identity to compare people across steps. The SoD check is only possible with the identity join.

**Aha demo moment.** The demo types 'Build binder for CHG-101..125' in Rovo Chat. About 40 s later a Confluence page opens with a 25-row matrix: 22 green, 3 red. One row reads 'CHG-114: approver = PR author (A. Chen)'; another reads 'Deploy prod-2025-11-02T02:14 has no ticket'. Every cell links to its source.

**Bonus fit.** Primary: Agents (the auditor-facing agent with reusable control-test actions). MCP is secondary. A Marketplace listing is a natural fit because it is a real business tool.

**Technical risks.** Dev-tool data (PRs and deployments) is likely absent on judges' sites, so the synthetic connector app is needed, which conflicts with the 'API or connector' rule and means two apps. JSM approval API detail. 25 changes x several queries exceeds the 55 s action limit, so build the binder in an async consumer and post the link back. Never claim it is audit-certified.

**Judge test data.** A seed creates 30 JSM changes, linked tickets, approvals and synthetic PRs and deployments with 4 planted exceptions. On a site with no dev data it still runs C2, C5 and the approval-identity checks, and marks the PR controls 'evidence not available' rather than failing.

**Deterministic core.** Seeded sampling, the evidence traversal, all control tests (identity comparisons, timestamp ordering, reverse orphan-deploy check) and the binder layout are deterministic, with golden-file tests. The LLM only writes the exception narratives and answers the auditor's follow-up questions over the computed facts.

### I37: Policy Drift Guard for service-desk knowledge

*Category: Business Teams. Rank 31 of 40, total 62.95, judge spread 3.97.*

**One-liner.** When HR, IT or Finance edits a Confluence policy, it finds the JSM knowledge-base articles, portal request-type help text and canned agent responses that now contradict the policy, and drafts their fixes.

**User and pain.** An IT service-desk manager learns that the laptop-refresh policy changed from 3 years to 4 because an employee complains: the KB article (and the virtual agent quoting it) still promises 3. Policy owners and KB owners are different teams, and nothing connects the edit to the 14 articles derived from it.

**What it does.** 1. When a policy-labelled page is published, or on 'Check downstream', it does a section-level diff and extracts normative statements (numbers, durations, eligibility rules) deterministically, using regex patterns for durations, amounts and roles. 2. It finds dependents: KB articles in JSM-linked spaces that link to or quote the policy (link graph plus TWG linked pages and contributors), request types whose descriptions mention the same terms, and open requests answered with the old rule in the last 30 days. 3. The LLM confirms each contradiction with quoted spans. 4. It creates a 'KB update' task for each KB owner with a suggested replacement paragraph, and posts a banner on the article ('Policy changed Nov 19, pending update'). It also lists customer requests that were answered with the old rule, so agents can follow up.

**Modules and APIs.** confluence:contentBylineItem, a Confluence page banner (contentAction or macro), a jira:issuePanel on JSM requests, actions (GET get-policy-dependents, GET check-article-consistency, CREATE create-kb-task, CREATE flag-article), a rovo:agent 'Policy Steward', rovo:mcp, TWG (confluencePageLinkedConfluencePages, confluencePageOwners, atlassianTeamsBySpace), Forge LLM, and KVS snapshots.

**Context usage.** It joins the policy page in a Confluence HR or IT space, the KB space tied to the JSM portal, JSM request types and past requests, and page owners and teams for routing. It is the business-team flavour of semantic change propagation.

**Aha demo moment.** The demo edits '3 years' to '4 years' in the Laptop Policy and clicks 'Check downstream'. A panel lists 4 KB articles (2 contradict and are shown with quotes, 2 are fine), 1 request type, and 6 requests answered last month with '3 years'. The KB owner's task contains the proposed new paragraph.

**Bonus fit.** Primary: Agents. Teamwork Graph is secondary (ownership and linked pages).

**Technical risks.** It shares its core with Ripple, so do not submit both as separate entries without real differences. Finding KB articles that paraphrase the policy without linking to it needs search (Confluence CQL text search) plus the pre-filter, so recall is limited. JSM KB access and the multi-product install.

**Judge test data.** A seed creates an HR or IT policy space with 3 policies, a KB space with 12 articles (some contradicting by design) and a JSM portal with sample requests. It works on any page: the judge edits a number in any page that other pages link to.

**Deterministic core.** Section diffing, normative-statement extraction (durations, amounts, thresholds, roles), dependent discovery, term-overlap ranking and task routing via owners are deterministic. The LLM gives the contradiction verdict with quoted spans and drafts the replacement text.

### I38: Slip Radar: dependency-aware goal impact

*Category: Business Teams. Rank 37 of 40, total 59.57, judge spread 5.51.*

**One-liner.** When an epic's target date slips, it walks the 'blocks' chain and the TWG goal and project links to show which other teams' work, which Atlassian Projects and which company goals now miss their dates, and drafts the status update for each owner.

**User and pain.** A program manager in a 6-team product launch hears in a Thursday steering meeting that the Payments epic slipped 2 weeks. Nobody had worked out that it blocks Checkout's epic, which feeds the 'Launch EU' Atlassian Project and the Q1 revenue goal. Every owner finds out separately, days late.

**What it does.** 1. When an epic's due date, fix version or sprint changes (or on a 'Simulate slip +N days' panel), it builds the downstream dependency DAG from Jira 'blocks' and 'is blocked by' links across spaces, plus parent and child rollups. 2. It does critical-path date propagation: each downstream item's earliest finish = max(upstream finish + lag, own estimate), using story points and team velocity from closed sprints when estimates are missing. 3. TWG maps the affected work items to Atlassian Projects and Goals (jiraWorkItemGoals, atlassianUserGoalsAndProjects) and to owning teams. 4. It shows a slip tree (which dates break, by how many days, and confidence) and drafts the Atlassian Project status update and a Jira comment for each affected owner, for a human to send.

**Modules and APIs.** A jira:issuePanel 'Slip Radar' with a what-if slider, a jira:globalPage dependency graph view, actions (GET simulate-slip, GET get-goal-impact, CREATE post-impact-comments, CREATE draft-project-update), a rovo:agent 'Slip Radar', rovo:mcp ('what breaks if PAY-12 slips 10 days?'), TWG (jiraWorkItemGoals, atlassianTeamsBySpace, project and goal objects), Forge LLM for update prose only.

**Context usage.** It joins Jira cross-space links, sprint and velocity history, Atlassian Goals and Projects (Home) and teams from TWG. The goal-level answer is impossible without the graph.

**Aha demo moment.** The demo drags the Payments epic slider +14 days. The tree lights up: Checkout epic +9 days (it absorbs 5 days of slack), the 'Launch EU' project misses its Mar 3 target by 6 days, and the goal 'EU revenue Q1' is at risk. One click puts draft updates into 3 owners' queues.

**Bonus fit.** Primary: Teamwork Graph (Goals and Projects plus teams traversal). Agents is secondary.

**Technical risks.** Goals and Projects data on judges' sites may be empty, so seed it, and degrade to the work-item-only view. Atlassian may ship dependency views (Plans/Advanced Roadmaps has dependencies), so the differentiators are goal impact and drafted owner updates. Velocity estimates are rough, so show confidence.

**Judge test data.** A seed creates 3 spaces, 15 epics with cross-links, 2 Atlassian Projects and 1 Goal linked through work items. It works on any site with 'blocks' links, and shows 'no goal links found' gracefully when none exist.

**Deterministic core.** DAG construction, cycle detection, critical-path forward pass, slack computation, velocity-based estimate fill and goal mapping are deterministic and unit-tested. The LLM only drafts the human-facing update text from the computed impact JSON.

### I39: Promise Keeper: customer commitments vs the roadmap

*Category: Business Teams. Rank 21 of 40, total 67.26, judge spread 0.9.*

**One-liner.** It finds every place someone promised a customer a feature or date in JSM requests and Jira comments, links each promise to the epic that delivers it, and warns the account owner as soon as that epic slips or is descoped.

**User and pain.** A customer success manager walks into a QBR having promised 'SSO by end of Q1' in a JSM reply in October. The SSO epic was quietly moved to Q3 last month. She learns this from the customer. Promises live in comments, while plans live in Jira and the Home goals, and nothing joins them.

**What it does.** 1. A scan (async, over JSM requests and Jira comments in chosen projects), or a per-request 'Record promise' action, finds candidate commitments with deterministic patterns ('by <date or quarter>', 'will ship', 'ETA', a fix version mentioned). The LLM confirms each and extracts {feature, date, customer org}. 2. It matches the promise to a delivering epic through explicit links first, then version names, then a ranked text match, and a human confirms the link. 3. It watches the epic: a due date later than the promise date, a fix-version change or a 'Won't do' resolution triggers an alert to the promise owner, with a drafted customer message. 4. The 'Promise ledger' page shows each customer org's open promises and their health (On track, At risk, Broken).

**Modules and APIs.** A jira:issuePanel on JSM requests and epics ('2 customer promises depend on this epic'), a jira:globalPage 'Promise ledger', actions (GET find-promises, GET get-promises-for-epic, CREATE record-promise, CREATE draft-customer-update), a rovo:agent 'Promise Keeper', rovo:mcp, TWG (jiraWorkItemComments, linked work items, user and team, plus CustomerOrg if JSM organisations map), Forge LLM, Forge SQL ledger.

**Context usage.** It joins JSM customer requests and organisations, Jira epics, versions and dates, and comment authors and their teams from TWG. The planners can see this too: the epic panel shows which customers they will disappoint before they slip it.

**Aha demo moment.** The demo opens the SSO epic and moves its due date from Mar 31 to Jul 15. The panel turns red: '3 promises to Acme, Globex and Initech will break'. The CSM gets a task containing the quoted original promise, a link to the October JSM reply and a drafted, honest update.

**Bonus fit.** Primary: Agents. Teamwork Graph is secondary.

**Technical risks.** Promise extraction precision; keep the human confirmation step. Scanning many comments costs LLM tokens, so pre-filter with regex. Comment-change triggers lag. The privacy framing must be about customer commitments, never rating staff.

**Judge test data.** A seed creates a JSM space with 20 requests (8 with promises written in varied phrasings), 6 epics and versions. It works on any JSM project, and with no promises found it says so and offers manual 'Record promise'.

**Deterministic core.** Regex and date-phrase pre-filtering, quarter and date normalisation, link-based matching, health-state rules (date comparisons, resolution checks) and alert triggering are deterministic. The LLM only confirms candidate promises into structured JSON and drafts the customer message.

### I40: Safety Case Pulse (GSN evidence freshness)

*Category: Specialized Industries. Rank 6 of 40, total 70.34, judge spread 3.85.*

**One-liner.** It renders an ISO 26262 / SOTIF safety argument (GSN claims, strategies and evidence) as a live Confluence macro, and colours each claim by whether its evidence in Jira and Confluence is still current.

**User and pain.** A functional-safety manager prepares a confirmation review for an ADAS feature. The safety case's 120 claims cite test reports, analyses and verification tickets, and some of those were reopened, re-baselined or rewritten after the citation. She cannot see which claims now rest on stale or suspect evidence until an assessor asks. No Marketplace app was found for 'safety case'.

**What it does.** Authors write the argument in a Confluence macro using a simple GSN text DSL (G1 > S1 > G1.1 > Sn: PROJ-123, page#section). The macro renders the tree with pure SVG. For each solution node it resolves the evidence through Jira, Confluence and TWG, and applies freshness rules: evidence item reopened or status regressed; evidence page edited after the claim was last reviewed; the test's last result older than the current SW version; the linked requirement changed; or the evidence's owner left the owning team (an ownership change only, no performance angle). Suspect status propagates upward (a goal is only as fresh as its weakest supporting branch). The agent answers 'what changed since the last review?' and creates re-review tasks per affected claim.

**Modules and APIs.** A Confluence macro (Custom UI SVG tree) and byline item, actions (GET evaluate-safety-case, GET explain-claim, CREATE create-rereview-tasks, CREATE snapshot-baseline), a rovo:agent 'Safety Case Assessor', rovo:skill (a GSN review checklist SKILL.md), rovo:mcp, TWG (work-item status, linked items, page contributors, versions), the Jira and Confluence REST version history, and Forge SQL for baselines.

**Context usage.** It joins the Confluence argument structure, Jira verification evidence, versions and statuses, the Confluence analysis pages, and TWG ownership and links. A claim's health is by definition a cross-product join.

**Aha demo moment.** The demo reopens test ticket VER-88 in Jira and refreshes the safety-case page. Solution Sn7 turns red, its parent G2.3 'Emergency braking avoids rear collision under ODD-A' turns amber, and the top goal shows '3 of 41 claims need re-review'. Hovering shows 'VER-88 reopened today by K. Ito; last passed on SW 4.10, current 4.12'.

**Bonus fit.** Primary: Agents (assessor agent plus skill). Teamwork Graph is secondary. It could also stand alone in Specialized Industries with little AI.

**Technical risks.** GSN credibility with safety judges; keep it to a simple subset and present it as 'surface evidence for a human', not certification. Overlaps the Ripple engine; it is a candidate to merge as Ripple's Specialized Industries face. The macro render must stay within 25 s for big trees, so cache in SQL and refresh asynchronously.

**Judge test data.** A seed creates one ADAS feature safety case (about 40 nodes, my own synthetic content) plus a Jira project with verification items, 3 of them pre-staled. The DSL works on any Jira keys or page links a judge types, and unresolvable evidence shows grey 'not found' rather than failing.

**Deterministic core.** DSL parsing, tree rendering, evidence resolution, all freshness rules, upward propagation and baseline diffing are deterministic and testable. The LLM only explains 'what changed' in prose and drafts re-review task descriptions.
