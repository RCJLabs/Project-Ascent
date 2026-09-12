import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import type { PersonalRecord } from './derive';
import { LADDER_TOP, MILESTONES } from './altimeter';
import { byYear, counterLadder, deriveCareer, recentMilestones } from './career';

function session(date: string, patch: Partial<Session> = {}): Session {
  return {
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
    ...patch,
  };
}

/** `n` sessions on consecutive days from `start`. */
function run(start: string, n: number, patch: Partial<Session> = {}): Session[] {
  const out: Session[] = [];
  const date = new Date(`${start}T00:00:00`);
  for (let i = 0; i < n; i += 1) {
    out.push(session(date.toISOString().slice(0, 10), patch));
    date.setDate(date.getDate() + 1);
  }
  return out;
}

const NO_RECORDS: PersonalRecord[] = [];

describe('counterLadder', () => {
  it('walks 1 · 2.5 · 5 through the decades', () => {
    expect(counterLadder(10, 600)).toEqual([10, 25, 50, 100, 250, 500, 1000]);
  });

  it('always returns one rung past the cap, so "next" exists', () => {
    const rungs = counterLadder(10, 10);
    expect(rungs.at(-1)).toBe(25);
  });

  it('never runs out — the gaps grow with the number', () => {
    const rungs = counterLadder(10, 400_000);
    expect(rungs.at(-1)).toBeGreaterThan(400_000);
    expect(rungs.length).toBeLessThan(20);
  });

  it('starts at the first rung at or past the floor', () => {
    expect(counterLadder(5, 5)[0]).toBe(5);
    expect(counterLadder(50, 60)[0]).toBe(50);
  });
});

describe('deriveCareer counters', () => {
  it('dates a milestone to the day the log crossed it', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 12),
      records: NO_RECORDS,
      today: '2026-02-01',
    });
    const ten = state.achieved.find((m) => m.id === 'sessions-10');
    // Ten sessions from 1 Jan lands on the 10th, not the 12th.
    expect(ten?.date).toBe('2026-01-10');
  });

  it('does not award a milestone the log has not reached', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 9),
      records: NO_RECORDS,
      today: '2026-02-01',
    });
    expect(state.achieved.some((m) => m.category === 'sessions')).toBe(false);
  });

  it('ignores sessions that were never completed', () => {
    const sessions = [...run('2026-01-01', 9), session('2026-01-10', { completed: false })];
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    expect(state.achieved.some((m) => m.id === 'sessions-10')).toBe(false);
  });

  it('counts a day outdoors once however many sessions it holds', () => {
    const sessions = [
      session('2026-01-01', { mode: 'outdoor' }),
      session('2026-01-01', { mode: 'outdoor', id: '2026-01-01#1' }),
      ...run('2026-01-02', 4, { mode: 'outdoor' }),
    ];
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    // Five distinct days, so the five-day rung — not six sessions' worth.
    expect(state.achieved.find((m) => m.id === 'outdoor-5')?.date).toBe('2026-01-05');
  });

  it('counts sends by their climb count, not by row', () => {
    const sessions = run('2026-01-01', 5, {
      climbs: [{ id: 'c', grade: 'V3', scale: 'V', count: 10, result: 'send' }],
    });
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    expect(state.achieved.find((m) => m.id === 'sends-50')?.date).toBe('2026-01-05');
  });

  it('does not count attempts as sends', () => {
    const sessions = run('2026-01-01', 5, {
      climbs: [{ id: 'c', grade: 'V3', scale: 'V', count: 10, result: 'attempt' }],
    });
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    expect(state.achieved.some((m) => m.category === 'sends')).toBe(false);
  });

  it('crosses several rungs in one session when a big day earns them', () => {
    const sessions = [
      session('2026-01-01', {
        climbs: [{ id: 'c', grade: 'V3', scale: 'V', count: 300, result: 'send' }],
      }),
    ];
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    const sends = state.achieved.filter((m) => m.category === 'sends').map((m) => m.value);
    expect(sends).toEqual([250, 100, 50]);
  });
});

describe('deriveCareer grades', () => {
  it('turns every personal best into a dated first', () => {
    const records: PersonalRecord[] = [
      { scale: 'V', grade: 'V4', date: '2026-01-05', mode: 'indoor' },
      { scale: 'V', grade: 'V5', date: '2026-03-02', mode: 'indoor' },
    ];
    const state = deriveCareer({ sessions: run('2026-01-01', 3), records, today: '2026-04-01' });
    const grades = state.achieved.filter((m) => m.category === 'grade');
    expect(grades.map((m) => m.label)).toEqual(['First V5', 'First V4']);
  });

  it('reads the grade the way the climber has asked to read it', () => {
    const records: PersonalRecord[] = [{ scale: 'V', grade: 'V5', date: '2026-01-05', mode: 'indoor' }];
    const state = deriveCareer({
      sessions: run('2026-01-01', 3),
      records,
      display: { boulder: 'Font', route: 'YDS' },
      today: '2026-04-01',
    });
    expect(state.achieved[0]?.label).toBe('First 6C');
  });
});

