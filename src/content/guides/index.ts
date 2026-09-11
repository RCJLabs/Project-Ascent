import { APP } from './app';
import { BASE_CAMP } from './baseCamp';
import { THE_CRUISER } from './cruiser';
import { GRAVITY_DEFIED } from './gravityDefied';
import { GROUND_ZERO } from './groundZero';
import { INJURY } from './injury';
import { IRON_GRIP } from './ironGrip';
import { LOCKDOWN } from './lockdown';
import { THE_LONG_GAME } from './longGame';
import { OUTDOOR } from './outdoor';
import { PEAK_PERFORMANCE } from './peakPerformance';
import { NEW_TO_CLIMBING } from './starting';
import { THE_SIEGE } from './siege';
import { TRIP_PREP } from './tripPrep';
import { TWO_DAY_WEEK } from './twoDayWeek';
import type { Guide } from './types';

export type { Guide, GuideBlock, GuideSection } from './types';

/**
 * Reading order: the two anyone can start with, then the ladder of
 * programs, then the standalone guides.
 */
export const GUIDES: Guide[] = [
  NEW_TO_CLIMBING,
  APP,
  GROUND_ZERO,
  BASE_CAMP,
  TWO_DAY_WEEK,
  GRAVITY_DEFIED,
  LOCKDOWN,
  IRON_GRIP,
  PEAK_PERFORMANCE,
  THE_LONG_GAME,
  THE_SIEGE,
  TRIP_PREP,
  THE_CRUISER,
  OUTDOOR,
  INJURY,
];

const BY_ID = new Map(GUIDES.map((guide) => [guide.id, guide]));

export function getGuide(id: string): Guide | undefined {
  return BY_ID.get(id);
}

/**
 * The guide for a program, if it has one.
 *
 * Derived from the shared id rather than stored on either side: a program
 * that gains a guide gains the link by being written, and one that loses it
 * loses the link the same way.
 */
export function guideFor(programId: string): Guide | undefined {
  return BY_ID.get(programId);
}

/** How long a guide is, for a "twelve sections" style line. */
export function guideLength(guide: Guide): { sections: number; blocks: number } {
  return {
    sections: guide.sections.length,
    blocks: guide.sections.reduce((n, section) => n + section.content.length, 0),
  };
}
