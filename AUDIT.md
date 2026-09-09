# Project Ascent — Audit of the AI Studio Prototype (v8.8.887)

Reference audit of the original Google AI Studio build, as groundwork for a from-scratch,
fully-offline rebuild. The zip analyzed: 245 files, ~130,000 lines of TS/TSX, ~8 MB.

---

## 1. What the app is

**Stack:** Vite 6 + React 19 + TypeScript 5.8, Tailwind 4, `motion`, `lucide-react`,
`recharts`, `canvas-confetti`, `date-fns`, `html-to-image`. Express server (`server.ts`,
752 lines) run via `tsx` — serves the SPA and a Gemini AI proxy. Firebase (Auth +
Firestore + Analytics), Sentry. PWA with hand-written `sw.js` (runtime
stale-while-revalidate, deliberately no precache), TWA on Play as
`com.rcjlabs.projectascent`.

**Scale problems baked in:** `App.tsx` is 14,528 lines; `RpgDashboard.tsx` is 12,057.
Every system was wired into these two god components. 103 components, ~20.5k lines in
`src/lib`, ~12.7k in `src/data`.

**Identity:** three apps in one —
1. A serious climbing training tracker (programs, logging, assessments, analytics)
2. An RPG meta-layer that converts real training into XP/stats/avatar growth
3. A sprawl of 15+ standalone games (card battlers, roguelikes, idle tycoons, arcade
   minigames) that mostly don't touch real climbing at all

The rebuild keeps #1 and #2 and deletes nearly all of #3.

---

## 2. Training program system

### Catalog — 11 entries in `src/data/tracker.ts` (9 programs + 2 modes)

| id | Name | Grade | Weeks | Focus |
|---|---|---|---|---|
| `ground_zero` | Ground Zero | Pre-climbing | 12 | Body prep (str/mob) |
| `base_camp` | Base Camp | V0–V2 | 12 | Climbing foundations |
| `gravity_defied` | Gravity Defied | V2–V5 | 12 | Dynamic climbing |
| `lockdown` | Lockdown | V3–V5 | 12 | Static power |
| `iron_grip` | Iron Grip | V5–V8 | 12 | Finger strength (repeaters → max hangs → campus) |
| `peak_performance` | Peak Performance | V8–V11 | 12 | Advanced bouldering |
| `the_long_game` | The Long Game | 5.9–5.12 | 12 | Route endurance (ARC → engine → send) |
| `the_siege` | The Siege | 5.12d–5.13d | 12 | Advanced sport / projecting |
| `the_cruiser` | The Cruiser | All | 12 | Perpetual maintenance (deload week 4 of each block) |
| `general_training` | General Training | All | 52 | No-program mode |
| `outdoor_climbing` | Outdoor Climbing | All | 52 | Real-rock logging mode |

Each program: 3 phases, per-program session types (thematic names over stable ids like
`fp`/`tech`/`perf`/`end`), phase-keyed exercise blocks with full coaching prose, week-keyed
drills, prose frequency/ordering rules, per-program assessment metric sets (5–9 each), and
a data-driven progression graph (`nextProgramOptions` with human-readable reasons).

**The ~130 KB of coaching prose in tracker.ts is the actual product.** Every exercise
block explains *why* it exists per phase, with real dosage
("7/3 Repeaters: 7s/3s ×6 = 1 set, 3–5 sets at 60–70% max"). Carry the content wholesale;
replace the container.

### Drill library — `src/data/drills.ts`
108 drills with `{id, name, description, duration, focus, category, discipline, level,
equipment, sources}`. 10 categories (technique 27, recovery 17, performance 14,
strategy 11, assessment 10, endurance 8, power 6, finger-strength 5, power-endurance 5,
mental 5). **Problem:** it's a fork — tracker.ts still holds 144 inline drill copies and
programs never reference library ids. Two copies that drift.

### Choosing a program
- **ProgramFinder** — a 3-question quiz that is **dead code** (nothing ever routes to it)
  and buggy even if reached (`the_siege` unreachable; V3–V5 + "technique" goal lands on
  the maintenance program). Ignores injuries, equipment, availability.
- **Assess** — per-program assessment grid (phase columns × metric rows), sparklines,
  phase-gain deltas, full progression charts, auto-computed outdoor-days metric.
- **AiBuilder** — 11-question wizard → one giant Gemini prompt → full custom program
  JSON, validated and normalized. The prompt's constraint blocks are the hidden gold:
  canonical exercise vocabulary (~90 exact names so the glossary matcher hits), pinned
  protocol definitions (anti-hallucination for Max Hangs / Frenchies / ARCing etc.),
  discipline-consistency rules, injury constraints, and profile/history context.
- **CustomBuilder** — fully rule-based: fork a built-in or build from a palette of 11
  session types + the 108-drill picker. Zero network. Proof the builder concept works
  offline.
