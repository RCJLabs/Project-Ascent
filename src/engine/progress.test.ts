import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { addDays, startOfWeek } from './dates';
import { deriveClimberState } from './derive';
import { projectGrade, pyramid, weeklyProgression, weeklyVolume } from './progress';

const TODAY = '2026-09-13';
let counter = 0;

function sessionWith(date: string, climbs: { grade: string; count?: number; result?: 'send' | 'attempt' }[]): Session {
  return newSession(date, counter++, {
    completed: true,
    durationMin: 60,
    rpe: 7,
    climbs: climbs.map((c) => ({
      id: `c${counter++}`,
      grade: c.grade,
      scale: c.grade.startsWith('V') ? ('V' as const) : ('YDS' as const),
      count: c.count ?? 1,
      result: c.result ?? ('send' as const),
    })),
  });
}

describe('pyramid', () => {
  it('runs from the hardest grade downward', () => {
    const state = deriveClimberState(
      [sessionWith(TODAY, [{ grade: 'V2', count: 8 }, { grade: 'V4', count: 3 }, { grade: 'V5' }])],
      { today: TODAY },
    );
    const rows = pyramid(state.boulder, 'V');
    // Stops at V2 — the easiest grade actually climbed — rather than padding
    // down to V0 and implying an ability gap that is really a logging gap.
    expect(rows.map((r) => r.grade)).toEqual(['V5', 'V4', 'V3', 'V2']);
    expect(rows[0]).toMatchObject({ grade: 'V5', sends: 1 });
    // An interior grade with no sends still shows — that gap is real.
    expect(rows.find((r) => r.grade === 'V3')).toMatchObject({ sends: 0, conversion: null });
  });

  it('includes grades with attempts but no sends, and reports conversion', () => {
    const state = deriveClimberState(
      [sessionWith(TODAY, [{ grade: 'V4', count: 2 }, { grade: 'V6', count: 5, result: 'attempt' }])],
      { today: TODAY },
    );
    const rows = pyramid(state.boulder, 'V');
    // A wall of attempts at V6 is what a plateau looks like — it must show.
    expect(rows[0]).toMatchObject({ grade: 'V6', sends: 0, attempts: 5, conversion: 0 });
    expect(rows.find((r) => r.grade === 'V4')!.conversion).toBe(1);
  });

  it('caps the depth from the hardest grade down', () => {
    const state = deriveClimberState(
      [sessionWith(TODAY, [{ grade: 'V0' }, { grade: 'V12' }])],
      { today: TODAY },
    );
    expect(pyramid(state.boulder, 'V', 5)).toHaveLength(5);
  });

  it('returns nothing for an empty history', () => {
    expect(pyramid(deriveClimberState([], { today: TODAY }).boulder, 'V')).toEqual([]);
  });
});

describe('weeklyProgression', () => {
  it('reports the hardest send per week, oldest first', () => {
    const thisWeek = startOfWeek(TODAY);
    const sessions = [
      sessionWith(addDays(thisWeek, -14), [{ grade: 'V3' }]),
      sessionWith(addDays(thisWeek, -7), [{ grade: 'V4' }, { grade: 'V2' }]),
      sessionWith(thisWeek, [{ grade: 'V5' }]),
    ];
    const points = weeklyProgression(sessions, 'V', 3, TODAY);
    expect(points.map((p) => p.grade)).toEqual(['V3', 'V4', 'V5']);
    expect(points.at(-1)!.week).toBe(thisWeek);
  });

  it('leaves gaps null rather than carrying a grade forward', () => {
    const thisWeek = startOfWeek(TODAY);
    const points = weeklyProgression([sessionWith(addDays(thisWeek, -14), [{ grade: 'V4' }])], 'V', 3, TODAY);
    expect(points.map((p) => p.ordinal)).toEqual([4, null, null]);
  });

  it('ignores the other ladder', () => {
    const points = weeklyProgression([sessionWith(TODAY, [{ grade: '5.11a' }])], 'V', 2, TODAY);
    expect(points.every((p) => p.ordinal === null)).toBe(true);
  });
});

