import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek } from './dates';
import { deriveClimberState } from './derive';

const TODAY = '2026-09-13'; // a Sunday

let counter = 0;
function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, ...patch });
}

function climb(grade: string, count = 1, result: 'send' | 'attempt' = 'send') {
  return { id: `c${counter++}`, grade, scale: grade.startsWith('V') ? ('V' as const) : ('YDS' as const), count, result };
}

describe('deriveClimberState', () => {
  it('counts only completed sessions', () => {
    const state = deriveClimberState(
      [session(TODAY), newSession(TODAY, 99, { completed: false })],
      { today: TODAY },
    );
    expect(state.totalSessions).toBe(2);
    expect(state.completedSessions).toBe(1);
  });

  it('tallies sends and attempts per ladder', () => {
    const state = deriveClimberState(
      [
        session(TODAY, { climbs: [climb('V4', 3), climb('V5', 1), climb('V6', 2, 'attempt')] }),
        session(addDays(TODAY, -2), { climbs: [climb('5.11a', 1), climb('V4', 1)] }),
      ],
      { today: TODAY },
    );
    expect(state.boulder.sends).toEqual({ V4: 4, V5: 1 });
    expect(state.boulder.attempts).toEqual({ V6: 2 });
    expect(state.boulder.totalSends).toBe(5);
    expect(state.boulder.best).toBe('V5');
    expect(state.sport.best).toBe('5.11a');
  });

  it('records a personal record the first time a grade is sent', () => {
    const state = deriveClimberState(
      [
        session('2026-09-01', { climbs: [climb('V4')] }),
        session('2026-09-05', { climbs: [climb('V4')] }), // repeat, not a PR
        session('2026-09-08', { climbs: [climb('V5')] }),
        session('2026-09-09', { climbs: [climb('V3')] }), // easier, not a PR
      ],
      { today: TODAY },
    );
    expect(state.personalRecords).toEqual([
      { scale: 'V', grade: 'V4', date: '2026-09-01' },
      { scale: 'V', grade: 'V5', date: '2026-09-08' },
    ]);
  });

  it('keeps ladders separate for records', () => {
    const state = deriveClimberState(
      [session('2026-09-01', { climbs: [climb('V8')] }), session('2026-09-02', { climbs: [climb('5.9')] })],
      { today: TODAY },
    );
    // A first 5.9 is a real record even for someone bouldering V8.
    expect(state.personalRecords.map((p) => p.grade)).toEqual(['V8', '5.9']);
  });
});

describe('training load', () => {
  function fourWeeksOf(rpe: number, durationMin: number, days: number[]): Session[] {
    return days.map((offset) => session(addDays(TODAY, -offset), { rpe, durationMin }));
  }

  it('computes sRPE as RPE times hours', () => {
    const state = deriveClimberState([session(TODAY, { rpe: 8, durationMin: 90 })], { today: TODAY });
    expect(state.load.daily.at(-1)!.load).toBeCloseTo(12); // 8 × 1.5h
  });

  it('withholds ACWR when the window is long but nearly empty', () => {
    // Two sessions six weeks apart: the span passes, the density does not.
    // Dividing one recent session by a quarter of itself yields 4.0, which
    // is arithmetic rather than a training state.
    const state = deriveClimberState(
      [
        session(addDays(TODAY, -40), { rpe: 7, durationMin: 75 }),
        session(addDays(TODAY, -5), { rpe: 7, durationMin: 75 }),
      ],
      { today: TODAY },
    );
    expect(state.load.acwr).toBeNull();
    expect(state.load.zone).toBe('unknown');
  });

  it('withholds ACWR until there is enough history', () => {
    const state = deriveClimberState(fourWeeksOf(7, 60, [0, 2, 4]), { today: TODAY });
    expect(state.load.acwr).toBeNull();
    expect(state.load.zone).toBe('unknown');
  });

  it('reports the optimal zone for steady training', () => {
    // Same load every other day for four weeks.
    const days = Array.from({ length: 14 }, (_, i) => i * 2);
    const state = deriveClimberState(fourWeeksOf(7, 60, days), { today: TODAY });
    expect(state.load.acwr).not.toBeNull();
    expect(state.load.acwr!).toBeGreaterThan(0.8);
    expect(state.load.acwr!).toBeLessThanOrEqual(1.3);
    expect(state.load.zone).toBe('optimal');
  });

  it('flags a spike as dangerous', () => {
    const baseline = Array.from({ length: 7 }, (_, i) => 8 + i * 2).map((offset) =>
      session(addDays(TODAY, -offset), { rpe: 5, durationMin: 45 }),
    );
    const spike = [0, 1, 2, 3, 4, 5].map((offset) =>
      session(addDays(TODAY, -offset), { rpe: 9, durationMin: 150 }),
    );
    const state = deriveClimberState([...baseline, ...spike], { today: TODAY });
    expect(state.load.acwr!).toBeGreaterThan(1.5);
    expect(state.load.zone).toBe('danger');
  });

  it('counts a planned deload as optimal rather than detraining', () => {
    // Three heavy weeks, then a light week that is a planned deload.
    const heavy = Array.from({ length: 12 }, (_, i) => 7 + i * 2).map((offset) =>
      session(addDays(TODAY, -offset), { rpe: 8, durationMin: 90 }),
    );
    const light = [1, 4].map((offset) =>
      session(addDays(TODAY, -offset), { rpe: 4, durationMin: 30, deload: true }),
    );
    const state = deriveClimberState([...heavy, ...light], { today: TODAY });
    expect(state.load.acwr!).toBeLessThan(0.8);
    expect(state.load.inPlannedDeload).toBe(true);
    expect(state.load.zone).toBe('optimal');
  });

  it('calls the same dip detraining when it was not planned', () => {
    const heavy = Array.from({ length: 12 }, (_, i) => 7 + i * 2).map((offset) =>
      session(addDays(TODAY, -offset), { rpe: 8, durationMin: 90 }),
    );
    const light = [1, 4].map((offset) => session(addDays(TODAY, -offset), { rpe: 4, durationMin: 30 }));
    const state = deriveClimberState([...heavy, ...light], { today: TODAY });
    expect(state.load.zone).toBe('detraining');
  });

  it('always reports 28 days of history', () => {
    const state = deriveClimberState([session(TODAY, { rpe: 7, durationMin: 60 })], { today: TODAY });
    expect(state.load.daily).toHaveLength(28);
    expect(state.load.daily.at(-1)!.date).toBe(TODAY);
  });
});

