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

/**
 * The library, in provenance order.
 *
 * **Empty until `loadDrills` has run** (PLAN.md M185). The bodies used to be
 * imported here, and six modules on the first-paint path call `getDrill` for
 * a category or a name — `derive`, `fingerGap`, `restDrill`, `challenges`,
 * `sessionLength`, `plan` — so all hundred-odd of them were in front of the
 * first paint of a screen that shows none. Cutting any one of those six was
 * worth 0.06KB; cutting all six is worth 5.57KB, which is why this is a
 * change to the registry rather than to its callers.
 *
 * Filled in place rather than replaced, so the callers holding a reference
 * see the drills the moment they land. This is `content/programs/index.ts`
 * verbatim, down to the promise being memoised, because that milestone
 * solved this exact problem for the program bodies at M78 and the drills
 * were simply never given the same treatment.
 */
export const DRILLS: Drill[] = [];

const BY_ID = new Map<DrillId, Drill>();

let loading: Promise<void> | null = null;

/**
 * Fetch the bodies and register them. Idempotent: the second caller gets the
 * first caller's promise, so the router and `hydrateAll` can both ask
 * without loading twice or racing the array.
 */
export function loadDrills(): Promise<void> {
  loading ??= import('./library').then(({ LIBRARY }) => {
    DRILLS.splice(0, DRILLS.length, ...LIBRARY);
    BY_ID.clear();
    for (const drill of LIBRARY) BY_ID.set(drill.id, drill);
  });
  return loading;
}

/** True once the library is in the registry. */
export function drillsLoaded(): boolean {
  return BY_ID.size > 0;
}

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
  /**
   * The drills' text, for a search that reads the method as well as the
   * name (PLAN.md M137). Handed in by the page rather than imported here,
   * because this registry is entry-chunk by construction and the text is
   * not; without it a search reads names and focus lines only.
   */
  text?: Readonly<Record<string, string>>;
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
      const haystack = `${d.name} ${d.focus} ${filter.text?.[d.id] ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
