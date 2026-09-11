import type { Session } from '@/db/sessions';
import { coverage, describeCoverage } from './thinLog';
import { addDays, fromKey, startOfWeek, today as todayKey } from './dates';
import { sessionLoad } from './derive';

/**
 * A year of days, as a grid (PLAN.md M23).
 *
 * The app could show a month total, a twelve-week line and a career
 * timeline, and none of them answered the question a climber actually asks
 * of their log: *have I been consistent?* A monthly total hides a fortnight
 * off — two weeks lost and two weeks doubled up read as an ordinary month —
 * and consistency is the thing that moves grades.
 *
 * Everything here is pure and dateless in the sense that matters: it takes
 * the day it should end on, so a test never depends on when it runs.
 */

/** 0 is "nothing logged". 1–4 are load, lightest to heaviest. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatDay {
  date: string;
  level: HeatLevel;
  /** Summed session load for the day: RPE × hours. */
  load: number;
  sessions: number;
  /**
   * Something was logged but it carried no load — a rest day, or a session
   * with no RPE or duration on it.
   *
   * Kept separate from level 0 because "I rested on purpose" and "I did not
   * open the app" are opposite facts, and a grid that draws them the same
   * colour tells the climber the first is a failure.
   */
  rested: boolean;
  outdoor: boolean;
  deload: boolean;
  /** After the end day: drawn as a hole, never as a miss. */
  future: boolean;
}

export interface MonthMark {
  label: string;
  /** Index into `weeks` of the column where this month starts. */
  column: number;
}

export interface HeatGrid {
  /** Columns, oldest first. Each is seven days, Sunday first. */
  weeks: HeatDay[][];
  months: MonthMark[];
  from: string;
  to: string;
  /**
   * The load cut points between levels 1–2, 2–3 and 3–4.
   *
   * Quantiles of *this climber's* loads in *this window*, not absolute
   * numbers. An absolute scale would render a beginner's whole first year as
   * one flat colour, and this chart is about whether the days are there at
   * all. The legend says "lighter, heavier" rather than printing numbers,
   * because the numbers are only meaningful against themselves.
   */
  thresholds: [number, number, number];
  /** Days with anything logged, rest included. */
  loggedDays: number;
  /**
   * How many of those hold nothing but the fact that you turned up
   * (PLAN.md M100).
   *
   * Reported because marking a day trained is one tap from the calendar now,
   * and a rate built partly on assertions should say so — the coverage rule
   * `checkIns` states before any of its own numbers.
   */
  bareDays: number;
  /** Days in the window up to the end day, so a rate can be honest. */
  elapsedDays: number;
  /** Longest run with nothing logged, counted from the first logged day. */
  longestGap: number;
  longestStreak: number;
}

export interface HeatInput {
  sessions: readonly Session[];
  /** The last day the grid covers. Defaults to today. */
  to?: string;
  /** How many week columns. 53 covers a year including the partial week. */
  weeks?: number;
}

/**
 * Cut points between the four load levels.
 *
 * `(n - 1) * fraction`, not `n * fraction`: with four loads the latter puts
 * the 0.75 quantile *on* the largest value, so the heaviest day compares
 * `<=` against itself and lands in level 3 — nothing could ever reach level
 * 4, and the top of the scale was unreachable.
 *
 * The nudges keep the three ordered when a log has few distinct loads. A
 * climber whose sessions are all RPE 7 for an hour collapses every quantile
 * onto one number, and three equal cut points would put every day at the
 * top; instead the whole log renders as one shade, which is the truth about
 * it.
 */
function cutPoints(loads: number[]): [number, number, number] {
  const sorted = [...loads].sort((x, y) => x - y);
  const at = (fraction: number) =>
    sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) * fraction)]!;
  const EPS = 1e-9;
  const a = Math.max(at(0.25), EPS);
  const b = Math.max(at(0.5), a + EPS);
  const c = Math.max(at(0.75), b + EPS);
  return [a, b, c];
}

function levelFor(load: number, [a, b, c]: [number, number, number]): HeatLevel {
  if (load <= 0) return 0;
  if (load <= a) return 1;
  if (load <= b) return 2;
  if (load <= c) return 3;
  return 4;
}

