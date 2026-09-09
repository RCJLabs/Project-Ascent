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
export type Equipment = 'none' | 'wall' | 'hangboard' | 'campus' | 'gym';

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
  gradeRange: { scale: GradeScale; min: string; max: string; label: string };
  weeks: number;
  /** What the program needs to run. The finder uses this to rule out
   *  programs a climber has no way to train. */
  equipment: Equipment[];
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
   * Sessions in these weeks are excluded from training-load math, so a
   * planned deload never reads as detraining.
   */
  deloadWeeks?: number[];
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
