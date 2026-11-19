# Demo script: Takeover Triage (4:30 video)

**Status:** Draft v1, 2026-11-19. Companion to [PRD.md](PRD.md) and [ARCHITECTURE.md](ARCHITECTURE.md).
**Target length:** 4:30. The hard limit is under 5:00, because judges do not have to watch past five minutes ([rules.md](research/rules.md)). The 30 s buffer absorbs retakes and caption timing.
**When:** rough cut on staging by **Fri Dec 11** (MVP demo-complete), final recording **Dec 17–18** on the production deploy, uploaded as **public on YouTube** before the **Sat Dec 19** submission ([PRD §15](PRD.md)).
**PRD targets this script serves:** SM-11 (video under 5:00, with the aha moment before 1:30 and bonus modules on screen), SM-2 and SM-3 (split and merge), SM-7 (agent), SM-8 (MCP).

**Labels:** **SPIKE-xx** refers to the registers in [PRD §13](PRD.md) and [ARCHITECTURE §17](ARCHITECTURE.md). Any shot that depends on an unverified behaviour names its SPIKE and gives a fallback edit in section 7.

---

## 1. Rules for every frame (non-negotiable)

1. **Synthetic badge.** Whenever seeded data is on screen, a persistent corner badge reads **"SYNTHETIC DEMO DATA: no real fleet, vehicles or people"**. The `[SYNTHETIC]` summary prefix and the frame watermarks stay visible and are never cropped out.
2. **Numbers come from the screen.** Narration and captions never state a number the app does not show in that same shot. Every `{placeholder}` below gets filled from the recorded run's `qa-report.json` and screen (section 4). If a value changes on a re-seed, the narration changes with it. Nobody edits the screen to match the narration.
3. **Disclose time compression.** Any sped-up or trimmed wait (seed progress, Rovo or MCP latency) gets a caption with the real duration, for example "Real time 47 s, shown at 4x".
4. **No fake people.** The Atlassian Team used for routing contains only the developer's own test accounts, and the caption says so. There are no testimonials, no invented customers and no OEM names or logos. No employer material appears anywhere, including desktop wallpaper, browser bookmarks and other tabs. Record in a clean browser profile.
5. **No third-party marks or music** without permission ([rules.md](research/rules.md)). Use silence or self-made or CC0 audio, with the licence kept in the repo. For the MCP client see section 7, R4. Atlassian product UI is the platform being demonstrated (INFERRED acceptable; confirm in the Devpost FAQ by Dec 1).
6. **Honest claims.** Show "Not a safety-certified tool" at least twice (in the onset segment and at the end). Impact statements are framed as hypotheses, not results ([PRD §11](PRD.md)).
7. **"Runs on Atlassian" is said only if** `forge eligibility -e production` passes on the recorded version (SM-10). Otherwise cut that phrase (section 7, R6).

---

## 2. Cast of demo objects (default seed = `DEFAULT_SEED`)

`DEFAULT_SEED` is computed by `pnpm seed pick-default` and committed with the `params-v1` tag on Dec 4 ([SEED_DATA §13.1](SEED_DATA.md)). Until then the value is unknown; do not hard-code one here. Issue keys are assigned at seed time. The seed report (admin page, ARCHITECTURE §9 item 6) lists the real keys. Fill them in here before recording.

| Role in video | Example key | Summary text (driver note) | Expected engine result |
|---|---|---|---|
| **Ticket A** (SEED P1a, Monday) | `TTDEMO-{A}` | "car drifted left, took over" | `lane-loss` (rule R-LL-1: lane_conf dips below 0.40), chip `low-sun-glare`, variant cam-B, then match to cluster "Lane-loss · low sun · cam-B" |
| **Ticket B** (SEED P1b, Monday) | `TTDEMO-{B}` | "car drifted left, took over" (word for word identical to A) | `lateral-drift` (rule R-LD-1: lane_conf stays high, slow drift on a wide curve), chip `normal`, variant cam-B, so a different bucket; matches cluster "Lateral-drift · cam-B" |
| **Ticket C** (earliest historical LC-C member, already accepted) | `TTDEMO-{C}` | "steering went light near the exit, grabbed the wheel" | Member of "Lateral-drift · cam-B"; among B's top-3 neighbours with d < τ. **C merges with B, not with A** ([SEED_DATA §7.2](SEED_DATA.md)) |
| **Novel event** | `TTDEMO-{N}` | any | `novel` (d* > τ), shown in the Novel queue and in the agent's answer |
| **Plain ticket** | `TTDEMO-{P}` | created by hand during prep, no telemetry | "No signal data. [Add telemetry]" state |
| **Flat cluster** | – | – | "Late-brake · night · cam-A": no evidence of onset (the contrast to the regression) |
| **Gap** | – | – | "0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway" |
| **Team** | "Perception (demo team)" | – | An Atlassian Team on the developer's site, containing only the developer's test accounts |