export function buildHeatGrid(input: HeatInput): HeatGrid {
  const to = input.to ?? todayKey();
  const columns = input.weeks ?? 53;

  // Sunday-aligned so every column is a whole week and the rows are always
  // the same weekday — the whole point of the shape.
  const lastWeekStart = startOfWeek(to);
  const from = addDays(lastWeekStart, -(columns - 1) * 7);

  interface DayTotals {
    load: number;
    sessions: number;
    rested: boolean;
    outdoor: boolean;
    deload: boolean;
  }
  const byDate = new Map<string, DayTotals>();

  for (const session of input.sessions) {
    if (!session.completed) continue;
    if (session.date < from || session.date > to) continue;
    const load = sessionLoad(session);
    const existing = byDate.get(session.date);
    byDate.set(session.date, {
      load: (existing?.load ?? 0) + load,
      sessions: (existing?.sessions ?? 0) + 1,
      // A day is "rested" only while nothing on it carried load.
      rested: (existing?.rested ?? true) && load <= 0,
      outdoor: (existing?.outdoor ?? false) || session.mode === 'outdoor',
      deload: (existing?.deload ?? false) || session.deload === true,
    });
  }

  const thresholds = cutPoints([...byDate.values()].map((d) => d.load).filter((l) => l > 0));

  const weeks: HeatDay[][] = [];
  const months: MonthMark[] = [];
  let loggedDays = 0;
  let elapsedDays = 0;
  let firstLogged: string | null = null;

  for (let w = 0; w < columns; w++) {
    const weekStart = addDays(from, w * 7);
    const days: HeatDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      const totals = byDate.get(date);
      const future = date > to;
      if (!future) elapsedDays += 1;
      if (totals) {
        loggedDays += 1;
        if (firstLogged === null) firstLogged = date;
      }
      days.push({
        date,
        level: totals ? levelFor(totals.load, thresholds) : 0,
        load: totals?.load ?? 0,
        sessions: totals?.sessions ?? 0,
        rested: totals?.rested ?? false,
        outdoor: totals?.outdoor ?? false,
        deload: totals?.deload ?? false,
        future,
      });
    }
    weeks.push(days);

    // A month is labelled on the first column whose Sunday falls in it, so
    // the label sits over the block it names rather than a week early.
    const label = fromKey(weekStart).toLocaleDateString(undefined, { month: 'short' });
    if (months.length === 0 || months[months.length - 1]!.label !== label) {
      months.push({ label, column: w });
    }
  }

  // Gaps and streaks are counted from the first logged day: the empty months
  // before a climber installed the app are not a lapse, and colouring them
  // as one would make the number meaningless.
  let longestGap = 0;
  let longestStreak = 0;
  let gap = 0;
  let streak = 0;
  if (firstLogged !== null) {
    for (const day of weeks.flat()) {
      if (day.date < firstLogged || day.future) continue;
      if (day.sessions > 0) {
        streak += 1;
        gap = 0;
        longestStreak = Math.max(longestStreak, streak);
      } else {
        gap += 1;
        streak = 0;
        longestGap = Math.max(longestGap, gap);
      }
    }
  }

  return {
    weeks,
    months,
    from,
    to,
    thresholds,
    loggedDays,
    // Counted from the sessions rather than from the grid: a day is bare only
    // when everything on it is, which the per-day totals cannot say.
    bareDays: coverage(input.sessions, from, to).bare,
    elapsedDays,
    longestGap,
    longestStreak,
  };
}

/**
 * One sentence about the grid, for the people who will not read a picture.
 *
 * Deliberately flat: it reports the longest gap without calling it a
 * failure, because the app does not know whether that fortnight was an
 * injury, a holiday or a newborn.
 */
export function describeConsistency(grid: HeatGrid): string {
  if (grid.loggedDays === 0) return 'Nothing logged in this window yet.';
  const weeks = Math.round(grid.elapsedDays / 7);
  const rate = grid.loggedDays / Math.max(1, grid.elapsedDays / 7);
  const parts = [
    `${grid.loggedDays} day${grid.loggedDays === 1 ? '' : 's'} logged over ${weeks} weeks`,
    `${rate.toFixed(1)} a week`,
  ];
  if (grid.longestStreak > 1) parts.push(`longest run ${grid.longestStreak} days`);
  if (grid.longestGap > 0) {
    parts.push(`longest gap ${grid.longestGap} day${grid.longestGap === 1 ? '' : 's'}`);
  }
  const thin = describeCoverage({ days: grid.loggedDays, bare: grid.bareDays });
  if (thin !== null) parts.push(thin);
  return `${parts.join(' · ')}.`;
}
