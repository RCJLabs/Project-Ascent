# Project Ascent — Rebuild Plan

A full plan for the new app: a fully-offline climbing training PWA/TWA with structured
programs, a real program finder/personalizer, logging, progress analytics, notes and
project tracking, a gamified progression layer built entirely on real climbing, and
The Ascent as a rest-day game. Companion document to `AUDIT.md` (what the old app was
and why these choices).

Working title stays **Project Ascent** until branding is decided.

---

## 1. Vision

**One sentence:** a training plan in your pocket that turns real climbing into visible
growth — pick the right program, follow it, log honestly, and watch your climber (and
your actual climbing) level up.

**Three pillars:**

1. **Train** — programs, a finder that actually recommends well, personalization,
   session logging, protocol timers, warmups.
2. **Understand** — progress graphs, ACWR/load management, derived stats, notes,
   projects, plateau diagnosis.
3. **Grow** — the game layer: XP, avatar, skill trees, altimeter (Everest meter),
   challenge board. Plus The Ascent as the rest-day toy.

**Non-negotiable design principles** (inherited from what worked, enforced this time):

- **Real climbing is the only meaningful engine.** Game actions never out-reward real
  training (real ≥ 2× game, session ≈ 15% of a level, XP source-flagged
  `real`/`game`). Nothing on the challenge board or skill tree completes from gameplay.
- **The game protects the climber.** ACWR brake on effort bonuses, vitality penalties
  for overtraining and skipped warmups, rest days actively rewarded. The app should
  never gamify you into an injury.
- **Fully offline, no accounts, no servers.** Static hosting (GitHub Pages), data on
  device, export/import for backup. No API keys, no sign-in, no analytics calls
  required to function.
