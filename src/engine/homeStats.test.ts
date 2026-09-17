import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { sessionLoad } from './derive';
import { gymSummary } from './gym';
import { STAT_WEEKS, homeStats, showStat, weeklyStats } from './homeStats';

/**
 * The three numbers Home shows (PLAN.md M239).
 *
 * Most of what is worth testing is that nothing here is a second definition
 * of anything: a send counts the way `gymSummary` counts it, a load is
 * `sessionLoad`, and the ratio is `loadTrend`'s.
 */

const TODAY = '2026-09-17';

const day = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 8,
    durationMin: 60,
    climbs: [],
    ...patch,
  }) as Session;

const sent = (grade: string, count = 1) =>
  ({ id: `s${grade}${count}`, grade, scale: 'V', count, result: 'send' }) as never;
const tried = (grade: string, count = 1) =>
  ({ id: `t${grade}${count}`, grade, scale: 'V', count, result: 'attempt' }) as never;

describe('the weeks behind the numbers', () => {
  it('returns one point per week, oldest first, ending today', () => {
    const weeks = weeklyStats([], STAT_WEEKS, TODAY);
    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)!.week).toBe(TODAY);
    expect(weeks[0]!.week).toBe(addDays(TODAY, -49));
  });

  /**
   * Bucketed by age, not by calendar week — `weeklyHeight`'s rule. The
   * rightmost bucket is the last seven days and always ends today, so the
   * newest point never shrinks to a Monday's worth of training on a Monday
   * and grows back across the week.
   */
  it('puts the last seven days in the newest bucket whatever day it is', () => {
    const log = [day(TODAY), day(addDays(TODAY, -6)), day(addDays(TODAY, -7))];
    const weeks = weeklyStats(log, STAT_WEEKS, TODAY);
    expect(weeks.at(-1)!.load).toBe(16);
    expect(weeks.at(-2)!.load).toBe(8);
  });

  it('drops anything outside the window, in either direction', () => {
    const log = [day(addDays(TODAY, -56)), day(addDays(TODAY, 3))];
    expect(weeklyStats(log, STAT_WEEKS, TODAY).every((w) => w.load === 0)).toBe(true);
  });

  it('counts a session that was planned and never done as nothing', () => {
    const log = [day(TODAY, { completed: false, climbs: [sent('V4', 3)] })];
    const [week] = weeklyStats(log, 1, TODAY);
    expect(week).toMatchObject({ load: 0, sends: 0 });
  });

  /**
   * A session with no RPE has no load, which is not the same as a load of
   * zero — `derive.ts` went to real trouble over that distinction and this
   * must not undo it by summing a null as a number.
   */
  it('adds nothing for a session that recorded no effort', () => {
    const noEffort = day(TODAY, { climbs: [sent('V4', 2)] });
    delete (noEffort as { rpe?: number }).rpe;
    expect(sessionLoad(noEffort)).toBeNull();
    const [week] = weeklyStats([noEffort], 1, TODAY);
    // The load is untouched; the sends still count, because they happened.
    expect(week).toMatchObject({ load: 0, sends: 2 });
  });

  /** Through `gymSummary`, so "sent" means here what it means everywhere. */
  it('counts sends the way the rest of the app does', () => {
    const climbs = [sent('V4', 3), tried('V6', 4), sent('V5', 1)];
    expect(gymSummary(climbs).sends).toBe(4);
    expect(weeklyStats([day(TODAY, { climbs })], 1, TODAY)[0]!.sends).toBe(4);
  });
});

describe('the three tiles', () => {
  const busy = Array.from({ length: 40 }, (_, i) =>
    day(addDays(TODAY, -i * 2), { rpe: 7, durationMin: 90, climbs: [sent('V4', 2)] }),
  );

  it('is load, then the ratio, then sends', () => {
    expect(homeStats(busy, TODAY).stats.map((s) => s.label)).toEqual([
      'Week load',
      'A : C',
      'Sends',
    ]);
  });

  it('gives each one its own weeks to be read against', () => {
    const { stats } = homeStats(busy, TODAY);
    expect(stats[0]!.series).toHaveLength(STAT_WEEKS);
    expect(stats[2]!.series).toHaveLength(STAT_WEEKS);
    // Every series carries more than its own latest value, or the tile is a
    // number with a decoration under it.
    for (const stat of stats) expect(stat.series.length, stat.label).toBeGreaterThan(1);
  });

  it('reads the newest week as the headline number', () => {
    const { stats } = homeStats(busy, TODAY);
    const weeks = weeklyStats(busy, STAT_WEEKS, TODAY);
    expect(stats[0]!.value).toBe(weeks.at(-1)!.load);
    expect(stats[2]!.value).toBe(weeks.at(-1)!.sends);
  });

  /**
   * Only the ratio is a judgement — below 0.8 and above 1.3 mean something,
   * where a load of 1,240 means nothing on its own. A screen colours on this
   * rather than on the label, which would be a string comparison deciding a
   * colour.
   */
  it('marks the ratio as the only judged number', () => {
    expect(homeStats(busy, TODAY).stats.map((s) => s.judged)).toEqual([false, true, false]);
  });

  /**
   * A week the ratio cannot be computed for is left out rather than sent in
   * as a zero. `loadTrend` draws those as gaps for the same reason: a zero
   * reads as a week of no training instead of a week with no answer.
   */
  it('leaves a week with no computable ratio out of the ratio line', () => {
    const thin = [day(TODAY), day(addDays(TODAY, -2))];
    const { stats } = homeStats(thin, TODAY);
    expect(stats[1]!.series.length).toBeLessThan(STAT_WEEKS);
    expect(stats[1]!.series).not.toContain(0);
  });

  it('says so when the whole window is empty', () => {
    expect(homeStats([], TODAY).empty).toBe(true);
    expect(homeStats(busy, TODAY).empty).toBe(false);
  });

  it('is not empty for a log of rest days, which are real days', () => {
    const rests = [day(TODAY, { rpe: 2, durationMin: 30 })];
    expect(homeStats(rests, TODAY).empty).toBe(false);
  });
});

describe('how a number reads', () => {
  it('writes a count with thousands and a ratio to two places', () => {
    expect(showStat({ label: '', value: 1240, decimals: 0, series: [], judged: false })).toBe('1,240');
    expect(showStat({ label: '', value: 0.9, decimals: 2, series: [], judged: true })).toBe('0.90');
  });
});
