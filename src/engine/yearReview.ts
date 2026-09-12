/**
 * The year in review (PLAN.md M10).
 *
 * ## The comparison problem
 *
 * A year-in-review that compares a part-finished year against a full one
 * tells every climber they are having a worse year until roughly December.
 * On 9 September, "142 sessions vs 198 last year" is not a fact about your
 * training, it is a fact about the calendar.
 *
 * So the previous period is always the *same slice* of the previous year:
 * 1 January to the same day, matching what has actually elapsed. Once a
 * year is over, the slice is the whole year and the comparison is complete.
 * `complete` says which of the two you are reading.
 *
 * ## Honesty
 *
 * A quiet year has to read as a quiet year. Nothing here reframes a decline
 * as a "rebuilding phase", and nothing hides a comparison because it is
 * unflattering — a log you cannot trust to tell you when you climbed less
 * is a log you cannot trust when it says you climbed more. Injury and life
 * are the usual reasons a year is quiet, and neither is a failure the app
 * has any business editorialising about.
 *
 * ## A season is a range
 *
 * Climbers think in seasons more than calendar years, and a season is just a
 * date range. `reviewRange` is the real function; `reviewYear` picks the
 * range for you. A season picker on top of this needs no new maths.
 */

import type { Session } from '@/db/sessions';
import { sessionHeight } from './altimeter';
import { deriveCareer, type CareerMilestone } from './career';
import type { PersonalRecord } from './derive';
import { daysBetween, startOfWeek, today as todayKey } from './dates';
import { gradeOrdinal, type GradeDisplay } from './grades';
import { outcomeOf, sortBlocks, type BlockRecord } from './blocks';
import { joinCapped } from './phrase';
import { isRestSession } from './rest';

export interface Totals {
  sessions: number;
  hours: number;
  feet: number;
  sends: number;
  outdoorDays: number;
  restDays: number;
  drills: number;
  boulderSends: number;
  routeSends: number;
}

export interface MonthBar {
  /** `YYYY-MM`. */
  month: string;
  sessions: number;
  feet: number;
}

export interface Gap {
  days: number;
  from: string;
  to: string;
}

export interface Review {
  from: string;
  to: string;
  /**
   * Blocks that started inside the range, newest first (PLAN.md M87).
   *
   * Keyed on the start rather than the end: a block is a thing you *began*,
   * and one straddling New Year belongs to the year you committed to it.
   */
  blocks: BlockRecord[];
  totals: Totals;
  /** The matching slice of the previous year, or null when there is none. */
  previous: Totals | null;
  months: MonthBar[];
  busiest: MonthBar | null;
  hardestBoulder: PersonalRecord | null;
  hardestRoute: PersonalRecord | null;
  /** Milestones the log crossed inside the range. */
  firsts: CareerMilestone[];
  bestWeek: { week: string; sessions: number } | null;
  /** The longest stretch with nothing logged. */
  longestGap: Gap | null;
}

export interface YearReview extends Review {
  year: number;
  /** False while the year is still running — see the module doc. */
  complete: boolean;
}

export interface ReviewInput {
  sessions: Session[];
  records: PersonalRecord[];
  display?: GradeDisplay;
  today?: string;
  /** Blocks run, for the one line this could never say (PLAN.md M87). */
  blocks?: readonly BlockRecord[];
}

const EMPTY = (): Totals => ({
  sessions: 0,
  hours: 0,
  feet: 0,
  sends: 0,
  outdoorDays: 0,
  restDays: 0,
  drills: 0,
  boulderSends: 0,
  routeSends: 0,
});

/** Years with anything logged in them, newest first. */
export function availableYears(sessions: Session[]): number[] {
  const years = new Set<number>();
  for (const session of sessions) {
    if (session.completed) years.add(Number(session.date.slice(0, 4)));
  }
  return [...years].sort((a, b) => b - a);
}

function isRest(session: Session): boolean {
  return isRestSession(session);
}

export function totalsFor(sessions: Session[], from: string, to: string): Totals {
  const totals = EMPTY();
  const outdoor = new Set<string>();
  for (const session of sessions) {
    if (!session.completed) continue;
    if (session.date < from || session.date > to) continue;
    totals.sessions += 1;
    totals.hours += (session.durationMin ?? 0) / 60;
    totals.feet += sessionHeight(session);
    if (isRest(session)) totals.restDays += 1;
    if (session.drillDone === true) totals.drills += 1;
    if (session.mode === 'outdoor') outdoor.add(session.date);
    for (const climb of session.climbs) {
      if (climb.result !== 'send') continue;
      totals.sends += climb.count;
      if (climb.scale === 'V') totals.boulderSends += climb.count;
      else totals.routeSends += climb.count;
    }
  }
  totals.outdoorDays = outdoor.size;
  totals.hours = Math.round(totals.hours * 10) / 10;
  totals.feet = Math.round(totals.feet);
  return totals;
}

