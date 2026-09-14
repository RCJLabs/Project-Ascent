/**
 * Content schema (PLAN.md §3, §4).
 *
 * Everything a program says is data: phases, exercise blocks with real
 * dosage fields, scheduling rules as machine-readable constraints, drills
 * by reference, assessments by stable metric id. The old app's
 * `Record<string, any>` with keys like `nm`/`wks`/`ph` is the thing this
 * file exists to replace (AUDIT.md §8.2).
 *
 * Dosage fields are strings on purpose: real programming is full of ranges
 * ("3-5 sets", "8-10 reps"). They follow a documented shape so
 * `parseCount()` can turn them into numbers where the app needs one (set
 * rows to prefill, volume math). The win over the old model is that name,
 * dosage, and rationale are separate fields instead of one prose blob.
 */

import type { GradeScale } from '@/engine/grades';

// ── Identifiers ───────────────────────────────────────────────────────────

export type ProgramId = string;
export type PhaseId = string;
export type SessionTypeId = string;
export type DrillId = string;
export type MetricId = string;
export type ProtocolId = string;
export type TrackId = string;

/** Day of week, 0 = Sunday. Matches Date#getDay. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ── Metrics ───────────────────────────────────────────────────────────────

export type MetricKind = 'number' | 'text' | 'grade' | 'passfail';

export interface Metric {
  id: MetricId;
  label: string;
  /** Display unit, e.g. 'BW+lbs', 'sec', 'reps'. Empty for grades. */
  unit: string;
  kind: MetricKind;
  /** Which ladder a `grade` metric uses. */
  scale?: GradeScale;
  higherIsBetter: boolean;
  description?: string;
}

// ── Protocols (timer-able training methods) ───────────────────────────────

/** Interval structure the built-in timer drives (PLAN.md §5.4). Protocols
 *  without a fixed interval (campus laddering, projecting) omit it. */
export interface ProtocolTimer {
  workSec: number;
  restSec: number;
  /** Work/rest cycles inside one set. */
  repsPerSet: number;
  /** Default rest between sets; the prose may state a range. */
  setRestSec: number;
}

export interface Protocol {
  id: ProtocolId;
  name: string;
  description: string;
  timer?: ProtocolTimer;
  /** Prescribed grip, where the protocol demands one. */
  grip?: string;
  cues: string[];
  safety?: string[];
}

// ── Drills ────────────────────────────────────────────────────────────────

export type DrillCategory =
  | 'technique'
  | 'power'
  | 'finger-strength'
  | 'endurance'
  | 'power-endurance'
  | 'performance'
  | 'strategy'
  | 'mental'
  | 'recovery'
  | 'assessment';

export type Discipline = 'boulder' | 'sport' | 'both';
/**
 * What a climber has to train with.
 *
 * `weight` is separate from `gym` because loading a hangboard with a
 * backpack is not the same as having a weights room, and treating them as
 * one blocked every max-hang program for anyone without a barbell
 * (PLAN.md M36).
 */
export type Equipment = 'none' | 'wall' | 'hangboard' | 'campus' | 'gym' | 'weight';

/**
 * The load rules a drill's own text matches (PLAN.md M137).
 *
 * The paragraph that describes a drill lives in `content/drillText.ts`, out
 * of the entry chunk, and the injury engine used to read it — for 67 of the
 * 156 drills the description was the only place the words it looks for
 * appeared. So what the text says about load is derived from it once, held
 * here as data, and pinned to the text by a test: edit a description and
 * the test says which drill's `loads` no longer agrees with it.
 */
export type DrillLoad =
  | 'campus'
  | 'one-arm'
  | 'fingers'
  | 'lever'
  | 'pull'
  | 'dynamic'
  | 'sustained'
  | 'open-hand'
  | 'shoulder'
  | 'forearm'
  | 'hook'
  | 'hip'
  | 'legs'
  | 'core';