describe('deriveCareer height', () => {
  it('names the altimeter climbs and dates them', () => {
    // 45 feet is a single gym wall: three indoor V-grade sends at 15ft.
    const sessions = [
      session('2026-01-01', {
        climbs: [{ id: 'c', grade: 'V2', scale: 'V', count: 3, result: 'send' }],
      }),
    ];
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    const height = state.achieved.filter((m) => m.category === 'height');
    expect(height).toHaveLength(1);
    expect(height[0]?.label).toBe('First gym wall');
    expect(height[0]?.date).toBe('2026-01-01');
  });

  it('does not silently wrap at the top of the ladder — a second lap is its own entry', () => {
    // Enough boulder sends to clear a full lap and the first rung of the next.
    const count = Math.ceil((LADDER_TOP + 45) / 15);
    const sessions = [
      session('2026-01-01', {
        climbs: [{ id: 'c', grade: 'V2', scale: 'V', count, result: 'send' }],
      }),
    ];
    const state = deriveCareer({ sessions, records: NO_RECORDS, today: '2026-02-01' });
    const height = state.achieved.filter((m) => m.category === 'height');
    expect(height.length).toBe(MILESTONES.length + 1);
    expect(height[0]?.label).toBe('First gym wall, again');
    expect(height[0]?.detail).toContain('second time');
  });
});

describe('deriveCareer years', () => {
  it('marks each anniversary of the first logged session', () => {
    const state = deriveCareer({
      sessions: [session('2020-06-01'), session('2026-01-01')],
      records: NO_RECORDS,
      today: '2026-09-09',
    });
    const years = state.achieved.filter((m) => m.category === 'years');
    expect(years.map((m) => m.value)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(years.at(-1)?.date).toBe('2021-06-01');
  });

  it('does not award an anniversary that has not happened', () => {
    const state = deriveCareer({
      sessions: [session('2026-01-01')],
      records: NO_RECORDS,
      today: '2026-09-09',
    });
    expect(state.achieved.some((m) => m.category === 'years')).toBe(false);
  });
});

describe('deriveCareer ordering', () => {
  it('puts the newest first', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 30),
      records: [{ scale: 'V', grade: 'V4', date: '2026-01-20', mode: 'indoor' }],
      today: '2026-02-01',
    });
    const dates = state.achieved.map((m) => m.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('puts a day’s real news above its counters', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 10),
      records: [{ scale: 'V', grade: 'V4', date: '2026-01-10', mode: 'indoor' }],
      today: '2026-02-01',
    });
    const sameDay = state.achieved.filter((m) => m.date === '2026-01-10');
    expect(sameDay[0]?.category).toBe('grade');
  });
});

describe('next milestones', () => {
  it('reports how far, and never when', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 12),
      records: NO_RECORDS,
      today: '2026-02-01',
    });
    const sessions = state.next.find((n) => n.category === 'sessions');
    expect(sessions?.target).toBe(25);
    expect(sessions?.toGo).toBe(13);
    expect(JSON.stringify(sessions)).not.toMatch(/week|month|eta/i);
  });

  it('measures the fraction across the gap, not from zero', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 20),
      records: NO_RECORDS,
      today: '2026-02-01',
    });
    const sessions = state.next.find((n) => n.category === 'sessions');
    // Ten of the fifteen between 10 and 25 — two thirds, not four fifths.
    expect(sessions?.fraction).toBeCloseTo(10 / 15, 5);
  });

  it('offers the first rung to a climber with nothing logged yet', () => {
    const state = deriveCareer({ sessions: [], records: NO_RECORDS, today: '2026-02-01' });
    expect(state.next.find((n) => n.category === 'sessions')?.target).toBe(10);
    expect(state.achieved).toEqual([]);
    expect(state.first).toBeNull();
  });

  it('does not offer an anniversary before there is a log to date it from', () => {
    const state = deriveCareer({ sessions: [], records: NO_RECORDS, today: '2026-02-01' });
    expect(state.next.some((n) => n.category === 'years')).toBe(false);
  });

  it('sorts by closest first', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 24),
      records: NO_RECORDS,
      today: '2026-02-01',
    });
    const fractions = state.next.map((n) => n.fraction);
    expect([...fractions].sort((a, b) => b - a)).toEqual(fractions);
  });
});

describe('grouping', () => {
  it('takes the most recent few', () => {
    const state = deriveCareer({
      sessions: run('2026-01-01', 30),
      records: NO_RECORDS,
      today: '2026-02-01',
    });
    expect(recentMilestones(state, 2)).toHaveLength(2);
    expect(recentMilestones(state, 2)[0]).toEqual(state.achieved[0]);
  });

  it('groups by the year each one happened, newest year first', () => {
    const state = deriveCareer({
      sessions: [...run('2024-01-01', 10), ...run('2026-01-01', 20)],
      records: NO_RECORDS,
      today: '2026-06-01',
    });
    const years = byYear(state).map((g) => g.year);
    expect(years).toEqual([...years].sort((a, b) => b - a));
    expect(years).toContain(2024);
    expect(years).toContain(2026);
  });
});