- **ProgramExtender** — AI adds a 4-week phase onto a finished program (dumps whole
  program JSON into the prompt — wasteful but the surgical merge logic is sound).
- **WeekTemplatePicker** — hand-tuned weekly layouts for built-ins + auto-derived
  layouts from any program's session types (custom/AI programs get scheduling for free).
- **WarmupGenerator** — rule-based: equipment filter → injury filter (excludes exercises
  loading injured body parts, graceful fallback) → novelty partition → fill to 5 min.
- **PlateauMatrix** — deterministic training-state diagnosis (grade ceiling, PR recency,
  readiness trend, debrief sentiment → 5 verdicts, recovery override first). Only the
  optional "7-day reset protocol" is AI.

### Completion / adherence
- Session completion rewards flow through one function (`applySessionCompletion`) —
  effort multiplier from RPE **with an ACWR safety brake** (no bonus when
  acute:chronic load > 1.3), drill-streak multiplier, outdoor 1.1×.
- Program completion = logged sessions in N distinct weeks (coverage, not progress —
  12 scattered weeks over a year "completes" a 12-week program).
- Two-stage ceremony: reflection modal (required feel + optional free text) before the
  celebration modal with next-program picker.
- Adherence chart buckets completed sessions into phase windows, first/last clamped to
  ±Infinity so backdated logs count.

---

## 3. Logging, progress, data model

### Sessions
`logs: Record<'YYYY-MM-DD', DayLog | DayLog[]>` — the object-or-array duality is
normalized defensively at 30+ call sites. DayLog carries: sessionType/plannedType,
programId, mode, completed, rewarded, rpe, duration (stored as string!), `sends` and
`attempts` as `Record<grade, count>`, `namedSends[]` (with ascentStyle
Send/Onsight/Flash/Redpoint/Attempt), location, outdoorConditions, drill/drillDone,
warmup, skillTags, debrief, deload, rest-day checklist booleans, projectsWorked, plus
**flat prefixed per-exercise keys** (`d-`, `s-`, `reps-`, `w-`, `t-`, `n-`,
`sets-` array for per-set capture) — an untyped grab-bag with `[key: string]: any`.

Grades: `V0–V17` and `5.4–5.15d` as display strings, ordinal by array index; per-ladder
PR partitioning; `gradeToBoulderDifficulty` normalizes YDS→V for reward scaling. No
French/Font.

Three logging paths converging on the same map: full Logger (4,114 lines), LiveSession
(buffer at `userProfile.activeSession`, survives reload, merges into logs then routes to
Logger so rewards fire once), and one-tap session templates. Calendar quick-complete
reuses the same reward pipeline.

### Progress (3,664 lines, ~28 memos)
Grade progression with linear-regression projection ("V6 in 8 weeks at current pace"),
ACWR history, RPE heatmap, monthly volume + volume-by-domain, adherence, attempts
pyramid with per-grade conversion %, conditions performance, partner network, drill
mastery, outdoor pyramid by ascent style, auto-detected outdoor projects & trips, streaks,
PR timeline, crag log, grade pyramid (clean self-contained component).

Two PR systems (grade PRs inline in Logger; strength PRs from per-set data in
`prDetection.ts`), two project systems (user-tracked `userProjects` with an idempotent
`appliedAt` reconciliation pattern — the cleanest code in the app — and log-derived
outdoor projects), goals with milestone regex-scraping, a solid injury tracker
(body parts incl. A2 pulley, side, severity, status lifecycle) that feeds warmup
filtering and AI prompts.

### Persistence — the key finding for going offline
Everything is **one ~95-key blob** written wholesale to (1) localStorage
(`Ascent-1441-<uid>`, immediate, synchronous, first) and (2) Firestore `users/{uid}`
(debounced 8 s). **localStorage already holds complete state; Firestore is effectively a
backup/multi-device channel.** Removing Firebase breaks nothing structural — only
social, and the auth-derived storage key.

The cost of that architecture, all of which vanishes offline:
- Nine coordinating refs guarding one save; ~90 hand-written hydration lines (fields have
  been silently dropped); anti-wipe gates; a console.error monkey-patch to detect
  Firestore quota exhaustion; a 1 MB hard cap that aborts saves; and **silent destructive
  log compaction** at 90 days (deletes notes, attempts, debriefs, per-set data,
  project attribution) purely to dodge the Firestore document limit.
- `loadFromLocalStorage` probes ~1,735 legacy keys with JSON.parse, from ~90 useState
  initializers, on every mount.
- Full JSON export/import already exists (Settings) with careful `'key' in data` checks.

---

## 4. Gamification inventory

### The core loop (the part that works)
- **XP/levels:** `level = floor(sqrt(points/100))`, 24 rank titles, GOAT at level 100
  (~3 years of dedicated climbing).
