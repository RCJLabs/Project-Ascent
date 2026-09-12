/**
 * A season, as a sequence of blocks (PLAN.md M109).
 *
 * Everything this needs already existed and none of it joined up:
 * `Program.nextPrograms` carries a written reason per destination,
 * `adaptProgram` fits a block into fewer weeks (M56), `blockWindow` dates
 * one, and an `Objective` has a `targetDate`. A climber still could not lay
 * out *Base Camp → Iron Grip → Trip Prep, ending on the trip* and look at
 * it. Each block was chosen only when the last one ran out.
 *
 * ## Where this belongs, which the app already said out loud
 *
 * `peak.ts` holds the runway to a target at **twelve weeks** and, past
 * that, withholds the plan with a sentence that is this milestone's whole
 * premise:
 *
 * > *"More than 12 weeks out is a training block, not a peak. Pick a
 * > program for the first part of it and come back when the trip is
 * > closer."*
 *
 * That is an instruction the app gives and then cannot help with. So the
 * seam is exactly there and the two do not overlap: **outside twelve weeks
 * the season says which blocks, inside it the runway says how hard each
 * week.**
 *
 * ## Derived backwards, and never quietly
 *
 * Stored: the sequence of program ids. Derived: every date. The last block
 * ends on the target week, the one before it ends where that starts, and so
 * on back — because a season is aimed at a date, not begun on one.
 *
 * Working back can land the first block **before today**, which means the
 * season does not fit. It says so, in weeks, and changes nothing: shrinking
 * a twelve-week block to seven changes the training, and `StartProgramPage`
 * already makes that the climber's choice with `lengthsFor`. A plan that
 * silently compressed itself to fit would be the app choosing a different
 * block and calling it the same one.
 *
 * **A block's length is the climber's own.** If they have already adapted
 * Iron Grip to eight weeks, the season runs eight — read from
 * `adaptations`, never invented here.
 *
 * ## Never
 *
 * Place sessions beyond the active block, or mark a season missed. It is an
 * intention: `Objective.targetDate` is documented as *"not a deadline that
 * can be failed"* and this is the same date.
 *
 * Pure: a sequence and a date in, dated blocks out.
 */

import { getProgram } from '@/content/programs';
import type { Program, ProgramId } from '@/content/types';
import { adaptProgram } from './adapt';
import { addDays, startOfWeek } from './dates';
import { MAX_RUNWAY_WEEKS, runwayWeeks } from './peak';

/** Blocks in one season. More is a plan nobody keeps. */
export const MAX_BLOCKS = 4;

export type BlockWhen = 'past' | 'running' | 'future';

export interface SeasonBlock {
  programId: ProgramId;
  /** The program at the length this climber runs it. */
  program: Program;
  weeks: number;
  from: string;
  to: string;
  when: BlockWhen;
}

export interface Season {
  blocks: SeasonBlock[];
  /** Total weeks the sequence asks for. */
  weeks: number;
  /** Weeks between today and the target. */
  runway: number;
  /**
   * Weeks the sequence is short of room, or 0 when it fits.
   *
   * Positive means the first block would have had to start in the past.
   */
  over: number;
  /** Weeks of room left before the first block starts. */
  slack: number;
}

export interface SeasonInput {
  programIds: readonly ProgramId[];
  targetDate: string;
  today: string;
  /** Lengths the climber has already chosen, by program id. */
  adaptations?: Record<string, number>;
}

/** The length this climber runs a program at. */
function lengthOf(program: Program, adaptations: Record<string, number>): number {
  const chosen = adaptations[program.id];
  return chosen !== undefined && chosen > 0 ? Math.round(chosen) : program.weeks;
}

