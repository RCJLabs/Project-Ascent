/**
 * Turns an active program plus a committed weekly plan into concrete days.
 *
 * Everything the calendar and logger need about "what am I supposed to do
 * on this date" is derived here, in one place, from data — never stored, so
 * editing a plan or a start date immediately re-derives the future without
 * migrating anything.
 */

import { getDrill } from '@/content/drills';
import {
  phaseForWeek,
  type Dose,
  type Drill,
  type Exercise,
  type Phase,
  type PhasePrescription,
  type Program,
  type SessionType,
} from '@/content/types';
import { testWeeks, type TestReason } from './assessments';
import { blockSpan, dayOfWeek, daysBetween, programWeek } from './dates';
import { effectivePlan, type WeekOverrides } from './reschedule';
import type { WeekPlan } from './scheduler';

export interface PlannedDay {
  date: string;
  /** 1-based program week, or null if the date precedes the start. */
  week: number | null;
  phase?: Phase;
  sessionType?: SessionType;
  drill?: Drill;
  isDeload: boolean;
  /**
   * Set when this week is one the program expects a test in, and why
   * (PLAN.md M67). A week-level fact, like `isDeload`, so every screen that
   * already reads a day gets it without being told.
   */
  test?: TestReason;
  /** The plan puts nothing here, or puts a rest session here. */
  isRest: boolean;
  /**
   * The block has finished and this day is past its last (PLAN.md M85).
   *
   * A week-level fact like the others, for the same reason: six screens
   * read a planned day, and before this every one of them was being told
   * that a twelve-week block a year in the past was still on week twelve.
   * `week` is null here *and* before the start date, so a screen that needs
   * to tell those apart reads this.
   */
  over?: boolean;
  /**
   * The block has not begun, and this is the day it does (PLAN.md M259).
   *
   * `over`'s mirror, and here for the reason `over` is: `week` is null on
   * both sides of a block and both set `isRest`, so without a name for
   * this one the days between pressing Start and the first Sunday read as
   * *“Rest day. Recovery is training — log it to bank it.”* That was
   * unreachable while a start snapped backwards — the week you pressed
   * Start in was always week one — and starting on a Thursday now puts a
   * climber here for three days.
   *
   * The date rather than a flag, because every screen that has something
   * to say about the gap has to name its end, and a flag without the date
   * beside it is a second field to keep in step.
   */
  startsOn?: string;
}

/**
 * The block's own window: week one's Sunday to the last day of its last week.
 *
 * One place, because three modules were each doing this arithmetic —
 * `calendar.lastDayOf` (which exists precisely because `programWeek`
 * clamps), `blockReport`, and this file. The Sunday matters, and which
 * Sunday matters more: `blockStart` is the first **whole** week, so a
 * Thursday start means week one begins on the Sunday *after* it and the
 * days between belong to no week at all (PLAN.md M259).
 */
export function blockWindow(program: Program, startDate: string): { from: string; to: string } {
  return blockSpan(startDate, program.weeks);
}

export type BlockState = 'before' | 'running' | 'ended';

export interface BlockStatus {
  state: BlockState;
  from: string;
  to: string;
  /** Days since the block's last day. Zero or negative while it runs. */
  daysSince: number;
}

/**
 * Where the climber is in the block.
 *
 * `programWeek` cannot answer this: it clamps, so a date a year past a
 * twelve-week block still reports week twelve, and every screen that asked
 * it was repeating the last week forever — sessions, phase, and the "final
 * test week" banner alike.
 */
export function blockStatus(program: Program, startDate: string, today: string): BlockStatus {
  const { from, to } = blockWindow(program, startDate);
  return {
    state: today < from ? 'before' : today > to ? 'ended' : 'running',
    from,
    to,
    daysSince: daysBetween(to, today),
  };
}

