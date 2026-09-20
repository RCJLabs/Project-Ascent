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
 * Every day on rock and what it said, in the order they were logged.
 *
 * One entry per date: a day with two logged sessions is one day on rock, and
 * it counts as answered when either of them answered. Where both did, the
 * later one wins — it is the later reading of the same day, and a morning
 * that dried out is better described by the afternoon.
 *
 * Unanswered days are kept, as `null`. `poorRun` needs them to end a run,
 * and a tally that quietly dropped them would be counting answers rather
 * than days.
 */
export function answersByDay(sessions: readonly Session[]): Map<string, string | null> {
  const byDate = new Map<string, string | null>();
  for (const session of sessions) {
    if (!session.completed || session.mode !== 'outdoor') continue;
    const said = conditionsOf(session);
    if (said !== null || !byDate.has(session.date)) byDate.set(session.date, said);
  }
  return byDate;
}

/**
 * How the rock has been, in days, worst first (PLAN.md M303).
 *
 * The second reader this module has ever had. `poorRun` below is the rule
 * M289 built it for, and it is deliberately strict — three days on rock in a
 * row, all of them the worst answer, ending at the last of them. Measured
 * over the sample climber's year, 29 days on rock with every one of them
 * answered: **it could fire on none of the 365 days.** A question asked on
 * every outdoor session deserves an answer that is not that rare.
 *
 * A count is not a rule and claims nothing. It says what the log holds, in
 * the climber's own words and in the registry's order, and leaves the
 * reading to them — which is the same promise the run makes about grades.
 *
 * Only what was answered: days on rock with no answer are not *good* days,
 * and rolling them into one would be the mistake the run's own comment
 * names, a reading of the days you happened to tell it about.
 */
export function conditionsTally(
  sessions: readonly Session[],
): { word: string; days: number }[] {
  const answers = [...answersByDay(sessions).values()];
  return conditionOptions()
    .map((word) => ({ word, days: answers.filter((said) => said === word).length }))
    .filter((row) => row.days > 0);
}

/**
 * The run of bad days ending at the last day on rock, if there is one.
 */
export function poorRun(sessions: readonly Session[]): PoorRun | null {
  const worst = worstCondition();
  if (worst === null) return null;

  const byDate = answersByDay(sessions);
  const dates = [...byDate.keys()].sort().reverse();
  const run: string[] = [];
  for (const date of dates) {
    if (byDate.get(date) !== worst) break;
    run.push(date);
  }
  if (run.length < POOR_RUN) return null;
  return { days: run.length, from: run[run.length - 1]!, to: run[0]!, word: worst.toLowerCase() };
}
