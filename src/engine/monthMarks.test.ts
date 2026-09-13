import { describe, expect, it } from 'vitest';
import type { SessionType } from '@/content/types';
import { monthMarks, worthExplaining, type MarkedDay } from './monthMarks';

/**
 * The key to a month, against the cases the page cannot easily be put in
 * (PLAN.md M145): a limit day in the borrowed leading week, a logged day
 * that is only a trailing one, and two session types a custom program gave
 * the same name.
 */

const type = (id: string, patch: Partial<SessionType> = {}): SessionType =>
  ({ id, name: `Session ${id}`, icon: '⚡', intensity: 'hard', ...patch }) as SessionType;

const day = (patch: Partial<MarkedDay> = {}): MarkedDay => ({
  inMonth: true,
  done: false,
  ...patch,
});

describe('the sessions a month holds', () => {
  it('collects each distinct type once, in the order it meets them', () => {
    const a = type('a');
    const b = type('b');
    const marks = monthMarks([day({ type: a }), day({ type: b }), day({ type: a })]);
    expect(marks.types.map((t) => t.id)).toEqual(['a', 'b']);
  });

  /**
   * Keyed by id, not by name. The builder lets a climber name their session
   * types whatever they like, so two can share a name — and collapsing them
   * would drop one from the key while the grid went on drawing both.
   */
  it('keeps two types a custom program gave the same name', () => {
    const marks = monthMarks([
      day({ type: type('a', { name: 'Climbing' }) }),
      day({ type: type('b', { name: 'Climbing', icon: '✋' }) }),
    ]);
    expect(marks.types).toHaveLength(2);
  });

  // The grid draws a session icon on the leading and trailing squares too,
  // so the key has to name what they are.
  it('counts a session in the week borrowed from the month before', () => {
    const marks = monthMarks([day({ inMonth: false, type: type('a') })]);
    expect(marks.types.map((t) => t.id)).toEqual(['a']);
  });

  it('has no types at all in a month with nothing planned', () => {
    expect(monthMarks([day(), day()]).types).toEqual([]);
  });
});

describe('the three week markers', () => {
  /**
   * `inMonth` only, because that is exactly how the cell gates them. A
   * legend that gated differently from the grid is the bug this exists to
   * prevent, in the other direction.
   */
  it('ignores a limit day in the borrowed leading week', () => {
    const limit = type('perf', { intensity: 'max' });
    expect(monthMarks([day({ inMonth: false, type: limit })]).limit).toBe(false);
    expect(monthMarks([day({ inMonth: true, type: limit })]).limit).toBe(true);
  });

  it('ignores a deload and a test outside the month', () => {
    const outside = day({ inMonth: false, isDeload: true, test: 'week 4' });
    expect(monthMarks([outside]).deload).toBe(false);
    expect(monthMarks([outside]).test).toBe(false);
  });

  it('reads a deload and a test inside it', () => {
    const inside = day({ isDeload: true, test: 'week 4' });
    expect(monthMarks([inside]).deload).toBe(true);
    expect(monthMarks([inside]).test).toBe(true);
  });

  // The complaint that started this: a month of hard days is not a month
  // with a limit day in it, and the legend said otherwise.
  it('claims no limit day for a month of merely hard ones', () => {
    const marks = monthMarks([day({ type: type('fp') }), day({ type: type('perf') })]);
    expect(marks.limit).toBe(false);
  });
});

describe('the logged row', () => {
  // Ungated, because the grid draws a tick on the borrowed squares too.
  it('counts a logged day in the trailing week', () => {
    expect(monthMarks([day({ inMonth: false, done: true })]).logged).toBe(true);
  });

  it('ignores a day that was started and never finished', () => {
    expect(monthMarks([day({ done: false })]).logged).toBe(false);
  });
});

describe('whether there is a legend at all', () => {
  it('is nothing to explain on an empty month', () => {
    expect(worthExplaining(monthMarks([day(), day()]))).toBe(false);
  });

  it('is worth explaining once a day is logged', () => {
    expect(worthExplaining(monthMarks([day({ done: true })]))).toBe(true);
  });

  it('is worth explaining once a session is planned', () => {
    expect(worthExplaining(monthMarks([day({ type: type('a') })]))).toBe(true);
  });

  // A deload with nothing planned and nothing logged cannot happen — the
  // week markers only exist where a block is running — so the card does
  // not turn on for them alone.
  it('does not turn on for a week marker by itself', () => {
    expect(worthExplaining(monthMarks([day({ isDeload: true })]))).toBe(false);
  });
});
