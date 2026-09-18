/**
 * "I was away" (PLAN.md M275).
 *
 * `coach.ts` writes the problem down in one line: *"The app cannot tell 'did
 * not train' from 'did not log'"*. Every reading of a quiet fortnight is a
 * guess between those two, and the climber is the only one who knows which.
 * Nothing in the app has ever let them say.
 *
 * ## What was already there, and why it is not enough
 *
 * Three things cover part of this ground, and each stops short.
 *
 * **M100's "Mark the days you trained"** writes a blank completed `Session`
 * per picked day. It is the right gesture and the wrong record: a session is
 * one day, so a fortnight is fourteen taps; it has no mode, so a fortnight on
 * rock is stored as fourteen indoor days; and it carries no score, so the
 * grid draws Céüse in the same lightest shade as a fortnight of rest days.
 *
 * **M163's trip objective** gives a trip a name and one date. `trip.ts` then
 * guesses a fortnight around it, and says so: `TRIP_WINDOW_DAYS` is *"the one
 * number in this module that nothing measures"*. The guess exists because
 * there is nowhere to write the dates.
 *
 * **M188's comedown** rewords the layoff tip when a peak or a dated trip
 * explains the quiet. It needs one of those two, so a climber with flu and no
 * objective still gets *"24 days since you logged anything"*.
 *
 * ## The record
 *
 * A date range, a kind, and a line of text. It is **not a session**: it never
 * creates load, never counts as training, never scores. It is a statement
 * *about* a stretch of silence — the one fact the log cannot hold — and its
 * whole job is to stop the app asserting things about that stretch it has no
 * way to know.
 *
 * ## Why the kind matters
 *
 * Because the readings differ. A fortnight in Font and a fortnight with flu
 * are both silence, and they are opposite facts about fitness: one is the
 * heaviest climbing of the year, the other is nothing. `wasClimbing` is the
 * only thing any reader needs to ask, and it is asked here so no reader has
 * to hold a list of kinds.
 *
 * ## It rewords and never suppresses
 *
 * M163's rule, kept: *"Suppressing the app's loudest warning at the
 * highest-risk fortnight of a climber's year would be a regression wearing a
 * fix's clothes."* A marker is a sentence the climber typed, possibly weeks
 * ago, about days nobody checked. That is enough to change what a tip says
 * and never enough to take the tip away.
 */

import { daysBetween, isDateKey } from './dates';

/**
 * Why the log is quiet.
 *
 * Four, because four is what changes a reading. `trip` and `rest` are the two
 * the coach already gropes at; `injured` is the one `bodyLoad.ts` would want
 * and cannot see; `life` is the honest catch-all, and having it is what stops
 * a climber filing a work trip under `rest` and telling the app they recovered.
 */
export type AwayKind = 'trip' | 'rest' | 'injured' | 'life';

export const AWAY_KINDS: readonly AwayKind[] = ['trip', 'rest', 'injured', 'life'];

/** How each kind reads on a screen. */
export const AWAY_LABELS: Record<AwayKind, string> = {
  trip: 'Climbing trip',
  rest: 'Deliberate rest',
  injured: 'Injured',
  life: 'Life',
};

/**
 * Longest a note may be, so the field cannot become a journal.
 *
 * The same reasoning `partners.ts` gives its `NAME_LIMIT`: this is a label —
 * "Font '26", "broken wrist" — and the journal already exists for anything
 * longer.
 */
export const NOTE_LIMIT = 60;

export interface AwayPeriod {
  id: string;
  /** First day away, inclusive. */
  from: string;
  /** Last day away, inclusive. A single day is `from === to`. */
  to: string;
  kind: AwayKind;
  /** What the climber called it. Empty is normal and means nothing is wrong. */
  note?: string;
  updatedAt: string;
}

/**
 * Whether this kind means the climber was climbing anyway.
 *
 * Only `trip` does. The distinction is the point of the record: a reader that
 * treats all four alike has thrown away the only thing the climber told it.
 */
export function wasClimbing(kind: AwayKind): boolean {
  return kind === 'trip';
}

