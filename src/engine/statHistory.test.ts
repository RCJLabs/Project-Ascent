import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { COMPARE_DAYS, MIN_HISTORY_DAYS, compareStats, statsAsOf } from './statHistory';
import { addDays } from './dates';

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
    const sessions = run(40, TODAY);
    const asOf = statsAsOf({ sessions, metrics: [], projects: [], asOf: TODAY });
    const later = statsAsOf({ sessions, metrics: [], projects: [], asOf: '2030-01-01' });
    expect(asOf).toEqual(later);
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
    const sessions = [session(addDays(TODAY, -MIN_HISTORY_DAYS - 1)), ...run(10, TODAY)];
    const result = compareStats({ sessions, metrics: [], projects: [], today: TODAY });
    expect(result.historyDays).toBe(MIN_HISTORY_DAYS + 1);
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
