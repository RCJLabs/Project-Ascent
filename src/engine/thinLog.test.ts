import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { addDays } from './dates';
import { buildHeatGrid, describeConsistency } from './consistency';
import { deriveClimberState } from './derive';
import { coverage, describeCoverage, isBare } from './thinLog';

/**
 * Days you trained and did not write down (PLAN.md M100).
 *
 * The milestone proposed a new kind of session. These tests are partly the
 * evidence that it was not needed: a completed session with nothing on it
 * already does everything the proposal listed.
 */

const TODAY = '2026-09-11';
const bare = (date: string): Session => newSession(date, 0, { completed: true });
const full = (date: string, patch: Partial<Session> = {}): Session =>
  newSession(date, 0, { completed: true, rpe: 7, durationMin: 90, ...patch });

describe('what makes a day bare', () => {
  it('is bare when nothing was recorded about it', () => {
    expect(isBare(bare(TODAY))).toBe(true);
  });

  // What was *planned* is not what happened, and `mode` has a default, so
  // neither is something anyone said about the day.
  it('stays bare when only the plan is on it', () => {
    const planned = newSession(TODAY, 0, {
      completed: true,
      programId: 'iron_grip',
      sessionTypeId: 'fp',
      trackId: 'no_board',
      mode: 'outdoor',
    });
    expect(isBare(planned)).toBe(true);
  });

  it('is not bare the moment anything is on it', () => {
    const cases: Partial<Session>[] = [
      { rpe: 7 },
      { durationMin: 60 },
      { warmup: false },
      { drillId: 'd' },
      { drillDone: true },
      { notes: 'felt good' },
      { exercises: [{ name: 'Max Hangs' }] },
      { projectAttempts: [{ id: 'a', projectId: 'p', outcome: 'worked', count: 1 }] },
      { restChecklist: { hydration: true, mobility: false, zone1: false, sleep: false } },
      { checkIn: { fingers: 'good', sleep: 'good' } },
      { fields: { location: 'Stanage' } },
      { startedAt: '2026-09-11T10:00:00.000Z' },
      { climbs: [{ id: 'c', grade: 'V4', scale: 'V', count: 1, result: 'send' }] },
    ];
    for (const patch of cases) {
      expect(isBare(newSession(TODAY, 0, { completed: true, ...patch })), JSON.stringify(patch)).toBe(false);
    }
  });

  // A blank note and an empty field are nothing said, not something said.
  it('is not fooled by blank text', () => {
    expect(isBare(newSession(TODAY, 0, { completed: true, notes: '   ' }))).toBe(true);
    expect(isBare(newSession(TODAY, 0, { completed: true, fields: { location: '' } }))).toBe(true);
  });

  // A session still in progress is not a record of anything yet.
  it('is never bare when it is not finished', () => {
    expect(isBare(newSession(TODAY, 0, { completed: false }))).toBe(false);
  });
});

describe('how much of a window is bare', () => {
  const window = { from: addDays(TODAY, -13), to: TODAY };

  it('counts days, not sessions', () => {
    const sessions = [bare(addDays(TODAY, -3)), full(addDays(TODAY, -1))];
    expect(coverage(sessions, window.from, window.to)).toEqual({ days: 2, bare: 1 });
  });

  // A day with one full session and one bare one is a day that was written
  // down, and the numbers beside this all count days.
  it('does not call a day bare when part of it was logged', () => {
    const date = addDays(TODAY, -2);
    const two = [
      { ...newSession(date, 0, { completed: true }) },
      { ...newSession(date, 1, { completed: true, rpe: 8, durationMin: 60 }) },
    ];
    expect(coverage(two, window.from, window.to)).toEqual({ days: 1, bare: 0 });
    // And in the other order, so it is not an accident of iteration.
    expect(coverage([...two].reverse(), window.from, window.to)).toEqual({ days: 1, bare: 0 });
  });

  it('respects the window at both ends', () => {
    const outside = [bare(addDays(TODAY, -40)), bare(addDays(TODAY, 3))];
    expect(coverage(outside, window.from, window.to)).toEqual({ days: 0, bare: 0 });
  });

  it('ignores a session that was never completed', () => {
    expect(coverage([newSession(TODAY, 0, { completed: false })], window.from, window.to)).toEqual({
      days: 0,
      bare: 0,
    });
  });
});

