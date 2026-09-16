import { reportDbError } from '@/db/db';

/**
 * The writes nobody awaited (PLAN.md M220).
 *
 * ## The race this closes
 *
 * Twenty-four store actions persist with `void save(...)` — twenty-one in
 * `profile.ts`, three in `settings.ts` — because a climber toggling a
 * setting should not wait on a disk. Nothing was wrong with that until
 * something re-read the database straight afterwards: `hydrateAll` does,
 * and it **overwrote the state that had just been set with the state that
 * had not yet been written**.
 *
 * `startDemo` is the case that showed it. It calls `startProgram` and
 * `restoreInjury` — two fire-and-forget writes — and then `hydrateAll`, and
 * whether the sample climber keeps its program depends on which microtask
 * ran first. Measured rather than argued: a five-millisecond delay inside
 * the profile's `save` turns *"expected null to be 'iron_grip'"* from a
 * rare flake into every run. On a real device a slow disk or a busy main
 * thread is that delay.
 *
 * ## Why here rather than at each call site
 *
 * The same reasoning `hydrating.ts` gives for a flag over an ordering.
 * Making `startDemo` await its own two writes fixes `startDemo`; every
 * future action followed by a re-read has the same window, and there is no
 * way to see it in review. `hydrateAll` waiting for whatever is in flight
 * fixes the class.
 *
 * ## Serialised, which is the second bug
 *
 * Two rapid actions used to issue two independent `save` calls whose
 * transactions were created in whatever order their `await getDb()` resolved
 * in. Last-write-wins did not reliably mean last-action-wins. Chaining them
 * makes the store's history match the climber's.
 *
 * And a failed write is reported rather than thrown into a promise nobody
 * holds: `void save(...)` on a broken database was an unhandled rejection
 * and a silent loss (PLAN.md M151's rule, reached from a new direction).
 */

let pending: Promise<void> = Promise.resolve();

/**
 * Persist without waiting, but not without remembering.
 *
 * The caller carries on the same tick it always did; the promise goes on a
 * chain that `settled()` can be handed to.
 */
export function enqueueWrite(write: () => Promise<void>): void {
  pending = pending.then(write).catch((error: unknown) => {
    reportDbError(error);
  });
}

/**
 * Wait for the writes outstanding **now**.
 *
 * The chain is captured rather than re-read in a loop on purpose: an action
 * firing while this is awaited belongs to whatever happens next, not to the
 * read that is already in progress. Waiting for the queue to be empty
 * instead would never return on a screen that writes as it renders.
 */
export function writesSettled(): Promise<void> {
  return pending;
}
