import { describe, expect, it } from 'vitest';
import { isWeekTable, marksDeload, saysDeload, weekOf } from './weekMarks';

/**
 * Every rule here was got wrong once, and none of the mistakes showed up in
 * a passing test suite — the browser caught them (PLAN.md M34).
 */

const WEEK = ['Week', 'Focus'];

describe('which table is about weeks', () => {
  it('takes the header at its word', () => {
    expect(isWeekTable(['Week', 'Focus'])).toBe(true);
    expect(isWeekTable(['Weeks', 'Phase'])).toBe(true);
    expect(isWeekTable([' weeks '])).toBe(true);
  });

  it('refuses every other numeric column these guides use', () => {
    // All of these head a column of numbers in a real guide.
    for (const head of ['Step', 'Level', 'RPE', 'Attempt', 'Metric', 'Protocol', 'Limiter', 'Position']) {
      expect(isWeekTable([head, 'x']), head).toBe(false);
    }
    expect(isWeekTable([])).toBe(false);
    expect(isWeekTable([''])).toBe(false);
    // The whole header, not a word inside it: a "Weekly template" is a
    // day-of-the-week grid whose first column is Monday, not week 1.
    expect(isWeekTable(['Weekly template', 'Mon'])).toBe(false);
    expect(isWeekTable(['Week focus', 'x'])).toBe(false);
  });
});

describe('which row is one week', () => {
  it('reads a plain week number', () => {
    expect(weekOf(['8', 'Deload'])).toBe(8);
    expect(weekOf(['4 (Deload)', 'x'])).toBe(4);
    expect(weekOf([' 11 ', 'x'])).toBe(11);
  });

  it('refuses a range, because marking the block would say the opposite', () => {
    expect(weekOf(['1–4', 'BUILD'])).toBeNull();
    // Two digits either side: the case that needs the no-more-digits guard,
    // because the engine will otherwise retry with a shorter number.
    expect(weekOf(['10–11', 'PEAK'])).toBeNull();
    expect(weekOf(['10–12', 'x'])).toBeNull();
    expect(weekOf(['5-8', 'x'])).toBeNull();
    expect(weekOf(['6—8', 'x'])).toBeNull();
  });

  it('reads nothing from a row that is not a number', () => {
    expect(weekOf(['ARC Training', 'x'])).toBeNull();
    expect(weekOf([])).toBeNull();
  });
});

describe('a row that already says it', () => {
  it('is a label, not the word in a sentence', () => {
    expect(saysDeload(['5', 'DELOAD 1'])).toBe(true);
    expect(saysDeload(['9', 'Deload 2 ★'])).toBe(true);
    expect(saysDeload(['8', 'Deload + One-Hang Attempts'])).toBe(true);
    expect(saysDeload(['4 (Deload)', 'x'])).toBe(true);
    expect(saysDeload(['8', 'Target Practice — DELOAD'])).toBe(true);
    // A send week that tapers is not a deload week.
    expect(saysDeload(['12', 'SEND', 'Deload volume. All energy toward project.'])).toBe(false);
  });
});

describe('the mark itself', () => {
  it('lands on a scheduled week the guide has not named', () => {
    expect(marksDeload(WEEK, ['11', 'ARC only: taper'], [4, 8, 11])).toBe(true);
  });

  it('does not repeat a label the guide already carries', () => {
    expect(marksDeload(['Weeks', 'Phase'], ['5', 'DELOAD 1'], [5, 9])).toBe(false);
  });

  it('never lands on a week the program does not schedule', () => {
    expect(marksDeload(WEEK, ['7', 'x'], [4, 8])).toBe(false);
    expect(marksDeload(WEEK, ['7', 'x'], undefined)).toBe(false);
    expect(marksDeload(WEEK, ['7', 'x'], [])).toBe(false);
  });

  it('never lands on a table that is not about weeks', () => {
    // The bug the browser found: "4x4 Intervals" marked as week 4.
    expect(marksDeload(['Protocol', 'Detail'], ['4x4 Intervals', 'x'], [4, 8])).toBe(false);
    expect(marksDeload(['Step', 'Detail'], ['4. Link it', 'x'], [4])).toBe(false);
  });

  it('never lands on a range', () => {
    expect(marksDeload(['Weeks', 'Phase'], ['1–4', 'BUILD'], [4])).toBe(false);
  });
});
