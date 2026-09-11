import { describe, expect, it } from 'vitest';
import type { ClimbedDay, DayRecord, LedgerEntry } from '@/db/game';
import type { Tape } from './replay';
import { addDays } from '../dates';
import {
  MAX_DAYS,
  ascentHistory,
  dayRun,
  describeAscent,
  heightFromLabel,
  recordDay,
  recoverDays,
} from './history';

/**
 * The day's wall, kept (PLAN.md M96).
 *
 * `AscentRecords.daily` held one record and overwrote it every day, in a
 * game whose own copy says a score is comparable because everyone gets the
 * same wall.
 */

const TODAY = '2026-09-11';
const back = (n: number) => addDays(TODAY, -n);

const tape = (moves: number[]): Tape => ({ seed: 1, mode: 'ascent', ticks: 100, moves, modifiers: {} } as unknown as Tape);

const climbed = (date: string, metres: number, patch: Partial<ClimbedDay> = {}): ClimbedDay => ({
  date,
  metres,
  coins: 3,
  mode: 'ascent',
  ...patch,
});

describe('keeping the day', () => {
  it('keeps yesterday when today is recorded', () => {
    const days = recordDay([climbed(back(1), 400)], climbed(TODAY, 900));
    expect(days.map((d) => d.date)).toEqual([back(1), TODAY]);
  });

  it('keeps the better of two runs on one day', () => {
    const days = recordDay(recordDay([], climbed(TODAY, 900)), climbed(TODAY, 300));
    expect(days).toHaveLength(1);
    expect(days[0]!.metres).toBe(900);
  });

  it('comes back oldest first', () => {
    const days = recordDay(recordDay([], climbed(TODAY, 1)), climbed(back(5), 2));
    expect(days.map((d) => d.date)).toEqual([back(5), TODAY]);
  });

  /**
   * The wall is seeded from the date, so an older tape would draw a climber
   * dodging boulders that are not there — and a year of tapes is a hundred
   * times the bytes of a year of heights.
   */
  it('keeps a tape only on the newest day', () => {
    const days = recordDay([climbed(back(1), 400, { tape: tape([5, 1]) })], climbed(TODAY, 900, { tape: tape([9, -1]) }));
    expect(dayRun(days, back(1))).not.toHaveProperty('tape');
    const today = dayRun(days, TODAY);
    expect(today?.recovered !== true ? today?.tape?.moves : null).toEqual([9, -1]);
  });

  it('drops the tape when a better run brought none', () => {
    const days = recordDay(recordDay([], climbed(TODAY, 300, { tape: tape([5, 1]) })), climbed(TODAY, 900));
    const today = dayRun(days, TODAY);
    expect(today?.recovered !== true ? today?.tape : 'x').toBeUndefined();
  });

  it('caps the history rather than growing forever', () => {
    let days: DayRecord[] = [];
    for (let i = MAX_DAYS + 20; i >= 0; i--) days = recordDay(days, climbed(back(i), 100 + i));
    expect(days).toHaveLength(MAX_DAYS);
    expect(days[days.length - 1]!.date).toBe(TODAY);
  });

  /**
   * A recovered day is a height parsed out of a label. A real recording
   * supersedes it outright, even a lower one — keeping the parsed height
   * beside the new run's tape would claim a climb that never happened.
   */
  it('replaces a recovered day with a real recording', () => {
    const days = recordDay([{ date: TODAY, metres: 5000, recovered: true }], climbed(TODAY, 300));
    expect(days[0]!.metres).toBe(300);
    expect(days[0]!.recovered).toBeUndefined();
  });
});

describe('reading a height back out of a ledger label', () => {
  it('reads the one the app writes', () => {
    expect(heightFromLabel('The Ascent · 1,063 m')).toBe(1063);
    expect(heightFromLabel('The Ascent · 940 m')).toBe(940);
  });

  // `toLocaleString` on a whole number produces grouping separators and
  // nothing else, so the separator does not matter.
  it('reads a height grouped the other way round', () => {
    expect(heightFromLabel('The Ascent · 1.063 m')).toBe(1063);
    expect(heightFromLabel('The Ascent · 1 063 m')).toBe(1063);
  });

  // Better nothing than a number invented from digits that were not there.
  it('refuses a label whose digits are not ASCII', () => {
    expect(heightFromLabel('The Ascent · ١٬٠٦٣ m')).toBeNull();
  });

  it('refuses a label that is not one of ours', () => {
    expect(heightFromLabel('Weekly challenge')).toBeNull();
    expect(heightFromLabel('The Ascent · m')).toBeNull();
    expect(heightFromLabel('')).toBeNull();
  });

  it('refuses a height with something else in it', () => {
    expect(heightFromLabel('The Ascent · 1,063x m')).toBeNull();
  });
});

