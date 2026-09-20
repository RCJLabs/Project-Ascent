import { fireEvent, screen } from '@testing-library/react';
import { monthLabel, today } from '@/engine/dates';

/**
 * Put the month holding a date on screen (PLAN.md M299).
 *
 * The calendar opens on today's month, and a fixture reaching for
 * `addDays(TODAY, 2)` or `addDays(TODAY, -5)` is reaching for a day that is
 * in that month for most of it and in the next or the previous one at
 * either end — so six test files failed on the days of the month where it
 * is not. Those are days the app has to work on like any other, and days
 * the suite had never been run as.
 *
 * Borrowed days are not the answer: the grid draws the days either side of
 * the month, but only as many as its first and last rows need, and a month
 * ending on a Saturday borrows none at all.
 *
 * So the fixture names the day it means and this walks to it, from
 * whatever month is showing, reading the heading a climber reads rather
 * than assuming where the page was left.
 */
export function showMonthOf(date: string): void {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const wanted = monthLabel(year, month - 1);
  const heading = (): HTMLElement => {
    const header = screen.getAllByLabelText('Previous month')[0]?.parentElement;
    const span = header?.querySelector('span');
    if (!span) throw new Error('no month heading beside the Previous month button');
    return span;
  };

  // A step at a time, checking after each: the page holds the month in its
  // own state and the only way to know where it is now is to read it.
  // Twenty-four is two years in either direction, which is further than any
  // fixture here goes and near enough that a heading which never matches
  // fails rather than spins.
  for (let step = 0; step <= 24; step++) {
    const showing = heading().textContent ?? '';
    if (showing === wanted) return;
    // `new Date(y, m, 1)` sorts the month names for us: comparing the
    // labels would be comparing two localised strings alphabetically.
    const [shownYear, shownMonth] = shownAt(showing, year, month);
    const back = shownYear * 12 + shownMonth > year * 12 + month;
    fireEvent.click(screen.getAllByLabelText(back ? 'Previous month' : 'Next month')[0]!);
  }
  throw new Error(`the calendar never reached ${wanted}`);
}

/**
 * Which month a heading names, found by trying them rather than parsed.
 *
 * `monthLabel` is `toLocaleDateString`, so the only reliable way back from
 * one of its strings is to ask it for the months around the one wanted and
 * see which answer matches.
 */
function shownAt(showing: string, year: number, month: number): [number, number] {
  for (let step = -24; step <= 24; step++) {
    const at = new Date(year, month - 1 + step, 1);
    if (monthLabel(at.getFullYear(), at.getMonth()) === showing) {
      return [at.getFullYear(), at.getMonth() + 1];
    }
  }
  throw new Error(`the calendar is showing ${showing}, which is not within two years of the day wanted`);
}

/**
 * A day behind us, counted back from the end of last month (PLAN.md M299).
 *
 * The calendar fixtures reached for `addDays(TODAY, -3)` and
 * `addDays(TODAY, -9)`, which are in the month the calendar opens on for
 * most of it and in the month before at the start of one — and the grid
 * borrows only as many days as its first row needs, so on the first of a
 * month that begins on a Sunday there is nothing of the month before on
 * screen at all.
 *
 * Counting back from the end of last month keeps the numbers those tests
 * were written with, puts them all inside one month, and puts them behind
 * us on every day of the year. `showMonthOf` puts that month on screen.
 */
export function daysBeforeLastMonthEnded(days: number, from: string = today()): string {
  const [year, month] = from.split('-').map(Number) as [number, number];
  // Day 0 of a month is the last day of the one before it.
  const end = new Date(year, month - 1, 0);
  end.setDate(end.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}
