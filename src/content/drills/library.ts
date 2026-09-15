/**
 * The drill bodies, reached through `import()` alone (PLAN.md M185).
 *
 * The sibling of `content/programs/catalogue.ts`, and for the same reason it
 * exists: nothing may import this file statically, or the eight source files
 * it collects land back in the entry chunk and the milestone is undone. The
 * one caller is `loadDrills` in `./index.ts`.
 *
 * Split one file per source program — the library is past a hundred entries
 * and provenance is the natural seam. `offWall.ts` is the one file that is
 * not a program; see its own note (PLAN.md M132).
 */

import type { Drill } from '../types';
import { BASE_CAMP_DRILLS } from './baseCamp';
import { GRAVITY_DEFIED_DRILLS } from './gravityDefied';
import { IRON_GRIP_DRILLS } from './ironGrip';
import { LOCKDOWN_DRILLS } from './lockdown';
import { LONG_GAME_DRILLS } from './longGame';
import { OFF_WALL_DRILLS } from './offWall';
import { PEAK_PERFORMANCE_DRILLS } from './peakPerformance';
import { SIEGE_DRILLS } from './siege';

export const LIBRARY: Drill[] = [
  ...BASE_CAMP_DRILLS,
  ...GRAVITY_DEFIED_DRILLS,
  ...IRON_GRIP_DRILLS,
  ...LOCKDOWN_DRILLS,
  ...LONG_GAME_DRILLS,
  ...PEAK_PERFORMANCE_DRILLS,
  ...SIEGE_DRILLS,
  // Last, and belonging to no program (PLAN.md M132). Every other file here
  // is named after the program its drills were extracted from, which is the
  // seam this library was split on — and is exactly why nothing in it worked
  // without a wall until these.
  ...OFF_WALL_DRILLS,
];