- **Documented economy rules** (`economy.ts`): real actions ≥ 2× RPG actions; session
  = 15% of a level; no RPG action > 7.5%; currency = XP × 0.25; daily-login capped at
  streak 5. `addPoints(..., {source: 'real'|'rpg'})` — real-climbing XP bypasses the gear
  multiplier stack so grinding gear can't beat climbing.
- **Five stats** (STR/END/TEC/MEN/AGI, base 10, cap 100) derived live from actual
  training history: max-hang/pull-up metrics → STR, sessions & sends → END, drills &
  grade variety → TEC, history length → MEN, flexibility → AGI. Breaking your weekly
  streak applies a −5 TEC "Rust" debuff.
- **Vitality (HP):** END scales 100→500 HP; 6 consecutive training days = −70; each
  skipped warmup −10; injuries −20 each; logging a rest day triggers a 24 h ×1.5
  recovery buff. The game literally punishes overtraining and rewards rest.
- **Avatar evolution:** 6 stages at levels 1/8/20/40/60/82 (Newcomer → Apprentice →
  Climber → Crusher → Sender → Legend), each an AI-generated pixel-art portrait varying
  location/pose/gear/build/emotional tone (street clothes in a gym lobby → summit,
  gear packed away). Level-driven only; equipped gear is not visible on the avatar.
- **Skill trees:** 5 trees × 26 nodes = 130 skills whose requirements are exclusively
  real: drill counts by name, sends by grade, consecutive weeks, goals, level. Nothing
  unlocks from minigames. Best log→character bridge in the app.
- **Session hook:** one function (`applySessionCompletion`) is the throat of the whole
  game; ~15 downstream systems re-derive from the raw `logs` object.

### Everything else (the sprawl)
22 menu tiles across 5 groups. Deep second-games: **Gym Tycoon + Franchise** (~9,200
lines: 19 facilities, staff, specializations, rival gyms, 5 acquirable locations),
**Pro Team** (~4,100 lines sports-management sim — already retired by its own changelog),
**three overlapping card games** (Crux Battler 243 cards / Crux Clash 28 cards /
Crux Campaign map layer), **The Headwall** (a full roguelike: 8 reflex pitch-minigames
with variants, 3-phase boss, boons, own meta-currency), **The Ascent** (turn-based
endless climb with genuinely well-tuned pump/altitude math), **The Approach** (seeded
hex-crawl with stamina/daylight clocks). Shallow filler: Trips (idle timers), Garage
(5 vehicles), Base Camp, Sponsors ("Influence" is literally just XP renamed), Circuit,
Free Solo arcade, Topout Trivia, Hazard QTE, Activities (fake training buttons that
grant the same stat buffs as real training — actively undermines the thesis).

**Six parallel task boards** (bounties, contracts, daily challenges, season pass,
quests, sponsor quotas), **five notions of "project"**, **four "climb a wall"
minigames**, **~10 stacking stat-buff sources**. Two standouts among the task boards:
**Bounties** generate from your real send distribution and complete purely from logs
(with an accepted-log-keys snapshot so you can't backfill), and **Daily Challenges**
have quality ladders (any warmup → warmup before session → warmup before RPE 7+
session).

**Expeditions** deserve special mention: multi-day phased sieges of real famous climbs
(The Mandala, The Nose, Silence...) resolved by d20 + stat-modifier checks, where **each
logged real session advances the expedition clock 12 hours**. The only long-arc system
where logging visibly moves a goal. Scenario text is AI-generated (needs a static
fallback offline).

Feature pacing: level gates at 2/4/6/10 (very front-loaded), avatar stages carry the
long arc, `hasEngaged()` migration escape hatch prevents re-locking.

---

## 5. Firebase / AI / social layer (what's being removed)

- **Auth is a hard gate** — signed-out users see only "SIGN IN TO START" (Google popup).
  Everything hangs off Firestore `users/{uid}` via onSnapshot.
- **Firestore collections:** users, publicProfiles, usernames, routes/routes_v2 (shared
  routesetting), challenges (friend challenges: first-to-grade / volume / assessment),
  coop_battles, feedback, reports. Friends/requests/blocked arrays + weekly friend XP
  leaderboard. A seeded bot account ("Climb McGee").
- **AI proxy:** client → Express `/api/ai/generate` with Firebase ID token; per-feature
  daily limits (coach/builder/extender/avatar 10, expedition 30, pet 10; Pro unlimited);
  Gemini model allowlist. Features: `coach` (Coach Billy banner, Coach Analyst, injury
  advice, plateau reset protocol, project coach), `builder` (AI program builder, Logger
  free-text auto-fill, goal roadmaps), `extender`, `avatar` + `pet` (image generation),
  `expedition` (scenario text).
- **Monetization:** Pro/Founder = 2× currency, unlimited AI, unlimited custom programs,
  season pass, exclusive pets/rings.

---

## 6. What to carry forward (the keep list)

**Content (highest value, zero code):**
1. All program content — 9 programs' phases, exercise blocks, coaching prose, dosages,
   frequency/ordering rules, assessment sets, progression graph, intros, phase
   descriptions.
2. The 108-drill library (make it the single source; programs reference drill ids).
3. The AI builder prompt's constraint blocks (canonical exercise vocabulary, pinned
   protocol definitions, discipline rules) — reusable as *validation rules and templates*
   even with no AI.
