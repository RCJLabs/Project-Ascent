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
}

/** A finished session that is training rather than a logged rest. */
export function trained(session: Session): boolean {
  return session.completed && !isRestSession(session);
}

export function weekTally(days: readonly TalliedDay[]): WeekTally {
  let planned = 0;
  let done = 0;
  let extra = 0;
  for (const day of days) {
    if (day.training) {
      planned += 1;
      if (day.sessions.some((s) => s.completed)) done += 1;
    } else {
      extra += day.sessions.filter(trained).length;
    }
  }
  return { planned, done, extra };
}

/**
 * Whether a week has anything to report at all.
 *
 * A week before the block starts, after it ends, or with no program at all
 * has no plan to measure against — and a gutter reading *0/0* on eleven
 * rows of an empty calendar is worse than an empty gutter.
 */
export function tallied(tally: WeekTally): boolean {
  return tally.planned > 0 || tally.extra > 0;
}
