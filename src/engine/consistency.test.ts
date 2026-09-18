import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { buildHeatGrid, describeConsistency } from './consistency';

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#${patch.id ?? 'a'}`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const TO = '2026-09-10';
const build = (sessions: Session[], to = TO, weeks = 53) =>
  buildHeatGrid({ sessions, to, weeks });

const dayFor = (grid: ReturnType<typeof buildHeatGrid>, date: string) =>
  grid.weeks.flat().find((d) => d.date === date);

describe('the shape of the grid', () => {
  it('is whole weeks, Sunday first', () => {
    const grid = build([]);
    expect(grid.weeks).toHaveLength(53);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    // Every row is the same weekday, which is the entire point of the shape.
    for (const week of grid.weeks) {
      expect(new Date(`${week[0]!.date}T00:00:00`).getDay()).toBe(0);
      expect(new Date(`${week[6]!.date}T00:00:00`).getDay()).toBe(6);
    }
  });

  it('ends on the week containing the day it was asked for', () => {
    const grid = build([]);
    expect(grid.weeks.flat().some((d) => d.date === TO)).toBe(true);
  });

  it('runs oldest to newest', () => {
    const flat = build([]).weeks.flat();
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i]!.date > flat[i - 1]!.date).toBe(true);
    }
  });

  it('covers a year without gaps or repeats', () => {
    const flat = build([]).weeks.flat();
    expect(new Set(flat.map((d) => d.date)).size).toBe(flat.length);
    expect(flat).toHaveLength(53 * 7);
  });

  it('takes the end day rather than reading the clock', () => {
    // A chart whose test passes only in September is not a test.
    expect(build([], '2020-02-29').to).toBe('2020-02-29');
    expect(build([], '2020-02-29').weeks.flat().some((d) => d.date === '2020-02-29')).toBe(true);
  });
});

describe('days after today', () => {
  it('are marked as future, not as missed', () => {
    // The end day is a Thursday, so the rest of its week is still to come.
    const grid = build([]);
    expect(dayFor(grid, TO)?.future).toBe(false);
    expect(dayFor(grid, addDays(TO, 1))?.future).toBe(true);
  });

  it('are left out of the elapsed count', () => {
    const grid = build([]);
    const future = grid.weeks.flat().filter((d) => d.future).length;
    expect(grid.elapsedDays).toBe(53 * 7 - future);
  });
});

describe('load becomes a level', () => {
  it('leaves an empty day at zero', () => {
    expect(dayFor(build([]), '2026-09-01')?.level).toBe(0);
  });

  it('ranks a heavy day above a light one', () => {
    const sessions = [
      session('2026-09-01', { rpe: 3, durationMin: 30 }),
      session('2026-09-02', { rpe: 5, durationMin: 60 }),
      session('2026-09-03', { rpe: 8, durationMin: 90 }),
      session('2026-09-04', { rpe: 10, durationMin: 180 }),
    ];
    const grid = build(sessions);
    const levels = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(
      (d) => dayFor(grid, d)!.level,
    );
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]!).toBeGreaterThanOrEqual(levels[i - 1]!);
    }
    expect(levels[3]).toBe(4);
  });

  it('adds up two sessions on one day', () => {
    const grid = build([
      session('2026-09-01', { rpe: 5, durationMin: 60 }),
      session('2026-09-01', { rpe: 5, durationMin: 60, id: 'b' }),
    ]);
    expect(dayFor(grid, '2026-09-01')?.load).toBe(10);
    expect(dayFor(grid, '2026-09-01')?.sessions).toBe(2);
  });

  it('scales to the climber rather than to an absolute number', () => {
    // A beginner's whole first year would otherwise be one flat colour.
    const gentle = build([
      session('2026-09-01', { rpe: 2, durationMin: 20 }),
      session('2026-09-02', { rpe: 3, durationMin: 30 }),
      session('2026-09-03', { rpe: 4, durationMin: 40 }),
      session('2026-09-04', { rpe: 5, durationMin: 50 }),
    ]);
    expect(dayFor(gentle, '2026-09-04')?.level).toBe(4);
    expect(dayFor(gentle, '2026-09-01')?.level).toBe(1);
  });

  it('keeps a flat log one shade instead of calling it all maximal', () => {
    // Every session identical: the thresholds collapse, and three equal cut
    // points would put every day in level 4.
    const flat = ['2026-09-01', '2026-09-02', '2026-09-03'].map((d) => session(d));
    const grid = build(flat);
    const levels = flat.map((s) => dayFor(grid, s.date)!.level);
    expect(new Set(levels).size).toBe(1);
    expect(levels[0]).toBeLessThan(4);
  });

  it('orders its thresholds', () => {
    for (const sessions of [[], [session('2026-09-01')], [session('2026-09-01'), session('2026-09-02', { rpe: 9 })]]) {
      const [a, b, c] = build(sessions).thresholds;
      expect(a).toBeLessThan(b);
      expect(b).toBeLessThan(c);
    }
  });
});

