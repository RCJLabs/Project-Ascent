import type { Program } from '../types';
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
import { TRIP_PREP } from './tripPrep';
import { TWO_DAY_WEEK } from './twoDayWeek';

/**
 * The thirteen program bodies, in catalog order (PLAN.md M78, M95).
 *
 * This module is the only place they are imported statically, and the app
 * reaches it through `import()` alone — from `loadPrograms` in index.ts.
 * That one edge is what keeps five thousand lines of prescriptions out of
 * the chunk the shell has to parse before it can draw: measured, the entry
 * went from 239.5KB to 202.3KB gzipped, 756KB to 627KB raw, when these
 * stopped being in it.
 *
 * Tests import the named programs from here. Nothing in `src/` outside
 * this folder may, or the split silently closes — perf.test.ts checks the
 * built entry chunk for a body's own words.
 */
export const CATALOGUE: Program[] = [
  GROUND_ZERO, BASE_CAMP, TWO_DAY_WEEK, GRAVITY_DEFIED, LOCKDOWN, IRON_GRIP, THE_LONG_GAME,
  PEAK_PERFORMANCE, THE_SIEGE, TRIP_PREP, THE_CRUISER, GENERAL_TRAINING, OUTDOOR_CLIMBING,
];

export { BASE_CAMP, GRAVITY_DEFIED, GROUND_ZERO, IRON_GRIP, LOCKDOWN, GENERAL_TRAINING, OUTDOOR_CLIMBING, PEAK_PERFORMANCE, THE_CRUISER, THE_LONG_GAME, THE_SIEGE, TRIP_PREP, TWO_DAY_WEEK };
