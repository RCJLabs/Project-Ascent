/**
 * The three numbers Home shows, and the weeks behind each (PLAN.md M239).
 *
 * Home has rendered the app's whole training picture as sentences. The load
 * engine, the ratio, the send count and the altimeter are all derived on
 * every pass and every one of them reached the front door as prose — *"2 of
 * 4 sessions · 8 sends this week"* — while `index.css` claimed the design
 * was "big numbers, generous whitespace".
 *
 * ## A number is a reading only next to the ones before it
 *
 * That is `loadTrend.ts`'s argument, in its own words: *"a single 0.99 is a
 * figure nobody trusts, because a ratio has no meaning without knowing
 * whether it arrived from 1.6 or from 0.6"*. It is as true of the load and
 * the sends, so each of the three carries its own eight weeks rather than
 * standing alone.
 *
 * ## Nothing here defines anything
 *
 * A second definition of a send or a load is how two screens start
 * disagreeing, so every number is read from the module that already owns it:
 * `sessionLoad` from `derive.ts`, sends through `gymSummary` — the rule
 * `OpenSessionCard` already follows, so that "sent" means on Home exactly
 * what it means everywhere else — and the ratio straight off `loadTrend`.
 * The bucketing is `altimeter.weeklyHeight`'s, which is the shape this is.
 */

import type { Session } from '@/db/sessions';
import { addDays, daysBetween, today as todayKey } from './dates';
import { sessionLoad } from './derive';
import { gymSummary } from './gym';
import { loadTrend } from './loadTrend';

/** One week of the log, as the two counts a tile draws. */
export interface WeekStat {
  /** Date the seven-day window opens. */
  week: string;
  /** Sum of `sessionLoad` over the week. RPE-hours, rounded. */
  load: number;
  /** Climbs sent, counted the way `gymSummary` counts them. */
  sends: number;
}

/** How many weeks a tile draws. Eight is two months — a block and a bit. */
export const STAT_WEEKS = 8;

/**
 * The last `weeks` weeks, oldest first, the current partial week last.
 *
 * Bucketed by age in days rather than by calendar week, which is
 * `weeklyHeight`'s rule: the rightmost bucket is *the last seven days* and
 * always ends today, so the newest point never shrinks to a Monday's worth
 * of training and then grows back across the week.
 */
export function weeklyStats(
  sessions: readonly Session[],
  weeks = STAT_WEEKS,
  today = todayKey(),
): WeekStat[] {
  const load = new Map<number, number>();
  const sends = new Map<number, number>();
  for (const session of sessions) {
    if (!session.completed) continue;
    const age = daysBetween(session.date, today);
    // `age < 0` is belt and braces, and a battery proved it: a session dated
    // in the future floors to a negative bucket, and the loop below only
    // ever reads buckets 0..weeks-1, so dropping the guard changes no
    // output today. It stays because it is the guard that keeps that true —
    // a bucketing that ever took `Math.abs` would fold tomorrow's session
    // into this week's totals, silently.
    if (age < 0 || age >= weeks * 7) continue;
    const bucket = Math.floor(age / 7);
    load.set(bucket, (load.get(bucket) ?? 0) + (sessionLoad(session) ?? 0));
    sends.set(bucket, (sends.get(bucket) ?? 0) + gymSummary(session.climbs ?? []).sends);
  }
  return Array.from({ length: weeks }, (_, i) => {
    const bucket = weeks - 1 - i;
    return {
      week: addDays(today, -7 * bucket),
      load: Math.round(load.get(bucket) ?? 0),
      sends: sends.get(bucket) ?? 0,
    };
  });
}

export interface HomeStat {
  /** The caption over the number. */
  label: string;
  /** The number, already rounded for reading. */
  value: number;
  /** One decimal place, for the ratio. */
  decimals: number;
  /** The eight weeks behind it, oldest first. */
  series: number[];
  /**
   * True where the number is a judgement rather than a count, so a screen
   * can colour it. Only the ratio is one.
   */
  judged: boolean;
}

export interface HomeStats {
  stats: HomeStat[];
  /** True when nothing has been logged in the whole window. */
  empty: boolean;
}

/**
 * The three tiles: load, ratio, sends.
 *
 * The ratio comes from `loadTrend` rather than from a second calculation,
 * and its series is sampled to one point a week so the three tiles are three
 * lines of the same length — a ninety-day daily line beside two eight-point
 * ones would make the tiles look like different kinds of thing.
 *
 * A week the ratio cannot be computed for contributes nothing rather than a
 * zero: `loadTrend` draws those as gaps for the same reason, and a zero
 * would read as a week of no training instead of a week with no answer.
 */
export function homeStats(
  sessions: readonly Session[],
  today = todayKey(),
  weeks = STAT_WEEKS,
): HomeStats {
  const byWeek = weeklyStats(sessions, weeks, today);
  const trend = loadTrend({ sessions, to: today, days: weeks * 7 });
  const known = new Map(
    trend.points.filter((p) => !p.unknown && p.acwr !== null).map((p) => [p.date, p.acwr!]),
  );

  // One point per week, taken at the week's last day, so the ratio line and
  // the two count lines step at the same rate.
  const ratios: number[] = [];
  for (const { week } of byWeek) {
    const end = addDays(week, 6);
    let found: number | null = null;
    for (let back = 0; back <= 6 && found === null; back += 1) {
      const at = known.get(addDays(end, -back));
      if (at !== undefined) found = at;
    }
    if (found !== null) ratios.push(Math.round(found * 100) / 100);
  }

  const latest = byWeek.at(-1)!;
  return {
    stats: [
      { label: 'Week load', value: latest.load, decimals: 0, series: byWeek.map((w) => w.load), judged: false },
      {
        label: 'A : C',
        value: trend.latest === null ? 0 : Math.round(trend.latest * 100) / 100,
        decimals: 2,
        series: ratios,
        judged: true,
      },
      { label: 'Sends', value: latest.sends, decimals: 0, series: byWeek.map((w) => w.sends), judged: false },
    ],
    empty: byWeek.every((w) => w.load === 0 && w.sends === 0),
  };
}

/** How the number reads: the count, or the ratio to two places. */
export function showStat(stat: HomeStat): string {
  return stat.decimals === 0 ? stat.value.toLocaleString() : stat.value.toFixed(stat.decimals);
}
