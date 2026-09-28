/**
 * What the plan says about itself (PLAN.md M345).
 *
 * Out of `plan.ts`, which the first load needs to put today's session on
 * Home. Where a block stands and whether a deload changes anything are read
 * by the block, program and log pages.
 */

import type { PhasePrescription, Program } from '@/content/types';
import { daysBetween } from './dates';
import { type BlockPrescription, type BlockState, blockWindow, deloadDose, easedDose, lighter } from './plan';

export interface BlockStatus {
  state: BlockState;
  from: string;
  to: string;
  /** Days since the block's last day. Zero or negative while it runs. */
  daysSince: number;
}

/**
 * Where the climber is in the block.
 *
 * `programWeek` cannot answer this: it clamps, so a date a year past a
 * twelve-week block still reports week twelve, and every screen that asked
 * it was repeating the last week forever — sessions, phase, and the "final
 * test week" banner alike.
 */
export function blockStatus(program: Program, startDate: string, today: string): BlockStatus {
  const { from, to } = blockWindow(program, startDate);
  return {
    state: today < from ? 'before' : today > to ? 'ended' : 'running',
    from,
    to,
    daysSince: daysBetween(to, today),
  };
}

/**
 * Whether a check-in of this depth would take anything off the session
 * (PLAN.md M129).
 *
 * Here rather than in the logger, because it is the same question the
 * screen must not answer by eye: saying "less of it today" over a
 * prescription that has not moved is the fault M128 met with the deload
 * marker, one screen along.
 *
 * A full day falls out of this rather than being checked for. `easedDose`
 * at zero notches never moves anything, so the answer is already false and
 * an early return for it was a line no test could reach — which a mutation
 * duly showed by surviving.
 */
export function easesAnything(blocks: readonly BlockPrescription[], notches: number): boolean {
  return blocks.some((b) => b.entry.exercises.some((e) => easedDose(e, notches) !== null));
}

/** Whether a deload would take anything off this prescription at all. */
export function deloadLightens(entry: PhasePrescription): boolean {
  return entry.exercises.some((e) => deloadDose(e) !== null) || lighter(entry.circuit?.rounds) !== null;
}
