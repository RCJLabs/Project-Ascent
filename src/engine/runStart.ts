/**
 * Which start a run's weeks were counted from on a given day (PLAN.md M374).
 *
 * A pick-up moves the block's start, so everything that numbers a day from
 * the live start numbers the days before the pick-up from the wrong one.
 * M369 taught the review to read a resumed row as segments (`blockRun.ts`);
 * the calendar and the week page still read the live start, so a block
 * stopped after three weeks and picked up three weeks later drew the weeks
 * the climber trained with nothing planned in them, and the weeks they were
 * stopped as weeks one to three — planned, and so missed.
 *
 * The same segments, walked rather than built: Home's week strip reads this,
 * so it is in the first load, and `segmentsOf` with its objects is not.
 * `runStart.test.ts` holds the two to the same answer.
 */

import type { BlockRecord } from './blocks';
import { addDays } from './dates';

/**
 * The start to number `date` from, or null on a day the run was paused.
 *
 * A day before a pick-up keeps the start it had when the climber trained
 * it; a day between a stop and its resume has none, which is the coach's
 * rule for a pause (M369). A pick-up without a stop (M149) leaves no pause:
 * its gap belongs to the stretch before it, as M149 counted it.
 *
 * `live` — the start the profile holds — for a row never picked up, for no
 * row at all, and for the stretch running now, so a climber who never
 * stopped a block reads exactly what they read before this.
 */
export function startOn(row: BlockRecord | null | undefined, live: string, date: string): string | null {
  const resumed = row?.resumed;
  if (!resumed?.length) return live;
  let start = addDays(row!.startDate, -7 * resumed.reduce((sum, r) => sum + r.weeks, 0));
  for (const r of resumed) {
    if (date <= (r.stoppedOn ?? addDays(r.on, -1))) return start;
    if (date < r.on) return null;
    start = addDays(start, 7 * r.weeks);
  }
  return live;
}