export interface Drill {
  id: DrillId;
  name: string;
  /** Prose duration, e.g. '45-60 min'. */
  duration: string;
  /** One-line "what this trains", e.g. 'Crimp Strength Application'. */
  focus: string;
  /** What the drill's text says it loads — see `DrillLoad`. */
  loads: DrillLoad[];
  /** Links to a Protocol when the drill *is* a named method, so the logger
   *  can open its timer and cues (an ARC drill is the ARC protocol, timed). */
  protocolId?: ProtocolId;
  /**
   * Week-specific timing that overrides the protocol's canonical defaults.
   * A protocol defines the method once; a program progresses its dose —
   * ARC runs 2x10 in week 1 and 2x20 by week 3, and the timer has to
   * follow the week, not the definition.
   */
  timerOverride?: Partial<ProtocolTimer> & { sets?: number };
  category: DrillCategory;
  discipline: Discipline;
  /** Grade band the drill suits, e.g. 'V5-V8'. */
  level: string;
  equipment: Equipment[];
  /** Programs this drill came from — provenance, and a filter for the
   *  custom builder's suggestions. */
  sources: ProgramId[];
}

// ── Exercises and blocks ──────────────────────────────────────────────────

export interface Exercise {
  name: string;
  /** Links to a Protocol so the logger can open its timer. */
  protocolId?: ProtocolId;
  /** Which of the program's tracks this line belongs to. A climber picks a
   *  track once and only sees its lines. The prototype encoded this as a
   *  'Trk A:' prefix inside the exercise name. */
  track?: TrackId;
  /** '3' or '3-5'. */
  sets?: string;
  /** '8-10', '12 per arm', '1-2-3-4-5 matched'. */
  reps?: string;
  /** Isometric hold: '45s', '5-7s per arm'. */
  hold?: string;
  /** '60-70% max added weight', 'BW+15lb'. */
  load?: string;
  /** Rest between sets: '2-3 min'. */
  rest?: string;
  /** Form cue or caveat — never dosage. */
  notes?: string;
}

/**
 * Marks the exercise list as a *menu* rather than a prescription: choose
 * `pick` of them for this session. The prototype rendered every option as
 * if all were prescribed, with the real instruction ("pick 5", "pick ONE
 * focus and drill it") buried in the coaching prose.
 */
export interface SelectionRule {
  pick: number;
  /** How to choose, when it matters — e.g. 'Rotate the focus across sessions.' */
  note?: string;
}

/**
 * Timed-round structure, for blocks run as a circuit rather than straight
 * sets. Independent of `selection`: a block can be a menu you pick from
 * *and* a circuit you run in rounds, or either one alone.
 */
export interface CircuitFormat {
  rounds: string;
  /** Work time per exercise, when they share one. */
  work?: string;
  /** Rest between exercises within a round. */
  restBetween?: string;
  /** Rest between rounds. */
  restBetweenRounds?: string;
}

/** The dose fields, and only those — what a week is allowed to move. */
export type Dose = Partial<Pick<Exercise, 'sets' | 'reps' | 'hold' | 'load' | 'rest'>>;

/**
 * What one week inside a phase asks that the week before it did not
 * (PLAN.md M127).
 *
 * Progression was quantised to the phase: `perPhase` was the only dose the
 * model had, so a climber saw byte-identical sets, reps, hold and load for
 * four weeks running. The catalogue knew and worked around it in prose the
 * app could not read — Iron Grip's Hammer phase lists *"Progress added load
 * weekly"* as a goal beside a static `load`, and The Siege's rationale says
 * to add 2-5lb a week when the last set felt solid.
 *
 * Both halves are here on purpose. `dose` is the part the app can place: a
 * number that changes, written by the author. `step` is the part it cannot
 * — "add 2.5kg if last week's top set felt solid" depends on a climber the
 * content has never met — so it is said in a line rather than faked as a
 * figure. A step with no `dose` is still progression; a `dose` with no
 * `step` is a number with no reason, which is why `step` is required.
 */
export interface WeekStep {
  /** Week within the phase, 1-based: week 1 is the phase's first week. */
  week: number;
  /** What this week asks that the last one did not, in a line. */
  step: string;
  /** Dose changes, by exercise name. Anything unnamed keeps the phase's. */
  dose?: Record<string, Dose>;
}

export interface PhasePrescription {
  rationale: string;
  exercises: Exercise[];
  selection?: SelectionRule;
  circuit?: CircuitFormat;
  /** This block is folded into another block for this phase (e.g. Pull
   *  supersetted into Push). Exercises may be empty when set. */
  mergedInto?: string;
  /**
   * How the dose moves week by week inside this phase (PLAN.md M127).
   *
   * Sparse on purpose: a phase's first week is the `exercises` above, and
   * only the weeks that change need a row. Absent means the phase runs one
   * dose for its whole length, which is what every block did before this
   * and what most still do.
   */
  perWeek?: WeekStep[];
}

