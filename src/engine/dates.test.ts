import { describe, expect, it } from 'vitest';
import { newSession } from '@/db/sessions';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  fromKey,
  isDateKey,
  isYearKey,
  today,
  monthGrid,
  programWeek,
  startOfWeek,
  toKey,
  weekDays,
} from './dates';

describe('date keys', () => {
  it('round-trips through local time, not UTC', () => {
    // 11pm local must stay on its own day.
    const late = new Date(2026, 2, 14, 23, 30);
    expect(toKey(late)).toBe('2026-03-14');
    expect(toKey(fromKey('2026-03-14'))).toBe('2026-03-14');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('survives a daylight-saving transition', () => {
    // US DST begins 2026-03-08; adding a day must not slip.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('aligns weeks to Sunday', () => {
    expect(dayOfWeek('2026-03-08')).toBe(0);
    expect(startOfWeek('2026-03-11')).toBe('2026-03-08');
    expect(startOfWeek('2026-03-08')).toBe('2026-03-08');
    expect(weekDays('2026-03-11')).toHaveLength(7);
    expect(weekDays('2026-03-11')[0]).toBe('2026-03-08');
  });
});

describe('programWeek', () => {
  it('counts Sunday-aligned weeks from the start date', () => {
    // Program starts Wednesday; that whole week is week 1.
    expect(programWeek('2026-03-11', '2026-03-11', 12)).toBe(1);
    expect(programWeek('2026-03-11', '2026-03-14', 12)).toBe(1);
    expect(programWeek('2026-03-11', '2026-03-15', 12)).toBe(2);
  });

  it('returns null before the program began', () => {
    expect(programWeek('2026-03-11', '2026-03-07', 12)).toBeNull();
  });

  it('clamps at the final week', () => {
    expect(programWeek('2026-01-01', '2027-01-01', 12)).toBe(12);
  });
});

describe('monthGrid', () => {
  it('returns whole weeks covering the month', () => {
    const grid = monthGrid(2026, 2); // March 2026
    expect(grid.length % 7).toBe(0);
    expect(dayOfWeek(grid[0]!)).toBe(0);
    expect(grid).toContain('2026-03-01');
    expect(grid).toContain('2026-03-31');
  });
});

/**
 * Route parameters that are not what they claim to be (PLAN.md M42).
 *
 * `/log/<anything>` used the parameter as the session's stored date key, so
 * logging a session from `/log/nope` wrote `{ id: 'nope#0', date: 'nope' }`
 * and logging one from `/log/2026-9-1` wrote a row that `/log/2026-09-01` —
 * the same day, written the way the rest of the app writes it — could never
 * see. Not a cosmetic bug: a session invisible to the calendar, the streak
 * and every derivation.
 */
describe('validating a date key', () => {
  it('accepts a real day written the one way the app writes days', () => {
    for (const key of ['2026-09-10', '2024-02-29', '1900-01-01', '2026-12-31']) {
      expect(isDateKey(key), key).toBe(true);
    }
  });

  it('rejects an overflow rather than rolling it forward', () => {
    // These are the ones that rendered a different date than the URL named.
    expect(isDateKey('2026-13-45'), 'became 14 February 2027').toBe(false);
    expect(isDateKey('2026-02-30'), 'became 2 March').toBe(false);
    expect(isDateKey('9999-99-99')).toBe(false);
    expect(isDateKey('0000-00-00')).toBe(false);
    expect(isDateKey('2025-02-29'), '2025 is not a leap year').toBe(false);
  });

  it('bounds the year, which the round-trip alone does not', () => {
    // `10000-01-01` survives `fromKey` → `toKey` unchanged, so without the
    // shape test it reads as a valid key. The two halves of `isDateKey` are
    // not redundant and this is the case that says so.
    expect(isDateKey('10000-01-01')).toBe(false);
    expect(isDateKey('050-01-01')).toBe(false);
  });

  it('rejects a day written some other way', () => {
    // `2026-9-1` is a real day and still wrong: it is a second spelling, and
    // a second spelling is a second key.
    for (const key of ['2026-9-1', '20260910', '2026/09/10', 'nope', '', '2026-09-10 ', ' 2026-09-10']) {
      expect(isDateKey(key), JSON.stringify(key)).toBe(false);
    }
  });

  it('agrees with the keys the app generates', () => {
    let key = '2024-01-01';
    for (let i = 0; i < 800; i += 1) {
      expect(isDateKey(key), key).toBe(true);
      key = addDays(key, 1);
    }
    expect(isDateKey(today())).toBe(true);
  });
});

describe('validating a year', () => {
  it('accepts a four-digit year up to now', () => {
    expect(isYearKey('2026', 2026)).toBe(true);
    expect(isYearKey('1900', 2026)).toBe(true);
    expect(isYearKey('2019', 2026)).toBe(true);
  });

  it('rejects everything the route used to render as a heading', () => {
    for (const value of ['nope', '0', '-5', '99999', '2026.5', '1e9', '', '202']) {
      expect(isYearKey(value, 2026), JSON.stringify(value)).toBe(false);
    }
  });

  it('rejects a number that is only nearly a year', () => {
    // Range-checking a parsed number is not the same as checking the shape:
    // `2020.5` and ` 2020` both parse inside the range, and both are broken
    // links rather than years.
    expect(isYearKey('2020.5', 2026)).toBe(false);
    expect(isYearKey(' 2020', 2026)).toBe(false);
    expect(isYearKey('2020 ', 2026)).toBe(false);
    expect(isYearKey('+2020', 2026)).toBe(false);
  });

  it('rejects a year that has not happened', () => {
    expect(isYearKey('2027', 2026), 'nothing to review yet').toBe(false);
    expect(isYearKey('1899', 2026)).toBe(false);
  });
});

describe('the write path refuses what the route refuses', () => {
  it('will not build a session on a date that is not one', () => {
    // The second layer. The route stops it reaching here from the UI; this
    // stops it reaching the database from anywhere.
    for (const bad of ['nope', '2026-9-1', '2026-13-45', '', '2026-02-30']) {
      expect(() => newSession(bad, 0), JSON.stringify(bad)).toThrow(/date key/);
    }
  });

  it('still builds one on a real day, keyed the one way', () => {
    const session = newSession('2026-09-01', 0);
    expect(session.id).toBe('2026-09-01#0');
    expect(session.date).toBe('2026-09-01');
  });
});
