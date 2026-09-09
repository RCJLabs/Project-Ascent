import type { Program, ProgramId, ProgramStage } from '../types';
import { BASE_CAMP } from './baseCamp';
import { GRAVITY_DEFIED } from './gravityDefied';
import { GROUND_ZERO } from './groundZero';
import { IRON_GRIP } from './ironGrip';
import { LOCKDOWN } from './lockdown';
import { THE_LONG_GAME } from './longGame';
import { GENERAL_TRAINING } from './generalTraining';
import { OUTDOOR_CLIMBING } from './outdoorClimbing';
import { THE_CRUISER } from './cruiser';
import { THE_SIEGE } from './siege';
import { PEAK_PERFORMANCE } from './peakPerformance';

/**
 * The full catalog the port is working toward (PLAN.md §4.1). Ids are
 * declared up front so a ported program's `nextPrograms` graph validates
 * against real destinations while the rest are still being converted.
 */
export const PLANNED_PROGRAM_IDS: readonly ProgramId[] = [
  'ground_zero',
  'base_camp',
  'gravity_defied',
  'lockdown',
  'iron_grip',
  'peak_performance',
  'the_long_game',
  'the_siege',
  'the_cruiser',
  'general_training',
  'outdoor_climbing',
];

/** Programs converted to the new schema so far, in catalog order. */
export const PROGRAMS: Program[] = [GROUND_ZERO, BASE_CAMP, GRAVITY_DEFIED, LOCKDOWN, IRON_GRIP, THE_LONG_GAME, PEAK_PERFORMANCE, THE_SIEGE, THE_CRUISER, GENERAL_TRAINING, OUTDOOR_CLIMBING];

const BY_ID = new Map<ProgramId, Program>(PROGRAMS.map((p) => [p.id, p]));

export function getProgram(id: ProgramId): Program | undefined {
  return BY_ID.get(id);
}

export const STAGE_META: Record<ProgramStage, { label: string; blurb: string }> = {
  start: { label: 'Start Here', blurb: 'Build a body that can handle climbing.' },
  foundations: { label: 'Foundations', blurb: 'Learn to move well and climb consistently.' },
  style: { label: 'Pick Your Style', blurb: 'Target the thing holding you back.' },
  advanced: { label: 'Advanced', blurb: 'Peak for hard sends.' },
  ongoing: { label: 'Ongoing', blurb: 'Maintain, or just log what you climb.' },
};

export const STAGE_ORDER: ProgramStage[] = ['start', 'foundations', 'style', 'advanced', 'ongoing'];

export { BASE_CAMP, GRAVITY_DEFIED, GROUND_ZERO, IRON_GRIP, LOCKDOWN, GENERAL_TRAINING, OUTDOOR_CLIMBING, PEAK_PERFORMANCE, THE_CRUISER, THE_LONG_GAME, THE_SIEGE };
