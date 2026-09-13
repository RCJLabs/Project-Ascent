/**
 * Drill library (PLAN.md §4.2).
 *
 * The single source for drills. Programs reference these by id — the old
 * app kept a 108-entry library *and* 144 inline copies inside the program
 * data, referenced nothing by id, and let the two drift (AUDIT.md §8.9).
 *
 * Split one file per source program: the library grows past a hundred
 * entries, and provenance is the natural seam. `offWall.ts` is the one file
 * that is not a program — see its own note (PLAN.md M132).
 */

import type { Discipline, Drill, DrillCategory, DrillId, Equipment } from '../types';
import { BASE_CAMP_DRILLS } from './baseCamp';
import { GRAVITY_DEFIED_DRILLS } from './gravityDefied';
import { IRON_GRIP_DRILLS } from './ironGrip';
import { LOCKDOWN_DRILLS } from './lockdown';
import { LONG_GAME_DRILLS } from './longGame';
import { OFF_WALL_DRILLS } from './offWall';
import { PEAK_PERFORMANCE_DRILLS } from './peakPerformance';
import { SIEGE_DRILLS } from './siege';

export const DRILL_CATEGORIES: Record<DrillCategory, { label: string; description: string }> = {
  technique: { label: 'Technique', description: 'Movement quality, footwork, body position.' },
  power: { label: 'Power', description: 'Maximal force and explosive movement.' },
  'finger-strength': { label: 'Finger Strength', description: 'Hangboard, crimp, and contact strength.' },
  endurance: { label: 'Endurance', description: 'Aerobic capacity and time on the wall.' },
  'power-endurance': {
    label: 'Power Endurance',
    description: 'Repeated hard efforts under accumulating pump.',
  },
  performance: { label: 'Performance', description: 'Send-focused sessions and peak expression.' },
  strategy: { label: 'Strategy', description: 'Beta reading, tactics, and projecting process.' },
  mental: { label: 'Mental', description: 'Fear, focus, and pressure management.' },
  recovery: { label: 'Recovery', description: 'Deloads, active rest, and tissue care.' },
  assessment: { label: 'Assessment', description: 'Benchmark testing and retests.' },
};

export const DRILLS: Drill[] = [
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

/**
 * The drills a climber with nothing at all can do (PLAN.md M132).
 *
 * An empty kit list, run through the ordinary filter, rather than a second
 * predicate beside it: `filterDrills` keeps a drill only when the climber
 * has everything it asks for, and `none` asks for nothing, so "what is there
 * with no equipment" is already a question this library can answer. Writing
 * the rule again here — `every(e => e === 'none')` — produced exactly the
 * same set today and a different one the moment a drill needs a band and no
 * wall, which is the kind of drift a mutation found by surviving.
 */
export function offWallDrills(): Drill[] {
  return filterDrills({ equipment: [] });
}

const BY_ID = new Map<DrillId, Drill>(DRILLS.map((d) => [d.id, d]));

export function getDrill(id: DrillId): Drill | undefined {
  return BY_ID.get(id);
}

export function drillsByCategory(category: DrillCategory): Drill[] {
  return DRILLS.filter((d) => d.category === category);
}

export interface DrillFilter {
  category?: DrillCategory;
  discipline?: Exclude<Discipline, 'both'>;
  equipment?: Equipment[];
  search?: string;
}

/** Filter the library. `discipline: 'boulder'` also matches 'both' drills;
 *  `equipment` matches drills whose needs are all available. */
export function filterDrills(filter: DrillFilter): Drill[] {
  const needle = filter.search?.trim().toLowerCase();
  return DRILLS.filter((d) => {
    if (filter.category && d.category !== filter.category) return false;
    if (filter.discipline && d.discipline !== filter.discipline && d.discipline !== 'both') return false;
    if (filter.equipment) {
      const have = new Set(filter.equipment);
      if (!d.equipment.every((e) => e === 'none' || have.has(e))) return false;
    }
    if (needle) {
      const haystack = `${d.name} ${d.focus} ${d.description}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
