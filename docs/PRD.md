# PRD: Takeover Triage

**Status:** Draft v1, 2026-11-19. **Scope: APPROVED 2026-11-19** (developer sign-off on the scope cuts listed in section 8.3 and the ARCHITECTURE Review log). Owner: solo developer.
**Event:** Codegeist 2026. Hard deadline **Tue Dec 22, 2026, 3:00 pm EST**. Internal submit target **Sat Dec 19, 2026**.
**Category:** Specialized Industries (automotive). **Primary bonus:** Best Rovo Agents. **Also declared:** Best MCP (`rovo:mcp`). **Secondary:** Teamwork Graph (consume). **Marketplace bonus:** skipped (decided 2026-11-19, see section 12).

**Sources:** [research/BRIEF.md](research/BRIEF.md) (including the Critic review), [research/forge-platform.md](research/forge-platform.md), [research/rovo-mcp-twg.md](research/rovo-mcp-twg.md), [research/rules.md](research/rules.md), [ideation/TOURNAMENT.md](ideation/TOURNAMENT.md) (Option A, the I21 critic findings, and the appendix for I21, I22, I23 and I27).

**Labels used here:**
- **SPIKE:** Forge or Jira behaviour this design depends on that has not been verified yet. Each SPIKE has an owner day and a fallback. Nothing marked SPIKE is a claimed fact.
- **VERIFIED / INFERRED:** carried over from the research files.

---

## 0. Name

The working name is **Takeover Triage**, and it stays the default. "Takeover Triage+" is an internal label for the critic's mutated scope, not a product name.

Alternatives for the video and listing. Choose by Dec 1. Each needs a Marketplace and trademark check (SPIKE-N1), and none may start with "Jira", "Confluence" or "Rovo" ([BRIEF §6](research/BRIEF.md)).

| Candidate | Why it might be better | Concern |
|---|---|---|
| **Takeover Triage** (default) | It says exactly what the app does, for exactly the audience it serves. | Sounds automotive-only, which works against the generality pitch. |
| **Signal Sort** | It names the differentiator (signals, not words) and fits robots, drones and machines too. | Generic. The name may already be taken. |
| **Telltale** | A telltale is the dashboard warning lamp, and it means "the thing that gives it away". Short and memorable. | Likely trademark conflicts (games, other products). Needs a check. |
| **Event Twin** | It names the aha moment: "this event has a twin". | It is unclear without a subtitle. |

---

## 1. Problem

### The moment

It is **Monday, 8:40 am**. Over the weekend a 6-car ADAS test fleet drove highway and rural loops on two software builds. A **validation triage engineer** opens the "Takeover" queue and finds **40 new tickets**. Twenty-six of them say almost the same thing:

> "car drifted left, took over" / "drifted towards the line, I took over" / "LKA let go, took over"

Each ticket has a 20-second telemetry CSV and 1 to 4 dashcam stills. From the text alone, the engineer cannot tell:

1. **Which tickets are the same failure.** The same words cover a lane-loss in low sun on camera variant B and a late hand-back on a wide curve, which are different bugs with different owners.
2. **Which tickets look different but are the same failure.** "Steering went light near the exit" and "car drifted left, took over" can share one signal signature.
3. **Whether a failure is new on this build, or was always there and is now just being reported.** The number that answers this, km driven per build, lives in drive-session logs and not in Jira.
4. **Whether any scenario test already covers these conditions.**

What happens today, typically:
- Duplicates go to three perception engineers.
- One genuinely new failure mode sits unread in the pile for a week.
- The build owner hears "lots of lane takeovers since 4.12" with no denominator, so cannot tell whether to roll back.

Text-only duplicate finders cannot fix this, because the text is the part that carries no information ([TOURNAMENT, I21 critic findings](ideation/TOURNAMENT.md)).

### The insight

Group takeovers by **what the vehicle did**, not by what the driver typed:
- a **signal signature** from the telemetry: takeover type, peak lateral error, drift-to-takeover latency, minimum TTC, brake onset, lane-confidence dip
- **condition tags** from deterministic image metrics: glare fraction, blur, brightness for night
- **vehicle context**: sensor variant and build

Then attach the two answers a triage meeting needs: **"Is this a regression on this build, given the km driven?"** and **"Do we have a scenario test for these conditions?"**

---

## 2. Target users and personas

The personas are **composite archetypes** written for this PRD. They are not real people and they make no testimonial claims. Nothing here is based on any employer's data, processes or IP.

| Persona | Role | Goal | Pain today | What they do in the app |
|---|---|---|---|---|
| **P1: Validation triage engineer** (primary) | Owns the takeover queue for a 5 to 50 car test fleet. Runs the Monday triage. | Turn 40 tickets into about 6 to 8 well-formed problem clusters before the 10:00 triage meeting, each routed to the right team. | Reads every CSV by hand, guesses at duplicates, misroutes, and misses novel events. | Files and triages tickets, accepts, splits or reroutes cluster links, and creates scenario stubs. |
| **P2: Feature / build owner** | Leads, for example, lane keeping or perception, and owns build 4.12.x. | Know within minutes whether a cluster is a real regression on their build, and what the evidence is. | Gets anecdotes ("feels worse since 4.12") with no exposure denominator. | Reads the cluster board, the onset test and the plots, and asks the Rovo agent "which clusters started on 4.12.0?". |
| **P3: Safety engineer** (SOTIF / functional safety) | Maintains the scenario catalogue and the validation coverage argument. | Find field conditions that no scenario test covers, and close the gap with a traceable stub. | Coverage lives in a spreadsheet. Field evidence and test library are never joined. | Reads the coverage-gap view, creates scenario stubs, and follows the evidence links from each stub. |

**Secondary audiences (generality pitch, section 10):** robotics fleet operators (AMR e-stops), drone operators (failsafe and RTL events), and industrial machine reliability engineers (trips and alarms).

---

## 3. Jobs to be done

