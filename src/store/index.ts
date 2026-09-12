import { useGame } from './game';
import { useMetrics } from './metrics';
import { hydrateProfile } from './profile';
import { useObjectives } from './objectives';
import { useCustomPrograms } from './programs';
import { useProjects } from './projects';
import { useTemplates } from './templates';
import { useSessions } from './sessions';
import { hydrateSettings } from './settings';
import { beginHydration, endHydration } from './hydrating';
import { loadPrograms } from '@/content/programs';

/**
 * Load every store from IndexedDB.
 *
 * One list, called at boot and again after an import. Before this, importing
 * a backup wrote the database and left the in-memory stores showing the old
 * data until the climber happened to reload — the app quietly disagreeing
 * with its own storage, which is precisely the class of bug the prototype
 * was full of (AUDIT.md §8).
 */
export async function hydrateAll(): Promise<void> {
  // Held across the whole load, because a store that finishes early must not
  // be reconciled against one that has not started. `hydrating.ts` has the
  // measurement: without this, emptying the database and reloading left one
  // project written back into it (PLAN.md M114).
  beginHydration();
  try {
    await Promise.all([
      // The catalogue is fetched, not imported (PLAN.md M78). Idempotent, so
      // the boot path and the after-import path can both ask for it.
      loadPrograms(),
      hydrateSettings(),
      hydrateProfile(),
      useSessions.getState().load(),
      useMetrics.getState().load(),
      useGame.getState().load(),
      useProjects.getState().load(),
      useTemplates.getState().load(),
      useCustomPrograms.getState().load(),
      useObjectives.getState().load(),
    ]);
  } finally {
    endHydration();
  }
  // The reconcile the subscription deliberately skipped, run once now that
  // both stores are loaded and the answer means something. Cheap and a
  // no-op on an empty log: `reconcile` returns early with no projects.
  await useProjects.getState().reconcile();
}