- **No god components.** One derived-state selector, one reward pipeline, systems never
  read raw logs directly. (The old app's 14.5k-line App.tsx is the cautionary tale.)
- **Content is data.** Programs, drills, glossary, milestones, Ascent cards — all
  versioned JSON/TS data files, never inlined into components.

---

## 2. Tech stack & platform

| Concern | Choice | Notes |
|---|---|---|
| Framework | Vite + React 19 + TypeScript (strict) | Familiar; keep. |
| Styling | Tailwind 4 + a small component kit built day one | Kit first prevents god-component drift. |
| State | Zustand slices + pure selector layer | Slices per domain (logs, program, game, settings); derived state via memoized selectors in `src/engine/`. |
| Charts | Recharts (lazy-loaded chunk) | Worked before. |
| Storage | IndexedDB via `idb`, versioned schema + explicit migrations | Split stores; see §3. Request `navigator.storage.persist()` on install — critical for an offline-only app. |
| Routing | Hash router (e.g. wouter) | GH Pages friendly, no 404 fallback games. |
| PWA | `vite-plugin-pwa` (generateSW), **precache the app shell** | The old app's "no precache" rule was an AI Studio/Cloud Run constraint. A fully-offline app must precache or first-launch-offline breaks. |
| Android | TWA (Bubblewrap/PWABuilder), new package id | `assetlinks.json` must sit at the *origin root* — if deployed at `rcjlabs.github.io/<repo>`, the `.well-known` file lives in the `rcjlabs.github.io` user-site repo, or use a custom domain. |
| Tests | Vitest on the pure engine modules | Economy, stats, ACWR, grade math, Ascent sim — all pure functions, all cheap to test. |
| Errors | Optional local error log surfaced in Settings | No Sentry unless wanted later. |

**Directory shape (enforces the architecture):**

```
src/
  content/        # programs.ts, drills.ts, glossary.ts, milestones.ts, ascent/…
  engine/         # pure logic, no React: stats.ts, economy.ts, acwr.ts, vitality.ts,
                  # finder.ts, scheduler.ts, bounties.ts, altimeter.ts, ascentSim.ts,
                  # rewards.ts (applySessionCompletion), derive.ts (deriveClimberState)
  db/             # idb wrapper, schema, migrations, export/import
  store/          # zustand slices
  features/       # one folder per screen: log/, plan/, progress/, projects/, game/, ascent/…
  ui/             # shared components (Button, Card, Sheet, StatBar, GradeSelect…)
```

**The two chokepoints (rule, not suggestion):**

- `deriveClimberState(logs, metrics, profile) → ClimberState` — the only function that
  reads raw logs. Everything (stats, vitality, streaks, altimeter, skill-tree progress,
  bounty checks, graphs) consumes its output.
- `applySessionCompletion(session, state) → RewardResult` — the only place XP/currency
  is granted for real activity. Idempotent via a `rewarded` flag per session.

---

## 3. Data model

### IndexedDB stores

| Store | Contents | Notes |
|---|---|---|
| `meta` | schemaVersion, appVersion, createdAt | Migrations keyed off schemaVersion. |
| `sessions` | one record per session, key `${date}#${n}` | Never a blob; queryable by date range. |
| `profile` | user profile, settings, equipment, injuries, goals | Small single record + goal/injury lists. |
| `programs` | custom/personalized programs; built-ins ship in the bundle | Built-ins referenced by id + contentVersion. |
| `projects` | project records | One system (see §5.8). |
| `metrics` | assessment time series, key = stable metric id | `{metricId, date, value}` rows. |
| `game` | XP, currency, skill unlocks, cosmetics, challenge board state, Ascent saves | |
| `media` | project photos (blobs), optional | Quota-aware; see risks §10. |

Export = one JSON file of everything (media optional/separate). Import validates
schemaVersion, migrates, and **never overwrites non-empty data without an explicit
"replace or merge" choice** (the old app's `hasRealData` guard, kept).

### Core types (abbreviated)

```ts
interface Program {
  id: string; name: string; subtitle: string; discipline: 'boulder'|'sport'|'both';
  gradeRange: {scale: 'V'|'YDS'; min: string; max: string};
  weeks: number;
  phases: Phase[];                       // {id, name, weekStart, weekEnd, description, goals[]}
  sessionTypes: SessionType[];           // stable ids + thematic display names
  constraints: Constraint[];             // structured, see below
  assessments: MetricId[];               // stable ids into a global metric registry
  nextPrograms: {id: string; reason: string}[];
  intro: {pitch: string; rhythm: string[]; graduation: string};
}

interface SessionType {
  id: string; name: string; icon: string; description: string;
  blocks?: ExerciseBlock[];              // strength-style sessions
  drillsByWeek?: Record<number, DrillRef>;  // week-keyed ONLY
  fields?: FieldId[];                    // extra logger inputs
}

interface ExerciseBlock {
  id: string; name: string;
  perPhase: Record<PhaseId, {rationale: string; exercises: Exercise[]}>;
}

interface Exercise {                     // structured, no prose blobs
  name: string; protocolId?: string;     // links to timer protocols (§5.4)
  sets?: number; reps?: string; load?: string; rest?: string; notes?: string;
}

type Constraint =                        // structured rules the scheduler enforces
  | {kind: 'min-gap-hours'; between: SessionTypeId[]; hours: number}
  | {kind: 'max-per-week'; type: SessionTypeId; count: number}
  | {kind: 'not-before'; type: SessionTypeId; before: SessionTypeId}   // no fingers day before perf
  | {kind: 'deload-week'; every: number; volumeScale: number; rpeCap: number};

interface Session {                      // always one record per session
  id: string; date: string;              // YYYY-MM-DD local
  programId?: string; sessionTypeId?: string; planned: boolean; completed: boolean;
  rewarded: boolean; mode: 'indoor'|'outdoor';
  rpe?: number; durationMin?: number; warmup?: boolean;
  drillId?: string; drillDone?: boolean;
  climbs: Climb[];                       // SINGLE source of truth
  exercises: LoggedExercise[];           // {blockId, name, sets: SetEntry[], done}
  restChecklist?: {hydration: boolean; mobility: boolean; zone1: boolean; sleep: boolean};
  conditions?: {tempFeel?: 'cold'|'mild'|'hot'; partners?: string[]; approachMin?: number};
  skillTags?: string[]; notes?: string;
  debrief?: {feel: 'tough'|'mixed'|'solid'; takeaway: string};
  deload?: boolean;
  projectAttempts: ProjectAttempt[];     // {projectId, count, highPoint?, outcome?, note?, appliedAt?}
}

interface Climb {                        // sends and attempts unified
  grade: string; scale: 'V'|'YDS'; count: number;
  result: 'send'|'attempt';
  style?: 'onsight'|'flash'|'redpoint';  // meaningful outdoors/on ropes
  name?: string; location?: string;      // named climbs get identity
}
```

Send counts, pyramids, PRs, altimeter height — all **derived** from `climbs`. The old
dual-write between `namedSends` and `sends` counters is gone.

Grades: V0–V17 and 5.4–5.15d ladders as before, plus **display conversion** to
Font/French as a setting (stored canonical, converted at render).

---

## 4. Content crossover (ported, restructured)

Everything here is a port job, not new writing — the prose is the old app's best asset.

1. **All 9 programs + 2 open modes** (Ground Zero → The Siege, General, Outdoor) into
   the typed schema: structured exercises with real `sets/reps/load/rest` fields parsed
   out of the prose strings, per-phase rationales kept verbatim, drills converted to
   library references, frequency/ordering prose converted into `Constraint[]` data
   (keep the prose too, as display text).
2. **Drill library as the single source** — the 108 drills, dedup'd against the 144
   inline copies, programs reference by id. Categories/discipline/level/equipment
   metadata kept; it powers the finder, custom builder, and bounty generation.
3. **Glossary** (8 categories) — powers inline term definitions in exercise names
   (keep the old matcher idea) and the Trivia toy if we ever want it back.
4. **Guides** — app guide, injury guide, outdoor guide; ported and re-edited to match
   the new feature set.
5. **Program intros, phase descriptions, progression graph** (`nextPrograms` with
   reasons) — kept as data.
6. **Coach trigger taxonomy** → rule-based **Coach's Corner** (§6.6): the old Coach
   Billy triggers (PR set, outdoor re-entry after 21 days, project escalation at
   5/10/20 attempts, hangboard gap, missing domain, night-owl session…) become
   deterministic tips with your own written content. No AI, and as a coach you can
   write sharper copy than Gemini did anyway.
7. **Assessment batteries** — per-program metric sets, moved to a global metric
   registry with stable ids (`max_hang_20mm`, `weighted_pullup`, `pullups`,
   `flexibility`, …) so history survives program edits.

---

## 5. Core features (the transfer list, specified)

### 5.1 Program Finder & Personalizer — the new centerpiece

Replaces both the dead quiz and the AI builder with a deterministic two-stage flow.

**Stage 1 — Find (recommendation):**
Inputs: discipline, top consistent grade, experience, primary goal (technique / power /
fingers / endurance / dynamic / general / pre-climbing), days per week, minutes per
session, equipment (wall, hangboard, campus, weights, none), active injuries, and
"coming off a break?".
Engine: score every program on goal match, grade-range fit, discipline, and
prerequisite readiness (The Siege checks the actual prereqs — max-hang metric and
redpoint grade — against your data instead of prose). Output: **top pick + 2
alternatives, each with the reasons shown** ("Iron Grip because: goal = fingers, V5–V8
matches your V6, you have a hangboard, no active finger injuries"). Never a dead end;
"general training" is the explicit fallback with an explanation.

**Stage 2 — Personalize:**
- Weekly layout: recommended layout for the program, or auto-derived layouts for
  chosen days/week (front-loaded vs spread), validated against `Constraint[]` — the
  picker literally won't place finger sessions 24h apart without a warning.
- Drill substitutions by equipment and injury (the warmup generator's injury filter,
  generalized: any drill/exercise that loads an injured part gets flagged with a
  suggested swap from the same category).
- Length: 4/8/12 weeks with phase scaling.
- Session-time fit: blocks marked core vs optional so a 60-minute user gets a trimmed
  session, not a guilt trip.
Output is a personalized copy in the `programs` store with `basedOn` provenance;
built-ins stay pristine.

**Custom builder** (port of the old rule-based one): fork any program or build from a
palette of session archetypes + the drill picker. This is the power-user path; the
finder is the default path.

**Re-finder:** on program completion (or plateau verdict), re-run Stage 1 with updated
data and the progression graph as a prior.

### 5.2 Logging

- **Quick log** (default): session type, RPE, duration, climbs via a fast grade
  stepper, done. Under 30 seconds.
- **Full log**: exercise blocks with per-set capture, drill card, warmup toggle,
  conditions, skill tags, project attempts, notes, debrief.
- **Live session**: start → tap climbs/sets as you go → finish routes into the full
  log for RPE/notes. Buffer persisted; stale-session recovery on next launch.
- **Planned sessions**: calendar-placed from the weekly layout; "mark done" one-tap
  completes with the plan's contents pre-filled.
- **Rest day**: one tap + the 4-item checklist; triggers the recovery buff.
- **Templates**: save any completed session as a one-tap template.

### 5.3 Calendar & scheduler

Month/week view of planned + completed sessions; drag to move planned sessions with
live constraint validation ("moving this here puts two finger sessions 24h apart");
deload weeks visually marked; program phase bands shown along the top.

### 5.4 Protocol timers (new, but listed here because it's core training)

Every protocol in the content (7/3 repeaters, max hangs, ARC, 4×4s, density hangs,
Frenchies…) gets a `protocolId` and a built-in **interval timer**: work/rest beeps,
set counter, haptics on TWA, screen-wake lock. Tapping an exercise in the logger opens
its timer; finishing the timer fills sets automatically. This is the single biggest
practical upgrade over the old app — it makes the phone useful *at the wall*, offline.

### 5.5 Load management: ACWR, vitality, rest

- **sRPE load** = RPE × duration; daily/weekly load chart.
- **ACWR gauge** on Home: 7-day acute vs 28-day chronic with zones
  (detraining < 0.8 / sweet spot 0.8–1.3 / danger > 1.3), trend arrow, plain-language
  guidance.
- **The brake**: effort XP multiplier (RPE 7 = 1.15×, 8–9 = 1.2×, 10 = 1.5×) clamps to
  1.0× when ACWR > 1.3. Shown honestly in the reward toast: "High load week — bonus
  withheld. Recover."
- **Vitality (HP)**: END-scaled max; consecutive training days drain it (3/4/5/6 days
  → −10/−30/−50/−70), skipped warmups −10 each, active injuries −20 each; a logged
  rest day grants a 24h ×1.5 recovery buff. Vitality gates nothing in real training —
  it's the avatar's visible health, and it shows on The Ascent's climber sprite (§5.11).
- **Deload awareness**: week-4 deload constraints surface as calendar guidance; the
  plateau engine can prescribe a reset week.

### 5.6 Derived stats & skill trees

- **Five stats** (STR/END/TEC/MEN/AGI), base 10, cap 100, recomputed from logs +
  metrics by `deriveClimberState` — same formulas as the audit documents (max hang →
  STR, sessions/sends → END, drills/grade-variety → TEC, history → MEN, flexibility →
  AGI), minus the achievement mega-bonuses (+10/+100 all stats are gone; they broke
  the scale).
- **Transparent breakdown** (new): tap any stat to see exactly which inputs built it
  ("STR 34 = base 10 + max hang 12 + hard sends 9 + gear 3"). Trust is the feature.
- **Rust**: miss your weekly target with no streak → −5 TEC debuff, visibly tagged.
- **Skill trees**: 5 trees (Dynamic Power, Static Tension, Endurance, Technique,
  Mental Grit), ~130 nodes, requirements exclusively real (drill counts by name, sends
  by grade, consecutive weeks, goals, level). Capstone effects pruned to systems that
  exist: Ascent boons, avatar cosmetics, QoL perks (extra project slot, extra bounty
  slot, extended warmup variety), vitality perks (better rest recovery).

### 5.7 Challenge Board — bounties + daily/weekly (one board, not six)

- **Daily** (1 slot, auto): quality-ladder tasks — e.g. warmup before any session →
  warmup before an RPE 7+ session; rest-day checklist; drill focus. Deterministic
  daily pick, difficulty scaled to level.
- **Weekly** (3 slots): volume/consistency/variety goals scaled to *your* recent
  numbers ("12 sends V3+ this week", "3 sessions with drills", "1 outdoor day").
- **Bounties** (accept up to 3, refreshed on completion): generated from your actual
  send distribution — grade targets one notch above your comfort zone, weighted
  boulder-vs-rope by your history, drill bounties targeting your least-practiced
  categories (weakness detection from drill mastery + skill tags). Accepted-at
  snapshot so pre-acceptance climbing can't complete them.
- Everything on the board resolves **only from logs**. Rewards follow the economy
  constitution.

### 5.8 Projects (one system)

- Track a project: name, grade, type, indoor/outdoor, location, photo (optional),
  beta notes.
- Per-session attempts with outcome (sent / fell-crux / fell-high / fell-mid /
  fell-low / worked) and high-point %; idempotent `appliedAt` reconciliation from
  session records (the old app's best pattern, kept verbatim).
- Per-project view: attempt timeline, high-point graph, conditions on best burns,
  beta notes journal, "days since last burn" staleness pill.
- **Auto-suggest** (replaces the parallel detection system): repeated named climbs in
  logs prompt "Track 'Midnight Lightning' as a project?" — one system, assisted entry.
- Send → celebration moment, share card, big XP (project reward tier, ×1.5 outdoor).
- Active project cap (e.g. 5) as a *focus* mechanic, expandable via a skill capstone.

### 5.9 Progress & graphs

Kept from the old app (all offline, all derived):
grade progression with linear-regression projection ("V6 in ~8 weeks at current
pace"), grade pyramid + attempts pyramid with per-grade conversion %, ACWR history,
session heatmap, monthly volume + volume by domain, program adherence by phase,
PR timeline (per ladder), outdoor pyramid by style, crag log, conditions performance,
partner log, drill mastery, streaks. Plus assessment charts from the metric registry.

New: **stat history** (five-stat radar over time), **altimeter progress** (§5.10),
and a global date-range/discipline/environment filter bar shared by all charts.

**Plateau Matrix** kept as-is conceptually: deterministic verdicts (insufficient data /
recovery compromised / breakthrough / plateau / optimal) with the recovery override
first — and the "7-day reset protocol" becomes a **rule-based template** (deload days,
one novel stimulus from an untrained drill category, one concrete retest) instead of
an AI call.

### 5.10 The Altimeter — climb to Everest (your height-meter idea)

Every send adds real height to a lifetime altimeter:

- Boulder send: **15 ft** · Route send: **50 ft** (old app's values; tune in one
  constant). Optional +25% for outdoor sends.
- **Milestone ladder** of real climbs/summits, each a badge + avatar scene unlock:

  | Height | Milestone |
  |---|---|
  | 45 ft | First gym wall |
  | 867 ft | Devils Tower |
  | 2,000 ft | Half Dome, Regular NW Face |
  | 2,900 ft | El Capitan, The Nose |
  | 5,790 ft | Mt. Washington |
  | 14,505 ft | Mt. Whitney |
  | 19,341 ft | Kilimanjaro |
  | 20,310 ft | Denali |
  | 22,838 ft | Aconcagua |
  | **29,032 ft** | **EVEREST** |

- After Everest: the **8000ers list** (13 more summits, ~350k additional ft) as the
  long tail, then "second lap" prestige.
- **ETA projection** using the forecasting engine: "At your current pace: Everest in
  11 months." This is the number that makes volume feel like a journey.
- Home screen shows the mountain silhouette filling toward the next milestone.
- Pure real-climbing math — no game action adds height, ever.

### 5.11 The Ascent — the rest-day arcade game

The old app had **two** endless-climbing games under confusing names. The one carrying
forward is the **arcade lane-dodger** (`FreeSolo.tsx` in the old code: fast,
reaction-based, dodge left and right up an endless wall), which takes the name
**The Ascent** in the new app. The old turn-based card-climb sim (the old "Ascent")
is cut.

**Core loop (ported from the old FreeSolo, tuning constants and all):**

- Vertical auto-climber on a **3-lane wall** with parallax rock layers; the climber
  ascends continuously while obstacles rain down; tap left/right screen halves (swipe
  and arrow keys too) to switch lanes. Height in meters is the score
  (1 px = 0.4 m in the old tuning).
- **Speed ramp**: base 220 px/s, +8 px/s per second elapsed, capped at 480 — runs are
  short (~60–90 s), death is sudden, "one more run" is the loop.
- **Three obstacle archetypes tuned for distinct dodges**: rock (1 lane, common),
  boulder (spans 2 lanes — a spatial dodge), debris (small and 1.5× fast — a timing
  dodge). Spawn mix ≈ 47.5% obstacle / 47.5% coin / 5% power-up.
- **Power-ups**: slow-mo (5 s, halves speed), chalk magnet (sweeps on-screen coins),
  heart (extra life — relaxed mode only).
- **Two modes**: *Ascent* (hearts can spawn) and *Free Solo* (one life, +30% speed,
  no hearts, 2× rewards) as the unlockable hard mode.
- Per-mode personal bests; **"pure" runs** (no power-ups touched) tracked separately
  with a dedicated achievement (5,000 m clean was the old bar — keep it).

**Rest-day framing (the design change).** An arcade game lives on instant retries, so
don't ration *plays* — ration *rewards*: play unlimited, but XP/coins pay out from
your **best run of the day**, and a **logged rest day boosts that payout ×1.5** and
switches the wall to a "Recovery Skies" cosmetic weather. Training days don't block
anything; the good paydays just live on rest days, which nudges you to actually rest.

**Training hooks (light, legible, hard-capped so it stays a reflex game):**

- END slows the speed ramp slightly (up to −10%).
- AGI trims the climber's hitbox a touch.
- High MEN grants one **"chalk save"** per run — a single near-miss forgiveness.
- Skill-tree Ascent capstones grant boons: start with a slow-mo charge, +coin value,
  a second chalk save.
- Vitality shows in the climber sprite (fresh/tired) but never gates play.

**Daily seed** (new): seeded spawn RNG gives everyone the same obstacle/coin pattern
each day; local best + share card ("Daily Wall #214 — 1,850 m") — social bragging
with zero backend. Cosmetic wall themes/weather unlock via altimeter milestones.

Rewards stay in the `game` XP lane, capped per the constitution — a day of Ascent
play pays a fraction of a real session and can never substitute for training. Pure
canvas/rAF engine with seeded RNG, fully offline, no AI anywhere.

---

## 6. Enhancements & new ideas (beyond the transfer list)

Ordered roughly by value-to-effort.

1. **Avatar 2.0 — layered, gear-visible, offline.** Replace AI portraits with a
   layered SVG/sprite avatar: base body → six evolution *scenes* by level (gym lobby →
   summit, the old arc kept) → visible cosmetic gear slots (shoes, chalk bag, jacket,
   rope, rack) earned from skill capstones, altimeter milestones, and achievements.
   Vitality shows on the avatar (fresh / tired / wrecked poses). This is *better* than
   the old app — gear was invisible there — and it's the piece that makes progress
   feel personal. Biggest open decision is art production (§9).
2. **Weekly Review ritual.** Every Sunday the app assembles a recap: load vs last
   week, ACWR trend, sends + best moments, challenge results, adherence, one
   rule-based coaching note, next week's layout preview. One screen, one share card.
   Deterministic, cheap, and it's the retention loop.
3. **Journal.** A unified, searchable timeline of every note, debrief, and project
   beta entry with filters (program, project, tag, date). You already write the notes;
   the old app just never let you read them. Trivial to build on the new schema.
4. **Share cards for everything** (html-to-image, local): send celebrations, PRs,
   weekly review, altimeter milestones, Daily Wall runs. As a climbing content
   creator, this is your organic marketing channel built into the product.
5. **Onboarding baseline session.** First-run flow = mini assessment (max hang if
   hangboard, pull-ups, flexibility, recent grades) that seeds stats, the finder, and
   the altimeter starting story. Makes stats non-zero and personal from day one.
6. **Coach's Corner (rule-based Coach Billy).** The old trigger taxonomy with
   your own coaching copy: PR reactions, outdoor re-entry advice after 21+ day gaps,
   project-escalation nudges at 5/10/20 attempts, hangboard-gap warnings, missing-
   domain observations. A tip card, not a chatbot — honest about being rules.
7. **Injury-aware everything.** Injuries (kept: body parts incl. A2 pulley, side,
   severity, status) filter warmups, flag drills/exercises that load the injured part
   across *all* programs, annotate the calendar, and pause affected bounties. Plus a
   return-to-climbing checklist per body part (you can author these — coach knowledge
   as content).
8. **Grade scale preference** — Font and French display conversion (stored canonical
   V/YDS). Cheap, widens the audience.
9. ~~**Multi-profile / coach mode (idea, decide later).**~~ — **DECIDED: not in v1.**
   Local profiles on one device. Two things changed the answer. First, the retrofit
   is cheap and stays cheap: `DB_NAME` has exactly one functional use, in `getDb()`,
   so "one database per profile" is a single line plus a profile registry, and
   `hydrateAll()` — which already runs at boot and after import — is the switch.
   Second, the use case it is named for is not served by it: athletes log on their
   own phones, so coach mode is a *view someone else's data* problem (import/share),
   not a local-profiles problem. Building this would ship a profile switcher and
   leave coach mode unbuilt. Demoing the app clean is real but better served by a
   sample-data mode than by a second identity.
   The two things to know if it is ever revived: `hydrateProfile()`'s catch path
   leaves the previous profile's data on screen, which is a leak between athletes;
   and theme/sound live in the `profile` record but are device-level, which is the
   only piece that is a data migration rather than a code change.
10. **Backup nudges.** Monthly "export your data" reminder + one-tap export;
    File System Access API on desktop for direct save-to-file. An offline app's data
    story must be loud about this.
11. **Wear-and-repair lite (maybe).** If any gear economy returns, keep it cosmetic
    only. Recommendation: skip entirely in v1; stats + cosmetics carry the loop.
12. **Trivia as a toy (maybe).** The glossary quiz kept as a zero-reward diversion in
    Coach's Corner. Only if free.

**Explicitly not returning** (see AUDIT.md §7): Gym Tycoon/Franchise, Pro Team, all
card games, The Headwall, the old turn-based card-climb sim (the old app's "Ascent" —
its arcade sibling carries the name forward instead, §5.11), The Approach,
trips/garage/basecamp, sponsors, contracts, season pass, companions, activities
(fake training), social graph, leaderboards, all AI calls, accounts, monetization
tiers.

---

## 7. The economy, tuned for the new scope

- Level = `floor(sqrt(XP/100))`, rank titles kept (24 ranks to GOAT at 100).
- Session base = 15% of a level; rest day = 3.75% + recovery buff; warmup = 5%;
  per-send XP scaled by grade (`1% + 0.5%/V-grade equivalent`), onsight +100% /
  flash +50% on ropes/outdoors; goal completion = 100%; PR = 50%; project send = big
  (40% of a level, ×1.5 outdoor).
- Multipliers: effort (RPE, ACWR-braked) × drill streak (1.1/1.15/1.2) × outdoor 1.1.
- Game lane: Ascent runs and cosmetic events pay small, capped amounts, source-flagged
  `game`; no game action > 7.5% of a level; challenge-board rewards count as real
  (they resolve from logs).
- Currency: one soft currency (XP × 0.25) spent only on cosmetics and small Ascent
  perks (e.g. a starting slow-mo charge, wall themes). No materials, no packs, no
  second/third/fourth currencies.

---

## 8. Look & feel (three directions to choose from)

The old app: dark slate + orange, dense cards, emoji-heavy. "Completely different"
options, any of which the component kit can carry:

- **A. Alpine Field Journal** — paper/ink textures, topo contour lines, stamps and
  hand-drawn badge aesthetics, serif display type. Warm, analog, distinctive; fits
  the altimeter/expedition fantasy and share cards beautifully. Risk: harder to keep
  crisp in dark mode.
- **B. Modern Alpine Minimal** — clean light-first UI, one accent (glacier blue or
  moss), big numbers, generous whitespace, subtle elevation-line motifs. Fastest to
  execute well; ages best; less personality.
- **C. Retro Expedition Pixel** — pixel avatar/scenes as the visual anchor with clean
  flat UI around them (game feel without arcade noise). Pairs naturally with sprite
  avatar production and The Ascent.

Recommendation: **B for the app shell + C's pixel art for avatar/Ascent/badges** —
clean training tool, charming game layer, and pixel art is the cheapest credible
avatar pipeline for a solo dev.

---

## 9. Open decisions (yours)

1. ~~**Avatar art pipeline**~~ — **DECIDED: layered SVG.** One geometry of nine
   joints painted in five passes (skin, top, shorts, shoes, gear), each a stored
   colour. Gear comes from level, ground from the altimeter, posture from
   vitality; only the palette is stored. Chosen over a single-fill silhouette
   because skill-tree capstones grant cosmetics, and on a silhouette a capstone
   can award roughly one gear notch. See `src/engine/avatar.ts` and
   `src/ui/Avatar.tsx`.
2. **Visual direction**: A / B / C / B+C hybrid (recommended). *(The app is
   built on direction B, Modern Alpine Minimal, and the avatar matches it.)*
3. ~~**Multi-profile/coach mode**~~ — **DECIDED: out of v1.** One climber per
   install. See the milestone entry (M51) for what was checked before closing it
   and for the one piece that is genuinely path-dependent.
4. **Name/branding**: keep Project Ascent or rename (new package id either way —
   the old TWA package is tied to the old origin/keys).
5. **Altimeter tuning**: 15/50 ft flat, or scale height with grade? (Flat recommended:
   volume metric should reward volume; grades already pay XP.)
6. **Monetization**: plan assumes none in v1. Revisit post-launch if ever.

## 10. Risks & honest caveats

- **Data loss is the existential risk of offline-only.** IndexedDB can be evicted;
  `storage.persist()` + loud export nudges mitigate but don't eliminate. TWA installs
  are the safest home. This deserves real design attention, not a settings footnote.
- **Reminders/notifications are weak on the pure web.** No server = no push;
  Notification Triggers API is dead. In-app nudges + TWA wrapper options only. Don't
  promise training reminders in marketing until validated on the TWA build.
- **Content port is the long pole.** Converting ~130 KB of prose into structured
  exercises/constraints is days of careful editorial work, not an hour of regex. It's
  also the highest-value step — budget it honestly (script-assisted, hand-verified).
- **Scope discipline.** The old app died of a thousand features. The cut list in §6 is
  load-bearing: every "maybe" defaults to no until the core loop ships.
- **ACWR is a heuristic**, not a medical device; keep language as guidance
  ("load is spiking") not diagnosis, and keep the medical disclaimer screen.

## 11. Build roadmap

Milestones are sequential; each ends runnable and useful.

- **M0 — Foundations (scaffold).** Vite/TS/Tailwind/Zustand/idb scaffold, schema v1 +
  migrations + export/import, UI kit, hash routing, PWA precache, deploy pipeline to
  GH Pages. *Done when: installable offline shell with working storage round-trip.*
- **M1 — Content port.** Programs/drills/glossary/guides/metrics into typed content
  files; script-assisted prose→structure conversion with hand verification; content
  validation tests (every drill ref resolves, constraints well-formed). *Done when:
  all 11 catalog entries render from the new schema.*
- **M2 — Train.** Program browsing, finder v1 (stage 1), personalization (layouts +
  length), calendar with constraint validation, quick/full/rest logging, templates,
  protocol timers, warmup generator. *Done when: you can find a program, plan a week,
  and log it end-to-end — the app is already a usable tracker here.*
- **M3 — Understand.** deriveClimberState, ACWR gauge, progress graphs, PR detection,
  assessments, projects (with auto-suggest), journal, plateau matrix. *Done when: 4+
  weeks of imported test data renders every chart correctly.*
- **M4 — Grow.** Reward pipeline + economy, levels/ranks, vitality, avatar v1 (stages
  + vitality states), altimeter + milestones, skill trees, challenge board, weekly
  review, share cards. *Done when: logging a session visibly moves XP, stats,
  altimeter, and board in one flow.*
- **M5 — The Ascent.** Arcade engine (rAF loop with seeded spawn RNG, collision and
  speed-ramp constants ported from the old FreeSolo tuning), run UI with parallax
  wall, best-of-day reward rules + rest-day boost, daily seed, stat/boon hooks, PB
  and pure-run tracking. *Done when: 60 fps on a mid-range phone, fully offline, and
  the rest-day ×1.5 payout applies.*
- **M6 — Round out.** Live session mode, onboarding baseline, Coach's Corner, settings
  (scales, theme, backup), disclaimer, polish pass. *Done: all of it.* Packaging and
  release moved to M12 — shipping is the last phase, not the sixth.
- **M7 — Depth in the log.** *Done.* Session templates, calendar move with live
  constraint validation, re-dating and merging logged sessions, photos on projects,
  and the authoring builder in three slices — structure, contents, and sharing a
  program as a file. Two departures from the plan are recorded in the code: moving a
  session is pick-then-place rather than drag (a 40px cell is not a drag target on a
  phone, and drag is unreachable by keyboard), and it defaults to one week rather than
  rewriting the program's plan. Splitting one session into two was deliberately not
  built: without a way to say which climbs belong to which half it is guesswork, and
  the case it would serve is already covered by stale-session recovery.
- **M8 — Injury depth.** *Done.* Severity, side and status on an injury; drills and
  exercises flagged across all programs rather than just warmups; the calendar and log
  annotated; bounties chosen from what does not load the part rather than filtered
  after the fact; and a return-to-climbing checklist per body part. The checklist is
  written under three hard rules recorded in `content/returnToClimbing.ts` — no
  treatment, no timelines, observations rather than permissions — and ticking one
  earns nothing, because an app that paid for boxes ticked about your own body would
  be teaching climbers to lie to it. `engine/bodyLoad.ts` is a keyword scan, not a
  taxonomy, and says so.
- **M9 — Content.** The part only a coach can write. First: the hole the finder
  already exposes — there is no finger-strength program for a climber above V5
  without a campus board, so Iron Grip blocks and a V7 boulderer gets recommended
  maintenance. Then the glossary with inline term definitions, the app/injury/outdoor
  guides, and deeper phase notes on the existing eleven programs. *Done when: the
  finder has an honest answer for every equipment set.*
- **M10 — The long arc.** *Done, minus one deferred fork.* Three pieces shipped:
  **objectives** (a named climb or outcome at a scale a single block cannot finish,
  tracked by what has to be true first rather than by attempts — its requirements
  *are* skill-tree requirements, and readiness is the mean of each one's fraction
  rather than met ÷ total); **career milestones** (an unbounded second axis, because
  the altimeter's ladder is finite and wraps — grades, a 1 · 2.5 · 5 counter ladder,
  years, and the height ladder per lap, each dated from the log); and **the year in
  review** (compared against the same slice of the previous year, so a part-finished
  year is not measured against a full one, and a quiet year reads as a quiet year).
  Nothing in any of the three pays out: the sessions underneath were paid for when
  they were logged. Deferred by decision, not by oversight: expedition-style sieges
  of famous climbs (AUDIT.md §7's one cut system worth reconsidering), which would be
  offline and deterministic rather than the prototype's d20-plus-AI-text.
- **M11 — Hardening.** *Split and retired.* It was five unrelated projects sharing a
  milestone — `deriveXp` performance, a service-worker prompt, a screen-reader pass,
  virtualised lists and import conflicts. Each now sits in the phase it belongs to:
  perf and virtualisation in M18, the update prompt in M19, accessibility in M14, and
  import conflicts in M20.

### Phases M13–M22: the app itself

Ten phases about the app rather than its content, from a survey of the code on
2026-09-09. Two findings set the order. First, **light mode has two WCAG AA
failures already shipped**: `--c-accent` on `--c-bg` measures 4.31:1 against the 4.5
requirement and is used as text throughout, and `--c-warn` on surface measures
3.82:1 and is the colour of every injury flag and load warning. Dark mode is fine
(5.7–7.0). Second, the accessibility instrumentation is at **zero** — no `aria-live`
anywhere, no `focus-visible` anywhere, no `prefers-reduced-motion` anywhere, one
`aria-current` — while there are **95 raw `<button>` elements against 20 files
importing the `Button` component**, and `Button` itself defines no focus style.

M13 comes first because the design system is what turns the accessibility pass into
a small diff instead of ninety-five separate edits.

- **M13 — Design system.** The 95-vs-20 split is the root cause: no consistent focus
  ring, hit target or disabled state, and the same class string
  (`w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm`) copied into
  ten feature files, with the selected-chip pattern (`border-accent bg-accent/10`)
  written out thirty times across sixteen. Extract the primitives already in use —
  Button, IconButton, Chip, Field/Input/Select/TextArea, EmptyState, Stat — give each
  one a focus ring and a real hit target, and convert the raw ones. *Done when: no
  feature file styles a bare button or repeats the input class string.*
- **M14 — Accessibility.** *Done.* Live regions, focus rings, `aria-current`,
  heading levels, reduced motion and chart alternatives were all built alongside M13
  and M15; what was left was the milestone's actual gate — *a full session logged
  with a keyboard and a screen reader* — and testing it found two real defects that
  no amount of source review had.
  **Focus was dropped on every route change.** Measured, not inferred: pressing Enter
  on "Start session" left `document.activeElement` as `<body>`, because the control
  that had focus unmounted with the page. A keyboard user arrives with focus nowhere,
  Tabs from the top of the document past the whole nav to reach what they navigated
  to, and a reader says nothing about having arrived. The shell now moves focus to
  the `<main>` landmark on a route change — and not on the first render, because the
  app has not navigated anywhere yet and taking focus on load is its own bug. Nothing
  is announced on top of it: the page's `h1` is the first thing inside `main`, and
  synthesising "now on Progress" would make every navigation say the name twice.
  **All three dialogs were pictures of dialogs.** The protocol timer, the share sheet
  and the photo viewer had one Escape handler, one `aria-modal` and no focus
  management between them: opening the timer left focus on the button behind it, Tab
  walked straight out of a full-screen sheet into the page underneath, and closing
  left focus wherever it had wandered. `useDialog` is one mechanism for all three —
  focus in to the container (not the first control, which skips the dialog's own
  label), Tab trapped with wrapping at both ends, Escape doing exactly what the close
  button does, and focus handed back to whatever opened it. Verified in a browser on
  each of the three: focus in, trapped, Escape closes, focus returns to the opener.
  It takes an `open` flag, because the photo card stays mounted and renders its
  viewer conditionally — without it the trap registered a document-level Escape
  handler on every session page with nothing to close, which is a bug this milestone
  introduced and caught in the same hour.
  *Done when* met, by driving it: navigate, start the session, pick a grade, pick an
  outcome, add the climb, set RPE, tick the warmup, mark complete — Tab and Enter
  only, every stop named and ringed, `aria-pressed` correct on every chip, and the
  live region reading "First V4. Your hardest boulder so far… 1,588 XP earned."
  Six mutations, six killed — the last only after the first version of the
  hook-usage check passed on a dialog that had swapped the call for a `useRef` and
  kept the import.
- **M15 — Themes worth having.** *Done.* Three AA failures, not two — `positive`
  was also below the bar at 3.74:1 on sunken. All fixed, and `validate_palette.js`
  turned out not to exist: the claim in index.css that the palette was "validated for
  colour-vision deficiency (all checks pass in both modes)" was never true of
  anything. The palette is now data in `ui/themes.ts` with `themes.test.ts` measuring
  every foreground against every surface it is painted on, in three themes × two
  modes, plus simulated protanopia, deuteranopia and tritanopia on the chart series.
  index.css is generated from that data by `scripts/gen-theme-css.mjs` and a test
  holds the two in step. Also: Alpine, Slate and Sandstone; a text-size setting that
  scales the root (the only thing that scales rem-based utilities); and
  `prefers-contrast: more` served by Slate unless the climber has chosen a palette
  themselves. **Known limitation:** at the largest text size on a 320px screen,
  `/climber` scrolls 13px horizontally. Nothing is cut off and no element exceeds the
  viewport — a clipped descendant contributes to the root scroll width — and M17 is
  where sizing gets revisited.
- **M16 — Navigation.** *Done.* The app's shape is one table now (`ui/routes.ts`),
  and both halves derive from it. Search is a sixth tab, so it is one tap from
  anywhere and the result is the second — which is the whole "done when". The index
  is built on the page from stores already in memory (431 items on an empty install,
  more as a log grows): pages, programs, objectives, projects, glossary, guides,
  assessments, drills, sessions with their notes and climbs. Matching is exact rather
  than fuzzy, for the same reason the glossary lookup is: offering "Deadlift" for
  "deadhang" is worse than offering nothing. The 21 hand-rolled back links are one
  `BackLink` deriving its parent from the table, with an explicit override for the
  two pages whose parent carries an id. Tests hold the table against `App.tsx` in
  both directions, forbid cycles, cap depth at three, and check that nothing is
  listed in search that cannot be linked to blind.
- **M17 — Beyond the phone.** *Done.* Measured first: at 1280px `main` was 672px
  wide with **608px of dead space — 48% of the viewport** — under a bottom bar
  stretched the full width with six small icons huddled in the middle. Now the nav
  becomes a sidebar at ≥1024px and the content grows to **976px at 1280px**, 1024px
  at 1600px. **One `<nav>` element carries both shapes**, not two with one hidden:
  rendering both would announce the app's navigation twice and put every tab in the
  tab order twice. The content keeps a maximum regardless — a 1,200px paragraph is
  unreadable whatever the window is doing.
  Columns are a decision per page, not a sweep. `PageGrid` splits in two at `lg` on
  the **17 browsing pages** where the cards are independent readings, and `Wide`
  spans a child the split would ruin: a control that governs the cards below it
  (a Boulder/Routes toggle stranded in the right column while its charts sit in the
  left reads as belonging to nothing) and a row of figures laid out horizontally.
  Forms, editors and reading flows stay one column — the logger's sections feed each
  other, the finder is a sequence of questions, the program page walks phases in
  order — because splitting those turns "next" into "look right, then back left and
  down". `layout.test.ts` records that decision for every page **with a written
  reason**, and holds the shell to one nav.
  **Two mistakes worth keeping.** The conversion script replaced the *first*
  `grid grid-cols-1` in each file, which on the progress page is the branch shown
  when nothing is logged yet — so the page a climber with 90 sessions actually sees
  stayed one column while the file still said `PageGrid`. Screenshots with real data
  caught it; a source check for the string would not have. Then the first version of
  the test that was meant to prevent it asserted exactly that string and passed on
  the mutated file. It now requires a `PageGrid` in every branch that renders a page
  header and more than one card, and was checked by breaking three pages to confirm
  it fails. Verified across 22 routes at 320/390/768/1024/1280/1600px: **zero
  horizontal overflow at every width**, no page errors.
- **M18 — Speed and size.** *Done.* `deriveXp` at ten years of logs: **106.9ms →
  6.1ms**, and flat rather than superlinear. The cost was `loadStateAt` walking 28
  days per session with date arithmetic — 43,680 `Date` constructions per derivation,
  46.6ms of a 59.5ms total, on every session write. Replaced with one sliding pass
  over integer day numbers (`zonesFor`), with parity tests against the per-date
  version across a range of log shapes. Two smaller wins alongside: the earliest
  logged day is hoisted onto the load index instead of being found by sorting every
  key on each call, and `deriveXp` is memoised on reference identity so the nine
  `useXp()` callers cost one derivation instead of nine. First load: **326KB → 262KB
  gzipped** (266KB measured over the wire against the production build), by splitting
  the game, the builder, search and the guides out of the entry chunk — the guide
  bodies alone were 146KB, dragged in by the program page needing one link, which now
  reads a summary index instead. `perf.test.ts` holds both budgets. **Virtualisation
  was not built:** with ten years of logs in the browser every page rendered in
  78–144ms including navigation, so there was nothing to fix. If a decade of journal
  entries with notes on every session turns out to be slow in real use, that is when
  it earns its place.
- **M19 — The offline contract.** *Done.* The app shipped
  `registerSW({ immediate: true })` with `registerType: 'autoUpdate'`, so a deploy
  reloaded the running app the moment a new version finished precaching. Now
  `registerType: 'prompt'`: the update still downloads eagerly — the climber may
  well be somewhere with no signal by the time they say yes — but handing over is
  asked for. **The prompt never appears while a session is running**, because the
  reload is the cost: the protocol timer and a half-entered climb row live in
  component state, so a reload mid-hangboard restarts the protocol from set one.
  (The session *clock* survives either way — it is derived from `startedAt` in
  IndexedDB, not held in memory. The plan assumed otherwise; the timer is the real
  loss.) "Later" is honest rather than a snooze: a waiting worker activates once
  every tab is closed, so the next launch is the new version anyway.
  Storage is now a verdict rather than two numbers. `storagePressure` ranks
  **eviction above a full quota** — a browser that never granted persistent storage
  can clear the whole database without asking, which is the failure; a high quota
  reading is only a warning. Only "the next write may fail" interrupts, in the
  shell; everything else stays in Settings, because a banner on every launch about
  something most browsers decline until the app is installed is noise the climber
  learns to ignore.
  **No offline indicator, deliberately.** Nothing in this app needs a network, so a
  running "you are offline" banner would report a problem that does not exist and
  devalue the place real warnings appear. Settings confirms the opposite instead —
  that the whole app is cached — and a test forbids `navigator.onLine` in the UI.
  **Three bugs found while building it.** `onOfflineReady` fires once, on the very
  first install and never again, so every launch after the first reported the app as
  still caching — caught only by testing against a real build, twice. Offline
  readiness now comes from `navigator.serviceWorker.ready`. There were **three**
  `formatBytes` implementations and two stopped at megabytes, so a browser offering
  a 60GB quota rendered "61440.0 MB" in Settings; one now, and a test counts them.
  And the harness lied twice before the gate could be verified at all: `page.reload()`
  keeps the current hash, so reloads were re-loading `#/welcome`; and navigating the
  last client away lets a *waiting* worker activate, which looks exactly like "the
  prompt disappeared" — a second page held open fixed both. Verified against two real
  builds with a genuinely waiting worker: held during a session, offered after it,
  four times alternating, plus "Later" and the next launch.
- **M20 — Data safety.** *Done.*
  **The error boundary the app did not have.** One malformed record white-screened a
  route: a `baseline` of the wrong shape crashed `/find` in `finderInputFrom`, and a
  backup from an older schema does the same. Now a `RouteBoundary` inside the shell
  keeps the nav — and so the way out — standing, and `PageGrid` gives **every card its
  own boundary**, which is the "one card rather than the page" half. Doing that in
  PageGrid rather than at ~100 call sites also means a new card cannot forget to have
  one. Verified by breaking a card for real: the page kept its load chart, pyramid,
  career, journal and records while one card showed the error.
  **A boundary is a backstop, not a fix**, so the record is normalised before anything
  reads it: `readBaseline` returns a usable baseline or null, never a half-built one.
  It deliberately does *not* default every field — a fully defaulted baseline would
  hand the finder a confident answer built from nothing, and "we do not know your
  grade yet" is the truth. The original reproduction is now a test, and `/find`
  renders its honest fallback instead of crashing.
  **Import shows its work and can be undone.** The old flow asked "replace or merge?"
  over a file the climber could not see into. Now `previewImport` compares keys on
  both sides and leads with the number that matters — *"Replace would delete 40 things
  this backup does not contain. Merge keeps them."* — with a per-store table
  underneath. A restore point is taken automatically before either mode, and undo
  stands until the climber says "keep the import" and reclaims the space. The snapshot
  lives under a reserved `meta` key rather than a new store: a new store means a schema
  bump, and the export format shares that number, so every older copy of the app would
  start rejecting new backups over a change that does not affect the format. It is
  excluded from export and ignored on import, and a **replace deliberately does not
  clear it** — otherwise the import would delete the way back mid-import, which is a
  test.
  **Undo for deletes.** One offer, not a stack, standing fifteen seconds, announced
  for screen readers. Wiring it found a real bug: every store's `update`/`save` maps
  over its list, and a deleted record has nothing to map onto — the write landed in
  IndexedDB and never reached the screen. Sessions and projects grew a real `restore`.
  **Not built, deliberately:** per-store merge-versus-replace. A climber choosing
  "replace sessions but merge projects" is a control nobody will use correctly; the
  per-store *information* is what was missing, and that is now in the preview table.
  **Photos are the honest gap:** the restore point excludes them (a snapshot with
  media doubles the largest thing in the database at the riskiest moment, and M19
  exists because running out of room is real), and deleting a project deletes its
  photos so they cannot sit orphaned in the quota, so undoing a project brings back
  everything but its pictures. Both are said in the UI rather than discovered later.
- **M21 — Entry speed.** *Done, with the caveats below.* Measured first, on a typical
  bouldering session — V4×3, V5×2, V3×4 and one V6 attempt. Before: **20 interactions**,
  because entry was three native `<select>`s and a select is open, scroll, choose
  before it is a choice at all. After: **15**, and every one is now a direct tap on a
  target already on screen. The count is the smaller half of that — a native picker on
  a phone is about a second and a half, a chip tap a fraction of one — and putting it
  the other way round would overstate what the arithmetic shows.
  The grade row scrolls horizontally and scrolls *itself* to the chosen grade, because
  seventeen grades wrapped is four lines tall on a phone and a climber logging V8
  should not start every session looking at V0. **"Same as last time" is the real win**
  for anyone running a program: the previous session's climbs and counts in one tap —
  15 down to 1 — dropping names, because a named climb is a specific piece of rock and
  carrying the name forward would have the app inventing an ascent.
  Number fields now default to a decimal keypad **in the `Input` component**, so a call
  site cannot forget; nine had no `inputMode` at all. Caveat left in the open in the
  code: neither mobile keypad offers a minus sign, so a field taking negative added
  weight still needs its own answer.
  **The M19 finding is fixed:** the protocol timer was `useState` and nothing else, so a
  refresh or a phone reclaiming the tab mid-hangboard restarted it from set one. It now
  persists to `sessionStorage` — exactly the right lifetime: survives a reload, dies
  with the tab, so nobody returns tomorrow to a timer claiming nineteen hours. A running
  timer keeps running across the reload, because the rest interval did not pause when
  the page did.
  **Not built:** swipe-to-delete on climb rows. There is already a `−` that deletes at
  zero, and a swipe with no confirmation on a touch device is how a climb disappears
  without anyone tapping anything — the failure M20 just spent a milestone fixing.
  **Two honest gaps.** The "under thirty seconds" bar is *not* claimed: I measured taps
  and scripted time, not a human with chalky hands, and those are not the same
  measurement. And the timer's reload-resume is covered by unit tests and by types, not
  by driving a real hangboard timer through a refresh in a browser — seeding an active
  program with a timed drill was more setup than the remaining budget allowed.
  **Still open, and only the user can answer it:** where logging actually annoys the
  climber using it. Everything above is inferred from tap counts.
- **M22 — Polish and motion.** *Done.* Measured first: on a warm cache no page shows a
  blank `main` at all — they go from unmounted straight to content. The real failure was
  narrower and worse. **Four pages returned `null` while their store hydrated**
  (`/find`, `/build`, the session editor, a project). That is not a blank card, it is no
  card: `main` has no height, so the layout collapses and snaps back a frame later,
  which reads as a fault rather than as loading. They now render a `PageSkeleton` —
  measured at **394px of held height instead of 0**, with the real page title (known
  before the data is) and `aria-busy`, so a screen reader is told the region is loading
  rather than read a description of grey rectangles. The blocks are deliberately dull: a
  shimmer is an animation that says "still working" for the 40ms an IndexedDB read
  actually takes, which is long enough to notice and too short to learn anything from.
  **`EmptyState` was written in M13 and used in exactly zero places** while eight pages
  kept their own hand-rolled copy. All eight converted; a test now forbids the shape it
  replaced.
  **The typography pass found a real bug, not a tidy-up.** Thirty-one labels were written
  as `text-[10px]` / `text-[11px]` and one badge as `text-[8px]` — *absolute pixels*,
  which M15's text-size setting cannot move, because that setting scales the root font
  size and with it every **rem**-based utility. Measured against a probe: a ten-pixel
  label read 10.00px at "Normal" and 10.00px at "Largest", while the new `--text-2xs`
  step reads 11.00px and 14.30px. So the nav labels, every badge and every chart key
  silently ignored the accessibility setting the app offers. Ten versus eleven pixels is
  not a distinction anyone perceives, so three off-scale sizes collapsed into one named
  rung. The 8px→11px badge sits in a calendar cell, so it was re-checked at 320px on the
  largest setting: zero overflow, nothing clipped.
  **Reduced motion needed nothing:** M14 already turns motion off globally when the
  system asks, with a test, and route transitions ride on that same rule rather than each
  remembering to check.
### Second audit — progress, charts and the game (2026-09-10)

Ten recommendations, each from something measured in the codebase rather than
brainstormed. Numbers below are counts taken at the time of writing.

**A pattern first, because it has now happened three times.** `validate_palette.js`
was cited in `index.css` and did not exist (three colours had been failing AA the
whole time). `EmptyState` was written in M13 and used in **zero** places while eight
pages kept hand-rolled copies. And `recordCard` — a share card for a personal
record — sits in `ui/shareCard.ts` today, fully written, reachable from **nothing**.
Building a primitive is not the same as wiring it, and nothing in the repo notices
the difference. A test that every exported card/primitive has at least one caller is
about ten lines and would have caught all three; it belongs with the first of these.

- **M23 — The consistency grid.** *Done.* There was no heatmap anywhere; the only
  time-shaped chart was `YearPage`'s month bars, and a monthly total hides a fortnight
  off — two weeks lost and two doubled up read as an ordinary month. Now 53 columns of
  seven days on Progress, full width, with a fortnight's gap visible as a hole.
  **A rested day is not a missed day.** A logged rest gets the faintest step of the
  ramp rather than the empty colour, because "I rested on purpose" and "I did not open
  the app" are opposite facts and the same square would report the first as the second.
  Days after today are drawn as holes, never as misses, and the empty months before a
  climber installed the app are excluded from the gap count — nobody lapsed before they
  arrived.
  **The scale is this climber's own.** Levels are quantiles of the loads in the window,
  not absolute numbers: an absolute scale renders a beginner's whole first year as one
  flat colour, and this chart is about whether the days are there at all. A log with no
  variation renders as one shade, which is the truth about it.
  **The ramp is generated, not authored** — one hue mixed toward the empty colour in
  `themes.ts`, so lightness carries the whole scale, and tested under all three
  colour-blindness simulations across every theme and both modes. That matters more
  here than anywhere else: a grid is read by comparing hundreds of four-pixel squares
  at a glance, and a scale needing hue discrimination is unreadable to roughly one man
  in twelve.
  **Three things caught by building it.** The 0.75 quantile landed *on* the largest
  value, so the top of the scale was unreachable — nothing could ever be level 4. The
  `--heat-*` variables were only written by `applyPalette`, so the first paint had none
  and an SVG `fill: var(--heat-3)` that resolves to nothing renders **black**, not
  transparent: the entire grid was a solid block until the generator wrote them into
  `index.css` too, with a test holding the two together. And the month labels started
  inside the SVG, which scales with it — at 320px they were a 2.5px smear, so the
  labels are HTML at a real rem size and only the squares scale.
  **Not interactive, on purpose:** a cell is 3.9px at 320px, measured, and WCAG 2.5.8
  asks 24px of any target, so the grid is a picture with one link to the calendar
  beneath it rather than 371 targets a sixth of the required size. The screen-reader
  table lists the logged days only — 371 rows of "nothing logged" is a
  denial-of-service, not an alternative. Verified at 320/390/1280px and in dark mode,
  zero horizontal overflow.
- **M24 — The stat radar.** *Done.* `stats.ts` defines exactly five axes and the app
  only ever drew them as five bars — which is five numbers stacked up, so telling a
  lopsided climber from a rounded one meant comparing "70" against "10" four rows
  apart. Now a pentagon, and the shape does the work.
  **The weakest axis is marked three ways, none of them colour:** a ring on its vertex,
  its label in bold, and its name in the caption. A dip in a pentagon is only obvious
  once you know which corner is which, and M15's rule means colour cannot be the cue —
  a spike chart is exactly where that bites. The `aria-label` names it too, so the
  headline fact survives having no picture at all.
  **The second shape is six months ago**, recomputed from the log rather than stored: a
  snapshot taken under an older formula would compare today against a different
  definition and call the difference progress. It is an outline, dashed, painted before
  the current shape — two filled shapes fight each other and neither reads. A climber
  with under two months of log gets one shape and a line saying why, because a ghost
  pinned to the centre is not a comparison, it is a picture of the app not having
  existed yet.
  **Two things worth keeping.** The axis-spacing test failed on correct geometry because
  `atan2` wraps at ±π, so one gap read −5.03 instead of +1.26 — the test needed
  normalising, not the maths. And `PAD` was set to the label's *distance* from the
  centre when it needed the distance *plus the label's own width*: a label anchored
  `start` runs outward from its vertex, so "END" rendered as "EN" and "AGI" lost its
  left edge. Both caught by looking at the picture, not the code.
  **A known wrinkle left alone:** the axes are labelled with the stat ids, so the
  Mobility corner reads "AGI". That mismatch is upstream — the id is `AGI` and the name
  is `Mobility` — and the rows directly beneath the chart show "AGI · Mobility" side by
  side, so the pairing is visible on the same card. Renaming the id is a data change,
  not a chart change. Verified at 390/1280px, light and dark, with every label inside
  the frame and zero overflow.
- **M25 — Load and recovery over time.** *Done, narrowly — see the end.* The app
  derived a full ACWR history and showed one number from it. A ratio has no meaning
  alone: **0.99 arrived-from-1.6 and 0.99 arrived-from-0.6 are opposite situations with
  the same reading** — the first a climber coming down off a spike, the second one
  building back. The line is the same data saying which.
  **The bands are the chart.** Drawn as filled regions rather than threshold lines,
  because a band is a place to be and a line is a thing to cross, and the first is what
  the model means. Their edges come from `ACWR_BOUNDS` — a chart with its own copy of
  0.8 keeps drawing the old band the day the model is retuned — and they are named in
  words as well as shaded, because a key that is only a colour fails the same rule the
  status ramp does.
  **Gaps stay gaps.** Before three weeks of history there is no ratio, so the line
  breaks into separate runs rather than joining across. A zero there would tell a
  climber they were detraining through a period the app knows nothing about.
  **One sliding window, not two.** `zonesFor` — M18's optimisation, the thing that
  turned 46.6ms into a few — was generalised into `loadSeries`, which returns the whole
  standing per day; `zonesFor` is now that with everything but the zone thrown away.
  Two windows over the same data would be two chances for the number under the chart to
  disagree with the number in the card. The parity tests and the perf budgets both
  still pass.
  **Two defects only a screenshot would find.** The y-axis labels collided: at a
  ceiling of 2.2 the gap between 1.3 and 1.5 is ten pixels and the two sat on top of
  each other, so a label is now dropped when it would crowd its neighbour — 1.3 goes
  first, because the legend can replace it. And the band opacity was tuned on white: at
  0.1 the caution and danger strips were all but invisible on a dark surface, since a
  light red at 10% over near-black is nothing. One alpha now, chosen against the dark
  theme and checked on both.
  **What was not built, and why.** Session-type mix and time-of-day were on the list
  and are not here: the plan itself called ACWR "the single most useful missing chart",
  and three charts on one page compete rather than add. Rest cadence is already visible
  — M23's grid draws every rest day as its own shade. **The line is visibly jagged**,
  and that is real rather than a rendering fault: sampling a seven-day rolling window
  daily, for a climber who trains every other day, genuinely oscillates as one session
  enters and another leaves. Smoothing it would be averaging a rolling average, which
  lags and hides the spike this chart exists to show — so the sawtooth stays.
- **M26 — The moment a record lands.** *Done.* A personal record pays `0.5` of a
  level — the biggest single award in the economy, worth more than three ordinary
  sessions — and the card after logging led with the XP total while the record sat as
  one grey line among "3× V4" and "Warmed up". (The audit said it "never named" the
  record; it did name it, in a list, indistinguishable from a routine send. The economy
  knew it mattered and the screen did not say so.) Now a session that was more than a
  session **is a different card**: the eyebrow, the headline and a sentence, with the
  XP dropped to a line underneath.
  `sessionMilestones` ranks six kinds — grade record, project sent, first day on rock,
  first session, rank, level — **rarest first**, because a session can set a record
  *and* level you up *and* be your first day outdoors and only one of those can lead. A
  grade record outranks the rest because it is the only one about climbing rather than
  about the app's own arithmetic, and for the same reason **only a grade or a send is
  shareable**: handing someone a level the app invented is not an achievement. A rank
  suppresses the level-up it implies — "Level 13" under "Crusher" is one fact told
  twice.
  **The records are read back out of the reward, not re-derived.** `recordsInReward`
  parses them from the award ids the economy already wrote, so the headline can never
  disagree with the line that paid for it, and no climber-state derivation runs to name
  one grade. The id shape is a string coupling, so a test asserts it against
  `economy.ts`.
  The screen-reader announcement now leads with the record: "412 XP earned" told a
  climber nothing about having just climbed the hardest thing they ever have. And
  `recordCard` — written in M13, reachable from nowhere — is finally wired. Seeing it
  for the first time showed a hole in the middle where the avatar goes, so the three
  screens that each derived a climber avatar now share one `useClimberAvatar`, derived
  only when there is a card to put it on.
  **The unwired-primitive check is in.** `ui/wired.test.ts` asserts every share-card
  builder and every `ui/` primitive has a caller outside its own file. It caught two of
  my own on its first run — `SkeletonBlock` and `SkeletonCard` from M22 were exported
  but only used inside `Skeleton.tsx`, which is the same pattern in miniature. They are
  internal now. That is three occurrences found (`validate_palette.js`, `EmptyState`,
  `recordCard`) and a fourth prevented.
- **M27 — What you have been loading.** *Done.* `bodyLoad.ts` — `LOAD_RULES`,
  `EQUIPMENT_LOADS`, `scanText`, `exerciseConflict`, `drillConflict` — was used in
  exactly one place: a warning beside a line in the logger, and only when a climber
  had already told the app something was hurt. The same table answers a question asked
  far more often: *what have I actually been loading?*
  Nine tissues, ordered heaviest first, with **days-since beside every one** — because
  a quiet tissue is ambiguous. "Nothing for three weeks" and "never named in your log"
  are different facts and a bar alone averages them into one grey answer. Every part
  is listed even when nothing touched it: a missing row is indistinguishable from a
  zero row, and what is *not* being loaded is half the reason to look.
  **Load goes whole to each tissue a session touched, not divided between them.**
  Dividing would say a session loads your fingers less because it also loaded your
  shoulder, which is not how a body works. The consequence is deliberate: the parts do
  not sum to the session total, so there is no total on this card at all and shares are
  measured against the busiest tissue rather than against a sum that would mean nothing.
  **Climbing counts even in silence.** Most logged sessions carry no prose, and without
  a baseline attribution the card would report a climber who logs grades and nothing
  else as having trained no tissue whatsoever.
  **Two things the screenshots caught.** In dark mode the bold label plus its marker
  pushed "shoulder" past the 64px label column and the bar overlapped it. And a
  grades-only logger loads exactly the four climbing tissues, equally, every session —
  so the "quietest" of them was whichever the sort happened to put last, and the card
  named it. `TIE_SHARE` now suppresses that: a tie has no quietest, and inventing one
  would be the scan pretending to be an assessment.
  **The caveat is on the card, not only in the code.** `bodyLoad.ts` is blunt that it is
  a keyword scan; presenting its output without saying so would let a relative picture
  read as a measurement, and a climber deciding whether an elbow has had enough rest
  deserves to know the app is reading their own words back. The card says it, and says
  how many sessions it could not place. It prescribes nothing — the training-state card
  is where advice belongs, and a keyword scan has not earned the right.
- **M28 — Compare two periods.** *Done.* `yearReview` compared one year against the
  last and was careful about part-finished ones; the Progress page had no comparison at
  all — every card on it describes the present. "Am I actually training more than I was
  a month ago?" is asked far more often than the annual question and nothing answered
  it. Four weeks against the four before, at the top of Progress, so it is the first
  thing on the page rather than one tap away.
  **One list of rows, not two.** `changes()` already carried the rule that the
  comparison is returned in a fixed order and never sorted by how good it looks, so a
  year that went badly does not float its one improvement to the top. That list is now
  `CHANGE_ROWS` and both comparisons read from it — the rule is only a rule while there
  is one list.
  **Neutral on purpose.** Up is not painted green and down is not painted red, because
  the app has no idea which is which: a deload block is *supposed* to show as a decline,
  and so is the month after a trip. The direction is an arrow and a signed number —
  shape and text, which is also what M15's rule requires — and the card says outright
  that a quieter month is not a worse one.
  **The comparison is withheld until the log covers the earlier window.** A climber who
  installed the app five weeks ago has a "previous four weeks" made mostly of days
  before they arrived, and comparing against it would report the act of installing as a
  training improvement. Instead the card says how many more days of log it needs. That
  rule cost six test fixtures on its first run — they were reaching back 52 days where
  56 were needed — which is the rule working rather than a bug, and a helper now builds
  fixtures that span the window properly.
  Verified at 390px light and dark and across the width sweep: a month of building, a
  month of tapering, and a climber too new to compare. Zero horizontal overflow.
- **M29 — The next unlock.** *Done.* There are **130 skill nodes across five trees**
  and they were reachable from one page. One line on Home now names the nearest node
  and what it needs, and it stays one line: a list of five is a chore, not a pull.
  **The plan's premise was half wrong and the half that was right mattered more.** The
  character page *did* carry a "Closest:" line — but it quoted the node's
  *requirement*, "Send 4 different grades", so a climber one grade away read exactly
  what a climber who had never started read. `measure()` produced the target and had no
  way to say the gap. It now returns both: `detail` for the tree row and `remaining`
  for the prompt, so the app can finally say "1 more grade you have not sent".
  **The old ranking was broken twice, and `nextUnlock.ts` replaces it.** `SkillState`
  used to sort locked nodes by how much of the requirement was behind them, which put a
  **blocked** node first — a climber with twelve V6s and no V4s was told the closest
  thing was "Send 12 at V6 or harder", which they had already done and which could not
  unlock until the V4 rung did. And a fraction rewards a big requirement you are mostly
  through: a real year-long log ranked *Reach END 70* (67/70, a capstone, and not
  something anyone can go and do) above *2 more days on rock*. So: only the first
  locked rung of each branch, ranked by work remaining rather than fraction done.
  **Ranking on remaining work alone was worse.** The cheapest first rung anywhere in
  the 130 beats everything a climber is genuinely close to, so a log 150 sessions deep
  got the same line as an empty one — *1 more on-sight* — and would have gone on
  getting it forever, because plenty of climbers log grades and never touch the
  on-sight chip or run a program's drills. A zero is evidence, so the pull comes from
  requirements with something already on them and the untouched rungs are the fallback.
  **A floor is not progress.** Every stat starts at `BASE_STAT` so a maxed one lands on
  exactly 100 by construction — counted as "started", it made a capstone the closest
  thing for a climber with an empty log: "60 more END", three hundred sessions of work,
  offered as a first step.
  **The effort weights are an ordering device and nothing built on them says "three
  weeks away".** Two rows are measured from the app's own arithmetic over a year-long
  log — 1.5 hours and 113 ft per logged session; the rest are judgement. Assessment
  numbers have arbitrary units, so a gap of 7 kilos is scaled as a fraction of the span
  rather than multiplied against 7 sessions.
  Nine mutations, nine killed — one of them only after the ninth survived and exposed
  that the blocked-node test was passing for the wrong reason. Verified at 390px light
  and dark, and at 320px at the largest text size: zero horizontal overflow.

- **M30 — Photos on a session.** *Done.* Media had exactly one owner shape,
  `projectOwner`, so a session could not carry a picture. It can now: the photo card
  sits under the notes on the session editor, because a photo is the other half of
  what the notes are for. One card serves both owners rather than two copies of it.
  **"The `by-owner` index needs no schema change" was true and it was the smaller
  half of the problem.** A session's id *encodes its date* — `2026-09-01#0` — so
  re-dating one is a write and a delete, and merging one into another destroys the
  second id outright. Both are buttons on the session editor, and both would have
  stranded the photos on an owner that no longer existed. `moveMediaOwner` carries
  them across; the store calls it on each path and eight mutations confirm it.
  **Deleting an owner no longer deletes its photos, and that fixes a bug that was
  already shipped.** Deleting is undoable (M20), and `projects.remove` destroyed the
  pictures first — so the undo handed back a project whose photos were silently gone,
  while the bar said only "deleted, undo?". The code even carried a comment
  rationalising it, which is what a rationalisation in a comment is for. Photos now
  outlive the record and `sweepOrphanMedia` collects them at the next launch, when no
  undo can want them. The cost is honest and small: a deleted owner's blobs hold their
  space until then.
  **The sweep reads index keys, not photos.** `getAll('media')` to find out who owns
  what would pull every blob in the database into memory to decide which handful to
  delete. A key cursor over `by-owner` never touches a value. It also refuses to judge
  a namespace it cannot look up — an unknown prefix means it cannot tell a live owner
  from a dead one, and guessing costs a climber their pictures.
  **Two things found on the way that had nothing to do with sessions.** `listMedia`
  sorted with a comparator that never returned 0, so two photos sharing a millisecond
  came back in whichever order the sort produced — and not the same one twice;
  `createdAt` is now monotonic per add and the id breaks any remaining tie. And the
  thumbnail grid passed `p-0` to a card that sets `p-3`: both land in the same class
  attribute and Tailwind's own ordering decides, so every thumbnail had been a quarter
  smaller than the code said, on the projects page, for as long as it had existed.
  Padding is a prop now, and `ui.test.ts` fails the next attempt to win that argument
  through `className` — the first version of that test passed on the very code it was
  written to catch, because `[^>]*` stops at the `>` in `onClick={() => …}`.
  Verified in a browser end to end: add, caption, re-date, delete, undo, reload. A
  deleted project's photo survives the delete, comes back with the undo, and is
  collected on the next launch when the undo is not taken.

- **M31 — The Ascent, tied to the training.** *Done, and two of the three proposed
  hooks were rejected rather than built.*
  **Seeding the wall from your own logged week breaks a promise the app prints on
  screen.** "Everyone gets the same wall each day — the pattern comes from the date,
  so a score is comparable without anything leaving your phone" is on the records
  card; `dailySeed` says the same in its own doc, `wallNumber` exists so "the number
  means the same thing to two people comparing screenshots", and the share card leads
  with *Daily Wall #253*. Personalising the seed — or the obstacle mix, which is drawn
  from it — quietly makes all four false. Worse, the payout scales with distance, so
  "a hard week is a harder wall" would mean **training costs you XP**: the one
  incentive this app must never create. The shared wall stays shared.
  **What can move is the climber, and that lane was already built.** `modifiersFrom`
  applies capped, personal modifiers on top of an identical wall, which is exactly the
  shape the plan wanted and none of it touches the seed.
  **Two of the three skill boons described mechanics that had never been written.**
  "Campus Fluent — start each run with a longer reach" granted a chalk save; "Airborne
  — one extra lane jump per run" granted half again as many coins. Neither reach nor a
  second jump exists in this game. The label lived in `content/skills.ts` and the
  effect in `game.ts`, written months apart, and nothing checked one against the other
  — so a climber who trained forty power drills was told they had earned something
  imaginary. Both now come from one object in `ascent/boons.ts`, and the tree reads
  the label from the same place the run reads the effect. The skills page also still
  said "Waiting on The Ascent" long after the game had started reading them.
  **Two of the five stats reached the wall; now all five do.** Technique shortens the
  lane change by up to 30% — the one hook you feel on the first input — and Strength
  raises what a coin is worth by up to 25%. Both capped, both on top of a payout the
  economy caps again, and both scaled from the base of 10 every stat starts on so a
  climber who has logged nothing gets exactly nothing.
  **The hooks card now shows every stat with its number, earned or not.** Listing only
  the active hooks hid the half that would give anyone a reason to train. It also
  surfaced something the card had been concealing: **all five of AGI's inputs are
  assessment metrics**, so a climber who logs sessions and never enters a benchmark
  sits at the base of 10 and the hitbox hook has never once fired for them. STR is
  nearly as metric-bound — 220 sessions of V7s and V8s reads as Strength 21. That is
  the stats model, not the game, and it is out of M31's scope to change; the card at
  least now says "Mobility 10 — would trim your hitbox" instead of leaving a blank.
  Nine mutations, nine killed, including the one that would have made a shortened lane
  change start partway across the gap. Verified in a browser: a real run with
  twenty-four lane changes, and the card for an untrained and a trained climber.

- **M32 — Named achievements.** *Done.* Fourteen, fixed, on the Career page under
  the timeline, with the newest one shareable.
  **All three of the plan's own examples already existed, twice each.** "First
  outdoor day" is `grit-real-rock-1` in the skill trees *and* a `first-outdoor`
  session milestone; "three months without a missed week" is the Consistency branch;
  "a full block finished" is the closest to new. Writing them here would have been
  the same facts in a fourth place, next to 130 skill rungs and an unbounded counter
  axis that already name accomplishments.
  **So the module carries a rule instead of a list:** *an achievement is a shape in
  the log, never a running total.* A day with a property, or a pattern across time.
  The other two axes answer **how much**; nothing answered **what kind**. That rule
  is enforced, not asserted — no achievement name may collide with any of the 130
  skill nodes, and three hundred identical indoor sessions earn **two of fourteen**
  while sweeping the trees.
  **A real bug, found by a fixture that would not go green.** A grade ordinal is an
  index into its own ladder and the two ladders are not the same length: 5.11a and
  V10 both come out as 10. Comparing across them meant a climber's "hardest" was
  decided by whichever ladder had more rungs underneath them, so a V7 boulderer who
  had also led a 5.11a could never earn a limit achievement on the wall they actually
  climb.
  **And a design wart fixed before it shipped.** Judging a limit day against the
  all-time maximum meant *getting better took an achievement away*: flash your limit
  at V7, send V9 a year later, and the flash silently stopped counting. Limits are
  now judged against the log as it stood that morning — a send later in the same
  session does not retroactively raise the bar either.
  **Persistence is keyed on `sentDate`, not `status`.** The app is careful never to
  flip a sent project back, so a project sent and later shelved keeps its date —
  filtering on status would have dropped exactly the long projects this is about.
  Twenty-six mutations. Three survived the first pass: two were weak fixtures of mine
  (a rest day that ticked a warmup, so it advanced the run it was meant to be skipped
  from; a "still open" project with no send date at all, which passed for the wrong
  reason), and the third was the status bug above. Two more "survivors" turned out to
  be mutations that were no-ops — a duplicate object key, and a comment-only edit —
  which is its own reminder that a surviving mutation is a claim to check rather than
  a verdict.
  Verified at 390px light and dark on a two-year log: nine of fourteen, zero
  horizontal overflow, and the two outdoor-run achievements correctly withheld from a
  fixture whose rock days were every *other* day.

### Second audit, third pass — M33–M42

Found by auditing the app *and* the eleven programs as training content. The
programs had never been audited as training before; the finder had never been swept
across its input space.

- **M33 — Periodisation that is more than prose.** *Done.* Measured on **dose only**
  — sets, reps, holds, load, rest, pick count, circuit rounds — because a changed
  rationale is not a changed prescription, and counting prose as progression is
  exactly how twelve identical weeks read as a periodised program. **12 of 52 blocks
  never changed dose in any phase**, and **10 of 32 session-type phase boundaries
  changed no dose at all**. It is now 4 and 8, every one of them declared.
  **The audit's framing was wrong and the correction matters.** "A climber entering
  The Engine does exactly what they did in The Base" is false at the program level:
  **0 of 18** program-wide boundaries change nothing, because the endurance and
  performance sessions progress by drill. What was true is the narrower claim, and it
  held exactly — The Long Game's *strength session* was byte-identical across weeks
  1–8, all four blocks of it.
  **The progressions were already written; they had just never reached the fields the
  app reads.** Gravity Defied's armor rationale said "increase the volume (add 1 set)
  rather than the resistance". Lockdown's said "add a SET — not weight". Lockdown's
  hip mobility said "if the 30s frog stretch is comfortable, extend to 45s". The Long
  Game's push said "bump to 3x12". Peak Performance's push said "add a set". Every one
  of those is now the dose. Eleven blocks across seven programs: armor steps to three
  sets where climbing load steps up and **holds through the peak rather than
  tapering**, which is what those programs' own phase-3 rationales have always said
  ("the one block you do not scale back"); accessory push and core build into phase 2
  and taper in phase 3, which is what their phase descriptions already claimed.
  **The Cruiser is the exception, and my first reading of it was too harsh.** I said
  its phase prose promised changes the data did not deliver. It does deliver them —
  in RPE, grade choice, session length and pick advice ("bias toward your weaker
  discipline", "climb 1-2 grades below max, not 2-4", "keep them short and genuinely
  easy") — dimensions this content model has no field for. So its four menus carry a
  `constantDose` declaration naming what moves instead, and the prose stands.
  **`ExerciseBlock.constantDose` is checked both ways.** A block that never changes
  must declare why; a block that declares it must actually be constant; and a reason
  under sixty characters is not a reason. Six mutations, six killed — including
  restoring The Long Game's original strength session, which the session-boundary rule
  names by hand.
  **Then the guides, which restate every dose in prose.** Making the progressions real
  meant several blocks now carry two or three doses across twelve weeks, and nothing
  checked guide against program. Building that check found **two contradictions that
  predate this milestone**: Lockdown's guide printed its dip at 3×8–10 against a
  program that says 3×10–12 — and whose own rationale says "add load if 12 reps is
  easy" and "drop to 3x8", neither of which reads against 8–10 — and its Hammer Curls
  at 2×10 against 2×12 everywhere else in the catalogue. Both fixed in the guide.
  Eighteen guide lines now print the progression after an arrow. **110 printed doses
  are checked**, with a coverage floor, and the rule is loose one way (a line may
  state any single phase's dose) and strict the other (every number on it must be
  real).

- **M34 — One source of truth for the deloads.** *Done.* Eight of nine program guides
  disagreed with their program about which weeks are deloads.
  **The four contradictions were settled and in every one the guide was right.** Peak
  Performance's `[4, 8, 9]` — phase-end deloads apparently added on top of an existing
  week 9, which put two deload weeks **back to back** — is now `[5, 9]`, the two
  windows its guide has always described. The Siege's week 11 becomes week 8, whose
  guide row is explicitly a half-volume week where week 11's is a refining week with
  no backing off in it. Ground Zero gains the week 8 deload its guide describes in
  detail and its own prescription table already halves the sets for. Lockdown gains
  week 4, which its guide calls non-negotiable and which matches Gravity Defied and
  Iron Grip.
  **A guide can no longer state a deload at all.** `GuideBody` derives the mark from
  the program, so the two can no longer drift: what the calendar marks and what the
  guide prints come from one list. That also closes the *other* half — four programs
  schedule deloads their guide never wrote down, and The Long Game's week 11 now says
  so for the first time.
  **Three rules, each got wrong once, and none of the mistakes showed up in a passing
  suite.** A table is a week table only if its header says so — guessing from the
  cells marked a *4x4 interval* row as week 4, because "4x4 Intervals" starts with a
  digit, and these guides also head numeric columns with Step, Level, RPE, Attempt,
  Metric, Protocol, Limiter and Position. A range is not a week — and `10–11` came
  back as week 1 through regex backtracking, which is what the `(?!\d)` in `weekOf`
  is for. And a row that already carries the label does not get the mark on top, or
  Peak Performance's week 5 reads "5 DELOAD | DELOAD 1".
  The rules live in `weekMarks.ts` rather than in the component, because that is the
  difference between finding those three in a browser and finding them in a test.
  Five mutations, five killed. **Still open:** Lockdown and Iron Grip have no
  week-by-week table at all and The Long Game and The Cruiser stop theirs partway, so
  seven scheduled deload weeks have no row to be marked on — named in
  `accuracy.test.ts`, and authoring rather than plumbing.

- **M35 — Entry standards as data.** *Done.* Programs printed an entry-requirements
  table the app could not check. `Program.prerequisites` exists so a standard is
  "checkable against the user's own data instead of living in prose the app can't
  read", and for most of them it was exactly that prose. Base Camp, Gravity Defied,
  Iron Grip, The Long Game and The Cruiser now declare theirs as data, and the finder
  reads a climber's logged benchmarks.
  **The audit's count was wrong: five, not six.** Ground Zero's only standards table
  is *Graduation Standards* — what you should be able to do when you finish it — and
  wiring that up as an entry gate would have locked every beginner out of the beginner
  program. `accuracy.test.ts` now tells the two apart by the heading above the table
  rather than by its column names, so the next one cannot be miscounted the same way.
  **Wiring it up found the finder had never read the metric registry.** It decided
  `metricId === 'redpoint_grade' ? 'YDS' : 'V'` and then compared the *climber's grade
  ordinal* against the threshold whatever the metric was — so a `dead_hang >= 60`
  standard would have compared V8 (ordinal 8) against 60 and blocked every climber
  alive. `meetsPrerequisite` asks the registry for `kind` and `scale`, which it has
  said all along.
  **Absent is not failing.** A standard nobody has measured returns `null` and the
  finder says nothing at all about it — no block, no caution — because otherwise every
  program carries a warning until the climber sits an assessment. Meeting some of them
  scores proportionally, not a flat bonus: one logged dead hang was worth as much as a
  full assessment. And the note is pushed once per program, not once per metric, or a
  four-standard program said the same sentence four times.
  **A standard blocks or warns depending on what the program calls it**, which the
  browser found and the tests could not. Blocking on every unmet standard turned a V6
  climber with an 18-second dead hang into "nothing was a confident match" — the app
  refusing to show a program rather than saying be careful. Iron Grip's floor is a
  safety limit in its own words ("hangboarding below that loads tendons that have not
  had a year of climbing to adapt") and still blocks; Base Camp, Gravity Defied, The
  Long Game and The Cruiser call theirs an assumption, and are `soft: true`. A sweep
  asserts every trainable program stays reachable for a climber who has logged nothing.
  Six mutations against the new logic, six killed — two of them only after the first
  attempt turned out to be a no-op against text that had been reformatted.
  **Also fixed in the browser:** a program can now be out of reach for two unrelated
  reasons (no hangboard *and* an unmet standard) and the two sentences were rendering
  glued together as one paragraph.

- **M36 / M37 — Required kit and helpful kit.** *Done, as one change.* Nine of nine
  programs were blocked for a climber with only a wall — and, worse, for a climber
  with a wall **and a hangboard**, because every hangboard program additionally
  demanded a weights gym.
  **Re-verified before building, since the M38 finding from the same audit turned out
  to be a probe artifact.** This one held and was understated: `wall` alone gave zero,
  `wall+hangboard` gave zero, `hangboard+campus` gave zero.
  **Then measured what the requirement was buying.** Ground Zero: two dumbbell
  exercises in fifty-two prescriptions, and the third "gym" item is a *band* lat
  pulldown. The Long Game: one of thirty-three, written "Max Push-Ups **or** DB
  Press". The Cruiser: three of a hundred and twenty-nine, every one carrying its own
  alternative. Lockdown: not one gym exercise — all four loaded prescriptions want
  *added weight*, which is a backpack.
  **So `weight` is its own equipment kind now**, separate from `gym`: loading a
  hangboard with plates is not having a weights room, and conflating them blocked
  every max-hang program for anyone without a barbell. And a program declares what it
  **requires** separately from what **helps**. Helpful kit never blocks and carries no
  score — scoring its absence would rebuild the same wall one step lower down — it
  just says what improvising would cost.
  A wall alone now runs three programs; a wall and a hangboard, six; nothing at all,
  one. Seven mutations, seven killed, one of them only after the validator's rule got
  a test that feeds it a deliberately broken program rather than relying on the
  catalogue to contain one.
  **Two judgement calls left as they are, and both are yours.** Base Camp keeps `gym`
  required: its strength block really is barbell-shaped — DB bench, lat pulldowns,
  goblet squats or deadlifts, RDLs, eight of seventy with no bodyweight form written
  for them — though that is arguable for a V0–V2 program. Iron Grip keeps `campus`
  required, because its third phase *is* campus work, which means the finger-strength
  hole below stays open.

- **M37 — Optional equipment.** *Done with M36.* The Cruiser's optional hangboard
  module is `helpfulEquipment` now, so it neither excludes a climber without one nor
  hides from the one who has it.

- **M38 — What the days term is allowed to claim.** *Done, and the audit finding it
  came from was wrong.*
  **The correction first.** The audit reported that a V8 boulderer wanting strength is
  handed maintenance at three days a week. That was an artifact of the sweep, not the
  finder: it passed `strength`, `send-project` and `general` as goals, and `Goal` has
  none of them — so the goal term, the strongest signal at +50, scored zero for every
  program in the sweep and the ranking collapsed onto grade and days. Re-swept against
  the real union, the finder picks well: `power` sends a V8 to Peak Performance at
  every week length, `fingers` to Iron Grip, `project` to Peak Performance, `maintain`
  to The Cruiser. The day-count cliff does not misfire either — where the goal-matched
  program is a genuine fit it wins at two days and at seven, which is now a test.
  **What was actually broken.** The days term ignored `max`, so the branch for a
  climber with *more* days than a program asks for was the same branch as an exact
  fit, and Iron Grip told a climber with seven days that it "fits 7 days a week". It
  asks for four or five, and the rest days a hangboard block leaves are the point of
  it rather than slack in the schedule. Three cases now, and the spare-day case scores
  the same as an exact fit — only the sentence was wrong.
  **And a tie was settled by nothing.** Two programs on the same score fell back to
  the order they happen to sit in `PROGRAMS`, which handed a returning V4 boulderer
  Ground Zero *with* a caution over Gravity Defied *without* one, both on 60. Fewer
  warnings wins now, with the id settling the rest so the same question always gets
  the same answer.
  Five mutations, five killed — the tie-break one only after the first attempt
  survived, because `Array.sort` is stable and returning nothing for a tie is
  deterministic too. The test had to be rewritten against a tie the rule reorders.

- **M39 — The finger-strength hole (M9, carried).** *Done.* With a hangboard and no
  campus board, Iron Grip was blocked and a V6 boulderer asking for stronger fingers
  got Perpetual Maintenance. Swept the finder across all 32 equipment subsets × five
  grades to find the exact shape of it.
  **Measured what the campus requirement bought, the way M36 did.** Three exercises
  and three drills out of thirty-eight prescriptions, all in phase 3 — and **all three
  drills were mislabelled**. `contact_strength_projecting` is "pick 2-3 max-grade
  projects", `crimp_pull_power_application` is "pick 3-4 boulders", and
  `deload_max_hang_day_off_flow` declared a hangboard *and* a campus board while its
  own description reads "Very easy climbing only. **No hangboard this week.**" No drill
  in the catalogue needs a campus board. The whole requirement rested on three
  exercises in one phase of three.
  **So campus is helpful now, and phase 3 has two tracks.** `no_board` is the default:
  foot-on laddering, deadpoint repeats and recruitment pulls train the same fast force
  production at a fraction of the peak load. The phase was called "The Spark (Campus)"
  — named after the tool, which is part of why requiring the tool looked inevitable —
  and is "The Spark (Contact Strength)" now. A hangboard and a wall run Iron Grip at
  every grade from V5 to V8.
  **Dropping the requirement silently disabled two safety rules**, which the suite
  caught. `INJURY_RULES` were keyed to *required* equipment, so the moment campus
  became optional Iron Grip stopped blocking a healing elbow or shoulder — the protocol
  did not get safer, it got skippable. Rules now read required **and** helpful kit: a
  required protocol blocks, an optional one cautions with its own sentence ("Campus
  work spikes elbow load, so run the no-board track until that has healed"). A healing
  pulley still blocks Iron Grip outright, through the hangboard rule. Fixed alongside:
  every note said `a ${part}`, which wrote "a a2 pulley injury" and "a elbow injury".
  **Nineteen drill equipment tags were wrong, not nine.** Nine over-declared — pure
  bouldering sessions tagged `hangboard` because their rationale mentioned one, hidden
  by `filterDrills` from every climber without a board. And **all six drills tagged
  `none` need a wall**: "pick a project 1-2 grades above your flash level", "before
  placing each hand on a hold". A climber with no equipment was offered six drills,
  every one of which needs a climbing wall; that filter returns nothing now, which is
  the true answer.
  **The wall-only hole is named rather than papered over.** Nothing here trains fingers
  without a hangboard, so `FinderResult.gap` says so, says which single piece of kit
  changes the answer, and still recommends the best available program. It fires only
  for a finger goal with no hangboard.
  Three checks, and the honest limit of each is written down: a scheduled drill can
  never need more than its program requires; a drill about projecting must declare a
  wall; and declared kit must appear in the drill's own text — that last one is the
  weakest, and **it survived its first mutation**, because "Repeater phase should not
  push into pain" satisfied a vocabulary containing `repeater`. Six of the nine were
  found by reading, not by a rule, and the test says so rather than implying otherwise.
  Five mutations, five killed after that narrowing.

- **M40 — Split the bundle.** *Done.* The entry chunk was 894.6 KiB against its own
  900 KiB limit — 0.6% of headroom — and first load was 282.9 KiB gzipped against 300
  KiB. Every route is now its own chunk but the four that cannot be deferred, and the
  entry is **693.8 KiB** with first load at **225.4 KiB gzipped**: a fifth off the
  download, and headroom back from 0.6% to 23%.
  **Measured before touching anything, which changed what to do.** A diagnostic build
  grouping by directory put the weight at features 76.6 KB gzip, vendor 73.4, guides
  49.1, engine 50.5, programs 35.9, drills 20.3, ui 21.0, glossary 14.3 — content
  being 46% of the payload. But the guides and the glossary were *already* deferred:
  they sit in a shared chunk that only the lazy routes pull, and the second `index-*`
  file in the build is preloaded with them rather than at boot. The eager weight was
  twenty-five pages statically imported into `App.tsx`, and that is what moved.
  **What stays.** Programs and drills — 196 KiB raw between them — are in the entry
  chunk because Home needs the active program for "Today" and the logger needs its
  prescription. Splitting per-program means an async `getProgram`, which would make
  the finder, the plan engine and the guides async to save 56 KB gzip. Not worth
  turning a synchronous derive-everything model inside out. Home's three cross-imports
  (the board, review and coach cards) hold ~660 lines in the entry for the same
  reason, and extracting them buys about 3 KB.
  **Offline is intact**: 56 precache entries covering every chunk, so a lazy route is
  a cache read after the first visit. A cold one paints in ~320ms including the
  navigation.
  **The budgets were the real problem.** 300 KB and 900 KiB against 282.9 and 894.6
  is a budget already spent. They are 260 KB and 780 KiB now, and a new test asserts
  `App.tsx` statically imports exactly four pages — the guard against the split
  eroding one convenient import at a time.
  One thing worth recording: the a11y check that every routed page has an `h1` found
  its pages by scanning `App.tsx` for `from '@/features/…'`, so the split silently cut
  its coverage from twenty-five pages to four. It failed only because it carried a
  `expect(pages.length).toBeGreaterThan(20)` floor — which is the argument for putting
  a floor under every source-scanning test.

- **M41 — One shape for a missing record.** *Done.* The audit said four routes, three
  ways. Driving every parameterised route in a browser with a junk id found **eleven
  routes and five different behaviours**:
  `/build/<gone>` said "Not found"; `/train/<gone>` said "**Program not found**" — a
  second heading for the same event — under "That program has not been converted yet",
  which was true of the prototype port and has not been true since;
  `/projects/<gone>` and `/assessments/<gone>` rendered a bare card with **no `h1` at
  all**; `/objectives/<gone>`, `/guides/<gone>` and `/injury/<gone>` **navigated
  silently to the index** — the injury one to *Settings*; and `/year/<bad>` and
  `/log/<bad>` rendered as though the parameter were fine, which is a malformed
  parameter rather than a missing record and is M42's.
  **`RecordNotFound` is the one shape**: the same two words as the app's global 404 in
  an `h1`, a sentence naming the record and why it might be gone, and the way back.
  Nine routes now answer identically, with the URL left alone.
  **The redirects were the worst of the five**, not the missing headings. A silent
  bounce to the index throws away the only evidence of what happened: a stale bookmark
  or a link someone shared becomes an ordinary index page, and the reader concludes
  they mis-tapped rather than that the record is gone.
  **The general heading check could never have caught this** and now does not need to:
  it reads whether a page *file* contains a `PageHeader`, not whether the branch you
  are looking at renders one, so every one of these pages passed it while its
  not-found branch had no heading. The `h1` comes from the shared component, so the
  branch is right by construction.
  Five rules, each mutated. One survived — "every record route uses `RecordNotFound`"
  passed when the JSX was replaced by a bare card, because the leftover *import* line
  still matched the string. It matches `<RecordNotFound` now. Five of five killed
  after that.
  **Also fixed, out of scope and worth it:** the `scales linearly` perf test failed
  twice in a day while passing in isolation. It divides one median by another, and with
  a three-millisecond denominator that is enough to fail a green build. Ratios take the
  *fastest* of five runs now — the one with least interference — while absolute budgets
  keep the conservative median. Four consecutive full-suite runs green.

- **M42 — Validate route parameters.** *Done.* The heading was the least of it.
  **`/log/:date` used the parameter as the session's stored primary key.** Logging a
  session from `/log/nope` wrote `{ id: 'nope#0', date: 'nope' }`; logging one from
  `/log/2026-9-1` wrote a row that `/log/2026-09-01` — the same day, written the way
  the rest of the app writes days — reported as "Nothing planned". Verified in a
  browser against the database: both rows landed, and neither appeared on the calendar,
  in a streak, or in any derivation. A second spelling of a day is a second key.
  **And the parse rolls overflow forward silently.** `fromKey` is `new Date(y, m - 1,
  d)`, so `/log/2026-13-45` rendered "**Sunday, February 14**" and `/log/2026-02-30`
  rendered "Monday, March 2" — a different day from the one in the URL, with nothing
  to say so. `/year/:year` read `Number(params.year) || years[0] || thisYear`, which
  quietly showed the current year for `nope` and `0`, and rendered `-5`, `2026.5`,
  `99999` and `1000000000` as page headings.
  **`isDateKey` round-trips rather than pattern-matching**: a key that survives
  `fromKey` then `toKey` unchanged is a real day written the one way this app writes
  days. Both halves earn their place — the round-trip alone accepts `10000-01-01`, and
  the shape test alone accepts every rollover.
  **Two layers, so neither is the only one.** The route refuses to mount the page, and
  `newSession` throws on a date that is not a key — which covers import, restore and
  any future caller, not just the URL. Fifteen malformed parameters swept in a browser,
  all fifteen caught, and day-to-day navigation and `/year` unchanged.
  **`BadParameter` is deliberately not `RecordNotFound`**: a malformed date is not a
  deleted record, and "That day is not here" would be a worse lie than the "Sunday,
  February 14" it replaces. It shows the offending value back, truncated, so the reader
  can see which character is wrong.
  Five mutations, three survived first time. Two were gaps in the cases — the year
  bound and the not-quite-a-year (`2020.5` parses inside the range) — now closed. The
  third is a limit rather than a gap: the route rule is a *source* check and cannot
  tell a guard that is written from one that is disabled with `if (false && …)`. Said
  so in the test rather than implying otherwise, and pointed at where the invariant is
  really held — `newSession`, which is behavioural and does kill that mutation.
  **Also fixed:** the M41 route parser read only the first name out of `import { X, Y }`,
  so `/log/:date` fell out of the list it walks and one rule was checking nothing. Its
  coverage floor is what caught it.

### Third audit — the app as a shipping product (2026-09-10)

Driven in a browser against three datasets — empty, 260 sessions, and 1,600 sessions
across nine years — plus a fresh-install link crawl of 38 screens, an offline test
against a real build, and structural measurement. Two findings were withdrawn as
artefacts of my own seed data before they reached this list, and one ("nothing reaches
the logger from a fresh install") was wrong once crawled: two links do.

**What measured clean, so nobody spends a milestone on it:** offline is complete —
every route including the lazy ones, and a hard reload while offline, against a real
build. Base accessibility holds: skip link, one `main`/`nav`/`header`, `lang`, live
regions, visible focus rings on every tab stop, a global `prefers-reduced-motion`
block, and real `role="dialog"` + `aria-modal` with focus management where dialogs
exist. Search indexes 697 items across glossary, guides, sessions, projects and
programs and is honest about being exact rather than fuzzy. Persistent storage is
requested on boot. All 29 routes render with two years of data with no console errors
and no horizontal overflow at 412px, and every empty state explains what will appear
and why.

- **M43 — Tests that render the app.** *Done.* The features layer was **12,934 lines
  against 362 lines of test — 2.8%**, against an engine at 12,306 and 10,781. Every
  defect in M35, M39, M41 and M42 lived in features and was found by driving a browser
  by hand: the finder never reading logged metrics, five "not found" behaviours across
  eleven routes, `/log/nope` writing a session no other screen could see. The
  source-scanning tests written since are a workaround for having no way to render a
  component — they prove a call is *written*, which is why two of them survived their
  first mutation.
  **jsdom per file, not for the suite.** `// @vitest-environment jsdom` on the five
  component files leaves 85 node-environment files untouched; the whole run went from
  11s to 16.7s. `src/test/render.tsx` mounts a page inside the app's own `Router` with
  hash location — there are no context providers to reproduce, because the stores are
  module-level zustand — and `hydrate()` loads them from fake-indexeddb the way boot
  does, since every page gates on `hydrated` and a test that skips it asserts against a
  skeleton.
  **The proof, not the claim.** Re-introducing M35's exact wiring bug — the page holding
  `metrics` and not passing them to `findProgram` — leaves **1,556 tests passing** and
  fails the one component test. That is the class no source rule can reach.
  **`mounts.test.tsx` is the cheap net over the other 12,000 lines**: every routed page,
  mounted twice, once on a new install and once against 120 sessions, six months of
  benchmarks and a project. It asserts almost nothing per page — a top-level heading
  with words in it, and nothing thrown — because that is the failure this app kept
  shipping. A coverage check reads `component={…}` out of `App.tsx` and fails if a
  routed page is missing from the list.
  Six mutations, six killed: a page dropped from the list, a page that throws, a page
  with an empty heading, and the three historical bugs. One was a no-op first time
  round and had to be redone against the real source, which is now the fourth time that
  has happened.
  **Deliberately not covered:** jsdom has no layout and no stylesheet, so it cannot see
  the M30 defect where `p-0` lost to `p-3` on Tailwind's ordering, or a card that
  collapses to no height. That class still needs a browser. **And a third mount pass —
  well-formed records are all these two seed — belongs here once M44 lands**, because
  the audit's central finding is that one malformed record kills `/journal` and
  `/search` outright.

- **M44 — A bad record costs one card, not the page.** *Done.* Deleting one field from
  one project out of seven killed **`/journal` and `/search` outright**.
  **The audit's diagnosis was wrong, and the real one is more interesting.** It read as
  "those pages do not use `CardBoundary`". They do — both use `PageGrid`, which wraps
  every child in one. The throw is in a `useMemo` in the page body, *above* the grid: a
  boundary catches what its children throw while rendering and cannot catch its parent
  computing what to hand them. So the pages that derive across every record are exactly
  the ones no card boundary can protect, and adding more boundaries would have fixed
  nothing.
  **Checked where the records enter instead.** Every `list*` ended `db.getAll(store) as
  unknown as Thing[]` — a cast, which is a promise nothing kept. `sound()` takes a
  declarative shape per store and returns records the app can walk: **a missing list
  becomes an empty one** (a project with no beta notes is a true statement about that
  project), **a record missing something unrepairable is left out** (nothing can be
  addressed without a name to show or a number to plot), and **an element the engines
  walk into is dropped from its list** — a beta note with no date reached the journal
  as an entry with no date, which `byMonth` then sliced. One level deep, deliberately:
  it covers a session's climbs and a project's beta notes, and a recursive validator
  here would be a schema library, which is a different decision.
  **Not silent.** A repair nobody is told about is its own kind of data loss: the page
  renders, the list is one shorter, and there is nothing to notice. `readingProblems()`
  is counted per store and Settings says which part of the data was short and by how
  much.
  **A record cannot be missing its identifier**, which the malformed-record seeding
  found: every store has a `keyPath`, so IndexedDB rejects such a record outright —
  from `importAll` exactly as from a test. Anything *else* can be absent, and those are
  what the app walked into. Import is left alone on purpose: the read boundary covers
  records already stored, which validating on the way in would not.
  `mounts.test.tsx` gained the third pass M43 promised — all 34 pages, now mounted
  empty, full, and against records an older backup left broken. Five mutations, five
  killed.
  **Also fixed, found by the suite rather than looked for:** `newProgramId` was a
  timestamp plus **four** base-36 characters. Two hundred ids made inside one
  millisecond collide about 1.2% of the time, which is how often the test that draws
  two hundred was failing. The id is opaque and `randomUUID` is available everywhere
  this app runs, so there was nothing to trade off. Second flake fixed this pass; the
  first was the ACWR ratio in M41.

- **M45 — The app assumes an active program and hides itself without one.** *Done.*
  With 1,600 sessions logged, `/calendar` rendered "No active program yet… your
  sessions will appear here" — the history invisible under a promise it was breaking.
  Home's Today card, which holds the only prominent log button, was gated the same way.
  A crawl of 38 screens from a fresh install found logging reachable only from Coach's
  Corner and from search.
  **A program says what you *should* do. It has never had anything to do with what you
  already did.** Both gates were early returns that threw away the second half with the
  first. The calendar's month grid is now always drawn — every day linked, every logged
  day ticked — with the planned layer conditional: `plannedDay` per cell only when
  there is a plan, Rearrange hidden, deload marks and the planned-session legend absent
  because there is nothing to mark. The invitation to pick a program moved from
  *instead of* the grid to *above* it, so it is still offered and no longer costs
  anything.
  **Home's Today card is unconditional, and moved to second.** It was the eighth card
  down, below the coach, the altimeter, the board, the weekly review and the game —
  reachable is not the same as usable for the thing a training app is for. It now sits
  directly under the climber strip and reads "Log a session" with no program, "Start
  session" with one, "Log rest day" on a rest day and "View session" once done.
  **The judgement call worth flagging:** moving that card reorders the home screen,
  which is a design decision rather than a defect. It is one block to move back.
  Verified in a browser both ways on the same 260-session log: with no program the
  calendar reads "What you have logged" and ticks sixteen days in July 2025; with Iron
  Grip running it reads "Iron Grip", draws the session icons and keeps Rearrange. Four
  mutations, four killed.

- **M46 — Say something on the dangerous side of load.** *Done.* Everything needed
  existed and none of it spoke. `derive.ts` names the bands, `AcwrZone` already had
  `caution` and `danger`, the load chart painted all three, the XP brake withheld the
  effort bonus above 1.3, and Progress printed the ratio. The coach — the app's only
  proactive voice, which will tell you about a plateau, a stale benchmark, a missing
  backup and a streak worth keeping — had **ten rules and not one fired when the ratio
  climbed**. An app carrying an injury tracker, warning about losing fitness, silent
  about the pattern most associated with getting hurt.
  **Both zones speak, and a worsening spike speaks again.** Ramping quickly is a normal
  week for someone deliberately adding load, so it says so once at weight 62 and can be
  waved away; the signature is the zone, so dismissing that does not dismiss the spike
  it may become. A spike is weight 93 — above every tip that fires on real data,
  because a plateau is a months-long problem and this is a this-week one. Past 1.8 the
  signature changes again, because a dismissal is "I have read this", not "I have
  handled it".
  **Deliberately not the gauge §5.5 describes.** A permanent gauge is ambient awareness
  of a number that is unremarkable most of the time; what was missing was anyone
  *saying* something when it stopped being unremarkable. The tip names the ratio, gives
  the reason in plain language, carries an action, and leads Coach's Corner on Home —
  and Home is a screen M45 has just finished decongesting, so a ninth card showing a
  usually-boring number would be a poor trade. The full gauge, chart and bands stay on
  Progress, one tap away. Recorded here rather than quietly skipped.
  **`ZONE` moved out of `ProgressPage` into `ui/loadZone.ts`**, because two copies of a
  threshold's wording is exactly how a guide ends up saying 1.3 while the app draws the
  line at 1.4.
  Five mutations, five killed. **The harness gained `reset()`**: `fake-indexeddb` is one
  database per file, so a test seeding *less* than the one before it inherits the
  difference — which reads as the app ignoring its fixture. Every component test written
  so far was accidentally safe because their ids were deterministic; this one was not.

- **M47 — Grade display has to reach the catalogue.** *Done, the half that can be.*
  With Font selected, Projects and Progress converted correctly and the catalogue did
  not: "Base Camp V0-V2", "V5-V8 GRADES". This was the known limitation parked against
  M9 at the foot of the guide-verification section; M9 finished and it outlived it.
  **`gradeRange.label` is an override now, not the label.** `displayRange` derives the
  words from `min` and `max` in the reader's own notation, and a label survives only
  where the ladder is not the point — "All Levels" is not V0-V17, and Ground Zero's
  "Pre-Climbing" is not V0. Seven authored ranges deleted; four editorial ones kept. A
  test asserts no surviving label looks like a range, so a new program cannot ship a
  hand-written "V3-V6".
  **Deriving it broke the finder, and the whole suite stayed green.** Three of its
  sentences read the label directly, so they became "undefined matches where you climb"
  — with 1,713 tests passing, because nothing had ever asserted what those sentences
  contain. `FinderInput` carries `display` now: the finder speaks to a climber, so it
  says the range the way that climber reads grades. Tests for all three lines.
  **The prose half is authoring, and a render-time transform would be wrong.** That is
  the finding that settled it: **20 of the 61 grade tokens in the guides are the
  notation being explained** — "V-scale (for bouldering) — runs from V0 (easiest)
  upward", "Yosemite Decimal System … runs 5.0 to 5.15+". Rewriting those into Font
  gives "runs from 4 (easiest) upward" in a passage whose subject is the V-scale. So
  the remaining grades — **37 in program prose** (a pitch's "for V5-V8 climbers", a
  graduation note, the reason given for what comes next) and **41 in the program
  guides** — are pinned by count rather than hidden: they cannot grow without someone
  editing the test, and the numbers are the size of the job whenever it is picked up.
  Five mutations, five killed. Verified in a browser both ways: the program list goes
  from four V-scale ranges to `6A-6C`, `6C-7B`, `7B-8A` with none left; the program
  page header converts and its prose does not, which is exactly the pinned debt.

- **M48 — Weight in kilograms.** *Done, the half that can be.* An app that offers
  V/Font and YDS/French and then prescribes max hangs in pounds is half-
  internationalised — and `min_edge` was already millimetres, because a 20mm edge is a
  20mm edge everywhere. **The app was never imperial; it was inconsistent.**
  **Storage stays imperial**, the same call as grades: which unit a number is stored in
  is invisible, and migrating every logged benchmark would buy nothing anyone can see.
  Which unit it is *shown* in was the part that was wrong, so `units.ts` is a display
  concern keyed on the exact `unit` string a metric declares — a unit not in the table
  needs no conversion, which is the common case.
  **The surface was bigger than the audit found.** Three weight metrics, yes — and two
  in inches (`box_jump_height`, `toe_touch`), and **the whole altimeter, which is feet
  from end to end and is not in the metric registry at all**. Shipping a units toggle
  that converts a max hang and leaves "10,238 ft climbed" would be the same half-done
  thing the milestone exists to fix, so the altimeter converts too. Its page already
  printed metres underneath the feet, for everyone, regardless of who was reading —
  that line now shows whichever unit is *not* selected.
  **Default imperial**, matching the V/YDS grade defaults and the content as authored,
  so the app is self-consistent out of the box. One line to flip.
  **`ScalePicker` was constrained to `BoulderDisplay | RouteDisplay`** for no reason it
  earns — it does nothing scale-specific — so widening it to `string` let the units
  picker reuse it rather than grow a near-copy.
  Five mutations, five killed, **two only after the tests were fixed**. Entering a
  number was never tested through `parseMetricInput`, which is the dangerous direction:
  type 27.2 reading kilograms, store 27.2 pounds, and every comparison against that
  history is silently wrong. And the altimeter assertion matched the *shape* of the
  headline, so printing the feet with an "m" after it passed — the two lines have to
  agree on the height now, not just end in the right letter.
  **The browser caught what neither found**: `SelectableCard`'s `label` is the
  accessible name and the visible text is a separate span, so the option's display name
  reached a screen reader and the screen still read "imperial" in lower case.
  **Prose is pinned, as in M47**: 16 weights written into program content and 16 into
  the guides, counted so they cannot grow quietly.

- **M49 — A custom program should be hard to lose.** *Done.* Deleting one was a single
  tap in a "Danger zone" card with no confirmation and no undo, then a navigate away.
  Sessions, projects and objectives all call `offerUndo`; the project asks first as
  well. The custom program — a coach's twelve-week block written by hand — was the most
  expensive thing in the app to recreate and the only delete with no net at all.
  It now follows the project's shape exactly: a confirm step naming what goes with it,
  then `offerUndo`, and `save` puts the program back on its own because it filters by
  id and appends.
  **Writing the test found a second thing.** Deleting the program you are *running*
  left `activeProgramId` pointing at a program that no longer exists — the case where
  losing it hurts most. Home and the calendar survive it since M45 taught them to live
  without a program, so it read as "no active program" while the profile still held an
  id; `stopProgram()` now fires when the deleted program is the active one. A mutation
  that stops the *wrong* program is caught too, because a guard written backwards is
  the easy version of this mistake.
  Five mutations, five killed. Verified in a browser end to end: first tap asks, "Delete
  for good" removes it and raises a fifteen-second undo bar, and Undo puts the program
  back in the list.

- **M50 — Video.** *Decided: no. Photos only, and the app says so without the "for
  now".* Climbing's native medium is a fifteen-second beta clip and M30 already built
  the owner and orphan-sweep infrastructure it would reuse, so the plumbing was never
  the problem. Three things were, and they are worth writing down so this is not
  reopened on a hunch:
  **Nothing can make a clip small in this app.** `prepareImage` re-encodes a photo with
  `createImageBitmap` and a canvas; video has no equivalent. The options were
  WebCodecs plus a muxer — Android Chrome and Safari 16.4+ only, with no fallback below
  that — or `ffmpeg.wasm`, which is 25-30MB against a **225KB first load**. Recording
  in-app with `MediaRecorder` was the one route with full size control and no
  dependency, and it cannot import the clip your mate already filmed, which is how
  climbing video actually gets shot.
  **The backup could not carry it.** Measured: 96 photos at the app's own 600KB ceiling
  — 56MB — already produce a **75MB file and a 225MB peak heap**. One 15s 1080p clip is
  10-20MB before base64.
  **And a beta clip is a photo sequence away from solved.** Eight photos per owner
  already covers "here is the sequence"; video buys motion, which is worth less than
  the storage it costs in an app with no cloud behind it.
  The refusal message in `lib/image.ts` was already the honest answer; it is now stated
  as a decision rather than a delay.

- **M53 — Media out of the backup JSON.** *Done.* `exportAll` base64-encoded every
  blob into one object and `JSON.stringify`d the lot, so a 56MB photo library became a
  **75MB file** — a third larger than the photos themselves — assembled through several
  full copies at once for a **225MB peak heap**. The app's own settings copy warned that
  photos "take about a third more room" in a backup, which is the base64 tax described
  as if it were a fact of nature.
  A backup is now a container: `backup.json` holding the records, and `media/<id>.<ext>`
  holding each photo as itself. `src/lib/zip.ts` writes and reads it — store-only, no
  deflate, no dependency, because every byte going in is already-compressed JPEG or WebP
  and a compression library would spend CPU to grow the file. It writes the whole archive
  into one allocation rather than a buffer per entry copied into a second, which is the
  other half of the peak-heap number.
  **Deliberately not a zip library.** No directories, no encryption, no Zip64, no data
  descriptors; anything else is refused by name rather than mis-parsed, because a backup
  that restores *wrongly* is worse than one that refuses. It reads through the central
  directory rather than scanning for local headers, checks every CRC-32, and refuses a
  compressed entry, a truncated file and a damaged byte with a sentence that says which.
  **Interoperability was checked outside this app, and the check found a real bug.** The
  archive is written and read by the system `unzip` and by Python's `zipfile` in both
  directions — and Python could not find `media/café–2.jpg`, because without
  general-purpose bit 11 a reader is entitled to decode names as CP437 and Python does.
  The flag is now set in both headers and asserted in a test; `unzip` had been guessing
  right and hiding it.
  **Old backups still import, and that shaped the design.** `readBackupFile` takes bytes
  and returns records plus photo bytes, detecting the format itself, so the preview, the
  import and the tests never learn which one they were handed. A pre-M53 JSON file with
  base64 photos inside it restores exactly as it always did. A photo the records name but
  the archive does not carry is dropped and *counted* — at read time, so the preview a
  climber reads and the import they confirm are talking about the same photos, and the
  count is said before the import rather than discovered after it.
  Photo file names come from the record id, which arrives from whatever file was imported
  last: sanitised to `[A-Za-z0-9._-]`, so `../../backup.json` cannot write over the
  records, and de-duplicated, so two ids that sanitise to the same name stay two photos.
  Nine mutations, nine killed. Verified in a browser end to end: export downloads a .zip
  whose contents `unzip -l` lists as `backup.json` plus two photos; wiping the device and
  importing it back restores both photos byte-for-byte with their types and captions; a
  hand-written pre-M53 JSON backup imports; an archive missing one photo says so and
  brings in the rest.
  **Measured, both formats, same machine and same 96 photos at the 600KB ceiling:** the
  old path wrote a **75.0MB** file in **4,211ms** and needed **+273MB** of memory beyond
  the photos it already held; the new one writes **56.3MB** — 0.02% over the photos
  themselves — in **638ms** for **+66MB**, which is one copy of the archive and nothing
  else.

- **M54 — Undo an import, keep your photos.** *Done.* `takeSnapshot` stores records
  only — deliberately, since a snapshot with media would double the largest thing in the
  database at the riskiest moment — and `restoreSnapshot` then called
  `importAll(file, 'replace')`. A replace whose file carries no photos clears the media
  store, so **undoing a merge import deleted every photo on the device**, including
  photos that were never at risk: a merge does not touch them, and the undo did.
  Confirmed with a test before it was fixed. It predates M53 and was found while wiring
  it.
  The ambiguity was in the data: `media: undefined` meant both "this backup deliberately
  carries no photos, so a replace clears them" and "this file has nothing to say about
  photos". Those are different sentences and only the caller knows which one it is
  speaking, so `importAll` now takes `{ blobs, photos: 'clear' | 'keep' }` and the
  snapshot restore — the only caller with the second meaning — asks to keep. A backup a
  climber picked still clears, because the file is the statement of record.
  **Photos an undone import brought in are left to the boot sweep**, not deleted by the
  undo. They are orphans the moment their owners go, which is what `sweepOrphanMedia`
  already exists for; the undo cannot tell them from the photos of a delete whose
  fifteen-second undo bar is still on screen, and boot is the documented moment when no
  undo can be pending.
  The two cards were saying something that was true of the *snapshot* and false about
  what Undo did: "photos excepted, which the restore point does not hold" reads as *not
  restored*, not as *deleted*. They now say the restore point holds records rather than
  photos, that photos are left as they are, and — at the moment it can still be avoided —
  that photos a Replace clears do not come back.
  Five mutations, five killed. Verified in a browser: two photos, a merge import from a
  backup carrying none, Undo — two photos.

- **M55 — A week a climber can actually train.** *Done.* Three gaps, one change.
  **One day.** Onboarding offered 2-6 days a week and the Start Program page offered
  2-6, while the lowest any program asks for is 3 — so a two-day climber was cautioned by
  every option in the catalogue and a one-day climber could not say so at all. Both now
  start at one.
  **Which days.** `layoutsFor` built three fixed shapes and nothing else, so a climber who
  can only train Friday, Saturday and Sunday picked the nearest miss and dragged sessions
  around the calendar afterwards. There is now a day picker, and the shapes are built only
  from the days it holds.
  **Which sessions.** With fewer days than session types the generator laid them out by
  declaration order — the first two of four, because they were written first. `SessionType`
  now carries `priority`, and `sessionsForDays` keeps the important ones and repeats them
  when a week is long, skipping anything that has hit its own `max-per-week`. Unset
  priorities sort after every authored one in declaration order, so an untuned program
  behaves exactly as it did. **The values are a coaching judgement and are deliberately
  unset**: nothing in the catalogue is tuned yet.
  **Two things the work turned up.** `assignSessions` now searches orderings for the one
  that breaks fewest rules, keeping the priority order on a tie — before this an
  `order-in-week` rule was satisfied by luck or not at all. And **Iron Grip has no legal
  three-day week on Friday, Saturday and Sunday**: 48 hours between finger sessions and no
  fingers the day before hard climbing cannot both hold across three consecutive days. The
  old code offered an empty list; it now steps down and offers the two-day weeks that do
  work, and the screen says why.
  A generated shape is also named for what it is. "Front-loaded — hard days early in the
  week, weekend free" is a false sentence about a Friday-and-Saturday week, so a week built
  from chosen days is named by its days and described by its spacing.
  Seven mutations, seven killed. Verified in a browser: the weekend picker produces
  `Fri, Sat`, `Sun, Fri` and `Sun, Sat` two-day weeks with the notice explaining the step
  down, and a one-day week says "Keeps Finger Protocol + Engine. Leaves out Climbing
  Session."

- **M56 — Run a program over the time you have.** *Done.* A climber with six weeks
  before a trip could not run a twelve-week block; the app's only answer was "start it and
  stop halfway", which gets them the first two phases and never the third — the one the
  block was building toward.
  **A remapping, not a truncation.** `adaptProgram` apportions the weeks across the phases
  by largest remainder, so proportions hold and no phase is left with none — prescriptions
  are keyed by phase id, so a lost phase is a lost block. Phase ids, names, session types
  and every `perPhase` prescription come through untouched. Week-keyed drills follow their
  phase.
  **Rescaling keeps both ends of a phase.** Centre-sampling a four-week phase into two
  picks weeks 2 and 4 — it drops the week that introduces the movement and keeps the
  repeats. Keeping the endpoints picks 1 and 4, the week a pattern is taught and the week
  it is loaded, and thins the middle instead. That is also what makes a phase-final deload
  land on the phase end without a special case for it.
  **Deloads keep what they meant, then get thinned.** Most of the catalogue deloads on the
  last week of a phase. Compress twelve weeks into six and that rule alone puts a deload
  every other week, which is a holiday rather than a block — so they are thinned to three
  weeks apart, latest first, and the final week is cleared, because a block that ends on a
  deload ends on nothing. Gravity Defied's `[4, 8]` becomes `[4]`.
  **Applied in one place.** The length lives on the profile and is registered with the
  program lookup exactly as a custom program is, so all fourteen `getProgram` call sites —
  including the two inside pure engines that cannot read a React store — get the adapted
  program without knowing it exists. Nothing shorter than four weeks or than the program's
  own phase count is ever offered.
  **The honesty is the other half.** The guide describes the written block and cannot be
  rewritten, so the length picker says what the phases become and where the deload lands
  before the climber commits, the program's own screen reads "6 / of 12", and the guide
  page says its week numbers belong to the twelve-week block.
  **A bug the tests found:** the length picker read the program through `getProgram`, which
  returns the adapted one — so choosing six weeks and then twelve compressed a six-week
  program into twelve, with no way back to what the author wrote. It reads
  `writtenProgram` now.
  Eleven mutations, eleven killed. Verified in a browser end to end: pick six weeks, start,
  and the profile stores `{gravity_defied: 6}` with the week plan; the program tile reads
  "6 of 12"; the guide says which block it is describing.

- **M57 — The finder asks how long you have.** *Done.* `FinderInput` knew days a week,
  equipment, grades, goal and injuries — not how many weeks the climber had, so a block
  written to fit a trip could never be recommended for the reason it exists.
  The question is on the finder screen and **not** in the baseline: a trip is a fact about
  this month, not about a climber, and the seven questions are answered once. It defaults
  to open, which is the honest default — most of the time there is no date.
  A program longer than the time available is **cautioned, never blocked**: since M56 a
  twelve-week block can be run over six, so "Written as 12 weeks — you would run it over 6"
  is the true sentence, and it scores below the same program with no deadline. One that
  fits scores above it. Below four weeks — the floor an adaptation can reach — the caution
  becomes "12 weeks, and 3 is too few to run it over", which is the catalogue admitting the
  hole M58 fills.
  Five mutations, five killed, including two that only died once the test measured a
  program against *itself with no deadline* rather than against another program.
  Verified in a browser: asking for six weeks puts the sentence on every recommendation.
  *Not done here: arriving at a program from a finder run with a deadline does not preselect
  that length on the start screen. The climber picks it again, one card down.*

- **M58 — Two programs the catalogue does not have.** *Structure done, training content
  drafted, not shipped.* Both live in `src/content/programs/drafts/` and are deliberately
  **not** in `PROGRAMS`: nothing recommends them, nothing lists them, nobody can start one,
  and the bundle does not carry them (checked — the built assets contain neither id). A
  program in the catalogue is a coaching prescription, and these are drafts of one until
  the person who coaches has read them.
  **Two Days a Week** — 12 weeks, three phases, `sessions-per-week` 2-3, and the hole it
  fills is the app's own: onboarding offers two days a week and the lowest anything shipped
  asks for is three. Two session types that matter and one that does not, with `priority`
  set so a one-day week keeps the climbing.
  **Trip Prep** — 4 weeks, Sharpen (1-3) and Taper (4), `sessions-per-week` 3-4, no deload
  because the taper is the deload and a second one would leave two weeks of training in the
  block. Shorter than anything in the catalogue, and the reason M56's compression is not a
  substitute: four weeks before a trip is a taper, not a training phase, and remapping a
  twelve-week block does not turn one into the other.
  `drafts.test.ts` runs the same validation the builder runs on a climber's own program,
  plus the catalogue's rules — phases tile, every block prescribes every phase, something
  changes at every phase *boundary* or the block declares itself constant, the recommended
  layout breaks no rule, every day count from one to five lays out cleanly, every offered
  length adapts cleanly, and the ids do not collide with a shipped one. Seven mutations,
  seven killed, one of which only died once the test checked adjacent phases rather than
  the block as a whole.
  **What is still the coach's, before either ships:** every dose and progression step in
  both files; whether a two-day week deloads once (week 8, as drafted), twice or not at all;
  whether the climbing day really is what survives a one-day week; whether Trip Prep tapers
  over one week or two; the `max-per-week` caps; grade ranges and entry standards, which are
  currently open. And each needs a guide — `guides.test.ts` requires one per shipped
  program, which is the check that stops either of these reaching a climber half-written.

- **M51 — Decide multi-profile/coach mode.** *Decided: no. One climber per install.*
  §feature-9 had already recorded this; §9.3 and this entry had not caught up, so the
  decision existed twice in the plan with two different answers. Both claims it rested on
  were re-checked against the code as it now stands and both hold: `DB_NAME` still has
  exactly one functional use, `openDB(DB_NAME, …)` in `db.ts`, so "one database per
  profile" really is one line plus a registry; and `hydrateAll()` is still the switch,
  running at boot and again after an import and an undo.
  **The reasoning had a hole worth writing down.** The old note said coach mode is a *view
  someone else's data* problem "not a local-profiles problem", and pointed at import and
  share. But viewing an athlete's backup means loading it somewhere, and the only somewhere
  is the coach's own live database, as a replace or a merge. So if coach mode is ever
  built, **it arrives through local profiles rather than instead of them**: a scratch
  profile that an athlete's backup opens into, browsed with the whole app working normally
  and then discarded. The alternative — a read-only mode inside the live database — means
  gating roughly thirty write call sites and getting every one right, which is more work
  and more risk for a worse result. Program *sharing* is already built and is untouched by
  this: `Program.author`, program-file import and export, attribution on the detail page.
  **One piece is genuinely path-dependent and is not about profiles at all.** The record at
  `profile/settings` holds `theme`, `themeId`, `textSize` and `cues` — device-level — beside
  `display` and `units`, which belong to the climber. `profile` is an exportable store, so
  importing anyone's backup today changes your theme, text size and sound. That is worth
  fixing before Play whatever happens to profiles, and it is the only part of this that gets
  harder once real installs exist. Carried as M60.
  Everything else is additive: a registry and a second database can be built years later
  without touching an existing install, and the v1→v2 migration already shipped proves the
  framework works when it is needed.

- **M52 — A catalogue with more than one shape.** *Split into M55-M58 and mostly done.*
  The engine half is finished: a week can be built from the days a climber actually has and
  the sessions that matter most (M55), a written block can be run over fewer weeks (M56),
  and the finder asks how long they have (M57). The authoring half is drafted and unshipped
  (M58). What is left is a coach's reading of two draft programs and a guide for each —
  the one part of this that only the person who writes the training can do.

- **M59 — The deadline a climber just gave the finder.** *Done.* They told the finder
  they had six weeks, it recommended a twelve-week block saying "you would run it over 6",
  they opened it — and the start screen asked the same question again one card down.
  The answer now travels with them, in a store that is **deliberately not persisted**: a
  trip is a fact about this month, and a deadline that outlived the session it was typed in
  would silently shorten a program months later. A reload clears it, which is right.
  It is a suggestion and behaves like one. A length the climber already committed to wins
  over it; changing the picker wins over it and takes the note with it; a deadline longer
  than the program never stretches it, because `lengthsFor` never offers more than the
  written length; and a deadline no offered length serves — five weeks, say — preselects
  nothing rather than choosing something near it on their behalf. It also says where it
  came from: "Set from what you told the finder: 6 weeks." A length preselected silently is
  a length a climber cannot trust.
  Six mutations, five killed and one deleted: the guard against a deadline longer than the
  program could not be killed because `lengthsFor` already makes it impossible, so it went
  rather than staying as code no test can defend.
  Verified in a browser along the path a climber actually walks — finder, six weeks, top
  recommendation, program page, start — and the length is preselected with its reason.

- **M60 — Device settings stop travelling in backups.** *Done.* `profile/settings` held
  `theme`, `themeId`, `textSize` and `cues` — which belong to the phone in the hand — beside
  `display` and `units`, which belong to the climber. `profile` is an exportable store, so
  **importing anyone's backup changed your theme, your text size and your sound**, and
  restoring your own onto a new phone in daylight brought back the dark theme you set at
  night. Found while closing M51, and the one piece of that decision that gets harder once
  real installs exist.
  Device settings live in `localStorage` now: per-device by definition, synchronous, and
  never inside a backup. The climber's two stay in the record and still travel.
  **An existing install keeps what it had.** The first hydrate on a device reads the device
  fields out of the record it already has, moves them, and rewrites the record without them
  so the next backup does not carry them. The guard is that `localStorage` holding *nothing*
  is the only signal of a device that has not been here before — and at boot that is the
  only moment it can be true, so an imported backup can never be the thing that gets
  migrated.
  Every read and write is guarded, because `localStorage` throws outright in some
  private-browsing modes rather than merely being empty. A private window with an existing
  database still reads its theme out of that database for the session; it simply cannot
  remember a new choice past it.
  Six mutations, six killed — the last only once the test covered a private window that
  *has* a database, which is the case where reading `null` and reading `{}` differ.
  Verified in a browser: an install seeded the old way migrates on first load, the record
  comes back holding only `display` and `units`, the page stays dark — and a record
  arriving afterwards with someone else's light theme changes nothing.

### The next fifteen (proposed, M61-M75)

*Brainstormed against the app as it stands. Three were asked for by name; six sharpen
something that already exists; six are new. Nothing here is committed.*

- **M61 — More themes, and a way to author one without guessing.** *Done.* Three themes
  became ten, and the tool came first for a reason: `themes.test.ts` answers "does this
  palette pass" and nothing answered "by how much is this one failing" — which is how the
  app shipped an accent at 4.31:1 for months.
  **The tool.** `npm run themes:check` measures all 640 pairs and prints the failures worst
  first; `-- --all` shows the headroom. Its rules live in `src/ui/paletteRules.ts` and the
  colour maths in `src/ui/contrast.ts`, both shared with the suite — a second copy of a
  contrast formula is how a report and a check start disagreeing, and a test now holds them
  to the same answer. A report that says "0 failing" because its comparison is inverted is
  worse than no report, so that is tested too, against a deliberately unreadable palette.
  **The drafter.** `scripts/theme-draft.ts` takes a character — hues, warmth, how dark the
  ground is — and solves each foreground's lightness until its rule clears with a margin.
  The judgement stays in the spec; the arithmetic is arithmetic. Two things fell out of
  running it. Lightness walked past 100 produced a three-character channel and a nonsense
  colour that the contrast maths then measured quite happily. And the shared `STATUS` ramp —
  which is deliberately not themed, so a climber changing theme does not relearn danger —
  failed on `good` for six of the first seven drafts, between 4.05:1 and 4.43:1, purely
  because their card sat a shade too close to it. The surface is solved against the ramp now
  rather than chosen.
  **Seven new: Limestone, Gritstone, Volcanic, Desert, Ice, High Contrast, Midnight.** The
  last two are not moods. High Contrast is for reading in sunlight or with low vision, and
  its two chart series are separated by lightness as well as hue — on a white ground both
  were darkened to reach 3:1 until they were 25 apart under simulation against a floor of
  40. Midnight is true black, which on an OLED screen is a battery setting as much as a look.
  **A find the new theme exposed.** `prefers-contrast: more` reached for Slate — the
  highest-contrast palette that happened to exist — and nothing tested that path. It uses
  the theme built for it now, an explicit choice still outranks it, and a test holds the code
  and the sentence in Settings to the same palette name.
  Also pinned: every theme id that has shipped. `getTheme` falls back to Alpine for an id it
  does not know, so renaming one silently resets every climber who had chosen it.
  Seven mutations, seven killed. Verified in a browser in both modes; the picker shows all
  ten; the bundle grew 2.3KB gzipped.

- **M62 — Gamification that spends what it earns.** *Done, and it was two dead rewards
  rather than one.*
  **The currency had no sink.** `spend()` sat on the game store and nothing in the app ever
  called it: the climber page had printed "N earned · 0 spent" since the day it was written.
  **The cosmetics were worse.** Five skill capstones grant a cosmetic id — and the appearance
  picker never read `effects.cosmetics` at all. Three of the five named kits that were free
  to everyone from the first run (90 days outside earned "the Granite kit", which every
  climber already had), and two named kits — Iron, Tension — that **existed nowhere in the
  app**. The reward was a sentence.
  A kit now has one of three provenances and never two. **Free**: the six that always were,
  and they stay free — locking one now would take a kit off a climber's back to make a
  point. **Earned**: five new kits, one per cosmetic id the trees already grant, locked
  until the tree grants them and never purchasable. **Bought**: four new kits, priced in
  coins, never granted — something you can buy is not a reward for training. Tests hold all
  three apart in both directions.
  The lock note names the node that earns it — "Earned by Vice Grip", "Earned by At Home
  Outside" — and it is *derived from the trees*, because a note naming the wrong node is
  worse than no note. Buying is one write, so a purchase cannot leave the coins gone and the
  kit unowned; buying twice is refused rather than charged twice; the balance is checked to
  the coin.
  **Prices come from the real rate.** A coin is a quarter of an XP point, which the first
  pass got wrong by a factor of four — 1,200 / 2,500 / 5,000 / 8,000 lands them at roughly
  levels 7, 10, 14 and 18. One number each, meant to be retuned.
  **Three capstone labels changed and are the coach's to confirm:** "the Slate kit" →
  Anchor, "the Granite kit" → Weathered, "the Alpine kit" → Summit. They had to change,
  because each named a kit that was already free; the names themselves are a judgement.
  What was *not* built: no seasons, and no titles beyond the ranks that already exist. And
  nothing buyable touches training, XP or the log — the shop sells paint.
  Eight mutations, eight killed. Verified in a browser: five locked kits each naming what
  earns them, four priced, and buying Basalt for 1,200 leaves the wallet at
  `{spent: 1200, owned: ["Basalt"]}` with the kit worn.

- **M63 — Achievements belong on the climber, and the career has to be findable.** *Done.*
  Fourteen achievements rendered on `/career`, which hangs off Progress — and on that page
  the career card was the **eighth card down, under seven charts**. Meanwhile the climber
  page held Skills, Stats, Currency, Ranks, Recent XP, Vitality and Appearance: everything
  about who you are except what you had done.
  The achievements card moved to the climber, directly under the level bar, with a career
  card beneath it. It reads its own stores now instead of taking props, which is how every
  other card of this kind works and is what let it move without either page knowing what it
  needs. On Progress, the career and year cards came up above the charts — what happened,
  then how it is going. The career page keeps the timeline, which is its point, and carries
  a signpost to where the fourteen went, placed *below* its own content rather than above
  it: a page about milestones should open with milestones.
  **The tab-bar surgery I proposed is withdrawn.** The brainstorm suggested the climber take
  a tab slot and search move to the header. Two things were wrong with that. Home already
  links to the climber, so it was never more than two taps away; and there is no header to
  move search into — the shell is a bottom bar on a phone and a left column on a desktop.
  Taking search's tab away would have made search worse to fix a problem Home already
  solves.
  Four mutations, four killed, including a placement one: putting the career card back
  below the charts fails a test that reads the rendered page and asserts it comes first.
  Verified in a browser at phone width across all three pages.

**Six that sharpen what is already there.**

- **M64 — Tune session priority across the catalogue.** *Done — the derivation and the
  values; the coaching calls are listed below and want confirming.* M55 gave `SessionType`
  a `priority` and set it on nothing, so all nine programs still dropped sessions in
  whatever order they happened to be declared in.
  `engine/priority.ts` reads the evidence each program already carries — how often the
  author's own prescribed week runs it, whether a rule protects it, whether it goes first
  "while fresh", whether it needs 48 hours around it, whether it is climbing or accessory
  work, whether its own name calls it optional — and proposes an order with the reasons
  attached. `npm run priority` prints the declared order, the proposed order and every line
  of evidence. **Where two sessions score the same it says so rather than pretending the
  program chose**, and declaration order stands, which is exactly what happened before.
  All nine are now authored from that proposal. Authoring is all-or-nothing per program:
  an unset priority sorts after every authored one, so tuning half a program would put the
  untouched half last however important it is — a test holds that.
  **What changed, and what wants a coach's eye.** *Climbing moved above the gym* in Base
  Camp, Gravity Defied and The Long Game — a one-day week now keeps the climbing session
  rather than the strength one. *Iron Grip keeps the climbing day over the fingerboard*,
  which the program itself argues for by protecting it ("never hang the day before hard
  climbing"). Both of those I would defend. **Lockdown is the one I would not**: the
  proposal puts the technique climbing day above "Session A: Static Power", which is the
  program's named centrepiece, and a two-day week that drops Session A is not a static
  power block. **The Cruiser's four climbing days score within a point of each other**, so
  a one-day week now keeps Performance where it used to keep Volume & Flow. **Peak
  Performance ties** Max Intensity with Projecting, and declaration order stands.
  **An authoring finding the tuning surfaced.** With the climbing day ranked first, Iron
  Grip's Friday-Saturday-Sunday week fills as *Performance, Performance, Fingers* — legal,
  because the program spaces the fingerboard and nothing else. It has no rule against two
  hard climbing days back to back. That is the program's to decide, not the scheduler's.
  Six mutations, six killed, after two rules that no shipped program exercises — the
  protection lift and the optional penalty — were moved onto fixtures rather than left as
  rules nobody checks. A third, an explicit tie-break, was deleted: `sort` has been required
  to be stable since ES2019, so it was a line no test could kill.
  Two M55 tests changed, and it is worth saying why: they pinned Iron Grip having no legal
  three-day weekend, which stopped being true when the priorities changed which sessions
  fill that week. They now use The Long Game, which cannot put Endurance and Performance on
  consecutive days and so still has to step down.

- **M65 — Search the guides, not just their headings.** *Done.* A guide was indexed by
  its name, its subtitle and its section *titles*. The bodies — the app's largest single
  body of knowledge, and the only place several things are explained at all — were
  unreachable except by opening a guide and reading it.
  `engine/guideText.ts` flattens a section to plain text: every block kind, not only the
  paragraphs, with the inline `**bold**` and `_italic_` markers stripped so a climber
  searching "deload" does not miss the line that wrote it in bold. A test walks the whole
  catalogue and fails if a new block kind is added to the content without being flattened.
  **One index entry per section, not per guide**, so a hit opens the passage rather than
  the top of a document that runs to several thousand words. `SearchItem` gained a `body` —
  distinct from `keywords`, which is a list of extra terms; this is the thing itself, and
  the results page reads it back to show the words around the match. A passage sits below
  the guide it belongs to, so searching a guide's name still returns the guide.
  **The destination is the passage.** `/guides/:id/:section` opens that section and scrolls
  to it, one-based because that is the number printed beside the heading. A section number
  that is not in the guide opens the document rather than silently showing a different
  passage — a stale link should not lie.
  **A bug the browser found in the hour it was written:** the scroll was skipped for
  section one, which conflated "the first section" with "no section asked for". Following a
  link to section one from section six left the reader 1,473 pixels below the thing they
  had asked to read. Fixed, and tested by watching what actually gets scrolled to.
  Eight mutations, eight killed, after one was moved off the rendered grouping — which is
  in a fixed order and hid the ranking — onto `scoreItem` itself. Also removed an empty
  `useEffect` that had been sitting in the guide page doing nothing.
  Verified in a browser: "deload" returns passages from three guides with the match in
  context, and following one lands on the open section.

- **M66 — ~~A grade pyramid~~ — withdrawn, it already ships.** The proposal said five
  charts ship and none of them is the pyramid. That was wrong: `PyramidBars` lives in
  `ui/charts/Charts.tsx` rather than in a file of its own, and Progress has rendered a
  "Grade pyramid" card, built on `engine/progress.ts`'s `pyramid()`, for some time. Listing
  a directory is not reading it. **Replaced by: sends by grade over *time*** — the pyramid
  is a snapshot, and the question it cannot answer is whether this year's base is wider than
  last year's. Same data, a second axis.

- **M67 — Put the assessments on the calendar.** *Done.* Every program declares its
  `assessments` and nothing ever put one on a date. The app already knew when a test was
  *due* — no baseline, a new phase since the last one, or eight weeks stale — but a climber
  only met that by visiting the assessments page, or afterwards, from the coach telling them
  they were late.
  `testWeeks(program)` names the weeks, and deliberately names **the weeks the existing
  rules already key off**, so the calendar and the assessments page cannot disagree: week
  one, because a block without a before has no after; the first week of every later phase,
  which is exactly when `assessmentStatus` starts reporting `phase`; and the last week,
  which is the after. Logging modes are left alone — no periodisation, no finish line, so a
  test week in one would be a date chosen by nothing.
  It rides on `PlannedDay` beside `isDeload`, so every screen that already reads a day gets
  it. The calendar marks the week; Home says which kind of test week it is and links to the
  battery. A shortened program tests at *its* phase boundaries, not the written one's — a
  six-week Gravity Defied tests in weeks 1, 3, 5 and 6.
  **A rule of mine that was wrong within the hour.** The first version suppressed the test
  marker on a deload week, on the grounds that two markers in one square is a mess. That
  lost **Peak Performance both of its mid-block tests**: it deloads on weeks 5 and 9, which
  are the two weeks its phases start. A deload is also the week a climber is freshest to
  test in, which makes it the last week to stay quiet. Both markers show now.
  **And one on Home.** The note first went inside the training-day branch, so it appeared on
  Monday and vanished on Tuesday. A test wants you fresh: the rest day in a test week is the
  best day to be told, not the one day the app says nothing. It sits outside the branch.
  Eight mutations, eight killed. Verified in a browser: the week of the 6th shows `DL` and
  `T` together, and Home reads "Week 5 of 12 · Intensify · Deload week · Test week" with the
  reason under it.

- **M68 — Share more than an achievement.** *Done, and nine tenths of it was already
  there.* The proposal said `ShareSheet` and `achievementCard` "exist and are wired to
  exactly one thing". Wrong, and wrong the same way M66 was: `shareCard.ts` holds **seven**
  card builders — a record, a project, a week, the altimeter, the day's Ascent wall, an
  achievement, a rank — and every one of them is already wired to a page. Reading the
  exports would have taken a minute.
  What was actually missing is the one page a climber would show someone: **the year in
  review**. `yearCard` is the eighth, and it says whether the year is finished — "412
  sessions" in September is a different sentence from the same words in January, and a card
  that leaves it out overstates. Offered only once there is a year to show, because a card
  of zeroes is worse than no card.
  Four mutations, four killed.

- **M69 — What your projects actually cost.** *Done.* Every attempt on every project was
  stored and nothing ever read them together, so a climber could see one project's history
  and never "how do I send" — a question their own log answers and no generic advice can.
  `engine/projectHistory.ts` counts, per sent project, the burns and the sessions and the
  days it took, up to *and including* the send: a project climbed again afterwards must not
  read as having taken forty burns. Grouped by grade, it reports the **middle** value rather
  than the mean, so one epic does not move the number.
  **It is descriptive and stays descriptive.** The proposal also wanted "what your sends
  have in common", and that is where a module like this starts inventing coaching out of a
  handful of data points. It does not. It reports counts, says how many sends they came
  from, marks any grade with fewer than three as one climb rather than a pattern, and stays
  silent overall until there are three. The card carries the asterisk and the sentence
  explaining it.
  Eight mutations, eight killed. Verified in a browser against four sends: "Across 4 sends,
  a project takes you 12 burns over 3 sessions and 17 days", with V5 solid at three sends
  and V6 flagged at one.

**Six that are new.**

- **M70 — ~~Your gym, as data~~ → The questions the programs already ask.** *Done, with
  the scope corrected.* The proposal assumed a session could reference a venue. It could not
  reference anything: nine programs declare `fields` on their session types — **twenty-four
  declarations, sixteen distinct ids, sixty-two references, `location` among them six
  times** — and nothing in the app read one of them. Outdoor Climbing asks every session
  where it happened, how many attempts and what the high point was; the logger never put any
  of it on screen. A question the content asks and the app never renders is a promise the
  content cannot keep, and building a venue catalogue on top of that would have added a
  second way to say where you climbed while the declared one stayed dead.
  `content/fields.ts` defines all sixteen — a label, a kind the logger can render, a unit or
  a placeholder where one helps — and a test reads the `FieldId` union straight out of
  `types.ts` rather than repeating it, so a new id cannot be added without a definition.
  `Session.fields` stores the answers, sparse: clearing one removes the key rather than
  storing a blank, and the last one leaving takes the whole bag with it, so a session never
  claims a zero it was not given.
  **A copy bug that shipped for exactly one browser run**: the logger rendered "Day of the
  trip (of the trip)", because the label and the unit said the same thing. Three fields had
  the same fault. There is now a test that a unit never repeats a word of its own label.
  Six mutations, six killed — the last only once the test stopped asking whether the value
  was undefined and started asking whether the *key* was there, which a structured clone
  preserves either way.
  *The venue catalogue is not built.* What it needed first is: sessions can now record where
  they happened, in free text. Turning that text into a catalogue of walls, circuits and set
  dates is a separate milestone, and a better one for having somewhere to attach to.

- **M71 — Draw the beta on the photo.** *Done, and stored against the proposal.* The
  proposal said "freehand and arrows on a canvas, **saved as a second image** beside the
  first", which is how every board app does it and is the wrong shape for this one. A
  flattened copy costs a second 600KB blob and one of the eight slots an owner gets; it
  cannot be undone, re-coloured or partly erased; and beta is the most revised thing a
  climber owns — the foot you marked in March is wrong by May. So the marks are kept as
  **geometry on the photo's own record**: a few hundred bytes against six hundred
  kilobytes, editable forever, and re-drawn crisp at whatever size the screen is. Three
  tools — freehand, an arrow for a move, a circle for a hold — four colours, undo, and
  tap-to-erase one mark, which is the one that matters once the photo has been closed and
  reopened and undo has nothing left to undo.
  **Two coordinate spaces, and the difference is load-bearing.** Points are *stored*
  normalised to 0..1 of the image, so a mark survives a re-encode at another resolution;
  they are *rendered* in the image's own pixel space, because a circle drawn in normalised
  space on a 4:3 photo is an ellipse on screen and an arrowhead is skewed. Colours are ids
  rather than hex, for the reason the themes were: a stored `#ffb300` freezes a palette
  decision at the moment of drawing, and an imported backup writing arbitrary text into an
  SVG paint attribute is a surface an id that falls back does not have.
  **SVG, not a canvas** — the opposite of the choice `features/ascent` made, for the
  opposite reason. That draws sixty frames a second of moving geometry and the pixels are
  the output; this draws a dozen static shapes that have to survive a re-render, scale to
  any screen and be assertable by a test. Every mark is drawn twice, a near-black halo
  under the colour, because rock is mid-grey in every photo anyone takes of it and a
  mid-tone stroke disappears into it — and every halo goes down before any ink, or the
  outline of the second mark cuts a channel through the colour of the first.
  Douglas–Peucker runs **once, on commit**, never on the live preview: simplifying a
  growing array on every pointer event is what makes a drawing tool lag behind the hand.
  Points closer together than five pixels are dropped at the door, by returning the same
  array so React skips the render entirely. The 120-point cap is met by *loosening the
  tolerance until it fits*, never by truncating — a sliced stroke is one that stops halfway
  up the wall, which is a worse lie than a coarser one that reaches the top.
  **A mutation survivor that deleted a claim instead of defending it.** `makeMark` guarded
  on `points.length < 4` and the guard survived being loosened to `< 2`, because `moved()`
  had already rejected every case it claimed to be rejecting. It is `< 2` now — the only
  thing it really covers is an empty gesture, which would otherwise become a mark made of
  four `undefined`s that renders as nothing, erases as nothing and can never be got rid of
  — and that case has a test.
  **A bug only the browser could show.** The photo viewer's scrim has always been
  `bg-black/80`, so the page behind read through it. Survivable for looking at a photo and
  not for drawing on one: the tool tray landed on top of the beta notes and the tab bar,
  and at 430px the single wrapping row broke into three ragged ones with a colour swatch
  orphaned on its own. Scrim to 95%, and the tray split into two rows that cannot wrap.
  Eighteen mutations, eighteen killed. Verified in a browser at phone width: a circle round
  a hold, a red arrow to the next, a cyan line up the sequence, all three stored to the
  exact fractions they were drawn at, still there after a reload, and the arrow gone when
  tapped with the eraser.
  *What it does not do:* the grid crops each thumbnail to a square, so a thumbnail carries a
  pen badge and the count in its label rather than the marks themselves — drawn on a crop,
  they would land somewhere they were not put, and a mark in the wrong place is worse than
  no mark. The backup carries the geometry inside `backup.json`; both sides of the archive
  list their fields by hand, so a round-trip test now stands where a field added to one and
  not the other would disappear with nothing to notice it.

- **M72 — A readiness check-in.** *Done, and kept out of the coach.* Two questions before a
  session — how the fingers feel, how the sleep was — and a set of rules over the answers.
  **The proposal wanted it to bias "the day's prescription and the coach's tips", and the
  coach half is wrong.** `engine/coach.ts` says what it is for in its own first paragraph:
  "standing observations about the training as a whole — things that stay true until they
  are dealt with", and *"every rule reads the derived state. None of them stores anything,
  so a tip cannot go stale"*. How you slept last night is the opposite on both counts, and
  putting it in there would make it the first tip with a shelf life measured in hours. So
  this lives with the session it is about, in `engine/readiness.ts`, and the coach is left
  alone.
  **Why two questions.** A second question only earns its place if it changes the answer by
  itself, and a test holds that: sore fingers on a good night and fresh fingers on no sleep
  are the same call and a different day. One takes the fingerboard away and leaves the
  volume; the other leaves the fingerboard and takes the intensity. Nine combinations, all
  nine asserted, because nine is small enough to check and a rules engine nobody has read
  end to end has a hole in it.
  **Three places it bites, because a check-in whose only output is a mood word is
  superstition with a UI.** The lines that load the part get flagged — through
  `exerciseConflict`, the same mechanism injuries already use, so one flag means one thing
  across the app. The effort card carries a ceiling next to the RPE chips: **RPE rather than
  load, deliberately**, because perceived effort self-adjusts — the hang that was a 6 last
  week is an 8 today and the ceiling catches that without being told. And a test scheduled
  for the week is told to wait, with the reason that is actually worth paying for: not the
  safety, the datum. *"A maximum effort on no sleep goes into the record as your strength,
  and stands there for 8 weeks"* — and the 8 is read out of `STALE_DAYS` rather than typed
  into the sentence, since the whole force of the line is the number.
  **It knows what today loads.** "Leave the fingerboard alone" on a mobility day is the sort
  of line that teaches people to stop reading, so the advice is filtered by the parts the
  day's own prescription loads. An *unknown* day — a climber with no program — still gets
  it; an empty one does not, and the difference between `undefined` and `[]` is tested in
  both directions.
  **An injury outranks the check-in on a line.** Both warnings on one exercise makes the
  first mean less, and a standing condition outranks how today happens to feel.
  **A half-answer is not a check-in.** Nothing is stored until both questions are answered,
  because filling in the missing half as "fine" puts words in the climber's mouth and then
  advises them on it. Leave it alone entirely and the card is two rows of chips that do
  nothing — which is the whole answer to the nagging risk.
  **A copy bug the browser caught**, and the same shape as M70's: the chip labels were cut
  out of the sentence labels, and `'Barely slept'.replace('Slept ', '')` is still
  `'Barely slept'` — so one chip in six came out at twice the width of its neighbours.
  Short labels are their own strings now, and a test holds every chip to one word.
  Sixteen mutations, sixteen killed. Verified in a browser on a Structural Integrity day:
  one answer stored nothing, both stored `{fingers: 'sore', sleep: 'good'}`, the flag landed
  on Dead Hang and on nothing else in a nine-exercise prescription, and setting the fingers
  back to fine took the flag, the ceiling and the whole readout away again.
  *What it does not do:* Home still says "Test week" without knowing the check-in wants it
  deferred — the deferral shows on the session screen only. And the answers are stored per
  session but nothing reads the series yet; a run of "barely slept" against the load chart
  is the obvious next thing and is not built.

- **M73 — Plan the peak, not just the block.** *Done, and it is not the same maths run in
  the other direction.* The proposal said it was. Backwards — which is what M25 drew — the
  loads are known and the ratio falls out. Forwards the ratio is a *constraint* and the
  loads are the unknown, and there are two goals pulling opposite ways: arriving **fresh**
  means the last week weighs less than the baseline, and arriving **not detrained** means
  the baseline is at least as high as it is now. A taper satisfies the first by violating
  the second unless the weeks before it built the room to spend. So it is a shape — build,
  hold, taper — not an inversion.
  **It does not own the trip date.** `Objective` already has `kind: 'trip'` and a
  `targetDate`, and its own doc comment describes exactly that: *"a trip you have booked"*.
  A second place to say when you are going would be a second place for it to be wrong, so
  the runway card reads the objective and adds no new record at all.
  **The rule it had to answer to.** `engine/objectives.ts` says of the same objective's
  progress line: *"no projection that has not been earned"*. The altimeter's version of
  that rule is the one followed — it **does** project an ETA, and withholds below three
  weeks of history and a measured pace. Two things keep this inside it. It projects a
  *prescription*, never an outcome: what the weeks should weigh, and nothing about whether
  the trip will go well. And it withholds entirely without a baseline, using the identical
  gate the ratio itself applies — three weeks of calendar and six days carrying load inside
  the window, because three weeks with two sessions in it produces arithmetic, not a
  baseline.
  **The finding.** A taper reads as *detraining* to the same bands that judge a training
  week: it lands at about 0.62, and 0.8 is the floor of the sweet spot. The app already
  half-knew this — `deriveLoad` calls a low ratio during a *planned* deload 'optimal'
  rather than 'detraining' — and the projection needed the same treatment. The chart marks
  every easy week with a hollow ring and the table names it, so a dip that was the entire
  point does not read as the plan falling apart at the end.
  **The ramp is slower than the model would allow, on purpose.** A sustained ramp of `r`
  settles at `4 / (1 + 1/r + 1/r² + 1/r³)`, which reaches 1.3 at about 1.22 a week — so the
  famous ten-percent rule is *conservative* against the app's own maths, and the app keeps
  it anyway. A plan that runs along the edge of the band has nowhere to put a week that
  went harder than intended. There is a **total** cap as well as a rate cap, at 1.5× the
  starting baseline: the ratio limits the rate and says nothing about the total, and eight
  weeks compounding at ten percent is more than double, which is not a number any app
  should hand anybody.
  **It respects the program's deloads instead of laying its own on top** — and inserts its
  own only where there is no program to defer to, because twelve weeks without one was
  producing seven identical weeks at the ceiling, which is not a plan, it is a wall. Never
  in the week before the taper: two easy weeks back to back is the taper starting early by
  accident. Past twelve weeks it refuses outright and hands over to the finder, which
  already asks how many weeks you have (M57) — that far out is a training block, not a peak.
  **Two mutation survivors deleted code rather than gaining a test.** A `Math.min(ceiling,
  …)` on the build step that `weekKind` had already made unreachable — it calls a week a
  hold precisely when the next step would clear the ceiling — and a `Math.max` in the chart
  taking the plan's ratios into the y scale, which can never beat `trendCeiling`'s own
  floor of the danger band plus headroom. A third survivor found a **weak test**: the
  program-deload check passed with the program ignored, because the fallback deload lands
  in the same window. Rewritten against Peak Performance, whose deloads on weeks 5 and 9
  are not multiples of the fallback interval, so a deload on that week can only have come
  from the program.
  Twenty mutations, twenty killed. Verified in a browser at phone width against twelve
  weeks of logged sessions and a trip six weeks out: build 110, 121, 133, deload 93, build
  146, taper 81 percent of the usual week, the plan drawn dashed on the far side of a
  divider with hollow rings on both easy weeks, and both refusals — the twelve-week ceiling
  with its link to the finder, and the missing baseline — rendering instead of the card.
  *What it does not do:* the plan is not written into the log. A taper week the climber
  actually trains carries `deload: true` only if a *program* put it there, so after the
  fact the history chart will call that week detraining — the same contradiction, arriving
  from the other side. And nothing tells you the trip is coming; you have to open the
  objective.

- **M74 — Gym mode.** *Done, with the headline feature struck out because it already
  existed.* The proposal asked for "one-tap grade tally, attempt and send". **That is M21**,
  which replaced three native selects with chip rows and measured it: twenty interactions
  down to fifteen on a typical bouldering session, with the real win in the *kind* of
  interaction rather than the count. Building it again would have been building it again.
  What is actually wrong mid-session is everything around it. The logger renders ten cards —
  check-in, climbs, session questions, project burns, prescription, drill, warmup, effort,
  notes, templates — and the climb entry is one of them, a scroll or two down. Between burns
  the cost is not taps: it is finding the control, hitting a 36px chip with a chalky hand,
  and the screen having gone dark. So gym mode is the same session with everything else
  taken away, and the tally row's plus is **56px** rather than 36.
  **There is no buffer**, which is the second correction. "Folds into a real session
  afterwards" implies one; `engine/live.ts` already refused exactly that idea for exactly
  this reason — *"a session record is written the moment you start it and re-written on
  every change, so the buffer already exists"*. Nothing folds in because nothing ever left:
  a tap on the tally is a write to the session the logger reads.
  **A route, not an overlay.** The app's other immersive screens are dialogs, and a dialog
  does not survive the tab being reclaimed — which is the normal fate of a phone face-down
  on a mat for two hours. `#/gym` does. The live bar stands down there, under its own
  existing rule that two clocks on one screen is one too many.
  **The list is deliberately not sorted.** Hardest-first reads better on a page you are
  looking at, and is the wrong rule for a control you tap without looking: inserting a
  harder grade shifts every row under your thumb. Insertion order never moves an existing
  row and a new one appears at the bottom, which is where you were.
  **The rest timer is not the protocol timer.** That one is work/rest/reps/sets attached to
  a prescribed exercise, and "give me three minutes" is none of those. It stores an *end
  time* rather than a countdown, the same choice `live.ts` made about `startedAt` and for
  the same reason — a phone that sleeps stops running timers, and the rest interval does
  not stop because the page did. Verified: reloading mid-rest picks the clock up where the
  wall clock is, not where it was.
  **Two contrast bugs, one of them eighteen milestones old.** The gym plus was written as
  `className="bg-accent text-accent-ink"` and rendered in `ink-soft` at **1.12:1** against
  the accent — effectively invisible — because two utilities setting `color` are resolved by
  the order Tailwind *generated* them in, not the order they appear in the attribute. That
  is the M30 bug, walked into three paragraphs after writing a comment warning about it;
  the fix is an `onAccent` tone inside `IconButton`, so the pairing belongs to the
  primitive. Looking for other instances found the worse one: **`ClimbEntry` has said
  `text-on-accent` since M21, and there is no such token** — the class generated nothing at
  all, so the selected grade in the logger's own picker inherited `ink` and sat at
  **2.96:1** on the accent, below AA, on the control M21 was written to celebrate. Both are
  5.47:1 now, and `ui.test.ts` has a new rule: a colour class naming a token `index.css`
  never declared fails the suite. A class that does not exist breaks nothing loudly, which
  is why nothing caught it for eighteen milestones.
  Seventeen mutations, seventeen killed. Verified in a browser at phone width: a V5 tallied
  to four and a V7 tried, written straight to the session record, a 56×56 target, the rest
  clock surviving a reload, and the live bar absent.
  *What it does not do:* finishing still means going to the logger, because effort and
  duration are what the load maths needs and neither belongs on a screen you are using
  between burns. And there is no way in from Home — only from a session that is already
  running.

- **M75 — ~~Remind me it is a training day~~ → Put it in your calendar.** *Done, as the
  other thing.* The proposal flagged itself as the riskiest of the fifteen and it was
  right, but for a stronger reason than "unreliable": **nothing in a PWA can be running at
  the moment a reminder is due.** Notification Triggers — the one web API that ever took a
  future timestamp — never shipped past an origin trial. Web Push works and needs a push
  server, which is the single thing this rebuild exists to not have. A service worker is
  spun up for an event and killed, so a `setTimeout` for tomorrow evening dies in seconds.
  And the TWA does not rescue it: a Trusted Web Activity is a browser tab in a native
  shell, not a process with an alarm clock. What is left is "fire it next time the app
  opens", which reminds you about training at the moment you opened the training app.
  So the reminding is handed to the thing that is already good at it. **`lib/ics.ts` writes
  the plan as an iCalendar file and the climber's own phone does the rest** — no server, no
  permission that can be revoked, identical on iOS and Android, and it keeps working with
  the app closed for a month. Written by hand like `lib/zip.ts`, for the same reason: the
  format is small, a dependency is not, and the parts that actually break are the parts a
  library would hide.
  **The three that actually break.** Lines fold at 75 **octets**, not characters — a grade
  is one character and the ✋ on a session type is three, so a character count writes an
  illegal file while looking comfortably short; and the fold walks code points, because
  splitting a surrogate pair leaves half a character either side of a CRLF that nothing can
  rejoin. CRLF everywhere including the last line, which is the commonest reason a
  hand-written `.ics` is refused without explanation. And TEXT escaping for `\`, `;`, `,`
  and newline — **but not the colon**, which is only special in a parameter and would put a
  backslash in front of every "Week 5: Hangboard" a climber reads.
  **Times are floating**, with no `Z` and no `TZID`. RFC 5545 calls this form 1 and it means
  "whatever the local time is wherever this is read", which is exactly right for a training
  reminder: UTC would move the session by an hour every time the clocks changed, and a
  `TZID` needs a VTIMEZONE block carrying the climber's transition rules for the life of the
  program. The end of an event is computed in minutes and days rather than by adding to a
  `Date`, because adding ninety minutes across a daylight-saving boundary moves the end
  relative to the start.
  **The hour is earned, not guessed.** The app has never been told when anybody trains, and
  a calendar full of events at the wrong time is worse than no calendar — so the start and
  the length are the **median** of what has actually been logged (a start time only exists
  on a session that was started live), rounded to the quarter hour because 18:07 is false
  precision, and refusing a length `live.ts` would not record either. Below three readings
  the card says it is guessing rather than quietly using 6pm.
  **Exporting twice does not leave two of everything.** The UID is the date plus the
  program, so the same day is the same event however the plan has changed — re-exporting
  rewrites it in place. *That is a property of the file; whether a given client honours it
  is the client's decision, and Apple Calendar asks where Google updates.*
  Twenty-five mutations, twenty-five killed — including one that survived twice before the
  test was fixed: the surrogate-pair check was asserting a round trip through `TextEncoder`,
  which quietly replaces a lone surrogate with U+FFFD and therefore agrees with anything.
  It checks the string for unpaired surrogates now. `escapeText` also shipped with the exact
  bug its own test then repeated — `'\;'` in JavaScript is just `';'` — so the expectations
  are `String.raw` throughout.
  Verified twice over. In a browser at phone width: a twelve-week Iron Grip block with four
  training days a week, six sessions logged live at 19:00, exported as
  `project-ascent-iron-grip.ics` — 18 events, timed at 19:00 for 75 minutes, read off the
  log rather than defaulted. And the downloaded bytes were then checked against the spec by
  hand (307 CRLF lines, zero bare newlines, no line over 75 octets, balanced blocks, 18
  unique UIDs, nothing dated before today) **and parsed by a real iCalendar library**, which
  reported floating datetimes, a `-PT2H` display alarm on every event, and 75-minute
  durations throughout.
  *What it does not do:* removing an event. A day that stops being a training day is simply
  absent from the next export, and the stale event stays in the calendar — cancelling it
  properly needs a `STATUS:CANCELLED` VEVENT and a `METHOD:CANCEL` file, which is a second
  export with different semantics. And the file is a snapshot, not a subscription: there is
  no URL for a calendar to poll, because there is no server to poll it.

- **M76 — Injuries live with the climber.** *Done.* The injuries card sat in Settings between
  the equipment list and the backup export — the page you go to for changing the app, not
  for saying something about yourself. An injury is a fact about the climber: it drains
  vitality on the climber page two cards up, it filters warmups and the finder, it flags
  lines in the logger. So the card moved under Vitality, next to the cost it causes. The
  record, the store and the detail page are unchanged; only the doorway moved, and every
  way back with it — the detail page's parent, its not-found link, and where "Mark healed"
  lands. Search finds it under the climber now, the app guide says so, and the injury
  guide's "mark it under Settings" was corrected. Verified in a browser: add Fingers from
  the climber page, open it, mark it healed, land back on the climber; Settings mentions
  nothing.

**Ten more, from a second audit (M77–M86).** Brief: one that is large and has several
steps; three about the app itself; one about The Ascent; three about progress tracking;
two about programs. Every one below was checked against the code before it was written
down — the last audit produced four proposals that were wrong because they listed
directories instead of reading files, and each of those had to be withdrawn in its own
commit.

**The large one.**

- **M77 — The guides and the programs agree.** *Done — and two of its four steps were
  already done before it started.* The proposal quoted the guide-verification paragraph
  above: eight guides disagreeing with their program about deloads, six printing entry
  tables the app could not read. **Both had been fixed by M34 and M35** — the deload mark is
  derived from `deloadWeeks` now and a guide cannot state one, and every entry table is
  `prerequisites` the finder reads. `accuracy.test.ts` said so in its own comments; the
  proposal was written from the audit's prose without checking whether later milestones
  had answered it, which is the exact mistake the audit's preamble warned about. That also
  withdraws **M86** as written: the standards it proposed making checkable already are.
  What remained was the test's two allow-lists, and one of them was not content debt at
  all. **`EXERCISE_GAPS` — "seven exercises three guides prescribe that their programs
  never schedule" — was seven spellings.** Every one was in its program under another
  name: the guide's "Band Face Pulls" was Ground Zero's `Face Pulls (Band)` and Lockdown's
  `Face Pulls`; "Wide-Grip Pull-Ups" was `Wide Pull-Ups`; "Hanging Windshield Wipers" was
  `Wipers (bent-knee)`; the guide's two delt-raise lines were the program's one
  `Side/Front Delt Raises`. Across the catalogue one movement had three names — "Face Pulls"
  in four programs, "Band Face Pulls" in four, "Face Pulls (Band)" in one — and the check
  only saw the guide-versus-program half of it. So: **one name per movement, everywhere.**
  The glossary broke every tie it had an entry for (`Wide-Grip Pull-Ups`, `Hanging
  Windshield Wipers`, `Side/Front Delt Raises`), the guides' unanimous `Band Face Pulls`
  broke the other. Fourteen program entries across five programs renamed; two guide lines
  changed — the delt pair merged to the glossary's single movement, and Lockdown's wipers
  dose corrected from "3×10 total" to the program's "3×8 per side", which the dose audit
  could not have caught until the name resolved. A `RETIRED_NAMES` test now scans every
  program and every guide for the old spellings, and says why a general rule cannot be
  written for this.
  **`NO_ROW_TO_MARK` — seven deload weeks with no guide row — was real, and was authoring.**
  Lockdown and Iron Grip had no week table at all; The Long Game's Phase 2 laid its weeks
  out as columns; The Cruiser's block cycle stopped at week 4 of a repeating twelve. Each
  has a row for every week the program runs now, with cells taken from the program's own
  phase descriptions rather than written fresh — and the deload rows say what the
  programs do not: *cut the sets by a third to a half, keep the load.* That is a coaching
  call and the one thing here the author should read; the programs schedule the week and
  prescribe no dose for it.
  Both allow-lists are empty and the comments say they stay so, which is the fourth step:
  the test no longer reports the debt, it fails on it. Eight mutations, eight killed — a
  retired spelling returning to a program or a guide, a qualifier hiding one, a deload row
  removed, the cruiser table stopping at week 4, a week table's header no longer saying
  "Week", the wipers dose drifting back, and a program dropping a starred exercise.
  The units test caught a slip on the way: the first draft of Iron Grip's table wrote
  "+2.5 lbs" into prose, which is the imperial-in-prose count that test pins. Verified in a
  browser with each section opened: Iron Grip and Lockdown twelve rows with 4 and 8
  marked, The Long Game's new Phase 2 table with 8, The Cruiser's twelve with 8 and 12.
  *What it does not settle:* whether "a third to a half" is the deload the coach wants,
  and the seven other `Face Pulls`-style near-duplicates that may exist for movements no
  guide happens to name — the retired list only knows the ones this found.

**The app itself.**

- **M78 — Programs stop shipping eagerly.** *Done, and measured before it was promised.*
  The proposal's own caveat was to count the synchronous `getProgram` call sites and
  measure what the bodies cost first. Counted: twenty-one importers, twenty-two sync calls
  at render, and **eight pages that read the catalogue with no hydration gate at all**
  (Train, the builder list, Search, the guide, the program page, the start page, the
  achievements card, the coach). Measured, by building with the eleven bodies stubbed out:
  the entry chunk went **239.5 → 202.3 KB gzipped, 756 → 627 KB raw** — the programs were
  a sixth of first paint, not the bulk. Real, and modest, and the milestone says which.
  **The registry changed, not the callers.** `content/programs/catalogue.ts` now holds the
  eleven static imports and nothing in `src/` reaches it except one `import()` in
  `loadPrograms()`; `PROGRAMS` starts empty and is filled *in place*, so every reference
  the twenty-two callers already hold sees the bodies the moment they land. The named
  bodies moved with it — five test files and the finder imported `GENERAL_TRAINING`
  directly, and the finder now looks its fallback up at call time.
  **The router waits for the catalogue; the shell does not.** Gating eight ungated pages
  one by one is eight chances to miss one, and a cold load of `#/train` with the bodies
  still in flight would have drawn an empty catalogue that never re-rendered. One gate in
  `App.tsx` under the `Suspense` boundary does it: the nav paints, routes wait, and every
  page keeps its synchronous read. Tests keep theirs too — `src/test/setup.ts` awaits
  `loadPrograms()` at the top level, which runs before any test module is evaluated, so
  the dozens of files calling `getProgram` at module scope needed no change.
  **The guard was wrong the first time, and a mutation said so.** The first assertion
  checked the entry chunk for one exercise name. A static import of the catalogue, added
  as a mutation, *passed* it: Rollup did not inline the bodies, it **split them across both
  chunks — 57 KB into the entry** — and the one name stayed behind. The 230 KB budget
  passed too, at 219. Headroom a regression can hide in is not headroom. The guard is now
  one marker per program — each subtitle, checked absent from the entry and present in the
  `catalogue-` chunk — and the budget is 215, eight percent above the measured 202. Under
  the same mutation both now fail, naming Gravity Defied as the body that leaked.
  Verified in a browser on a cold start straight onto `#/train`: the entry, then the
  `catalogue-` chunk, then eleven program cards. 2,223 tests pass. *Left as found:* the
  glossary is eager too, through `ui/Term.tsx`, and warmups, drills and metrics ride in the
  entry through the engines; each is a fraction of what the programs were, and none was
  measured here.

- **M79 — Undo wherever it destroys.** *Done, from an inventory rather than from memory.*
  The proposal named four undo-less deletes. One was wrong — the builder's Danger zone has
  offered undo since M49 — and a grep of every destructive call in the features layer found
  **three real losses the proposal missed**, each bigger than any it named: deleting a
  photo (with its beta drawn on it, since M71), deleting an assessment result, and deleting
  a session template. None had a way back.
  Nine sites now offer one: mark an injury healed; delete a photo; clear a photo's beta;
  delete a result; delete a template; remove an objective requirement; take a tally row to
  zero in gym mode and in the logger; take a project burn to zero. **Every restore puts the
  whole record back**, which needed two store additions — `restoreInjury` and the
  templates' `restore` — because the existing `addInjury` and `save` mint fresh records and
  would have lost the injury's notes and return-to-climbing ticks, and the template's id
  and use count. A mutation that swapped the whole-record restore for the fresh one was
  killed by the note going missing.
  **Not every minus is a loss.** A count going 4→3 offers nothing; only a row that *went*
  does, because the bar replaces itself and an offer for every tap would bury the one that
  matters. Three destructive calls are allowed to stay undo-less, with the reason written
  beside each: the finder's and the welcome screen's injury chips are toggles, so tapping
  again *is* the undo; and clearing the import restore point is the climber saying they
  are done with undo.
  **The guard is a scan, not a list.** `safety.test.ts` used to check three files for the
  word `offerUndo`. It now walks every feature component for a destructive call — a store
  remove, a media delete, a field wiped — and requires the offer within a dozen lines, or
  inside the local function the button calls (the photo delete's shape), or a written
  allowance. It found its own false positive on the first run and was taught the third
  case rather than exempting the file, which would also have exempted Clear-beta.
  One real bug on the way: the objective page's `edit` returned `void` from an async save,
  so its undo resolved — and the bar would have announced "restored" — before the store
  had changed. It returns the write now. Fourteen mutations, fourteen killed, including
  both ways of blinding the guard. 2,235 tests pass. Verified in a browser: a deleted
  photo comes back with its beta; a healed injury comes back with its note, on the climber
  page it was healed from.

- **M80 — Data health, on one page.** *Done, with the premise corrected.* The proposal said
  the app "knows a lot about its own state and says it in five places or nowhere". Checked,
  and that is wrong on four counts: `readingProblems()` prints in Settings, `staleSessions()`
  drives the live bar, `storagePressure()` drives both a shell banner and a Settings card,
  and the import snapshot has restore and clear buttons. `sweepOrphanMedia()` is not
  uninvoked either — `App.tsx` runs it at boot.
  **The real gap is that every one of those is a *warning*.** They appear when something is
  wrong, which means the only way to learn that nothing is wrong is to notice that nothing
  appeared — and that is no use at the moment a climber actually wants to know, which is
  before taking a backup or after importing one. So `/data` gathers the same knowledge and
  states it either way; when there is nothing to say it says *"Every record is readable, no
  photos are orphaned, no session is left open, and the browser has room"*, and then admits
  what it cannot check: whether what you logged was true.
  Three things in it are genuinely new. **Nothing counted the records** — a per-store count
  existed only inside an import preview, so the app could not tell you how many sessions it
  was holding. **The sweep's return value was discarded** by its only caller, so a climber
  was never told anything had been collected; `findOrphanMedia` is now split out of
  `sweepOrphanMedia`, reports without deleting, and the tidy-up says what it did. And **the
  live bar shows stale sessions one at a time** — `staleSessions(...)[0]` — so a climber
  with three of them fixes one and meets the next; the page lists all of them, each linked
  to its own log. Verified in a browser with the bar and the card on screen together: the
  bar says "Saturday's session is still open", the card says Saturday *and* Monday.
  **A real bug the page surfaced, in code it did not touch.** `mediaBytes()` summed
  `blob.size` over every photo, and one record whose blob has no readable size turned the
  whole total into `NaN` — which Settings had been printing as "NaN KB". Both readers guard
  it now and `formatBytes` refuses a non-finite number, which is the same answer it already
  gave for "the browser would not say".
  **And a grammar bug the browser caught**, the same fault as M70's "Day of the trip (of the
  trip)": *"1 photo belong to something that is gone"*. The count and its verb were written
  into one template with nothing making them agree. The blunt test written for it —
  every headline, at one and at two — then found two more of the same in headlines nobody
  had looked at: "1 records could not be read" and "1 records were read without part of
  their contents". One `records(n)` helper now owns the count, the verb and the possessive.
  Twenty mutations, twenty killed, after two survivors were fixed rather than argued with:
  one exposed that the snapshot exclusion had no test, the other that nothing held
  `findOrphanMedia` to *not* deleting. 2,281 tests pass.
  *Worth knowing:* the boot sweep means orphaned photos are mostly a mid-session
  phenomenon — delete a project and its photos are orphaned until the next launch, which is
  the window the tidy-up button exists for. *Left alone:* backup age. The coach already owns
  that rule at thirty days, and the line against saying one thing in two voices is older
  than this page.

**The Ascent.**

- **M81 — Replay, which the engine was built for and nothing uses.** *Done, with two of the
  proposal's claims withdrawn and the feature's own design corrected in a browser.*
  **The determinism property was already tested.** `game.test.ts:63` — "replays the same run
  from the same seed and inputs" — has held it since it was written, so "the determinism
  claim finally held to something" was wrong. The real gap is narrower and still worth
  closing: the property was proven and **nothing a climber could see used it**.
  **"Keep it beside the record" was also wrong.** The all-time best was climbed on some
  other day's wall — `dailySeed(dateKey)` — so its tape replays a pattern that is not there
  today. Only the `daily` record shares a seed with the run you are about to play, and that
  is where the tape goes.
  So: `Recorder` writes `[tick, input, …]` pairs off the live frame loop, `replayRun` drives
  them back through `step(state, TICK_MS)` one tick at a time, and `advanceGhost` walks a
  second run beside the first. `RunState` gained a counted `ticks` field rather than deriving
  one from `timeMs / TICK_MS`: `timeMs` accumulates a non-terminating float and a tape that
  drifts by a tick after twenty minutes replays a different run.
  **The tape carries its own modifiers.** An afternoon session moves END, END trims the speed
  ramp; a morning run replayed tonight against tonight's stats would drift off the height it
  is meant to be showing.
  **A frame-rate claim I wrote down and then disproved.** The first test asserted a 30 Hz
  phone and a 144 Hz one record the *same tape*. They do not and cannot: at 33 ms a frame
  simulates four ticks and never observes the three between, so it cannot put an input on
  one. What does hold at every frame rate is the part the feature needs — the tape replays
  the run it recorded, to the metre — and that is what the test says now. The recorder does
  fold repeated inputs at one tick, which is what the engine already does (`step` overwrites
  `pendingInput` before any tick consumes it) and stops a 144 Hz player storing twice the
  tape a 60 Hz one does for the same run.
  **The browser found the design flaw, not a rendering bug.** The HUD showed a live metre gap
  against the ghost. It reads **+0 m for the whole race**, because height in this game *is*
  time — the ramp is driven by `timeMs` and a lane change costs nothing — so two runs on one
  wall sit exactly level however well either is being played. The gap only opens when one of
  them stops. So the crashed ghost is no longer hidden: it freezes at the height its run
  ended and the wall carries it down past you, and the number appears at the moment it starts
  to mean something. That picture — your best pinned under the boulder that got it, scrolling
  away below you — is the feature; the number is the caption.
  Thirty-eight mutations, thirty-three killed on the first pass. All five survivors were
  addressed rather than argued with: two were guards against a tape that disagrees with its
  own run (a restored backup can hold one) and now have the tests that hold them — one of
  them kills by *hanging*, since `step` on a finished run simulates nothing and the tick count
  never reaches its bound; one was a `daily.mode` check strictly redundant with the tape's own
  and was deleted; one showed the render test never checked *where* the ghost was drawn; one
  showed a defensive spread with no observable effect. `isTape` also gained a `MAX_TICKS`
  bound, because `replayRun` walks one tick at a time and a backup claiming two billion of
  them would lock the tab.
  **One pre-existing bug the browser caught**, the M80 family again: the payout card printed
  *"1 coins"*. 2,328 tests pass.
  *Worth knowing:* there is one `daily` record, not one per mode, and it is the day's best
  run overall — so a Free Solo ghost only exists on the rare day a Free Solo run is the best
  one. Splitting it per mode would change what the day's payout is priced on, which is the
  economy, not this milestone.

- **M97 — The achievements get a page, and eleven more of them.** *Done, at the coach's
  request.* Fourteen was a card on the climber page; twenty-five is a page you scroll past,
  so the climber keeps the count and the newest one and the list moved to `/achievements`,
  one tap away with the skill trees.
  **The eleven were held to the module's own rule** — *"a shape in the log, never a running
  total"* — and the guard that enforces it caught two of them. "Trained on all seven
  weekdays" and "eight consecutive weeks with a session" were both earned by the test's
  three-hundred-identical-sessions fixture, because neither asks anything of a session but
  that it happened. They were replaced with **Both Ends** (a week holding a session at RPE 3
  or less and one at 9 or more) and **Redemption** (a grade you had only failed on, sent in
  a *later* session — the same session is ordinary working). The other nine: Twice in a Day,
  The Long Haul, Clean Sheet, The Double, Both in a Day, Deload Honoured, The Comeback,
  Three Months Outside, Rested and Ready.
  **One was considered and rejected**, recorded in the module so it is not proposed again: a
  dawn-patrol achievement reads an hour out of `startedAt`, which is an instant in UTC, so
  the same log would earn it at home and not in Spain. A fact that moves with the reader is
  not a fact about the log.
  Twenty-four mutations. Twenty-three killed by tests; the twenty-fourth — dropping the
  unsent-project guard — is killed by `tsc` rather than vitest, which is worth knowing about
  a battery that only runs the suite. One survivor was **dead code of mine**, an early
  return whose absence `firstAtLimit` already handled, now deleted. One was a real gap: the
  page's loading guard was untested because every test hydrated first.
  **Two duplications the browser found**, both mine: the page header and the card inside it
  each said "Achievements" and "7 of 25".
  Verified in both themes. 2,951 tests pass.

**Progress tracking.**

- **M82 — The check-in as a series.** *Done, on a different chart from the one proposed.*
  The premise held: `checkIn` is written by the log page and read back by the same day's log
  page and nowhere else. You could tell the app your fingers were sore forty times and it
  would never once mention it.
  **The proposed shape did not.** "Marks along the training-load line" was measured rather
  than argued about: `LoadTrendLine` gives 288 units to 90 days — 3.2 a day, from its own
  constants — and the proposal wants two categorical dimensions on that axis. The consistency
  grid is tighter still at 4.5px cells, and its doc comment already explains that it is a
  picture rather than a control because targets that size fail WCAG 2.5.8. So the strip is its
  own, over the same window, and carries a mark only for a day that was **answered** — a dozen
  marks rather than ninety slots, which is a density that reads. Positioned by date and not by
  index, because three answers in one week and three across three months are the one thing the
  picture exists to tell apart.
  **Coverage is stated before anything else.** "You stayed under the ceiling every time" over
  three sessions is a sentence that means nothing, so every figure is reported against how
  many sessions it could have come from: *"Answered on 12 of 40 sessions in the last three
  months."* The denominator excludes rest days, which are shown a recovery checklist and never
  asked, and drafts, which were never finished being asked.
  **The ceiling is reconstructed, not stored, and that is exact.** `readinessFor(checkIn).cap`
  depends on the two answers alone — `context` moves the advice and the test deferral, never
  the ceiling — so the number read back is the one the climber was shown. The sessions that
  went past it are listed by date and linked to their log, which is also where the strip's
  promise to be a picture gets paid: a mark can sit a pixel from its neighbour, so the day is
  reachable at full size underneath.
  **The effort comparison is gated and says so.** Mean RPE on the flagged days against the
  clear ones — RPE because `readiness.ts` nominates perceived effort as the instrument, "the
  same hang that was a 6 last week is an 8 today" — but nothing is printed until there are four
  on each side, and the sentence that does print ends "which is few enough that one hard
  session moves it".
  **What the card admits it cannot know**, in its own fine print: nothing records whether the
  check-in was answered before the session or after it, so a check-in filled in at the end
  will read as though it had been followed.
  Twenty-six mutations, twenty-five killed. The survivor was a weak test of mine, not weak
  code: the opacity check took a minimum across both rows, so raising only the *fingers* tone
  left the sleep row quiet enough to pass. Rewritten per row, and three further mutations on
  the other tones confirmed it. Two browser findings, both mine: the strip shipped with three
  colours and nothing naming them, and the "Sleep" row caption sat close enough to the date
  beneath it to scan as one phrase. Verified in both themes. 2,367 tests pass, and the new
  derivation is in the perf budget.
- **M83 — Conversion, over time.** *Done, refusing the shape the proposal asked for.*
  The premise held, with one correction: `conversion` is read in *two* places, not one — the
  pyramid card and the plateau verdict's evidence ("3 sent from 18 tries") — and both are
  all-time snapshots. The gap is real: nothing had a time dimension, so the number that moves
  *before* the max grade does was invisible.
  **The proposed home for it was wrong, on three counts.** "The four-weeks-against-four
  comparison gaining a line" would put it in `changesBetween`, which builds a uniform `Change`
  over `keyof Totals`: flat counts with `percent` as the delta. Conversion is *per grade*, so
  it is many rows and not one. It is a *ratio*, so `percent` would report a percent change of
  a percentage — 17% to 50% is "+194%", the most misleading number this codebase could print.
  And over four weeks the denominators are tiny: the proposal's own example sentence, *"one in
  six to one in two"*, is a two-try sample being reported as a doubling.
  **So it is a series with a gate, and the gate is the feature.** Six twenty-eight-day blocks,
  and a block with fewer than six tries at a grade is drawn as a gap — the rule `loadTrend`
  already sets, for the same reason: zero is a real reading (eight tries, nothing sent) and
  must not look like a month you did not touch that grade. Every figure in the prose is
  printed as the count it came from — *"14 from 28 then, 0 from 42 now"* — never as a bare
  rate, because one in two from two tries and one in two from twenty are different claims.
  `projectHistory`'s `ENOUGH` set this pattern; the threshold here is on *tries* rather than
  sends because a single logged row carries a count.
  **A fall is reported as readily as a rise**, and the copy says why: conversion dropping at a
  grade is what stepping up to a new limit project looks like, and a module that only reported
  improvements would call that silence.
  Twenty-six mutations, twenty-two killed on the first pass. All four survivors were weak
  tests of mine, not weak code, and each exposed something worth knowing: the ladder lookup
  masks the scale check unless a record disagrees with itself (`{scale: 'YDS', grade: 'V5'}`,
  which a restored backup can hold); "the grade that moved furthest" also happened to be first
  in sort order, so taking the first passed; and two page tests used only default settings, so
  a grid that ignored the scale chip and one that ignored the Font/French setting were both
  invisible. All four now have tests that separate the two things.
  **Two browser findings, both mine.** A grade tried but never six times in one block drew a
  row of six empty cells, which is not a finding — those grades are left out of the grid and
  named in the sentence instead, with their try count, which is the same fact as a finding.
  And the first wording of that sentence ran the name into the number: *"V7 5 tries in six
  months"*. Verified in both themes. 2,416 tests pass, and the new derivation is in the perf
  budget.
- **M84 — The block's numbers, on one chart.** *Done, with "one axis" qualified.*
  The premise held, and reading the code sharpened it: `changeOf` compares **the last two
  entries**, so every existing reading of an assessment answers "did it move since last time"
  and none of them answers "did this block move it". The two questions have different answers
  the moment a climber tests three times.
  **"Normalised so a hang in seconds and a pull-up count share one axis" is right, and not
  universal.** Percent change is honest for ratio-scale quantities, and seconds and reps are
  both. The catalogue's batteries are not all like that, and I checked rather than assumed:
  across the eleven programs there are 24 `number` metrics, **nine `grade`**, **three
  `passfail`** and **one `text`** (Iron Grip assesses `core_lever`, which `isChartable`
  already refuses). A grade is ordinal — V4 to V5 is a step on a ladder, not "+25%" — and a
  pass is not a quantity. So the chart carries percent change and nothing else, and everything
  it cannot honestly carry is listed beneath it in its own units rather than dropped, because
  a grade that went up two steps is the most interesting line in most batteries.
  **Two of the assessed metrics are `higherIsBetter: false`** — `toe_touch` and `min_edge` —
  so every sign is flipped through that flag in the engine and a bar to the right always means
  the block worked, on both kinds of scale.
  **A baseline of zero has no percent**, and neither does a negative one taken at face value:
  `weighted_pullup_3rm` is measured in BW+lbs, so a climber on band assistance logs −20, and
  going to −5 is fifteen pounds of progress that dividing by the raw baseline would report as
  a 75% *decline* — while `moved` correctly said "better" and the chart drew them against each
  other. `Math.abs` on the denominator, and a test that would have caught it.
  Thirty-four mutations, thirty-two killed. Both survivors were weak tests: the fixture start
  date was itself a Sunday, so `startOfWeek` was invisible (it matters — `programWeek` snaps
  to the week too, and a Wednesday start would otherwise put the report three days out of step
  with the week numbers it reports on), and the negative-baseline case above had no test at
  all.
  **One grammar bug I wrote and the tests caught**: "one of the 2 retested **number** improved"
  — the noun was agreeing with how many *rose* rather than how many were *retested*.
  **Two browser findings.** A five-name list came out as *"Max Hang, Repeater Weight and
  Lock-Off and 2 more"*, the Oxford-less join and the truncation each adding their own "and";
  that is now `engine/phrase.ts`, shared with M83's thin-grade sentence, which was silently
  dropping anything past the third. And SVG text does not clip, it overflows: "Weighted
  Pull-Ups 3RM" rendered as "/eighted Pull-Ups 3RM" off the edge of the viewBox, so labels are
  fitted to the gutter with the full name kept in the row's title.
  Verified in both themes against Iron Grip, the widest battery in the catalogue. 2,476 tests
  pass, and the new derivation is in the perf budget.
  *Left alone:* the three plain list joins already in `plateau.ts`, `bodyLoad.ts` and
  `review.ts`. None truncates, so none has the bug, and sweeping them up in a milestone about
  assessments is how unrelated regressions get in.

**Programs.**

- **M85 — When the block ends.** *Done, and the premise was understated in one place and
  wrong in another.*
  **Understated: the app did not merely lack a block-end screen, it asserted something false
  every day.** `programWeek` **clamps**, so `plannedDay` on any date past the last week
  returned the last week — measured, not inferred: Iron Grip started 2026-01-04 reports
  *"week 12, phase The Spark, test = final"* on 2026-06-01 and on 2027-01-01 alike. Six
  screens read a planned day, and every one of them was handing a climber who finished nine
  months ago week twelve's sessions under a banner reading *"Final week — the after, to put
  beside the before."* The whole suite passed while that was true, which is why the tests came
  first.
  **Wrong: `Program.graduation` is not "read by nothing".** It is read — on the catalogue
  detail page, `ProgramDetailPage.tsx:378`, immediately above `nextPrograms`. The conclusion
  survives the correction: both sit behind a page you visit to *choose* a program, not one you
  are on when a program runs out.
  **The fix is a week-level fact, like `isDeload` and `test` before it.** `plan.ts` gained
  `blockWindow`, `blockStatus` and an `over` flag, and `plannedDay` now returns nothing past
  the end — so all six screens are corrected at once rather than each remembering to ask. The
  window arithmetic also had *three* copies by then (`calendar.lastDayOf`, M84's `blockReport`,
  and this); they are one now.
  **`/finish` carries what was already authored**: the M84 comparison, the graduation line, the
  retests owed — an assessment with a baseline this block and no second reading, which is
  exactly what the final test week existed for — and every `nextPrograms` entry with its
  written reason. **It does not congratulate.** A climber who trained every week and one who
  stopped in week six and let the calendar run out both arrive here and the app cannot tell
  them apart, so it says so: *"Whether you trained every week of it is between you and the
  log."*
  **"Pre-filled from the log rather than asked again" was half true already** — the finder has
  always seeded from the first-run baseline. The half that was missing is the half that
  matters: a climber who answered "V4" at onboarding and has since sent V6 was being
  recommended programs for a V4 climber. `gradesFromLog` takes the harder of the two, never
  the lower — a quiet month is not evidence you got worse — and it is applied to the auto-run
  as well as the form, or the recommendation disagrees with the fields beside it.
  Twenty-nine mutations, twenty-six killed. The three survivors: two were untested paths I
  then covered, and one was a redundant guard I deleted — `gradeOrdinal` returns −1 for
  anything it cannot place, including `''`, so a blank answer already loses the comparison
  without a special case for it.
  **Two browser findings.** Home said *"no program is running"* while one was, because an over
  day has no session; and then, once that was fixed, the button still offered *"Log rest day"*
  three weeks after the block ended, because `over` sets `isRest`. **And one false claim in my
  own copy**: the finder card said "your grades come from the log" before that was true, which
  is what prompted building it rather than softening the sentence.
  Verified in both themes. 2,517 tests pass.
- **M86 — ~~Entry standards the app can check~~.** *Withdrawn in M77.* Already done by M35:
  `accuracy.test.ts` asserts that every guide printing an entry table has `prerequisites`
  the finder reads, and it passes empty. Proposed from stale audit prose.

- **M12 — Ship.** *Parked.* TWA packaging + assetlinks, Play internal testing, store
  listing. Blocked on two facts only the author has — the app name and the package id —
  and set aside deliberately rather than waiting on them: everything above can be built
  without shipping, and shipping cannot start without them.

**Guide verification (the program guides, checked against the programs).** The app
guide was already asserted against the engines it quotes; the nine *program* guides —
2,800 lines telling a climber how a block runs — were not. `guides/accuracy.test.ts`
now checks them, and what it found is content debt that only the author can settle:

- **Eight of the nine disagree with their program about which weeks are deloads.**
  Two contradict it outright: Peak Performance's table calls week 5 "DELOAD 1" where
  the program schedules week 4, and The Siege's labels week 8 where the program
  schedules week 11. Ground Zero's guide describes "The Week 8 Deload" in detail and
  the program marks no deload at all; Iron Grip's guide never mentions a deload and
  the program schedules two. Only Base Camp agrees. This is not cosmetic: the flag is
  what makes the calendar mark the week and lets the training-state card say a dip in
  load was the plan rather than detraining.
- **Six programs print an entry-requirements table their program cannot check.**
  `Program.prerequisites` exists so a standard is "checkable against the user's own
  data instead of living in prose the app can't read" — and for Ground Zero, Base
  Camp, Gravity Defied, Iron Grip, The Long Game and The Cruiser it is exactly that
  prose. Iron Grip is the sharpest: "V5+, Dead Hang 60+ seconds, 15+ strict push-ups",
  of which `dead_hang` and `max_boulder_grade` are registered metrics the finder
  could read today.
- **Three guides prescribe exercises their program never schedules** — Band Face Pulls
  in Ground Zero, Lockdown and The Long Game, plus Wide-Grip Pull-Ups and Hanging
  Windshield Wipers in Lockdown, and Side/Front Delt Raises in Ground Zero. They are
  in starred, "non-negotiable" armour blocks, so the session screen never hands over
  work the guide calls mandatory.
- Week counts, and every week number referenced in prose, all agree.

Two holes in the checks themselves were found by mutating them. Every guide scan read
`section.content` and never `section.title`, so a section *titled* "The Armory" passed
the one test written to stop cut systems being documented; and the banned-system list
held 11 of the ~16 systems the app guide's own preamble names. Both fixed — with
`shop` and `skill points` deliberately left out, because a guide should be able to say
the app has neither. `Program.deloadWeeks`' own doc comment also claimed deload
sessions are excluded from training-load maths; `derive.ts` deliberately includes them
and says why, so the comment was corrected to the code.

**Known limitations carried forward:** program metadata grade ranges
(`gradeRange.label`, e.g. "V5-V8") are authored strings and do not follow the Font
/French display preference — converting them means re-authoring the content as
structured ranges, which belongs with M9.
- **Post-launch candidates:** Font/French scales (if not in M6), coach mode,
  media-on-projects, trivia toy, expedition-style long-arc sieges of famous climbs
  (the one cut system worth reconsidering — real sessions advancing a named objective
  was the old app's best long-arc hook).

---

**Ten more, from a third audit (M87–M96).** No brief this time, so the method was the
one that has paid best twice running: find what the app **stores and never reads**, and
what it **has written and cannot reach**. Every claim below was checked against the code
before it was written down, and two candidates were killed by that check — they are
recorded at the end rather than proposed, because a rejected finding is worth as much as
a kept one.

**The large one.**

- **M87 — The training history the app does not keep.** *Done, in the five steps proposed,
  with the loss sharpened into two different losses.*
  The premise held and reading the code split it. A **restart** overwrites `startDates`
  and destroys the earlier run outright. A **switch** does not: the old date survives in
  the record and becomes unreachable, because every screen that reads a block reads
  `activeProgramId`. Two failures, one shape.
  **`engine/blocks.ts` records a block when it opens and closes it when it stops being the
  one you are running.** Every transition that opens a block also ends one, so `openBlock`
  does both and leaving two rows open is not expressible. `name` and `weeks` are snapshots
  and deliberately break the derive-don't-store rule: M56's length adaptation is a single
  current value per program, so a block run over eight weeks would silently become twelve
  the day the same program was set back to full length. What a block *was* is not
  derivable from the present.
  **`endedAt` is not the end of the window, and that is the point.** The window has always
  been derivable; whether the climber stayed is not. A block abandoned in week six and one
  run to its last day have identical windows.
  **The migration keeps what the old shape knows and refuses to invent the rest.** Rows are
  rebuilt from `startDates`, each closed where the *next* block began — the one thing the
  old shape genuinely tells you — and every one is marked `reconstructed`, so `outcomeOf`
  returns `unknown` rather than reporting a block as finished or abandoned. An empty stored
  history is treated as unknown rather than as none, because a profile saved from default
  state before its first hydrate writes one.
  **`/finish` now reads any block**, `/finish/:id`, with a list of every block run beneath
  it. A url naming a block the history does not have is answered as a missing record — the
  `notFound` guard caught a first draft that quietly fell back to the newest instead, and
  the guard was right: showing a different block than the one asked for is the worse
  failure. **The year review gained its line**: *"2 blocks started: Iron Grip and Peak
  Performance. 1 run to the end."*
  Thirty-four mutations, thirty-two killed. One survivor was a redundant sort inside
  `activeBlock` — the one-open-row rule is held at the write side, where it can be — and it
  was deleted; the other wanted the empty-history test above.
  **The browser found the real bug, and it is M85's fault one level up.** The history read
  *"Iron Grip — Week 12 of 12 · running"* against a block that had ended four weeks
  earlier, because `endedAt === null` means "still the active program", not "still inside
  its weeks" — nothing closes a row when a window simply expires. `outcomeOf` takes the
  date now and a block past its last week reads as completed. Verified in both themes
  against a profile seeded in the pre-M87 shape, which is the only way to test a migration
  honestly. 2,580 tests pass.
  *Worth knowing:* `startDates` stays. It is the live block's start and every screen reads
  the running block through it; `blocks` is the record of what has been run, and the open
  row always describes the same block. Feeds M88 and M91.

**The app itself.**

- **M88 — The answers the logger asks for and nothing reads.** *Done, and split — the audit
  said this was closer to three milestones than one and measuring it proved that right.*
  The premise held exactly: sixteen field ids, and `session.fields` written and read by the
  same screen on the same day and nowhere else.
  **Counting the declarations changed the shape of the work.** `sessionVolume` is asked by
  **seven of eleven programs**, `attemptsToday` by nine session types, `pumpLevel` by five —
  and `hardestGradeAttempted` and `hardestGradeSent` by **six programs each**, which is the
  finding the audit missed. Those two are not a missing reading. **The app already derives
  the hardest grade of a session from the climbs logged in that same session**, for the
  pyramid, the progression chart and the personal records; the typed answer feeds none of
  them, renders in a card of its own, and nothing had ever checked the two agree. A climber
  can log V5s and type V7 and the app will carry both without comment.
  So this milestone did two things. **The quantities are a series** — a dot per answer, never
  a line, because a field is only asked on the session types that declare it and joining two
  points a month apart would draw a trend across a gap where nothing was asked. A 1-10 scale
  is drawn against its own ends and every other field against its own range: "Climbs done"
  between 18 and 24 is a flat line on a zero axis and a real spread on its own. **And the
  grade fields are reconciled** — in the logger, the one screen where either side can still
  be changed, and reported rather than corrected: the hardest thing you touched is not
  always a climb you counted, so the app says what it sees and names which side reaches
  your records.
  Twenty-seven mutations, twenty-one killed. Six survivors, five of them weak tests of mine
  and each worth knowing: the text fixtures were non-numeric, so `Number.isFinite` was doing
  the work of the kind check and a climber typing "12" for the twelfth bolt would have been
  plotted as a quantity; the two-ladder test had the V-grade numerically higher, so the
  scale guard was invisible; the off-ladder test had a real grade beside it; and the pump
  test had a single answer, so its axis could not be told from any other. The sixth was a
  redundant blank-string check that `canonicalGrade` already does, and was deleted.
  **Two browser findings**, one of them mine and a real bug: a series whose answers are all
  the same number rendered two axis lines with **the same React key**, because `hi` and `lo`
  are equal there — one line now, and the hidden duplicate is gone. The other was copy:
  "5 typical burns" put the adjective on the unit rather than the number.
  Verified in both themes. 2,623 tests pass, and the new derivation is in the perf budget.
  **Split out, because they are different milestones and not smaller ones:**
- **M88b — Where you climbed.** *Done, and the milestone undercounts the problem.*
  It names `session.fields.location`. There are **three** independent free-text location
  strings with no relationship to each other: `session.fields.location`, `Project.location`
  and `Objective.location`. The app renders all three and groups by none, so a climber who
  has been to one crag on forty sessions, kept two projects there and set an objective for
  it has that place written down forty-three times and counted zero.
  **Derived, not a stored catalogue — deliberately, against the milestone's own framing.**
  A venue here is a reading of what has been typed: no new store, no migration, no list to
  curate, and it works on the history a climber already has. A stored catalogue would have
  been a second copy of a fact the records already hold, which is AUDIT.md §8.3.
  **The rule that makes it work is on the way in, not the way out.** A grouping over free
  text is only as good as the text, so all three inputs now offer what has already been
  typed — a place named on a project is a suggestion in the logger. That is what turns
  "the works", "The Works" and "the  works" into one place: by never creating them.
  **The normalisation is deliberately timid**: case and space, nothing else. "The Works" and
  "Works" stay two places, because the app cannot tell a second gym from a second way of
  writing the first, and a grouping that guessed would silently merge two real crags that
  happen to read alike. The card says so in as many words.
  **A spelling tie is broken by recency**, not alphabetically: a climber who has switched
  from "the works" to "The Works" is telling the app which one they mean.
  Twenty-four mutations, all killed after a second pass. One survivor was a field of my own
  that **nothing rendered** — `Venue.lastVisited` — deleted rather than surfaced, because
  shipping a never-read field in the milestone about never-read fields would be absurd. The
  other three were weak fixtures.
  **Two copy errors the browser caught**, both mine: "Most of your days out are at The
  Works" reads as outdoors, and The Works is a gym; and the footnote claimed two spellings
  stay two places directly under a card that had just merged two spellings.
  **Deferred, and named so it is not mistaken for done:** there is no rename. A climber who
  typed a crag three ways for six months cannot fix it, because fixing it means a bulk
  rewrite across three stores with an undo, and that is a milestone rather than a paragraph.
  Verified in both themes. 2,860 tests pass.
- **M88c — The trip.** *Done.* The premise held: `sessionNumber` is labelled "Day of the
  trip", declared by four of Outdoor Climbing's five session types, and read by nothing but
  the generic field renderer M70 built.
  **The climber's answer is the authority and the calendar is the fallback**, which is the
  only honest way to use the field. A session marked day one *starts* a trip, full stop —
  that is what the label means. Where nobody numbered anything, outdoor days close together
  are taken as one trip, which is a guess, and the card says which of the two it used rather
  than presenting both the same way.
  **Two rest days inside a trip do not end it.** A trip with bad weather in the middle is
  still a trip, and two consecutive weekends are two trips to everyone I have climbed with.
  **My number**, and the one thing here most likely to be wrong for someone else.
  **A gap still splits a numbered trip**: a stale "day 4" fifteen days later is a forgotten
  field, not a fortnight in Spain.
  **Derived, like M88b, and with the same cost stated.** No stored trip, so nothing to
  curate and it works on history — but a trip cannot be *named*, because a name is not
  derivable from anything. A trip is known by where it was, and a climber who wants to call
  it "Font '26" has nowhere to write that. Places are grouped on M88b's venue rule, so one
  crag typed two ways is one crag.
  Twenty-four mutations, all killed after a second pass. Three survived the first, and **one
  was a mutant I wrote wrong** — a rewritten condition that was logically identical to the
  original, the same mistake as M91's. The other two were ties in my fixtures: two trips of
  equal length cannot tell the longest from the shortest, and two places cannot tell a
  capped list from an uncapped one.
  **One thing the browser fixed:** a road trip read "Burbage North and Stanage" when it
  started at Stanage. Equally-visited places now sort by the day you got to them, because a
  road trip reads as the order you drove it.
  Verified in both themes. 2,891 tests pass.
- **M89 — Injury load, counted before you get to the gym.** *Done.* The premise held:
  `sessionConflicts` appeared in its own file and its own test and nowhere else, while
  `exerciseConflict` shipped per line inside the logger.
  **Measuring it changed the case from an argument to a number.** Across all eleven
  programs there are 121 session-type × phase combinations. For an elbow, 32 of them
  conflict and **all 32 have two or more** conflicting exercises; a shoulder peaks at
  fifteen. So wherever the per-line flag fires at all, the one-at-a-time shape is wrong.
  For a hip only one of sixteen reaches two, which is the other half of the requirement:
  the sentence has to read properly at one, and it does.
  **The audit missed that `sessionConflicts` cannot see the drill.** It scans
  `type.blocks`, and the drill is not in a block — on Iron Grip's Climbing Session the
  drill is the *only* thing that loads a pulley, so a count built on `sessionConflicts`
  alone would have reported zero there, which is a silence a climber cannot check. Hence
  `dayLoad`, which reads a whole planned day, and `describeDayLoad`, which counts the
  exercises and names the drill as the drill: *"1 exercise and the drill load your back
  and knee"*. It takes the shape of a planned day rather than importing one, so
  `bodyLoad.ts` stays clear of `plan.ts`.
  **Two of the three places the milestone proposed were argued against and dropped.** Not
  the calendar grid: a month of forty-pixel cells already encodes moving and preview state
  in borders and tints, and this is the same density argument that kept M82 and M83 off it.
  Not the program detail page: that is where you *choose* a program, not where you decide
  about a session. It went instead to **Home's Today card** — the decision, made before you
  travel — and to the weekly review's **Next week** list, which is seven rows rather than a
  grid and is literally the days ahead.
  **A repetition I introduced and removed:** the first version put an `sr-only` *"loading
  your elbow"* on every row, which is exactly the repetition the caption below the list
  exists to prevent — for screen-reader users only. The badge now speaks the whole sentence
  once per row, the visible caption names the part once, and the bare number is
  `aria-hidden`.
  **Two pieces of dead code deleted:** an identity mapping in `describeParts`
  (`p === 'pulley' ? 'pulley' : p`), and a guard of my own hiding the count on a finished
  block — an over day prescribes nothing, so the count is already zero and no mutation
  could kill it.
  Twenty-two mutations, twenty-two killed. Verified in both themes: today read *2 exercises
  load your elbow* in week 4 and next Monday read *4*, which is not a bug — week 5 leaves
  The Anvil for The Hammer, and the count is a phase change showing up as a number before
  the climber walks into it. A week of counting costs 0.067 ms and does not grow with the
  log, so it gets no budget line. 2,644 tests pass.
- **M90 — What a block asks of you, not just what is in it.** *Done — and the milestone as
  written was both wrong on its numbers and far too small.*
  **The count was wrong.** It claimed twelve blocks carry a `constantDose` explanation.
  **Four do**, all in The Cruiser, plus two in the unshipped Two-Day Week draft. The twelve
  is from `types.ts`, and it is how many blocks were *found* running a flat dose in M33;
  most were fixed and four were kept and explained.
  **Measuring the four turned up the real bug.** Their exercises and dosage are identical
  across all three phases, but their `selection.note` changes in every one — *"Bias toward
  ARC for the first three weeks"* → *"Rotate the harder protocols in"* → *"Choose the
  protocol that best matches your project"*. The page renders `selection.pick` and **drops
  the note**. So the endurance block's own explanation for its flat dose — *"the pick advice
  is where that lives"* — pointed straight at a field the page was throwing away.
  **And the logger was worse.** `prescriptionFor` hands it the whole prescription and it
  rendered only the exercise list: no pick rule, no note, no circuit format. Across the
  catalogue that is **29 of 163 prescriptions showing a menu as a checklist**, 17 with a
  circuit format dropped and 18 with pick advice dropped. Cruiser's Technique Focus puts
  **six cues on screen where the program asks for one**; Base Camp's core circuit shows nine
  and asks for three. A climber doing what the screen showed was doing several times the
  session, on the one surface whose whole job is saying what to do today.
  So this shipped three things, in that order of importance: the logger says how a block is
  run, both pages pass on the pick advice, and `constantDose` renders under the dose it
  explains — below the box, because that is where the question forms.
  **The wiring guard is the durable part.** M88, M89 and M90 were all the same bug — content
  authored, type-checked, shipped and never rendered — and the existing unused-export check
  cannot see it, because a content field is not an export. `wired.test.ts` now walks the
  leaves of a prescription by name. Scoping it to `src/features` failed honestly-rendered
  fields the moment formatting moved into a helper, so it allows one import hop and no more.
  Seventeen mutations, sixteen killed. **The one survivor is honest and stays:** the pool
  count is now the rows actually on screen rather than what the block declares, and no
  mutation can kill that, because no block in the catalogue has track-tagged exercises
  inside a menu. It is a guard against a bug that does not exist yet rather than a fix for
  one that does, and it is not extra code — only which of two variables gets passed.
  The other three survivors were all in the new guard, which is a test, and nothing tests a
  test. Two were closed with self-checks; the third — quietly weakening the assertion —
  needed the assertion pulled into a named function that the self-check runs too, so
  weakening it there fails here.
  **One limitation kept rather than hidden:** the program builder cannot author a
  `selection.note` at all — it edits `pick` and nothing else — so a climber writing their
  own menu still cannot say how to choose from it.
  Verified in both themes. 2,669 tests pass.

**Progress tracking.**

- **M91 — Did you do the work?** *Done.* The premise held exactly: `session.planned` had one
  reader, `sessionEdit.ts:85` merging two records, and `review.adherence` is
  `sessions ÷ weekly target` — a count against a number, which cannot tell four climbing
  sessions from four skipped Finger Protocols.
  **The week is the unit, not the day.** A climber who moves Tuesday's session to Wednesday
  did the work, and scoring the date would call that two misses — a number about a diary
  rather than about training. So each week is asked what it placed and what it got, by type,
  and a part-finished week counts only its elapsed days, because a measure that says you are
  behind every Sunday through Saturday is a measure people learn to ignore.
  **One week never pays for another.** Three Finger Protocols in a week that asked for two is
  two done and one extra, not three done — otherwise a double Tuesday settles a missed
  Friday and the number stops meaning anything. Sessions logged by hand are counted
  separately rather than dropped: "you did less than the plan asked" would be a lie told to
  someone who was training the whole time.
  **The layout had to be snapshotted, which the milestone did not anticipate.** A block
  record already remembered the program's name and length; it did not remember the week
  layout, so a climber who rearranges their week would have had every earlier block
  re-scored against a layout it never ran. `BlockRecord.plan` now records it at
  `openBlock`, and a block that predates that says so on the page rather than passing a
  guess off as a measurement.
  **A sentence of mine went false and is fixed.** M85's block-end copy read *"Whether you
  trained every week of it is between you and the log — what the app can say is which of
  the numbers moved"*. The card directly beneath it now answers that question, so both the
  "ran out" and the "you left" wordings were rewritten to point at it.
  Twenty-two mutations, all killed — but only after a second pass. Six survived the first,
  and **one of those was a mutant I wrote wrong** (a dead `if (false) continue` appended
  after the real check, which mutated nothing); the other five were weak tests of mine, each
  worth knowing: the truncation test checked only the "and N more" tail, so a sentence
  listing all four types *and* the tail still passed; nothing asserted `openBlock` writes
  the layout down; the block-snapshot test gave the record the same layout as the live plan,
  so it could not tell which of the two was read; and no test ever logged a type the plan
  never placed, so the breakdown's filter was free.
  Verified in both themes. 2,696 tests pass.
- **M92 — The retrospectives have no pictures in them.** *Done.* The premise held exactly:
  `MediaCard` had two mounts, the logger and the project page, and neither the journal nor
  the year in review touched media at all.
  **The shape of this one is an ordering, not a feature.** A journal renders every matching
  entry with no paging and a year can hold four hundred photographs, so "show the pictures"
  had to become: ask the *index* who has photos — a key cursor, never a value, the pattern
  `findOrphanMedia` already argues for — then name the handful worth loading, then read only
  those blobs. A year costs four hundred index keys and twelve reads.
  **Twelve, spread across the months that have any.** Taking the first twelve in date order
  hands back one busy fortnight and calls it a year, so the months take turns.
  **A project's photos are dated by its send**, and one still in progress stays out of the
  grid. A session is a day and needs no argument; a project spans months and the app has no
  date for the picture itself, so filing unsent beta under a year would be the app inventing
  one.
  **A real bug, and only a browser could find it.** The first draft set the observer up in
  an effect keyed on a ref object. On the journal that effect ran before the owner index
  resolved, so the strip had no photos, rendered nothing, and the effect saw a null ref and
  bailed — and nothing re-ran it, because **a ref is not a dependency**. Every strip on the
  page stayed grey forever. jsdom has no `IntersectionObserver`, so all ten tests took the
  eager branch and passed while the branch a phone actually takes was broken. Fixed with a
  callback ref, which fires when the node attaches; and the lazy path now has a test that
  stubs the observer and drives it by hand — checked against the old implementation, which
  it fails.
  Twenty-one mutations, all killed after a second pass. Six survived the first, and one was
  **dead code of mine**: a `limit <= 0` guard the loop condition already made unreachable,
  now deleted. The other five were weak fixtures — no session *after* the range, a project
  whose blank `createdAt` defeated the very fallback the test was about, an intra-month
  ordering case where `reverse()` happened to equal the sort, an untested missing-id path,
  and an empty strip that rendered an empty flex box with a top margin under every note.
  Verified in both themes. 2,726 tests pass.
- **M93 — The baseline goes stale.** *Done, and the milestone was wrong about the blast
  radius in a way that changed the whole shape of the fix.*
  It says a stale baseline feeds "every recommendation the app makes". **It does not.**
  `baseline` has exactly one reader — `FinderPage` — and there it only seeds the form's
  chips; the finder runs on the chips, not on the record. So no new settings screen was
  needed, and building one would have been answering a problem the app does not have.
  **The real harm is sharper than the one described.** The finder asks the same five
  questions the baseline holds and **threw every answer away**: `run()` built its input,
  ran, and discarded it. A climber who corrected "coming back" to "intermediate" on Tuesday
  was asked the stale question again on Friday, and every time after. The fix is four lines
  — the finder keeps what it is told — and it is the whole first half of this milestone.
  **Drift is measured against the recent log, not a timestamp.** The question is not "has
  this changed since you said it" but "does it match what you are doing now", which needs no
  new stored field and gives the same answer in every realistic case.
  **Two of the three answers have a signal and one does not.** `daysPerWeek` the log can
  check outright. `experience` can be checked in **one direction only**: "new" and "coming
  back" are claims about a *phase* and stop being true on their own, while a climber calling
  themselves intermediate when the app disagrees is a coaching judgement about grades and
  years — the app second-guessing that from a row count would be worse than silence. `goal`
  is an intention and nothing here pretends the log has a view.
  Nothing is ever overwritten: the stored answer stays selected, the observation sits beside
  it, and the note disappears the moment the chip moves rather than arguing with a choice
  just made. **Two numbers are mine and are labelled as mine** — two days out before it is
  worth saying, and 24 sessions over 8 weeks before a phase has ended.
  **The tests caught a bug the write-back introduced**, which is the best argument for the
  suite in this milestone: persisting the answers made the finder's auto-run effect fire a
  *second* time, replacing the result the climber had just asked for with one rebuilt from
  the stored baseline — which does not carry the weeks they have. The effect now marks
  itself before it checks for a baseline. And a consequence worth stating: the auto-run is
  **skipped entirely when there is drift**, because it exists so a climber who has just
  answered is not asked twice, and handing them a recommendation built on answers the app
  has itself flagged as out of date is the opposite of that.
  One false sentence of my own, caught before it shipped: the experience note said "since
  then the log has…", and the span is measured from the first logged session, which the app
  cannot know to be after the answer.
  Twenty-three mutations, all killed. Verified in both themes. 2,754 tests pass.

**Programs.**

- **M94 — What the rest day was actually spent on.** *Done, and the milestone is wrong
  twice — once in a way that matters.*
  **"Six readers" is twelve**, across as many files. Minor.
  **"The four ticks have never been read by anything" is false.** `challenges.ts` counts
  rest days where all four are ticked, and `sessionEdit.ts` ORs them field by field on a
  merge. What is true, and is the whole finding restated: **no individual tick has ever
  been distinguished from another.** `Object.values(...).every(Boolean)` collapses four
  different recovery behaviours into one bit, so a climber who hydrates on every rest day
  and has never once ticked mobility looks exactly like one who does the reverse.
  Ninety days, like the check-in history, and for the same reason: a week holds one or two
  rest days and a habit is not visible in two. The card sits beside "How you were feeling"
  — both are long-window readings of something logged per session, and a rest day is the
  one kind of day the check-in never asks about. **No chart**: four shares is a list, and
  drawing it would be a picture of four numbers already legible as numbers.
  **Nothing scolds.** The denominator is rest days that recorded *something*, not every
  rest day, and a climber who logs rest days and never ticks anything is told nothing at
  all — turning "I did not fill in a form" into "I did not recover" is the failure mode
  this feature had to avoid.
  **A design hole my own fixture found:** with two items tied at zero, naming one as "the
  one that gets skipped" is a half-truth about the other. So `skipped` is a list, empty when
  every item clears half and empty when three or four tie at the bottom — where the rows
  say it better than a sentence naming almost everything. **And a copy fix from the
  browser**: "the one that usually gets skipped" claims a uniqueness the rule does not
  check, since a second item can be under half too. It now says "the one you skip most
  often", which is true however many others are low.
  Twenty-two mutations, all killed after a second pass. Four survived the first, all weak
  fixtures of mine, and two were worth the trouble: the tie rule was quietly doing the work
  of *both* the share rule and the minimum-days rule, so a fixture with three items at the
  bottom could not tell any of the three conditions apart.
  Verified in both themes. 2,785 tests pass.
  **Shipped red, and fixed on the way in:** M93 went out with a `tsc --noEmit` failure in
  its drift test — vitest does not typecheck, the suite was green, and the last typecheck
  in that milestone ran before the file existed.
- **M95 — The two programs nobody can start.** *Done. The coach read them, and the
  catalogue is thirteen programs.*
  **The calls, as made:** Two Days a Week spends **both** committed days on climbing; Trip
  Prep asks for **no test**; its taper is **one week, the last**; Two Days deloads **once, at
  week 8**; the doses stand as drafted; and Trip Prep starts at **V3**.
  **The first call restructured the program.** The draft spent one of the two days on
  strength, so a two-day climber climbed *once a week for twelve weeks*. Both days climb
  now — and the strength work did not become optional, because a climber with two days will
  not do a third. It moved *into* the sessions: fingers on the hard day, pull and prehab on
  the volume day. Every weekly dose is unchanged; climbing went from once a week to twice.
  **Shipping was not the two lines M58 promised, and the reason is worth keeping.**
  `drafts.test.ts` ran `validateProgram` — the rules the *builder* enforces on a climber's
  own program — and the catalogue runs `validateCatalog`, which is stricter. Both drafts
  failed it on the same rule the moment they were added: **no rest session type**. A draft
  that validates against the wrong validator is a draft that looks ready and is not.
  Seven more checks broke on contact, every one of them a guard doing its job: the catalogue
  count in the app guide, the summary index that mirrors the guides, the grade-range rule
  that forbids an authored *"V3 and up"* because a spelled grade cannot follow a Font
  preference, the guide-accuracy rule that wants a table row for every deload week, the
  test-week rules that assumed every block measures something, and two finder tests that
  assumed every program is twelve weeks.
  **One real improvement fell out of it.** Trip Prep is the first program whose range runs
  to the top of the ladder without starting at the bottom, and it displayed as *"V3-V17"* —
  a band with a ceiling. `displayRange` now renders an open-topped range as **"V3+"**, and
  in Font as **"6A+"**, which is the whole point of deriving it rather than writing it.
  **The guides are deliberately short** — five or six sections each rather than the ten to
  thirteen of the ported ones. They explain the programs; they do not restate the doses,
  because the programs carry those and a guide repeating them is a second place for one to
  be wrong. `accuracy.test.ts` records both as prescribing no exercises in prose, which is
  a fact about them and not an omission.
  Verified in both themes: the finder now answers a two-day climber with **"Two Days a Week
  — Fits 2 days a week"**, which is the hole M58 wrote the program to fill. 2,901 tests pass.

**The Ascent.**

- **M96 — The day's wall is thrown away.** *Done.* The premise held exactly: one `daily`
  record, overwritten every day, in a game whose own copy says a score is comparable
  because everyone gets the same wall.
  **The label really was the only survivor, and it is read exactly once.** `heightFromLabel`
  parses "The Ascent · 1,063 m" back into a number on first load and writes the result down
  as a number; nothing reads that label again. The parser is deliberately strict — groups of
  ASCII digits joined by separators and nothing else — because `toLocaleString` on a whole
  number produces grouping separators and nothing else, so a comma or a full stop is
  equally fine and a locale with its own digits yields nothing rather than a number invented
  from a string.
  **A recovered day is its own type, not a record with optional fields.** It genuinely knows
  less: the label carried a height and no mode, no coins, no tape. Making those optional on
  the shared shape would have pushed one day's ignorance into every reader as a `?? 0`, so
  `DayRecord` is a union of `ClimbedDay` and `RecoveredDay` and the narrowing is enforced
  instead of defended. A real recording replaces a recovered day outright, even a lower one
  — keeping the parsed height beside the new run's tape would put a ghost on the wall
  claiming a climb that never happened.
  **Tapes are pruned to the newest day** at write time, not read time: the wall is seeded
  from the date so an older tape is unraceable anyway, and a year of tapes is a hundred
  times the bytes of a year of heights.
  **The browser found the last thing wrong with it.** The chart drew a month and counted
  every day before the climber's first wall as one they had skipped. The window now stops at
  the first wall climbed — the same clamp M93 needed, for the same reason — so a climber
  four days in reads "2 of the last 4 walls" rather than a month with twenty-six invented
  misses in it. A skipped day is a gap, never a zero-height bar: not climbing a wall and
  climbing nought metres of one are different days.
  Twenty-nine mutations, all killed. Verified in both themes. 2,827 tests pass.

**Two findings that did not survive the check**, recorded so they are not proposed again:

- *"`Program.ordering` is authored on every program and read by nothing"* — true as far as
  the field goes, and not a gap. `ordering` is documented as "human-readable scheduling
  prose, kept verbatim alongside `constraints`", and the machine-readable `Constraint[]`
  beside it carries a `note` per rule that **is** surfaced, in both places a climber can
  break one: `StartProgramPage.tsx:274` when the layout is chosen, and
  `CalendarPage.tsx:175` when a session is dragged. The prose is a duplicate of a rule the
  app already enforces and explains.
- *"Program grade ranges ignore the Font/French preference"* — carried as a known
  limitation since the guide audit, and it is wrong. `gradeRange` is already structured
  (`{ scale, min, max, label? }`) and `displayRange` already converts `min` and `max`
  through `displayGrade`. Only four of the eleven programs set `label`, and all four are
  words rather than grades — "All Levels", "Pre-Climbing" — which is exactly what the
  escape hatch is for. **The carried limitation should be struck from the notes above
  rather than fixed.**

### The next fifteen, again (proposed, M98–M112)

*Brainstormed against the app as it stands at M97, by reading the routes, the engines, the
content shapes and every page's cards rather than the plan's memory of them. Two are the
kind of thing a training app cannot really call itself one without (M98, M99); five sharpen
something that already ships (M100, M101, M104, M106, M107); eight are new. Nothing here is
committed. M12 stays parked until there is a name.*

*A rule for all of them, carried from M89–M97: every premise below is a claim about the
code and should be re-measured before the milestone starts. Six of the last ten had a
materially wrong premise. Sizes are guesses.*

- **M98 — Log the load, not just the tick.** *Done, and the premise was right for a
  weaker reason than the one I gave it.*
  **The numbers in the proposal were wrong, and measuring them made the case stronger.**
  I wrote that this was about blocks "whose entire progression is add weight (Iron Grip's max
  hangs, The Siege's weighted pull-ups)". Counted: of 553 authored exercises only **62 declare
  a `load` at all**, and of 68 blocks only **7** change their load text across phases. As a
  claim about authored doses, "add weight" is rare. The real hole is one the catalogue states
  in prose and cannot state in data: **eleven phase goals across seven programs** describe a
  progression the model has no field for — Iron Grip's Hammer phase reads *"Progress added
  load weekly"* while prescribing `load: '85-90% max added weight'`, one static string for
  four weeks. M33's `constantDose` says the same thing from the other side, in writing:
  progression that "lives in intensity, grade choice and session length — dimensions this
  model has no field for". So the field was missing, not the authoring.
  **The reader count held exactly**: `completedExercises` had four readers outside tests
  (the logger, `templates`, `tissueLoad`, `sessionEdit`).
  **One array, not two.** The proposal kept `completedExercises` and added numbers beside it,
  which is two sources for "was this done" and a drift waiting to happen — tick, type,
  untick, and what becomes of the numbers? So presence in `exercises` *is* the tick, and the
  old field is deprecated and folded in on read, which is the shape `getAscent` settled on in
  M96. Both read paths migrate; the old key is dropped rather than left beside the new one.
  **Keyed by name, and measured before trusting it.** A name is the right key for a history —
  Weighted Pull-Ups in Iron Grip and in The Siege are one line — and the wrong key inside one
  session if two blocks prescribe the same name. Checked across the catalogue: **zero of 65
  (session type × phase) pairs repeat a name**, and a content guard now holds that. A custom
  program that repeats one shares a row, exactly as the tick always did.
  **Which boxes appear comes from the prescription.** An exercise declaring sets and reps gets
  two; Max Hangs, declaring sets, hold and load, gets three; a menu line with no dose gets
  none. Nothing renders until the exercise is ticked, so the untouched path costs what it
  always did — the direct answer to M74's complaint that the logger is already long.
  **Nothing is pre-filled from the prose.** `'3-5'` and `'85-90% max added weight'` are not
  starting values, and turning them into one would write a number nobody did. What is offered
  is *last time* — the climber's own number — behind a tap, which is the line `templates.ts`
  draws when it refuses to copy climbs forward.
  **It never says better.** `blockReport` may, because every `Metric` declares
  `higherIsBetter`; an exercise line declares nothing, and more reps at less load might be a
  deload, a phase change or a bad day. `/finish` reports *from → to* per dimension and stops,
  and a test asserts the card never uses the word.
  **Load is stored in pounds** for the reason M48 gave — canonical storage is invisible,
  display is the part that was wrong — so a metric climber types kilograms and reads them
  back. Zero is bodyweight and different from absent; negative is assisted, and since neither
  keypad offers a minus sign (which `Input`'s own comment already flagged as unanswered), the
  sign is a control rather than a character.
  **Deliberately not built: a browsable per-exercise page.** The two questions a climber
  actually asks — *what did I do last time* and *did this go up* — are answered at the two
  moments they ask them, in the logger and on `/finish`. A browsable index of 166 exercise
  names is M107's problem, not this one. `exerciseIndex` was written for it, shipped used by
  nothing, and was deleted rather than left as a dead export.
  Forty-seven mutations, forty-five killed. **Both survivors were real.** One was dead code of
  mine — an explicit `points.length < 2` guard that `changed.length === 0` already covers,
  since one reading's first and last are the same reading; deleted. The other was a genuine
  coverage gap: nothing proved `/finish` respects the block window, because every session in
  the fixture was inside it. Closed with a reading from before the block, and the new test
  verified against the mutant.
  **One browser finding.** At 430px the "Same again" chip took the row and left
  `Sep 4: 5 × …` — truncating the one line whose whole job is to say what the numbers were.
  It wraps now. jsdom has no layout and reported the line as present either way.
  Verified in both themes and both unit systems. 3,016 tests pass.

- **M99 — ~~The clock reaches the circuits and the tests~~ → The clock reaches the
  circuits.** *Done, with the second half split out as M99b and the reason recorded.*
  **The premise held on the circuits, exactly.** `CircuitFormat` is authored on **17
  blocks** across six programs and read by two things that only print it —
  `prescriptionLine` and the program-file parser — while `timer.ts` expands a `Protocol`
  and only a `Protocol`. A climber running Base Camp's Engine Room had *"Pick 5 of 9 ·
  40-60s each · 20s rest · 2 rounds"* on screen and counted all of it in their head.
  **"Two things sharing one expansion" was wrong, and it is why this split.** A circuit
  really is a protocol's shape wearing different words — rounds ↔ sets, exercises ↔ reps —
  and `buildTimer`'s two awkward rules land on it exactly: the rest between exercises goes
  after the last exercise of a round, the round rest goes after the last round. A **max-hang
  ramp** is not that shape (it is open-ended, to failure, with an input per attempt) and a
  **stopwatch** is not that shape at all. Three mechanisms, one of which shares the
  expansion. They are M99b.
  **And the stopwatch has a design problem I had not thought about**: you cannot tap *stop*
  while holding a front lever. A count-up you can hear, or a countdown to a target, is a
  different feature from "start and stop", and it deserves deciding rather than bolting on.
  **"Opened from the logger and gym mode" was also wrong.** Gym mode has no prescription,
  no blocks and no exercises — putting one there would undo the page M74 defined as "the
  same session with everything else taken away". Logger only.
  **The substance is the parser, and the measured outcome is 9 of 17.** Authored values
  include `'40-60s'`, `'1 min'`, `'Minimal'` and `'30-60s or 8-15 reps'`. Nine carry a work
  time the clock can read. Seven declare none at all — they are rep-based — and one is
  ambiguous by construction. Those eight get a sentence saying why rather than a guessed
  duration, which is the rule M96 arrived at the hard way. A test holds the 9/17 split so an
  authored circuit that stops being runnable is a failure rather than a silent loss.
  **A range runs at its lower bound**, because "40-60s" is a coach saying "about a minute"
  and the bottom is the end that does not quietly make the session harder than it was
  written — with the full range still printed above the button. **"Minimal" becomes no rest
  segment**, not an invented ten seconds.
  **The tick is the pick.** Twelve of the seventeen circuits are menus, so which of the nine
  you are doing is the climber's choice and the timer runs over what M98 already recorded as
  ticked. That also means finishing a circuit adds nothing to the log: the exercises it ran
  were already there.
  **`TimerSheet` stopped being a protocol viewer.** It read six things off a `Protocol`;
  a circuit has intervals and none of the rest, and faking a `Protocol` would invent a named
  training method that does not exist. It takes a `TimerSubject` now — plain data — and that
  collapsed a second problem: what the sheet needs to draw and what a reload needs to restore
  are the same shape, so `TimerState` stores the subject instead of a protocol id. A record
  written by the older shape fails validation and resumes nothing, which on `sessionStorage`
  costs one refresh at worst.
  **A test found a real ordering bug**: the pick was checked before the program's prose, so a
  rep-based circuit told you to tick five exercises and then refused anyway. Content first.
  Forty-two mutations, thirty-nine killed. **All three survivors were real.** Two were
  untested paths — a valid envelope around a broken subject, and the sheet's use of the work
  word — and one was untestable until a test drove the clock to completion. The work-word one
  is worth recording twice: my assertion was `not.toMatch(/\bWork\b/)` over the whole sheet,
  and `\bWork\b` **cannot** match inside `"…HangsWork10"` because neither side is a word
  boundary. It passed for the wrong reason in both directions, and the mutation is the only
  thing that would have told me.
  **One browser finding:** at 320px "Round 1 of 2 · Mountain Climbers" wrapped out past the
  dial's ring. The exercise gets its own line now. **And the bundle budget tripped** — 214.59KB
  before, 215.45KB after, against a 215 limit. The 0.86KB is real, so the budget moved to 216
  and not a byte further; the actual headroom is a lazy `LogPage`, which is a perf milestone.
  Verified in both themes at 430px and 320px, including a resume across a reload mid-circuit.
  3,068 tests pass.

- **M100b — The focus ring was reshaping every control in the app.** *Done, found while
  verifying M99b in a browser.*
  **One line, app-wide.** `.focus-ring` carried `border-radius: inherit` from M14, on the
  reasonable-looking theory that a focus ring should follow the shape it is drawn around. An
  outline does that by itself. What the line actually did was **overwrite each element's own
  radius with its parent's**.
  **Measured before touching it: 132 of 132.** Every control across ten routes that declared
  a radius rendered a different one — a `rounded-lg` button at 16px because its card was
  `rounded-2xl`, and M99b's `rounded-full` stop button as a **square**, because its row was
  square. That is what put it on screen: a shape that was obviously wrong rather than merely
  slightly off.
  **It hid for years for two reasons.** A button inside a rounded card inherits something
  plausible, so nothing looked broken; and nothing in the suite has a layout engine — jsdom
  resolves no cascade, so only a real browser could ever have seen it.
  **Checked for the case that would have justified it**: a `.focus-ring` element with no
  radius of its own, sitting in a rounded parent, which would now go square. Across nineteen
  routes there are **zero**. Every one either declares its own radius or sits in a square
  parent, so removing the line is a pure correction with nothing to trade off.
  **The rule, in a test**: a shared behaviour class decorates, and geometry belongs to the
  element. `ui.test.ts` now fails if `.focus-ring` declares a radius, size, spacing, display
  or position — verified against the reinstated line.
  Verified in both themes across settings, calendar, climber and search.

- **M99b — The tests that are procedures, not numbers.** *Done for the seven that are a
  hold; the ramp is left, with the reason. And the milestone's main claim was wrong.*
  **"The page you visit to record the number never explains it" is false.**
  `Metric.description` is set on **30 of 37** metrics and the assessments page renders it in
  two of its three places — the picker and the add-a-benchmark card. What is actually true is
  smaller and more specific, and it took reading the page to find: the description was missing
  from the **expanded row**, which is the one a climber who already tracks a benchmark opens,
  so the case where you go to record a number you have recorded before was the case with no
  explanation.
  **The real finding is a duplication, not an absence.** `BenchmarkPrompt.how` was a second
  copy of the same prose, written in `onboarding.ts`, shown only during onboarding, and
  **already drifted** — one wrote "20 mm", the other "20mm". Six of the eight said the same
  thing twice. The two that did not (`max_pullups`, `weighted_pullup_3rm`) had no description
  at all, so their only explanation lived in a screen you see once. This is M77's problem in
  a different corner, and the fix is M77's: one source.
  **So `how` became `entry`**, carrying only what the registry cannot say — the *typing*
  convention, "enter 0 if bodyweight is your limit, and a negative number if you take weight
  off". Which means it belongs wherever the number is typed, and it now appears on the
  assessments form too: until this, a climber recording a max hang there was never told that
  zero and negatives were allowed. A test asserts the entry note is not a re-description.
  **Seven metrics are a stopwatch, derived rather than listed.** `dead_hang`, `lock_off_90`,
  `core_plank`, `hollow_body`, `front_lever_hold`, `density_hang_bw_20mm` and `arc_duration`
  fall out of what they already declare — a numeric metric measured in seconds or minutes is
  a duration — so there is no second table to keep in step. A test pins the seven.
  **The design question I raised in M99 has an answer, and it is not the one I implied.** I
  said a stopwatch "cannot be a stopwatch, because nobody taps stop mid-front-lever". They do
  not have to: you drop off and *then* tap, so the tap is late by a second rather than
  impossible. Two things keep that honest — a mark you can hear every ten seconds while you
  are hanging, so the number is not a surprise, and a result that lands in the form as a
  suggestion you confirm rather than one that saves itself.
  **Not `TimerSheet`.** That counts down through a plan built in advance and a max hold has
  no plan. Faking one would draw a ring showing a fraction of a total nobody knows — the same
  refusal M99 made about faking a `Protocol`.
  **Left, with the reason: the ramp.** Max hang and weighted-pull-up 3RM are load-to-failure
  with an input per attempt and a three-minute clock between them. That is a second control
  and a storage question of its own (does the ramp survive, or only its result?), and folding
  it in here would have been the mistake M99 split to avoid.
  Twenty-six mutations, twenty-two killed. **All four survivors were real**, and one corrected
  this module's own doc comment: I wrote that `core_lever` is excluded because it is
  `kind: 'text'`, and the mutation showed the unit check already refuses it — its unit is
  `'level/sec'`, not `'sec'`. The `kind` check is the rule rather than the mechanism, so it is
  held by a hand-built metric instead. Two were untested paths (the wall clock, and the
  expanded row) and one was dead code of mine — resets that could never fire, because the
  sheet has no restart.
  **Two browser findings.** The copy read *"You will confirm the sec before anything is
  saved"* — `unitLabel('sec')` in a sentence — which also revealed the whole units dependency
  was doing nothing, since neither seconds nor minutes convert. And the stop button rendered
  as a square, which turned out to be an app-wide bug and is **M100b**, fixed in its own
  commit first so this landed on a correct base.
  Verified in both themes. 3,101 tests pass.

- **M100 — Unlogged is not untrained.** *Done, and the shape it proposed was already
  built.*
  **The premise held where it matters and was wrong in its detail.** The coach really did
  print *"24 days since you trained"* from the newest completed session, to a climber who may
  have climbed through every one of those days. But of the six readers it named as treating a
  gap in the log as a gap in training, **two do not**: `staleSessions` is about a session left
  *running* — `startedAt` with no `endedAt` — and `comingOffBreak` is the climber answering
  "returning" in the finder, a stated answer rather than a read of the log.
  **The `sketch: true` flag was not needed, and this was measured rather than argued.** The
  proposal wanted a new kind of session that counts for consistency and the streak, carries no
  load, and closes the gap. Against a fixture of eight weeks of training followed by three
  unlogged weeks, filling the gap with plain **bare completed sessions** — a thing the app has
  always been able to hold — moves every one: sessions 24 → 34, streak 0 → 10 weeks, longest
  gap 24 days → 3 days, ACWR still `null` because `sessionLoad` is RPE × hours and both are
  absent, the detraining tip gone and a streak tip in its place. A flag would have been a
  second way to say what the record already says, which is what M98 refused and M99b had to
  undo.
  **So what was actually missing is three things, and none of them is a field.**
  *One*, the app said the wrong sentence: the tip now reads "N days since you **logged
  anything**", carries both readings, and keeps the real detraining advice behind the one that
  is true. *Two*, marking days was possible and tedious — a navigation and a tap each, through
  a page built for a whole session — so the calendar gets a picker: tap the days, one confirm,
  no program required, undo for the lot. *Three*, once it is cheap, nothing distinguished a
  marked day from a logged one, so "34 days · 2.9 a week" would quietly become a number built
  partly on assertions. The consistency summary now ends "· 5 of them marked without detail".
  **Bareness is derived, never flagged.** A stored flag can be contradicted by its own record —
  mark a day a sketch, then log six climbs on it. Reading it off the session cannot: the moment
  a day carries anything, it stops being bare.
  **The coaching call, stated rather than made quietly.** A bare completed day already pays the
  full session base — 300 XP, measured — and this milestone makes that one tap instead of
  three. Left as it is: a marked day is a claim about real training exactly like every other
  logged session, and the app has never policed honesty (you can log a V15 you did not send).
  If the coach wants marked days to pay nothing, it is a one-line change and the reasoning
  should be theirs.
  Thirty-two mutations, thirty-one killed. The survivor was **a badly-written mutation of
  mine** — an unused `let n = 0` that mutated nothing, the M91 mistake again; two real forms of
  the same day-versus-session confusion were both killed.
  **Three browser findings, each invisible to jsdom.** The undo bar read *"5 days marked
  deleted"*, because every undoable action before this was a delete and the bar appended the
  verb itself; offers carry their own verb now. And the picked day was **invisible twice over**:
  first its border, then its background, each losing a Tailwind emit-order coin flip to the
  shell's own classes — the trap `Field.tsx` already records for type sizes. The cell emitted up
  to three background classes and now emits exactly one, which also removes the same coin flip
  that was latent between the logged tint and the in-month fill. A test holds both.
  Verified in both themes. 3,133 tests pass.

- **M100b — The focus ring was reshaping every control in the app.** *Done, found while
  verifying M99b in a browser.*
  **One line, app-wide.** `.focus-ring` carried `border-radius: inherit` from M14, on the
  reasonable-looking theory that a focus ring should follow the shape it is drawn around. An
  outline does that by itself. What the line actually did was **overwrite each element's own
  radius with its parent's**.
  **Measured before touching it: 132 of 132.** Every control across ten routes that declared
  a radius rendered a different one — a `rounded-lg` button at 16px because its card was
  `rounded-2xl`, and M99b's `rounded-full` stop button as a **square**, because its row was
  square. That is what put it on screen: a shape that was obviously wrong rather than merely
  slightly off.
  **It hid for years for two reasons.** A button inside a rounded card inherits something
  plausible, so nothing looked broken; and nothing in the suite has a layout engine — jsdom
  resolves no cascade, so only a real browser could ever have seen it.
  **Checked for the case that would have justified it**: a `.focus-ring` element with no
  radius of its own, sitting in a rounded parent, which would now go square. Across nineteen
  routes there are **zero**. Every one either declares its own radius or sits in a square
  parent, so removing the line is a pure correction with nothing to trade off.
  **The rule, in a test**: a shared behaviour class decorates, and geometry belongs to the
  element. `ui.test.ts` now fails if `.focus-ring` declares a radius, size, spacing, display
  or position — verified against the reinstated line.
  Verified in both themes across settings, calendar, climber and search.

- **M99b — The tests that are procedures, not numbers.** *Done for the seven that are a
  hold; the ramp is left, with the reason. And the milestone's main claim was wrong.*
  **"The page you visit to record the number never explains it" is false.**
  `Metric.description` is set on **30 of 37** metrics and the assessments page renders it in
  two of its three places — the picker and the add-a-benchmark card. What is actually true is
  smaller and more specific, and it took reading the page to find: the description was missing
  from the **expanded row**, which is the one a climber who already tracks a benchmark opens,
  so the case where you go to record a number you have recorded before was the case with no
  explanation.
  **The real finding is a duplication, not an absence.** `BenchmarkPrompt.how` was a second
  copy of the same prose, written in `onboarding.ts`, shown only during onboarding, and
  **already drifted** — one wrote "20 mm", the other "20mm". Six of the eight said the same
  thing twice. The two that did not (`max_pullups`, `weighted_pullup_3rm`) had no description
  at all, so their only explanation lived in a screen you see once. This is M77's problem in
  a different corner, and the fix is M77's: one source.
  **So `how` became `entry`**, carrying only what the registry cannot say — the *typing*
  convention, "enter 0 if bodyweight is your limit, and a negative number if you take weight
  off". Which means it belongs wherever the number is typed, and it now appears on the
  assessments form too: until this, a climber recording a max hang there was never told that
  zero and negatives were allowed. A test asserts the entry note is not a re-description.
  **Seven metrics are a stopwatch, derived rather than listed.** `dead_hang`, `lock_off_90`,
  `core_plank`, `hollow_body`, `front_lever_hold`, `density_hang_bw_20mm` and `arc_duration`
  fall out of what they already declare — a numeric metric measured in seconds or minutes is
  a duration — so there is no second table to keep in step. A test pins the seven.
  **The design question I raised in M99 has an answer, and it is not the one I implied.** I
  said a stopwatch "cannot be a stopwatch, because nobody taps stop mid-front-lever". They do
  not have to: you drop off and *then* tap, so the tap is late by a second rather than
  impossible. Two things keep that honest — a mark you can hear every ten seconds while you
  are hanging, so the number is not a surprise, and a result that lands in the form as a
  suggestion you confirm rather than one that saves itself.
  **Not `TimerSheet`.** That counts down through a plan built in advance and a max hold has
  no plan. Faking one would draw a ring showing a fraction of a total nobody knows — the same
  refusal M99 made about faking a `Protocol`.
  **Left, with the reason: the ramp.** Max hang and weighted-pull-up 3RM are load-to-failure
  with an input per attempt and a three-minute clock between them. That is a second control
  and a storage question of its own (does the ramp survive, or only its result?), and folding
  it in here would have been the mistake M99 split to avoid.
  Twenty-six mutations, twenty-two killed. **All four survivors were real**, and one corrected
  this module's own doc comment: I wrote that `core_lever` is excluded because it is
  `kind: 'text'`, and the mutation showed the unit check already refuses it — its unit is
  `'level/sec'`, not `'sec'`. The `kind` check is the rule rather than the mechanism, so it is
  held by a hand-built metric instead. Two were untested paths (the wall clock, and the
  expanded row) and one was dead code of mine — resets that could never fire, because the
  sheet has no restart.
  **Two browser findings.** The copy read *"You will confirm the sec before anything is
  saved"* — `unitLabel('sec')` in a sentence — which also revealed the whole units dependency
  was doing nothing, since neither seconds nor minutes convert. And the stop button rendered
  as a square, which turned out to be an app-wide bug and is **M100b**, fixed in its own
  commit first so this landed on a correct base.
  Verified in both themes. 3,101 tests pass.

- **M100 — Unlogged is not untrained.** *Proposed. Size M.*
  **Premise.** The coach's detraining rule prints *"N days since you trained"* from the
  newest completed session. Vitality, the streak, the consistency grid, the ratio's
  chronic window, `staleSessions` and the finder's `comingOffBreak` all read a gap in the
  log as a gap in training. A climber who climbed for three weeks and did not open the app
  is told they have detrained and to *"come back at two-thirds of the volume you left on"*
  — advice that is wrong, delivered confidently, by an app whose whole pitch is that it
  never says more than the log supports.
  **Shape.** A *sketch*: a completed session with `sketch: true`, placed from the calendar
  over a day or a range in one tap — "Been away from the app? Mark the days you climbed."
  It counts for consistency, the streak and the gap. It carries load only if the climber
  gives RPE and duration; otherwise it is excluded from the ratio the way a deload is, and
  every reader that would have counted it says so: *"3 unlogged days in this window"*.
  **Never.** Invent climbs, feet or records. A sketch pays the session base and nothing
  else, and no challenge that measures climbs can be satisfied by one. It is exactly as
  gameable as an empty completed session is today, which is to say: already.
  **Caveat.** This changes what a completed session means. Count the readers of
  `completed` first — M94 found twice the readers the plan claimed for a smaller field —
  and the ones that must not count a sketch are the ones that pay or measure climbs.

- **M101 — The finder reads the log, not just the questionnaire.** *Done, with three of
  the four proposed signals refused for measured reasons and a better one used instead.*
  **The premise held.** `FinderInput` was the seven answers plus metrics, equipment and
  injuries; the only thing it took from the log was the grades M85 taught it. A climber who
  had just finished Iron Grip could be recommended Iron Grip.
  **The proposal's best material was one it did not name.** `nextPrograms` is authored on
  **all thirteen programs** with a written reason per destination — and was read on `/finish`
  and nowhere else, not on the screen whose entire question it answers. So the finder now
  carries it: *"Iron Grip names this as what follows it: Maintain what you built. The Cruiser
  keeps fingers sharp without grinding."*
  **Three of the four proposed signals were refused, each after measuring.**
  *The weakest drill category* would have rewarded authoring density, not training: **six of
  thirteen programs declare no drills at all**, so a "trains what you neglect" reason would be
  silent for half the catalogue and systematically favour the other half. *Tissue gaps* rest on
  a keyword scan whose own module says it is "not tolerable for a number with a unit" — using
  it to re-order programs is exactly that. *Outdoor share* had no action behind it that the
  stated goal does not already cover.
  **So what is used is the block you just ran**, which is the single most relevant thing the
  log holds and the one the finder was blind to: a deduction and a caution against repeating
  it inside a season, the successor its own author named, and adherence.
  **Adherence is said and never scored.** A climber who ran a four-day block at a third of its
  plan may have been injured, or busy, or may want to try again — and they have already told
  this screen how many days they have. Deducting would be the app disbelieving that answer.
  **The browser found the design fault, and it is an M91 fault.** `outcomeOf` says "completed"
  when the last week has passed and the climber never switched away — so a block done at **13%
  of its plan** reads as finished, and the finder told a climber *"you finished this four weeks
  ago"* about twelve weeks they had mostly skipped, and argued against the one program they had
  most reason to go back to. The calendar running out is not the work being done, which is
  precisely why M91 exists. The repeat argument now needs the block to have been *run*, and the
  days caution no longer fires on the program it came from, which was a circle.
  **Its own module.** `finderHistory.ts` rather than a function in `finder.ts`, because
  `finder.ts` is reached from `onboarding.ts` and therefore from the first screens the app
  paints; pulling `adherence` and its dependencies in behind it is the shape M78 spent a
  milestone undoing. Entry chunk unchanged at 215.5KB against its 216 budget.
  Twenty-one mutations, twenty killed. **The survivor was serious**: nothing pinned that the
  gap is measured from the block's last day rather than its first, and on a twelve-week block
  those are eighty-four days apart — the difference between inside the repeat window and well
  outside it. Every other assertion about it was relative, so both readings passed.
  Also caught immediately by a test: `sortBlocks` is newest **first**, which is not the order
  a `.at(-1)` reads.
  Verified in a browser in both themes, on a block barely done and a block fully done.
  3,155 tests pass.

- **M102 — Links, not just high points.** *Done, refusing the section map, and the
  premise was missing a third record of the same thing.*
  **The premise held and undercounted.** A burn stores an outcome and a `highPoint`
  percentage, and a redpoint is decided by *links* rather than one number from the ground.
  What it did not say is that the app already records how far you got **three** ways: the
  five-step outcome, the explicit percentage, and `session.fields.highPoint` — a **text**
  field asking for "the move, bolt or hold you reached", declared by seven session types
  across five programs and read by nothing but the generic renderer.
  **So the section map is refused.** A named-section vocabulary would have been a *fourth*
  way to say how far you got, and the percentage scale it would have competed with is already
  used in four places — the stat, the progression line, the coach, the projects list. Three
  milestones this session went wrong by adding a second way to say something the record
  already said; adding a fourth would have needed a section editor and a per-burn picker for
  data almost nobody enters.
  **One optional number instead: `from`, on the scale already in use.** Absent means the
  ground, which is what every burn logged before this meant — so no record changes meaning
  and the common case still costs nothing. `worked` is the exception and has no start, because
  rehearsing moves is not a burn from anywhere.
  **It fixed a live bug rather than only adding a feature.** `summary.highPoint` was the best
  percentage reached *by any burn*, so working the top half and logging "fell at the crux"
  reported **90% on a climb never linked past halfway**. It is ground-up now, and the stat is
  labelled "From the ground" so the number says which question it answers. `bestLink` is the
  new one — the longest single stretch climbed in one go, which is the number that decides the
  send.
  **It predicts nothing**, and the card says so in as many words: *"The send is the join, and
  the app will not guess how close it is."* It appears only where it says something the
  ground-up number does not.
  **A copy fix the measurement turned up**: a projecting session rendered two controls called
  "High point" meaning different measurements. The session question is "The move you reached"
  now — the coach can overrule the wording.
  **Not touched, deliberately**: `projectHistory` (M69). Links are the state of one project;
  that module reports what projects *cost* per grade, and a link is not a cost.
  Twenty-two mutations, nineteen killed. **All three survivors were weak fixtures of mine**,
  not code: a day with only one ground-up burn could not test "keep the day's best", the
  longer link sat second so "keep the last" passed, and the field-label test ran on a session
  that renders no fields at all — vacuous, the M100 lesson again.
  **The browser found the trap for the third time this session.** `Input` sets `w-full`, so the
  `w-24` on the "From %" box was a coin flip on Tailwind's emit order rather than a width, and
  it rendered full-width on its own line. The fix is a sized wrapper, as `ExerciseNumbers`
  already does — and the guard for it **already existed**: `ui.test.ts`'s `OWNED` table, written
  for M30's padding bug, needed one row. Adding it found **two more instances** that had been
  shipping, in the builder and the session editor, one of them also carrying a second copy of
  the control's own border and background.
  Verified in both themes. 3,178 tests pass.

- **M103 — The injury as a series.** *Done.*
  **Premise, corrected.** The check-in asked about fingers and sleep and nothing else, so
  *how has it been?* had no answer in an app holding both the injury and every session
  around it. That much held. What did not: the milestone's own headline feature.
  **Refused: the co-occurrence.** *"Worse on 4 of the 5 days after a session that loaded
  the elbow; 1 of 9 otherwise"* is not built, and the module says why at length.
  **"Loaded the elbow" is a keyword scan** — `tissueLoad` says of itself that it is
  tolerable for a relative picture and *"not tolerable for a number with a unit"*, and a
  ratio is a number with a unit. **And two counts side by side are a causal claim however
  they are worded**: a climber reading "4 of 5 against 1 of 9" reads *hangboarding hurts my
  elbow*, on a sample of fourteen, from a scan that guesses which sessions loaded what.
  So the app reports what was answered, shows what was logged around the bad days, and the
  climber draws the line.
  **Built.** `CheckIn.parts?: Partial<Record<BodyPart, TissueFeel>>` — sparse, and
  `TissueFeel` is an *alias* of `FingerFeel` rather than a second vocabulary for the same
  three answers. `ASKED_BY_FINGERS = ['fingers', 'pulley']`, because a second chip row for
  a tissue the fingers question already covers is the same question twice.
  `tissueContribution` feeds `readinessFor`, so a sore part flags the lines that load it,
  names itself in the advice, and holds a test that would load it. `engine/injuryLog.ts`
  reads it back: the answered days, the counts, `describeInjuryHistory` (coverage first,
  `null` when nothing was answered), and `badDays` carrying *the day before* and *the day
  itself* separately — the check-in is taken before the session it sits on, so a flare
  during a session and a flare the morning after are different stories and the app says
  which rather than picking one.
  **Three things the browser found in my own card**, none of which a test had:
  **(1)** the day strip encoded the answer in colour alone — red/amber/green with the word
  only in a `title` no phone will ever show. The word is in the chip now.
  **(2)** the strip was unbounded: an injury logged in January and answered about all year
  is hundreds of chips. Capped at 14, with a line saying the counts above are all of them.
  **(3)** the caveat asserted *"the app has a fortnight of answers"* over a window bounded
  by `since`, which can be a year. Rewritten to something true.
  **And a fourth, measured.** The chips painted `text-warn` on `bg-warn/15` and came in at
  **3.72, 3.99 and 4.47** in light mode — three WCAG AA failures out of tokens every
  palette test passes, because `themes.test.ts` holds the status colours to **3:1**:
  *"graphics rather than text, so 3:1 is the bar."* Nothing held anyone to using them that
  way. Ordinary ink on the tint now measures 10.06–14.59 in both themes, and `ui.test.ts`
  has a new rule — a status colour is never text on a tint of itself — which was mutated
  against all three tokens and killed each time. The tint itself measures **1.06:1** in
  dark and 1.41:1 in light against the card it sits on: decoration, and the comment says
  so rather than claiming it reads at a glance.
  **Deleted.** `InjuryDay.did` — computed on every day, read by nobody but its own test.
  The strip shows a tone and a date; what was around a day is only worth naming on the days
  it was worse, where `badDays` carries it. With it went `injuryHistory`'s `nameOf`.
  **Not fixed, recorded.** `restChecklist !== undefined && climbs.length === 0` is written
  out inline in **ten** engine modules and exported twice more (`templates.isRestSession`,
  `sessionEdit.isRest`); `thinLog` already uses a *different* rule for the same question.
  `injuryLog` imports the existing helper rather than becoming a fourteenth copy. The
  extraction is its own milestone, not this one's to fold in.
  **Measured, not asserted.** 33 mutations over four rounds. The first battery of 29 left
  **seven survivors, every one a weak fixture of mine**: a "day before" and a "day itself"
  that both rendered as *Climbing session* so the two could be swapped unseen; a fixture
  with no unfinished session in it; a fine part that could have cost the day unnoticed; no
  test at all on a tender part, on the flag, or on a second answered injury; and a bad-day
  heading that never rendered over an empty list. Rounds two to four killed all of them.
  **Budget.** 216 → 216.2KB, measured: 215.71 before, 216.12 after, 0.41KB. Not 217 —
  that would hand the next milestone 0.88KB of free space, which is the headroom the same
  comment warns regressions hide in.
  Verified in both themes at 430px. 3,224 tests pass.

- **M104 — The coach rules the plan promised.** *Done. Size XS, not S–M — one rule.*
  **Premise, corrected before a line was written.** The milestone claimed the coach "has
  ten rules and none of the last three". It has **eleven**, and **two of the three ship
  already**, in richer form than proposed. `projectBurns` does project escalation at
  5/10/20/**40**, per project, escalating its own signature, with a body that changes on
  whether a high point is recorded, capped at two because "two loud projects at once is a
  to-do list". `missingDomains` does missing-domain observations with **five** domains,
  each gated on an `after` threshold so a gap is a pattern rather than a coincidence,
  capped at one because "a list of five things you are not doing reads as an indictment".
  **The third is not buildable as written.** A hangboard-gap warning on
  `daysSinceLoaded('fingers')` rests on `CLIMBING_PARTS`, which attributes fingers to
  *every* climbing session by definition — so "fingers untouched" means "you have not
  climbed at all", which `detraining` and `LAYOFF_DAYS` already say twice over. Rebuilt
  as the signal the data supports: **a prescribed session type you are skipping**, from
  M91's `adherence.TypeAdherence`. The review provably cannot say this — M91's whole
  premise is that it counts sessions against a weekly *number*, "which cannot tell four
  climbing sessions from four skipped Finger Protocols".
  **Three of the five are refused, two of them late.** A retest-owed nag duplicates
  `staleBenchmarks` and contradicts `blockEnd.ts`, which states the stance outright:
  *"The retest you owe is derived, not nagged."* That one was refused up front. The other
  two were **built, tested, mutated, rendered in a browser, and then deleted** — a PR
  reaction and a warmups-skipped card — because `review.ts` already says both, and
  `ReviewCard` leads with the review's note **on Home, directly above this board**. The
  screenshot that settled it shows *"0 of 18 Finger Protocol + Engine sessions"* four
  cards above *"First V7"*. Shipping the PR rule would have put *"V7 is a new best"*
  beside it on one screen. So §6.6's *PR reactions* does ship — in the review, which is
  the correction to my own correction: I had said the coach never sees
  `state.personalRecords`, which is true and was not the question.
  **The guard that should have caught it.** `coach.test.ts` had "has no id colliding with
  a weekly review note", which compares **ids** — and both new rules passed it while
  colliding on content. Replaced by a test that builds a log with a PR and skipped warmups
  in it and asserts no coach tip mentions either subject. Mutated by re-inserting both
  deleted rules: killed both times.
  **One rule shipped.** `skippedType`: the type furthest behind, named once, with a body
  that stops restating the headline — which the rendered card caught, not a test.
  **A lazy boundary that was buying nothing.** The rule costs 1.75KB of first load,
  because `HomePage` imported `useTips` from `CoachPage.tsx` — so `lazy(CoachPage)` in the
  router had been doing **nothing at all**, and the page's JSX, tone table and icons were
  in the entry chunk with it. Splitting the hook into `useTips.ts` gave **1.20KB** back.
  Budget 216.2 → 216.8, measured: 215.71 → 216.75, net 1.04KB.
  **Measured, not asserted.** 36 mutations over four rounds. Round one left four survivors
  and **three of them were no-op mutations I wrote badly** — the M91 and M100 mistake for
  the third time — so they were rewritten to change behaviour before they meant anything.
  The fourth was a real gap at the consolidation boundary, on a rule that no longer exists.
  Verified in both themes at 430px. 3,235 tests pass.

- **M105 — Bring your history.** *Done, import half. Export split out as M105b.*
  **Premise held, in the part that mattered.** There is no CSV anywhere in the codebase, in
  either direction, and onboarding really does tell a climber with five years in a
  spreadsheet that their altimeter starts at zero. Two details in the shape were wrong:
  `/data` is M80's data-*health* page, not where import lives — that is Settings, next to
  the backup import, where a climber looking for one will look for the other. And there is
  no `place` on a session: a location is `fields.location`, which is what `venues.ts`
  already reads, so an imported crag joins the venue grouping for free.
  **The finding the milestone was wrong about.** *"Grades go through `parseGrade`, so Font
  and French come in"* cannot work on a bare grade string. Measured:
  `6A → V3 and 5.10a`, `7c → V9 and 5.12c`, `8A → V11 and 5.13a`. **Every** Font grade
  collides with a French one — they share the number-plus-letter shape and `parseGrade`
  matches case-insensitively — so `7c` in a spreadsheet is either a V9 boulder or a 5.12c
  route and nothing in the cell says which. `V…` and `5.…` name their own scale and are
  read on sight; everything else takes the discipline from a column if the file has one and
  from one chip if it does not, and a file with neither has those rows refused **by name**
  rather than silently filed as boulders.
  **Built.** `engine/csv.ts` — RFC 4180 plus the three deviations every real export emits:
  a BOM, bare CR endings, and a semicolon or tab separator in locales where the comma is a
  decimal point. Caps that **refuse rather than truncate**, because half a file reporting
  success is worse than none — including an unterminated quote, which otherwise swallows
  every separator to the end of the file and comes back as one long cell that looks like
  data. `engine/importCsv.ts` — header guessing the climber confirms, dates in five
  spellings, and one session per day. `SpreadsheetImportCard` — the preview *is* the
  confirm step, so the numbers move as the mapping is corrected and a wrong guess is free.
  Refusals carry a line and a reason: "412 imported, 9 skipped" is a number nobody can act
  on. The whole snapshot → merge → undo path is M20's and M54's, reused unchanged.
  **Two correctness bugs my own tests caught.** `Date.parse` reads **the 30th of February
  as the 2nd of March** rather than refusing it — the same silent month-shift the
  day-first rule exists to prevent, arriving by another door. Numeric dates now go through
  explicit patterns only, and a written month has to come back on the day that was
  written. And an import is a **merge**: `${date}#0` would have overwritten a session the
  climber logged in the app on a day their spreadsheet also covers — data loss inside the
  one operation that promises not to lose any. Imported days take the first free index.
  **And one the browser caught, which is the third time for this trap.** The column mapper
  set `w-40` on a `Select`, lost the coin flip against `CONTROL`'s `w-full`, and rendered
  **six identical full-width dropdowns with every column name squeezed to nothing** — the
  mapping UI was unusable and every test passed. M102 added an `OWNED` row for this and
  named `Input`, the component that happened to have the bug; `Select` and `TextArea` share
  the same `CONTROL` string and were never checked. The guard now covers all three. It
  found this and nothing else, so no other instance was shipping.
  **Decided up front and kept.** Imported sessions arrive `rewarded: true` — they pay no
  XP, because five years cashed out at once is the level-100-on-day-one the audit cut — and
  they count for every stat, the career, the pyramid and the altimeter, because height is a
  fact about climbing and XP is pacing for a game.
  **Measured, not asserted.** 83 mutations over five rounds: 20 on the parser, 35 on the
  mapper, 28 on the card and the page. Six of the UI survivors came from **one** missing
  fixture — a log that already had something in it — which is also what left merge-versus-
  replace, the restore point and the undo card untested.
  **Budget.** 216.8 → 216.9KB, and the number worth noticing is **0.07KB**: a parser, a
  mapper and a preview card cost almost nothing on first load, because `SettingsPage` is
  lazy and nothing eager imports out of it. M104's one coach rule cost 1.75KB for exactly
  the opposite reason.
  Verified in both themes at 430px. 3,323 tests pass.

- **M105b — The same history, back out.** *Done.*
  **Premise held exactly.** `toCsv` and `csvCell` shipped in M105, tested and round-tripped,
  called by nothing. The archive was one JSON file: right for a restore, useless to a
  climber who wants their climbs in a spreadsheet.
  **Built.** Four CSVs inside M53's archive, under `spreadsheets/`: `climbs.csv` (one row
  per climb, and the one this app reads back), `sessions.csv` (the RPE, the duration, the
  warmup — everything a climb row has no column for), `attempts.csv`, `benchmarks.csv`.
  Written from the exported records rather than re-read from the database, so the two can
  never describe different moments. `backup.json` stays the statement of record and the
  restore has never heard of them.
  **Grades go out canonical, not as displayed** — the direct consequence of M105's finding.
  A climber reading in Font sees `7C` in the app and `V9` in the file, which looks like a
  translation error until you try the alternative: Font and French are written identically,
  so exporting the display spelling produces a file this app cannot read back without
  asking which discipline every row is. `V9` and `5.12c` say their own scale, so the round
  trip closes with no question asked.
  **Three bugs, two of which would have shipped.**
  **(1)** Session type ids are **not unique across the catalogue** — `fp` is Iron Grip's
  *Finger Protocol + Engine* and Trip Prep's *Finger Primer*. A map keyed on the type alone
  let whichever program was iterated last name every session carrying that id, so a real
  Iron Grip session exported as *Trip Prep, Finger Primer*. Keyed by program **and** type
  now, and an unknown program names neither rather than guessing.
  **(2)** The writers crashed on a record the app cannot walk — a session with no `climbs`
  array, which is what most of the export tests write and what a half-written backup
  produces. An export is the one operation whose failure costs the climber everything they
  were trying to protect, so a bad row now contributes no rows instead of taking the
  archive down with it. That means `listOf` and a `cell()` coercion: the types are not
  wrong about what a `Session` should be, they are wrong about what is on disk, which is
  what `dataHealth` exists for.
  **(3)** A `Style` column would have been mapped correctly on re-import **only by column
  order** — `style` is in `importCsv`'s *result* spellings, for logs where one column holds
  redpoint/flash, and `Result` happened to claim that meaning first. Renamed *Ascent style*,
  which the guesser passes over on purpose.
  **One place the shared helper cannot be used.** `sessionsCsv` spells out the rest-day rule
  rather than calling `isRestSession`, which reads `session.climbs.length` and throws on
  exactly the malformed record this file must survive. Recorded in the code so it does not
  read as a fourteenth copy by accident.
  **Verified end to end in a browser**, not only in tests: exported a real archive from the
  running app (quoting intact — `"Malham, Yorkshire"`, `"He said ""go"""`), unzipped it, and
  fed `climbs.csv` back into the app's own import screen. It read as **1 day, 3 climbs,
  nothing refused and no discipline asked**. The browser also caught the last cosmetic
  defect: *Indoor or outdoor* clipped to *"Indoor or outdoo"* in a 160px select.
  **Measured, not asserted.** 24 mutations. One survivor, and the same gap as M103's: no
  fixture had a rest checklist *and* climbs on one day.
  **Budget.** Unchanged at 216.9KB — 216.82 measured, the same as M105, because the export
  engine lands in the lazy settings chunk beside the importer.
  Verified in both themes at 430px. 3,353 tests pass.

- **M106 — Indoor and outdoor are two ladders, and the app draws one.** *Done, the comparison.
  Three extensions deferred with reasons.*
  **Premise held, and it is the one that mattered.** `progress.ts` mentions `mode` **zero**
  times. Eighteen engine modules read `session.mode` — the career page, the achievements, a
  challenge, the altimeter's outdoor multiplier, the trips — and not one of them puts best
  on plastic beside best on rock. The comparison every climber makes out loud, and the one
  Trip Prep exists to close, was computed nowhere.
  **Built.** `engine/ladders.ts`: two tallies per scale, split by the mode of the session
  each climb was logged on, with the distinct days each rests on. `describeLadders` states
  both bests, what each rests on, and the distance between them. The pyramid card on
  `/progress` gets the sentence and an Everything / Indoors / On rock toggle — which only
  appears once there is something on rock, because three buttons where two do the same
  thing is not a choice.
  **The "Never", held as a test.** No conversion — there is no exchange rate between a gym
  V6 and a Font 6C, and the whole point is that the ladders are separate. No verdict — some
  of the gap is a soft gym, some is rock being frightening, some is one outdoor day a year,
  and the log says which of those it is never. The sentence ends *"What that is about, the
  log cannot say."*, and a test asserts the rendered card contains none of
  `equivalent|worth|weak|soft|sandbag|should|problem`.
  **Coverage first, again.** "Two grades harder indoors" off four outdoor sends is a
  coincidence with a decimal point. Under `THIN_SENDS` on either side the reading refuses
  the gap and names the thin side with its count — `conversion.ts`'s house rule, which
  settled that a thin figure belongs in the sentence rather than hidden.
  **A de-duplication rather than a second copy.** `deriveClimberState` had the
  climb-into-tally logic inline, and a per-mode reading needed the same thing. Lifted out as
  `addClimb`, used by both — and it carried a trap worth recording: `addClimb` moves `best`,
  and the personal-record check reads `best` **before** the climb goes in. Getting that
  order wrong stops the app recording personal records at all, silently. The mutation for it
  is in the battery, and the existing suite killed it.
  **One defect found by writing the test rather than by reasoning.** The toggle only appears
  where there is rock *on the scale being drawn*, so switching from boulders to ropes could
  take the toggle away **while the choice was still in effect** — leaving the climber on an
  empty pyramid with no control on screen to get out of it. What is not offered is not
  applied. That also made one branch of the empty-state message unreachable, which is gone.
  **Deferred, with reasons rather than silently.**
  *"On rock" rows in personal records* — `state.personalRecords` is first-send-per-grade per
  scale, and a first on rock needs a first-send date per mode, which `ladders` does not
  track. It is a record list rather than a comparison, and the career page's `outdoor`
  category counts **days** outdoors rather than grades, so there is nothing to extend there
  either. Its own small milestone.
  *A best per venue* — `Venue` carries sessions, days, `outdoorDays`, projects and
  objectives, and no grade at all. Real, and a venues change rather than a ladders one.
  *Trip Prep's finder reason citing the gap* — M101 territory, and it needs a rule about
  when a gap is worth citing that this milestone deliberately does not have.
  **Measured, not asserted.** 25 mutations. One survivor, and it was **vacuous in my own
  test**: on a scale with nothing logged, applying a hidden choice and ignoring it produce
  the same empty card, so the fixture needed a second ladder with something on it.
  **Budget.** Unchanged at 216.9KB — 216.88 measured.
  Verified in both themes at 430px. 3,378 tests pass.

- **M107 — The drill library, browsable.** *Done, the page. The cues are M107b and they
  are yours to write.*
  **The premise is wrong in the way that decides the milestone.** M107 says *"a drill is a
  paragraph"* and rules **both or neither** — no page until cues and faults exist for all
  144. Read, the paragraphs are not stubs. *"Rule: once a foot is placed on a hold, it does
  NOT move until you step to the next hold. No readjusting, no pivoting, no 'just a nudge.'
  … If you catch yourself adjusting, downclimb and restart."* That is a method **and** a
  fault correction, already written, in `description`. What the library lacks is not words —
  it is **a way in and a mirror**, and both are code. So the page ships now and the cues
  land into a page that exists rather than into nothing.
  **Also 144, not 138**, and the escape hatch is not there: only **11** drills carry a
  `protocolId`, and all 11 point at the *same* protocol, so "cues come free from the
  protocols" would have covered 11 entries.
  **Built.** `/drills`, grouped by category — `GlossaryPage` settled that shape for a long
  reference list, and the first flat version ran to **nineteen thousand pixels** in a
  browser. `/drills/:id` with the method as instructions, what it needs, which programs
  prescribe it, and the protocol's cues for the 11 that are a named method.
  `engine/drillHistory.ts` is the part that existed nowhere: `drillId` and `drillDone` have
  been written since the beginning and are read by the challenges, the plateau diagnosis and
  the derived category counts — none of which ever says *"this came up six times and you did
  it twice."* Prescribed, not merely logged: a drill you were given and skipped is the
  interesting row.
  **A feature built and then removed on a measurement.** The page had an equipment filter,
  defaulting on, justified by a comment saying the library is *"mostly unavailable to
  someone with a wall and nothing else."* Counted: **all 144 drills list `wall`** and
  exactly **three** ask for anything more. The filter separated three entries out of 144 —
  and a climber who had not listed a wall would have opened the library to **zero drills**.
  The browser is what showed it: a subtitle reading "141 of 144" under a control built for a
  problem that does not exist.
  **Two pieces of unreachable code, found by mutation.** A `DrillRecord.rate` field read by
  nothing, and a `given === 0` branch inside `describeRecord` — a row exists only because a
  session carried the drill, so `given` is never zero and that case is the *absence* of the
  row. Both mutations changed nothing, which is how they were found.
  **Measured, not asserted.** 29 mutations. Three survivors: the two dead branches above,
  and one real gap — nothing tested that the "this keeps not happening" reading stays quiet
  for a climber who *has* done the drill.
  **Budget.** 216.9 → 217.1KB, measured 216.88 → 217.05, so 0.17KB. Both pages are lazy;
  what lands is two rows in the eager route table and two `lazy()` wrappers.
  Verified in both themes at 430px. 3,418 tests pass.

- **M107b — The coach's cues and faults.** *Proposed. Size L, and entirely content.*
  **Premise.** M107 settled that the descriptions already carry the method, so this is not
  rescue work — it is the next layer: `cues?: string[]` and `faults?: string[]` on `Drill`,
  the short imperatives a coach says at the wall and the shapes of going wrong, which no
  paragraph can carry without becoming an essay.
  **Shape.** The fields, a renderer on `/drills/:id` beside the protocol cues that already
  render there, and a content guard holding every drill in a *shipped program* to at least
  two cues.
  **Why it is not started.** The fields are worth nothing empty — an optional field nothing
  writes and nothing reads is the exact shape of code deleted twice in this session — so
  they land **with** the words, in one milestone, when the coach has written them. 144
  drills, and only Evan can write them.

- **M108 — Style on a climb.** *Done, the angle and the rope. The board is refused.*
  **Premise held on four of five claims.** `Climb` really was grade, scale, count, result,
  ascent style and a name; "breadth of grades and styles" in the Technique stat really does
  mean *ascent* styles; and `clipStyle` really is a **free-text** field asking "Onsight,
  flash, redpoint, toprope" — three of which `Climb.style` already stored structurally.
  **The fifth is wrong by a factor of four.** Board climbing is *"seventeen mentions in
  drill and program prose"*. Counted: **four** — one Kilter, one MoonBoard, one System
  Board, one Tension Board. The sixty other hits are `hangboard` and `fingerboard`. So
  `board` as an `Equipment` is **refused**: a new equipment value touches the warmup
  generator, the builder's picker, the settings card and every drill's equipment array, and
  it would be carrying four lines of prose.
  **Built.** `Climb.angle?` (slab / vertical / overhang / roof) and `Climb.ropeStyle?` (lead
  / top-rope), both optional and both absent by default — an absent angle is a climber who
  did not answer, never a vertical one. `engine/angles.ts` reads the shape, reusing the
  `addClimb` accumulator M106 extracted rather than writing a third copy of it. A card on
  `/progress` states coverage, then the two ends and the rungs between them.
  **The caveat, met on its own terms.** *"A test that the default path — grade, send —
  costs exactly the taps it costs today."* It does: one tap on Add, and a test asserts the
  stored climb carries no angle and no rope style. Angle and rope add **rows**, not taps —
  one row on boulders, two on ropes, and the rope row appears only on the rope scale because
  a boulder has no lead. Tapping a selected chip clears it, so *"I did not say"* is reachable
  after *"I did"* without a fifth chip that exists to mean nothing. The angle is sticky for
  the session, because a climber on a spray wall is on it for an hour. Both angle and rope
  style join the climb merge key, or two V5s on different walls become one row with whichever
  angle was tapped first.
  **And it never calls a gap a weakness.** Which end is the problem and which is just where
  this climber climbs is a judgement about a person; the angle nobody logs is as likely to
  be the one their gym does not have. The sentence says so, and a test holds the card free of
  `weak|avoid|should|work on|problem|worst` — which **caught my own first draft**, where the
  sentence read "whether that is a weakness or just where you climb".
  **`clipStyle` retired.** Removed from `outdoor_sport`, the one session type of the one
  program that asked it. The registry entry stays, deprecated, so answers already written
  keep a label — but nothing renders an input for it. The retirement only became honest with
  this milestone: before `ropeStyle` there was nowhere structured for *toprope* to go.
  **Deferred, with reasons.** A coach rule for the angle nobody climbs, and a weekly
  challenge that targets it. Both are real and both want data that does not exist yet — the
  question is new, so every log in the world currently answers it nowhere, and a rule that
  fires on four tagged climbs is the thing `ENOUGH` exists to prevent. Worth building once
  there is a season of tagged climbs to test against.
  **Measured, not asserted.** 31 mutations. Three survivors, all test gaps: nothing tested
  the coverage gate at exactly `ENOUGH`, nothing stopped an angle with no send from becoming
  one of the two ends, and nothing added two climbs differing only in rope style.
  **One thing the rendered card caught**: the body ended on the card's own title — "nothing
  about the walls you climb on" under a heading reading "The walls you climb on". It names
  the real confound now.
  **Budget.** 217.1 → 217.4KB, measured 217.05 → 217.37, so 0.32KB — the largest move since
  M104, and for the same reason: `LogPage` and `GymPage` are eagerly imported, so a chip row
  in the climb entry is first-load by construction.
  Verified in both themes at 430px. 3,450 tests pass.

- **M109 — A season, as a sequence of blocks.** *Proposed. Size L.*
  **Premise.** The pieces exist and do not join: `nextPrograms` with a written reason per
  destination (read on `/finish` since M85), `adapt` for fitting a block into fewer weeks
  (M56), the peaking shape (M73), an objective with a `targetDate`. A climber cannot lay
  out *Base Camp → Iron Grip → Trip Prep, ending on the trip* and see it; each block is
  chosen only when the last one runs out.
  **Shape.** On the objective, first: a sequence of program ids, start dates *derived*
  working back from the target, each block adapted where it does not fit, deloads read
  from each; the calendar draws future blocks as ghost weeks; `/finish` offers the next
  one as *next in your season*. Stored: the sequence. Derived: every date.
  **Never.** Place sessions beyond the active block, or mark a season missed. It is an
  intention, and the objective's own rule already says a season that did not go to plan
  is a season.

- **M110 — A demo climber, for the screenshots and the videos.** *Proposed. Size M.*
  **Premise.** §9.3 closed multi-profile with "better served by a sample-data mode".
  Nothing was built. M12 needs store screenshots, the coach makes content about the app,
  and every browser verification from M89 to M97 hand-rolled a fixture into IndexedDB
  through the console.
  **Shape.** Settings → *Load a demo climber*, offered only when the log is empty (or
  after an export the app has seen succeed); deterministic from a seed — a year of
  plausible sessions across two programs, three projects with burns, a trip, one injury
  with its checklist, a set of assessments; a banner on every page and one tap to wipe;
  export refuses to write it as a real backup. And a Playwright script that takes the
  Play listing's screenshot set in both themes at the sizes the store wants.
  **Risk.** Demo data in a real log. Two gates — the empty-log condition and a `demo` tag
  on every record the wipe can find — and a test that a real session written on top of it
  survives the wipe.

- **M111 — The app on the phone: shortcuts, share target, file handlers.** *Proposed.
  Size S–M. Not blocked on the name.*
  **Premise.** The manifest has display, orientation, categories and icons. No
  `shortcuts`, no `share_target`, no `file_handlers`. A TWA honours all three, and each is
  a thing the app already does with a front door missing: gym mode, the timer and today's
  log are each a navigation away from a cold launch; a photo shared from the gallery has nowhere to
  land although the media store is built for it; a program file (M7's `programFile.ts`,
  which exists so a coach can hand an athlete a block) opens in nothing.
  **Shape.** Shortcuts: *Log today*, *Gym mode*, *Timer*, *The Ascent*. Share target for
  images → pick the session or project it belongs to. File handlers for the backup JSON
  and the program file → the existing import previews. `launch_handler` set to focus the
  running instance rather than open a second one.
  **Caveat.** Every one of these is a manifest entry the pure web mostly ignores; the value
  is on the Play build, and the verification has to happen on a phone, not in Playwright.

- **M112 — The cooldown, from what today actually loaded.** *Proposed. Size M, half
  content.*
  **Premise.** The warmup generator is a four-stage funnel over 26 exercises and it is the
  best small thing in the app. There is no counterpart at the other end. "Cooldown",
  "prehab" and "antagonist" appear in ten programs' prose and in nothing that runs;
  tissue load can say *your fingers took every session this week* and then the sentence
  ends.
  **Shape.** A second funnel: filter by equipment, weight toward what *this session*
  loaded (tissue load, per session rather than per window), fold in the return-to-
  climbing steps for any active injury, fill to five minutes, run on the timer. Lands on
  the log page after Effort and in gym mode's rest screen. Content: a cooldown and prehab
  set the size of the warmup set, tagged with what each one *unloads*, written by the
  coach.
  **Never.** Claim it prevents anything. The copy says what it is: five minutes the
  program's own prose keeps asking for.

**Considered and left out, with the reason, so they are not re-proposed:**
- *Race a ghost on the Daily Wall* — already ships (`createGhost`, `tapeToRace`, M81).
- *Ascent wall themes as a currency sink* — the sink is four outfits and it is thin, but
  a cosmetic is worth less than any row above; revisit if the balance keeps piling up.
- *More grade systems* (Ewbank, UIAA, British) — table work, cheap, and no one has asked.
  Fold into whichever milestone touches `grades.ts` next.
- *Post-session debrief* — the notes field and M103's chips cover what it would ask.
- *A thin top of the pyramid* — "your hardest grade has one send under it, and three is
  what your own objectives call a level" is a genuine standing observation the review
  cannot make, and it came out of M104's refused PR rule. Left unbuilt because it needs a
  gate (the grade below consolidated, the top thin) or it fires for almost everyone almost
  always, and that gate is a milestone's worth of thinking, not a coda to this one.
- *Multi-device sync, notifications, wearables, localisation* — all need a server or a
  translator, and the plan's cut list stands.