- **JTBD-1 (P1):** When a batch of takeover tickets lands, I want them grouped by what the vehicle actually did, so I can triage clusters instead of tickets.
- **JTBD-2 (P1):** When the app suggests a match, I want to see why, as numbers and side-by-side plots, so I can accept or reject it in seconds and defend the choice in the meeting.
- **JTBD-3 (P1):** When a ticket does not fit any cluster, I want it flagged as novel, so a new failure mode is not buried.
- **JTBD-4 (P2):** When a cluster grows, I want to know whether it started on a specific build and whether that is statistically real given the km driven, so I can decide on a rollback or a fix with evidence.
- **JTBD-5 (P3):** When a cluster's conditions are not covered by any scenario test, I want to create a linked scenario stub in one click, so the gap is tracked.
- **JTBD-6 (P1, P2):** When I am in Rovo Chat or an external MCP client, I want to ask cluster, regression and novelty questions that only this engine can answer, not things JQL already answers.
- **JTBD-7 (P1):** When a cluster is confirmed, I want to route it to the owning team without looking up who that is.

---

## 4. Product principles (non-negotiable)

1. **A human accepts every link.** The app proposes. It never links, splits, routes or creates an issue without a user action: a button click, or an explicit request in Rovo Chat, which is recorded with that user's accountId taken from the invocation context ([rovo-mcp-twg §2.2](research/rovo-mcp-twg.md)).
2. **Evidence, confidence and "why" on every recommendation.** Each suggestion shows links to the source issues and attachments, a confidence value with its definition, and the rule or distance that produced it.
3. **The core is deterministic.** Parsing, signatures, image metrics, clustering, the onset statistic and coverage are pure TypeScript functions with no LLM, covered by property-based tests (fast-check). Same input, same output, in any order.
4. **No LLM in the app (cut 2026-11-19).** The app has no Forge LLM (`llm` module) and no LLM features. Cluster names, symptom text and scenario-stub descriptions come from deterministic templates only (US-21). The only LLM involved is Rovo's own agent runtime, which calls the deterministic actions.
5. **Honest data.** Every seeded item is labelled `[SYNTHETIC]` in the summary, has a description banner, and its images carry a "SYNTHETIC" watermark. There are no fake users, testimonials, OEM names or real-world logos. No employer code, data or text is used.
6. **No driver scoring.** Driver identity is never a feature, and nothing ranks or rates drivers ([TOURNAMENT, I21 ethics](ideation/TOURNAMENT.md)).
7. **Not a safety-certified tool.** The app surfaces evidence for engineers and makes no safety, homologation or ISO 26262 / ISO 21448 compliance claims. That disclaimer appears in the app and in the listing.
8. **Judge-proof.** It needs no external keys and no external services. It must reach first value in **2 minutes or less** on a fresh site, with no tokens or scripts, through an in-app seed action. It must also behave sensibly on tickets that were not seeded.
9. **Platform fit.** It aims to keep the Runs on Atlassian (RoA) badge: no `external.fetch.backend` and no dynamic web triggers ([forge-platform Key fact 7](research/forge-platform.md)). The server never downloads or decodes attachments. It uses Atlassian Design System: UI Kit where possible, Custom UI where needed (file decode, canvas, SVG plots). TypeScript `strict`.

---

## 5. Solution overview

```
 Browser (Custom UI)                          Forge functions (Node 24)               Jira / Forge storage
 ---------------------------------------      -----------------------------------     ---------------------------
 Intake modal: pick CSV + 1-4 JPEGs     -->   resolver: validate + persist        --> issue (summary, description)
   column mapping, parse CSV                  (no file bytes)                         attachments (raw files, for humans;
   jpeg-js decode, <=640 px                                                            uploaded from the browser)
   signal signature + image metrics                                                   issue entity property:
   downsample telemetry (10 Hz x 20 s)                                                  tt.event v1 {signature, metrics,
                                                                                         downsampled telemetry, vehicle, build}
 Issue panel / Cluster board / Admin   <--    resolvers: cluster, onset test,     <-> KVS / Custom Entities:
   SVG plots, why-table, actions               coverage, routing                       vehicle registry, drive sessions,
                                                                                        cluster index + feature vectors, config
 Rovo agent "Fleet Triage" + rovo:skill -->   action modules (shared)             --> same pure core
 rovo:mcp (same actions)                       TWG reads asUser (routing)              Teamwork Graph (Preview) / fallback
```

**Modules (planned; key names are provisional):**

| Module | UI tech | Purpose |
|---|---|---|
| `jira:adminPage` "Takeover Triage setup" | UI Kit (ARCHITECTURE D11) | Load demo data (seed), choose the project, thresholds, team-mapping config, diagnostics (TWG, storage checks), **"Re-sync now"**. |
| `jira:projectPage` "Cluster board" | Custom UI | Clusters with counts, build onset, coverage gap, novel queue, the "File takeover" button that opens the intake modal, and **"Re-sync now"**. |
| Intake modal (from the project page and the issue action) | Custom UI | CSV + JPEG intake, column mapping, client-side computation, preview before create. |
| `jira:issuePanel` "Takeover signature" | Custom UI (SVG) | Signal plot with takeover marker, condition chips, top-3 similar events side by side, why-table, Accept / Split / Route. On open, it lazily re-processes the event if its index row is missing or stale. |
| `jira:issueAction` "Triage now" | UI Kit or Custom UI | Runs matching on demand. There is no background issue-event trigger (cut 2026-11-19). Also "Add telemetry" for non-seeded tickets. |
| `consumer` `tt-recluster` (rebuild) | none | Background re-clustering and index rebuild. Enqueued by intake and actions, by lazy panel re-processing, and by the "Re-sync now" button on the admin and project pages. Replaces the cut issue-event trigger and daily reconcile scheduled trigger. |
| `rovo:agent` "Fleet Triage" | Rovo | Uses the actions below and the skill. |
| `rovo:skill` "monday-takeover-triage" | SKILL.md | The triage playbook. Also published as an open-source SKILL.md in the repo. |
| `action` x 7 to 9 | none | The shared tool layer (section 7). |
| `rovo:mcp` "Takeover Triage MCP" | none | Exposes the same action keys as MCP tools. |