**Prep check:** the generator ([ARCHITECTURE §9](ARCHITECTURE.md)) must produce the A/B identical-text pair and the C different-text merge for the default seed. A fixture test asserts this (SM-2, SM-3). If a re-tune changes the outcome, re-pick the keys from the seed report. Do not edit the data by hand.

---

## 3. Storyboard

Narration is about 600 words, at roughly 135 words per minute, which leaves room for pauses. **Screen** names the view. **Action** says what the cursor does. Shot IDs (`S01`…) point to the capture list in section 5.

| Timecode | Screen | Action | Narration (voice-over) | On-screen caption |
|---|---|---|---|---|
| **0:00–0:07** HOOK | Jira issue list, project TTDEMO, filter "Takeover, new since last triage" (S01) | Slow auto-scroll through the {n_monday} rows. Highlighter sweeps across the repeated "car drifted left, took over" / "took over" summaries. | "Monday, 8:40. A weekend of ADAS test drives left {n_monday} new takeover tickets in the queue, on top of {n_hist} from the last six weeks. Many of them say almost the same thing." | "Monday 08:40 · {n_monday} new takeover tickets" · badge: SYNTHETIC DEMO DATA |
| **0:07–0:14** | One ticket opened, attachments strip with CSV + 3 dashcam JPEGs (S02) | Hover the CSV, then the stills. | "Each has a telemetry file and dashcam stills. From the text alone you can't tell which are the same failure, which build caused it, or whether any test covers it." | "The text is the part that carries no information" |
| **0:14–0:20** | Title card over a blurred cluster board | – | "Takeover Triage groups takeovers by what the vehicle did, not by what the driver typed." | **Takeover Triage**: cluster by signal, not by text |
| **0:20–0:32** SEED | Admin page "Takeover Triage setup" (S03, S04) | Click **Load demo data** (`DEFAULT_SEED` visible). Progress steps tick: vehicles, drive sessions, scenario tests, events, board ready. | "On a fresh site it's one button. No tokens, no scripts. The app generates a synthetic fleet, with drive sessions, tickets, CSVs and images, and runs every file through the same intake code as real uploads." | "Real time {t_seed} s, shown at 4x" · "Every generated item is labelled [SYNTHETIC]" · "Try any seed: different fleet, same statistics" |
| **0:32–0:46** AHA 1 | Ticket A, issue panel "Takeover signature" (S05) | Plot draws with the takeover marker at t = 0. Cursor rests on the lane-confidence trace, then the chip `low-sun-glare {glare_A} > 0.05`. The result card reads "Lane-loss · low sun · cam-B, confidence {conf_A}". | "Ticket A: 'car drifted left, took over.' The signals show lane confidence collapsing to {laneconf_A} in low sun, on camera variant B. That's the lane-loss cluster." | "Image chips = pixel statistics, not scene understanding" |
| **0:46–0:54** AHA 2 | Ticket B panel, split screen with A's summary line (S06) | Result card: "Lateral-drift · cam-B". The bucket rule row is highlighted. | "Ticket B is word-for-word identical. But lane confidence never dropped. It's a slow drift on a wide curve: a different bug for a different team." | **Same text → different clusters** |
| **0:54–1:00** AHA 3 | Ticket B panel, top-3 neighbour plots side by side, aligned at t = 0 (S07) | The plots of B, its neighbour C and the cluster medoid overlay. C's summary line is highlighted. | "And its nearest neighbour, ticket C, uses completely different words: 'steering went light near the exit'. Its signals overlay B's. Same cluster." | **Different text → same cluster** |
| **1:00–1:14** WHY | Ticket B why-table (S08) | Hover the feature rows (value, cluster reference, contribution). Hover the "d* {d_B} < τ 1.00" headline. Click one evidence link: the source issue opens via the Forge router (the iframe cannot open pop-ups, ARCHITECTURE §14), then navigate back. | "Every suggestion shows its reasons: each feature, its share of the distance, the rule that fired, and links back to the source data. Confidence has a definition, and it's on screen." | "confidence = 1 − d*/τ = {conf_B}" |
| **1:14–1:22** | Same panel (S09) | Click **Accept**. A toast reads "Linked {B} → {cluster key}". Point at **Undo**. | "Nothing is linked until a human clicks, and every action can be undone." | "The app proposes. You decide." |
| **1:22–1:40** ONSET | Project page "Takeover clusters" (cluster board) (S10, S11) | Pan across the rows: {n_clusters} clusters, the onset and coverage columns, the novel queue. Expand "Lane-loss · low sun · cam-B": per-build bars of events per 1,000 km, with the onset build marked. | "{n_events} tickets, {n_clusters} clusters. Now the build owner's question: is lane-loss new on 4.12.0, or just reported more? The app joins events with kilometres driven per build, from drive-session records." | "Exposure: drive sessions, cam-B vehicles only" |
| **1:40–1:52** | Expanded onset card (S12) | Hover the verdict chip, then expand "How is this computed?" (formula, k₁/e₁, k₂/e₂, boundaries tested, Holm family size). | "{k1} events in {e1} kilometres before, {k2} in {e2} after. An exact Poisson test, corrected across builds and clusters: regression likely, p {p_holm}." | "Exact conditional Poisson test · p_raw {p_raw} · p_holm {p_holm} · screening signal, not causal proof · not a safety-certified tool" |
| **1:52–1:58** | Board row "Late-brake · night · cam-A" (S13) | Point at its verdict. | "Late-brake at night? A steady rate across builds. No evidence of onset, so nobody rolls back for it." | "No evidence of onset · p_holm {p_holm_flat}" |
| **1:58–2:18** COVERAGE | Coverage gap view (2D grid: conditions x takeover types) (S14, S15) | Red cell lane-loss x low-sun-glare. Tooltip: "0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway". Click **Create scenario stub**. Preview: template text, labels, 3 representative events. Click **Create**. The new issue opens with its labels and links. | "Does any scenario test cover this? The app compares the cluster's conditions with the tags on your scenario-test issues. Nothing covers it. One click drafts a stub, with the tags filled in and the evidence linked, so the gap is tracked." | "Deterministic tags from labels, no AI tagging" · "Created {stub_key}" |
| **2:18–2:34** ROUTE (TWG) | Cluster panel, **Route** (S16, S17) | Click **Route**. The suggestion card reads "Perception (demo team)", with "Source: Teamwork Graph, as you" and "Rule #1: lane-loss → Perception" (SEED_DATA §12). Hover the member list. Click **Confirm**: the component is set and a comment mentions the contact. Then a 2 s cut to Diagnostics: "TWG unavailable → component lead fallback", captioned "simulated on staging". | "Who owns it? The app asks the Teamwork Graph, as you, for the team behind the routing rule and its people. If the graph isn't available on your site, it falls back to the project's component lead, and it always tells you which source it used." | "Team members are the developer's test accounts" · "Source shown on every suggestion" |
| **2:34–2:50** YOUR DATA | Board → **File takeover** modal (S18, S19), then plain ticket (S20) | Drop `my-takeover.csv` (the template, edited by hand, speed in km/h) plus 2 JPEGs. Column mapping auto-suggests, with the km/h multiplier applied. The preview shows the plot, type and chips. Click **Create**: the result is a match or novel. Cut to ticket {P}: "No signal data. [Add telemetry]". | "It works on your own files, not only the demo. The CSV and images are decoded right here in the browser. The server never downloads attachments. A ticket with no data says so, instead of guessing from text." | "Decoded in your browser · only derived numbers are stored" |
| **2:50–3:05** ROVO AGENT | Rovo Chat, agent **Fleet Triage** (S21) | Click the starter "Which clusters started on 4.12.0?". The answer lists cluster keys with p_raw and p_holm, rates per 1,000 km and the caveat. | "In Rovo Chat, the Fleet Triage agent answers the questions only this engine can: which clusters started on 4.12.0. Every number comes from the same deterministic actions you just saw." | "Rovo agent + actions + skill" · "Numbers match the board: p_holm {p_holm}" · "Response wait trimmed: real {t_rovo1} s" |
| **3:05–3:15** | Rovo Chat (S22) | Type "What's novel since I last triaged? Why didn't it fit?". The answer names `TTDEMO-{N}`, with d* vs τ and the top contributors. | "What's new since last triage, and why didn't it fit any cluster? The agent cites the issue and the distances." | "Skill: monday-takeover-triage" |
| **3:15–3:25** | Rovo Chat → issue panel (S23) | Type "Link {A} to the lane-loss cluster." The agent restates the change and asks "Shall I do it?". Type "Yes". It replies "Created link…, Undo is in the panel." A 2 s cut to the panel shows the link and the Undo button. | "Writes happen only when you ask. The agent restates the change, waits for a yes, and tells you exactly what it did." | "Explicit request → confirm → write · undo in panel" |
| **3:25–3:45** MCP | Admin › Connected apps › Tools exposure (1 s, S24), then an external MCP client (S25, S26) | Show the tools toggle enabled. In the client: connect to `https://mcp.atlassian.com/forge/<appId>`, list 9 tools, call `build-regression-check` with `build = 4.12.0`. Highlight `headline`, `pHolm` and `evidence[0].url` in the JSON. | "The same tools are exposed over MCP. An admin switches them on, and any MCP client, your coding assistant or an inspector, can call them with your Jira permissions. Same engine, same answer, same evidence links." | "rovo:mcp · same 9 actions · p_holm {p_holm} (matches board)" · "Wait trimmed: real {t_mcp} s" |
| **3:45–4:05** ARCHITECTURE | Animated diagram (S27, built from ARCHITECTURE §1) | Blocks light up in narration order: Browser decode → derived JSON → Forge functions → Jira properties + links (source of truth) + Forge storage index → shared action layer ← Rovo agent / MCP → TWG (as user, fallback). | "Under the hood: files are decoded in the browser, so the server never touches attachments and makes no external calls. One pure TypeScript engine, property-tested with fast-check, runs in the browser, the functions, the seed and the tests. Jira holds the truth. The UI, the agent and MCP share one action layer. There's no LLM in the app: names and stub text come from templates." | "Forge · Runs on Atlassian (if eligible, see rule 7) · no egress · deterministic core · no LLM, template text" |
| **4:05–4:25** IMPACT + GENERALITY | Board "since last triage" delta (S28), then the column-mapping modal with a synthetic warehouse-robot e-stop CSV (S29) | Board: "Mark triaged" timestamp and the {n_clusters}-cluster summary. Then map the robot CSV columns (`v_mps`, `lidar_min_m`, `loc_score`) to canonical channels and save as a preset. | "For a triage engineer, that's a weekend's tickets turned into a few evidence-backed clusters before the ten o'clock meeting. That's our hypothesis to measure with real teams. And nothing here is car-specific: a ticket, a short signal window, a build, an exposure denominator. Here's a warehouse-robot e-stop log mapped to the same engine. Only the rule pack is automotive." | "Impact = hypothesis, not a measured result" · "Robots · drones · industrial machines (rule packs post-hackathon)" · "Synthetic robot CSV" |
| **4:25–4:30** CLOSE | End card | – | "Takeover Triage. Triage what the vehicle did." | "Install link + open-source SKILL.md in the description · All demo data synthetic · Not a safety-certified tool · Built for Codegeist 2026" |

