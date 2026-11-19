# Seed data: Takeover Triage

**Status:** Draft v1, 2026-11-19. Companion to [PRD.md](PRD.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Owner: solo developer.
**Scope:** the deterministic procedural generator (`packages/seedgen` + `tools/seed`) that produces the synthetic demo fleet, how it is loaded (in-app "Load demo data" for judges, a CLI for the developer), and the ground-truth labels used by the automated accuracy tests.

**Labels** (same as ARCHITECTURE.md):
- **DECISION:** a design choice made here, with its rationale.
- **SPIKE-xx:** an unverified assumption. New IDs in this file use the `G` prefix (SPIKE-G1 and up) and are listed in [section 17](#17-spike-register). Existing IDs (SPIKE-S1, S2, S3, I2, E1) are referenced, not redefined.
- **PRE-REGISTERED:** generator parameters fixed in this document *before* the engine is tuned. Changes after the `params-v1` freeze (Fri Dec 4, the G2 gate in MILESTONES §5) are logged in `packages/seedgen/CHANGELOG.md` with a reason. This is the main answer to the seed-circularity risk ([TOURNAMENT, Option A risks](ideation/TOURNAMENT.md)): the same developer writes the generator and the classifier, so the generator's assumptions are written down first and the evaluation runs on seeds that were never used for tuning.

**Everything described here is synthetic.** No real vehicle, fleet, company, road, location, person or employer data is used or imitated. Vehicles, builds, sensor variants, team names and the fictional root-cause stories below are invented for the demo.

---

## 0. Summary

| Item | Default plan | Where |
|---|---|---|
| Vehicles | **3**: `V-01` (cam-A), `V-02` (cam-B), `V-03` (cam-B), each with a calibration date | §5 |
| Builds | **4.11.0 → 4.11.3 → 4.12.0** (semver order) | §5.2 |
| Drive sessions | **40** over 6 synthetic weeks, ≈ 6,400 km, with route / light / weather tags | §6 |
| Takeover events | **≈ 30** (≈ 25 Poisson-sampled + 7 planted): **4 latent clusters + 1 novel**, 2 boundary events, 2 identical-text/different-signal pairs, 1 different-text/same-signal pair | §7 |
| Telemetry | 1 CSV per event, 30 s raw window, 50/100/200 Hz, 8 canonical channels + 2 decoy columns, documented noise models, 9 deliberate format quirks | §8 |
| Dashcam stills | 1 to 4 JPEGs per event, 1280x720, procedurally rendered with only what the image metrics need (sky gradient, road, lane lines, sun glare blob, night darkening, rain blur/streaks), visibly watermarked **SYNTHETIC** | §9 |
| Scenario tests | **10** issues with deterministic condition tags. **One deliberate gap**: lane-loss x low-sun-glare x cam-B x highway | §11 |
| Owner mapping | 3 components (Perception, Planning, Controls) + ordered routing rules; optional binding to the judge's own Atlassian Teams | §12 |
| Ground truth | Regenerated from `(seed, generatorVersion)` on demand. Never written into issue data | §14 |
| Loading | In-app admin **"Load demo data"** (judge path, no tokens) and `pnpm seed …` CLI (developer only) | §15 |

---

## 1. Reconciliation with PRD and ARCHITECTURE

This file follows the latest planning brief, which differs in some counts from PRD v1 and ARCHITECTURE v1. **DECISION:** the numbers below win. The edits to PRD and ARCHITECTURE were **applied in the 2026-11-19 review** (see the Review log at the end of ARCHITECTURE.md).

| Topic | PRD / ARCHITECTURE v1 says | This file | Edit needed |
|---|---|---|---|
| Vehicles | PRD US-01 AC1 and ARCH §9: about 6 | **3** (1 x cam-A, 2 x cam-B). Fewer vehicles keep the story readable on one screen; the cam-B pair still shows "not one bad car" | PRD US-01 AC1, ARCH §9 step 3.1 |
| Builds | ARCH §9: 4.11.0, 4.11.2, 4.12.0, 4.12.1 | **4.11.0, 4.11.3, 4.12.0**. Three builds give exactly m = 2 onset boundaries, which keeps the Bonferroni factor small and easy to explain | ARCH §9 |
| Drive sessions | about 30 | **40** (more exposure gives the onset test enough power, see §7.3) | PRD US-01 AC1, ARCH §9 |
| Takeover events | about 40 (32 historical + 8 Monday) | **≈ 30** (≈ 20 historical + ≈ 10–12 Monday). Count varies with the seed because events are Poisson | PRD US-01 AC1, ARCH §9 |
| Clusters | ARCH §9: 6 cluster issues | **4 latent clusters + 1 novel** (+ whatever the engine proposes) | ARCH §9 |
| Cluster issues at seed time | ARCH §9: historical events "linked to 6 cluster issues" | **The engine's own HAC proposal over the historical events** becomes the cluster issues. The seed never links by ground truth (§15.1 step S6) | ARCH §9 (clarify) |
| Package | ARCH §4: `packages/seedgen` + `tools/seed` | Same. The brief's "packages/engine or tools/seed" is satisfied: generator code lives in `packages/seedgen` (depends on `engine`), the CLI in `tools/seed` | none |
| CSV comment lines | not specified in ARCH §5.1 | Seeded CSVs start with a `# SYNTHETIC …` line. **The engine CSV parser must skip leading `#` lines** (new requirement, plus a test) | ARCH §5.1 parsing |
| Coverage with several chips | ARCH §5.10 does not define multi-valued matching | The seed assumes **set containment**: a test covers the `chips` dimension when `cluster.chips ⊆ test.cond` (with `cond:any` as a wildcard) | ARCH §5.10 |

---

## 2. Design principles

1. **Pure and deterministic.** `generateFleet(config)` is a pure function of `{seed, anchorDate, profile, generatorVersion}`. It reads no clock and uses no `Math.random`. The same input gives the same bytes, in any order of generation, on the pinned CI runtimes (Node 22 and 24, §4.3). There is no bit-exact cross-engine math library (cut 2026-11-19).
2. **Same code path as real intake.** Every seeded event goes through `engine.processEventFiles(csvBytes, jpegBytes[], mapping)`, the same function the intake Web Worker calls. The seed never writes precomputed features or chips (PRD US-01 AC2). The generator produces *files*; the engine turns files into `tt.event`.
3. **Outcomes are drawn, not written.** Event counts per build are Poisson draws against the generated km. The onset verdict, the cluster structure and the chips are whatever the engine computes from those files. The generator knows the latent truth; the app never sees it.
4. **No truth leakage.** Issue summaries, descriptions, labels, properties, file names and image pixels carry no latent-cluster id, no archetype name and no expected verdict. Driver notes are drawn from a pool shared across clusters (§10).
5. **Honest by construction.** Every artifact is marked synthetic in at least two independent ways (§16). The default seed is chosen by a published rule, and the seed report says so (§13.1).
6. **Pre-registered parameters.** Archetype ranges (§7, §8.5) and render metric targets (§9.4) are fixed here. The engine is tuned on seeds 1–5 only. Accuracy claims use seeds 1000–1019 (ARCH §5.8, PRD SM-4).
7. **Graceful variety.** Random seeds may produce small clusters, inconclusive onset or "first of its kind" states. That is intended: it shows the app's not-enough-data states are real.

---

## 3. Packages, API and outputs

```
packages/seedgen/
├── src/
│   ├── rng/            # splitmix32, xoshiro128**, fork(label), uniform, irwinHallNormal, poisson
│   ├── plan/           # profiles ("demo-v1"), fleet plan, session plan, cluster archetypes (PRE-REGISTERED)
│   ├── fleet/          # vehicles, calibration, builds
│   ├── sessions/       # drive sessions: dates, km, tags
│   ├── events/         # Poisson sampling, planted events, roles, Monday batch, text pairs
│   ├── telemetry/      # channel models, noise, archetype profiles, CSV writer + quirks
│   ├── render/         # simplified scene renderer (RGBA), tone curves per variant, conditions, watermark font
│   ├── jpeg/           # jpeg-js encode wrapper + COM-segment splice
│   ├── text/           # driver-note pool, summary/description templates (ADF)
│   ├── scenarios/      # scenario-test issues and tags
│   ├── routing/        # components and routing rules
│   ├── truth/          # ground-truth label builder (pure, regenerable)
│   └── index.ts        # generateFleet, generateEventFiles, buildTruth, GENERATOR_VERSION
└── test/               # determinism, substream stability, archetype conformance, honesty lint
tools/seed/             # CLI (Node 24): generate, verify, push (dev only), pick-default, samples, power
```

Dependency rule (ARCH §4): `engine ← seedgen ← apps/forge` and `seedgen ← tools/*`. `seedgen` imports `jpeg-js` (encoder) and `engine` (for decode, metrics and conformance tests). The ESLint purity rules of `engine` (no `Math.random`, `Date`, `Intl`, DOM, `@forge/*`) also apply to `seedgen`.

### 3.1 Public API (sketch, TypeScript strict)

```ts
export const GENERATOR_VERSION = "1.0.0";           // bump => truth and golden fixtures change

export interface SeedConfig {
  seed: number;                 // uint32. Judge-editable in the admin page
  anchorDate: string;           // ISO date of the "Monday" (YYYY-MM-DD). Passed in, never read from a clock
  profile: "demo-v1";           // PRE-REGISTERED plan (§5–§12)
  frames: "full" | "fast";      // full = 1280x720 q85; fast = 960x540 q80 (SPIKE-S2 fallback)
}

export interface FleetPlanOutput {
  vehicles: VehicleRecord[];          // §5
  driveSessions: DriveSessionRecord[];// §6
  events: EventSpec[];                // §7: metadata + text, NO file bytes yet
  scenarios: ScenarioIssueSpec[];     // §11
  routing: RoutingSeed;               // §12
  triagedMark: string;                // ISO timestamp for "Mark triaged" (§7.5)
}

export function planFleet(cfg: SeedConfig): FleetPlanOutput;                   // cheap: < 50 ms
export function generateEventFiles(cfg: SeedConfig, eventId: string): {       // per event, streamable
  csv: { name: string; bytes: Uint8Array };
  frames: { name: string; bytes: Uint8Array; tRel: number }[];
};
export function buildTruth(cfg: SeedConfig): GroundTruth;                       // §14, pure
```

`planFleet` and `generateEventFiles` are separate so the seed consumer can generate a few events per queue step (§15.1) and the CLI can stream to disk.

---

## 4. Randomness and determinism

### 4.1 PRNG

- **Generator:** `xoshiro128**` (32-bit state words, integer ops only, as named in ARCH §4).
- **Seeding:** `splitmix32(seed)` fills the 4 state words. A zero state is impossible by construction.
- **Uniform:** `u = (next() >>> 8) / 16777216` gives an exact float in [0, 1) with 24 bits.
- **Normal:** `irwinHallNormal() = Σ₁₂ uᵢ − 6`. Uses additions only, so it is bit-identical across JS engines. Tails are bounded at ±6σ, which is fine for sensor noise and is documented as an approximation.
- **Poisson(λ):** Knuth multiplication for λ ≤ 30 using `Math.exp(−λ)`. For λ > 30 (not reached in `demo-v1`), a normal approximation rounded and clamped at 0.
- **Choice / shuffle:** Fisher–Yates with `floor(u · n)`.

### 4.2 Substreams (order independence)

Every random quantity is drawn from a stream forked by **label**: `rng.fork("event:E-017:telemetry:lane_offset")`. `fork` hashes `(seed, label)` with murmur3 `fmix32` over the UTF-8 label into a new splitmix32 seed. Consequences:
- Generating events in any order, or only one event (`generateEventFiles(cfg, "E-017")`), gives identical bytes.
- Adding a cluster or changing one archetype changes only the streams under that label. A property test asserts that the other events' bytes are unchanged (§14.3 G-T2).

Label hierarchy: `fleet:*`, `session:DS-xxxx:*`, `count:<cluster>:<variant>:<build>`, `assign:<cluster>:<k>`, `event:E-xxx:{telemetry|frames|text|quirk}:*`, `scenario:SCN-xx:*`.

### 4.3 Maths and golden hashes (no `dmath`; decided 2026-11-19)

ECMAScript does not require `Math.exp`, `Math.log`, `Math.sin` or `Math.cos` to be correctly rounded, so results may differ between engines and versions. `+ − × ÷` and `Math.sqrt` are IEEE-754 correctly rounded, and `Math.floor/round/abs/min/max` are exact.
- **DECISION (2026-11-19):** the bit-exact cross-engine math library (`dmath`) is **dropped**. `seedgen` uses the standard `Math.*` functions.
- **Golden hashes are pinned to Node 22/24 in CI.** The SHA-256 file manifests of the golden fixtures (seeds 1–5) are checked on the CI matrix (Node 22 and Node 24). No other runtime is promised byte-identical output. If the two Node versions ever disagree, CI keeps one manifest per version and the difference is logged in `packages/seedgen/CHANGELOG.md`.
- The in-app seed runs in a Forge function on `nodejs24.x`, which matches a pinned runtime. Anything compared across other environments (the browser seed fallback, SPIKE-S3) is compared on engine metrics within tolerance (±1 luma), not on bytes.
- `jpeg-js` encoding is covered by the same Node pin; SPIKE-G1 is N/A.

### 4.4 Dates

- `anchorDate` is the Monday of the demo. The in-app seed passes the Monday on or before the server's current UTC date. It is computed in the resolver, which may read the clock; the generator never reads it.
- Golden fixtures and evaluation use `anchorDate = 2026-11-16`.
- Ground truth does not depend on `anchorDate`: every date is `anchor + offset`, so changing the anchor shifts all dates and nothing else.
- All timestamps are UTC. Session "time of day" is a tag-consistent UTC hour; no real location or time zone is implied.

### 4.5 Identifiers

Stable generator ids: `V-01..V-03`, `DS-0001..DS-0040`, `E-001..E-0nn` (sorted by `occurredAt`, then by label hash), `SCN-01..SCN-10`. Jira keys differ per site. The mapping `itemId → issueId` lives in `seed:state` (ARCH §7.4) and in the small `tt.seed` property on each seeded issue (§15.1).

---

## 5. Fleet: vehicles, sensors, builds

### 5.1 Vehicles (`profile demo-v1`, PRE-REGISTERED)

| id | Label | Variant | Front camera (fictional) | Raw CSV rate | Camera calibrated | Calibration age at anchor | Note |
|---|---|---|---|---|---|---|---|
| `V-01` | SYN test vehicle 01 | **cam-A** | "Cam-A 1.2 MP, 52° HFOV, wide dynamic range" | 100 Hz | anchor − 62 d | 62 d (**stale** vs 30 d window) | Drives highway + urban loops |
| `V-02` | SYN test vehicle 02 | **cam-B** | "Cam-B 1.2 MP, 60° HFOV, narrower dynamic range" | 50 Hz | anchor − 17 d | 17 d (fresh) | Highway + rural loops |
| `V-03` | SYN test vehicle 03 | **cam-B** | same as V-02 | 200 Hz | anchor − 50 d | 50 d (**stale**) | Highway + rural loops |

Other sensors per vehicle (registry only, for display and the optional calibration chip): `radar-front` (calibrated anchor − 40 d for all three) and `imu` (no calibration date). There are no VINs, plates, OEM names or GPS fields. The registry record matches the `vehicle` custom entity in ARCH §7.3: `{vehicleId, label, variant, sensors[], calibration{sensor: isoDate}, synthetic: true}`.

**Calibration story (US-23, stretch):** all phantom-brake members come from V-01 (stale), so that cluster gets "check calibration first". The lane-loss cluster mixes V-02 (fresh) and V-03 (stale), so it does not get the flag. The truth file records `calibrationCausal: false`: the generator does not model calibration effects, and the flag is a heuristic that the demo shows honestly.

### 5.2 Builds

| Build | Window (days from anchor) | Change story (fictional, for narration only) |
|---|---|---|
| `4.11.0` | −42 … −29 | baseline |
| `4.11.3` | −28 … −15 | maintenance release, no behavioural change in the generator |
| `4.12.0` | −14 … −1 | "new auto-exposure tuning for cam-B" (the narration for cluster LC-A's onset) |

Build order is semver. All three vehicles switch builds on the same day. A staggered rollout is a v2 profile option.

---

## 6. Drive sessions (exposure)

### 6.1 Plan (structure PRE-REGISTERED; values seeded)

| Vehicle | 4.11.0 | 4.11.3 | 4.12.0 | Total | Routes |
|---|---|---|---|---|---|
| V-01 (cam-A) | 4 | 4 | 5 | 13 | highway 60 %, urban 40 % |
| V-02 (cam-B) | 4 | 4 | 6 | 14 | highway 60 %, rural 40 % |
| V-03 (cam-B) | 4 | 4 | 5 | 13 | highway 60 %, rural 40 % |
| **Total** | 12 | 12 | 16 | **40** | |

4.12.0 has more sessions on purpose (a "validation push on the new build"), which also gives the onset test exposure on the new side.

### 6.2 Per-session draws

| Field | Model |
|---|---|
| `date` | uniform day in the build window. The last 3 cam-B sessions and the last **2** cam-A sessions of 4.12.0 are placed on the final weekend, **Sat–Sun (anchor − 2 … − 1)**, so every Monday event falls after the Friday 17:00 triage mark (§7.5). Plan constraint (review 2026-11-19): the final-weekend sessions must offer an eligible session for every planted role (§7.2): cam-B ≥ 1 low-sun session and ≥ 1 rural day session; cam-A one night-urban session (P3a, LC-B) and one day-highway session (P3b, LC-D). G-T10 checks it |
| `route` | categorical per the table above. A plan constraint guarantees every (variant, build) has at least one highway session and one session of its second route type |
| `km` | highway U(140, 260); rural U(60, 140); urban U(60, 140). Rounded to 0.1 km |
| `light` | set of tags. Day-only 45 %, `day + low-sun` 35 % (morning or evening drive), `night` 20 %. Constraint: every cam-B (variant, build) has ≥ 1 low-sun session; every cam-A (variant, build) has ≥ 1 night urban session |
| `weather` | `dry` 80 %, `rain` 20 % |
| `startUtc` | consistent with `light`: low-sun 07:00–08:30 or 15:30–17:00; night 18:30–22:00; day 09:00–15:00 |
| `durationMin` | `km / v̄ · 60`, with v̄ = 95 km/h highway, 65 rural, 40 urban |
| `odd` | `[route]` plus light and weather tags, e.g. `["highway","low-sun","dry"]` |
| `label` | e.g. "Highway loop H1 (synthetic)". Route names are invented, not real roads |

**Expected exposure** (means; each seed varies by about ±10 %):

| Variant | 4.11.0 | 4.11.3 | 4.12.0 | Total |
|---|---|---|---|---|
| cam-B (V-02 + V-03) | ≈ 1,280 km | ≈ 1,280 km | ≈ 1,760 km | ≈ 4,300 km |
| cam-A (V-01) | ≈ 640 km | ≈ 640 km | ≈ 800 km | ≈ 2,100 km |

Records map one to one onto the `driveSession` custom entity (ARCH §7.3), with `source: "demo-seed"` and `synthetic: true`.

---

## 7. Takeover events

### 7.1 Latent clusters (PRE-REGISTERED)

Rates are **per 1,000 km of exposure of the cluster's sensor variant**. This is the same denominator the onset test uses with its default exposure filter (ARCH §5.9), so the generator's null model is exactly the test's null model. Condition-specific rates (events per low-sun km) would be more realistic but introduce an ODD-mix confound; that is a v2 option, and the UI caveat already names it.

| Latent id | Archetype (fictional story) | Expected type | Variant | Conditions (frames / ODD) | Rate 4.11.0 / 4.11.3 / 4.12.0 | E[count] | Owner component | Coverage (§11) |
|---|---|---|---|---|---|---|---|---|
| **LC-A** | Low sun saturates cam-B, lane confidence collapses, car drifts out, driver takes over | `lane-loss` | cam-B | `low-sun-glare`; highway or rural; sessions with `low-sun` | **0.1 / 0.1 / 8.0** | ≈ 14.3 | Perception | **uncovered** (the deliberate gap) |
| **LC-B** | Lead vehicle decelerates at night, system brakes late, driver brakes | `late-brake` | cam-A | `night`; urban; sessions with `night` | 1.8 / 1.8 / 1.8 | ≈ 3.8 | Planning | covered |
| **LC-C** | Late hand-back on a wide rural curve: lane is visible, assist torque fades, car drifts outward | `lateral-drift` | cam-B | `normal` (day); rural | 1.0 / 1.0 / 1.0 | ≈ 4.3 | Controls | covered (via `variant:any`) |
| **LC-D** | Phantom braking under an overpass shadow, no object ahead (story only; the frames show no overpass, §9.2) | `phantom-brake` | cam-A | `normal` (day); highway | 1.5 / 1.5 / 1.5 | ≈ 3.1 | Perception | covered |

Sampling: for each `(cluster, build)`, `n ~ Poisson(rate · E_variant,build / 1000)` from stream `count:<cluster>:<variant>:<build>`. Each event is then assigned to an eligible session of that variant and build (one whose tags satisfy the cluster's conditions), with probability proportional to km. `occurredAt = startUtc + U(0.1, 0.9) · duration`. Vehicle and ODD come from the session.

### 7.2 Planted events (always present, disclosed)

These are **added** to the Poisson process, are always in the Monday batch, and are **excluded from history**, so they never enter the default (accepted-only) onset test. The seed report lists them as planted.

| Role id | Truth | What it tests | Construction |
|---|---|---|---|
| **P1a** | LC-A | SM-2, identical text / different signal | LC-A archetype, driver note exactly **"car drifted left, took over"**, drift sign forced left |
| **P1b** | LC-C | SM-2 (partner of P1a) and SM-3 | LC-C archetype, same exact note **"car drifted left, took over"**, curve and drift to the left. The split shows as a different bucket (lane-loss vs lateral-drift: F6 min lane confidence ≈ 0.15 vs ≈ 0.85) plus the chip difference |
| **P3a** | LC-B | Second identical-text pair; why-table led by **F3 minTtc / F4 brakeOnsetTtc** (the bot-QA assertion in ARCH §16.3 step 3) | LC-B archetype, note **"it braked hard, I took over"** |
| **P3b** | LC-D | Partner of P3a | LC-D archetype, same exact note |
| **N1** | NOVEL-1 | Novelty inside a populated bucket (lane-loss x cam-B), so the result is "Proposed new cluster" rather than "first of its kind" | Construction zone (signal story): markings vanish abruptly, short latency, strong swerve, lower speed. Frames: plain day scene with an overcast sky palette (no cones, §9.2). Designed distance to LC-A ≈ 1.6–1.9 τ (§8.5) |
| **AMB1** | LC-A, `boundary` | Honest ambiguity on a rule and a chip threshold | F6 in [0.36, 0.44] (R-LL-1 threshold 0.40) and sunBlob in [0.003, 0.005] (chip threshold 0.004). May land in lateral-drift or lose its chip |
| **AMB2** | LC-B, `boundary` | Rule-order ambiguity | F3 in [1.85, 2.15] (R-LB-1 at 2.0) and F10 in [0.45, 0.55] (R-CI-1 at 0.5, checked first). May become `cut-in-response` or `unknown` |

**Different text, same signal (SM-3):** the pair is **P1b** (Monday, "car drifted left, took over") and the **earliest historical LC-C member**, whose note is forced to **"steering went light near the exit, grabbed the wheel"**. Both are LC-C. The demo shows P1b matching the cluster that contains that member. If a seed has no historical LC-C event, the role moves to the earliest *Monday* LC-C event (if any), and the truth file records `sm3: "degraded"`.

### 7.3 Expected counts and statistical power

| | Historical (accepted at seed) | Monday batch (unassigned) | Total |
|---|---|---|---|
| Poisson events (E) | ≈ 20 | ≈ 5 (final weekend sessions) | ≈ 25 |
| Planted | 0 | 7 | 7 |
| **Total** | **≈ 20** | **≈ 12** | **≈ 32** (range across seeds roughly 24–42) |

**Onset power (prototype Monte Carlo, 2,000 seeds, this session plan, accepted-only history, Bonferroni m = 2, Holm over 4 clusters, threshold 0.01):**
- LC-A reaches `regression-likely` on **≈ 71 %** of seeds.
- The flat clusters (LC-B, C, D) reach `regression-likely` on **≈ 0 %** of seeds and `inconclusive` on < 1 %.
- **≈ 41 %** of seeds meet the full demo criteria (LC-A regression-likely and every cluster with ≥ 2 historical events).

These numbers come from a throwaway Python prototype of the plan above, not from `seedgen`. They are re-measured by `pnpm seed power` once the generator exists (§14.4 E7), and the doc gets updated with the measured values. Worked expectation: with k₁ = 0 events on 1,280 + 1,280 km and k₂ = 9 on 1,760 km, π₀ = 1760/4320 = 0.407, p_raw = π₀⁹ ≈ 3.1e-4, p_scan ≈ 6.2e-4, Holm x 4 ≈ 2.5e-3, which is `regression-likely`.

### 7.4 Per-event attributes (`EventSpec`)

`{eventId, sessionId, vehicleId, variant, build, occurredAt, odd[], light, weather, archetype (internal only), roles[], quirks[], frameCount, frameTimes[], note, summary, descriptionAdf, monday: boolean}`. `archetype` and `roles` exist only inside the generator and the truth file. They are never written to Jira.

- **Frame count:** 1–4, with P(1, 2, 3, 4) = (0.15, 0.40, 0.30, 0.15). Constraint: at least one event with 1 frame and one with 4 per seed.
- **Frame times** relative to takeover: 1 → [0]; 2 → [−1, 0]; 3 → [−2, −1, 0]; 4 → [−3, −2, −1, 0] s.

### 7.5 Monday batch and "since last triage"

- `monday = true` for events from final-weekend sessions and for all planted events.
- `triagedMark = anchor − 3 d, 17:00 UTC` (Friday evening). It is written to `triaged:<projectKey>` with `by = <admin accountId>` and `via: "demo-seed"`.
- Monday events have `occurredAt` after the mark, so the board's "new since last triage" equals the Monday batch.

---

## 8. Telemetry CSVs

### 8.1 File shape

- **Window:** 30 s raw, from `t_to − 22 s` to `t_to + 8 s`. This covers the engine's [−15, +5] s window with margin.
- **Time column:** `t` in seconds, starting at a session-relative offset (for example 1834.20) to exercise offset handling. Some quirk files use `time_ms` (§8.4).
- **Rate:** per vehicle (50, 100 or 200 Hz). Sample jitter ±2 % of dt (bounded uniform) on V-02 only, to exercise resampling.
- **Line 1:** `# SYNTHETIC DATA - Takeover Triage seedgen <ver> - seed <n> - <eventId> - not real vehicle data` (see §1 for the parser requirement). Quirk Q9 omits it.
- **Columns (default):** `t,speed,yaw_rate,lane_offset,steer_torque,brake,ttc,lane_conf,takeover,accel_x,ad_mode`. `accel_x` and `ad_mode` (`ON`/`OFF` strings) are decoys. They must be dropped by mapping, and they test NaN counting for non-numeric cells.
- **Sign convention:** `lane_offset` > 0 means left of lane centre; `yaw_rate` > 0 means turning left; `steer_torque` > 0 means a left torque.
- **Size:** about 6,000 rows at 200 Hz, ≈ 450 KB, well under the 5 MB intake limit.

### 8.2 Channel models (baseline, before archetype overlay)

| Channel | Unit | Baseline model | Noise model | Quantisation |
|---|---|---|---|---|
| `speed` | m/s | route mean v₀ (highway U(27, 33), rural U(18, 24), urban U(12, 16)) + 0.3 · sin(2πt/T), T ∈ U(12, 20) s | white N(0, 0.05) | 0.01 |
| `yaw_rate` | rad/s | `v / R` on curves (signed), 0 on straights | bias N(0, 0.002) per file + white N(0, 0.003) | 0.0001 |
| `lane_offset` | m | AR(1) wander φ = 0.98, σ_innov 0.01, plus the archetype drift | white N(0, 0.02); when lane_conf < 0.3, extra N(0, 0.08) and 10 % sample-and-hold dropouts | 0.001 |
| `steer_torque` | Nm | driver hands-on AR(1) φ = 0.95, σ 0.3, plus the archetype spike at t_to | white N(0, 0.05) | 0.01 |
| `brake` | 0..1 pedal | 0, plus the archetype profile | none | 0.004 |
| `ttc` | s | 10.0 when there is no lead ("no target", the engine clamps at 10); with a lead: gap / closing speed | white N(0, 0.05) when < 10 | 0.01 |
| `lane_conf` | 0..1 | U(0.80, 0.95) per file, slow AR(1) | white N(0, 0.02), clipped to [0, 1] | 0.01 |
| `takeover` | 0/1 | 0 → 1 at t_flag = t_to + jitter, jitter U(−0.15, +0.15) s (ARCH §9 noise) | – | – |
| `accel_x` | m/s² | finite difference of speed + N(0, 0.2) | – | 0.01 |
| `ad_mode` | string | `ON` before t_flag, `OFF` after | – | – |

All Normal draws are `irwinHallNormal` (§4.1). Smooth onsets use `smoothstep` (polynomial, no `exp`).

### 8.3 Archetype overlays (time relative to t_to = 0)

| Archetype | Overlay |
|---|---|
| LC-A lane-loss | `lane_conf` falls from baseline to c_min over 0.5 s starting at −t_d. Then `lane_offset` drifts with a constant rate r (signed, left for P1a) until 0. A torque spike of size τ_s at 0 lasts 0.4 s. No lead (`ttc` = 10). `brake` = 0 |
| LC-B late-brake | A lead is present from −8 s. `ttc(t) = ttc₀ · q^(t + 5)` for t ∈ [−5, 0], with q ∈ [0.65, 0.80] (keeps the relative 1 s drop ≤ 0.35, away from R-CI-1). The driver brakes at 0: pedal 0.5–0.8, ramped in 0.2 s, decel 5–7 m/s². Lane stable |
| LC-C lateral-drift | Constant curve R ∈ [500, 900] m (sign left for P1b). `lane_conf` stays at baseline. Assist fade: torque baseline is lowered from −6 s, then `lane_offset` drifts outward at rate r from −t_d. Moderate torque spike at 0 |
| LC-D phantom-brake | No lead (`ttc` = 10). The system brakes at −t_b ∈ [0.8, 1.5] s with decel 4.0–5.5 m/s² (pedal channel stays 0, because the system brakes; speed drops). The takeover flag is set when the driver overrides at 0. Lane stable |
| NOVEL-1 | `lane_conf` drops to ≤ 0.10 within 0.2 s at −t_d ∈ [0.3, 0.7] s. `lane_offset` jumps with an S-shaped swerve (yaw deviation 0.06–0.10 rad/s). Large torque spike. Speed 19–23 m/s (work-zone limit) |

### 8.4 Format quirks (deterministic assignment)

Each quirk is applied to exactly one Poisson event, chosen by `fork("quirk:<id>")` among eligible events. Planted events stay clean, apart from AMB1, which has none. Each quirk has an expected engine reaction, asserted in tests.

| Id | Quirk | Eligible | Expected engine behaviour |
|---|---|---|---|
| Q1 | `;` delimiter with decimal comma | any | Detected; values equal to the clean file within quantisation |
| Q2 | `speed_kph` column in km/h | any | Auto-suggested multiplier 1/3.6; features identical to the m/s version |
| Q3 | `time_ms` instead of `t` | any | ms→s multiplier |
| Q4 | No `takeover` column; `ad_active` 1/0 column instead | any | Inverted flag mapping |
| Q5 | No flag at all (no `takeover`, no `ad_active`) | LC-A, LC-D | Heuristic takeover time, chip "takeover time: low confidence" |
| Q6 | `lane_conf` column missing | LC-A (Monday only) | R-LD-1 fires (`lateral-drift`, "lane_conf unmapped"). Truth records `expectedMismatch: "type"` |
| Q7 | 0.7 s gap in raw samples inside [−15, −5] s | any | Masked samples; channel stays usable (> 80 % valid) |
| Q8 | 3 rows out of order + 1 duplicate `t` | any | Sorted; duplicate warning |
| Q9 | UTF-8 BOM and no `#` comment line | any | BOM stripped (honesty is still carried by the attachment name, issue banner and labels) |

### 8.5 Feature targets per archetype (PRE-REGISTERED)

The generator draws the archetype parameters so that the engine's features (ARCH §5.3) land in these ranges, with |rule margin| ≥ 1 sᵢ for non-boundary events. Conformance is a generator test (§14.3 G-T3), not a tuning target for the engine.

| Feature (sᵢ) | LC-A lane-loss | LC-B late-brake | LC-C lateral-drift | LC-D phantom-brake | NOVEL-1 |
|---|---|---|---|---|---|
| F1 peakLatOffset (0.15 m) | 0.70–1.00 | 0.02–0.15 | 0.70–1.00 | 0.05–0.20 | 0.90–1.40 |
| F2 driftLatency (0.75 s) | 1.2–2.2 | 0 | 3.0–5.0 | 0 | 0.3–0.7 |
| F3 minTtc (0.75 s) | 10 | 0.70–1.25 | 10 | 10 | 10 |
| F4 brakeOnsetTtc (0.5 s) | 10 | 0.6–1.0 | 10 | 10 (pedal 0) | 10 |
| F5 peakDecel (1.0 m/s²) | 0–1.0 | 5.0–7.0 | 0–1.0 | 4.0–5.5 | 0.5–2.0 |
| F6 minLaneConf (0.10) | 0.05–0.25 | 0.80–0.95 | 0.70–0.95 | 0.80–0.95 | 0.00–0.10 |
| F7 torqueSpike (1.0 Nm) | 3.5–5.5 | 0.3–1.5 | 2.0–3.5 | 0.5–1.5 | 6.0–8.0 |
| F8 speedAtTakeover (4.0 m/s) | 27–33 (hwy) / 18–24 (rural) | 10–16 | 18–24 | 24–30 | 19–23 |
| F9 yawRateDev (0.02 rad/s) | 0.005–0.02 | 0–0.01 | 0.02–0.05 | 0–0.01 | 0.06–0.10 |
| F10 ttcDropRate (0.15) | 0 | 0.20–0.35 | 0 | 0 | 0 |
| Rule hit (ARCH §5.4) | R-LL-1 | R-LB-1 | R-LD-1 | R-PB-1 | R-LL-1 |

A design check with these ranges (expected values, not measured): the mean within-LC-A pairwise distance is ≈ 0.55 (below τ = 1.0). NOVEL-1 to the LC-A profile is ≈ 1.6 on D_sig + 0.17 on D_cond, which is above τ.

---

## 9. Synthetic dashcam frames

### 9.1 Renderer

- **Output:** RGBA `Uint8ClampedArray`, 1280x720 (`fast`: 960x540).
- **Pipeline:** integer and standard `Math.*` maths (§4.3), then the variant tone curve, then the watermark, then `jpeg-js` encode (quality 85; `fast` 80), then the COM-segment splice (§9.3).
- **Scope (simplified 2026-11-19):** the renderer draws only what the image metrics (ARCH §5.5) need: sky gradient, road, lane lines, a sun glare blob, night darkening, rain blur/streaks, and the SYNTHETIC watermark. There are no lens flares, headlight or traffic cones, overpass, hills, hood band or road curvature.
- **Scene layers, back to front:**
  1. **Sky:** a vertical gradient from a palette per light condition (clear, warm low-sun, overcast, near-black night).
  2. **Road:** a straight perspective trapezoid with its vanishing point at the horizon (cam-A at 0.42 H; cam-B at 0.40 H). The asphalt has a 2-octave value-noise texture with amplitude ±12 luma, which sets the baseline Laplacian variance.
  3. **Lane lines:** left solid, right dashed, at fixed screen positions. Pre-tone luma is ≤ 215 (§9.4 constraint).
  4. **Condition layers** (§9.2).
- **Tone curve per variant:** cam-A `y' = y` with a soft knee above 230. cam-B `y' = min(255, 1.12 · y)` with no knee. This is the fictional "narrower dynamic range" that makes low sun saturate on cam-B.

### 9.2 Conditions

| Condition | Rendering |
|---|---|
| `day` | Clear sky gradient (top 150 → horizon 210 luma equivalent), dry asphalt |
| `low-sun` | Warm sky. A **sun glare blob**: a disc near the vanishing point (elevation 0.30–0.38 H) with core radius r_c and a bloom falloff `1 / (1 + (d/r_b)²)` added to RGB. LC-A on cam-B: r_c sized for sunBlob 0.008–0.020. cam-A low-sun decoy frames: sunBlob 0.001–0.003 (no chip). AMB1: 0.003–0.005 |
| `night` | **Darkening:** global gain 0.15 with a near-black sky |
| `rain` | **Blur and streaks:** contrast pulled toward fog grey (lerp 0.45), three passes of an integer box blur (radius 3, which approximates a Gaussian), diagonal streaks (alpha 0.15). Combinable with `night` |
| LC-D and NOVEL-1 | No extra layer (cut 2026-11-19: no overpass, no work-zone cones). LC-D renders as `day`; NOVEL-1 as `day` with the overcast sky palette. Both are told apart by their signals, not their frames |

### 9.3 SYNTHETIC watermark (every frame)

- **Visible:** bottom-left box, 8 px margin, filled with luma 96. Text in luma 200, from an embedded 5x7 bitmap font scaled x3: `SYNTHETIC - Takeover Triage demo - seed <n> - <eventId>`. The second line, x2 scale: `Not real vehicle data`. The box stays within mid-grey (30 < Y < 250), so it cannot trigger the glare, sunBlob or dark metrics (ARCH §5.5). Including the box in metric computation is deliberate, because real intake would include it too.
- **Embedded:** a JPEG COM segment (`FFFE`) spliced right after SOI: `SYNTHETIC; generator=takeover-triage-seedgen/<ver>; seed=<n>; event=<eventId>`. Splicing bytes ourselves avoids relying on a `jpeg-js` comment option.
- **File name:** `SYNTHETIC_<eventId>_f<k>.jpg`.

### 9.4 Metric targets (PRE-REGISTERED; chip thresholds from ARCH §5.5)

| Frame condition | meanY | p95 | glare (Y ≥ 250) | sunBlob | lapVar | contrast | Expected chip |
|---|---|---|---|---|---|---|---|
| day / dry | 100–150 | 180–235 | < 0.01 | < 0.002 | 150–400 | 45–70 | `normal` |
| low-sun, cam-B (LC-A) | 120–170 | 255 | 0.03–0.09 | 0.008–0.020 | 150–400 | 50–80 | `low-sun-glare` |
| low-sun, cam-A (decoy) | 110–160 | 235–250 | < 0.02 | 0.001–0.003 | 150–400 | 45–75 | `normal` |
| night | 15–35 | ≤ 145 | < 0.005 | < 0.001 | any | any | `night` |
| rain (day) | 90–130 | 150–200 | < 0.005 | < 0.001 | 20–50 | 25–38 | `blur-rain` |
| night + rain | 12–30 | 80–130 | < 0.003 | < 0.001 | < 50 | < 30 | `night`, `blur-rain` |

**Constraint:** no scene element other than the sun glare blob is rendered with pre-tone luma > 215. After the cam-B gain (x1.12) that is ≤ 241 < 250, so lane lines cannot create glare components. SPIKE-G3 covers JPEG q85 blocking artifacts raising `lapVar` in rain frames, and re-checks every band against the simplified renderer (2026-11-19; the night p95 lower bound was dropped because there are no headlight cones or lamps). The fallback is to render rain frames with lower asphalt texture amplitude, or encode them at q90.

**Per-event truth chips** are the chips the event's frames *should* produce: the median rule applied to the per-frame expected metrics. Expected and computed chips are compared in tests (§14.4 E6).

---

## 10. Issue text

### 10.1 Driver-note pool (shared on purpose)

Notes are short and first-person, contain no names, and are drawn 50 % from a **shared pool** and 50 % from the cluster's own pool (stream `event:E-xxx:text`). The planted pairs override this (§7.2). An optional suffix (40 %) adds context such as "on the highway loop", "around 5pm" or "wet road", consistent with the session tags.

| Pool | Phrases (excerpt) |
|---|---|
| Shared | "car drifted left, took over" · "took over, didn't like it" · "felt unsafe, took control" · "system gave up, I took over" · "it braked hard, I took over" |
| LC-A | "drifted towards the line, I took over" · "LKA let go, took over" · "lines disappeared in the sun, took over" · "lost the lane, grabbed the wheel" |
| LC-B | "braked too late behind the car in front" · "had to stomp on the brake" · "closing too fast, I braked" |
| LC-C | "steering went light near the exit, grabbed the wheel" · "ran wide on the curve" · "didn't hold the bend, took over" |
| LC-D | "slammed the brakes for nothing" · "random hard brake under the bridge" · "phantom brake, overrode it" |
| NOVEL-1 | "lines ended at the road works, swerved, took over" (own pool only, so its text does not give it away as novel compared with LC-A's "lost the lane") |

The shared pool overlaps the cluster pools in meaning, so text similarity alone cannot separate the clusters. That is the point of the product.

### 10.2 Templates

- **Event summary:** `[SYNTHETIC] Takeover: <note> (<vehicleLabel>, <build>)`. Truncated to 120 characters.
- **Event description (ADF):**
  1. An info panel: "**Synthetic demo data.** Generated by Takeover Triage (seed <n>, <eventId>). Not real vehicle, fleet or driver data."
  2. "Driver note: <note>".
  3. A table: Vehicle, Build, Drive session (label), Occurred at (synthetic), ODD tags.
  4. "Raw files: see attachments (telemetry CSV, dashcam stills, all synthetic)."
- **Labels:** `tt-synthetic`, `tt-takeover`. **No cluster or archetype label.**
- **Reporter:** the seed consumer creates issues **asApp** (ARCH D10), so Jira would record the app's bot user. The seed sets `reporter` to the admin who clicked "Load demo data" when the app may set it (needs the Modify Reporter permission; part of SPIKE-S3), and otherwise leaves the app user. Either way there are no fake users, and the description banner says "Created by Takeover Triage demo seed".
- **Cluster issues** (created in S6 from engine proposals): the summary is `[SYNTHETIC] Cluster: <deterministic name>` (ARCH §5.8), with labels `tt-synthetic`, `tt-cluster`, and the same banner plus "Created from the engine's proposal during demo seed."

---

## 11. Scenario-test issues and the deliberate gap

Ten issues, labelled `tt-synthetic` and `tt-scenario`, plus tag labels with the prefixes `type:`, `variant:`, `cond:`, `odd:` (ARCH §5.10). SCN-07 carries its tags in a `tt.scenario` property instead of labels, to exercise both tag paths. The summary format is `[SYNTHETIC] Scenario: <title>`.

| Id | Title (fictional) | type | variant | cond | odd | Role in the demo |
|---|---|---|---|---|---|---|
| SCN-01 | Lead decelerates, night, urban | late-brake | cam-A | night | urban | **Covers LC-B** |
| SCN-02 | Lead stops, daytime highway | late-brake | any | normal | highway | Near miss for LC-B (cond, odd) |
| SCN-03 | Overpass shadow, no object | phantom-brake | cam-A | normal | highway | **Covers LC-D** |
| SCN-04 | Wide curve, assist hand-back | lateral-drift | any | normal | rural | **Covers LC-C** via the wildcard |
| SCN-05 | Faded markings in rain | lane-loss | cam-A | blur-rain | rural | Matches LC-A on type only |
| SCN-06 | Lane-loss at night (no variant label) | lane-loss | *(absent)* | night | urban | Matches LC-A on type only. Shows that an **absent dimension does not cover** |
| SCN-07 | Motorcycle cut-in (tags in property) | cut-in-response | cam-B | normal | highway | No cluster. Exercises the `tt.scenario` path and the 2D grid |
| SCN-08 | Crosswind drift | lateral-drift | cam-B | normal | highway | Partial for LC-C (odd), but LC-C is already covered by SCN-04 |
| SCN-09 | Phantom brake in low sun | phantom-brake | cam-B | low-sun-glare | highway | Gives the low-sun row a test in another column, so the grid shows **one** red cell, not a red row |
| SCN-10 | Late brake, night and rain | late-brake | cam-A | night, blur-rain | urban | Second cover for LC-B (set containment, §1) |

**The deliberate gap.** LC-A's expected signature is `lane-loss x cam-B x {low-sun-glare} x highway`. No test matches `type` plus any other dimension:
- SCN-05 and SCN-06 match `type` only.
- SCN-09 matches `variant`, `cond` and `odd`, but not `type`.

The verdict is therefore **uncovered**: "0 scenario tests cover lane-loss x low-sun-glare x cam-B x highway" (PRD US-17 AC3). In the 2D view (US-17 AC4), the cell (low-sun-glare, lane-loss) shows ≈ 14 events and 0 tests in red. The "create scenario stub" demo click closes exactly this gap. LC-B, LC-C and LC-D are covered. NOVEL-1 is a singleton and stays below the default `minEvents = 2` in `list-coverage-gaps`.

If a random seed puts LC-A's majority on rural sessions, the gap message names `rural` instead. That is still uncovered (SCN-05 is cam-A and blur-rain).

---

## 12. Teams and owner mapping

- **Components** (created with the demo project, ARCH §9): `Perception`, `Planning`, `Controls`. Their **component lead is the admin** running the seed. That is the only real person involved; no fake users are created.
- **Routing rules** (written to `config:<projectKey>.routing[]`, ARCH §5.11), first match wins:
  1. `type = lane-loss` → Perception
  2. `type = phantom-brake` → Perception
  3. `type ∈ {late-brake, cut-in-response}` → Planning
  4. `type = lateral-drift` → Controls
  5. default → project lead
- **Teamwork Graph:** the seed does **not** create Atlassian Teams. That would create real organisation objects on the judge's site, and the app cannot call TWG asApp anyway (ARCH §11). The admin page offers "Bind component to one of my teams" (TWG team picker, asUser). Unbound, routing reports `source: component`. Bound, it reports `source: twg` with that team's real members, shown in the UI only.
- **Truth:** expected owners are LC-A → Perception, LC-B → Planning, LC-C → Controls, LC-D → Perception, NOVEL-1 → Perception (lane-loss). AMB2 is "Planning or Planning": either `late-brake` or `cut-in-response` routes to Planning, which keeps the routing test stable on a boundary event. If AMB2 becomes `unknown`, it falls to the default rule.

---

## 13. Expected outcomes on the default seed

### 13.1 Choosing the default seed (published rule)

`DEFAULT_SEED` is the **smallest seed ≥ 2026** that, with `params-v1` frozen, meets all demo criteria:
1. LC-A is `regression-likely` on 4.12.0.
2. Every latent cluster has ≥ 2 historical events.
3. P1a/P1b and P3a/P3b split, and P1b joins LC-C (SM-2, SM-3).
4. NOVEL-1 is novel.
5. All four coverage verdicts match §11.

`pnpm seed pick-default` computes the value. It is committed with the `params-v1` tag (planned Fri Dec 4). The admin page and seed report state: *"The default seed was picked because it exercises every demo state. About 4 in 10 random seeds do (measured: X %). Try any seed: the mechanisms are the same, but verdicts follow the generated data and can be inconclusive."* X comes from E7 (§14.4), not from the prototype estimate.

### 13.2 What a judge should see (default seed, `anchor = 2026-11-16` for fixtures)

| Surface | Expected |
|---|---|
| Board | 4 accepted clusters ("Lane-loss · low sun · cam-B", "Late-brake · night · cam-A", "Lateral-drift · cam-B", "Phantom-brake · cam-A"), about 12 new since the last triage, a novel queue containing NOVEL-1 (and AMB2 if it became `cut-in-response` in an empty bucket, which shows as "first of its kind") |
| Onset | LC-A `regression-likely`, onset 4.12.0, with raw, scan and Holm p-values shown. Others `no-evidence` or `not-enough-data` |
| Coverage | LC-A uncovered (red cell); B, C, D covered |
| Pairs | P1a → LC-A, P1b → LC-C (same text, different clusters; the why-table leads with F6 and F2). P3a → LC-B, P3b → LC-D (why-table leads with F3 and F4). P1b's neighbours include the "steering went light…" member |
| Calibration (stretch) | "Check calibration first" on LC-D only |
| Rovo starters | "Which clusters started on 4.12.0?" → LC-A. "What's novel since I last triaged?" → NOVEL-1 (+ any boundary event). "Which clusters have no scenario coverage?" → LC-A |

The bot-QA (ARCH §16.3) asserts these against the default seed, using Jira keys resolved through `seed:state`.

---

## 14. Ground truth and automated accuracy tests

### 14.1 Where truth lives

- **Nowhere in Jira.** Truth is `buildTruth({seed, anchorDate, profile, generatorVersion})`, which is pure and cheap.
- The admin-only seed report regenerates it from `seed:state` on demand. The CLI writes it to `truth.json` for fixtures and evaluation.
- Because the engine never imports `seedgen/truth` (an ESLint boundary rule), the engine cannot read truth even by accident.

### 14.2 Schema (`truth.json`, v1)

```json
{
  "v": 1, "generator": "1.0.0", "profile": "demo-v1", "seed": 2026, "anchorDate": "2026-11-16",
  "paramsHash": "sha256:…",
  "clusters": [
    { "id": "LC-A", "expectedType": "lane-loss", "variant": "cam-B", "chips": ["low-sun-glare"],
      "odd": "highway", "ratesPer1000km": {"4.11.0": 0.1, "4.11.3": 0.1, "4.12.0": 8.0},
      "trueOnsetBuild": "4.12.0", "owner": "Perception", "coverage": "uncovered",
      "calibrationCausal": false }
  ],
  "events": [
    { "eventId": "E-017", "latent": "LC-A", "planted": false, "monday": false,
      "roles": [], "boundary": [], "quirks": ["Q7"], "expectedMismatch": null,
      "expectedType": "lane-loss", "expectedChips": ["low-sun-glare"],
      "frames": [ { "k": 1, "tRel": -1, "condition": "low-sun", "expectedChips": ["low-sun-glare"] } ],
      "note": "LKA let go, took over", "sessionId": "DS-0031" }
  ],
  "pairs": {
    "sameTextDifferentSignal": [["P1a", "P1b"], ["P3a", "P3b"]],
    "differentTextSameSignal": [["P1b", "E-009"]],
    "sm3": "ok"
  },
  "sessions": [ { "sessionId": "DS-0031", "vehicleId": "V-02", "build": "4.12.0", "km": 212.4, "odd": ["highway","low-sun","dry"] } ],
  "scenarios": [ { "id": "SCN-04", "tags": {"type": "lateral-drift", "variant": "any", "cond": ["normal"], "odd": ["rural"]}, "intendedCovers": ["LC-C"] } ],
  "expectedCoverage": { "LC-A": "uncovered", "LC-B": "covered", "LC-C": "covered", "LC-D": "covered" },
  "expectedOwner": { "LC-A": "Perception", "LC-B": "Planning", "LC-C": "Controls", "LC-D": "Perception" }
}
```

`events[].roles` uses the role ids from §7.2. `boundary` lists the rule or chip ids that the event straddles. Both are excluded from the "clean" accuracy metrics and reported separately (§14.4).

### 14.3 Generator tests (`packages/seedgen/test`, Vitest + fast-check)

| Id | Property | Runs |
|---|---|---|
| G-T1 | **Determinism:** `generate(cfg)` twice gives an identical manifest of SHA-256 hashes over every file; golden manifests for seeds 1–5 match on Node 22 and Node 24 (§4.3) | fast-check over seeds, 50 runs (frames `fast`); CI matrix Node 22/24 |
| G-T2 | **Substream stability:** changing LC-B's rates leaves every non-LC-B event's CSV and JPEG bytes unchanged | 20 seeds |
| G-T3 | **Archetype conformance:** the engine's features for non-boundary, non-quirk-Q6 events are within the §8.5 ranges, with the expected rule and every rule margin ≥ 1 | seeds 1–50 |
| G-T4 | **Render conformance:** per-frame engine metrics fall in the §9.4 bands for ≥ 99 % of frames; the expected chips match for ≥ 99 % of non-boundary frames | seeds 1–20 |
| G-T5 | **Watermark:** every JPEG has the COM segment and, after decode, the watermark box pixels within ±12 luma of the template | all generated frames |
| G-T6 | **Honesty lint** (§16) | every generated text and file name |
| G-T7 | **Quirks:** each Q1–Q9 file parses with the expected mapping and warning, and Q1/Q2/Q3/Q8 give features equal to the clean rendering of the same event within quantisation | seeds 1–20 |
| G-T8 | **Sizes:** the `tt.event` property is ≤ 12 KB and `tt.thumbs` ≤ 12 KB (ARCH §6.1); CSV ≤ 1 MB; JPEG ≤ 400 KB | seeds 1–20 |
| G-T9 | **N/A (cut 2026-11-19).** Was: `dmath` accuracy and bit stability. The library is dropped; byte stability is G-T1 on the pinned Node versions | – |
| G-T10 | **Plan constraints** (§6.2) hold for every seed: eligible sessions exist for every cluster x build | 1,000 seeds (plan only, fast) |

### 14.4 Engine accuracy against truth (`tools/eval`)

These tests run the **full** pipeline: generate files → `engine.processEventFiles` → history proposal (HAC) → accept as at seed time → assign the Monday batch (kNN + τ) → onset → coverage → routing. Thresholds are frozen with `params-v1`.

| Id | Metric | Seeds | Pass |
|---|---|---|---|
| E1 (SM-2) | Both same-text pairs land in different clusters, with the reason in the why-table | 1000–1019 | ≥ 19/20 seeds |
| E2 (SM-3) | P1b lands in the cluster containing the "steering went light…" member | 1000–1019 with `sm3: ok` | ≥ 95 % |
| E3 (SM-4) | **Adjusted Rand index** between engine clusters (novel = singleton) and latent labels, over all events including boundary | 1000–1019 | mean ≥ 0.8; also report the minimum and the value excluding boundary events |
| E4 | Novelty: NOVEL-1 is novel; non-planted, non-boundary events falsely flagged novel per seed | 1000–1019 | NOVEL-1 novel on ≥ 19/20; mean false novel ≤ 1 |
| E5 | Takeover type accuracy on clean events (no boundary, no Q6) | 1000–1019 | ≥ 0.95 |
| E6 | Chip accuracy per event on clean events (exact set match) | 1000–1019 | ≥ 0.95 |
| E7 | **Onset behaviour** in two modes. *Pipeline mode* on 1000–1019: report LC-A's verdicts. *Power mode* (onset only, truth membership, no frames) on 0–999: report LC-A power and the flat-cluster false-positive rate | 0–999 | flat clusters `regression-likely` ≤ 1 %; LC-A power is **reported, not gated** (prototype ≈ 71 %) |
| E8 | Coverage verdicts equal an **independent oracle** (a 40-line re-implementation in `tools/eval`, not the engine) applied to the realised cluster signatures | 1000–1019 | 100 % |
| E9 | Routing: `suggest-owner` rule and component equal `expectedOwner` (TWG unbound) | 1000–1019 | 100 % on clean clusters |
| E10 | Default seed: all §13.1 criteria | `DEFAULT_SEED` | must pass (CI gate) |

**Reporting:** `tools/eval` writes `eval-report.json` (and a markdown table for the repo README) with per-seed numbers, the frozen params hash and the generator version. Boundary and quirk events are always shown separately, so "we only report the easy cases" cannot be claimed. Seeds 1–5 are tuning seeds and never appear in the reported metrics.

---

## 15. Loading the data

### 15.1 In-app "Load demo data" (judge path, preferred)

There are no tokens, scripts or external services. It runs per ARCH D10: the admin page (UI Kit, asUser) does the project step, then a `tt-seed` queue consumer (asApp) does the rest. The browser-driven fallback is SPIKE-S3.

| Step | Work | Calls (approx.) | Notes |
|---|---|---|---|
| S0 | Admin page: detect an existing demo (`seed:state`, JQL `labels = tt-synthetic`). Offer **Reset** or **Keep**. Show the default seed, editable as a uint32 | 1–2 | |
| S1 | Create project `TTDEMO` "Takeover Triage Demo [SYNTHETIC]" and components (asUser) | 4 | SPIKE-S1. Fallback: the admin picks an existing project; label-only typing |
| S2 | `startSeed({projectKey, seed, anchorDate, frames})` → `planFleet` → write vehicles (3) and drive sessions (40) to custom entities | 43 entity writes | |
| S3 | Scenario issues: bulk create 10 with tag labels; `tt.scenario` property on SCN-07 | 1 bulk + 1 PUT | |
| S4 | **Generate and compute**, about 8 events per queue step: `generateEventFiles` → `engine.processEventFiles` → `EventDraft` | CPU ≈ 0.2–0.3 s per frame (SPIKE-G2) | Bytes for attachments are kept for S9 only if they fit the step; otherwise regenerated in S9 (deterministic, so identical) |
| S5 | Bulk create event issues (≤ 50 per call); PUT `tt.event`, `tt.thumbs` and `tt.seed = {seed, gen, itemId}`; upsert `event` entities | 1 bulk + ≈ 96 PUTs + 32 writes | |
| S6 | Run the engine's **proposal (HAC) over the historical events only**. Create one `tt-cluster` issue per proposal of size ≥ 2 (deterministic names), link the members, write `tt.triage = {state: accepted, by: <admin>, via: "demo-seed"}` | ≈ 5 creates + ≈ 20 links | The truth is **not** used. If the engine mis-groups history, the board shows it, and the seed report's ARI says so |
| S7 | Leave the Monday batch unassigned; write `triaged:<projectKey>`; write the routing config | 2 | |
| S8 | Recluster, onset and coverage caches, board cache → progress shows **"Board ready"** | – | Target ≤ 60 s from click (PRD SM-1, SPIKE-S2) |
| S9 | **Lazy attachments:** upload each CSV and its frames (multipart, asApp) | ≈ 32 CSV + ≈ 80 JPEG | SPIKE-I2 (server side). The board shows "raw files uploading". Fallback: skip; thumbnails remain |
| S10 | Seed report (admin only): counts, the planted list, the default-seed rule, ARI of this seed against regenerated truth, timings | – | |

**Idempotency and retries:** each step checks `seed:state` and the `tt.seed.itemId` of existing issues before creating anything (JQL on the property via `jira:entityProperty` if SPIKE-E1 passes; otherwise the `seed:state` id list). Steps use `retryContext`, and a 429 backs off via `delayInSeconds` (ARCH §15 #15).

**Remove demo data:** as in ARCH §9: issues labelled `tt-synthetic` in the demo project, entities with `synthetic = true`, the `seed:*` keys and the seeded routing config (only if it is unchanged since seeding). Nothing else.

**Fast mode:** `frames: "fast"` (960x540, q80) and at most 2 frames per Monday event. It is offered automatically if S4 timings on the site exceed budget. Chip thresholds are resolution-independent by construction (fractions and per-pixel statistics on a ≤ 640 px downscale), and G-T4 also runs on `fast`.

### 15.2 Developer CLI (`tools/seed`, Node 24)

| Command | Does |
|---|---|
| `pnpm seed generate --seed 2026 --anchor 2026-11-16 [--frames full\|fast] --out fixtures/seed-2026/` | Writes `vehicles.json`, `drive-sessions.json` + `.csv`, `scenarios.json`, `issues.json` (summaries, ADF descriptions, labels), `events/E-xxx/{SYNTHETIC_E-xxx.csv, SYNTHETIC_E-xxx_f1.jpg…, tt.event.json, tt.thumbs.json}`, `truth.json`, `manifest.json` (SHA-256 of every file + generator version + params hash) |
| `pnpm seed verify --dir fixtures/seed-2026/` | Regenerates and compares hashes; recomputes `tt.event` from the files with the engine and diffs |
| `pnpm seed push --site <dev-site> --project TTDEV --seed 2026` | **Dev only.** Pushes issues, properties and attachments through Jira REST with the developer's own API token from env (`JIRA_EMAIL`, `JIRA_API_TOKEN`), never committed or shipped. Forge storage cannot be written from outside, so it then prints: "Open Takeover Triage setup → Developer → Import registry bundle, then Re-sync now". That dev-flagged admin action takes the `vehicles.json` + `drive-sessions.json` bundle; reconcile rebuilds the index (ARCH §7.5). Same labels and banners as the in-app path |
| `pnpm seed pick-default` | §13.1 rule; prints the seed and its criteria report |
| `pnpm seed power --seeds 0-999` | E7 power mode; updates §7.3 numbers |
| `pnpm seed samples` | Writes the files shipped in the intake modal (PRD US-05 AC4): `template.csv` (headers + 10 rows), `sample-lane-loss.csv` + 2 JPEGs, and `robot-estop.csv` (AMR e-stop columns for the generality demo, PRD §10). All marked synthetic |

Golden fixtures for seeds 1–5 (`fast` frames) are committed (ARCH §16.1). Seeds 1000–1019 are generated in CI and never committed, so nobody browses them while tuning.

---

## 16. Honesty and safety checks

Every seeded artifact carries at least two independent synthetic markers:

| Artifact | Markers |
|---|---|
| Issue (event, cluster, scenario) | `[SYNTHETIC]` summary prefix; ADF info-panel banner; label `tt-synthetic`; `synthetic: true` in `tt.event`; `tt.seed` property |
| CSV | `# SYNTHETIC …` first line (except Q9); file name prefix `SYNTHETIC_` |
| JPEG | visible watermark (2 lines); COM segment; file name prefix |
| Vehicle / session records | labels "SYN test vehicle NN" and "(synthetic)"; `synthetic: true`; `source: "demo-seed"` |
| Links accepted at seed | `tt.triage.via = "demo-seed"`; the panel shows "Accepted during demo seed" |

**Honesty lint (G-T6, CI):**
- Fails on any generated string or file name that matches a denylist: OEM and supplier brand names, real road identifiers (patterns like `A\d+`, `I-\d+`, `M\d+`), e-mail addresses, phone patterns, VIN-like 17-character strings, latitude/longitude pairs, and personal first and last names from a common-names list.
- Asserts that the `SYNTHETIC` markers are present on every artifact type.
- Fails if a latent id (`LC-`, `NOVEL`), an archetype name, or the words "ground truth" appear in any Jira-bound text.

**Other rules:**
- No driver identity anywhere. There is no driver field, so nothing can rank drivers (PRD principle 6).
- No safety claims in generated text. The fictional root-cause stories appear only in this document, the video narration and the seed report, each marked "fictional".
- The seed report and README say plainly: rates, archetypes and render conditions were chosen by the developer, and the accuracy numbers measure the engine against this generator, not against real fleets.

---

## 17. SPIKE register

| ID | Assumption | Test | When | Fallback |
|---|---|---|---|---|
| **SPIKE-G1** | **N/A (cut 2026-11-19).** Was: `jpeg-js` encoding byte-identical in Node 24 and Chromium. Moot: golden hashes are pinned to Node 22/24 in CI (§4.3), and cross-environment checks compare engine metrics within ±1 luma | – | – | (Former fallback is now the design) |
| **SPIKE-G2** | Server-side render + encode + decode + metrics for ≈ 80 frames at 1280x720 fits the seed budget inside a 512 MB function (estimated 0.2–0.3 s per frame; the simplified renderer should be at the low end) | Time S4 in a consumer on the demo site | Week 1, with SPIKE-S2 | `fast` frames; 8 → 4 events per step; 1024 MB for the seed consumer only |
| **SPIKE-G3** | The §9.4 bands are reachable with the simplified renderer after q85 JPEG (blocking raises `lapVar` in rain frames; chroma subsampling shifts glare around the sun) | G-T4 on seeds 1–20 | Dec 2 (generator day 2, MILESTONES) | Lower rain texture amplitude, q90 for rain frames, or re-pre-register the bands before the `params-v1` freeze |
| **SPIKE-G4** | The prototype power estimate (≈ 71 %) holds with the real generator and engine | E7 power mode | Dec 4 | Raise LC-A's 4.12.0 rate or the 4.12.0 session count *before* the freeze, and log it in the CHANGELOG |
| SPIKE-S1, S2, S3, I2, E1 | As defined in ARCHITECTURE §17 | – | – | – |

---

## 18. Traceability

| Requirement | Section |
|---|---|
| PRD US-01 AC1–AC7 (seed, honesty, idempotency, judge seed) | §5–§7, §13.1, §15.1, §16 |
| PRD US-02 / US-13 (non-seeded tickets, not-enough-data states) | §2.7, §7.3, §8.4 Q5–Q6 |
| PRD US-05 AC4 (sample and template CSV) | §15.2 `samples` |
| PRD US-07 / US-08 (signatures, chips) | §8.5, §9.4 |
| PRD US-14 (onset vs real km) | §6, §7.1, §7.3 |
| PRD US-15 (routing, TWG) | §12 |
| PRD US-17 / US-18 (coverage gap, stub) | §11 |
| PRD US-23 / US-24 (calibration, dHash; stretch) | §5.1 (dHash has no seeded showcase since the overpass layer was cut, §9.2; it is tested on fixtures) |
| PRD SM-1 to SM-4 | §13, §14.4, §15.1 |
| ARCH D4 (pure engine, same code path), D10 (seed consumer) | §2, §3, §15.1 |
| ARCH §16 (tests, bot-QA) | §13.2, §14 |