**Storage:** issue entity properties for per-event data. KVS / Custom Entities for the vehicle registry, drive sessions, the cluster index and config. **No Forge SQL** (adding it is a major-version decision; see the critic's "skip SQL") and **no Object Store** (Preview).

---

## 6. User stories and acceptance criteria

Priority: **M** = MVP (must ship by Dec 19), **S** = stretch.

### 6.1 Setup and seed

**US-01 (M) Load demo data in one click.** As a site admin judging the app, I want a "Load demo data" button so that I see the product working on my own site within 2 minutes, without tokens or scripts.
- AC1: A button on the admin page creates (or reuses) a demo project, then creates about 30 synthetic takeover issues (count varies with the seed, roughly 24–42: about 20 historical plus about 12 "Monday" events), about 10 scenario-test issues, 3 vehicles in the registry, and 40 drive-session records covering 3 builds (4.11.0, 4.11.3, 4.12.0). Exact plan: [SEED_DATA.md](SEED_DATA.md) §0.
- AC2: Each takeover issue has a generated CSV and 1 to 4 generated JPEGs attached, and a `tt.event` entity property computed by the **same** client-side code path as real intake. Nothing is precomputed or hard-coded.
- AC3: A progress bar shows the steps and counts. A failed step can be retried, and re-running the seed is idempotent: it detects an existing demo and offers "reset" or "keep".
- AC4: On a fresh demo site, the time from clicking "Load demo data" to a populated cluster board is **60 s or less** (target), on a typical connection. SPIKE-S2.
- AC5: All seeded content carries `[SYNTHETIC]` in the summary, a description banner and image watermarks, and uses the label `tt-synthetic`.
- AC6: A "Remove demo data" action deletes only items labelled `tt-synthetic`, plus the app's own storage records.
- AC7: The generator uses a fixed **seed** shown in the UI, with **seeded noise**: sensor noise, timing jitter, overlapping driver text, and 2 to 3 deliberately ambiguous events. The judge can enter a different seed, which produces a different but statistically similar fleet. This mitigates the "rigged seed" suspicion ([TOURNAMENT, Option A risks](ideation/TOURNAMENT.md)).

**US-02 (M) Works without seed.** As an admin, I can point the app at any existing project, and it works on tickets it did not create.
- AC1: Admin config lets me select project(s) and the issue type(s) treated as takeover events, defaulting to any issue carrying the `tt.event` property.
- AC2: If the project has no events, the board shows an empty state with two calls to action: "File a takeover" and "Load demo data". It never shows an error.
- AC3: SPIKE-S1: if creating a project or issue type is not permitted with the app's scopes or the user's rights, the seed falls back to an admin-selected existing project with label-based typing (`tt-takeover`, `tt-scenario`, `tt-cluster`).
- AC4: There is no background issue-event trigger and no scheduled reconcile (cut 2026-11-19). Events whose `tt.event` property was written by another tool are indexed when someone opens their issue panel (lazy re-processing), or for the whole project when a user clicks **"Re-sync now"** on the admin page or the project page, which enqueues the existing `tt-recluster` rebuild consumer.

**US-03 (M) Diagnostics.** As an admin, I want a diagnostics panel so I can see which optional capabilities work on my site.
- AC1: It shows a pass, fail or unknown state for the TWG read, the Rovo agent presence (informational), entity-property write and storage, each with a plain-language consequence ("TWG unavailable: routing uses project components").
- AC2: An empty TWG result is reported as "possibly a missing scope or no data", because missing scopes fail silently ([BRIEF §5 TWG gotchas](research/BRIEF.md)).

### 6.2 Intake

**US-04 (M) File a takeover from files.** As a triage engineer (or a safety driver), I want to upload a telemetry CSV and 1 to 4 JPEGs and get a ticket with its signature computed.
- AC1: A Custom UI modal accepts one CSV (≤ 5 MB) and 1 to 4 JPEGs (each ≤ 10 MB before downscale). Files are read with the browser File API.
- AC2: The CSV is parsed in the browser. JPEGs are decoded in the browser with a **pure-JS decoder (jpeg-js)** rather than `<canvas>`, so metrics are identical across browsers (canvas decoding and colour management vary). Frames are downscaled to ≤ 640 px for metrics.
- AC3: Before anything is created, a preview shows the signal plot, the computed takeover type, the features and the condition chips. The user can edit the free-text note, vehicle and build.
- AC4: On confirm, the app creates the issue, uploads the **original** files as attachments (for humans; SPIKE-I2), and writes the `tt.event` property: schema version, signature, metrics, downsampled telemetry (10 Hz x 20 s x up to 8 channels, quantised), vehicle id, build, the timestamp of the event, and app version.
- AC5: The server never fetches attachment content. No `api.media.atlassian.com` egress is declared ([TOURNAMENT, I21 attachment egress finding](ideation/TOURNAMENT.md)).
- AC6: Malformed input (missing columns, NaNs, non-monotonic time, a non-JPEG file) yields a specific inline message naming the row or column. Nothing is created until the input is valid or the user maps the columns.

**US-05 (M) Column mapping.** As a user with my own CSV format, I want to map my columns to the canonical channels so my files work.
- AC1: Canonical channels: `t` (s), `speed` (m/s), `yaw_rate` (rad/s), `lane_offset` (m), `steer_torque` (Nm), `brake` (0 to 1 or bar), `ttc` (s), `lane_conf` (0 to 1), and an optional `takeover` flag or a takeover time.
- AC2: The mapping auto-suggests by header name, supports unit multipliers (km/h to m/s, ms to s), and is saved per project as a reusable preset.
- AC3: Channels that are missing disable only the features that depend on them. The why-table shows those features as "n/a (channel not mapped)".
- AC4: A downloadable sample CSV and a template CSV are available from the modal.

**US-06 (M) Add telemetry to an existing ticket.** As a triage engineer with a pre-existing ticket, I want to attach signal data to it so it can join clustering.
- AC1: The issue action "Add telemetry" opens the intake in "attach to this issue" mode, and writes the property and attachments onto that issue.
- AC2: SPIKE-I3: if the browser can read existing attachment content through `requestJira`, offer "Use attached CSV/JPEG". Otherwise ask the user to re-select the local files, and explain why.

### 6.3 Signatures and conditions

**US-07 (M) Deterministic signal signature.** As a triage engineer, I want each event to get a takeover type and a feature vector computed by documented rules.
- AC1: Takeover types: `lateral-drift`, `lane-loss`, `late-brake`, `phantom-brake`, `cut-in-response`, `unknown`. Each has a documented rule with thresholds that are configurable in admin (defaults in code).
- AC2: Features (F1–F10, ARCHITECTURE §5.3): peak |lateral offset|, drift onset to takeover latency, minimum TTC, brake-onset TTC, peak deceleration, minimum lane confidence, steering-torque spike, speed at takeover, yaw-rate deviation, TTC drop rate.
- AC3: Property tests: the output is invariant to row order once sorted by `t`. Scaling units through a mapping multiplier gives identical canonical features. Adding sub-threshold noise does not change the takeover type for events away from the rule boundaries. No input can produce NaN or Infinity in the vector (they are clamped and flagged).

**US-08 (M) Deterministic image condition chips.** As a triage engineer, I want condition chips from the frames so similar conditions group together.
- AC1: Metrics per frame: mean luminance, saturated-pixel fraction (glare), variance of the Laplacian (blur), and the luminance histogram spread. Per event, the median across frames.
- AC2: Chips with thresholds: `low-sun-glare`, `night`, `blur-rain`, `normal`. Every chip shows the metric value and the threshold that fired it (for example "glare 0.071 > 0.05").
- AC3: Property tests: a uniform image produces zero Laplacian variance. Inverting brightness monotonically affects mean luminance. Metrics are identical for the same bytes on repeated runs.
- AC4: Each chip is described as "image statistics, not scene understanding". The app does not classify objects.

### 6.4 Clustering and triage

**US-09 (M) Suggest a cluster.** As a triage engineer, I want each event matched to an existing cluster, or proposed as a new one, so I triage clusters instead of tickets.
- AC1: Stage 1, **rule bucket**: takeover type x sensor variant. The build is deliberately *not* part of the bucket, so the onset test can see a cluster spanning builds. This deviates from the tournament's "type + build + sensor variant"; the rationale is recorded in ARCHITECTURE.md.
- AC2: Stage 2, **kNN within the bucket** over robust-scaled features plus condition chips (Hamming term), with fixed, documented weights.
- AC3: **Novelty threshold:** if the nearest accepted cluster's distance exceeds τ (configurable), the result is "Proposed new cluster".
- AC4: The result shows the cluster, the confidence (defined as `1 − d/τ` clamped to [0,1], displayed with that definition), and the top-3 nearest events.
- AC5: Tie-breaking is deterministic (lowest issue key). Property tests: permutation invariance of batch clustering, idempotence (re-running changes nothing), and adding an exact duplicate never creates a new cluster.
- AC6: Clusters are Jira issues labelled `tt-cluster`, so they are searchable, linkable and visible to non-app users. Their membership index lives in storage and is reconcilable from issue links.

**US-10 (M) Why this match.** As a triage engineer, I want to see why the app matched or split an event so I can trust or overrule it.
- AC1: The why-table lists each feature with this event's value, the cluster centroid's value, the per-feature distance contribution, and the rule that fired, for example "Bucket: lane-loss x cam-B", "TTC and brake-onset distance 3.2x threshold".
- AC2: Three similar events' plots are rendered side by side on the same axes, with the takeover marker aligned at t = 0.
- AC3: Every number links to its evidence: the source issue, the attachment, and the property version.

**US-11 (M) Accept / Split / Route.** As a triage engineer, I want one-click actions that write ordinary Jira data.
- AC1: **Accept** creates an issue link from the event to the cluster issue (link type configurable; defaults to "Relates" if "Duplicate" is not available on the site) and records who accepted it, and when, in the event property.
- AC2: **Split** creates a new cluster issue seeded with this event, with a deterministic name, and re-runs matching for that bucket's unassigned events. It proposes, but never moves other events automatically.
- AC3: **Route** suggests an owning team (US-15) and, on confirm, sets the configured field (component, or the Team field if available; SPIKE-R2) and adds a comment that mentions the suggested contact.
- AC4: Every action can be undone from the panel, which removes the link or reverts the field.
- AC5: Nothing in this story happens without a click.

**US-12 (M) Cluster board.** As a triage engineer, I want a project page that lists clusters so the Monday meeting runs from one screen.
- AC1: Columns: name, event count (new since the last triage), takeover type, conditions, builds seen, onset verdict, coverage verdict, owner, status.
- AC2: A **Novel queue** lists events whose best match exceeded τ.
- AC3: "Since last triage" is a timestamp the user sets with "Mark triaged". The board shows the delta since then. (This is a lite version of the I24 baseline idea.)

**US-13 (M) Graceful "not enough data" states.** As any user, I want honest states instead of fake confidence.
- AC1: An event with no `tt.event` property shows a panel state "No signal data. [Add telemetry]", with no guess based on text.
- AC2: A bucket with fewer than 2 accepted events shows "First of its kind in this bucket" rather than a match.
- AC3: An onset test without drive-session exposure for the builds shows "Exposure unknown. Add drive sessions." and no p-value.
- AC4: Coverage with no scenario-test issues shows "No scenario tests found (looked for: <JQL>)".

### 6.5 Build onset (I22 graft)

**US-14 (M) Exact Poisson onset test against real km.** As a build owner, I want to know whether a cluster's rate rose on a build, so I decide with a denominator, not anecdotes.
- AC1: Exposure comes from **drive-session records** (vehicle, build, date, km, ODD tags), either seeded, imported as CSV, or entered in the admin page. It is never a single number typed in by the judge, which was the critic's objection to I22.
- AC2: For a cluster, the app scans every boundary between consecutive builds (the order is configurable: semver or the order in the registry), compares events per km after the boundary with before it, and takes the boundary with the smallest p-value as the onset build B, with a Bonferroni correction for the number of boundaries tested (ARCHITECTURE §5.9, D6). It does not simply take the earliest build with events, because one stray event on an old build would hide a real onset.
- AC3: The test is the **exact conditional test for two Poisson rates**: given n = k₁ + k₂, k₂ ~ Binomial(n, e₂/(e₁+e₂)) under H₀. It reports the one-sided p-value, both rates per 1,000 km, and a Clopper-Pearson-derived 95% interval for the rate ratio. Worked example: 0 events in 3,100 km on 4.11.x vs 8 in 2,400 km on 4.12.0 gives p = (2400/5500)⁸ ≈ 0.0013.
- AC4: Verdict labels: "Regression likely (p < 0.01)", "Inconclusive", "No evidence of onset", "Not enough data" (n < 3, or no exposure for either side). The formula and inputs are shown on hover or expand.
- AC5: The board warns that p-values across many clusters are a **screening signal**. It applies Holm correction across the clusters on screen and shows both raw and adjusted values.
- AC6: Property tests check against a reference implementation and known closed forms: symmetry, monotonicity in k₂ and in e₁, p ∈ [0,1], and the k₁ = 0 closed form.
- AC7: "Suggest re-evaluation" drafts (but does not create until clicked) a "Re-evaluate build 4.12.0: <cluster>" issue with the evidence block, routed per US-15.

### 6.6 Routing (TWG where genuine)

**US-15 (M) Suggest the owning team.** As a triage engineer, I want the app to suggest who owns a cluster so I do not look it up.
- AC1: Admin config maps takeover type and/or component to an owning team. The team picker is backed by Atlassian Teams through the Teamwork Graph where available.
- AC2: With TWG working, the suggestion shows the team and its members (through curated queries such as `atlassianTeamMembers`), called **as the user** ([rovo-mcp-twg §2.7](research/rovo-mcp-twg.md)).
- AC3: With TWG unavailable, erroring ("not permitted to query this organization") or empty, routing falls back to the project component lead, then the project role. The UI says which source was used.
- AC4: The suggestion always shows "why": the mapping rule that matched and the data source.
- AC5: The "clusters routed to my teams" board filter (`atlassianUserInTeams`) is **deferred to stretch** (US-27, 2026-11-19). TWG team routing with fallback stays in the MVP.

**US-16 (S) Related work via TWG.** As a build owner, I want to see the work linked to the onset build (for example, issues fixed in that version, or linked PRs and deployments if the site has them) as context, with no claim of causality.
- AC1: Shown only when TWG returns data. Otherwise the section is hidden, not shown as an error.

### 6.7 Scenario coverage (I27 graft)

**US-17 (M) Coverage gap per cluster.** As a safety engineer, I want to see whether any scenario test covers a cluster's conditions.
- AC1: A cluster's **condition signature** is deterministic: takeover type x chips x sensor variant x ODD tags taken from the drive session (road type, for example).
- AC2: Scenario-test issues are found by configurable JQL (default: label `tt-scenario`, or the issue type "Test" if present). Their tags are read from labels with a `odd:` / `cond:` prefix or from a `tt.scenario` property. **No LLM tagging** (the critic's I27 objection).
- AC3: The verdict is "Covered by N tests" (with links), "Partially covered" (listing which dimensions are missing), or "0 scenario tests cover low-sun x cam-B x lane-loss".
- AC4: A small 2D gap view (condition x takeover type) shows counts of events against counts of tests. There is no 3D cube (cut).

**US-18 (M) One-click scenario stub.** As a safety engineer, I want to create a scenario-test stub from a gap.
- AC1: One click creates an issue with the tags pre-filled, links to the cluster and 3 representative events, includes a deterministic template description, and carries the label `tt-scenario`.
- AC2: The description is the deterministic template only (US-21); the user previews it before the issue is created. There is no LLM narrative (cut 2026-11-19).

### 6.8 Rovo agent, skill and MCP

**US-19 (M) Rovo agent "Fleet Triage".** As a triage engineer in Rovo Chat, I want to ask questions only this engine can answer.
- AC1: The conversation starters include "Which clusters started on 4.12.0?", "Why didn't this takeover match its nearest cluster?" (uses the issue in focus), "What's novel since I last triaged?" and "Which clusters have no scenario coverage?". Starters are static manifest text, so they never name seeded issue keys.
- AC2: Every answer cites issue keys and the numbers from the deterministic core (p-values, distances, counts). The agent prompt forbids inventing numbers, and the actions return structured evidence.
- AC3: Write actions (`link-event`, `create-cluster`, `create-scenario-stub`) run only on an explicit user request in chat. The response names exactly what was created, and the panel offers undo. Agents triggered by automation can only run GET actions (VERIFIED, [BRIEF Critic A.9](research/BRIEF.md)).
- AC4: Identity and the issue in focus are taken from `payload.context`, never from LLM-extracted inputs. All inputs are validated as untrusted.
- AC5: Each action returns within 55 s, with a target p95 of under 5 s on the seeded data. SPIKE-R3 (Rovo latency and credit cost).

**US-20 (M) Reusable skill and MCP tools.** As an engineer using Rovo Studio or Claude Code / Cursor, I want the same tools outside the app.
- AC1: `rovo:skill` "monday-takeover-triage" (SKILL.md) encodes the playbook: novel first, then regressions, then coverage gaps, then routing. It is also published as an open-source SKILL.md in the repo.
- AC2: `rovo:mcp` exposes the same action keys (at most 50 tools; name ≤ 30 chars). The demo shows one tool call from an external MCP client through `https://mcp.atlassian.com/forge/<appId>` after an admin enables exposure ([rovo-mcp-twg Key fact 4](research/rovo-mcp-twg.md)).
- AC3: MCP tools return **derived findings** (cluster ids, verdicts, counts and links), not raw TWG data. This respects the TWG no-egress intent ([BRIEF §10 #5](research/BRIEF.md)).

### 6.9 Template text (LLM cut 2026-11-19)

**US-21 (M) Deterministic names and text, no LLM.** As a user, I want readable cluster names, symptom summaries and stub descriptions that are the same on every run. (Revised 2026-11-19: the Forge LLM is dropped; this story is now template-only and MVP.)
- AC1: No Forge LLM is used anywhere: no `llm` module, no `@forge/llm` dependency, no admin toggle.
- AC2: The cluster name is `<type> · <top chip> · <sensor variant>`, for example "Lane-loss · low sun · cam-B".
- AC3: The symptom summary is a template over the deterministic signature (type, chips, variant, top features), shown next to the verbatim driver notes. Driver text is never rewritten.
- AC4: Scenario-stub descriptions use the deterministic template of US-18 (ARCHITECTURE §5.10). Names stay editable by the user (`create-cluster` `name` input).

### 6.10 Stretch

**US-22 (S) What-if thresholds page.** Sliders for τ, the rule thresholds and the chip thresholds re-run clustering live in the browser on the current data. This shows the outputs follow the numbers, which counters suspicion of a rigged seed.

**US-23 (S) Calibration context (from I23).** The vehicle registry stores the last calibration date per sensor. The panel shows the chip "calibration 41 days old" when it exceeds a configured window. The board flags clusters whose events all come from vehicles with stale calibration as "check calibration first". This is informational only, with no workflow validator.

**US-24 (S) dHash near-duplicate frames.** A perceptual hash flags near-identical frames across tickets, for example the same location on repeated drives.

**US-25 (S) Assets adapter.** Read vehicles from Jira Assets when it is present and licensed. Otherwise, use the storage registry (the default).

**US-26 (S) Drive-session CSV import.** Bulk import of drive sessions with column mapping. In the MVP, sessions are seeded or entered one by one in the admin page.

**US-27 (S) "My teams" board filter (deferred from US-15 on 2026-11-19).** A board filter "clusters routed to my teams", backed by the TWG query `atlassianUserInTeams` for the current user (asUser). Hidden when TWG is unavailable.

---

## 7. Shared action layer (agent and MCP)

Provisional keys, all backed by the same pure core:

| Action key | Verb | Returns |
|---|---|---|
| `get-cluster-for-event` | GET | The best cluster or "novel", confidence, top-3 neighbours, evidence links |
| `explain-match` | GET | The why-table rows for event vs cluster |
| `build-regression-check` | GET | The onset test for a cluster, or all clusters for a build, including Holm-adjusted p |
| `list-novel-since` | GET | Events above τ since a timestamp, defaulting to the last "Mark triaged" |
| `list-coverage-gaps` | GET | Clusters whose condition signature has 0 or partial scenario coverage |
| `suggest-owner` | GET | The team and contacts, plus the source (TWG or fallback) and the matching rule |
| `link-event` | CREATE | Creates the accepted link (explicit user request only) |
| `create-cluster` | CREATE | Split, creating a new cluster issue |
| `create-scenario-stub` | CREATE | A stub issue linked to the cluster |

---

## 8. Scope

**Scope status: APPROVED 2026-11-19.**

### 8.1 MVP (must ship by Sat Dec 19)

US-01 to US-15, US-17 to US-20, and US-21 (template-only, no LLM). Concretely:
- admin seed with progress, reset and diagnostics; project and issue-type fallback
- "Re-sync now" on the admin and project pages (enqueues `tt-recluster`) plus lazy re-processing on issue-panel open; no background triggers
- Custom UI intake with column mapping and client-side CSV and jpeg-js decoding; entity property; attachments
- signal signature rules and image chips; rule bucket + kNN + τ novelty; why-table; side-by-side plots
- Accept / Split / Route with undo; cluster board with novel queue and "since last triage"
- exact Poisson onset test with Holm and not-enough-data states; drive sessions in storage
- deterministic coverage gap + 2D view + one-click stub
- TWG routing with fallback (the "my teams" filter is stretch, US-27)
- Rovo agent + skill + rovo:mcp over the shared actions
- deterministic template names and text (US-21); no LLM
- fast-check property tests on the whole core; TypeScript strict; ADS styling; light and dark themes

### 8.2 Stretch (only after the MVP is demo-complete, in this order)

1. US-22 What-if thresholds page
2. US-23 Calibration context
3. US-16 TWG related work
4. US-26 Drive-session CSV import
5. US-24 dHash
6. US-25 Assets adapter
7. US-27 "My teams" board filter

### 8.3 Explicit cut list (will not be built for Codegeist)

| Cut | Why |
|---|---|
| JSM portal intake for safety drivers | A second product on the judges' install path, and scope ([TOURNAMENT critic](ideation/TOURNAMENT.md)). Jira-only core. |
| Forge SQL | Major-version decision, and not needed at this data volume |
| Object Store (Preview) | Attachments + entity properties suffice |
| 3D coverage cube (three.js) | "Visual over substance" risk ([I27 critic](ideation/TOURNAMENT.md)) |
| Server-side image or CSV decoding | Attachment egress is blocked (403 BLOCKED_EGRESS via api.media.atlassian.com) |
| Any ML or vision model, Forge Containers | Paid Preview, setup burden, and no image input |
| Forge LLM (`llm` module) and every LLM feature: AI cluster names, symptom normalisation, stub narratives (cut 2026-11-19) | Deterministic templates cover all three (US-21). Avoids a major-version module, billing and model retirement |
| Issue event trigger (`avi:jira:created/updated:issue`) and the daily reconcile scheduled trigger (cut 2026-11-19) | Replaced by "Re-sync now" (admin and project page, enqueues `tt-recluster`) and lazy re-processing on issue-panel open (US-02 AC4) |
| Bit-exact cross-engine math library in the seed generator (cut 2026-11-19) | Golden hashes are pinned to Node 22/24 in CI instead ([SEED_DATA §4.3](SEED_DATA.md)) |
| Detailed dashcam rendering: lens flares, headlight cones, traffic cones, overpass detail (cut 2026-11-19) | The renderer draws only what the image metrics need ([SEED_DATA §9](SEED_DATA.md)) |
| Bot-QA video-recording mode (cut 2026-11-19) | Bot-QA keeps its functional assertions; the demo is recorded by hand, Playwright screenshots optional ([DEMO_SCRIPT §5](DEMO_SCRIPT.md)) |
| LLM tagging of scenario tests | The critic's I27 objection. Tags are deterministic, from labels or properties only. |
| `rovo:agentConnector`, Forge Remote | Needs hosting and breaks RoA |
| `graph:connector` (TWG ingest) | Would need a second app (the possible "API or connector, not both" rule) |
| Jira workflow validators | Need company-managed workflows on the judges' sites |
| Covering-array scenario generation | I27 scope; one stub per gap is enough |
| Video or log ingestion beyond a 20 s CSV window and 4 stills | Payload and storage limits |
| Driver analytics of any kind | Ethics principle 6 |
| Marketplace listing and the optional Marketplace track | Skipped (decided 2026-11-19, section 12) |

---

## 9. Non-goals

- **Not a safety-certified or qualified tool.** It provides no ISO 26262 tool qualification, no ISO 21448 / SOTIF argument and no homologation evidence. It surfaces evidence for engineers to judge.
- **No autonomous actions.** A human accepts every link, split, route and stub. The agent does not write on its own initiative, and automation-triggered agents cannot write.
- **Not a data-logging platform.** It does not replace MDF4/rosbag tooling or fleet data lakes. It handles short event windows attached to tickets.
- **Not perception or scene understanding.** Image chips are pixel statistics, not object detection.
- **Not a statistics package.** One well-defined test with honest caveats, not a general reliability-growth model.
- **No real fleet data, no employer IP, no real people.** All demo data is synthetic and labelled.
- **No ranking or scoring of drivers.**

---

## 10. Generality pitch

The engine is domain-neutral. **Ticket + short time-series window + optional stills + build/firmware version + exposure denominator.** Only the rule pack and the channel mapping are automotive.

| Domain | Event ticket | Signals | Stills | Exposure | Owning team |
|---|---|---|---|---|---|
| ADAS test fleet (demo) | Takeover / disengagement | lane offset, TTC, brake, torque | dashcam | km per build | perception / planning |
| Warehouse robots (AMR) | E-stop / safety-field stop | velocity, lidar min range, localisation score | onboard camera | operating hours per firmware | navigation |
| Drones | Failsafe / RTL | altitude, GPS HDOP, battery sag, vibration | gimbal frame | flight hours per firmware | flight control |
| Industrial machines | Trip / alarm | spindle load, temperature, vibration RMS | inspection camera | machine hours per PLC version | controls |
| E-scooters / micromobility | Fall / sudden stop | IMU, wheel speed, current | none | ride km per firmware | firmware |

In the video, show the column-mapping preset for one non-automotive CSV (for example robot e-stops) to demonstrate that this is real configuration, not slideware. Configurable rule packs beyond column mapping and thresholds are **post-hackathon**.

---

## 11. Success metrics (demo and judging)

| # | Metric | Target | How measured |
|---|---|---|---|
| SM-1 | Time to first value on a fresh site: from install, to "Load demo data", to the cluster board with a regression verdict | **≤ 2 min** (seed ≤ 60 s) | A stopwatch run on a **second, clean** demo site ([BRIEF §9 item 19](research/BRIEF.md)), three times, in the week of Dec 14 |
| SM-2 | Identical-text split | 2 tickets with the identical text "car drifted left, took over" land in different clusters, with the reason visible | Scripted demo check plus a fixture test |
| SM-3 | Different-text merge | 2 tickets with different wording land in the same cluster | Same as SM-2 |
| SM-4 | Clustering quality on seeds **not used for tuning** | Adjusted Rand index ≥ 0.8 against the generator's ground truth, across 20 unseen seeds | A Vitest/fast-check harness. Thresholds are frozen before evaluation, to answer seed circularity |
| SM-5 | Onset test correctness | Matches the reference values to 1e-9 on 10,000 property cases; the worked example gives p ≈ 0.0013 | Property tests |
| SM-6 | Non-seeded ticket | A judge-made CSV (the template edited by hand) produces a sensible signature and either a match or "novel"; a ticket with no data shows the "Add telemetry" state | A manual test on a clean site |
| SM-7 | Rovo agent | All 4 conversation starters answer correctly with issue-key citations; action p95 < 5 s | A manual run on the demo site, timed |
| SM-8 | MCP | One tool call succeeds from an external MCP client | A screen recording |
| SM-9 | No LLM (revised 2026-11-19) | The manifest has no `llm` module and the code has no `@forge/llm` import; names and stub text are template output | CI manifest and dependency check |
| SM-10 | RoA and egress | `forge eligibility -e production` passes; no `fetch.backend` entries | CLI output saved in the repo |
| SM-11 | Video | Under 5:00. Split + merge land before 1:00 and the onset verdict before 2:00 (amended from "all before 1:30" to match DEMO_SCRIPT §3). Bonus modules are shown on screen. | Video timeline |
| SM-12 | Core test coverage | ≥ 90% line coverage on `core/`, 0 TypeScript `strict` errors, 0 critical/high `npm audit` findings | CI |

Post-hackathon impact metrics, stated as **hypotheses only**, are not measured in the demo: triage time per weekend batch; the share of duplicates caught before assignment; the time to detect a novel failure mode.

---

## 12. Decisions pending

| Decision | Due | Default if undecided |
|---|---|---|
| Marketplace bonus (two app IDs, KYC, review time; [BRIEF §6](research/BRIEF.md)) | **Decided 2026-11-19** | **Skipped.** Keep the code free of `license` so the Sharing link works. Primary bonus Rovo Agents; MCP also declared. |
| Primary bonus confirmed (Agents vs TWG) after the week-1 spike | Fri Nov 27 | Agents. TWG stays secondary unless the TWG reads work reliably inside actions. |
| Product name | Mon Dec 1 | Takeover Triage |
| Fall back to Option C (SOX Change Pack) if the day-1 intake spike fails without a workaround ([TOURNAMENT recommendation](ideation/TOURNAMENT.md)) | Fri Nov 27 | Continue with A |

---

## 13. SPIKE list (unverified behaviour this PRD depends on)

| ID | Question | Why it matters | When | Fallback |
|---|---|---|---|---|
| SPIKE-I1 | Whether Custom UI can write an issue entity property via `requestJira` as the user (or a resolver as the app) at our sizes. The size limit itself is now **VERIFIED: 32,768 bytes per value** (developer.atlassian.com, Jira entity properties, checked 2026-11-19). | The downsampled telemetry + metrics must fit | Day 1 (Nov 20) | Quantise to int16 + delta + base64 (estimated 3–5 KB); split into 2 properties; otherwise store telemetry in KVS (240 KiB values, VERIFIED) keyed by issue id |
| SPIKE-I2 | Can Custom UI upload attachments (multipart `FormData`, `X-Atlassian-Token: no-check`) through `requestJira`? | Raw files for humans | Day 1 | Upload the generated files through a resolver as base64 within the 500 KB invoke limit; otherwise skip attachments and keep the downsampled data plus thumbnails as data URIs inside the panel |
| SPIKE-I3 | Can the browser read existing attachment content (redirect to media) within the Custom UI CSP? | US-06 "use attached file" | Week 1 | Re-select local files |
| SPIKE-I4 | jpeg-js bundle size and decode time for 4 frames at 1080p in Custom UI | Intake latency | Day 1 | Downscale via `createImageBitmap` first and accept small cross-browser drift, recorded as a known limitation |
| SPIKE-S1 | Can the app create a project / issue type / link type on a judge's site (scopes, admin rights, team-managed vs company-managed)? | One-click seed | Week 1 | Seed into an admin-selected existing project with labels |
| SPIKE-S2 | Seed throughput: about 50 issue creates + about 120 attachment uploads + properties from the browser within Jira rate limits | SM-1 (≤ 60 s) | Week 1 | Fewer frames per seeded event; bulk create endpoint; lazy "generate attachments" after the board is visible |
| SPIKE-R1 | TWG curated queries (`atlassianTeamMembers`, `atlassianUserInTeams`) from a resolver **and** from inside a Rovo action and an MCP call | US-15, TWG bonus story | Week 1 (Nov 23–27) | Component lead / project role. TWG is shown only in the UI resolver path |
| SPIKE-R2 | Is the Jira "Team" field writable by the app on judges' sites, and in what format? | Route action | Week 1 | Component + comment mention |
| SPIKE-R3 | Rovo action latency, credit cost and write-action confirmation UX (no `confirmation` property is documented) | US-19 | Week 1 | Keep write actions; the response states the effect plus undo in the panel; document the behaviour observed |
| SPIKE-R4 | Does an app-provided `rovo:skill` attach to the agent and work on a judge's site? (Preview) | US-20 | Week 1 | Put the playbook in the agent prompt; still ship the OSS SKILL.md |
| SPIKE-L1 | **N/A (cut 2026-11-19).** Was: Forge LLM billing without a payment method, and which model ids are available | – | – | Moot: no LLM; US-21 is template-only |
| SPIKE-N1 | Name availability and trademark checks | Section 0 | By Dec 1 | Takeover Triage |

---

## 14. Risks summary

The full register, with likelihood, impact, owner and mitigation, is in **[RISKS.md](RISKS.md)**. Headlines:

1. **The browser intake path** (entity-property size, attachment upload, decode time): SPIKE-I1 to I4 on day 1. If none work and there is no workaround by Nov 27, fall back to Option C.
2. **Teamwork Graph access errors** inside actions: TWG is secondary, and routing has a fallback.
3. **Seed circularity / "rigged demo" perception:** seeded noise, user-chosen seeds, evaluation on unseen seeds (SM-4), the why-table, column mapping for the judge's own CSVs, and (stretch) the what-if page.
4. **Judge install friction** (admin rights, scopes, MCP exposure toggle): minimum scopes; diagnostics panel; written "Requires…" notes; no keys.
5. **Strong Specialized Industries rivals** (Lab QC, Clean Point, Scrutineer and others): win on the visible signal-based aha moment and on statistical honesty, not on novelty alone.
6. **Scope creep for a solo developer new to Forge:** the 2026-11-19 cuts (section 8.3) fund 2 full seed-generator days before G2; hold the cut list; the stretch order is fixed; the MVP must be demo-complete by **Fri Dec 11**.
7. **Rovo Agents is the most contested bonus:** agent actions that only this engine can answer; MCP as the alternative.
8. **Misreading the statistics:** Holm correction, "screening signal" wording, and not-enough-data states.
9. **Over-claiming safety:** the disclaimer in the app, video and listing; human-in-the-loop by construction.

---

## 15. Milestones (summary; detail in MILESTONES.md)

| Dates | Milestone |
|---|---|
| Nov 19–21 | Accounts, demo site, Devpost draft. **Day-1 intake spike** (I1–I4) on Nov 20. (Marketplace: skipped, decided Nov 19.) |
| Nov 23–27 | Rovo / MCP / TWG spike (R1–R4), seed spike (S1–S2). Bonus confirmed. Go/no-go on Option A. |
| Nov 28 – Dec 4 | Core (parse, signature, chips, cluster, Poisson) with property tests; **full seed generator (2 days, Dec 1–2)**; issue panel; **cluster board** (pulled forward, MILESTONES §1). |
| Dec 5–11 | In-app seed, "Re-sync now", actions, routing, coverage core + UI + stub, column mapping, agent + skill + MCP. **MVP demo-complete Dec 11.** |
| Dec 12–16 | Stretch in order; hardening on a clean site; setup instructions; SM-1 to SM-12 runs. |
| Dec 17–18 | Production deploy, Sharing link tested on a second clean site, video recorded and uploaded publicly. |
| **Sat Dec 19** | **Submit on Devpost.** Dec 20–22 is buffer only. |
| Jan 5 – Feb 15, 2027 | Production freeze. The link stays live. |
