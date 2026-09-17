/**
 * What you actually lifted, read back (PLAN.md M98).
 *
 * ## The hole this fills
 *
 * `Session.completedExercises` was a list of names. Iron Grip's Hammer phase
 * states its goal as **"Progress added load weekly"** and prescribes
 * `load: '85-90% max added weight'` — one static string for four weeks —
 * and the app's only question about it was whether you did it. Eleven phase
 * goals across seven programs describe a progression like that, and M33's
 * `constantDose` says the same thing from the other side: twelve blocks run
 * an identical dose all block because the progression "lives in intensity,
 * grade choice and session length — dimensions this model has no field for".
 *
 * The block report is not the answer either. It reads `metrics`, which are
 * assessments: tested at a phase boundary, a handful of times a block. What
 * happened between tests — the working weight that crept up every week —
 * was written nowhere.
 *
 * ## Nothing is inferred
 *
 * Every number here was typed by the climber. A prescription's dose is prose
 * (`'3-5'`, `'60-70% max added weight'`, `'BW+15lb'`) and parsing it into a
 * starting value would put a number in the log that nobody did — the same
 * mistake `templates.ts` refuses when it declines to copy climbs forward.
 * The logger offers the *last* entry as a one-tap repeat, which is a number
 * the climber made, and the tap is what makes it a claim.
 *
 * ## Better is not a claim this module makes
 *
 * `blockReport` can say a metric moved the right way because every `Metric`
 * declares `higherIsBetter`. An exercise line declares nothing. More load is
 * usually progress; more reps at less load might be a deload, a phase
 * change, or a bad day, and the app cannot tell which. So a movement here is
 * reported as *from → to* per dimension and never as better or worse.
 *
 * Pure: sessions in, readings out.
 */

import type { LoggedExercise, Session, SetOutcome } from '@/db/sessions';
import { toDisplay, unitLabel, type UnitSystem } from './units';

/** One exercise on one day. */
export interface LoggedPoint {
  date: string;
  sessionId: string;
  entry: LoggedExercise;
}