describe('saying how thin the record is', () => {
  // A caveat about a thing that did not happen is noise.
  it('says nothing when nothing is bare', () => {
    expect(describeCoverage({ days: 12, bare: 0 })).toBeNull();
  });

  it('counts them against the days they came from', () => {
    expect(describeCoverage({ days: 12, bare: 4 })).toBe('4 of them marked without detail');
  });

  it('does not say "12 of 12"', () => {
    expect(describeCoverage({ days: 12, bare: 12 })).toBe('all of them marked without detail');
    expect(describeCoverage({ days: 1, bare: 1 })).toBe('the only one marked without detail');
  });
});

describe('the consistency summary', () => {
  const weeks = (n: number, make: (d: string) => Session): Session[] => {
    const out: Session[] = [];
    for (let w = n; w >= 1; w--) for (const off of [0, 2, 4]) out.push(make(addDays(TODAY, -(w * 7) + off)));
    return out;
  };

  it('says nothing extra about a fully logged window', () => {
    const grid = buildHeatGrid({ sessions: weeks(6, full), to: TODAY, weeks: 8 });
    expect(grid.bareDays).toBe(0);
    expect(describeConsistency(grid)).not.toMatch(/without detail/);
  });

  // Marking days is one tap from the calendar now, so a rate built partly on
  // assertions has to say so.
  it('says how many days were marked rather than logged', () => {
    const sessions = [...weeks(6, full), ...weeks(2, bare).map((s) => ({ ...s, date: addDays(s.date, 1) }))];
    const grid = buildHeatGrid({ sessions, to: TODAY, weeks: 8 });
    expect(grid.bareDays).toBe(6);
    expect(describeConsistency(grid)).toMatch(/6 of them marked without detail/);
  });
});

/**
 * The evidence that a `sketch: true` flag was not needed.
 *
 * The proposal said a sketch would count for consistency and the streak and
 * be excluded from the ratio. A bare completed session already is all three,
 * so a flag would have been a second way to say what the record says.
 */
describe('what a bare day already does', () => {
  const trained = (): Session[] => {
    const out: Session[] = [];
    for (let w = 11; w >= 4; w--) for (const off of [0, 2, 4]) out.push(full(addDays(TODAY, -(w * 7) + off)));
    return out;
  };
  const marked = (): Session[] => {
    const out = trained();
    for (let d = 20; d >= 1; d--) if (d % 2 === 0) out.push(bare(addDays(TODAY, -d)));
    return out;
  };

  it('closes the gap and restores the streak', () => {
    const before = deriveClimberState(trained(), { today: TODAY });
    const after = deriveClimberState(marked(), { today: TODAY });
    expect(before.streakWeeks).toBe(0);
    expect(after.streakWeeks).toBeGreaterThan(0);
    expect(after.completedSessions).toBeGreaterThan(before.completedSessions);
  });

  // RPE x hours, and both are absent — which is the "carries no load" the
  // proposal wanted a flag to arrange.
  it('carries no training load, so the ratio is untouched', () => {
    expect(deriveClimberState(marked(), { today: TODAY }).load.acwr).toBeNull();
    const grid = buildHeatGrid({ sessions: marked(), to: TODAY, weeks: 12 });
    for (const day of grid.weeks.flat()) {
      if (day.sessions > 0 && day.date > addDays(TODAY, -21)) expect(day.load).toBe(0);
    }
  });

  it('shortens the longest gap the consistency grid reports', () => {
    const before = buildHeatGrid({ sessions: trained(), to: TODAY, weeks: 12 });
    const after = buildHeatGrid({ sessions: marked(), to: TODAY, weeks: 12 });
    expect(before.longestGap).toBeGreaterThan(after.longestGap);
  });
});