**Aha check (SM-11):** split at 0:54 and merge at 1:00 meet the "by 0:60" goal. The onset verdict lands at about 1:50, which misses the PRD's "split + merge + onset before 1:30". **Decision needed:** either accept 1:50, or move the onset card (S12) into 1:22–1:30 and shorten the WHY segment to 8 s. The default is to keep this order, because the why-table builds trust before the statistic, and to amend SM-11 to "onset before 2:00".

---

## 4. Values to fill from the recorded run

Fill each value from `qa-report.json` (ARCHITECTURE §16.3, item 10) and from the screen of the take that gets used. The illustrative values come from the engine fixture (ARCHITECTURE §5.9) and **must not** be narrated unless the recorded screen shows them.

| Placeholder | Source | Illustrative |
|---|---|---|
| `{t_seed}` | qa-report `t_seed` | ≤ 60 s (target) |
| `{A}`, `{B}`, `{C}`, `{N}`, `{P}` | seed report | – |
| `{n_monday}`, `{n_hist}`, `{n_events}` | board "new since last triage" count, history count, total | ≈ 12, ≈ 20, ≈ 32 ([SEED_DATA §7.3](SEED_DATA.md)) |
| `{glare_A}`, `{laneconf_A}`, `{conf_A}`, `{d_B}`, `{conf_B}` | panel | 0.071, 0.22, 0.78, 0.21, 0.79 |
| `{n_clusters}` | board | 4–5 (4 latent clusters + whatever the engine proposes) |
| `{k1}`, `{e1}`, `{k2}`, `{e2}` | onset card | 0, ≈ 2,560 km, ≈ 9, ≈ 1,760 km (cam-B exposure, SEED_DATA §6.2, §7.3) |
| `{p_raw}`, `{p_holm}` | onset card | ≈ 3.1e-4 raw, ≈ 6.2e-4 after the m = 2 boundary scan, ≈ 2.5e-3 after Holm over 4 clusters (SEED_DATA §7.3 worked expectation) |
| `{p_holm_flat}` | board | > 0.10 |
| `{stub_key}` | created issue | – |
| `{t_rovo1}`, `{t_mcp}` | stopwatch during the take | – (SPIKE-R3) |

