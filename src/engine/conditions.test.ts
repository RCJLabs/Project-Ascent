import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import {
  POOR_RUN,
  conditionOptions,
  conditionsOf,
  conditionsTally,
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

/**
 * How the rock has been, counted (PLAN.md M303).
 *
 * The module had one reader for two hundred milestones — `poorRun`, through
 * the coach — and its rule is strict enough that over the sample climber's
 * year, 29 days on rock with every one answered, it could fire on none of
 * the 365 days. A count is what the question can always answer.
 */
describe('how the rock has been', () => {
  const outdoor = (date: string, said?: string, patch: Partial<Session> = {}): Session =>
    ({
      ...newSession(date, 0, { completed: true }),
      mode: 'outdoor',
      ...(said === undefined ? {} : { fields: { conditions: said } }),
      ...patch,
    }) as Session;

  it('counts days, worst first, in the registry’s own words', () => {
    const [worst, middle] = conditionOptions();
    const tally = conditionsTally([
      outdoor('2026-03-01', middle),
      outdoor('2026-03-03', worst),
      outdoor('2026-03-05', worst),
    ]);
    expect(tally).toEqual([
      { word: worst, days: 2 },
      { word: middle, days: 1 },
    ]);
  });

  it('leaves out an answer nobody gave', () => {
    const [worst] = conditionOptions();
    expect(conditionsTally([outdoor('2026-03-01', worst)])).toEqual([{ word: worst, days: 1 }]);
  });

  /**
   * A day on rock nobody answered for is not a good day. Counting it as one
   * is the mistake `poorRun`'s own comment names — a reading of the days you
   * happened to tell it about.
   */
  it('counts no day the question was not answered on', () => {
    expect(conditionsTally([outdoor('2026-03-01')])).toEqual([]);
  });

  it('counts a day with two sessions once', () => {
    const [worst] = conditionOptions();
    const twice = [
      outdoor('2026-03-01', worst),
      { ...outdoor('2026-03-01', worst), id: '2026-03-01#1' } as Session,
    ];
    expect(conditionsTally(twice)).toEqual([{ word: worst, days: 1 }]);
  });

  /**
   * *"It counts as answered when either of them answered"* — the rule
   * `answersByDay` states and nothing had held. A mutation that took the
   * last session's value whatever it was survived a full battery, because
   * every fixture here answered on every session.
   */
  it('counts a day as answered when only one of its sessions was', () => {
    const [worst] = conditionOptions();
    const morning = outdoor('2026-03-01', worst);
    const afternoon = { ...outdoor('2026-03-01'), id: '2026-03-01#1' } as Session;
    expect(conditionsTally([morning, afternoon])).toEqual([{ word: worst, days: 1 }]);
    // And the run reads the same day the same way, which is the point of
    // their sharing the function.
    const rest = ['2026-03-03', '2026-03-05'].map((d) => outdoor(d, worst));
    expect(poorRun([morning, afternoon, ...rest])?.days).toBe(3);
  });

  it('takes the later reading where a day was answered twice', () => {
    const [worst, middle] = conditionOptions();
    const both = [
      outdoor('2026-03-01', worst),
      { ...outdoor('2026-03-01', middle), id: '2026-03-01#1' } as Session,
    ];
    expect(conditionsTally(both)).toEqual([{ word: middle, days: 1 }]);
  });

  it('is about rock, not about the gym', () => {
    const [worst] = conditionOptions();
    const indoors = { ...outdoor('2026-03-01', worst), mode: 'indoor' } as Session;
    expect(conditionsTally([indoors])).toEqual([]);
  });

  it('is about what happened, not what was planned', () => {
    const [worst] = conditionOptions();
    expect(conditionsTally([outdoor('2026-03-01', worst, { completed: false })])).toEqual([]);
  });

  /**
   * The count and the run read the same days, because they read them
   * through the same function. Two copies of "what a day on rock is" is one
   * copy plus a thing to forget.
   */
  it('agrees with the run about which days there were', () => {
    const [worst] = conditionOptions();
    const days = ['2026-03-01', '2026-03-03', '2026-03-05'].map((d) => outdoor(d, worst));
    const run = poorRun(days);
    expect(run?.days).toBe(3);
    expect(conditionsTally(days)).toEqual([{ word: worst, days: 3 }]);
  });
});
