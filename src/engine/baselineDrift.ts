/**
 * When what you told us stops matching what you do (PLAN.md M93).
 *
 * **Correcting the milestone's premise.** It says a stale baseline is what
 * "every recommendation the app makes" is built on. It is not: `baseline`
 * has exactly one reader, `FinderPage`, and there it only seeds the form's
 * chips. The harm is narrower and sharper than that — the finder asks the
 * same five questions and **throws the answers away**, so a climber who
 * corrects "coming back" to "intermediate" on Tuesday is asked the stale
 * question again on Friday, and every time after.
 *
 * That is why this is measured against the recent log rather than against
 * a timestamp: the question is not "has this changed since you said it" but
 * "does it match what you are doing now", which needs no new stored field
 * and gives the same answer in every realistic case.
 *
 * **Two of the three answers have a signal and one does not.**
 * `daysPerWeek` is a claim the log can check outright. `experience` can be
 * checked in one direction only — see below. `goal` is an intention and the
 * log has nothing to say about it, so nothing here pretends otherwise.
 *
 * Nothing is ever overwritten. The stated answer stays selected and the
 * observation is offered beside it, because this is an answer the climber
 * gave about themselves and the app's evidence is a count of rows.
 */

import type { Session } from '@/db/sessions';
import { daysBetween, addDays } from './dates';
import type { Experience } from './finder';
import { isRestSession } from './templates';

/** The window the training rate is observed over. */
export const DRIFT_WEEKS = 8;

/** Below this there is not enough log to say anything about a rate. */
export const ENOUGH_WEEKS = 4;

/**
 * How far out the stated number has to be before it is worth saying.
 *
 * One day either way is ordinary life, and a note that fires on it is a
 * note people learn to dismiss. Two is a different training week. **My
 * number, not the programs'** — their `sessions-per-week` rules are a
 * separate thing and the finder already reports against those.
 */
export const DRIFT_MARGIN = 2;

/**
 * Enough training that "new" and "coming back" have stopped being true.
 *
 * Roughly two months at three a week. **My call, and stated as one.**
 */
export const SETTLED_SESSIONS = 24;
export const SETTLED_WEEKS = 8;

export interface DaysDrift {
  stated: number;
  observed: number;
  /** Weeks the observation covers. */
  weeks: number;
}

export interface ExperienceDrift {
  stated: Extract<Experience, 'new' | 'returning'>;
  sessions: number;
  weeks: number;
}

export interface BaselineDrift {
  days: DaysDrift | null;
  experience: ExperienceDrift | null;
}

export interface DriftInput {
  stated: { experience: Experience; daysPerWeek: number };
  sessions: readonly Session[];
  today: string;
}

const trained = (s: Session): boolean => s.completed && !isRestSession(s);

/** Training sessions and the whole weeks they span, over the recent window. */
function recentRate(sessions: readonly Session[], today: string): { count: number; weeks: number } {
  const training = sessions.filter(trained).filter((s) => s.date <= today);
  if (training.length === 0) return { count: 0, weeks: 0 };

  const first = training.reduce((a, s) => (s.date < a ? s.date : a), training[0]!.date);
  const from = addDays(today, -(DRIFT_WEEKS * 7 - 1));
  // A climber three weeks in is measured over three weeks, not scored over
  // eight — five of which they had no app.
  const start = first > from ? first : from;
  const weeks = Math.max(1, Math.round((daysBetween(start, today) + 1) / 7));
  return { count: training.filter((s) => s.date >= start).length, weeks };
}

/** Everything logged, and how long it has been going on. */
function history(sessions: readonly Session[], today: string): { count: number; weeks: number } {
  const training = sessions.filter(trained).filter((s) => s.date <= today);
  if (training.length === 0) return { count: 0, weeks: 0 };
  const first = training.reduce((a, s) => (s.date < a ? s.date : a), training[0]!.date);
  return { count: training.length, weeks: Math.floor((daysBetween(first, today) + 1) / 7) };
}

export function baselineDrift(input: DriftInput): BaselineDrift {
  const rate = recentRate(input.sessions, input.today);
  const observed = rate.weeks === 0 ? 0 : Math.round(rate.count / rate.weeks);
  const days: DaysDrift | null =
    rate.weeks >= ENOUGH_WEEKS && Math.abs(observed - input.stated.daysPerWeek) >= DRIFT_MARGIN
      ? { stated: input.stated.daysPerWeek, observed, weeks: rate.weeks }
      : null;

  /**
   * One direction only, and only for the two answers that describe a
   * *phase*. "New" and "coming back" stop being true on their own; a
   * climber calling themselves intermediate when the app thinks otherwise
   * is a coaching judgement about grades and years, and the app second-
   * guessing that from a row count would be worse than saying nothing.
   */
  const stated = input.stated.experience;
  const past = history(input.sessions, input.today);
  const experience: ExperienceDrift | null =
    (stated === 'new' || stated === 'returning') &&
    past.count >= SETTLED_SESSIONS &&
    past.weeks >= SETTLED_WEEKS
      ? { stated, sessions: past.count, weeks: past.weeks }
      : null;

  return { days, experience };
}

/** "You said 4 days a week. Your log says 2, over the last 8 weeks." */
export function describeDaysDrift(drift: DaysDrift): string {
  const says = drift.observed === 1 ? '1 day' : `${drift.observed} days`;
  return `You said ${drift.stated} days a week. Your log says ${says}, over the last ${drift.weeks} weeks.`;
}

const PHASE: Record<ExperienceDrift['stated'], string> = {
  new: 'new to climbing',
  returning: 'coming back',
};

/**
 * "You said you were coming back. The log has 60 sessions across 21 weeks."
 *
 * Not "since then": the span is measured from the first logged session,
 * which is not necessarily after the answer was given, and a sentence
 * claiming otherwise would be the app being precise about something it
 * does not know.
 */
export function describeExperienceDrift(drift: ExperienceDrift): string {
  return `You said you were ${PHASE[drift.stated]}. The log has ${drift.sessions} sessions across ${drift.weeks} weeks.`;
}