describe('a rest day is not a missed day', () => {
  it('marks a logged day with no load as rested', () => {
    // "I rested on purpose" and "I did not open the app" are opposite facts.
    const grid = build([session('2026-09-01', { rpe: 0, durationMin: 0 })]);
    const day = dayFor(grid, '2026-09-01');
    expect(day?.rested).toBe(true);
    expect(day?.level).toBe(0);
    expect(day?.sessions).toBe(1);
  });

  it('does not mark an untouched day as rested', () => {
    expect(dayFor(build([]), '2026-09-01')?.rested).toBe(false);
  });

  it('stops calling a day rested once anything on it carried load', () => {
    const grid = build([
      session('2026-09-01', { rpe: 0, durationMin: 0 }),
      session('2026-09-01', { rpe: 7, durationMin: 60, id: 'b' }),
    ]);
    expect(dayFor(grid, '2026-09-01')?.rested).toBe(false);
  });

  it('counts a rest day as logged', () => {
    expect(build([session('2026-09-01', { rpe: 0, durationMin: 0 })]).loggedDays).toBe(1);
  });
});

describe('what a day carries through', () => {
  it('remembers a day on rock', () => {
    const grid = build([session('2026-09-01', { mode: 'outdoor' })]);
    expect(dayFor(grid, '2026-09-01')?.outdoor).toBe(true);
  });

  it('remembers a deload', () => {
    const grid = build([session('2026-09-01', { deload: true })]);
    expect(dayFor(grid, '2026-09-01')?.deload).toBe(true);
  });

  it('ignores a session that was never completed', () => {
    const grid = build([session('2026-09-01', { completed: false })]);
    expect(dayFor(grid, '2026-09-01')?.sessions).toBe(0);
    expect(grid.loggedDays).toBe(0);
  });

  it('ignores anything outside the window', () => {
    const grid = build([session('2019-01-01'), session('2030-01-01')]);
    expect(grid.loggedDays).toBe(0);
  });
});

describe('gaps and streaks', () => {
  it('counts the longest run of days off', () => {
    const grid = build([session('2026-09-01'), session('2026-09-08')]);
    // The 2nd to the 7th inclusive.
    expect(grid.longestGap).toBe(6);
  });

  it('does not count the time before the first log as a gap', () => {
    // Nobody lapsed in the months before they installed the app.
    expect(build([session(TO)]).longestGap).toBe(0);
  });

  it('does not count days that have not happened as a gap', () => {
    const grid = build([session(TO)]);
    expect(grid.longestGap).toBe(0);
    expect(grid.weeks.flat().filter((d) => d.future).length).toBeGreaterThan(0);
  });

  it('counts the longest run of consecutive days on', () => {
    const grid = build(
      ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-06'].map((d) => session(d)),
    );
    expect(grid.longestStreak).toBe(3);
  });

  it('counts a rest day as part of a streak', () => {
    // It is a logged day; the streak is about showing up.
    const grid = build([
      session('2026-09-01'),
      session('2026-09-02', { rpe: 0, durationMin: 0 }),
      session('2026-09-03'),
    ]);
    expect(grid.longestStreak).toBe(3);
  });

  it('counts the days since the last session', () => {
    // A trailing gap is a real gap — "I have not logged in three weeks" is
    // exactly the thing this chart exists to make visible, and stopping at
    // the last entry would hide the one that matters most.
    const grid = build([session('2026-08-20')]);
    expect(grid.longestGap).toBe(21);
  });

  it('reports nothing for an empty log', () => {
    const grid = build([]);
    expect(grid.longestGap).toBe(0);
    expect(grid.longestStreak).toBe(0);
    expect(grid.loggedDays).toBe(0);
  });
});

describe('month marks', () => {
  it('names each month once, in order', () => {
    const months = build([]).months;
    expect(months.length).toBeGreaterThanOrEqual(12);
    for (let i = 1; i < months.length; i++) {
      expect(months[i]!.column).toBeGreaterThan(months[i - 1]!.column);
    }
  });

  it('points at a column that exists', () => {
    const grid = build([]);
    for (const mark of grid.months) {
      expect(grid.weeks[mark.column]).toBeDefined();
    }
  });
});