export function plannedDay(
  program: Program,
  startDate: string,
  plan: WeekPlan,
  date: string,
  /** Per-week exceptions, if the climber has moved anything. */
  overrides?: WeekOverrides,
): PlannedDay {
  // Past the last week the block is over, and the app has nothing to
  // prescribe. Without this `programWeek` clamps and every caller is handed
  // week twelve of a block that finished months ago, with its sessions and
  // its final-test banner (PLAN.md M85).
  const { from, to } = blockWindow(program, startDate);
  if (date > to) return { date, week: null, isDeload: false, isRest: true, over: true };

  const week = programWeek(startDate, date, program.weeks);
  // Nor before the first week: the plan is a weekly shape, and reading it
  // for a date the block has not reached drew next Monday's sessions onto
  // this week's calendar. Found by the week screen (PLAN.md M135), which
  // counted them as days to train.
  if (week === null) return { date, week: null, isDeload: false, isRest: true, startsOn: from };
  const phase = phaseForWeek(program, week);
  const forWeek = effectivePlan(plan, overrides, date);
  const typeId = forWeek[dayOfWeek(date) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  const sessionType = typeId ? program.sessionTypes.find((t) => t.id === typeId) : undefined;

  const drillId = sessionType?.drillsByWeek ? sessionType.drillsByWeek[week] : undefined;
  const drill = drillId ? getDrill(drillId) : undefined;
  const test = testWeeks(program).find((t) => t.week === week);

  return {
    date,
    week,
    ...(phase ? { phase } : {}),
    ...(sessionType ? { sessionType } : {}),
    ...(drill ? { drill } : {}),
    isDeload: (program.deloadWeeks ?? []).includes(week),
    ...(test ? { test: test.why } : {}),
    isRest: !sessionType || sessionType.isRest === true,
  };
}

export interface BlockPrescription {
  blockId: string;
  name: string;
  entry: PhasePrescription;
  /**
   * What this week asks that the week before did not (PLAN.md M127).
   *
   * Present only when the block authored a step for this week *and* a week
   * was asked for. Absent is the ordinary case and means what it always
   * meant: the phase runs one dose.
   */
  step?: string;
}

/**
 * What a deload week takes off a dose (PLAN.md M128).
 *
 * `deloadWeeks` drove three things before this — a calendar marker, a
 * `deload: true` stamp on the session, and a sentence explaining the dip in
 * training load — and **not one of them reduced a set, a rep or a load**.
 * For The Cruiser, Two Days a Week and Ground Zero there is no weekly drill
 * either, so a deload week was byte-identical to the week before it: the app
 * printed "Deload week" over the same five sets of maximal hangs.
 *
 * **Volume, and only volume.** A set comes off; reps, hold, load and rest
 * are left exactly as written. That is the ordinary meaning of a deload and
 * the one lever that is safe to pull without knowing the block: dropping the
 * load on a max-hang week and dropping the load on a mobility circuit are
 * not the same decision, and the app has no business making either. A
 * program that wants something else says so with `perWeek`, which wins.
 *
 * **Conservative on purpose.** A range goes to its bottom, a fixed count
 * loses one, and nothing goes below two. Under-reducing a week an author
 * never thought about is recoverable; over-reducing it silently is not.
 */
export function deloadDose(exercise: Exercise): Dose | null {
  return easedDose(exercise, 1);
}

/**
 * The same arithmetic, as many notches deep as asked for (PLAN.md M129).
 *
 * A deload is one notch decided by the program in advance; a check-in is
 * one or two decided by the climber this morning. Both are "less of the
 * same session", and writing the rule twice is how the two would drift
 * apart. Stops early when there is no notch left to take, so asking for two
 * on a three-set block gives two sets rather than nothing.
 */
export function easedDose(exercise: Exercise, notches: number): Dose | null {
  let sets = exercise.sets;
  let moved = false;
  for (let i = 0; i < notches; i += 1) {
    const next = lighter(sets);
    if (next === null) break;
    sets = next;
    moved = true;
  }
  return moved ? { sets } : null;
}

/** One notch off a count, or null when there is no notch to take. */
function lighter(value: string | undefined): string | null {
  if (value === undefined) return null;
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(value.trim());
  if (range) {
    const low = Number(range[1]);
    return low < Number(range[2]) ? String(low) : null;
  }
  const flat = /^(\d+)$/.exec(value.trim());
  if (flat) {
    const n = Number(flat[1]);
    return n > 2 ? String(n - 1) : null;
  }
  // 'AMRAP', '1 per arm', 'to failure' — a count this cannot read is a count
  // it must not guess at.
  return null;
}

/**
 * Whether a check-in of this depth would take anything off the session
 * (PLAN.md M129).
 *
 * Here rather than in the logger, because it is the same question the
 * screen must not answer by eye: saying "less of it today" over a
 * prescription that has not moved is the fault M128 met with the deload
 * marker, one screen along.
 *
 * A full day falls out of this rather than being checked for. `easedDose`
 * at zero notches never moves anything, so the answer is already false and
 * an early return for it was a line no test could reach — which a mutation
 * duly showed by surviving.
 */
export function easesAnything(blocks: readonly BlockPrescription[], notches: number): boolean {
  return blocks.some((b) => b.entry.exercises.some((e) => easedDose(e, notches) !== null));
}

/** Whether a deload would take anything off this prescription at all. */
export function deloadLightens(entry: PhasePrescription): boolean {
  return entry.exercises.some((e) => deloadDose(e) !== null) || lighter(entry.circuit?.rounds) !== null;
}

/** What the climber is told when the week was lightened rather than authored. */
export const DELOAD_STEP =
  'Deload week. A set comes off where there is one to give and nothing else changes — the load stays where it is, and you stop while it still feels easy.';

/**
 * Which week of its own phase a program week is, 1-based.
 *
 * Phases carry absolute bounds (`weekStart`, `weekEnd`) because that is
 * what tiling 1..weeks needs, and an author writing a four-week phase
 * thinks in *its* weeks rather than the program's. Null outside the phase,
 * which is not a case any caller should reach and is worth saying rather
 * than clamping into a wrong answer.
 */
export function weekInPhase(phase: Phase, week: number): number | null {
  if (week < phase.weekStart || week > phase.weekEnd) return null;
  return week - phase.weekStart + 1;
}

/**
 * Blocks to show for a session type in a given phase, filtered to a track.
 *
 * `week` is the program week, and giving it is what turns a phase's
 * prescription into this week's. Left out, the phase's own dose comes back
 * unchanged — which is what every caller got before M127, and what a screen
 * showing a phase rather than a day still wants.
 */
export function prescriptionFor(
  sessionType: SessionType,
  phase: Phase,
  trackId?: string,
  week?: number | null,
  /** This week is one the program deloads on — see `deloadDose`. */
  deload = false,
): BlockPrescription[] {
  const inPhase = week === undefined || week === null ? null : weekInPhase(phase, week);
  const out: BlockPrescription[] = [];
  for (const block of sessionType.blocks ?? []) {
    const entry = block.perPhase[phase.id];
    if (!entry) continue;
    const tracked = trackId
      ? entry.exercises.filter((e) => !e.track || e.track === trackId)
      : entry.exercises;
    const step = inPhase === null ? undefined : entry.perWeek?.find((w) => w.week === inPhase);
    // The author's week beats the derived one, per block rather than per
    // session: a program that wrote down what its deload looks like has
    // said something the default cannot know, and a block it said nothing
    // about still gets lightened.
    const derived = deload && step === undefined;
    // Merged by name rather than by index: an author adding a line to the
    // phase should not silently re-point every week's overrides at the
    // wrong exercise, and a name that matches nothing is caught by the
    // content test rather than by a climber.
    const exercises = step?.dose
      ? tracked.map((e) => (step.dose![e.name] ? { ...e, ...step.dose![e.name] } : e))
      : derived
        ? tracked.map((e) => {
            const off = deloadDose(e);
            return off ? { ...e, ...off } : e;
          })
        : tracked;
    // A circuit deloads in rounds, which is its unit of volume.
    const rounds = derived && entry.circuit ? lighter(entry.circuit.rounds) : null;
    const circuit = rounds === null ? entry.circuit : { ...entry.circuit!, rounds };
    // Only where something actually came off. A block of two-set prehab has
    // no notch to take, and telling a climber a set went when none did is
    // the same lie the marker was telling before this.
    const lightened =
      derived &&
      (rounds !== null || exercises.some((e, i) => e.sets !== tracked[i]?.sets));
    out.push({
      blockId: block.id,
      name: block.name,
      entry: { ...entry, exercises, ...(circuit ? { circuit } : {}) },
      ...(step ? { step: step.step } : lightened ? { step: DELOAD_STEP } : {}),
    });
  }
  return out;
}
