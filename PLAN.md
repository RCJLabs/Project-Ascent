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
- **M7 — Depth in the log.** The things a real training log needs that the first pass
  skipped: session templates (§5.2), calendar drag-to-move with live constraint
  validation (§5.3), editing a logged session's date and splitting or merging days,
  media on projects (the `media` store exists and has never been written to), and the
  custom program builder the content model was built for. *Done when: a season can be
  planned, re-planned and corrected without touching a text field twice.*
- **M8 — Injury depth.** §9.7 is half-built: warmups filter, the finder steers away,
  vitality takes a hit. Missing is everything that makes it a system — severity, side
  and status on an injury, drills and exercises flagged across *all* programs rather
  than just warmups, calendar annotation, bounties paused while the part is loaded,
  and a return-to-climbing checklist per body part. *Done when: marking a pulley
  changes what the app asks of you everywhere, not just in the warmup.*
- **M9 — Content.** The part only a coach can write. First: the hole the finder
  already exposes — there is no finger-strength program for a climber above V5
  without a campus board, so Iron Grip blocks and a V7 boulderer gets recommended
  maintenance. Then the glossary with inline term definitions, the app/injury/outdoor
  guides, and deeper phase notes on the existing eleven programs. *Done when: the
  finder has an honest answer for every equipment set.*
- **M10 — The long arc.** Twelve-week programs end; the reason to open the app in
  year three is not a program. Expedition-style sieges of named objectives (AUDIT.md
  §7 calls this the one cut system worth reconsidering — real sessions advancing a
  named climb was the old app's best long-arc hook), a season/year in review, and
  milestones that outlast the altimeter. *Done when: there is something to work
  toward that a single block cannot finish.*
- **M11 — Hardening.** Before anyone else's data is in it. `deriveXp` is superlinear
  and measured: 8ms at one year of logs, 42ms at five, 107ms at ten — and it runs on
  every session write, with `useSkills` depending on it. Also: a service-worker
  update prompt (an offline app can otherwise sit on a stale build indefinitely), a
  keyboard and screen-reader pass to match the 320px pass already done, virtualised
  lists for a decade-long journal, and import/export that handles media, partial
  imports and conflicts. *Done when: ten years of logs is indistinguishable from one.*
- **M12 — Ship.** TWA packaging + assetlinks, Play internal testing, store listing.

**Known limitations carried forward:** program metadata grade ranges
(`gradeRange.label`, e.g. "V5-V8") are authored strings and do not follow the Font
/French display preference — converting them means re-authoring the content as
structured ranges, which belongs with M9.
- **Post-launch candidates:** Font/French scales (if not in M6), coach mode,
  media-on-projects, trivia toy, expedition-style long-arc sieges of famous climbs
  (the one cut system worth reconsidering — real sessions advancing a named objective
  was the old app's best long-arc hook).
