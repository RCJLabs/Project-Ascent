/**
 * Dates as the calendar, week and year pages lay them out (PLAN.md M345).
 *
 * Out of `dates.ts`, which everything needs at boot: a month grid, its
 * label, and which month, week or year is the current one are asked only by
 * the pages that draw them.
 */

import { addDays, formatDate, fromKey, startOfWeek, toKey } from './dates';

/**
 * Whether a string names a year this app could hold sessions for.
 *
 * `/year/:year` read `Number(params.year) || years[0] || thisYear`, which
 * quietly showed the current year for `nope` and for `0`, and rendered
 * `-5`, `2026.5` and `1e9` as headings.
 */
export function isYearKey(value: string, now: number = new Date().getFullYear()): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  // No climbing log starts before modern grading, and a year that has not
  // begun has nothing to review.
  return year >= 1900 && year <= now;
}

/** Calendar grid for a month: whole weeks, Sunday-aligned, covering it. */
export function monthGrid(year: number, month: number): string[] {
  const first = toKey(new Date(year, month, 1));
  const last = toKey(new Date(year, month + 1, 0));
  const start = startOfWeek(first);
  const days: string[] = [];
  let cursor = start;
  while (cursor <= last || days.length % 7 !== 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    if (days.length > 42) break;
  }
  return days;
}

/**
 * Whether the period on screen is the one a date falls in (PLAN.md M147).
 *
 * The month and the week each page with arrows and each offer a way back,
 * drawn only when it would move you. Pure and here rather than inline in
 * the two pages, because the rule cannot otherwise be tested against a
 * fixed date: written inline, both read `today()`, and both mutations that
 * break them — comparing the month without its year, and the week by its
 * date rather than its Sunday — survive on the days of the year where the
 * two happen to agree.
 */
export function isThisMonth(year: number, month: number, on: string): boolean {
  const now = fromKey(on);
  // Both halves. September 2027 is not September 2026, and comparing the
  // month alone hides the way back from every anniversary.
  return now.getFullYear() === year && now.getMonth() === month;
}

/** Whether a week, by any date in it, is the week a date falls in. */
export function isThisWeek(date: string, on: string): boolean {
  return startOfWeek(date) === startOfWeek(on);
}

export function monthLabel(year: number, month: number): string {
  return formatDate(new Date(year, month, 1), { month: 'long', year: 'numeric' });
}
