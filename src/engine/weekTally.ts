/**
 * How a week went, counted once (PLAN.md M146).
 *
 * The week screen has answered *three of four* since M135; the month grid
 * could not say it at all, so a training week and a rest week looked alike
 * until you counted icons. Adding the count to the calendar meant either
 * deriving it a second time — the fault M145 had just finished removing
 * from the legend — or lifting the rule out of `weekOutline` so both
 * screens read it from one place. This is the rule.
 *
 * ## What counts, and what a rest day is
 *
 * `planned` is the days the plan puts a training session on, `done` is how
 * many of those carry a finished session, and `extra` is finished training
 * on the days the plan left empty. A session logged as a rest is not
 * training and never counts toward `extra` — but it does close a planned
 * day, because a climber who planned to train and logged a rest has
 * answered for that day.
 */

import type { Session } from '@/db/sessions';
import { isRestSession } from './rest';

/** One day of a week, reduced to what the count needs. */
export interface TalliedDay {
  date: string;
  /** The plan places a training session here. */
  training: boolean;
  sessions: readonly Session[];
}

export interface WeekTally {
  /** Days the plan places a training session on. */
  planned: number;
  /** Of those, the ones with a finished session. */
  done: number;
  /** Finished training sessions on days the plan left empty. */
  extra: number;
  /**
   * Of `planned`, the ones still ahead — today included (PLAN.md M310).
   *
   * The tense, counted here with the rest of it. The week screen had it and
   * the month grid's gutter did not: *"1 of 4 training days done, 3 to
   * come"* on one screen and a flat **1/4** on the other, unchanged from the
   * Sunday to the Saturday of the same week. M146 lifted the counts into
   * this module so the two could not disagree about them, and left the one
   * thing they did disagree about behind.
   *
   * Today counts as ahead, not behind: a session planned for tonight is not
   * one you missed, which is `statusOf`'s rule in `week.ts` and the reason
   * its `left` includes `'today'`.
   */
  toCome: number;
}

/** A finished session that is training rather than a logged rest. */
export function trained(session: Session): boolean {
  return session.completed && !isRestSession(session);
}

export function weekTally(days: readonly TalliedDay[], today: string): WeekTally {
  let planned = 0;
  let done = 0;
  let extra = 0;
  let toCome = 0;
  for (const day of days) {
    if (day.training) {
      planned += 1;
      if (day.sessions.some((s) => s.completed)) done += 1;
      else if (day.date >= today) toCome += 1;
    } else {
      extra += day.sessions.filter(trained).length;
    }
  }
  return { planned, done, extra, toCome };
}
