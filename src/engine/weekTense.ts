/**
 * Whether a week is ahead, running or over, and whether it tallied anything
 * (PLAN.md M345).
 *
 * Out of `weekTally.ts`, whose tally Home's week strip needs at boot. Only
 * the calendar asks these.
 */

import type { WeekTally } from './weekTally';

/** Where a week sits against today: three states, not two (PLAN.md M310). */
export type WeekTense = 'ahead' | 'during' | 'over';

/**
 * The gutter knew two of these and the week screen knew three.
 *
 * `start > today` told the gutter a week had not begun, and everything else
 * was one bucket — so a week half run and a week finished drew the same
 * fraction with the same bar under it, and the label said *"1 of 4 planned
 * sessions done"* about five days that had not happened.
 */
export function weekTense(start: string, end: string, today: string): WeekTense {
  if (start > today) return 'ahead';
  return end < today ? 'over' : 'during';
}

/**
 * Whether a week has anything to report at all.
 *
 * A week before the block starts, after it ends, or with no program at all
 * has no plan to measure against — and a gutter reading *0/0* on eleven
 * rows of an empty calendar is worse than an empty gutter.
 */
export function tallied(tally: WeekTally): boolean {
  return tally.planned > 0 || tally.extra > 0;
}
