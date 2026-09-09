import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { addDays, today } from './dates';
import {
  MAX_LOGGED_HOURS,
  STALE_HOURS,
  describeSpan,
  durationFromSpan,
  elapsedMs,
  formatClock,
  isLive,
  isStale,
  runningSession,
  staleSessions,
} from './live';

const H = 3600_000;
const M = 60_000;
const NOW = Date.parse(`${today()}T19:00:00.000Z`);

function open(minutesAgo: number, patch: Partial<Session> = {}): Session {
  return newSession(patch.date ?? today(), 0, {
    startedAt: new Date(NOW - minutesAgo * M).toISOString(),
    ...patch,
  });
}

describe('elapsed time', () => {
  it('runs from the start until now while the session is open', () => {
    expect(elapsedMs(open(42), NOW)).toBe(42 * M);
  });

  it('stops at the end once the session is closed', () => {
    const s = open(90, { completed: true, endedAt: new Date(NOW - 30 * M).toISOString() });
    expect(elapsedMs(s, NOW)).toBe(60 * M);
    // And stays there an hour later, which a running counter would not.
    expect(elapsedMs(s, NOW + H)).toBe(60 * M);
  });

  it('is zero for a session that was never started live', () => {
    expect(elapsedMs(newSession(today(), 0), NOW)).toBe(0);
  });

  it('never goes negative on a clock that moved backwards', () => {
    expect(elapsedMs(open(-5), NOW)).toBe(0);
  });
});

describe('formatting', () => {
  it('drops the hour until there is one', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9 * M + 5000)).toBe('9:05');
    expect(formatClock(59 * M + 59_000)).toBe('59:59');
    expect(formatClock(H)).toBe('1:00:00');
    expect(formatClock(2 * H + 3 * M + 4000)).toBe('2:03:04');
  });

  it('describes a span in words', () => {
    expect(describeSpan(45 * M)).toBe('45 min');
    expect(describeSpan(2 * H)).toBe('2 h');
    expect(describeSpan(H + 20 * M)).toBe('1 h 20 min');
  });
});

describe('the duration written onto the session', () => {
  it('rounds the span to minutes', () => {
    expect(durationFromSpan(74 * M + 40_000)).toBe(75);
  });

  // An open session left running overnight would otherwise report a
  // fourteen-hour effort straight into the training-load maths.
  it('refuses a span nobody trained for', () => {
    expect(durationFromSpan(0)).toBeUndefined();
    expect(durationFromSpan(20_000)).toBeUndefined();
    expect(durationFromSpan((MAX_LOGGED_HOURS + 1) * H)).toBeUndefined();
  });
});

describe('live and stale', () => {
  it('is live while started and unfinished', () => {
    expect(isLive(open(10))).toBe(true);
    expect(isLive(open(10, { completed: true }))).toBe(false);
    expect(isLive(newSession(today(), 0))).toBe(false);
  });

  it('goes stale past the cap, or once the day has turned', () => {
    expect(isStale(open(30), NOW)).toBe(false);
    expect(isStale(open(STALE_HOURS * 60 + 1), NOW)).toBe(true);
    expect(isStale(open(20, { date: addDays(today(), -1) }), NOW)).toBe(true);
  });

  it('never calls a finished session stale', () => {
    const done = open(STALE_HOURS * 60 + 90, { completed: true });
    expect(isStale(done, NOW)).toBe(false);
  });
});

describe('picking the session to surface', () => {
  it('finds the one running now', () => {
    const running = open(15);
    const list = [newSession(today(), 1), running, open(20, { completed: true })];
    expect(runningSession(list, NOW)?.id).toBe(running.id);
  });

  it('ignores a stale one, which belongs in recovery instead', () => {
    const list = [open(STALE_HOURS * 60 + 30)];
    expect(runningSession(list, NOW)).toBeUndefined();
    expect(staleSessions(list, NOW)).toHaveLength(1);
  });

  it('prefers the most recent start when a day holds two', () => {
    const older = newSession(today(), 0, { startedAt: new Date(NOW - 3 * H).toISOString() });
    const newer = newSession(today(), 1, { startedAt: new Date(NOW - 10 * M).toISOString() });
    expect(runningSession([older, newer], NOW)?.id).toBe(newer.id);
  });

  it('lists stale sessions oldest first, so the queue drains forwards', () => {
    const list = [
      newSession(addDays(today(), -1), 0, { startedAt: new Date(NOW - 26 * H).toISOString() }),
      newSession(addDays(today(), -3), 0, { startedAt: new Date(NOW - 74 * H).toISOString() }),
    ];
    expect(staleSessions(list, NOW).map((s) => s.date)).toEqual([
      addDays(today(), -3),
      addDays(today(), -1),
    ]);
  });
});
