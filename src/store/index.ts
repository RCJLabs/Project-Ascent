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
 * The game's store, fetched rather than imported (PLAN.md M320).
 *
 * One static `import { useGame } from './game'` put **9.15KB gzipped** into
 * the entry chunk — 6.7% of the whole first load — and nothing that renders
 * before this function runs reads a byte of it. `store/game.ts` reaches the
 * wallet and the ledger in `db/game.ts`, the run history through
 * `ascent/history` to `ascent/scale` and the altimeter, and the payout table
 * through `ascent/rewards` to `engine/economy`; every screen that shows any
 * of it — the Ascent, the board, Career, the logger's achievements card — is
 * a lazy route.
 *
 * Still loaded at boot, and deliberately: the logger's achievements card and
 * the climber's avatar read this store, and a climber who opens the log
 * should not watch them fill in. What changes is only *when the code is
 * parsed*. `hydrateAll` is called from an effect, so this fetch happens after
 * the first paint rather than in front of it.
 *
 * **The bytes over the wire are the same** — the service worker precaches
 * every chunk regardless. What moves is what has to be downloaded, parsed and
 * executed before the app can draw anything, which is what the budget in
 * `perf.test.ts` has always been about.
 *
 * Inside `hydrateAll` rather than at each screen that needs it, so the
 * after-import refresh below still reaches the game: an import that rewrote
 * the wallet and left the old balance in memory is the exact bug this
 * function exists for.
 */
async function hydrateGame(): Promise<void> {
  const { useGame } = await import('./game');
  await useGame.getState().load();
}

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
      hydrateGame(),
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
