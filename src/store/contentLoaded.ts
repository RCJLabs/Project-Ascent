import { useState } from 'react';
import { create } from 'zustand';
import { drillsLoaded, loadDrills } from '@/content/drills';
import { loadPrograms, programsLoaded } from '@/content/programs';
import { useProfile } from './profile';
import { useSessions } from './sessions';

/**
 * Whether the shipped programs and the drill library have arrived
 * (PLAN.md M364).
 *
 * Shaped like a store's `hydrated` so `useLoaded` can wait for it beside
 * the stores a card already waits for. Until M364 the router waited for
 * both before it drew any page, which is M78's rule — one gate rather than
 * twenty-two chances to miss one — and on a cold first visit that held
 * Home's heading back 0.6s on Slow 4G and 1.4s on Fast 3G for 48KB a
 * climber with nothing logged does not read. Home now draws without it for
 * that climber on a visit the worker did not serve (`useHoldsForCatalogue`),
 * and its cards wait here through `useCatalogueIfNeeded`; every other route
 * still waits at the router.
 */
export const useCatalogue = create<{ hydrated: boolean }>(() => ({
  hydrated: programsLoaded() && drillsLoaded(),
}));

/** Both, fetched once however many ask, and the store told when they are in. */
export function loadCatalogue(): Promise<void> {
  return Promise.all([loadPrograms(), loadDrills()]).then(() => {
    useCatalogue.setState({ hydrated: true });
  });
}

/**
 * Whether this page was served by the worker, read once as the app starts.
 *
 * A controlled page is one the precache answered, so the catalogue's chunks
 * are on the device and arrive in a few milliseconds. The worker never
 * claims a page it did not serve (`registerType: 'prompt'`, no
 * `clientsClaim`), so this cannot change while the page is open — a router
 * that read it on every render could otherwise swap Home for the busy
 * placeholder halfway through a first visit.
 */
export const SERVED_BY_WORKER =
  typeof navigator !== 'undefined' && navigator.serviceWorker?.controller != null;

/**
 * A climber Home has nothing to look up in the catalogue for: no program
 * running and nothing logged (PLAN.md M364).
 *
 * Home reads a program for the block that is running and for every logged
 * session's own, and a drill only through those, so a climber with neither
 * draws the same Home with the catalogue as without it —
 * `homeWaitsForTheCatalogue.test.tsx` renders it both ways and compares.
 * In practice this is a new climber on their first launch, which is the
 * only launch the worker has not served.
 */
export function nothingToLookUp(activeProgramId: string | null, byDate: Record<string, unknown[]>): boolean {
  return activeProgramId === null && Object.values(byDate).every((day) => day.length === 0);
}

/** Whether the stores say so yet: false until both have read the database. */
function useNothingToLookUp(): boolean {
  const program = useProfile((s) => s.hydrated && s.activeProgramId === null);
  const log = useSessions((s) => s.hydrated && nothingToLookUp(null, s.byDate));
  return program && log;
}

/**
 * The catalogue, for `useLoaded`, or a climber with nothing in it to read.
 *
 * Shaped like a store so it goes in a card's `useLoaded` list beside the
 * stores it already waits for. Measured on a cold first visit, a Home whose
 * cards waited for the catalogue itself drew its heading 0.5–1.3s sooner and
 * the first-session card 0.7–2.9s later than one held at the router: drawn
 * early, Home fetched its own cards' chunks alongside the catalogue, and the
 * catalogue they all waited for arrived later. A new climber's cards read
 * nothing from it, so they do not wait for it.
 *
 * If that climber logs a session before it lands, the cards that read the
 * log go back to waiting until it does, which is what this subscription is
 * for — a card that read the session's program before then would get
 * `undefined` and keep it.
 */
export function useCatalogueIfNeeded<T>(select: (state: { hydrated: boolean }) => T): T {
  const catalogue = useCatalogue((s) => s.hydrated);
  const nothing = useNothingToLookUp();
  return select({ hydrated: catalogue || nothing });
}

/**
 * Whether the router holds a route back until the catalogue is in, given
 * whether Home has been let through without it (PLAN.md M364).
 *
 * Every route but Home, always. Home too when the worker served the page:
 * measured on warm launches, letting it through put the shell 140ms and
 * today's card 170ms later than holding it for a catalogue that was already
 * on the device — Home drew once with every card waiting and again with the
 * data, and the first of those was on the critical path. And Home until the
 * stores say there is nothing to look up: a climber with a log drew Home
 * early and then waited longer for the catalogue than holding Home did, for
 * the reason `useCatalogueIfNeeded` gives.
 */
export function holdsForCatalogue(location: string, servedByWorker: boolean, homeLetIn: boolean): boolean {
  return servedByWorker || location !== '/' || !homeLetIn;
}

/**
 * The router's question, asked of the stores.
 *
 * Once Home is let in it stays in: the climber logging a first session
 * before the catalogue lands would otherwise swap Home — and the reward
 * card it is showing — for the busy placeholder. The cards that read the
 * log wait for the catalogue again instead, through `useCatalogueIfNeeded`.
 */
export function useHoldsForCatalogue(location: string): boolean {
  const catalogue = useCatalogue((s) => s.hydrated);
  const nothing = useNothingToLookUp();
  const [letIn, setLetIn] = useState(false);
  // Set during render, React's pattern for state derived from a change:
  // one extra render of the shell, once, on a first visit.
  if (!catalogue && !SERVED_BY_WORKER && nothing && !letIn) setLetIn(true);
  return !catalogue && holdsForCatalogue(location, SERVED_BY_WORKER, letIn || nothing);
}