/** The dimensions an exercise can be logged in, in the order they read. */
export const DIMENSIONS = ['sets', 'reps', 'hold', 'load'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/**
 * Whether anything was written down beyond the tick.
 *
 * A bare `{ name }` means "I did this" and is the whole of what the old
 * `completedExercises` could say. It is not a reading, so it never becomes a
 * point on a series or a number to repeat.
 */
export function hasNumbers(entry: LoggedExercise): boolean {
  return DIMENSIONS.some((d) => entry[d] !== undefined);
}

/**
 * The three ways a set of sets can go, hardest-held first (PLAN.md M238).
 *
 * Ordered the way the chips read, which is also the order the catalogue's
 * rules step down: `solid` earns the increment, `hard` repeats the week,
 * `failed` takes one off. See `SetOutcome` in db/sessions.ts for why there
 * are three.
 */
export const SET_OUTCOMES = ['solid', 'hard', 'failed'] as const;

/**
 * The word on the chip, and the word in the sheet.
 *
 * The catalogue's own — *"failed early"* is Iron Grip's phrase, not a
 * verdict this app invented. It is also the technical word for the thing
 * that happened, and softening it to something kinder would make the one
 * state that triggers *"take one off"* ambiguous. Falling short is a fact
 * the climber typed, and this module does not call it a fault anywhere.
 */
export const OUTCOME_WORD: Record<SetOutcome, string> = {
  solid: 'Solid',
  hard: 'Hard',
  failed: 'Failed',
};

/** What each one claims, for the line that explains the three. */
export const OUTCOME_MEANING: Record<SetOutcome, string> = {
  solid: 'every set with something left',
  hard: 'finished, at the limit',
  failed: 'a set did not finish',
};

/** Case- and space-insensitive, so "Max Hangs" and "max hangs" are one line. */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Every reading for one exercise, oldest first. Ticks without numbers are
 *  not readings and are left out. */
export function exerciseSeries(sessions: readonly Session[], name: string): LoggedPoint[] {
  const key = exerciseKey(name);
  const points: LoggedPoint[] = [];
  for (const session of sessions) {
    if (!session.completed) continue;
    for (const entry of session.exercises ?? []) {
      if (exerciseKey(entry.name) !== key) continue;
      if (!hasNumbers(entry)) continue;
      points.push({ date: session.date, sessionId: session.id, entry });
    }
  }
  return points.sort((a, b) =>
    a.date === b.date ? a.sessionId.localeCompare(b.sessionId) : a.date < b.date ? -1 : 1,
  );
}

/**
 * The range a prescribed count asks for. `'3-5'` is three to five, `'5'` is
 * five to five, and anything this cannot read is null rather than a guess.
 */
export function doseRange(value: string | undefined): { min: number; max: number } | null {
  if (!value) return null;
  const range = /^(\d+)\s*[-–]\s*(\d+)/.exec(value.trim());
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const flat = /^(\d+)/.exec(value.trim());
  return flat ? { min: Number(flat[1]), max: Number(flat[1]) } : null;
}

export type DoseVerdict = 'met' | 'short' | 'over';

/**
 * What was logged, against what the day asked for (PLAN.md M130).
 *
 * **Derived, and nothing is stored.** The entry carries no `blockId` or
 * `phaseId`, so before this the app could ask whether a climber did a thing
 * with that name and not whether they did what was asked. It does not need
 * a field: the day already knows its own prescription, and since M127, M128
 * and M129 that prescription is week-accurate and deload-accurate, so the
 * comparison is against what was actually asked on the day rather than what
 * the phase opened at.
 *
 * Null where there is nothing to compare — an unread count, a line with no
 * sets prescribed, an entry with no number typed. Falling short is not a
 * fault and is not called one; it is a fact the climber put there, and the
 * only reason to surface it is that next week's load depends on it.
 */
export function againstPrescription(
  entry: LoggedExercise,
  prescribedSets: string | undefined,
): { verdict: DoseVerdict; asked: string; did: number } | null {
  const range = doseRange(prescribedSets);
  if (range === null || entry.sets === undefined) return null;
  const verdict: DoseVerdict =
    entry.sets < range.min ? 'short' : entry.sets > range.max ? 'over' : 'met';
  return { verdict, asked: prescribedSets!.trim(), did: entry.sets };
}

/**
 * The newest reading strictly before `before`.
 *
 * Strictly, because the logger asks this while editing a session and today's
 * own half-filled row is not "last time". Two sessions on one day are
 * ordered by id, which is how `sessionId` encodes the second one.
 */
export function lastLogged(
  sessions: readonly Session[],
  name: string,
  before: string,
): LoggedPoint | null {
  const earlier = exerciseSeries(sessions, name).filter((p) => p.date < before);
  return earlier.at(-1) ?? null;
}

/** Load, in the unit the climber reads, with its sign and its word. */
export function describeLoad(load: number, units: UnitSystem): string {
  if (load === 0) return 'bodyweight';
  const shown = toDisplay(Math.abs(load), 'lbs', units);
  const word = unitLabel('lbs', units);
  return `${load < 0 ? '−' : '+'}${shown} ${word}`;
}

/**
 * One reading as a sentence: "3 × 5 at +22.5 kg", "5 × 10s at bodyweight".
 *
 * Empty when there is nothing but a tick, so a caller can use the emptiness
 * rather than printing a stray "at".
 */
export function describeEntry(entry: LoggedExercise, units: UnitSystem): string {
  const { sets, reps, hold, load } = entry;
  // Reps win the "sets ×" slot where both were given, because "5 × 3" is how
  // a set of three is written and "5 × 10s" is how a hang is; an exercise
  // logged with all three says the hold in the clear rather than losing it.
  const per = reps !== undefined ? `${reps}` : hold !== undefined ? `${hold}s` : null;

  let dose: string | null = null;
  if (sets !== undefined && per !== null) dose = `${sets} × ${per}`;
  else if (sets !== undefined) dose = `${sets} set${sets === 1 ? '' : 's'}`;
  else if (reps !== undefined) dose = `${reps} rep${reps === 1 ? '' : 's'}`;
  else if (hold !== undefined) dose = `${hold}s`;
  if (dose !== null && reps !== undefined && hold !== undefined) dose += ` (${hold}s hold)`;

  const weight = load === undefined ? null : `at ${describeLoad(load, units)}`;
  return [dose, weight].filter((part): part is string => part !== null).join(' ');
}

/** What one dimension did between two readings. */
export interface DimensionChange {
  dimension: Dimension;
  from: number;
  to: number;
}

export interface ExerciseMovement {
  name: string;
  first: LoggedPoint;
  last: LoggedPoint;
  /** Readings inside the window, first and last included. */
  readings: number;
  /** Only the dimensions that are in both readings and differ. */
  changed: DimensionChange[];
}

/**
 * What the working numbers did across a window — a block, usually.
 *
 * Two rules keep this honest. A dimension that is missing from either end is
 * not compared: logging sets one week and load the next is two different
 * things measured, not a change. And an exercise that did not move is left
 * out rather than drawn as a flat line — the rule `projectHistory` set, that
 * below the threshold a number is an anecdote. One reading falls out of that
 * second rule for free, since its first and last are the same reading; an
 * explicit length check beside it survived every mutation, which is how it
 * was found to be saying nothing.
 *
 * Ordered by how much was logged, then alphabetically, so the exercise a
 * climber has been tracking all block leads.
 */
export function exerciseMovement(
  sessions: readonly Session[],
  from: string,
  to: string,
): ExerciseMovement[] {
  const inWindow = sessions.filter((s) => s.completed && s.date >= from && s.date <= to);

  const byKey = new Map<string, LoggedPoint[]>();
  for (const session of inWindow) {
    for (const entry of session.exercises ?? []) {
      if (!hasNumbers(entry)) continue;
      const key = exerciseKey(entry.name);
      const list = byKey.get(key) ?? [];
      list.push({ date: session.date, sessionId: session.id, entry });
      byKey.set(key, list);
    }
  }

  const out: ExerciseMovement[] = [];
  for (const points of byKey.values()) {
    points.sort((a, b) =>
      a.date === b.date ? a.sessionId.localeCompare(b.sessionId) : a.date < b.date ? -1 : 1,
    );
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last) continue;

    const changed: DimensionChange[] = [];
    for (const dimension of DIMENSIONS) {
      const a = first.entry[dimension];
      const b = last.entry[dimension];
      if (a === undefined || b === undefined || a === b) continue;
      changed.push({ dimension, from: a, to: b });
    }
    if (changed.length === 0) continue;
    // The last reading's spelling, which is the one the climber typed most
    // recently, rather than whatever the first session happened to call it.
    out.push({ name: last.entry.name, first, last, readings: points.length, changed });
  }

  return out.sort((a, b) => (b.readings - a.readings) || a.name.localeCompare(b.name));
}

const DIMENSION_WORD: Record<Dimension, string> = {
  sets: 'sets',
  reps: 'reps',
  hold: 'hold',
  load: 'load',
};

/** "load +20 lb → +27.5 lb", for one row of the block report. */
export function describeChange(change: DimensionChange, units: UnitSystem): string {
  if (change.dimension === 'load') {
    return `load ${describeLoad(change.from, units)} → ${describeLoad(change.to, units)}`;
  }
  const suffix = change.dimension === 'hold' ? 's' : '';
  return `${DIMENSION_WORD[change.dimension]} ${change.from}${suffix} → ${change.to}${suffix}`;
}
