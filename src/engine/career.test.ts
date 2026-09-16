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

describe('the Ascent on the career page (PLAN.md M212)', () => {
  const wall = (date: string, metres: number) => ({ date, metres, coins: 0, mode: 'ascent' as const });
  const career = (ascent: ReturnType<typeof wall>[], sessions: Session[] = []) =>
    deriveCareer({ sessions, records: [], ascent, today: '2026-09-15' });

  const ascentRows = (state: ReturnType<typeof career>) =>
    state.achieved.filter((m) => m.category === 'ascent');

  it('says nothing at all until the game has been played', () => {
    expect(ascentRows(career([]))).toEqual([]);
    expect(career([]).next.some((n) => n.category === 'ascent')).toBe(false);
  });

  it('dates the walls to the day the count was reached', () => {
    const days = Array.from({ length: 10 }, (_, i) => wall(`2026-06-${String(i + 1).padStart(2, '0')}`, 100));
    const rows = ascentRows(career(days)).filter((m) => m.label.includes('walls'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('10 walls');
    expect(rows[0]!.date).toBe('2026-06-10');
  });

  it('names the climb a single run passed, on the day it first did', () => {
    // 900 m is 2,953 ft, past El Capitan's 2,900 and short of Mt. Washington.
    const rows = ascentRows(career([wall('2026-06-01', 300), wall('2026-06-02', 900)]));
    const climbs = rows.filter((m) => m.label.startsWith('Past '));
    // Newest first, and within a day the taller climb first — the career
    // list is a timeline read backwards, which is what the page shows.
    expect(climbs.map((m) => m.label)).toEqual([
      'Past El Capitan, on the Ascent',
      'Past Half Dome, on the Ascent',
      'Past Devils Tower, on the Ascent',
      'Past First gym wall, on the Ascent',
    ]);
    // 300 m is 984 ft: past Devils Tower, short of Half Dome.
    expect(climbs.map((m) => m.date)).toEqual(['2026-06-02', '2026-06-02', '2026-06-01', '2026-06-01']);
  });

  it('never claims the altimeter', () => {
    // `altimeter.ts` promises no game action adds a foot, and that promise
    // is why "Everest in eleven months" means anything.
    // Where a row mentions the altimeter at all it is to disclaim it, never
    // to claim it — so the word only appears next to a denial.
    for (const row of ascentRows(career([wall('2026-06-02', 900)]))) {
      if (/altimeter/i.test(row.detail)) {
        expect(row.detail).toMatch(/nothing[^.]*moves the altimeter|not the altimeter/i);
      }
      expect(`${row.label} ${row.detail}`).toMatch(/wall|Ascent/);
    }
    expect(career([wall('2026-06-02', 900)]).achieved.some((m) => m.category === 'height')).toBe(false);
  });

  it('stops at Everest, because above it the ladder stacks', () => {
    // `MILESTONES` keeps climbing past Everest by *adding* each peak to the
    // running total, so K2's rung reads 57,283 feet. Naming those for a run
    // would be wrong by an Everest, which is why this borrows the ten.
    const huge = ascentRows(career([wall('2026-06-02', 60_000)]));
    const climbs = huge.filter((m) => m.label.startsWith('Past '));
    expect(climbs).toHaveLength(10);
    expect(climbs[0]!.label).toBe('Past Everest, on the Ascent');
    expect(climbs.some((m) => m.label.includes('K2'))).toBe(false);
  });

  it('reports how far the next wall count is, once there is one', () => {
    const played = career([wall('2026-06-01', 100), wall('2026-06-02', 100)]);
    const next = played.next.find((n) => n.category === 'ascent')!;
    expect(next.current).toBe(2);
    expect(next.target).toBe(10);
    expect(next.toGo).toBe(8);
  });

  it('does not lengthen the career it appears in', () => {
    // A climber who has played a game and logged nothing does not have a
    // two-year career, however many walls they have climbed.
    const played = career([wall('2020-01-01', 900), wall('2026-06-02', 900)]);
    expect(played.first).toBeNull();
    expect(played.last).toBeNull();
    expect(played.years).toBe(0);
  });

  it('comes last within a day, behind the day’s real news', () => {
    // A day holding a first V6 *and* a wall: the grade is the news. The
    // first version of this test put nothing but Ascent rows on the day, so
    // the last row was an Ascent row whatever the ranking said.
    const state = deriveCareer({
      sessions: [session('2026-06-10', { durationMin: 60 })],
      records: [{ date: '2026-06-10', grade: 'V6', scale: 'V' } as PersonalRecord],
      ascent: [wall('2026-06-10', 900)],
      today: '2026-09-15',
    });
    const onTheDay = state.achieved.filter((m) => m.date === '2026-06-10');
    expect(onTheDay[0]!.category).toBe('grade');
    expect(onTheDay.at(-1)!.category).toBe('ascent');
    expect(new Set(onTheDay.map((m) => m.category)).size).toBeGreaterThan(1);
  });
});
