import { useGame } from './game';
import { useMetrics } from './metrics';
import { hydrateProfile } from './profile';
import { useObjectives } from './objectives';
import { useAway } from './away';
import { useCustomDrills } from './drills';
import { useCustomPrograms } from './programs';
import { useProjects } from './projects';
import { useTemplates } from './templates';
import { useSessions } from './sessions';
import { hydrateSettings } from './settings';
import { beginHydration, endHydration } from './hydrating';
import { writesSettled } from './writes';
import { loadPrograms } from '@/content/programs';
import { loadDrills } from '@/content/drills';

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
  /**
   * First, because a read that overtakes a write returns the state before
   * it (PLAN.md M220).
   *
   * Twenty-four store actions persist fire-and-forget, and every caller of
   * this function is something that just finished changing the app —
   * loading the sample climber, clearing it, importing a backup. Reading
   * before those writes land puts the *old* value back into memory, and the
   * change the climber just made is gone with no error anywhere. `writes.ts`
   * has the measurement.
   */
  await writesSettled();
  // Held across the whole load, because a store that finishes early must not
  // be reconciled against one that has not started. `hydrating.ts` has the
  // measurement: without this, emptying the database and reloading left one
  // project written back into it (PLAN.md M114).
  beginHydration();
  try {
    await Promise.all([
      // The catalogue is fetched, not imported (PLAN.md M78), and so is the
      // drill library (M185). Idempotent, so the boot path and the
      // after-import path can both ask for them.
      loadPrograms(),
      loadDrills(),
      hydrateSettings(),
      hydrateProfile(),
      useSessions.getState().load(),
      useMetrics.getState().load(),
      useGame.getState().load(),
      useProjects.getState().load(),
      useTemplates.getState().load(),
      useCustomPrograms.getState().load(),
      useObjectives.getState().load(),
      useAway.getState().load(),
      useCustomDrills.getState().load(),
    ]);
  } finally {
    endHydration();
  }
  // Sessions logged against an outdoor session type before the app had any
  // way to record that (PLAN.md M170). After the catalogue and the log are
  // both in, because it reads one against the other; once ever, and a no-op
  // for the great majority of climbers, who have no outdoor type in their
  // log at all.
  await useSessions.getState().repairOutdoorModes();
  // The reconcile the subscription deliberately skipped, run once now that
  // both stores are loaded and the answer means something. Cheap and a
  // no-op on an empty log: `reconcile` returns early with no projects.
  await useProjects.getState().reconcile();
}