describe('the sentence under the grid', () => {
  it('says so when there is nothing', () => {
    expect(describeConsistency(build([]))).toMatch(/nothing logged/i);
  });

  it('reports the gap without calling it a failure', () => {
    // The app does not know whether that fortnight was an injury, a holiday
    // or a newborn.
    const text = describeConsistency(build([session('2026-08-01'), session('2026-08-20'), session('2026-09-05'), session(TO)]));
    expect(text).toMatch(/longest gap 18 days/);
    expect(text).not.toMatch(/should|failed|only|missed|bad/i);
  });

  it('counts days a week rather than a raw total', () => {
    expect(describeConsistency(build([session('2026-09-01')]))).toMatch(/a week/);
  });
});

/**
 * A fourth state beside logged, rested and nothing at all (PLAN.md M275).
 *
 * The rule this file has followed since M162 is that *"'I rested on purpose'
 * and 'I did not open the app' are opposite facts, and a grid that draws them
 * the same colour tells the climber the first is a failure."* A fortnight in
 * Font is a third fact again, and the grid had no way to hold it.
 */
describe('days the climber marked away', () => {
  const marker = (from: string, to: string, over: Record<string, unknown> = {}) => [
    { id: 'a1', from, to, kind: 'trip' as const, note: "Font '26", updatedAt: `${TO}T00:00:00.000Z`, ...over },
  ];
  const away = (sessions: Session[], periods: ReturnType<typeof marker>) =>
    buildHeatGrid({ sessions, to: TO, weeks: 53, away: periods });

  it('carries the marker on every day of the range, both ends included', () => {
    const grid = away([session('2026-06-01')], marker('2026-08-01', '2026-08-14'));
    expect(dayFor(grid, '2026-07-31')?.away).toBeNull();
    expect(dayFor(grid, '2026-08-01')?.away?.note).toBe("Font '26");
    expect(dayFor(grid, '2026-08-14')?.away?.note).toBe("Font '26");
    expect(dayFor(grid, '2026-08-15')?.away).toBeNull();
  });

  /** A hole in the future is not an absence; nothing is marked past the end. */
  it('never marks a future day', () => {
    const grid = away([session('2026-06-01')], marker('2026-09-01', '2026-09-30'));
    expect(dayFor(grid, '2026-09-10')?.away).not.toBeNull();
    expect(dayFor(grid, '2026-09-11')?.future).toBe(true);
    expect(dayFor(grid, '2026-09-11')?.away).toBeNull();
  });

  /**
   * The number that reads as failure. Three quiet days either side of a
   * marked fortnight are six days of silence, not thirty-one.
   */
  it('does not let a marked stretch become the longest gap', () => {
    // Ending on the last logged day, so the only gap in the window is the one
    // under test — a window running on past it carries its own trailing gap,
    // which was the first draft of this test and measured that instead.
    const log = [session('2026-07-01'), session('2026-08-20')];
    const end = '2026-08-20';
    expect(buildHeatGrid({ sessions: log, to: end, weeks: 53 }).longestGap).toBe(49);
    const marked = buildHeatGrid({
      sessions: log,
      to: end,
      weeks: 53,
      away: marker('2026-07-05', '2026-08-15'),
    });
    // Three quiet days before the marker and four after it.
    expect(marked.longestGap).toBe(7);
  });

  /**
   * And the half that does not follow: a streak is a claim about training,
   * and six weeks with a broken wrist is not one. Skipping the marker in both
   * directions was the first draft, and it let a lay-off read as an unbroken
   * run straight through.
   */
  it('still ends a streak', () => {
    const log = [
      session('2026-08-01'),
      session('2026-08-02'),
      session('2026-08-03'),
      session('2026-09-01'),
      session('2026-09-02'),
      session('2026-09-03'),
    ];
    const grid = away(log, marker('2026-08-04', '2026-08-31', { kind: 'injured', note: 'wrist' }));
    expect(grid.longestStreak).toBe(3);
  });

  it('leaves a grid with no markers exactly as it was', () => {
    const log = [session('2026-07-01'), session('2026-08-20')];
    const plain = build(log);
    const empty = away(log, []);
    expect(empty.longestGap).toBe(plain.longestGap);
    expect(empty.longestStreak).toBe(plain.longestStreak);
    expect(empty.weeks.flat().every((d) => d.away === null)).toBe(true);
  });

  /** A day that was both — one logged afternoon inside a fortnight in Font. */
  it('keeps the session on a marked day that has one', () => {
    const grid = away([session('2026-08-05')], marker('2026-08-01', '2026-08-14'));
    const day = dayFor(grid, '2026-08-05');
    expect(day?.sessions).toBe(1);
    expect(day?.away?.note).toBe("Font '26");
  });
});
