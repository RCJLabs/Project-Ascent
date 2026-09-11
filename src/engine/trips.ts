/**
 * The trip (PLAN.md M88c).
 *
 * `sessionNumber` is labelled **"Day of the trip"**, asked by four of
 * Outdoor Climbing's five session types, and nothing in the app knows what
 * a trip is. The closest it comes is the year review's "days on real rock",
 * which is a count and not a story: four days at Stanage in June and four
 * scattered Saturdays are the same number and nothing like the same year.
 *
 * **The climber's own answer is the authority, and the dates are the
 * fallback.** A session marked day one of a trip *starts* a trip, full
 * stop — that is what the field means and the whole reason this milestone
 * exists. Where nobody numbered anything, outdoor days close together are
 * taken as one trip, which is a guess, and the reading says which of the
 * two it used.
 *
 * **No stored trip, and no name.** Like the venues of M88b this is a
 * reading of records the app already has, so there is nothing to curate and
 * it works on history. The cost is that a trip cannot be *named* — a name
 * is not derivable from anything — so a trip is known by where it was, and
 * a climber who wants to call it "Font '26" has nowhere to write that.
 */

import type { Session } from '@/db/sessions';
import { daysBetween } from './dates';
import { gradeOrdinal, type GradeScale } from './grades';
import { venueKey } from './venues';
import { joinCapped } from './phrase';

/**
 * Rest days inside a trip that do not end it.
 *
 * Two, so "climb, rest, rest, climb" holds together and a weekend followed
 * by the next weekend does not. **My number**: a trip with bad weather in
 * the middle is still a trip, and two consecutive weekends are two trips
 * to everyone I have ever climbed with.
 */
export const TRIP_GAP = 2;

export interface TripSend {
  scale: GradeScale;
  grade: string;
}

export interface Trip {
  /** The first day, which is also the id. */
  from: string;
  to: string;
  /** Days actually climbed. */
  days: number;
  /** Calendar days from first to last, so "four days over a week" shows. */
  span: number;
  /** Places named on it, most days first. Empty when none were named. */
  places: string[];
  sends: number;
  /** The hardest send of the trip, per ladder it appeared on. */
  best: TripSend[];
  /**
   * The climber numbered the days themselves, so the grouping is their
   * answer rather than the app's guess about the calendar.
   */
  numbered: boolean;
}

export interface TripInput {
  sessions: readonly Session[];
  from?: string;
  to?: string;
  /** Rest days inside a trip that do not end it. */
  gap?: number;
}

const dayOne = (session: Session): boolean => Number(session.fields?.sessionNumber) === 1;

export function trips(input: TripInput): Trip[] {
  const outdoor = input.sessions
    .filter((s) => s.completed && s.mode === 'outdoor')
    .filter((s) => (input.from === undefined || s.date >= input.from) && (input.to === undefined || s.date <= input.to))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (outdoor.length === 0) return [];

  const gap = input.gap ?? TRIP_GAP;
  const runs: Session[][] = [];
  for (const session of outdoor) {
    const current = runs[runs.length - 1];
    const previous = current?.[current.length - 1];
    // Day one starts a trip whatever the calendar says, and a long enough
    // gap ends one whatever the climber said.
    const starts =
      current === undefined ||
      previous === undefined ||
      dayOne(session) ||
      daysBetween(previous.date, session.date) > gap + 1;
    if (starts) runs.push([session]);
    else current.push(session);
  }

  return runs.map(describe);
}

function describe(run: Session[]): Trip {
  const first = run[0]!;
  const last = run[run.length - 1]!;

  const places = new Map<string, { name: string; first: string; days: Set<string> }>();
  for (const session of run) {
    const raw = session.fields?.location;
    if (typeof raw !== 'string' || venueKey(raw) === '') continue;
    const key = venueKey(raw);
    const existing = places.get(key) ?? { name: raw.trim(), first: session.date, days: new Set<string>() };
    existing.days.add(session.date);
    places.set(key, existing);
  }

  const best = new Map<GradeScale, string>();
  let sends = 0;
  for (const session of run) {
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      sends += climb.count;
      const standing = best.get(climb.scale);
      if (standing === undefined || gradeOrdinal(climb.scale, climb.grade) > gradeOrdinal(climb.scale, standing)) {
        best.set(climb.scale, climb.grade);
      }
    }
  }

  return {
    from: first.date,
    to: last.date,
    days: new Set(run.map((s) => s.date)).size,
    span: daysBetween(first.date, last.date) + 1,
    places: [...places.values()]
      // Most days, then the one you got to first — a road trip reads as
      // the order you drove it, not as an alphabetical list.
      .sort((a, b) => b.days.size - a.days.size || a.first.localeCompare(b.first) || a.name.localeCompare(b.name))
      .map((p) => p.name),
    sends,
    best: [...best.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([scale, grade]) => ({ scale, grade })),
    // The whole run, not just its first day: a climber who numbered day one
    // and then stopped is a climber who told the app where a trip started
    // and nothing about where it ended.
    numbered: run.every((s) => Number.isFinite(Number(s.fields?.sessionNumber))),
  };
}

/** "Stanage and Burbage North" — where a trip was, or when it has no place. */
export function tripName(trip: Trip): string {
  if (trip.places.length === 0) return 'Somewhere outdoors';
  return joinCapped(trip.places, 2);
}

/**
 * The trips worth calling trips.
 *
 * One outdoor day is a day out, not a trip. Everything longer is one, and
 * that includes a weekend — which is what most trips are.
 */
export function realTrips(list: readonly Trip[]): Trip[] {
  return list.filter((t) => t.days >= 2);
}

/** "Three trips, 11 days out. The longest was five days at Stanage." */
export function describeTrips(list: readonly Trip[]): string | null {
  const real = realTrips(list);
  if (real.length === 0) return null;

  const days = real.reduce((n, t) => n + t.days, 0);
  const longest = real.reduce((best, t) => (t.days > best.days ? t : best), real[0]!);
  const lead =
    real.length === 1
      ? `One trip, ${days === 1 ? '1 day' : `${days} days`} out.`
      : `${real.length} trips, ${days} days out.`;
  return `${lead} The longest was ${longest.days} days at ${tripName(longest)}.`;
}
