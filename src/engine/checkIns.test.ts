import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  CHECKIN_DAYS,
  ENOUGH_TO_COMPARE,
  checkInHistory,
  describeCheckIns,
  isFlagged,
} from './checkIns';
import { readinessFor, type CheckIn } from './readiness';

/**
 * The check-in, read back (PLAN.md M82).
 *
 * M72's tests hold the rules that turn two answers into a call. These hold
 * the history: that the window is the window, that a rate is never printed
 * without the count it came from, and that the ceiling read back is the one
 * the climber was actually shown.
 */

const TO = '2026-09-10';

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const fine: CheckIn = { fingers: 'good', sleep: 'good' };
const rough: CheckIn = { fingers: 'tender', sleep: 'short' };
const bad: CheckIn = { fingers: 'sore', sleep: 'none' };

/** `n` sessions on consecutive days ending `endsAgo` before TO. */
function run(n: number, endsAgo: number, patch: Partial<Session> = {}): Session[] {
  return Array.from({ length: n }, (_, i) => session(addDays(TO, -(endsAgo + (n - 1 - i))), patch));
}

const history = (sessions: Session[]) => checkInHistory({ sessions, to: TO });

describe('what counts as asked', () => {
  it('counts the completed sessions that were not rest days', () => {
    const h = history([
      session('2026-09-09', { checkIn: fine }),
      session('2026-09-08'),
      // A rest day is never shown the card, so it is not a session that
      // went unanswered — it was never asked.
      session('2026-09-07', { restChecklist: { hydration: true, mobility: false, zone1: false, sleep: false } }),
      // A draft is not a session yet.
      session('2026-09-06', { completed: false }),
    ]);
    expect(h.asked).toBe(2);
    expect(h.answered).toBe(1);
  });

  it('ignores anything outside the window', () => {
    const h = history([
      session(addDays(TO, -(CHECKIN_DAYS - 1)), { checkIn: fine }),
      session(addDays(TO, -CHECKIN_DAYS), { checkIn: bad }),
    ]);
    expect(h.asked).toBe(1);
    expect(h.answered).toBe(1);
    expect(h.fingers.sore).toBe(0);
  });

  it('ignores a session logged after the window ends', () => {
    expect(history([session(addDays(TO, 1), { checkIn: bad })]).asked).toBe(0);
  });

  it('has nothing to say with nothing logged', () => {
    const h = history([]);
    expect(h.asked).toBe(0);
    expect(h.answered).toBe(0);
    expect(h.days).toEqual([]);
    expect(h.effort).toBeNull();
  });
});

describe('the answers, counted', () => {
  it('tallies each question on its own', () => {
    const h = history([
      session('2026-09-09', { checkIn: { fingers: 'sore', sleep: 'good' } }),
      session('2026-09-08', { checkIn: { fingers: 'good', sleep: 'none' } }),
      session('2026-09-07', { checkIn: rough }),
    ]);
    expect(h.fingers).toEqual({ good: 1, tender: 1, sore: 1 });
    expect(h.sleep).toEqual({ good: 1, short: 1, none: 1 });
  });

  it('puts the days oldest first, whatever order they arrive in', () => {
    const h = history([
      session('2026-09-09', { checkIn: fine }),
      session('2026-09-01', { checkIn: bad }),
      session('2026-09-05', { checkIn: rough }),
    ]);
    expect(h.days.map((d) => d.date)).toEqual(['2026-09-01', '2026-09-05', '2026-09-09']);
  });

  it('treats anything but fine on both questions as flagged', () => {
    expect(isFlagged(fine)).toBe(false);
    expect(isFlagged({ fingers: 'tender', sleep: 'good' })).toBe(true);
    expect(isFlagged({ fingers: 'good', sleep: 'short' })).toBe(true);
  });
});

describe('the ceiling that was suggested', () => {
  it('is the one the climber was shown, not a fresh guess', () => {
    // `readinessFor` takes a context, but the cap depends on the two
    // answers alone — so reading it back without one is exact.
    const h = history([session('2026-09-09', { checkIn: rough, rpe: 9 })]);
    expect(h.days[0]!.cap).toBe(readinessFor(rough).cap);
    expect(h.days[0]!.cap).toBe(7);
  });

  it('counts a session only when there is both a ceiling and an effort', () => {
    const h = history([
      // A cap, no RPE.
      session('2026-09-09', { checkIn: rough, rpe: undefined }),
      // An RPE, no cap: nothing was flagged.
      session('2026-09-08', { checkIn: fine, rpe: 9 }),
      // Both.
      session('2026-09-07', { checkIn: rough, rpe: 6 }),
    ]);
    expect(h.capped).toBe(1);
    expect(h.overCap).toBe(0);
  });

  it('counts going over, and says by how much', () => {
    const h = history([
      session('2026-09-09', { checkIn: rough, rpe: 9 }),
      session('2026-09-08', { checkIn: bad, rpe: 5 }),
      session('2026-09-07', { checkIn: bad, rpe: 8 }),
    ]);
    expect(h.capped).toBe(3);
    expect(h.overCap).toBe(2);
    expect(h.days.map((d) => d.over)).toEqual([3, 0, 2]);
  });

  it('does not count landing exactly on the ceiling as going over', () => {
    const h = history([session('2026-09-09', { checkIn: rough, rpe: 7 })]);
    expect(h.days[0]!.over).toBe(0);
    expect(h.overCap).toBe(0);
  });

  it('never reports a negative overshoot', () => {
    const h = history([session('2026-09-09', { checkIn: bad, rpe: 2 })]);
    expect(h.days[0]!.over).toBe(0);
  });
});