4. Glossary, guide content, Coach Billy's trigger taxonomy (as a rule-based tip engine).

**Design patterns:**
5. The economy constitution: real ≥ 2× game, session = 15% of a level, source-flagged
   XP, RPE effort multiplier **with the ACWR brake**, drill-streak multiplier, outdoor
   1.1×, onsight/flash bonuses.
6. Vitality/rest model (overtraining costs HP; rest day = recovery buff).
7. Five derived stats recomputed from log history (no stored stat to corrupt).
8. Avatar evolution stages tied to cumulative level.
9. Skill trees with real-training requirements only.
10. Bounties generated from the user's own send distribution + daily-challenge quality
    ladders (merged into one board).
11. Expedition session-acceleration (real session advances a long-arc goal).
12. `nextProgramOptions` progression graph; per-program `startDates` resume behavior;
    auto-derived weekly layouts; two-stage completion ceremony.
13. WarmupGenerator's injury filter + novelty partition; PlateauMatrix's deterministic
    diagnosis with recovery override.
14. The `appliedAt` idempotent reconciliation pattern for project attempts.
15. Date-keyed logs, grade-ladder representation, per-ladder PR partitioning.
16. Immediate-local-write-first persistence, `stableStringify` change detection,
    emergency save on visibilitychange/pagehide/beforeunload, JSON export/import with
    `'key' in data` discipline, `hasRealData` guard before any state replacement.
17. SW strategy: no precache, runtime SWR, network-first navigations (hard-won lesson).

## 7. What to cut

- Firebase entirely (auth, Firestore, Analytics), the Express server, Sentry (optional),
  the quota-detection console monkey-patch, all 9 sync-guard refs, log compaction.
- All social: friends, requests, blocks, leaderboard, challenges, public profiles,
  usernames, bot, report/feedback flows, shared routesetting publishing.
- All server-dependent AI: Coach Analyst chat, AI builder (replace with rule-based
  generator), extender, avatar/pet image generation (replace with layered local art),
  expedition scenario generation (static scenario pools), Logger auto-fill.
- Game sprawl: Gym Tycoon + Franchise, Pro Team, all three card games, The Headwall,
  Free Solo arcade, Circuit, Hazard QTE, Trivia (or keep reward-free), Trips + Garage +
  Base Camp, Sponsors, Contracts, Activities, Lost Logbooks, Companion idle hunts,
  Routesetting (fun but a different app), The Approach (or reduce to a visual layer on
  expeditions), Season Pass, Pro/Founder monetization.
- Dead/buggy: ProgramFinder (rebuild properly — it's the "which program should I
  choose" core of the new app), `mt_everest`/`goat_rank` stat mega-bonuses (+10/+100 all
  stats break the 0–100 scale).

## 8. Structural lessons for the rebuild

1. **No god components.** One derived-state selector (`deriveClimberState(logs, metrics,
   profile)`) all systems read; one reward pipeline (`applySessionCompletion`); systems
   never reach into `logs` directly.
2. **Type the program model.** Replace `Record<string, any>` and cryptic keys
   (`nm/sub/gr/wks/ph/as`) with real interfaces; structured exercises
   (`{name, sets, reps, load, rest}`) instead of prose blobs; stable metric ids instead
   of positional `${pid}-${phase}-${index}` assessment keys; drills by id reference;
   week-keyed drills only (kill the week-or-phase ambiguity).
3. **Always-array day logs.** Kill the object-or-array duality. Type the DayLog fully;
   derive `sends` from one attempts list instead of dual-writing namedSends + counts.
4. **One project system, one PR system, one task board.**
5. **Storage:** IndexedDB (or OPFS) with a small versioned schema + explicit migrations,
   split stores (logs / profile / programs / settings) instead of a 1 MB blob; export to
   file (and Play-friendly backup) instead of cloud sync. No compaction — offline has no
   1 MB limit.
6. **Structured rules, not prose:** model frequency/rest constraints ("48 h between
   finger sessions") as data so the scheduler can warn when a plan violates them.
7. **Rule-based replacements for AI:** the CustomBuilder + drill library + weekly-layout
   derivation + assessment data are already 80% of a deterministic program
   personalizer; a proper decision-tree finder (goals × grade × experience × days ×
   equipment × injuries) replaces both the dead quiz and the AI builder.
