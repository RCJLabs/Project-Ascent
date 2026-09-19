import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import {
  POOR_RUN,
  conditionOptions,
  conditionsOf,
  poorRun,
  worstCondition,
} from './conditions';

/**
 * How the rock was (PLAN.md M289).
 *
 * The rule's whole difficulty is that the question is optional and a climber
 * answers it more readily on a bad day, so most of these are about what it
 * refuses to call a run.
 */

function day(date: string, patch: Partial<Session> = {}): Session {
  return {
    id: `${date}#${patch.id ?? 0}`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'outdoor',
    climbs: [],
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    ...patch,
  };
}

const greasy = (date: string, patch: Partial<Session> = {}) =>
  day(date, { fields: { conditions: 'Greasy' }, ...patch });

describe('the answers themselves', () => {
  it('takes the words from the registry rather than a second copy', () => {
    expect(conditionOptions()).toEqual(['Greasy', 'Okay', 'Good']);
    expect(worstCondition()).toBe('Greasy');
  });

  it('reads an answer off a session, and nothing off one that was not asked', () => {
    expect(conditionsOf(greasy('2026-05-01'))).toBe('Greasy');
    expect(conditionsOf(day('2026-05-01'))).toBeNull();
    expect(conditionsOf(day('2026-05-01', { fields: { conditions: '' } }))).toBeNull();
  });
});

describe('a run of days the rock was against you', () => {
  it('finds one and names the day it started', () => {
    const run = poorRun([greasy('2026-05-01'), greasy('2026-05-02'), greasy('2026-05-03')]);
    expect(run).toEqual({ days: 3, from: '2026-05-01', to: '2026-05-03', word: 'greasy' });
  });

  it('wants more than a bad day or two', () => {
    expect(POOR_RUN).toBe(3);
    expect(poorRun([greasy('2026-05-02'), greasy('2026-05-03')])).toBeNull();
  });

  /**
   * The one the rule exists for. A climber says so when it is worth saying,
   * so a run counted over the *answers* would find three greasy days in a
   * log with three greasy days spread across a season.
   */
  it('is broken by a day on rock that was never asked', () => {
    const run = poorRun([
      greasy('2026-05-01'),
      greasy('2026-05-02'),
      day('2026-05-03'),
      greasy('2026-05-04'),
    ]);
    expect(run).toBeNull();
  });

  it('is broken by a good day, and counts only back to it', () => {
    const run = poorRun([
      greasy('2026-05-01'),
      day('2026-05-02', { fields: { conditions: 'Good' } }),
      greasy('2026-05-03'),
      greasy('2026-05-04'),
      greasy('2026-05-05'),
    ]);
    expect(run).toEqual({ days: 3, from: '2026-05-03', to: '2026-05-05', word: 'greasy' });
  });

  it('ends at the last day on rock, not at the last bad one', () => {
    const run = poorRun([
      greasy('2026-05-01'),
      greasy('2026-05-02'),
      greasy('2026-05-03'),
      day('2026-05-09', { fields: { conditions: 'Good' } }),
    ]);
    expect(run).toBeNull();
  });

  it('ignores the gym, however greasy it was in there', () => {
    const run = poorRun([
      greasy('2026-05-01'),
      greasy('2026-05-02'),
      greasy('2026-05-03', { mode: 'indoor' }),
    ]);
    expect(run).toBeNull();
  });

  it('ignores a day that was planned and never done', () => {
    const run = poorRun([
      greasy('2026-05-01'),
      greasy('2026-05-02'),
      greasy('2026-05-03'),
      greasy('2026-05-04', { completed: false }),
    ]);
    expect(run).toEqual({ days: 3, from: '2026-05-01', to: '2026-05-03', word: 'greasy' });
  });

  /**
   * Two sessions on one date are one day on rock. Answered by either of
   * them counts, because the climber answered about the day.
   */
  it('counts a date once, and takes the answer from whichever session has it', () => {
    const run = poorRun([
      greasy('2026-05-01'),
      greasy('2026-05-02'),
      day('2026-05-03', { id: 'a' }),
      greasy('2026-05-03', { id: 'b' }),
    ]);
    expect(run).toEqual({ days: 3, from: '2026-05-01', to: '2026-05-03', word: 'greasy' });
  });

  it('says nothing about a log with no days on rock in it', () => {
    expect(poorRun([])).toBeNull();
    expect(poorRun([day('2026-05-01', { mode: 'indoor' })])).toBeNull();
  });
});
