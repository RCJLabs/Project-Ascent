/**
 * How the rock was, and what a run of bad days means (PLAN.md M289).
 *
 * Outdoors, the largest thing between a climber and the grade they touch is
 * not their fingers. `pyramidShape.ts` opens by naming the confound it lives
 * inside and refusing to call a gap a weakness; `angles.ts` does the same for
 * a wall angle nobody logs. This is the third of those, and the first one the
 * climber can actually answer: the app had no way to tell *"I was weak"* from
 * *"it was 28°C and greasy"*, because nothing in the record held the second.
 *
 * ## What the rule refuses to do
 *
 * It never touches a grade. Nothing here adjusts a ladder, discounts a send
 * or re-prices a session — `altimeter.ts` opens by promising no game action
 * adds a foot, and this keeps the same promise from the other side: a bad day
 * is still the day you had. The reading is a sentence beside the numbers and
 * never a correction to them.
 *
 * ## Answered, and consecutive
 *
 * The question is optional, and a climber is likelier to answer it on a day
 * worth complaining about. So a rule over *the answers* would find a run of
 * greasy days in a log with one greasy day in it.
 *
 * The run is therefore consecutive **among outdoor days**, not among answers:
 * walking back from the most recent day on rock, an unanswered day ends the
 * run exactly as a good one does. That makes the sentence literally true —
 * *your last three days on rock* — rather than true of the days you happened
 * to tell it about.
 */

import type { Session } from '@/db/sessions';
import { getField } from '@/content/fields';

/** Days in a row before a run of bad conditions is worth a sentence. */
export const POOR_RUN = 3;

/** The answers, worst first, from the registry rather than a second copy. */
export function conditionOptions(): readonly string[] {
  return getField('conditions')?.options ?? [];
}

/** The worst answer the question offers, which is the one a run is made of. */
export function worstCondition(): string | null {
  return conditionOptions()[0] ?? null;
}

/** What a session said about the rock, or null where it was not asked. */
export function conditionsOf(session: Session): string | null {
  const value = session.fields?.conditions;
  return typeof value === 'string' && value !== '' ? value : null;
}

export interface PoorRun {
  /** Days on rock in the run, all of them answered and all of them the worst. */
  days: number;
  /** Oldest day in the run. */
  from: string;
  /** Most recent day in the run, which is the last day on rock. */
  to: string;
  /** The word the climber used, so the sentence is theirs. */
  word: string;
}

/**
 * The run of bad days ending at the last day on rock, if there is one.
 *
 * One session per date: a day with two logged sessions is one day on rock,
 * and it counts as answered when either of them answered.
 */
export function poorRun(sessions: readonly Session[]): PoorRun | null {
  const worst = worstCondition();
  if (worst === null) return null;

  const byDate = new Map<string, string | null>();
  for (const session of sessions) {
    if (!session.completed || session.mode !== 'outdoor') continue;
    const said = conditionsOf(session);
    if (said !== null || !byDate.has(session.date)) byDate.set(session.date, said);
  }

  const dates = [...byDate.keys()].sort().reverse();
  const run: string[] = [];
  for (const date of dates) {
    if (byDate.get(date) !== worst) break;
    run.push(date);
  }
  if (run.length < POOR_RUN) return null;
  return { days: run.length, from: run[run.length - 1]!, to: run[0]!, word: worst.toLowerCase() };
}