/** One exercise block (the old `cats`), with its own prescription and
 *  coaching rationale per phase. */
export interface ExerciseBlock {
  id: string;
  name: string;
  perPhase: Record<PhaseId, PhasePrescription>;
  /**
   * Why this block prescribes the same sets, reps, holds and load in every
   * phase — required when it does, and rejected when it doesn't (PLAN.md
   * M33).
   *
   * Twelve of fifty-two blocks ran an identical dose for twelve weeks while
   * their own rationales said things like "add a SET — not weight", advice
   * that never reached the dose fields. Most of those were real stalls and
   * were fixed. The ones that remain are menus whose progression is genuine
   * but lives in intensity, grade choice and session length — dimensions
   * this model has no field for — so the block has to say so out loud
   * rather than reading as an oversight.
   */
  constantDose?: string;
}

// ── Session types ─────────────────────────────────────────────────────────

/** Extra logger inputs a session type asks for. */
export type FieldId =
  | 'hardestGradeAttempted'
  | 'hardestGradeSent'
  | 'sessionVolume'
  | 'routesCompleted'
  | 'pitches'
  | 'attemptsToday'
  | 'highPoint'
  | 'projectName'
  | 'routeName'
  | 'pumpLevel'
  | 'location'
  | 'sessionNumber'
  | 'clipStyle'
  | 'waterDepth'
  | 'gearNotes'
  | 'sessionDuration';

/**
 * How hard a day is, as a property of the session rather than of the dose
 * (PLAN.md M131).
 *
 * Four levels, defined by what a climber can do the day after:
 *
 * - **max** — limit work. Projecting, max hangs, the hardest boulders you
 *   can pull on. Not two days running, and the thing a week is built around.
 * - **hard** — demanding and repeatable. Power-endurance, heavy pulling,
 *   fingerboard protocols. Needs a day, not a week.
 * - **moderate** — real training that does not dig a hole. Volume climbing,
 *   technique, general strength.
 * - **easy** — active recovery. Mobility, armor on its own, easy volume
 *   three grades down.
 *
 * It sits on the session type and not on the exercise on purpose. Per-line
 * RPE is a fourth dose field and 159 of them to author, and the question the
 * scheduler actually asks — *can these two days sit next to each other* — is
 * a question about the day. The programs answered it in prose already: The
 * Siege's own constraint note reads "never two hard climbing days back to
 * back", which nothing could check until the word `hard` meant something.
 */
export type Intensity = 'max' | 'hard' | 'moderate' | 'easy';

/** Easiest first, so "at or above hard" is a comparison rather than a set. */
export const INTENSITY_ORDER: readonly Intensity[] = ['easy', 'moderate', 'hard', 'max'];

/** How the four read on screen. */
export const INTENSITY_LABEL: Record<Intensity, string> = {
  max: 'Limit day',
  hard: 'Hard day',
  moderate: 'Moderate day',
  easy: 'Easy day',
};

/** True when `a` is as demanding as `b`, or more so. */
export function atLeastAsHard(a: Intensity, b: Intensity): boolean {
  return INTENSITY_ORDER.indexOf(a) >= INTENSITY_ORDER.indexOf(b);
}

export interface SessionType {
  id: SessionTypeId;
  /** Program-specific thematic name, e.g. 'Finger Protocol + Engine'. */
  name: string;
  icon: string;
  description: string;
  /** Strength-style prescription, phase by phase. */
  blocks?: ExerciseBlock[];
  /** Week number (1..weeks) → drill reference. Week-keyed only: the old
   *  model let the same field hold week OR phase keys (AUDIT.md §8.2). */
  drillsByWeek?: Record<number, DrillId>;
  fields?: FieldId[];
  /**
   * How long this session takes, in the author's words — '60-90 min'
   * (PLAN.md M138).
   *
   * **Only where the dose cannot say.** `sessionLength.ts` reads the length
   * off the prescription, which is why a deload week is genuinely shorter
   * and a week with its own step is as long as that step asks. An authored
   * number cannot do either, so it is allowed only on the session types the
   * prescription cannot state a length for — the climbing days, whose length
   * is a coaching decision rather than a consequence of sets and reps, and
   * which do not shorten on a deload week anyway (the intensity does).
   * `content/validate.ts` enforces both halves: every working session type
   * in a shipped program says how long it takes, and none says it twice.
   *
   * The whole session, including anything the blocks also prescribe: a
   * limit day is ninety minutes *with* the core circuit at the end of it,
   * not ninety plus three.
   */
  duration?: string;
  /** Marks the rest/recovery type so the scheduler and reward pipeline can
   *  find it without string-matching an id. */
  isRest?: boolean;
  /**
   * How hard this day is (PLAN.md M131). Rest types may leave it out — a
   * rest day is `easy` by definition — and every other type in the shipped
   * catalogue declares one, which `validateProgram` enforces.
   */
  intensity?: Intensity;
  /**
   * Which sessions survive a short week (PLAN.md M55). Lower is kept first.
   *
   * A climber with two days and a four-session program is going to drop two
   * of them, and which two is a coaching judgement — the session that carries
   * the block stays, the accessory goes. Unset types sort after every
   * authored one, in the order the program declares them, so a program that
   * has not been tuned behaves exactly as it did before.
   */
  priority?: number;
}