---

## 5. Shot list (recorded by hand)

**Decision 2026-11-19:** bot-QA keeps its functional assertions but has **no video-recording mode** (no `--video`, `recordVideo`, `slowMo` or cursor overlay). Every shot below is **recorded by hand** with OS screen capture at 1920x1080, in a clean browser profile with a fixed light theme and zoom, with Jira onboarding spotlights and notifications dismissed first. Each shot is a separate short take, so a single retake is cheap.

**Optional:** a small Playwright script on the bot-QA harness (`tools/bot-qa`, ARCHITECTURE §16.3: same `storageState`, `data-testid` selectors and `frameLocator`) may capture **screenshots** for the stills and the Devpost gallery, and can pre-check each shot's setup state. It never records video.

"Steps" are what the presenter does by hand; the testids are listed so the optional screenshot script and bot-QA can find the same elements. "clip" = hand-recorded screen capture; "still" = screenshot (by hand or the optional Playwright script).

| Shot | Used at | Setup state | Steps (testids are provisional) | Capture |
|---|---|---|---|---|
| S01 | 0:00 | seeded, Monday events unassigned | Open the issue list via JQL `project = TTDEMO AND labels = tt-takeover AND ttOccurred >= "<triaged mark>" ORDER BY ttOccurred DESC`, then smooth-scroll. All seeded issues share one `created` time, so the filter uses the indexed event time (`ttOccurred`, ARCHITECTURE §2.2; SPIKE-E1). Fallback: open the board's "new since last triage" list instead | clip 8 s |
| S02 | 0:07 | – | Open a ticket and hover the attachments strip | clip 6 s |
| S03 | 0:20 | **fresh** (Remove demo data + Reset app storage, then reinstall on staging) | Admin page: fill the seed, click `tt-seed-start` | clip, real time (sped up in edit) |
| S04 | 0:20 | – | Wait for `tt-seed-progress[data-state=board-ready]`; take `t_seed` from a stopwatch (cross-check with bot-QA's `qa-report.json`) | still + timing |
| S05 | 0:32 | – | Open {A}, wait for `tt-panel-plot`, hover `tt-chip-low-sun-glare`, hover `tt-result-card` | clip 14 s |
| S06 | 0:46 | – | Open {B}, highlight `tt-why-bucket-rule` | clip 8 s |
| S07 | 0:54 | – | On {B}, scroll to `tt-neighbours-plots`, highlight the {C} plot | clip 6 s |
| S08 | 1:00 | – | Hover `tt-why-row-*` in order, hover `tt-why-headline`, click `tt-evidence-link-0` | clip 14 s |
| S09 | 1:14 | {B} unlinked | Click `tt-accept`, wait for the toast, hover `tt-undo`; **after recording**, click Undo to restore the state | clip 8 s |
| S10 | 1:22 | – | Open the project page "Takeover clusters", pan the table | clip 8 s |
| S11 | 1:30 | – | Expand the lane-loss row, wait for `tt-onset-bars` | clip 10 s |
| S12 | 1:40 | – | Hover `tt-onset-verdict`, click `tt-onset-howto` | clip 12 s |
| S13 | 1:52 | – | Hover the late-brake row verdict | clip 6 s |
| S14 | 1:58 | no stub yet for the gap | Open `tt-coverage-grid`, hover the red cell | clip 8 s |
| S15 | 2:06 | – | Click `tt-create-stub`, wait for the preview, click `tt-stub-confirm`, open the created issue | clip 12 s |
| S16 | 2:18 | TWG team mapped in admin | Click `tt-route`, wait for `tt-route-source[data-source=twg]`, hover the members | clip 10 s |
| S17 | 2:30 | admin TWG diagnostics in the fallback state (dev toggle "simulate TWG error" on **staging only**, shown as such) | Open Diagnostics, highlight the fallback row | still / clip 3 s |
| S18 | 2:34 | – | Click `tt-file-takeover`, `setInputFiles` with the edited template CSV + 2 JPEGs | clip 8 s |
| S19 | 2:42 | – | Check the mapping suggestions, click `tt-intake-create`, wait for the result | clip 6 s |
| S20 | 2:48 | {P} exists without a property | Open {P}, show `tt-panel-empty` | clip 3 s |
| S24 | 3:25 | admin enabled MCP tools | Admin › Apps › Connected apps › Takeover Triage › Tools (Atlassian admin UI; selectors are not ours, so make it best-effort) | still |
| S28 | 4:05 | – | Board header "since last triage" delta | clip 5 s |
| S29 | 4:12 | synthetic robot CSV in fixtures | File takeover modal, map columns, save the preset | clip 10 s |
| Gallery | – | – | Stills of the panel, board, onset card, coverage grid, route card, intake preview and diagnostics, for the Devpost image gallery | stills (2x DPR) |

**Shot-specific notes (all by hand, OS screen capture, no audio):**
- **S21–S23 Rovo Chat.** Responses vary and the latency is unknown (SPIKE-R3). Record 3 to 5 takes and pick the one whose numbers match the board. The bot-QA step 9 soft check runs first, to confirm the agent answers correctly.
- **S25–S26 MCP client.** Record a terminal session (fixed font, 120x32) or the MCP Inspector web UI.
- **S27 architecture animation.** Build an SVG from ARCHITECTURE §1 and animate it in a small HTML page; screen-record that page by hand.
- **Title and end cards.** Use the editor.

---

## 6. Bonus-evidence moments (show the specifics on screen; [rules.md](research/rules.md))

| Prize | Moment(s) | What must be visibly on screen | Devpost text pointer |
|---|---|---|---|
| **Specialized Industries** (category) | 0:00–1:58 | An ADAS takeover queue, signal plots, the build-exposure statistic, scenario coverage (SOTIF vocabulary used carefully) | Problem, personas ([PRD §1–2](PRD.md)) |
| **Best Rovo Agents** (primary) | 2:50–3:25 | The agent name "Fleet Triage" in Rovo Chat; a starter clicked; the answer citing issue keys and p-values; the explicit-confirmation write; the skill name `monday-takeover-triage` (caption, or the agent's config page in Studio if SPIKE-R4 passes) | Agent prompt rules, action list, skill (ARCHITECTURE §10) |
| **Best MCP** (also declared) | 3:25–3:45 | The admin tools-exposure toggle; the tool list from `mcp.atlassian.com/forge/<appId>`; one `build-regression-check` call returning the same `pHolm` as the board | ARCHITECTURE §10.4 |
| **Teamwork Graph** (secondary) | 2:18–2:34 | "Source: Teamwork Graph, as you" on the route card; team members; the diagnostics fallback row. Never claim TWG data flows out through MCP: actions return the team name only (D8) | ARCHITECTURE §11 |
| Technological Implementation (criterion 1, first tie-breaker) | 0:20, 2:34–2:50, 3:45 | One-click seed on a fresh site, the judge's own CSV, the not-enough-data state, the deterministic core and fast-check. Counters "single hardcoded demo path" ([rules.md §7](research/rules.md)) | Testing strategy, SM-4 results on unseen seeds |
| Design (criterion 2) | 0:32–2:50 | One coherent flow across panel, board, coverage grid, route card and intake, in ADS styling; undo on every write; honest empty states | Screenshots gallery; PRD §4 principles |
| Potential Impact (criterion 3) | 0:00–0:20, 4:05–4:25 | A named audience (validation triage engineer, build owner, safety engineer) and a concrete Monday-morning pain; impact stated as a hypothesis | PRD §1–2, §11 hypotheses |
| Innovation / Idea (criterion 4) | 0:46–1:00, 1:40–1:52 | Clustering by signal, not text (same text → different clusters, different text → same cluster), and an exposure-normalised onset test, which text-based rivals cannot show | PRD §1 insight; RISKS R-13 |
| Presentation (criterion 5) | whole video | Problem in the first 20 s, end-to-end working app, no slideware except the architecture animation; under 5:00 | – |

---

## 7. Risk-driven fallback edits

| ID | If this fails | Fallback edit (keep total ≤ 4:30) |
|---|---|---|
| R1 | Seed exceeds 60 s or is flaky (SPIKE-S2, S3) | Keep the 12 s segment and caption the true time. If it exceeds 2 min, say "about two minutes" and do not claim 60 s. |
| R2 | TWG fails in the resolver (SPIKE-R1, T1) | Show the component-lead fallback as the main path (S17 becomes S16). Drop TWG from the bonus claims; the narration says "uses the Teamwork Graph where your site supports it". |
| R3 | `rovo:skill` doesn't attach (SPIKE-R4) | Drop the skill caption. Say "playbook built into the agent; also published as an open-source SKILL.md". |
| R4 | Showing a named third-party MCP client is a trademark risk (rules: no third-party marks without permission) | Default to the open-source **MCP Inspector** or a plain terminal with no product logos, and narrate "any MCP client". Show the `claude mcp add …` command only if Devpost guidance allows naming it. **Decide by Dec 1.** |
| R5 | MCP exposure isn't available on the recording site, or the call fails (SPIKE-A2) | Show the tool list and a call from the Rovo Studio action tester instead. Drop the "Best MCP" claim from the video and description. |
| R6 | `forge eligibility` fails | Remove "Runs on Atlassian" from S27 and its caption. Keep "no external egress" only if it is still true. |
| R7 | Rovo latency over 20 s per answer | Trim the waits with captions (rule 3). Cut the 3:05 novel question and give its 10 s to MCP. |
| R8 | Split/merge pair changes after a re-tune | Re-pick A/B/C from the seed report. Never hand-edit the data. |
| R9 | Seed attachments cut or failing (SPIKE-I2 server side; MILESTONES cut #5) | S02 shows a ticket filed through the intake modal (which uploads from the browser) instead of a seeded one, or shows the panel thumbnails with the caption "raw files kept as thumbnails in this build". |

---

## 8. Consistency notes for PRD / ARCHITECTURE (to reconcile)

1. **RESOLVED 2026-11-19 (review):** PRD SM-11 amended to "split/merge before 1:00, onset before 2:00". Original note: **SM-11** said the onset verdict should land before 1:30. This script lands it at about 1:50 (see the aha check in section 3). Proposal: amend SM-11 to "split/merge before 1:00, onset before 2:00".
2. **RESOLVED 2026-11-19 (review):** ARCHITECTURE §16.3 steps 3–4 now assert P1a/P1b by bucket rule (F6/F2) and P3a/P3b by F3/F4, and the merge as B ↔ C (lateral-drift). Original note: **ARCHITECTURE §16.3 step 3** expected ticket B's why-table to show TTC/brake as top contributors. In this script B differs by **bucket rule** (lateral-drift vs lane-loss: lane confidence stays high). Pick one archetype for the generator and align the bot-QA assertion. This script assumes the bucket-rule split, because it matches the PRD §1 "late hand-back on a wide curve" story.
3. **RESOLVED 2026-11-19 (review):** starter replaced with "Why didn't this takeover match its nearest cluster?" in PRD US-19 and ARCHITECTURE §2.2. Original note: the **PRD US-19 starter** "Explain why ADAS-312 was split from ADAS-311" uses an `ADAS` key, but the seed project is `TTDEMO`. Make the starter generic or use the seeded keys.
4. **RESOLVED 2026-11-19 (review):** added to ARCHITECTURE §11 Diagnostics. Original note: **S17** needs a staging-only "simulate TWG error" diagnostic toggle, which is not yet in ARCHITECTURE §11. Add it to the dev-flagged admin actions, hidden in production.
5. **S29** needs a synthetic robot e-stop CSV fixture and no new rules. The engine types it as `unknown` with `insufficient-channels` unless it maps `lane_offset`/`ttc`/`brake`. The narration only claims the mapping, not the clustering.
