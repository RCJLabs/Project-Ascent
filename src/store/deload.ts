import { deloadDatesFor } from '@/engine/deload';
import { useProfile } from './profile';

/**
 * The planned deload days, from the blocks the climber has run
 * (PLAN.md M306).
 *
 * One line at every `deriveClimberState` call site, because the cache there
 * keys on the set **by identity**: a page where one card passes it and
 * another does not gets two derivations of the same question, which is the
 * thing `oneDerivation.test.tsx` exists to stop.
 *
 * `deloadDatesFor` memoises on the array `blocks` hands it, so asking this
 * in a dozen components costs one walk of a handful of rows.
 */
export function useDeloadDates(): ReadonlySet<string> {
  return deloadDatesFor(useProfile((s) => s.blocks));
}

/** The same answer outside React, for the stores and the engines. */
export function deloadDates(): ReadonlySet<string> {
  return deloadDatesFor(useProfile.getState().blocks);
}