// ── Phases ────────────────────────────────────────────────────────────────

export interface Phase {
  id: PhaseId;
  name: string;
  /** Inclusive week bounds. Phases must tile 1..weeks with no gap or overlap. */
  weekStart: number;
  weekEnd: number;
  description: string;
  goals: string[];
}

// ── Constraints (scheduling rules as data) ────────────────────────────────

/**
 * The old app kept these as prose only, so nothing could warn you when a
 * plan violated them (AUDIT.md §8.13). Every constraint carries a `note`
 * for display, so the UI never has to synthesize English from a union.
 */
export type Constraint =
  | { kind: 'sessions-per-week'; min: number; max: number; note: string }
  | { kind: 'min-gap-hours'; between: SessionTypeId[]; hours: number; note: string }
  | { kind: 'max-per-week'; sessionTypeId: SessionTypeId; count: number; note: string }
  /** `first` should be scheduled earlier in the week than `then`. */
  | { kind: 'order-in-week'; first: SessionTypeId; then: SessionTypeId; note: string }
  /** `sessionTypeId` must not fall on the day immediately before `before`. */
  | { kind: 'not-day-before'; sessionTypeId: SessionTypeId; before: SessionTypeId; note: string }
  /**
   * No two sessions at or above this intensity on consecutive days
   * (PLAN.md M131).
   *
   * Expressible only since session types carry an intensity. Before that a
   * program wanting this had to enumerate the pairs — The Siege spelled out
   * a 48-hour gap between Project and Power-Endurance and wrote the general
   * rule in the note, where nothing could read it, and a fourth hard type
   * added later would have slipped straight through.
   */
  | { kind: 'no-back-to-back'; intensity: Intensity; note: string };

// ── Weekly layout ─────────────────────────────────────────────────────────

export interface WeeklyLayout {
  name: string;
  description: string;
  /** Day of week → session type. Unlisted days are rest. */
  slots: Partial<Record<DayOfWeek, SessionTypeId>>;
}

// ── Program ───────────────────────────────────────────────────────────────

/** Catalog grouping, ported from the old ProgramsView taxonomy. */
export type ProgramStage = 'start' | 'foundations' | 'style' | 'advanced' | 'ongoing';

export interface ProgramIntro {
  pitch: string;
  rhythm: string[];
  graduation: string;
}

/**
 * A parallel difficulty path through the same program — bodyweight versus
 * loaded, say. The climber picks one at the start and keeps it for the
 * whole program.
 */
export interface Track {
  id: TrackId;
  name: string;
  description: string;
}

