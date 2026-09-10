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

export interface Drill {
  id: DrillId;
  name: string;
  description: string;
  /** Prose duration, e.g. '45-60 min'. */
  duration: string;
  /** One-line "what this trains", e.g. 'Crimp Strength Application'. */
  focus: string;
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

export interface PhasePrescription {
  rationale: string;
  exercises: Exercise[];
  selection?: SelectionRule;
  circuit?: CircuitFormat;
  /** This block is folded into another block for this phase (e.g. Pull
   *  supersetted into Push). Exercises may be empty when set. */
  mergedInto?: string;
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
  /** Marks the rest/recovery type so the scheduler and reward pipeline can
   *  find it without string-matching an id. */
  isRest?: boolean;
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
  | { kind: 'not-day-before'; sessionTypeId: SessionTypeId; before: SessionTypeId; note: string };

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
  /** Real rock rather than plastic. */
  outdoor?: boolean;
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
   * `deload: true` on the session, and the training-state card can say the
   * dip was the plan.
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
  /** Human-readable scheduling prose, kept verbatim alongside `constraints`. */
  frequency: string;
  ordering: string;
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
