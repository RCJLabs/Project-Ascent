import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { buildHeatGrid, describeConsistency } from './consistency';
import { addDays } from './dates';
import { describeTrend, loadTrend } from './loadTrend';
import { projectGrade, weeklyProgression, type WeekPoint } from './progress';

/**
 * "Now", and the windows that are not now (PLAN.md M247).
 *
 * Three cards on Progress speak in the present tense about a period that has
 * ended, or divide by a window the climber was never in. Driving the page
 * against a climber who trained for two months and then stopped, and against
 * one who had logged a single session, produced all three — and the whole
 * suite passed without a test pinning one of them.
 */

const TODAY = '2026-09-17';

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 90,
    climbs: [{ id: `c${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

/** Trained every third day for two months, then stopped five weeks ago. */
const STOPPED = Array.from({ length: 24 }, (_, i) => session(addDays(TODAY, -35 - i * 3)));
/** The same climber, still going. */
const TRAINING = Array.from({ length: 24 }, (_, i) => session(addDays(TODAY, -1 - i * 3)));

describe('the ratio that was read a month ago', () => {
  const said = (sessions: Session[]) => describeTrend(loadTrend({ sessions, to: TODAY }));

  /**
   * The measured sentence was **"Now 0.00 — not enough history."** — the
   * number taken from the last *known* point, the zone word from the last
   * point in the window, and the two were four weeks apart. A reading and
   * its own denial, joined by the word "now".
   */
  it('does not call a month-old reading now', () => {
    const text = said(STOPPED);
    expect(text).not.toMatch(/^Now /);
    expect(text).not.toMatch(/Now .* — not enough history/);
  });

  it('says there is none, and what the last one was', () => {
    const text = said(STOPPED);
    expect(text).toMatch(/^No current reading — /);
    expect(text, 'the last reading, with its age').toMatch(/The last was \d\.\d\d, \d+ weeks ago\./);
    // The age is said once. It was "No reading for 23 days ... 3 weeks ago".
    expect(text.match(/weeks ago|days ago/g)).toHaveLength(1);
  });

  /** A climber still training gets the sentence it always got. */
  it('still reports a current ratio as now', () => {
    const text = said(TRAINING);
    expect(text).toMatch(/^Now \d\.\d\d — /);
    expect(text).not.toMatch(/not enough history/);
  });

  /**
   * The mechanism, pinned apart from the copy: the number and the zone word
   * have to come off the same point, and `latestOn` is what makes that
   * checkable.
   */
  it('reads the number and the zone from the same day', () => {
    const stopped = loadTrend({ sessions: STOPPED, to: TODAY });
    expect(stopped.latestOn).not.toBe(stopped.to);
    expect(stopped.latest).not.toBeNull();
    const going = loadTrend({ sessions: TRAINING, to: TODAY });
    expect(going.latestOn).toBe(going.to);
  });
});

describe('the grade trend that stopped five weeks ago', () => {
  /** A send of `grade` in each of the listed weeks, counted back from today. */
  const weeksAgo = (grade: string, list: number[]): WeekPoint[] =>
    weeklyProgression(
      list.map((w) => session(addDays(TODAY, -7 * w), {
        id: `w${w}`,
        climbs: [{ id: `w${w}`, grade, scale: 'V', count: 1, result: 'send' }],
      })),
      'V',
      12,
      TODAY,
    );

  it('does not say you are holding steady when you have stopped', () => {
    const p = projectGrade(weeksAgo('V4', [5, 6, 7, 8, 9, 10, 11]), 'V');
    expect(p.summary).not.toContain('Holding steady');
    expect(p.summary).toMatch(/Nothing sent in the last 5 weeks/);
    expect(p.summary).toContain('your grades held steady');
    expect(p.confident).toBe(false);
  });

  /** One quiet week is a quiet week, for anybody. */
  it('is not tripped by a single week off', () => {
    const p = projectGrade(weeksAgo('V4', [1, 2, 3, 4, 5, 6]), 'V');
    expect(p.summary).toBe('Holding steady at your current grade.');
    expect(p.confident).toBe(true);
  });

  /**
   * And the tolerance is the climber's own rhythm, not a number picked in
   * the engine. The same two-week pause is nothing for one climber and a
   * stop for the other, and three weeks is a stop only for the weekly one.
   */
  it('measures the pause against how often they send', () => {
    // Every third week: two quiet weeks are a Tuesday.
    expect(projectGrade(weeksAgo('V4', [2, 5, 8, 11]), 'V').summary).not.toMatch(/Nothing sent/);
    // Every week, then three quiet ones: that is a stop.
    expect(projectGrade(weeksAgo('V4', [3, 4, 5, 6, 7, 8]), 'V').summary).toMatch(
      /Nothing sent in the last 3 weeks/,
    );
    // And the same three weeks against the every-third-week rhythm is not.
    expect(projectGrade(weeksAgo('V4', [3, 6, 9, 12]), 'V').summary).not.toMatch(/Nothing sent/);
  });

  /** The worst case it prevented: a rising trend, extrapolated past a stop. */
  it('never promises a grade to a climber who has stopped', () => {
    const rising = weeklyProgression(
      [
        session(addDays(TODAY, -77), { id: 'a', climbs: [{ id: 'a', grade: 'V3', scale: 'V', count: 1, result: 'send' }] }),
        session(addDays(TODAY, -70), { id: 'b', climbs: [{ id: 'b', grade: 'V4', scale: 'V', count: 1, result: 'send' }] }),
        session(addDays(TODAY, -63), { id: 'c', climbs: [{ id: 'c', grade: 'V5', scale: 'V', count: 1, result: 'send' }] }),
        session(addDays(TODAY, -56), { id: 'd', climbs: [{ id: 'd', grade: 'V6', scale: 'V', count: 1, result: 'send' }] }),
      ],
      'V',
      12,
      TODAY,
    );
    const p = projectGrade(rising, 'V');
    expect(p.summary).toMatch(/Nothing sent in the last 8 weeks/);
    expect(p.summary).toContain('still going up');
    expect(p.weeksToNext).toBeNull();
  });
});

describe('the rate over a year you were not there for', () => {
  const said = (sessions: Session[]) =>
    describeConsistency(buildHeatGrid({ sessions, to: TODAY }));

  /**
   * One session, two days old, read **"1 day logged over 53 weeks · 0.0 a
   * week"**. The gap count in the same function has always measured from the
   * first logged day — its comment says the empty months before a climber
   * installed the app are not a lapse — and the sentence beside it divided by
   * the whole grid.
   */
  it('does not divide a first session by a year', () => {
    const text = said([session(addDays(TODAY, -2))]);
    expect(text).not.toContain('53 weeks');
    expect(text, 'nor report a climber who trained on Tuesday as zero a week').not.toContain(
      '0.0 a week',
    );
    // No rate at all: three days of logging divides to 2.3 a week, which is
    // as invented as the 0.0 was, in the other direction.
    expect(text, text).not.toMatch(/\d\.\d a week/);
    expect(text).toContain('1 day logged in your first week');
  });

  /** A rate needs a week. Once there is one, it is printed. */
  it('starts reporting a rate at a week', () => {
    const sessions = [session(addDays(TODAY, -8)), session(addDays(TODAY, -2))];
    expect(said(sessions)).toMatch(/2 days logged over 1 week · 1\.6 a week/);
  });

  /** And a long log still measures from the day it started, not the grid. */
  it('measures a long log from its first day', () => {
    const sessions = Array.from({ length: 20 }, (_, i) => session(addDays(TODAY, -i * 3)));
    const grid = buildHeatGrid({ sessions, to: TODAY });
    expect(grid.loggingDays).toBe(58);
    expect(grid.elapsedDays, 'the grid is still the grid').toBeGreaterThan(grid.loggingDays);
    expect(said(sessions)).toContain('20 days logged over 8 weeks');
  });
});