describe('recovering the days the ledger remembers', () => {
  const entry = (date: string, label: string, origin = 'ascent'): LedgerEntry => ({
    id: `ascent:${date}`,
    date,
    label,
    units: 0.2,
    origin,
  });

  it('turns a label into a day', () => {
    const days = recoverDays([], [entry(back(3), 'The Ascent · 1,063 m')]);
    expect(days).toEqual([{ date: back(3), metres: 1063, recovered: true }]);
  });

  // A real record knows the mode and the coins; a label knows a number.
  it('never overwrites a day already recorded', () => {
    const days = recoverDays([climbed(back(3), 400)], [entry(back(3), 'The Ascent · 1,063 m')]);
    expect(days[0]!.metres).toBe(400);
    expect(days).toHaveLength(1);
  });

  it('ignores a ledger entry that is not an Ascent payout', () => {
    expect(recoverDays([], [entry(back(3), 'The Ascent · 900 m', 'challenge:weekly')])).toEqual([]);
  });

  it('ignores an entry whose label it cannot read', () => {
    expect(recoverDays([], [entry(back(3), 'The Ascent')])).toEqual([]);
  });

  it('comes back oldest first, alongside what was recorded', () => {
    const days = recoverDays([climbed(TODAY, 400)], [entry(back(9), 'The Ascent · 100 m')]);
    expect(days.map((d) => d.date)).toEqual([back(9), TODAY]);
  });

  it('changes nothing when there is nothing to recover', () => {
    const existing = [climbed(TODAY, 400)];
    expect(recoverDays(existing, [])).toEqual(existing);
  });
});

describe('the month behind you', () => {
  const read = (days: DayRecord[], to = TODAY) => ascentHistory({ days, to });

  it('counts the walls climbed and the walls missed', () => {
    const h = read([climbed(TODAY, 900), climbed(back(29), 400)]);
    expect(h.played).toBe(2);
    expect(h.missed).toBe(28);
  });

  /**
   * Days before a climber had the game are not walls they skipped, and a
   * grid that draws them as gaps says they were.
   */
  it('starts at the first wall climbed, not a month ago', () => {
    const h = read([climbed(TODAY, 900), climbed(back(2), 400)]);
    expect(h.from).toBe(back(2));
    expect(h.missed).toBe(1);
  });

  it('leaves out a day older than the window', () => {
    expect(read([climbed(back(40), 900)]).played).toBe(0);
  });

  it('finds the best day and the total', () => {
    const h = read([climbed(TODAY, 900), climbed(back(2), 1400), climbed(back(3), 100)]);
    expect(h.best?.metres).toBe(1400);
    expect(h.total).toBe(2400);
  });

  it('counts a streak back from today', () => {
    expect(read([climbed(TODAY, 1), climbed(back(1), 1), climbed(back(2), 1)]).streak).toBe(3);
  });

  /** Missing the day you are still in is not a miss. */
  it('keeps a streak alive through an unplayed today', () => {
    expect(read([climbed(back(1), 1), climbed(back(2), 1)]).streak).toBe(2);
  });

  it('breaks a streak on a missed day', () => {
    expect(read([climbed(TODAY, 1), climbed(back(2), 1), climbed(back(3), 1)]).streak).toBe(1);
  });

  it('has no streak at all with nothing played', () => {
    expect(read([]).streak).toBe(0);
  });
});

describe('said out loud', () => {
  const say = (days: DayRecord[]) => describeAscent(ascentHistory({ days, to: TODAY }));

  // One wall is a score, not a history.
  it('says nothing about a single day', () => {
    expect(say([climbed(TODAY, 900)])).toBeNull();
    expect(say([])).toBeNull();
  });

  it('counts the walls and the metres', () => {
    // Five days of history, so the window is five days — not a month with
    // twenty-five invented misses in it.
    expect(say([climbed(TODAY, 900), climbed(back(4), 100)])).toMatch(
      /^2 of the last 5 walls, 1,000 m in total\. Your best was 900 m\./,
    );
  });

  it('says a month when there is a month of it', () => {
    expect(say([climbed(TODAY, 900), climbed(back(29), 100)])).toMatch(/^2 of the last 30 walls/);
  });

  it('mentions a run of days', () => {
    expect(say([climbed(TODAY, 900), climbed(back(1), 100)])).toMatch(/2 days in a row\.$/);
  });

  it('stays quiet about a run of one', () => {
    expect(say([climbed(TODAY, 900), climbed(back(4), 100)])).not.toMatch(/in a row/);
  });
});