describe('effort on the flagged days against the clear ones', () => {
  it('says nothing until there are enough of both', () => {
    const thin = [
      ...run(ENOUGH_TO_COMPARE, 1, { checkIn: rough, rpe: 8 }),
      ...run(ENOUGH_TO_COMPARE - 1, 40, { checkIn: fine, rpe: 6 }),
    ];
    expect(history(thin).effort).toBeNull();
  });

  it('averages each side once there are', () => {
    const enough = [
      ...run(ENOUGH_TO_COMPARE, 1, { checkIn: rough, rpe: 8 }),
      ...run(ENOUGH_TO_COMPARE, 40, { checkIn: fine, rpe: 6 }),
    ];
    const h = history(enough);
    expect(h.effort).not.toBeNull();
    expect(h.effort!.flagged).toBe(8);
    expect(h.effort!.clear).toBe(6);
    expect(h.effort!.flaggedDays).toBe(ENOUGH_TO_COMPARE);
    expect(h.effort!.clearDays).toBe(ENOUGH_TO_COMPARE);
  });

  it('leaves out a session with no effort logged', () => {
    const some = [
      ...run(ENOUGH_TO_COMPARE, 1, { checkIn: rough, rpe: 8 }),
      ...run(ENOUGH_TO_COMPARE, 40, { checkIn: fine, rpe: 6 }),
      ...run(2, 70, { checkIn: fine, rpe: undefined }),
    ];
    const h = history(some);
    expect(h.effort!.clearDays).toBe(ENOUGH_TO_COMPARE);
    expect(h.effort!.clear).toBe(6);
  });
});

describe('what it says out loud', () => {
  const said = (sessions: Session[]) => describeCheckIns(history(sessions));

  it('does not print a rate without the count it came from', () => {
    const text = said([
      session('2026-09-09', { checkIn: rough, rpe: 9 }),
      session('2026-09-08'),
      session('2026-09-07'),
    ]);
    expect(text).toContain('Answered on 1 of 3 sessions');
    expect(text).toContain('1 session with an effort logged');
  });

  it('says nothing was logged rather than dividing by zero', () => {
    expect(said([])).toContain('nothing to check in for');
  });

  it('explains the card when it has never been answered', () => {
    const text = said(run(3, 1));
    expect(text).toContain('Nothing answered yet');
    expect(text).toContain('3 sessions');
  });

  it('agrees with itself about one of anything', () => {
    // The M80 fault: every count here is a place to write "1 sessions".
    const one = said([session('2026-09-09', { checkIn: bad, rpe: 9 })]);
    expect(one).not.toMatch(/\b1 sessions\b/);
    expect(one).toContain('1 session');
    const two = said([
      session('2026-09-09', { checkIn: bad, rpe: 9 }),
      session('2026-09-08', { checkIn: bad, rpe: 9 }),
    ]);
    expect(two).not.toMatch(/\b2 session\b/);
  });

  it('says once rather than 1 times about a short night', () => {
    expect(said([session('2026-09-09', { checkIn: { fingers: 'good', sleep: 'short' } })])).toContain(
      'a short night once',
    );
  });

  it('names sore fingers when there are any', () => {
    const text = said([
      session('2026-09-09', { checkIn: { fingers: 'sore', sleep: 'good' } }),
      session('2026-09-08', { checkIn: { fingers: 'tender', sleep: 'good' } }),
    ]);
    expect(text).toContain('sore on 1 session');
    expect(text).toContain('tender on 1 more');
  });

  it('reports tender fingers even with none sore', () => {
    const text = said([session('2026-09-09', { checkIn: { fingers: 'tender', sleep: 'good' } })]);
    expect(text).toContain('tender on 1 session');
    expect(text).not.toContain('sore');
  });

  it('admits when there is no pair to judge the ceiling on', () => {
    expect(said([session('2026-09-09', { checkIn: fine, rpe: 7 })])).toContain(
      'nothing to say about whether the ceiling held',
    );
  });

  it('says you stayed under it when you did', () => {
    expect(said([session('2026-09-09', { checkIn: rough, rpe: 5 })])).toContain('stayed under it every time');
  });

  it('warns that the comparison is thin when it prints one', () => {
    const text = said([
      ...run(ENOUGH_TO_COMPARE, 1, { checkIn: rough, rpe: 9 }),
      ...run(ENOUGH_TO_COMPARE, 40, { checkIn: fine, rpe: 5 }),
    ]);
    expect(text).toContain('one hard session moves it');
  });

  it('does not claim a difference that is not there', () => {
    const text = said([
      ...run(ENOUGH_TO_COMPARE, 1, { checkIn: rough, rpe: 6 }),
      ...run(ENOUGH_TO_COMPARE, 40, { checkIn: fine, rpe: 6 }),
    ]);
    expect(text).toContain('about the same either way');
  });
});
