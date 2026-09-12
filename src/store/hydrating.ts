/**
 * Whether every store is mid-load (PLAN.md M114).
 *
 * ## The race this closes
 *
 * `hydrateAll` loads ten stores in parallel, so between the first finishing
 * and the last there is a window where the app holds one store's new state
 * beside another's old one. `projects.ts` subscribes to `sessions.byDate`
 * and reconciles on every change — and inside that window it reconciles
 * *stale projects against fresh sessions*, then writes the result back.
 *
 * The browser found it on M114's delete: the database was emptied, the
 * stores reloaded, and **one project was back in it afterwards**. Sessions
 * loaded first and went empty, the subscription fired, `projects` still
 * held the pre-wipe list, and reconciling it against no sessions produced a
 * retraction patch that `putProject` wrote into the database that had just
 * been cleared.
 *
 * M110 recorded the same symptom from the test harness — *"exactly one
 * project surviving the clear"* — and worked around it by clearing until
 * the gate agreed. This is the cause rather than the symptom.
 *
 * **It is not only the delete path.** Import calls `hydrateAll` too, so the
 * same window can write a pre-import project over a just-imported database.
 * Nobody had seen it because an import replaces rather than empties, and a
 * stale project landing among restored ones looks like data rather than
 * like a bug.
 *
 * ## Why a flag rather than an ordering
 *
 * Loading projects before sessions would close this instance and leave the
 * general case open — any future subscription between two stores has the
 * same window. And reconciling half-loaded state is not merely risky, it is
 * meaningless: the answer depends on which promise resolved first.
 * `projects.ts` already defends one side of this with `!sessions.hydrated`,
 * which is the same idea reached from the other direction.
 *
 * Its own module so `projects.ts` can read it without importing
 * `store/index.ts`, which imports `projects.ts`.
 */

let count = 0;

export function hydrationInProgress(): boolean {
  return count > 0;
}

/**
 * Nested rather than boolean: `hydrateAll` can be called again while one is
 * still running — the boot path and a launched file both call it — and a
 * boolean would let the inner one clear the outer one's guard.
 */
export function beginHydration(): void {
  count += 1;
}

export function endHydration(): void {
  count = Math.max(0, count - 1);
}
