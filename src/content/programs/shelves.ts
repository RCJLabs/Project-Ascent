/**
 * What the catalogue is, rather than what is in it: every id it plans to
 * ship, and the shelves the Train page sorts programs onto.
 *
 * Out of `index.ts` (PLAN.md M344), which the first load needs for
 * `getProgram`; these are read by validation, the builder's file format
 * and the Train page, all lazy.
 */

import type { ProgramId, ProgramStage } from '../types';

/**
 * The full catalog the port is working toward (PLAN.md §4.1). Ids are
 * declared up front so a ported program's `nextPrograms` graph validates
 * against real destinations while the rest are still being converted.
 */
export const PLANNED_PROGRAM_IDS: readonly ProgramId[] = [
  'ground_zero',
  'base_camp',
  // The two M58 drafted and M95 shipped, once the coach had read them.
  'two_day_week',
  'gravity_defied',
  'lockdown',
  'iron_grip',
  'peak_performance',
  'the_long_game',
  'the_siege',
  'trip_prep',
  'the_cruiser',
  'general_training',
  'outdoor_climbing',
];

export const STAGE_META: Record<ProgramStage, { label: string; blurb: string }> = {
  start: { label: 'Start Here', blurb: 'Build a body that can handle climbing.' },
  foundations: { label: 'Foundations', blurb: 'Learn to move well and climb consistently.' },
  style: { label: 'Pick Your Style', blurb: 'Target the thing holding you back.' },
  advanced: { label: 'Advanced', blurb: 'Peak for hard sends.' },
  ongoing: { label: 'Ongoing', blurb: 'Maintain, or just log what you climb.' },
};

export const STAGE_ORDER: ProgramStage[] = ['start', 'foundations', 'style', 'advanced', 'ongoing'];
