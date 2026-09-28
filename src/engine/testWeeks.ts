/**
 * The weeks a program tests in, and what to call them (PLAN.md M345).
 *
 * Out of `assessments.ts`, which the first load carried whole for these:
 * today's plan and its card need the test weeks at boot, and the parser,
 * the formatter and the series beside them only ever run on lazy pages.
 * Moving these two took the 7KB metric registry out of the first load with
 * it, because only the parser had brought it in.
 */

import type { Program } from '@/content/types';

/**
 * The weeks a program expects you to test in (PLAN.md M67).
 *
 * Every program declares `assessments` and nothing ever put one on a date.
 * The app already knew when a test was *due* — no baseline, a new phase
 * since the last one, or eight weeks stale — but a climber only found out by
 * visiting the assessments page, or afterwards, from the coach saying they
 * were late.
 *
 * The weeks are the ones the existing rules already key off, so the calendar
 * and the assessments page cannot disagree: **week one**, because a block
 * without a before has no after; **the first week of every later phase**,
 * which is exactly when `assessmentStatus` starts reporting `phase`; and
 * **the last week**, which is the after.
 *
 * Logging modes are left alone. They have no periodisation and no finish
 * line, so a test week in one would be a date chosen by nothing.
 */
export type TestReason = 'baseline' | 'phase' | 'final';

export function testWeeks(program: Program): { week: number; why: TestReason }[] {
  if (program.kind === 'mode' || program.assessments.length === 0) return [];

  const weeks = new Map<number, TestReason>();
  // Later writes lose to earlier ones: a week that is both the start of a
  // phase and the end of the block is the phase test, which is the one with
  // something to compare against.
  const claim = (week: number, why: TestReason) => {
    if (week >= 1 && week <= program.weeks && !weeks.has(week)) weeks.set(week, why);
  };

  claim(1, 'baseline');
  for (const phase of program.phases) claim(phase.weekStart, 'phase');
  claim(program.weeks, 'final');

  return [...weeks.entries()]
    .map(([week, why]) => ({ week, why }))
    .sort((a, b) => a.week - b.week);
}

/** What to call a test week, in the climber's words. */
export const TEST_REASON_LABEL: Record<TestReason, string> = {
  baseline: 'Baseline week — measure before the block starts moving.',
  phase: 'Test week — a new phase, so the numbers are worth taking again.',
  final: 'Final week — the after, to put beside the before.',
};