export function reviewRange(input: ReviewInput, from: string, to: string): Review {
  const inRange = input.sessions.filter(
    (s) => s.completed && s.date >= from && s.date <= to,
  );
  const sorted = [...inRange].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const months = new Map<string, MonthBar>();
  const weeks = new Map<string, number>();
  for (const session of sorted) {
    const key = session.date.slice(0, 7);
    const bar = months.get(key) ?? { month: key, sessions: 0, feet: 0 };
    bar.sessions += 1;
    bar.feet += sessionHeight(session);
    months.set(key, bar);
    const week = startOfWeek(session.date);
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  for (const bar of months.values()) bar.feet = Math.round(bar.feet);

  // Every month in the range, empty ones included: a chart that omits the
  // months you did not climb puts February next to July and reads as an
  // unbroken run.
  const monthList = monthKeys(from, to).map(
    (month) => months.get(month) ?? { month, sessions: 0, feet: 0 },
  );
  const busiest = monthList.reduce<MonthBar | null>(
    (best, bar) =>
      bar.sessions > 0 && (best === null || bar.sessions > best.sessions) ? bar : best,
    null,
  );

  const bestWeek = [...weeks.entries()].reduce<{ week: string; sessions: number } | null>(
    (best, [week, sessions]) =>
      best === null || sessions > best.sessions ? { week, sessions } : best,
    null,
  );

  const records = input.records.filter((r) => r.date >= from && r.date <= to);
  const hardest = (scale: 'V' | 'YDS'): PersonalRecord | null =>
    records
      .filter((r) => r.scale === scale)
      .reduce<PersonalRecord | null>(
        (best, r) =>
          best === null || gradeOrdinal(r.scale, r.grade) > gradeOrdinal(best.scale, best.grade)
            ? r
            : best,
        null,
      );

  const career = deriveCareer({
    sessions: input.sessions,
    records: input.records,
    ...(input.display ? { display: input.display } : {}),
    today: to,
  });

  return {
    from,
    to,
    totals: totalsFor(input.sessions, from, to),
    previous: null,
    months: monthList,
    busiest,
    hardestBoulder: hardest('V'),
    hardestRoute: hardest('YDS'),
    firsts: career.achieved.filter((m) => m.date >= from && m.date <= to),
    bestWeek,
    longestGap: longestGap(sorted, from, to),
    blocks: sortBlocks(input.blocks ?? []).filter((b) => b.startDate >= from && b.startDate <= to),
  };
}

/** Every `YYYY-MM` from one date's month to another's, inclusive. */
function monthKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const lastYear = Number(to.slice(0, 4));
  const lastMonth = Number(to.slice(5, 7));
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    out.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * The longest stretch with nothing logged, measured between logged days and
 * anchored at both ends of the range.
 *
 * Anchoring matters: a climber who logged nothing until October has had a
 * nine-month gap, and starting the measurement at their first session would
 * hide exactly the thing worth seeing.
 */
function longestGap(sorted: Session[], from: string, to: string): Gap | null {
  if (sorted.length === 0) return null;
  let worst: Gap | null = null;
  const consider = (a: string, b: string) => {
    const days = daysBetween(a, b);
    if (days > 1 && (worst === null || days > worst.days)) worst = { days, from: a, to: b };
  };
  consider(from, sorted[0]!.date);
  for (let i = 1; i < sorted.length; i += 1) {
    consider(sorted[i - 1]!.date, sorted[i]!.date);
  }
  consider(sorted.at(-1)!.date, to);
  return worst;
}

export function reviewYear(input: ReviewInput, year: number): YearReview {
  const today = input.today ?? todayKey();
  const currentYear = Number(today.slice(0, 4));
  const from = `${year}-01-01`;
  const complete = year < currentYear;
  // A part-finished year is only ever compared with the same part of the
  // year before it.
  const to = complete ? `${year}-12-31` : today < from ? from : today;

  const review = reviewRange(input, from, to);
  const previousFrom = `${year - 1}-01-01`;
  const previousTo = complete ? `${year - 1}-12-31` : `${year - 1}${to.slice(4)}`;
  const hasPrevious = input.sessions.some(
    (s) => s.completed && s.date >= previousFrom && s.date <= previousTo,
  );

  return {
    ...review,
    previous: hasPrevious ? totalsFor(input.sessions, previousFrom, previousTo) : null,
    year,
    complete,
  };
}

export interface Change {
  label: string;
  now: number;
  then: number;
  /** Signed difference. Presented as-is: a decline is shown as a decline. */
  delta: number;
  /** Null when last year's figure was zero — a ratio against nothing. */
  percent: number | null;
  unit: string;
}

/**
 * The comparison, unspun.
 *
 * Returned in a fixed order rather than sorted by how good it looks, so a
 * year that went badly does not have its one improvement floated to the top.
 */
export const CHANGE_ROWS: [string, keyof Totals, string][] = [
  ['Sessions', 'sessions', ''],
  ['Hours', 'hours', 'h'],
  ['Sends', 'sends', ''],
  ['Days on rock', 'outdoorDays', ''],
  ['Height', 'feet', 'ft'],
];

/**
 * Two sets of totals, compared.
 *
 * Split out from `changes` so the four-week comparison on the Progress page
 * inherits the same rows in the same order rather than growing its own —
 * the "not sorted by flattery" rule is only a rule while there is one list.
 */
export function changesBetween(now: Totals, then: Totals | null): Change[] {
  if (then === null) return [];
  return CHANGE_ROWS.map(([label, key, unit]) => ({
    label,
    now: now[key],
    then: then[key],
    delta: Math.round((now[key] - then[key]) * 10) / 10,
    percent: then[key] === 0 ? null : Math.round(((now[key] - then[key]) / then[key]) * 100),
    unit,
  }));
}

export function changes(review: YearReview): Change[] {
  return changesBetween(review.totals, review.previous);
}

/**
 * A few plain sentences about the range.
 *
 * No superlatives, no encouragement, and nothing that reads as a verdict on
 * the climber. Where a number is down it says so; where the app cannot know
 * why, it does not guess.
 */
export function describeYear(review: YearReview): string[] {
  const out: string[] = [];
  const { totals } = review;

  if (totals.sessions === 0) {
    return [
      review.complete
        ? 'Nothing logged this year.'
        : 'Nothing logged yet this year.',
    ];
  }

  out.push(
    `${totals.sessions} ${totals.sessions === 1 ? 'session' : 'sessions'}, ${round(totals.hours)} hours, ${totals.feet.toLocaleString()} feet climbed.`,
  );

  if (totals.outdoorDays > 0) {
    out.push(
      `${totals.outdoorDays} ${totals.outdoorDays === 1 ? 'day' : 'days'} on real rock.`,
    );
  }

  if (review.busiest) out.push(`${monthName(review.busiest.month)} was the busiest month, with ${review.busiest.sessions}.`);

  if (review.longestGap && review.longestGap.days >= 21) {
    const from = monthName(review.longestGap.from.slice(0, 7));
    const to = monthName(review.longestGap.to.slice(0, 7));
    out.push(
      from === to
        ? `The longest quiet stretch ran ${review.longestGap.days} days in ${from}.`
        : `The longest quiet stretch ran ${review.longestGap.days} days, from ${from} to ${to}.`,
    );
  }

  if (review.blocks.length > 0) {
    const done = review.blocks.filter((b) => outcomeOf(b, review.to) === 'completed').length;
    // Chronological here, though `review.blocks` is newest-first for the
    // history list: a year reads forwards — you did this, then that.
    const unique = [...new Set([...review.blocks].reverse().map((b) => b.name))];
    out.push(
      `${review.blocks.length === 1 ? 'One block' : `${review.blocks.length} blocks`} started: ${joinCapped(unique, 3)}${
        done > 0 ? `. ${done === review.blocks.length ? 'All' : done} run to the end.` : '.'
      }`,
    );
  }

  const sessions = changes(review).find((c) => c.label === 'Sessions');
  if (sessions && sessions.percent !== null) {
    const scope = review.complete ? 'than the year before' : 'than the same stretch last year';
    if (sessions.delta > 0) out.push(`${sessions.delta} more ${scope}.`);
    else if (sessions.delta < 0) out.push(`${Math.abs(sessions.delta)} fewer ${scope}.`);
    else out.push(`The same number ${scope}.`);
  }

  return out;
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** `2026-03` → `March`. */
export function monthName(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ][index] ?? month;
}