describe('streaks and consistency', () => {
  /** Three sessions inside the Sunday-aligned week `weeksAgo` weeks back. */
  function fullWeek(weeksAgo: number): Session[] {
    const start = addDays(startOfWeek(TODAY), -7 * weeksAgo);
    return [0, 2, 4].map((d) => session(addDays(start, d), { rpe: 7, durationMin: 60 }));
  }

  it('counts consecutive weeks that met the target', () => {
    const sessions = [...fullWeek(0), ...fullWeek(1), ...fullWeek(2)];
    expect(deriveClimberState(sessions, { today: TODAY, weeklyTarget: 3 }).streakWeeks).toBe(3);
  });

  it('does not let an in-progress week break the streak', () => {
    // Two full past weeks, nothing logged yet this week.
    const sessions = [...fullWeek(1), ...fullWeek(2)];
    expect(deriveClimberState(sessions, { today: TODAY, weeklyTarget: 3 }).streakWeeks).toBe(2);
  });

  it('breaks the streak on a missed past week', () => {
    const sessions = [...fullWeek(1), ...fullWeek(3)];
    expect(deriveClimberState(sessions, { today: TODAY, weeklyTarget: 3 }).streakWeeks).toBe(1);
  });

  it('counts consecutive training days and stops at a rest day', () => {
    const sessions = [
      session(TODAY),
      session(addDays(TODAY, -1)),
      session(addDays(TODAY, -2)),
      session(addDays(TODAY, -3), {
        restChecklist: { hydration: true, mobility: false, zone1: false, sleep: true },
      }),
      session(addDays(TODAY, -4)),
    ];
    expect(deriveClimberState(sessions, { today: TODAY }).consecutiveTrainingDays).toBe(3);
  });

  it('reports the warmup rate over non-rest sessions only', () => {
    const state = deriveClimberState(
      [
        session(TODAY, { warmup: true }),
        session(addDays(TODAY, -1), { warmup: false }),
        session(addDays(TODAY, -2), {
          restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
        }),
      ],
      { today: TODAY },
    );
    expect(state.warmupRate).toBe(0.5);
    expect(state.restSessions).toBe(1);
  });

  it('handles an empty history without throwing', () => {
    const state = deriveClimberState([], { today: TODAY });
    expect(state.completedSessions).toBe(0);
    expect(state.boulder.best).toBeNull();
    expect(state.load.acwr).toBeNull();
    expect(state.streakWeeks).toBe(0);
    expect(state.warmupRate).toBe(0);
  });
});
