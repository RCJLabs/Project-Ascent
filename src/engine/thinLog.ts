/**
 * Days you trained and did not write down (PLAN.md M100).
 *
 * ## What the milestone got wrong
 *
 * M100 proposed a *sketch*: a new kind of session, `sketch: true`, that
 * "counts for consistency, the streak and the gap" and "carries load only if
 * the climber gives RPE and duration". **All of that already happens.** A
 * completed session with nothing on it is a thing the app has always been
 * able to hold, and measured against a fixture of eight weeks of training
 * followed by three unlogged weeks, filling the gap with bare completed days
 * moves every number the proposal wanted moved:
 *
 * - sessions 24 → 34, streak 0 → 10 weeks
 * - the consistency grid's longest gap 24 days → 3 days
 * - ACWR stays `null`, because `sessionLoad` is RPE × hours and both are
 *   absent — exactly the "excluded from the ratio" the proposal asked for
 * - the coach's detraining tip disappears and a streak tip replaces it
 *
 * So a flag would have been a second way to say what the record already says,
 * which is the duplication M98 refused and M99b had to undo.
 *
 * **Two of the six readers named in the premise do not do what it said.**
 * `staleSessions` is about a session left *running* — `startedAt` with no
 * `endedAt` — and has nothing to do with gaps. `comingOffBreak` is the
 * climber answering "returning" in the finder, a stated answer rather than a
 * read of the log.
 *
 * ## What was actually missing
 *
 * Marking the days is possible and *tedious*: one navigation and one tap per
 * day, through a page built for logging a whole session. And once it is
 * cheap, nothing distinguishes a day that was marked from a day that was
 * logged — so "34 days · 2.9 a week" would quietly become a number built
 * partly on assertions. This module is the second half: what a bare day is,
 * and how many of them are in a window.
 *
 * ## Derived, never flagged
 *
 * Bareness is read off the record rather than stored. A stored flag can lie
 * in a way the record contradicts — mark a day a sketch, then log six climbs
 * on it — and this cannot: the moment a day carries anything, it stops being
 * bare, which is the truth about that day.
 */

import type { Session } from '@/db/sessions';

/**
 * Whether a completed session records anything about what happened.
 *
 * The fields that count are the ones the climber puts there. `programId`,
 * `sessionTypeId` and `trackId` say what was *planned*, and `mode` has a
 * default, so none of them is something anyone said about the day.
 */
export function isBare(session: Session): boolean {
  if (!session.completed) return false;
  if (session.climbs.length > 0) return false;
  if (session.rpe !== undefined || session.durationMin !== undefined) return false;
  if (session.warmup !== undefined) return false;
  if (session.drillId !== undefined || session.drillDone === true) return false;
  if (session.exercises?.length) return false;
  if (session.projectAttempts?.length) return false;
  if (session.restChecklist !== undefined) return false;
  if (session.checkIn !== undefined) return false;
  if ((session.notes ?? '').trim() !== '') return false;
  if (Object.values(session.fields ?? {}).some((v) => v !== undefined && v !== '')) return false;
  // A session that ran on a clock was a session someone was present for.
  if (session.startedAt !== undefined) return false;
  return true;
}

export interface Coverage {
  /** Distinct days with a completed session in the window. */
  days: number;
  /** How many of those hold nothing but the fact that you turned up. */
  bare: number;
}

/**
 * How much of a window's record is bare, by day rather than by session.
 *
 * By day because that is the unit every number beside it uses — the
 * consistency grid counts days logged, not sessions — and a day with one full
 * session and one bare one is a day that was written down.
 */
export function coverage(sessions: readonly Session[], from: string, to: string): Coverage {
  const byDay = new Map<string, boolean>();
  for (const session of sessions) {
    if (!session.completed) continue;
    if (session.date < from || session.date > to) continue;
    const written = byDay.get(session.date) === false;
    byDay.set(session.date, written ? false : isBare(session));
  }
  return {
    days: byDay.size,
    bare: [...byDay.values()].filter(Boolean).length,
  };
}

/**
 * The clause that goes beside a count, or null when there is nothing to say.
 *
 * Null when none are bare, because a caveat about a thing that did not happen
 * is noise — the rule `checkIns` states as coverage before anything else, and
 * `projectHistory` as a small sample being labelled rather than hidden.
 */
export function describeCoverage(cover: Coverage): string | null {
  if (cover.bare === 0) return null;
  if (cover.bare === cover.days) {
    return cover.days === 1
      ? 'the only one marked without detail'
      : 'all of them marked without detail';
  }
  return `${cover.bare} of them marked without detail`;
}