describe('projectGrade', () => {
  function rising(): ReturnType<typeof weeklyProgression> {
    const thisWeek = startOfWeek(TODAY);
    const sessions = ['V2', 'V2', 'V3', 'V3', 'V4', 'V4'].map((grade, i) =>
      sessionWith(addDays(thisWeek, -7 * (5 - i)), [{ grade }]),
    );
    return weeklyProgression(sessions, 'V', 6, TODAY);
  }

  it('says nothing with too little data', () => {
    const points = weeklyProgression([sessionWith(TODAY, [{ grade: 'V4' }])], 'V', 6, TODAY);
    const projection = projectGrade(points, 'V');
    expect(projection.confident).toBe(false);
    expect(projection.weeksToNext).toBeNull();
    expect(projection.summary).toMatch(/more weeks/i);
  });

  it('projects the next grade from a rising trend', () => {
    const projection = projectGrade(rising(), 'V');
    expect(projection.confident).toBe(true);
    expect(projection.slope).toBeGreaterThan(0);
    expect(projection.nextGrade).toBe('V5');
    expect(projection.weeksToNext).toBeGreaterThan(0);
    expect(projection.summary).toMatch(/V5 in about \d+ weeks?/);
  });

  it('reports a flat trend as holding steady rather than inventing a date', () => {
    const thisWeek = startOfWeek(TODAY);
    const sessions = Array.from({ length: 6 }, (_, i) =>
      sessionWith(addDays(thisWeek, -7 * i), [{ grade: 'V4' }]),
    );
    const projection = projectGrade(weeklyProgression(sessions, 'V', 6, TODAY), 'V');
    expect(projection.weeksToNext).toBeNull();
    expect(projection.summary).toMatch(/holding steady/i);
  });

  it('flags a declining trend without alarm', () => {
    const thisWeek = startOfWeek(TODAY);
    const sessions = ['V6', 'V6', 'V5', 'V5', 'V4', 'V4'].map((grade, i) =>
      sessionWith(addDays(thisWeek, -7 * (5 - i)), [{ grade }]),
    );
    const projection = projectGrade(weeklyProgression(sessions, 'V', 6, TODAY), 'V');
    expect(projection.slope).toBeLessThan(0);
    expect(projection.summary).toMatch(/eased off/i);
  });

  it('refuses to extrapolate a barely-rising trend into a date', () => {
    const thisWeek = startOfWeek(TODAY);
    // One grade gained across twelve weeks — real, but not a forecast.
    const grades = ['V4', 'V4', 'V4', 'V4', 'V4', 'V4', 'V4', 'V4', 'V4', 'V4', 'V4', 'V5'];
    const sessions = grades.map((grade, i) => sessionWith(addDays(thisWeek, -7 * (11 - i)), [{ grade }]));
    const projection = projectGrade(weeklyProgression(sessions, 'V', 12, TODAY), 'V');
    expect(projection.weeksToNext).toBeNull();
    expect(projection.summary).toMatch(/long-term/i);
  });
});

describe('weeklyVolume', () => {
  it('sums minutes and sessions per week', () => {
    const thisWeek = startOfWeek(TODAY);
    const sessions = [
      sessionWith(thisWeek, [{ grade: 'V3' }]),
      sessionWith(addDays(thisWeek, 1), [{ grade: 'V3' }]),
      sessionWith(addDays(thisWeek, -7), [{ grade: 'V3' }]),
    ];
    const volume = weeklyVolume(sessions, 2, TODAY);
    expect(volume).toHaveLength(2);
    expect(volume[0]).toMatchObject({ minutes: 60, sessions: 1 });
    expect(volume[1]).toMatchObject({ minutes: 120, sessions: 2 });
  });
});
