# Milestones: Takeover Triage

**Status:** Draft v1, 2026-11-19; re-planned for the scope **APPROVED 2026-11-19** (PRD §8, section 3a below). Owner: solo developer.
**Window:** Thu Nov 19 → Tue Dec 22, 2026 (hard deadline **3:00 pm EST / 12:00 pm PT**). **Internal submit: Sat Dec 19.** Dec 20–22 is buffer only.
**Sources:** [PRD.md](PRD.md) (§6 stories, §8 scope, §12 decisions, §13 SPIKEs, §15 milestone summary), [ARCHITECTURE.md](ARCHITECTURE.md) (§4 repo, §9 seed, §16 testing/CI, §17 SPIKE register), [DEMO_SCRIPT.md](DEMO_SCRIPT.md), [research/BRIEF.md](research/BRIEF.md) §3 and §9, [research/rules.md](research/rules.md).

**Conventions**
- **USER ACTION:** a step only the developer (a human with the accounts) can do: accounts, tokens, consent screens, admin toggles, decisions, clicking Submit. These are bold so they can be grepped.
- **SPIKE-xx:** IDs from [ARCHITECTURE §17](ARCHITECTURE.md#17-spike-register). A SPIKE is *closed* only when its result (pass, fail or "fallback adopted") is written into the SPIKE log (`docs/SPIKES.md`, created Nov 20) with evidence (CLI output, screenshot or recorded fixture). Nothing is promoted to VERIFIED from memory.
- **Gate:** a dated check with a pass condition. Missing a gate starts the scope-cut rule (section 4).
- **Planning unit (ASSUMPTION):** one working day ≈ 6 focused hours. Weekends are working days at reduced load, and each week has one explicit buffer day. If real capacity is lower, the buffers absorb it first, and then the cut rule applies.
- **End-of-day ritual (every working day, 15 min):** commit, CI green (or a written reason), one line in `docs/SLIP_LOG.md`: `date | planned | done | slip (days, cumulative, critical path only)`.

---

## 1. Weekly goals at a glance

| Week | Dates | Goal | Exit gate |
|---|---|---|---|
| **W1** | Thu Nov 19 – Fri Nov 27 | Accounts, demo site, hello-world deploy + install, **all spikes**, and a vertical slice: upload one ticket → issue panel shows trace + chips | **G1, Fri Nov 27:** go/no-go on Option A; scopes frozen; primary bonus confirmed |
| **W2** | Sat Nov 28 – Fri Dec 4 | Engine complete (signal, image, similarity, clustering, onset) with property tests; **2 full seed-generator days (Dec 1–2)**; issue panel complete; cluster board; Accept / Split | **G2, Fri Dec 4:** seeded-from-disk data clusters correctly on the board (SM-2, SM-3, SM-4 green in CI) |
| **W3** | Sat Dec 5 – Fri Dec 11 | Rovo agent + actions + skill, `rovo:mcp`, TWG routing with fallback, in-app seed button, "Re-sync now", coverage core + gap UI + stub, Route, column mapping, bot-QA (functional), code review | **G3, Fri Dec 11:** **MVP demo-complete** on staging (PRD §8.1); first production deploy and Sharing link created |
| **W4** | Sat Dec 12 – Fri Dec 18 | Polish, accessibility, theming, judge setup docs, fresh-site install test, **Dec 15 dry run**, video | **G4, Fri Dec 18:** video public on YouTube; SM-1…SM-12 recorded; Devpost entry complete except the Submit click |
| **Submit** | **Sat Dec 19** | Submit on Devpost (more than 48 h, about 3 days, before the deadline) | Confirmation email/screenshot saved |
| Buffer | Sun Dec 20 – Tue Dec 22 | Buffer only. No new features. | – |

**Reconciliation with [PRD §15](PRD.md#15-milestones-summary-detail-in-milestonesmd):** the dates and gates match. The **cluster board** is pulled forward into W2 (PRD had it in Dec 5–11). After the 2026-11-19 re-plan (section 3a), the coverage engine part moves to W3 next to its UI + stub, and W2 holds 2 explicit full seed-generator days. PRD §15 is updated to match.

---

## 2. Critical path

The grand-prize path (an app that installs from a Sharing link, seeds itself and shows the aha moment) is:

```
token + forge login ─► demo site ─► hello-world deploy/install ─► SPIKE-I1/I2/I4/C1/C2/M1/M2 (Nov 20)
  ─► tt.event schema + codec FROZEN (Nov 24) ─► vertical slice (Nov 25–27) ─► G1 go/no-go + scope freeze (Nov 27)
  ─► engine signal/image/similarity (Nov 28–30) ─► FULL SEED GENERATOR (Dec 1–2) ─► cluster + onset (Dec 3)
  ─► panel complete + board (Dec 4, G2) ─► in-app seed consumer (Dec 5–7; SPIKE-S1/S2/S3) ─► MVP demo-complete (Dec 11)
  ─► production deploy + Sharing link (Dec 11) ─► clean-site install test (Dec 14) ─► dry run (Dec 15)
  ─► video (Dec 17–18) ─► Devpost submit (Dec 19)
```

The **bonus path** (Rovo Agents primary, MCP, TWG) runs beside it: spikes in W1 (Nov 23–25), build in W3 (Dec 7–10). It is not on the grand-prize path, but its **scope freeze on Nov 27** is, because a scope added after the production install forces judges through re-consent, and a scope added after Dec 11 is not allowed (section 5).

**Float:** the critical path has 4 buffer days before Dec 19 (Nov 22, Nov 29, Dec 13, Dec 16) plus the half-day buffers marked below. Dec 20–22 is **not** counted as float; it exists for platform outages, Devpost problems and an emergency re-record only.

**Longest-lead external dependencies (start early, they wait on others):**
1. Scoped API token and demo site (Nov 19). Everything depends on them.
2. A **second, clean site** for the judge-flow test (requested Nov 21, needed Dec 11). The demo-site provisioning limit per account is not known. SPIKE-X1 below.
3. Forum or CDAC answers if TWG says "not permitted to query this organization" (post by Nov 24; US Thanksgiving Nov 26–27 will slow replies, INFERRED).
4. A YouTube account that can publish a public video (< 5 min, so no long-video verification is needed, INFERRED) must exist by Dec 14.

---

## 3. Day-by-day plan

Each day lists **deliverables** (things that exist at day end and can be checked) and the stories or SPIKEs they serve. "DoD" = definition of done for that day.

### Week 1 — Thu Nov 19 → Fri Nov 27: setup, all spikes, vertical slice

**Thu Nov 19 — Accounts and toolchain**
- **USER ACTION:** confirm eligibility (country not excluded; employer has no Atlassian/Devpost conflict and employs no judge; no employer IP will be used) ([rules.md §2, §4](research/rules.md)). Write one line in `docs/ELIGIBILITY.md` (private notes, not committed if it contains personal details).
- **USER ACTION:** join Codegeist 2026 on Devpost, open "Enter a Submission", save an empty draft, and screenshot every required field ([BRIEF §9 item 2](research/BRIEF.md)).
- **USER ACTION:** create an **Atlassian API scoped token** with Forge selected (https://id.atlassian.com/manage-profile/security/api-tokens). Store it in a password manager. Never paste it in chat or commit it.
- Install Node 24 (or 22) + pnpm; `npm i -g @forge/cli@15`; `forge settings set usage-analytics false`.
- **USER ACTION:** `forge login` (or export `FORGE_EMAIL` / `FORGE_API_TOKEN` on a headless box); `forge whoami` output saved.
- **USER ACTION:** `forge site provision` to create the Rovo-enabled demo site; note the site URL and expiry date (about 90 days, INFERRED expiry ~mid-Feb 2027).
- **USER ACTION:** create a private GitHub repo `takeover-triage`; add `FORGE_EMAIL` and `FORGE_API_TOKEN` as Actions secrets.
- Repo skeleton per [ARCHITECTURE §4](ARCHITECTURE.md#4-repository-and-folder-structure): pnpm workspace, `tsconfig.base.json` (strict + flags), eslint with engine purity rules, Vitest + fast-check pinned, empty `ci.yml`.
- DoD: `forge whoami` works; demo site reachable; repo CI runs typecheck + test on an empty engine.

**Fri Nov 20 — Hello world + day-1 intake spikes (critical)**
- `forge create` (Jira, Custom UI) → `forge deploy -e development` → `forge install --site <demo> --product jira`. A `jira:issuePanel` shows "hello".
- SPIKE-M1: `forge lint` against the illustrative manifest of [ARCHITECTURE §2.2](ARCHITECTURE.md#22-illustrative-manifest); record each property that lint rejects.
- SPIKE-M2: import a trivial function from `packages/engine` through the pnpm workspace and deploy. Fallback: `tsup` dist + `file:` deps.
- SPIKE-C1: Atlaskit button in Custom UI; check whether `unsafe-inline` styles are needed; run `forge eligibility -e development`.
- SPIKE-C2: `Modal` from `@forge/bridge` opens a second resource from a project page.
- SPIKE-C3: a Web Worker loads inside Custom UI under the CSP.
- SPIKE-I4: jpeg-js decode of 4 × 1080p JPEGs in the worker; record time and gz bundle size.
- SPIKE-I1: PUT issue entity properties of 8, 16, 31 and 33 KB from Custom UI (`requestJira` asUser) and from a resolver (asApp); record the exact limit and error text.
- SPIKE-I2: upload 1 CSV + 1 JPEG as attachments from Custom UI (multipart, `X-Atlassian-Token: no-check`) **and** from the backend `asApp().requestJira` (the seed needs this).
- Create `docs/SPIKES.md` with a row per SPIKE: date, result, evidence link, adopted fallback.
- DoD: all nine rows above have a result. **If I1, I2 (browser) and I4 all fail with no workaround, raise it today**; the formal decision stays Nov 27 (G1).

**Sat Nov 21 — Decisions + engine foundations (reduced load)**
- Marketplace bonus: **decided 2026-11-19, skipped** (PRD §12). No user action and no Marketplace track.
- **USER ACTION:** request a **second, clean Atlassian Cloud site** for the judge-flow test. Try `forge site provision` again (SPIKE-X1: is a second demo site allowed per account?); otherwise a free developer site via `go.atlassian.com/cloud-dev` (SPIKE-X2: does it have Rovo? Rovo is needed for SM-7 there; if not, SM-7 is tested only on the demo site and that is stated).
- **USER ACTION:** register on the Atlassian Developer Community (tag `codegeist-2026`) and watch the Build Session recording at 1.5× (https://youtu.be/6h-utBbScWE); note anything that contradicts PRD/ARCHITECTURE.
- Engine: `schema/` (TtEvent v1 types + validators), `csv/` tokenizer with delimiter/decimal detection, first fast-check properties (CSV round-trip, shuffle invariance).
- DoD: second-site request sent; CSV properties green.

**Sun Nov 22 — BUFFER (critical path float day 1)**
- Use only for unfinished Nov 20 spikes. If none, rest. Do not pull W2 work forward.

**Mon Nov 23 — Rovo agent spike + engine mapping/resample**
- Add `rovo:agent` + one GET `action` (`echo-cluster`, returns static JSON) to the hello app; deploy; invoke from Rovo Chat on the demo site. SPIKE-R3: record latency and the confirmation UX for a write verb (`create-*` test action that only writes a comment).
- SPIKE-A2: log scrubbed `payload.context` for a Rovo Chat invocation into `fixtures/contexts/rovo-chat.json`.
- SPIKE-R4: add a minimal `rovo:skill` and check whether the agent uses it.
- Engine: `mapping/` (canonical channels, header synonyms, unit multipliers) and `resample/` (window, linear interpolation, gap masks) with their properties.
- DoD: an agent answer in Rovo Chat quoting the action's JSON (screenshot in `docs/SPIKES.md`).

**Tue Nov 24 — MCP + TWG spikes; schema freeze**
- Add `rovo:mcp` listing the same action; deploy. **USER ACTION:** enable external MCP exposure in *Atlassian Administration → Apps → Sites → [site] → Connected apps → [app] → Tools*. **USER ACTION:** connect an external MCP client (MCP Inspector by default, per DEMO_SCRIPT R4) to `https://mcp.atlassian.com/forge/<appId>` and approve the OAuth 2.1 consent. Record one successful tool call (SM-8 smoke) and the `payload.context` (SPIKE-A2).
- SPIKE-T1: `GET /gateway/api/graphql/twg/schema`; find the exact scope strings and argument shapes for `atlassianUserInTeams` / `atlassianTeamMembers` and the team ARI format.
- SPIKE-R1: run the same TWG echo + team query from (a) a UI resolver, (b) a Rovo action, (c) an MCP tool call. Record ok / empty / "not permitted" for each.
- **USER ACTION (only if any TWG call fails with "not permitted"):** post on CDAC with the tag `codegeist-2026` and open a ticket in the Ecosystem help center; link both in `docs/SPIKES.md`.
- **Freeze `tt.event` schema v1 and the telemetry codec** based on the SPIKE-I1 result (PRD US-04 AC4, ARCHITECTURE §5.6, §6.1). After today, schema changes need a version bump and a migration note.
- DoD: MCP call recorded; TWG result matrix (3 contexts × 2 queries) filled in; schema v1 tagged in git.

**Wed Nov 25 — Remaining week-1 spikes + slice part 1**
- SPIKE-S1: create a project + components from the admin page via REST asUser (team-managed and company-managed); record which works.
- SPIKE-S3: from a queue consumer, asApp: create an issue, set a property, create a link in that project.
- SPIKE-S2 (first measurement): bulk-create 50 issues + properties from the consumer; time it. Attachments: time 10 uploads and extrapolate to ~120.
- SPIKE-E1 / E3: `jira:entityProperty` index + JQL on `ttV = 1`; `search/jql` with `properties`.
- SPIKE-A1: asUser from a resolver (consent prompt UX), from an action, and confirm it is absent in consumers.
- ~~SPIKE-L1 / L2~~ and ~~SPIKE-V1~~: **N/A (cut 2026-11-19)**, no LLM and no issue-event trigger. The freed time goes to `codec/` (below).
- `codec/` (pulled forward from Nov 30): int16 quantise + base64; client/server bit-identical feature property (schema frozen yesterday).
- Slice part 1: `signal/` takeover detection + 3 of the 6 type rules (`lateral-drift`, `lane-loss`, `late-brake`); `image/` decode + downscale + `meanY`, `contrast`, `glare` (M1–M3) and their chips.
- DoD: every SPIKE in ARCHITECTURE §17 dated "Week 1" or earlier has a row; remaining open ones are listed with a new date.

**Thu Nov 26 — Vertical slice part 2 (US Thanksgiving: expect slow Atlassian responses, INFERRED)**
- Intake Custom UI (create mode): drop CSV + 1–4 JPEGs → worker parses/decodes → preview with SVG trace and chips → on confirm: create issue, upload originals (SPIKE-I2 path or fallback), write `tt.event` (codec v1).
- Issue panel (Custom UI): reads `tt.event`, renders the trace (SignalPlot) and condition chips, shows "No signal data. [Add telemetry]" when absent (US-13 first state).
- Half-day buffer in the afternoon for spike carry-over.
- DoD: **vertical slice demo:** upload one ticket → panel shows trace + chips on the demo site. Screen recording saved as `docs/evidence/slice-2026-11-26.webm`.

**Fri Nov 27 — G1 gate: go/no-go, scope freeze, bonus decision**
- Fill the G1 checklist:
  - [ ] Vertical slice works (Nov 26 recording).
  - [ ] SPIKE-I1, I2 (browser), I4 each passed or have a working fallback. **If all three failed with no workaround → switch to Option C (SOX Change Pack) per PRD §12** and rewrite this plan the same day.
  - [ ] TWG matrix read. **Primary bonus confirmed** (default Agents; TWG becomes primary only if TWG reads work inside actions and MCP, PRD §12).
  - [ ] **Scopes frozen:** final list written into ARCHITECTURE §3 (TWG scopes, `manage:jira-project`, any Assets/US-16 scopes; `llm` is cut). Anything not on the list is cut from the hackathon build.
  - [ ] `forge eligibility -e development` result recorded (RoA).
- `deploy-staging.yml` working: push to `main` deploys to staging and upgrades the install on the demo site.
- **USER ACTION:** sign off the G1 checklist (one line in `docs/SLIP_LOG.md`).
- DoD: G1 checklist committed; staging environment installed on the demo site.

### Week 2 — Sat Nov 28 → Fri Dec 4: engine complete, clustering, panel, board

**Sat Nov 28 — Signal engine complete (reduced load)**
- Remaining type rules (`phantom-brake`, `cut-in-response`, `unknown`), all features F1–F10 with clamps, configurable thresholds with defaults (US-07).
- Properties: never NaN/Infinity, clamp ranges, row-order invariance, sub-threshold noise stability (ARCHITECTURE §16.2).
- DoD: `signal/` ≥ 90 % line coverage.

**Sun Nov 29 — BUFFER (float day 2)**
- Carry-over from W1 only. If none, write `tools/eval/gen_reference.py` (scipy reference fixtures) and commit its JSON output.

**Mon Nov 30 — Image metrics + similarity**
- `image/` M4–M7 (`lapVar`, etc.) and all chips (US-08); image properties (uniform image, brightening monotone, downscale mean).
- `similarity/` distance + contributions (why rows) (US-10), pulled forward from Dec 1; distance properties (symmetry, identity, contributions sum to 1). (`codec/` moved to Nov 25; seedgen v0 grows into the two generator days below.)
- **USER ACTION: product name decision prep** — run the trademark search for the PRD §0 candidates (SPIKE-N1); decision due Dec 1.
- DoD: image and distance properties green.

**Tue Dec 1 — FULL SEED GENERATOR, day 1 of 2 (new 2026-11-19)**
- `packages/seedgen` per [SEED_DATA](SEED_DATA.md) §3–§8: PRNG + substreams (§4), fleet, drive sessions and plan constraints (§5–§6), Poisson events + planted roles P1a/P1b/P3a/P3b/N1/AMB1/AMB2 (§7), telemetry channel models + archetype overlays + CSV writer + quirks Q1–Q9 (§8). Standard `Math.*`, no `dmath` (SEED_DATA §4.3).
- `tools/seed generate` writes CSVs + JSON. Tests G-T2, G-T3 (against the signal engine), G-T7, G-T10.
- **USER ACTION: choose the product name** (default "Takeover Triage") and confirm the DEMO_SCRIPT R4 choice of MCP client shown on screen.
- DoD: `tools/seed --seed 1 --out fixtures/seed1` writes every CSV; archetype conformance (G-T3) green on seeds 1–50.

**Wed Dec 2 — FULL SEED GENERATOR, day 2 of 2 (new 2026-11-19)**
- Simplified frame renderer (SEED_DATA §9: sky gradient, road, lane lines, sun glare blob, night darkening, rain blur/streaks, SYNTHETIC watermark + COM segment), jpeg-js encode; text and templates (§10), scenarios (§11), routing seed (§12), truth (§14); `seed verify`, `seed samples`.
- Tests G-T1 (golden manifests for seeds 1–5 **pinned to Node 22/24 in CI**), G-T4 (SPIKE-G3), G-T5, G-T6, G-T8. Write `tools/eval/gen_reference.py` here if the Nov 29 buffer was used for carry-over.
- DoD: `tools/seed --seed 1 --out fixtures/seed1` writes CSVs + JPEGs + JSON + `truth.json`; golden fixtures committed.

**Thu Dec 3 — Clustering + onset statistics + services**
- `cluster/` rule bucket, kNN assign, τ novelty, HAC propose, medoid/profile, template naming (US-09, US-21); clustering properties (permutation invariance, idempotence, duplicate d* = 0, accepted memberships unchanged, novelty monotone in τ).
- `stats/` (log-gamma, binomial tail, Clopper-Pearson, Holm), `onset/` (build ordering, exposure aggregation, boundary scan, verdicts incl. not-enough-data) (US-14). Match scipy fixtures to 1e-9 (SM-5); worked example p ≈ 0.0013.
- Ports/adapters (`JiraPort`, `StoragePort`, in-memory fakes), custom entities, KVS keys (ARCHITECTURE §7); services `commitEvent`, `match`, `accept`, `split` with undo.
- DoD: SM-2, SM-3 (on generator fixtures) and SM-5 green in CI.

**Fri Dec 4 — Panel complete + cluster board + G2 gate**
- Issue panel complete: match/novel state with confidence, why-table, side-by-side overlay with the nearest neighbours, evidence links, Accept / Split buttons, lazy re-processing on open (US-10, US-11 partial, US-13, ARCHITECTURE §7.5).
- Project page "Takeover clusters": cluster rows, onset column, coverage column placeholder, novel queue, "since last triage" (US-12); recluster consumer (`tt-recluster`, including the `resync` mode behind "Re-sync now", ARCHITECTURE D12).
- `tools/eval`: ARI ≥ 0.8 on unseen seeds 1000–1019 with parameters frozen (SM-4).
- SPIKE-P1 measured (board/panel load times vs ARCHITECTURE §13).
- **G2 gate:** seed1 pushed to the demo site via the dev-only `tools/seed --push` (then "Re-sync now") shows ≥ 4 clusters (SEED_DATA §13.2: 4 latent clusters), a `regression-likely` verdict on 4.12.0, and the novel queue; two identical-text tickets from seed1 show different clusters with the reason in the panel. SM-2, SM-3, SM-4, SM-5 green in CI.
- DoD: G2 recorded in `docs/SLIP_LOG.md`.

### Week 3 — Sat Dec 5 → Fri Dec 11: Rovo, MCP, TWG, seed, coverage gap, bot-QA, review

**Sat Dec 5 — In-app seed, part 1 (reduced load)**
- Admin page (UI Kit): detect demo, create `TTDEMO` + components (SPIKE-S1 path or the labelled-project fallback), seed entry prefilled with `DEFAULT_SEED` (from `pnpm seed pick-default`, committed Dec 4 with `params-v1`; SEED_DATA §13.1), progress bar (US-01, ARCHITECTURE §9).
- `startSeed` + consumer chain steps 1–2 (vehicles, drive sessions, scenario-test issues).
- DoD: steps 1–2 complete on the demo site from the button.

**Sun Dec 6 — BUFFER (half day) + seed part 2**
- Morning: carry-over. Afternoon: consumer steps 3–4 (historical events with links; Monday events, unassigned).
- DoD: board usable after seeding, before attachments.

**Mon Dec 7 — Seed part 3 + diagnostics + action layer**
- Seed steps 5–6 (lazy attachment upload with "raw files uploading" state; final recluster); "Remove demo data"; seed report with ARI on the chosen seed (US-01, US-02, US-03).
- Diagnostics panel (US-03): Rovo, TWG (with "possibly a missing scope or no data" wording), MCP-exposure hint, attachment path. "Re-sync now" button on the admin page and the board, with progress from `resync:<projectKey>` (US-02 AC4).
- Shared action layer (PRD §7, ARCHITECTURE §10.3): validation, envelopes, Ajv schemas; first two actions (`get-cluster-for-event`, `build-regression-check`).
- DoD: t_seed measured with a stopwatch (target ≤ 60 s, SM-1 precursor).

**Tue Dec 8 — Rovo agent + skill + MCP**
- Remaining actions (`explain-match`, `list-novel-since`, `list-coverage-gaps`, `suggest-owner`, and the CREATE actions `link-event`, `create-cluster`, `create-scenario-stub` with `userConfirmed`; PRD §7); agent prompt with the 4 conversation starters (US-19); `rovo:skill` (or the inlined playbook if SPIKE-R4 failed) + OSS `skills/monday-takeover-triage/SKILL.md` (US-20); `rovo:mcp.tools` listing the same actions.
- Contract fixtures for the Rovo, automation and MCP contexts.
- DoD: all 4 starters answer with issue-key citations on the demo site (SM-7 first pass, timed).

**Wed Dec 9 — TWG routing + Route action + coverage core and gap UI**
- `TwgPort` adapter with 4 s timeout; routing service: TWG team lookup → fallback to component lead / project role; `twgStatus` reported in every envelope (US-15, ARCHITECTURE §11). No "my teams" board filter (stretch US-27, deferred 2026-11-19); that time goes to the coverage core.
- Route action in panel and board (US-11 AC3), Team field write only if SPIKE-R2 passed.
- `coverage/` pure part (moved from Dec 2): condition signature, tag parsing, verdict, gap grid, with its properties (US-17 engine side).
- Coverage gap UI: per-cluster verdict, 2D grid (condition × type), **"Create scenario stub"** with template preview (US-17, US-18).
- DoD: one stub created from the board on the seeded site; route works with TWG on and with TWG forced off.

**Thu Dec 10 — Bot-QA (functional) + column mapping + review**
- `tools/bot-qa` (ARCHITECTURE §16.3) steps 1–8 against staging, functional assertions only (no video-recording mode, cut 2026-11-19); **USER ACTION:** log in once by hand with the test account (2SV) to capture Playwright `storageState` (SPIKE-Q1).
- In the slot freed by the LLM cut (US-21 is template-only and already done on Dec 3; SM-9 is a CI check): intake column mapping UI with presets and the non-automotive preset (US-05) and US-06 "Add telemetry" to an existing ticket (SPIKE-I3 result decides "use attached file" vs re-select), both moved from Dec 3; "Suggest re-evaluation" draft (US-14 AC7), moved from Dec 9.
- Code review pass: run `/code-review` (high) on the full diff; `/security-review`; fix every important finding. `pnpm audit --audit-level=high` = 0.
- DoD: `qa-report.json` from a full bot run committed; review findings fixed or listed.

**Fri Dec 11 — G3: MVP demo-complete + first production deploy**
- Fix day for bot-QA failures.
- `release.yml`: `forge deploy -e production`; `forge eligibility -e production` saved (SM-10).
- **USER ACTION:** in the Developer Console set Distribution → **Sharing**, select Jira, copy the installation link into `docs/SETUP.md` (draft) and the Devpost draft.
- Rough-cut video on staging per DEMO_SCRIPT (screen-only, no narration) to find storyboard gaps.
- **G3 gate:** every PRD §8.1 bullet checked on staging by bot-QA or a manual note. Anything failing goes straight into the cut rule (section 4).
- DoD: G3 recorded; installation link exists.

### Week 4 — Sat Dec 12 → Fri Dec 18: polish, accessibility, theming, fresh-site test, video

**Sat Dec 12 — Stretch slot 1 or polish (reduced load)**
- Only if G3 passed with zero slip: US-22 What-if thresholds page (PRD §8.2 order). Otherwise: G3 failures.
- Write `docs/SETUP.md` (judge instructions): requirements ("Atlassian Cloud site with Rovo enabled", admin rights), install link, "Load demo data", how to enable MCP exposure, troubleshooting via diagnostics, synthetic-data and not-a-safety-tool disclaimers.

**Sun Dec 13 — BUFFER (float day 3)**
- Carry-over only. If none, US-23 calibration context (stretch 2).

**Mon Dec 14 — Accessibility, theming, fresh-site install test**
- Accessibility: keyboard paths for intake, panel, board; ARIA labels on plots; text alternatives for SVG traces (data table toggle); contrast check in light and dark; axe run via Playwright on all three Custom UI resources (0 serious/critical).
- Theming: ADS tokens only, light + dark verified on every screen.
- **USER ACTION:** on the **second, clean site**, install from the Sharing link as a new admin, click "Load demo data", and time it with a stopwatch **three times** (SM-1, uninstall + reinstall between runs). Also run SM-6 (hand-edited CSV) there.
- **USER ACTION:** confirm the YouTube account can publish a public video; set up audio (or decide on silent + captions).
- DoD: SM-1 × 3 recorded in `docs/evidence/`.

**Tue Dec 15 — DRY RUN (full rehearsal)**
- Treat today as if it were Dec 19: production build only, the clean site, the Sharing link, SETUP.md followed literally by someone who has not seen the app (**USER ACTION:** recruit one friend or colleague who is not an employer stakeholder; if nobody is available, follow SETUP.md yourself in a private browser window with no prior session).
- Run the full DEMO_SCRIPT once end to end and record it as a scratch take; fill DEMO_SCRIPT §4 values from `qa-report.json`.
- Fill every Devpost field in the draft (description, bonus write-ups for Rovo Agents and MCP, TWG mention, built-with, install link, setup instructions, repo link if the form asks). **USER ACTION:** review the draft text for honesty (synthetic data labelled, no fake users, no unverified claims such as "Runs on Atlassian" unless SM-10 passed).
- Output: a dry-run defect list, each tagged `must-fix` / `nice` / `cut`.
- DoD: defect list committed; nothing marked `must-fix` is a new feature.

**Wed Dec 16 — BUFFER (float day 4) + dry-run fixes**
- `must-fix` items only. Last day any code change may land before recording. Tag `v1.0.0-rc1`, deploy to production.

**Thu Dec 17 — Video recording**
- Re-seed the recording site with the default seed; record the DEMO_SCRIPT §5 shot list **by hand** (OS screen capture) on the production install, including the MCP client and the architecture animation. Playwright screenshots for gallery stills are optional.
- **USER ACTION:** record narration (or captions); confirm no third-party marks or music.
- DoD: all shots captured; a first full edit < 5:00.

**Fri Dec 18 — Video final + G4**
- Final edit; check SM-11 (aha moment timing per the DEMO_SCRIPT decision); captions.
- **USER ACTION:** upload to YouTube as **Public**; paste the link into the Devpost draft; verify it plays logged out.
- Tag `v1.0.0`; production deploy only if it differs from rc1 (and then re-run the clean-site smoke test).
- **G4 gate:** video public; SM-1…SM-12 evidence in `docs/evidence/`; Devpost draft complete.

### Submit and buffer

**Sat Dec 19 — SUBMIT**
- Morning: one last clean-site smoke test from the Sharing link (install, seed, board, one Rovo starter).
- **USER ACTION:** select the category (**Specialized Industries**) and bonus (**Best Rovo Agents** primary; also declare **Best MCP**; mention TWG in the write-up), then click **Submit** on Devpost. Save the confirmation screenshot and email.
- Production freeze starts (ARCHITECTURE §16.4): no deploys except critical fixes that do not change scopes.

**Sun Dec 20 – Tue Dec 22 — BUFFER ONLY**
- Allowed: fixing a broken install link, a Devpost field error, an emergency re-record if the video is rejected or private. Not allowed: features, scope changes, schema changes.
- **USER ACTION (Mon Dec 21):** re-open the submitted entry and verify every link (video, install link, repo) works logged out.
- Hard deadline **Tue Dec 22, 3:00 pm EST**. Edits after it are not allowed ([rules.md §9](research/rules.md)).

**After submission:** keep the production deployment and Sharing link live through the judging period (Jan 5 – Feb 3, 2027) and to winners (~Feb 15). No breaking deploys. **USER ACTION:** set a calendar reminder for ~Feb 10 to check the demo-site expiry (judges use their own sites, so expiry affects only your own re-tests).

---

## 3a. Re-plan for the approved scope (2026-11-19)

The developer approved these cuts on 2026-11-19 (PRD §8.3): no Forge LLM; no issue-event trigger or daily reconcile scheduled trigger (replaced by "Re-sync now" + lazy panel re-processing); no bit-exact math library (golden hashes pinned to Node 22/24); a simplified dashcam renderer; no bot-QA video mode (demo recorded by hand); "my teams" filter deferred to stretch (US-27); Marketplace track removed.

**Two full seed-generator days (Tue Dec 1, Wed Dec 2) are now scheduled before G2.** No gate or freeze date moves. Where the time came from:

| Freed by | Approx. | Where it was | Used for |
|---|---|---|---|
| SPIKE-L1/L2 and SPIKE-V1 (N/A) | 0.25 d | Wed Nov 25 | `codec/` pulled forward from Nov 30 |
| US-21 LLM polish, `tt-llm` consumer, output validation, admin toggle, LLM-off SM-9 run | 0.75 d | Thu Dec 10, Mon Dec 7 | Column mapping + US-06 (from Dec 3) and the re-evaluation draft (from Dec 9) on Dec 10 |
| Bot-QA video-recording mode (`--video`, cursor overlay, scripted shots) | 0.5 d | Thu Dec 10, Thu Dec 17 | Dec 10 slot above; Dec 17 records by hand |
| "My teams" board filter (now US-27, stretch) | 0.25 d | Wed Dec 9 | `coverage/` core moved from Dec 2 |
| Issue-event trigger + scheduled reconcile (net of the new "Re-sync now" button) | 0.25 d | Fri Dec 4 / Mon Dec 7 | Absorbs the "Re-sync now" button and lazy panel re-processing |
| `dmath` library and detailed renderer layers | ≈ 1 d of generator work | (previously unscheduled) | Makes 2 days enough for the full generator |

The W2 engine work that the generator days displace (similarity, coverage core, column mapping, US-06) moves to Nov 30 and to the W3 slots above.

---

## 4. Scope-cut trigger rule

**Measure:** cumulative critical-path slip in working days, logged every evening in `docs/SLIP_LOG.md`, and checked formally at each gate (G1 Nov 27, G2 Dec 4, G3 Dec 11, dry run Dec 15). Buffer days absorb slip first; slip counts only once the week's buffer is used.

**Trigger:** when the slip is **more than 2 days**, cut the next item in the list below **that same evening**, re-plan the remaining days, and note the cut in PRD §8.3 and DEMO_SCRIPT. Each further full day of slip cuts one more item. Cuts are never reversed after Dec 11.

**Cut order (first cut first):**

| # | Cut | Effect / what remains |
|---|---|---|
| 1 | All stretch (PRD §8.2: US-22, US-23, US-16, US-26, US-24, US-25, US-27) | Already gated behind G3; this just stops them |
| 2 | **N/A (cut 2026-11-19).** Was: US-21 LLM polish | Already cut: US-21 is template-only |
| 3 | **N/A (cut 2026-11-19).** Was: Marketplace track | Already cut: Sharing-only app |
| 4 | App-provided `rovo:skill` | Playbook inlined in the agent prompt; OSS SKILL.md still ships |
| 5 | Seed attachments | Thumbnails inside the property only; seeded issues get no raw files (state this in SETUP.md) |
| 6 | US-06 "use attached file" | Re-select local files only |
| 7 | "Since last triage" and "Suggest re-evaluation" draft | Board keeps clusters, onset, coverage, novel queue |
| 8 | Coverage 2D grid | Per-cluster coverage verdict + "Create scenario stub" stay |
| 9 | TWG routing | Component/project-role routing only; drop TWG from the write-up |
| 10 | External MCP client demo | Keep `rovo:mcp` in the manifest; show the tool list from Rovo only; no "Best MCP" claim (DEMO_SCRIPT R5) |
| 11 | Split action | Accept + Route only; split by unlinking manually |
| 12 | Bot-QA beyond steps 1–4 | Manual checklist for the rest |

**Never cut:** in-app "Load demo data" with honesty labels; intake for arbitrary CSV + JPEG with "not enough data" states; deterministic signature + chips; clustering with why-table, confidence and evidence links; exact Poisson onset with not-enough-data; Accept with undo; at least one coverage verdict + stub; Rovo agent with ≥ 2 engine-backed actions (primary bonus); fast-check properties on the core and TypeScript strict; clean-site install test; video; **submission on Dec 19**.

**Hard fallbacks at gates:**
- **G1 (Nov 27):** I1 + I2 (browser) + I4 all failed with no workaround → Option C (PRD §12).
- **G2 (Dec 4):** if slip > 4 days, cut items 1–6 at once and move the board's onset column to the panel only.
- **G3 (Dec 11):** if MVP is not demo-complete, cut until it is by Dec 13; the dry run on Dec 15 does not move.
- **Dec 16, end of day:** whatever is on `v1.0.0-rc1` is what gets recorded and submitted.

---

## 5. Freeze dates

| Date | What freezes | Why |
|---|---|---|
| Tue Nov 24 | `tt.event` schema v1 + codec | Every module and fixture depends on it |
| Fri Nov 27 | **Scopes and manifest modules** (TWG scopes, `manage:jira-project`, Assets; `llm`, `trigger` and `scheduledTrigger` are already cut) | Scope changes force re-consent on every install |
| Tue Dec 1 | Product name | Video, listing, SETUP.md |
| Fri Dec 4 | Clustering parameters for SM-4 (`params-*`) | Evaluation on unseen seeds must use frozen thresholds |
| Fri Dec 11 | Features (MVP) | After G3 only fixes, polish and stretch from the PRD order |
| Wed Dec 16 | Code for the recorded version (`v1.0.0-rc1`) | The video must match the app |
| Sat Dec 19 | Production | Judging Jan 5 – Feb 3, 2027 |

---

## 6. Marketplace track: removed (2026-11-19)

The Marketplace bonus is skipped (PRD §12), so there is no Marketplace track and none of its user actions. The judges' copy stays license-free and shared by link. Bonuses: **Best Rovo Agents** (primary) and **Best MCP** (also declared).

---

## 7. SPIKE schedule (summary)

| Date | SPIKEs |
|---|---|
| Fri Nov 20 | M1, M2, C1, C2, C3, I1, I2, I4 |
| Sat Nov 21 | X1 (second demo site allowed?), X2 (Rovo on a free developer site?) — new in this file |
| Mon Nov 23 | R3, R4, A2 (Rovo chat) |
| Tue Nov 24 | A2 (MCP), T1, R1, T2 (docs/forum question) |
| Wed Nov 25 | S1, S2 (first), S3, E1, E3, A1, I3, R2, E2 (L1, L2, V1: N/A, cut 2026-11-19) |
| Wed Dec 2 | G3 (render bands, simplified renderer) |
| Thu Dec 3 – Fri Dec 4 | P1, D1 |
| Mon Dec 7 | S2 (full seed timing) |
| Thu Dec 10 | Q1 |
| By Tue Dec 1 | N1 |

Any SPIKE still open on Nov 27 adopts its fallback by default (ARCHITECTURE §17), except P1, D1, Q1 and N1, which are scheduled later.

---

## 8. User-action checklist (all bold items, in date order)

| Date | Action |
|---|---|
| Nov 19 | Confirm eligibility; join Devpost + save draft; create scoped API token; `forge login`; `forge site provision`; GitHub repo + secrets |
| Nov 21 | Request second clean site; CDAC registration; watch Build Session |
| Nov 24 | Enable MCP exposure in admin; connect external MCP client + OAuth consent; (if needed) CDAC post + Ecosystem ticket |
| Nov 27 | Sign off G1 |
| Nov 30 – Dec 1 | Name search; choose product name; confirm MCP client shown on screen |
| Dec 10 | Capture Playwright `storageState` by hand (2SV) |
| Dec 11 | Set Distribution to Sharing; copy installation link |
| Dec 14 | Clean-site SM-1 × 3 by stopwatch; confirm YouTube publishing |
| Dec 15 | Recruit dry-run tester; honesty review of the Devpost text |
| Dec 17 | Record the shot list by hand; record narration or captions |
| Dec 18 | Upload video as Public; verify logged out |
| **Dec 19** | **Select category + bonuses (Rovo Agents primary, MCP); click Submit; save confirmation** |
| Dec 21 | Verify all submitted links logged out |
| ~Feb 10, 2027 | Check demo-site expiry; keep production live |