/**
 * Whether a stored value is a usable period.
 *
 * Guarded rather than trusted because this comes back out of IndexedDB, where
 * an older schema or a hand-edited backup can put anything. `isDateKey` before
 * the comparison for the reason `trip.ts` gives: a half-typed date reaches the
 * store from a text field, and its arithmetic is NaN — so a malformed range
 * would silently read as covering nothing, or everything.
 */
export function isAwayPeriod(value: unknown): value is AwayPeriod {
  if (typeof value !== 'object' || value === null) return false;
  const period = value as Partial<AwayPeriod>;
  if (typeof period.id !== 'string' || period.id === '') return false;
  if (typeof period.from !== 'string' || !isDateKey(period.from)) return false;
  if (typeof period.to !== 'string' || !isDateKey(period.to)) return false;
  if (period.to < period.from) return false;
  if (!AWAY_KINDS.includes(period.kind as AwayKind)) return false;
  if (period.note !== undefined && typeof period.note !== 'string') return false;
  return true;
}

/** A typed note, cleaned, or undefined when there is nothing in it. */
export function cleanNote(raw: string): string | undefined {
  const note = raw.trim().replace(/\s+/g, ' ').slice(0, NOTE_LIMIT);
  return note.length === 0 ? undefined : note;
}

/** How many days a period covers, counting both ends. */
export function awayLength(period: AwayPeriod): number {
  return daysBetween(period.from, period.to) + 1;
}

/**
 * The period covering a date, or null.
 *
 * The longest wins where two overlap, which is a choice: a climber who marks
 * "June" as a trip and then marks one wet day inside it as rest has said two
 * true things, and the one that explains the *stretch* is the one a reader
 * asking about a stretch wants. Nothing stops the overlap because refusing it
 * would mean validating one range against every other on every keystroke.
 */
export function awayOn(
  periods: readonly AwayPeriod[] | undefined,
  date: string,
): AwayPeriod | null {
  let best: AwayPeriod | null = null;
  for (const period of periods ?? []) {
    if (date < period.from || date > period.to) continue;
    if (best === null || awayLength(period) > awayLength(best)) best = period;
  }
  return best;
}

/**
 * Every period touching a window, longest first.
 *
 * Overlap rather than containment: the window a caller has is usually a gap in
 * the log, and a trip that started before the gap and ended inside it is
 * exactly the case this exists for.
 */
export function awayOverlapping(
  periods: readonly AwayPeriod[] | undefined,
  from: string,
  to: string,
): AwayPeriod[] {
  return (periods ?? [])
    .filter((period) => period.from <= to && period.to >= from)
    .sort((a, b) => awayLength(b) - awayLength(a) || a.from.localeCompare(b.from));
}

/**
 * The period that best explains a quiet stretch, or null.
 *
 * **Not simply the longest overlap.** A gap of 24 days with three days of flu
 * in it is not explained by the flu, and a tip that named it would be telling
 * the climber their three-week layoff was a cold. So a period has to cover
 * enough of the gap to be the reason for it, and `EXPLAINS_FRACTION` says how
 * much.
 */
export const EXPLAINS_FRACTION = 0.5;

export function explainsGap(
  periods: readonly AwayPeriod[] | undefined,
  from: string,
  to: string,
): AwayPeriod | null {
  const span = daysBetween(from, to) + 1;
  if (span <= 0) return null;
  for (const period of awayOverlapping(periods, from, to)) {
    // Days of the gap this period actually covers, not days of the period:
    // a month in Spain either side of a four-day gap explains all four.
    const start = period.from > from ? period.from : from;
    const end = period.to < to ? period.to : to;
    if ((daysBetween(start, end) + 1) / span >= EXPLAINS_FRACTION) return period;
  }
  return null;
}

/** How a period reads in a sentence: the note if there is one, else the kind. */
export function awayName(period: AwayPeriod): string {
  return period.note ?? AWAY_LABELS[period.kind].toLowerCase();
}

export function newAwayId(): string {
  return `away-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
