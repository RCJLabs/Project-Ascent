import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import type { MetricEntry } from '@/db/metrics';
import { blockEnd, describeBlockEnd, type Below } from './blockEnd';
import { blockReport, describeBlock, retestWhen } from './blockReport';
import { addDays } from './dates';
import { testWeeks } from './testWeeks';
import type { BlockRecord } from './blocks';

/**
 * What the block review says, by the state the block is in (PLAN.md M366).
 *
 * M365a found two sentences that said the same thing whatever was true:
 * the retest card asked for a reading *now* on a block that had ended, and
 * the opening sentence promised three sections over a page that showed one.
 */

const IG = getProgram('iron_grip')!;
const START = '2026-03-01'; // a Sunday: week one starts on it
const week = (n: number) => addDays(START, (n - 1) * 7);
const LAST = addDays(START, IG.weeks * 7 - 1);
const entry = (metricId: string, date: string, value: number) => ({ id: `${metricId}@${date}`, metricId, date, value }) as unknown as MetricEntry;
const BASELINES = [entry('max_hang_20mm_7s', addDays(START, 2), 40), entry('dead_hang', addDays(START, 2), 60)];
const report = (today: string, entries = BASELINES, until?: string) =>
  blockReport({ program: IG, startDate: START, entries, today, until })!;

/** The first test week after the baseline. */
const NEXT_TEST = testWeeks(IG).find((t) => t.why !== 'baseline')!.week;

describe('closed', () => {
  it('is false while a reading today still counts, and true once it would not', () => {
    expect(report(week(2)).closed).toBe(false);
    expect(report(LAST).closed, 'the last day still takes a reading').toBe(false);
    expect(report(addDays(LAST, 1)).closed).toBe(true);
    expect(report(week(9), BASELINES, addDays(week(6), 6)).closed, 'a block left in week six').toBe(true);
  });
});

describe('retestWhen', () => {
  it('names the next test week while it is still ahead', () => {
    expect(NEXT_TEST).toBeGreaterThan(2);
    const when = retestWhen(report(week(2)), week(2));
    expect(when.when).toBe('later');
    expect(when.when === 'later' && when.window.week).toBe(NEXT_TEST);
  });

  it('does not count the baseline week as a retest', () => {
    // In week one, with the baseline just taken: the week is a test week,
    // and it is the one that took the before.
    const when = retestWhen(report(addDays(START, 4)), addDays(START, 4));
    expect(when.when).toBe('later');
    expect(when.when === 'later' && when.window.week).toBe(NEXT_TEST);
  });

  it('looks past a test week that has gone by', () => {
    const tests = testWeeks(IG).filter((t) => t.why !== 'baseline');
    const after = tests[1]!.week;
    // The day after the first retest week ended, and not inside another.
    const day = addDays(week(NEXT_TEST), 7);
    expect(tests.some((t) => t.week === NEXT_TEST + 1), 'the fixture lands in a test week').toBe(false);
    const when = retestWhen(report(day), day);
    expect(when.when).toBe('later');
    expect(when.when === 'later' && when.window.week).toBe(after);
  });

  it('says now inside a test week, and in the final one', () => {
    const inTest = retestWhen(report(addDays(week(NEXT_TEST), 3)), addDays(week(NEXT_TEST), 3));
    expect(inTest.when).toBe('now');
    expect(inTest.when === 'now' && inTest.window?.week).toBe(NEXT_TEST);
    expect(retestWhen(report(LAST), LAST).when).toBe('now');
  });

  it('says it is over once the block has ended or been left', () => {
    expect(retestWhen(report(addDays(LAST, 30)), addDays(LAST, 30)).when).toBe('over');
    expect(retestWhen(report(week(9), BASELINES, addDays(week(6), 6)), week(9)).when).toBe('over');
  });
});

describe('describeBlock with baselines and no retests', () => {
  it('points at the test weeks only while they are ahead', () => {
    expect(describeBlock(report(week(2)))).toBe(
      "Nothing to compare yet: two of the 9 Iron Grip assessments have a baseline and no retest. The block's test weeks are the ones to take them in.",
    );
    expect(describeBlock(report(addDays(LAST, 30)))).toBe(
      'Nothing to compare: two of the 9 Iron Grip assessments have a baseline and no retest, and the block is over.',
    );
  });

  it('agrees with one', () => {
    const one = [BASELINES[0]!];
    expect(describeBlock(report(week(2), one))).toBe(
      "Nothing to compare yet: one of the 9 Iron Grip assessments has a baseline and no retest. The block's test weeks are the ones to take it in.",
    );
    expect(describeBlock(report(addDays(LAST, 30), one))).toContain('one of the 9 Iron Grip assessments has a baseline');
  });
});

describe('describeBlockEnd, given what is below it', () => {
  const ALL: Below = { sessions: true, numbers: true, next: true };
  const NONE: Below = { sessions: false, numbers: false, next: false };
  const ended = blockEnd({ program: IG, startDate: START, entries: [], today: addDays(LAST, 1) });
  const row = (patch: Partial<BlockRecord>): BlockRecord => ({
    id: `iron_grip#${START}`, programId: 'iron_grip', name: 'Iron Grip', startDate: START, weeks: 12, endedAt: null, ...patch,
  });

  it('names every section when every section is there, as it always did', () => {
    expect(describeBlockEnd(ended, ALL)).toBe(
      'Iron Grip ran out yesterday. Below is which of its sessions happened, which of the numbers moved, and what it has written down about what comes next.',
    );
  });

  it('names only the sections that are there', () => {
    expect(describeBlockEnd(ended, NONE)).toBe('Iron Grip ran out yesterday.');
    expect(describeBlockEnd(ended, { ...NONE, sessions: true })).toBe(
      'Iron Grip ran out yesterday. Below is which of its sessions happened.',
    );
    expect(describeBlockEnd(ended, { ...NONE, sessions: true, next: true })).toBe(
      'Iron Grip ran out yesterday. Below is which of its sessions happened, and what it has written down about what comes next.',
    );
  });

  it('does the same for a block the climber left', () => {
    const left = blockEnd({
      program: IG, startDate: START, entries: [], today: week(10),
      record: row({ endedAt: addDays(week(6), 6), reason: 'stopped' }),
    });
    expect(describeBlockEnd(left, ALL)).toContain(
      '— below is which of its sessions happened, and which of the numbers moved while you were on it.',
    );
    expect(describeBlockEnd(left, NONE)).toBe(
      'You left Iron Grip after 6 of its 12 weeks. That is a fact about the calendar and not a verdict.',
    );
    expect(describeBlockEnd(left, { ...NONE, numbers: true })).toContain(
      '— below is which of the numbers moved while you were on it.',
    );
  });

  it('promises numbers for a block of unknown ending only when there are some', () => {
    const unknown = blockEnd({
      program: IG, startDate: START, entries: [], today: addDays(LAST, 10), record: row({ reconstructed: true, endedAt: LAST }),
    });
    expect(describeBlockEnd(unknown, ALL)).toContain('The numbers below are whatever was measured');
    expect(describeBlockEnd(unknown, NONE)).not.toContain('The numbers below');
  });
});