export interface Program {
  id: ProgramId;
  name: string;
  subtitle: string;
  /** Who wrote it. Shipped programs leave this unset; a shared one carries
   *  its author's name so a program handed to an athlete says whose it is. */
  author?: string;
  /**
   * 'program' is a structured, periodized block with a finish line.
   * 'mode' is open-ended logging — no progression to complete, no
   * adherence to measure, and not something the finder should recommend
   * as training. The prototype modelled both as 52-week programs with one
   * phase, which made every completion and adherence calculation lie.
   */
  kind: 'program' | 'mode';
  stage: ProgramStage;
  discipline: Discipline;
  /**
   * Who the program is written for.
   *
   * `label` is an **override**, not the label (PLAN.md M47). It used to be
   * the only thing anything displayed, and being authored prose it could not
   * follow the climber's Font/French preference — so someone reading their
   * own climbing in Font still met "Base Camp V0-V2" in the catalogue.
   * `displayRange` derives the words from `min` and `max` now, and this is
   * for the ranges where the ladder is not the point: "All Levels" is not
   * V0-V17, and Ground Zero's "Pre-Climbing" is not V0.
   */
  gradeRange: { scale: GradeScale; min: string; max: string; label?: string };
  weeks: number;
  /**
   * What the program cannot run without. The finder rules out a program
   * whose required kit a climber does not have.
   *
   * Keep this to what is load-bearing. Seven of nine programs used to
   * require `gym` for between one and eight prescriptions out of thirty to
   * a hundred and thirty — several of which already wrote their own
   * bodyweight alternative — and the result was that a climbing wall and a
   * hangboard, together, unlocked nothing at all (PLAN.md M36).
   */
  equipment: Equipment[];
  /**
   * Kit that extends the program without gating it.
   *
   * Never blocks. The finder names what it would add so a climber can see
   * what they are missing rather than being silently turned away, and a
   * program that runs bodyweight says so instead of demanding a barbell for
   * one accessory lift.
   */
  helpfulEquipment?: Equipment[];
  intro: ProgramIntro;
  phases: Phase[];
  /** Parallel difficulty paths. Exercises tagged with a `track` are shown
   *  only when that track is selected. */
  tracks?: Track[];
  sessionTypes: SessionType[];
  constraints: Constraint[];
  /**
   * Weeks that are deliberate deloads. Enumerated rather than expressed as
   * a period: real programs place them where the athlete needs them, not on
   * a fixed cycle (Peak Performance runs one at week 4, another at 8, and a
   * second taper at 9 because tendons adapt slower than muscle).
   *
   * Sessions in these weeks are **not** excluded from training-load math —
   * a lighter week is genuinely lighter, and `derive.ts` uses the flag to
   * explain the dip rather than to hide it. (The prototype excluded them,
   * which is what made a planned deload read as detraining.) What the flag
   * actually drives: the calendar marks the week, the logger stamps
   * `deload: true` on the session, the training-state card can say the dip
   * was the plan — and since M128 **the prescription itself is lighter**.
   * A set comes off each block that has one to give, reps, hold and load
   * are left alone, and a block that wants something else says so with
   * `perWeek`, which wins. Before that the flag was a label: a deload week
   * was byte-identical to the week before it, and the app printed "Deload
   * week" over the same five sets of maximal hangs.
   */
  deloadWeeks?: number[];
  /**
   * Set when this is a shipped program running over a different number of
   * weeks than it was written for (PLAN.md M56) — the written length, so
   * every screen showing the program can say what it is looking at. Never
   * authored, never read from a program file: it is put there by
   * `adaptProgram` and by nothing else.
   */
  adaptedFrom?: number;
  recommendedLayout?: WeeklyLayout;
  assessments: MetricId[];
  /** Progression graph: which programs follow, and why (AUDIT.md §6.12). */
  nextPrograms: { id: ProgramId; reason: string }[];
  /** Entry requirements, checkable against the user's own data instead of
   *  living in prose the app can't read. */
  prerequisites?: {
    note: string;
    metrics?: { metricId: MetricId; atLeast: number }[];
    /**
     * Whether falling short removes the program from the pick, or only
     * warns. Defaults to blocking. Read the program's own words: a floor
     * it calls a safety limit ("hangboarding below that loads tendons
     * that have not had a year of climbing to adapt") blocks; one it calls
     * an assumption ("assumes that base is already there") warns, because
     * a 25-second dead hang against a 30-second standard is a reason to be
     * careful, not a reason the app refuses to show you a program.
     */
    soft?: boolean;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Lowest number in a dosage string: '3' → 3, '3-5' → 3, '12 per arm' → 12.
 *  Returns null when there is no leading count (e.g. '1-2-3-4-5 matched'
 *  is a ladder pattern, not a count). */
export function parseCount(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+)(?:\s*[-–]\s*(\d+))?/.exec(value.trim());
  if (!match?.[1]) return null;
  return Number(match[1]);
}

export function phaseForWeek(program: Program, week: number): Phase | undefined {
  return program.phases.find((p) => week >= p.weekStart && week <= p.weekEnd);
}
