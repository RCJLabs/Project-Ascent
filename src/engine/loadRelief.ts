/**
 * Which session to drop, when the ratio is running hot (PLAN.md M318).
 *
 * The coach has warned about a load spike since M162 and says the true and
 * useless thing: *"an easier week now costs a week"*. Easier how. The
 * climber is looking at a week with four sessions in it and the app, which
 * knows which four and what each one has weighed every other time, offers a
 * link to the calendar.
 *
 * ## It is arithmetic about the plan, not a prediction about the climber
 *
 * `engine/objectives.ts` sets the rule the whole app answers to — *"no
 * projection that has not been earned"* — and `peak.ts` says how it stays
 * inside it: it projects a **prescription**, never an outcome. This does
 * the same. *"The week as planned comes to 1.8×"* is a statement about what
 * the plan weighs, checkable against the plan. *"You will be at 1.8×"*
 * would be a claim about what a person is going to do, and this says no
 * such thing.
 *
 * ## Estimated from this climber's own sessions of that type
 *
 * A planned session has no load: load is RPE × hours and neither exists
 * until it has been trained. What does exist is every other time they have
 * done that session type. The median of those is the estimate — their own
 * number, for their own session, not a constant from a table.
 *
 * And when a type has no history, the whole suggestion is withheld rather
 * than guessed at. A ranking that puts an unknown session anywhere is a
 * ranking with an invented number in it, and the tip it feeds names one
 * session out of four. Getting that wrong is worse than the generic advice
 * it replaces, which is at least not specific enough to be wrong.
 */

import type { Session } from '@/db/sessions';
import { CHRONIC_DAYS, buildLoadIndex, sessionLoad, windows } from './derive';
import { addDays } from './dates';

/** A session the plan puts in the rest of this week, and what it usually weighs. */
export interface PlannedLoad {
  date: string;
  typeId: string;
  name: string;
  /** The median load of this climber's own sessions of this type. */
  load: number;
  /** How many of those the median came from. */
  from: number;
}

export interface LoadRelief {
  /** What is left this week, heaviest first. */
  planned: PlannedLoad[];
  /** The ratio the week comes to with all of them in it. */
  asPlanned: number;
  /** The one worth dropping, and what the week comes to without it. */
  drop: { session: PlannedLoad; without: number } | null;
}

export interface ReliefInput {
  sessions: Session[];
  /** The remaining planned sessions, from today to the end of the week. */
  ahead: { date: string; typeId: string; name: string }[];
  today: string;
}

/** Below this much off the week's ratio, dropping a session is not worth the sentence. */
export const WORTH_DROPPING = 0.05;

/** Two is enough to have a median that is not simply the one time. */
export const MIN_HISTORY = 2;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * The ratio on a day, given the loads that would sit behind it.
 *
 * `windows` is `deriveLoad`'s own arithmetic, exported at M318 rather than
 * restated here — the one thing this file must not do is become a second
 * opinion about what a climber's ratio is.
 */
function ratioOn(byDate: Map<string, number>, end: string): number | null {
  const daily: { load: number }[] = [];
  for (let i = CHRONIC_DAYS - 1; i >= 0; i -= 1) {
    daily.push({ load: byDate.get(addDays(end, -i)) ?? 0 });
  }
  const { acute, chronic } = windows(daily);
  return chronic > 0 ? acute / chronic : null;
}

export function loadRelief(input: ReliefInput): LoadRelief | null {
  const { sessions, ahead, today } = input;
  if (ahead.length === 0) return null;

  // Every planned day has to be ahead of the acute window's end, or the
  // week it describes is not the week the ratio would see.
  const last = ahead.reduce((latest, s) => (s.date > latest ? s.date : latest), today);

  const past = new Map<string, number[]>();
  for (const session of sessions) {
    if (!session.completed || session.sessionTypeId === undefined) continue;
    const load = sessionLoad(session);
    if (load === null) continue;
    past.set(session.sessionTypeId, [...(past.get(session.sessionTypeId) ?? []), load]);
  }

  const planned: PlannedLoad[] = [];
  for (const day of ahead) {
    const history = past.get(day.typeId) ?? [];
    // Withheld whole, not per session: see the header. A ranking with one
    // invented number in it ranks wrongly and still sounds certain.
    if (history.length < MIN_HISTORY) return null;
    planned.push({ ...day, load: median(history), from: history.length });
  }
  planned.sort((a, b) => b.load - a.load || a.date.localeCompare(b.date));

  const index = buildLoadIndex(sessions);
  const base = new Map<string, number>();
  for (let i = CHRONIC_DAYS - 1; i >= 0; i -= 1) {
    const date = addDays(last, -i);
    base.set(date, index.byDate.get(date)?.load ?? 0);
  }

  const withAll = new Map(base);
  for (const day of planned) withAll.set(day.date, (withAll.get(day.date) ?? 0) + day.load);
  const asPlanned = ratioOn(withAll, last);
  if (asPlanned === null) return null;

  /**
   * The heaviest one, and only when dropping it is worth saying.
   *
   * Heaviest rather than "whichever gets under 1.3": a session that would
   * land the week exactly in the sweet spot is a nicer sentence and a worse
   * suggestion, because it is chosen by the answer rather than by the
   * training. The biggest piece of the week is the one a coach would point
   * at, and what it saves is then reported rather than aimed for.
   */
  const heaviest = planned[0]!;
  const without = new Map(withAll);
  without.set(heaviest.date, (without.get(heaviest.date) ?? 0) - heaviest.load);
  const relieved = ratioOn(without, last);

  // And only when it buys something. "1.94× with it and 1.93× without" is a
  // suggestion to skip a session for nothing, which is worse advice than
  // the general sentence it replaces.
  const worthIt = relieved !== null && asPlanned - relieved >= WORTH_DROPPING;
  return {
    planned,
    asPlanned,
    drop: worthIt ? { session: heaviest, without: relieved } : null,
  };
}
