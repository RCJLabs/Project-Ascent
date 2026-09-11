import { describe, expect, it } from 'vitest';
import { PROGRAMS, getProgram } from '@/content/programs';
import { adaptProgram } from './adapt';
import { TEST_REASON_LABEL, assessmentBattery, testWeeks } from './assessments';
import { plannedDay } from './plan';
import type { Program } from '@/content/types';

/**
 * The weeks a program asks for numbers (PLAN.md M67).
 *
 * Every program declared its assessments and nothing ever put one on a date,
 * so a climber met them by visiting a page or by the coach telling them they
 * were late.
 */

/**
 * Blocks that measure something. Trip Prep is the one that does not, on the
 * coach's call (PLAN.md M95): a four-week block resolves its test weeks to
 * weeks 1 and 4, week 4 is its taper, and a taper exists to keep a climber
 * off a maximum effort. A program with no assessments has no test weeks by
 * construction — the rules below are about where tests land, not about
 * whether every block has to have them.
 */
const structured = PROGRAMS.filter((p) => p.kind !== 'mode' && p.assessments.length > 0);

describe('a block that measures nothing', () => {
  it('is asked for no test weeks at all', () => {
    const measureless = PROGRAMS.filter((p) => p.kind !== 'mode' && p.assessments.length === 0);
    expect(measureless.map((p) => p.id)).toEqual(['trip_prep']);
    for (const program of measureless) expect(testWeeks(program), program.id).toEqual([]);
  });
});

describe('which weeks are test weeks', () => {
  it('starts every block with a baseline', () => {
    for (const program of structured) {
      expect(testWeeks(program)[0], program.id).toEqual({ week: 1, why: 'baseline' });
    }
  });

  it('ends every block with the after', () => {
    for (const program of structured) {
      const last = testWeeks(program).at(-1)!;
      expect(last.week, program.id).toBe(program.weeks);
    }
  });

  // The calendar and the assessments page must agree, so this uses the weeks
  // the existing `phase` due rule already keys off: the first of each phase.
  it('tests at the start of every phase', () => {
    for (const program of structured) {
      const weeks = testWeeks(program).map((t) => t.week);
      for (const phase of program.phases) expect(weeks, `${program.id} phase ${phase.id}`).toContain(phase.weekStart);
    }
  });

  it('never names a week the program does not have, or one twice', () => {
    for (const program of structured) {
      const weeks = testWeeks(program).map((t) => t.week);
      expect(new Set(weeks).size, program.id).toBe(weeks.length);
      for (const week of weeks) {
        expect(week, program.id).toBeGreaterThanOrEqual(1);
        expect(week, program.id).toBeLessThanOrEqual(program.weeks);
      }
      expect([...weeks].sort((a, b) => a - b)).toEqual(weeks);
    }
  });

  // A logging mode has no periodisation and no finish line, so a test week
  // in one would be a date chosen by nothing.
  it('leaves the logging modes alone', () => {
    for (const program of PROGRAMS.filter((p) => p.kind === 'mode')) {
      expect(testWeeks(program), program.id).toEqual([]);
    }
  });

  it('says nothing for a program that asks for no assessments', () => {
    const none = { ...structured[0]!, assessments: [] } as Program;
    expect(testWeeks(none)).toEqual([]);
  });

  it('has words for every reason it gives', () => {
    for (const program of structured) {
      for (const { why } of testWeeks(program)) expect(TEST_REASON_LABEL[why]).toBeTruthy();
    }
  });

  // A block run over six weeks tests at its own phase boundaries, not the
  // written program's (PLAN.md M56).
  it('follows a program that has been shortened', () => {
    const six = adaptProgram(structured.find((p) => p.id === 'gravity_defied')!, 6);
    expect(testWeeks(six).map((t) => t.week)).toEqual([1, 3, 5, 6]);
  });
});

describe('the day a climber is standing on', () => {
  const program = getProgram('gravity_defied')!;
  const plan = { 1: 'tech', 3: 'eng', 5: 'perf' } as const;
  const day = (date: string) => plannedDay(program, '2026-01-05', plan, date);

  it('knows it is a test week, and why', () => {
    expect(day('2026-01-05').test).toBe('baseline');
    // Week 5 is the second phase's first week.
    expect(day('2026-02-02').test).toBe('phase');
  });

  it('says nothing on an ordinary week', () => {
    expect(day('2026-01-12').test).toBeUndefined();
    expect(day('2026-01-19').test).toBeUndefined();
  });

  it('says nothing before the program starts', () => {
    expect(day('2025-12-29').test).toBeUndefined();
  });
});

describe('what the test week is for', () => {
  // The point of a baseline week: the battery has nothing to show yet, and
  // says so rather than looking finished.
  it('lines up with the assessments the program asks for', () => {
    const program = getProgram('iron_grip')!;
    const battery = assessmentBattery([], { program, startDate: '2026-01-05' });
    const due = battery.filter((b) => b.due === 'baseline').map((b) => b.metric.id);
    for (const id of program.assessments) expect(due, id).toContain(id);
  });
});
