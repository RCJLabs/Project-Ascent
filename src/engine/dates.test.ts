import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  fromKey,
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
