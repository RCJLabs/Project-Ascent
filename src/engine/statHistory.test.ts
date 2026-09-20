import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@/db/sessions';
import { COMPARE_DAYS, MIN_COMPARE_DAYS, compareStats, statsAsOf } from './statHistory';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import { deriveStats } from './stats';

const TODAY = '2026-09-10';

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
    warmup: true,
    climbs: [{ id: `c-${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' }],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

/** A run of sessions every other day, ending on `to`. */
function run(count: number, to: string): Session[] {
  return Array.from({ length: count }, (_, i) => session(addDays(to, -(count - 1 - i) * 2)));
}

/**
 * Pinned, not derived (PLAN.md M198).
 *
 * Every other use of this constant here builds its fixture out of it, so a
 * changed value moves the test with it and proves nothing — which is how a
 * mutation of `60` survived M198's first battery. `MIN_RATIO_DAYS` has had
 * the same pin in `loadModel.test.ts` since it was named.
 */
describe('the window a comparison needs', () => {
  it('is sixty days, which is when a "six months ago" stops being all zeroes', () => {
    expect(MIN_COMPARE_DAYS).toBe(60);
  });
});

describe('standing on an earlier day', () => {
  it('ignores everything after it', () => {
    const sessions = [...run(30, '2026-03-01'), ...run(30, TODAY)];
    const early = statsAsOf({ sessions, metrics: [], projects: [], asOf: '2026-03-01' });
    const now = statsAsOf({ sessions, metrics: [], projects: [], asOf: TODAY });
    expect(now.MEN).toBeGreaterThan(early.MEN);
  });

  it('is the same as the live derivation when standing on today', () => {
    // The comparison is only meaningful if the two shapes are computed the
    // same way; a snapshot with its own formula would call a difference in
    // definitions progress.
    //
    // This used to stand `statsAsOf` on 2030 beside `statsAsOf` on today
    // and expect the two to agree, which names the live derivation and
    // never calls it (PLAN.md M299). It is also no longer true, and should
    // not be: a snapshot stands on the day it is given, so four years of
    // silence decay the shape exactly as they do in the app. The claim the
    // comment makes is this one.
    const sessions = run(40, TODAY);
    const live = deriveStats({
      state: deriveClimberState(sessions, { today: TODAY }),
      metrics: [],
      projects: [],
    });
    expect(statsAsOf({ sessions, metrics: [], projects: [], asOf: TODAY })).toEqual({
      STR: live.STR.value,
      END: live.END.value,
      TEC: live.TEC.value,
      MEN: live.MEN.value,
      AGI: live.AGI.value,
    });
  });

  it('stands on the day it is given, not on the day it is read', () => {
    // The half of "as of" that `statsAsOf` used to skip: it dropped the
    // sessions after `asOf` and then derived the state against the real
    // clock, so the streak, the consecutive days and the rolling 30-day
    // counts inside a past shape were today's (PLAN.md M299). A snapshot
    // of a log that has not changed has to be the same snapshot tomorrow,
    // and this is the assertion that says so in the only way that can
    // fail — by reading it twice from two different days.
    const sessions = run(40, TODAY);
    const snapshot = () => statsAsOf({ sessions, metrics: [], projects: [], asOf: TODAY });
    const taken = snapshot();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(`${addDays(TODAY, 400)}T12:00:00`));
      expect(snapshot()).toEqual(taken);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns all five axes', () => {
    const stats = statsAsOf({ sessions: run(10, TODAY), metrics: [], projects: [], asOf: TODAY });
    expect(Object.keys(stats).sort()).toEqual(['AGI', 'END', 'MEN', 'STR', 'TEC']);
  });

  it('counts a project only once it was sent', () => {
    const projects = [
      { id: 'p1', name: 'A', grade: 'V5', scale: 'V', setting: 'indoor', status: 'sent', beta: [], sentDate: '2026-08-01' },
      { id: 'p2', name: 'B', grade: 'V5', scale: 'V', setting: 'indoor', status: 'sent', beta: [], sentDate: '2026-09-05' },
    ] as never;
    const sessions = run(40, TODAY);
    const early = statsAsOf({ sessions, metrics: [], projects, asOf: '2026-08-15' });
    const now = statsAsOf({ sessions, metrics: [], projects, asOf: TODAY });
    expect(now.MEN).toBeGreaterThan(early.MEN);
  });

  it('leaves out a send that cannot be dated', () => {
    // Only possible from a backup older than the field. Crediting it to a
    // past it has no date for would invent progress.
    const projects = [
      { id: 'p1', name: 'A', grade: 'V5', scale: 'V', setting: 'indoor', status: 'sent', beta: [] },
    ] as never;
    const sessions = run(40, TODAY);
    const withIt = statsAsOf({ sessions, metrics: [], projects, asOf: TODAY });
    const without = statsAsOf({ sessions, metrics: [], projects: [], asOf: TODAY });
    expect(withIt).toEqual(without);
  });
});

describe('whether a past shape is worth drawing', () => {
  it('declines for a climber who has not been here long', () => {
    // A ghost pinned to the centre is not a comparison, it is a picture of
    // the app not having existed yet.
    const result = compareStats({
      sessions: run(6, TODAY),
      metrics: [],
      projects: [],
      today: TODAY,
    });
    expect(result.then).toBeNull();
    expect(result.asOf).toBeNull();
  });

  it('declines for an empty log', () => {
    const result = compareStats({ sessions: [], metrics: [], projects: [], today: TODAY });
    expect(result.then).toBeNull();
    expect(result.historyDays).toBe(0);
  });

  it('offers one once there is enough behind them', () => {
    const sessions = [session(addDays(TODAY, -400)), ...run(40, TODAY)];
    const result = compareStats({ sessions, metrics: [], projects: [], today: TODAY });
    expect(result.then).not.toBeNull();
    expect(result.asOf).toBe(addDays(TODAY, -COMPARE_DAYS));
  });

  it('measures history from the first logged day', () => {
    const sessions = [session(addDays(TODAY, -MIN_COMPARE_DAYS - 1)), ...run(10, TODAY)];
    const result = compareStats({ sessions, metrics: [], projects: [], today: TODAY });
    expect(result.historyDays).toBe(MIN_COMPARE_DAYS + 1);
    expect(result.then).not.toBeNull();
  });

  it('ignores a session that was never completed', () => {
    const sessions = [
      session(addDays(TODAY, -400), { completed: false }),
      ...run(4, TODAY),
    ];
    expect(compareStats({ sessions, metrics: [], projects: [], today: TODAY }).then).toBeNull();
  });

  it('shows growth over the window', () => {
    const sessions = [...run(30, addDays(TODAY, -COMPARE_DAYS)), ...run(60, TODAY)];
    const result = compareStats({ sessions, metrics: [], projects: [], today: TODAY });
    const now = statsAsOf({ sessions, metrics: [], projects: [], asOf: TODAY });
    expect(result.then!.MEN).toBeLessThan(now.MEN);
  });
});