export function season(input: SeasonInput): Season {
  const adaptations = input.adaptations ?? {};
  const known = input.programIds
    .slice(0, MAX_BLOCKS)
    .map((id) => getProgram(id))
    .filter((p): p is Program => p !== undefined);

  // Back from the target: the last block ends on the target's week.
  const lastEnds = addDays(startOfWeek(input.targetDate), 6);
  const blocks: SeasonBlock[] = [];
  let endsOn = lastEnds;
  for (const program of [...known].reverse()) {
    const weeks = lengthOf(program, adaptations);
    const from = addDays(endsOn, -(weeks * 7 - 1));
    blocks.unshift({
      programId: program.id,
      program: weeks === program.weeks ? program : adaptProgram(program, weeks),
      weeks,
      from,
      to: endsOn,
      when: 'future',
    });
    endsOn = addDays(from, -1);
  }

  const week = startOfWeek(input.today);
  for (const block of blocks) {
    block.when = block.to < week ? 'past' : block.from <= week ? 'running' : 'future';
  }

  const weeks = blocks.reduce((n, b) => n + b.weeks, 0);
  const runway = runwayWeeks(input.targetDate, input.today);
  // Subtraction of the two numbers the sentence actually states, and not a
  // third measure of its own. An earlier version took the shortfall from
  // the week-aligned block dates while the runway came from `peak.ts`,
  // which produced "24 weeks against 16 weeks — that is 7 weeks more than
  // there is room for" on screen. A reader checks that arithmetic.
  const diff = blocks.length === 0 ? 0 : weeks - runway;

  return {
    blocks,
    weeks,
    runway: Math.max(0, runway),
    over: diff > 0 ? diff : 0,
    slack: diff < 0 ? -diff : 0,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The season in a sentence, or nothing when there is no sequence.
 *
 * It says whether the thing fits and by how much, and never proposes the
 * fix — shortening a block is a training decision the climber makes on the
 * program's own page, with the lengths that program actually supports.
 */
export function describeSeason(s: Season): string | null {
  if (s.blocks.length === 0) return null;
  const names = s.blocks.map((b) => b.program.name).join(' → ');
  const span = `${names} is ${plural(s.weeks, 'week')} against ${plural(s.runway, 'week')} to the day.`;
  if (s.over > 0) {
    return `${span} That is ${plural(s.over, 'week')} more than there is room for — it would have had to start ${plural(s.over, 'week')} ago. Drop a block, or run one of them shorter from its own page.`;
  }
  if (s.slack > 0) {
    return `${span} ${plural(s.slack, 'week')} spare before it starts, which is a fine place for a deload or for nothing in particular.`;
  }
  return `${span} It starts this week.`;
}

/** Whether this objective is far enough out for a season to be the question. */
export function wantsSeason(targetDate: string, today: string): boolean {
  // No guard for a date already gone: `runwayWeeks` floors at one, so a
  // past target can never clear the seam. A guard was written here and a
  // mutation removing it changed nothing, which is how it was found.
  return runwayWeeks(targetDate, today) > MAX_RUNWAY_WEEKS;
}

/**
 * Which block of the season covers a date, or null (PLAN.md M112b).
 *
 * The calendar needs this to draw a season it is not running yet. Nothing
 * here places a session — a ghost is a band over a date range, which is why
 * `SeasonBlock` already carries `from` and `to` and no days at all. The
 * "Never" above holds: this answers *which block*, and the calendar draws a
 * colour, and at no point does either invent a session.
 */
export function blockOn(s: Season, date: string): SeasonBlock | null {
  return s.blocks.find((b) => b.from <= date && date <= b.to) ?? null;
}

/**
 * The one season a screen that can only show one should show.
 *
 * Nothing caps objectives and none of them is primary, so a climber can
 * carry several with a sequence on each. The soonest target wins, because
 * that is the one whose blocks are running now — a season for next autumn
 * cannot be the one the calendar is drawing this month.
 *
 * Ties go to neither: two objectives on the same date is a climber who has
 * not decided, and picking one for them would draw a season they never
 * chose over the one they meant.
 */
export function soonestSeason<T extends { targetDate?: string; season?: readonly ProgramId[] }>(
  objectives: readonly T[],
): T | null {
  const withSeason = objectives.filter(
    (o) => o.targetDate !== undefined && (o.season?.length ?? 0) > 0,
  );
  if (withSeason.length === 0) return null;
  const soonest = withSeason.reduce((a, b) => (a.targetDate! <= b.targetDate! ? a : b));
  const tied = withSeason.filter((o) => o.targetDate === soonest.targetDate);
  return tied.length === 1 ? soonest : null;
}
