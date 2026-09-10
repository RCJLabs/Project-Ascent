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
3. **Multi-profile/coach mode**: in or out (decide before schema freeze).
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

- **M33 — Periodisation that is more than prose.** The Long Game prescribes
  *identical* strength work in weeks 1–8: Pull, Push, Core and Armor all carry the
  same sets, reps and load in phase 1 and phase 2. Only the rationales differ, so a
  climber entering "The Engine" does exactly what they did in "The Base". Audit every
  program for a phase boundary that changes nothing, and make the progression real.

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

- **M35 — Entry standards as data.** Six programs print an entry-requirements table
  the app cannot check. `Program.prerequisites` exists so a standard is "checkable
  against the user's own data instead of living in prose the app can't read"; for
  Ground Zero, Base Camp, Gravity Defied, Iron Grip, The Long Game and The Cruiser it
  is exactly that prose.

- **M36 — The climber with a wall and nothing else.** Nine of nine programs blocked:
  every structured program needs a weights gym or a hangboard. A wall is the one thing
  every climber has, and the app's answer to them is open logging.

- **M37 — Optional equipment.** The Cruiser has an optional hangboard module and no
  way to say so: declaring `hangboard` wrongly excludes climbers without one, not
  declaring it makes the module invisible to the finder.

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

- **M39 — The finger-strength hole (M9, carried).** With a hangboard and no campus
  board, Iron Grip is blocked from V6 up and the fallback is maintenance again.

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

- **M41 — One shape for a missing record.** Four "not found" routes behave three
  ways: `/projects/<gone>` and `/assessments/<gone>` say so with **no `h1`**, while
  `/objectives/<gone>` and `/guides/<gone>` silently render the index instead.

- **M42 — Validate route parameters.** `/log/<malformed>` renders a page whose
  heading is literally "Invalid Date".

- **M12 — Ship.** TWA packaging + assetlinks, Play internal testing, store listing.
  Last, after M13–M22.

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
