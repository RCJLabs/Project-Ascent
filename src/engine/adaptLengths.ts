/**
 * The lengths a program can be adapted to (PLAN.md M345).
 *
 * Out of `adapt.ts`, which the first load needs to lay an adapted block out.
 * Which lengths are on offer is asked by the start page and the finder.
 */

import type { Program } from '@/content/types';

/**
 * The shortest a written block is worth compressing to.
 *
 * A phase that lasts one week is not a phase, and a twelve-week program run
 * over three is four sessions of each idea and no adaptation to any of them.
 * A program *written* to be three weeks long is a different thing and keeps
 * its own length — this floor only ever removes options from a longer one.
 */
export const MIN_ADAPTED_WEEKS = 4;

/** Lengths worth offering for this program, shortest first. */
export function lengthsFor(program: Program): number[] {
  const floor = Math.max(MIN_ADAPTED_WEEKS, program.phases.length);
  return [4, 6, 8, 10, 12, 16, 20]
    .filter((n) => n >= floor && n < program.weeks)
    .concat(program.weeks);
}
