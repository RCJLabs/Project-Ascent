/**
 * Which days are inside a planned deload week (PLAN.md M306).
 *
 * `deloadWeeks` is a list on the **program** — ten of the eleven shipped ones
 * have one, and Trip Prep deliberately does not — and the only thing that has
 * ever turned one into a fact about a *day* is `PreSession`, which stamps
 * `deload: true` on a session as it starts one from the plan card. Five
 * things create a session and one of them does that; `startRest` next door
 * does not, so a rest day taken inside a deload week carried nothing, and a
 * deload week rested through left no trace at all — which is a large part of
 * what a deload week is.
 *
 * `derive.ts` has taken a `deloadDates` set since M67 and **no production
 * code has ever passed one**: its single caller in the repository is
 * `coach.test.ts`. So the correction the training-load model was built to
 * make — a light week is light on purpose, not detraining — has never run
 * for a climber who was not stamping sessions.
 *
 * Measured over one twelve-week Iron Grip block, three sessions a week,
 * lighter in the deload weeks, against a climber doing exactly what the
 * program asked:
 *
 * ```
 * days the reading changes when the plan is consulted:  26 of 63
 * of those, days the app said "detraining":             15
 * ```
 *
 * ## From the blocks, not from the active program
 *
 * The twenty-eight day window the ratio reads can span the end of one block
 * and the start of the next, so the active program alone answers for part of
 * it. `profile.blocks` is the record of what has been run, and each row
 * carries the program, the day it started, the weeks it was set to run and
 * the day it stopped — everything a week number needs.
 *
 * ## `blockStart`, not `startOfWeek`
 *
 * A deload week is a *program* week, so this counts them the way
 * `programWeek` does: from `blockStart`, the first **whole** week, which is
 * the Sunday *after* a start that is not itself a Sunday (M259 — the days
 * between belong to no week at all).
 *
 * `blocks.rowWindow` took the same arithmetic from `startOfWeek` while
 * saying it was the same, and was seven days out for every start that is not
 * a Sunday. M307 made both windows one function; this reads the rows the
 * same way they do.
 */

import { getProgram } from '@/content/programs';
import type { ProgramId } from '@/content/types';
import type { BlockRecord } from './blocks';
import { addDays, blockStart } from './dates';
// The same instance `deriveClimberState` resolves its default to: the cache
// there keys on it by identity, so a climber with no planned deload in reach
// has to get one set rather than a fresh one per call.
import { NO_DELOAD } from './derive';

/** The days one block spends in a deload week. */
function datesIn(row: BlockRecord): string[] {
  const program = getProgram(row.programId as ProgramId);
  const weeks = program?.deloadWeeks ?? [];
  if (weeks.length === 0) return [];
  const from = blockStart(row.startDate);
  const out: string[] = [];
  for (const week of weeks) {
    // `row.weeks` rather than `program.weeks`: the row remembers how long
    // the block was *set* to run, adaptation included, and a twelfth week
    // that was adapted away never happened.
    if (week < 1 || week > row.weeks) continue;
    const start = addDays(from, (week - 1) * 7);
    for (let day = 0; day < 7; day++) {
      const date = addDays(start, day);
      // A block left in week five never reached week eight. `endedAt` is
      // the day it stopped being the active program, so days after it are
      // days of a plan nobody was following.
      if (row.endedAt !== null && date > row.endedAt) continue;
      out.push(date);
    }
  }
  return out;
}

let cached: { rows: readonly BlockRecord[]; dates: ReadonlySet<string> } | null = null;

/** Exported for tests, which need to measure the real work. */
export function clearDeloadCache(): void {
  cached = null;
}

/**
 * Every day the climber's blocks put in a deload week.
 *
 * Memoised on the array's identity, the way `deriveClimberState` is and for
 * the same reason: the store replaces `blocks` rather than mutating it, so
 * the same array back means the same answer — and the answer has to be the
 * *same instance* or the cache it feeds never hits.
 */
export function deloadDatesFor(blocks: readonly BlockRecord[]): ReadonlySet<string> {
  if (cached !== null && cached.rows === blocks) return cached.dates;
  const dates = blocks.flatMap(datesIn);
  const value = dates.length === 0 ? NO_DELOAD : new Set(dates);
  cached = { rows: blocks, dates: value };
  return value;
}
