/**
 * Intensities in order (PLAN.md M345).
 *
 * Out of `types.ts`, which the first load reads for the intensity labels.
 * Comparing two intensities is done by the week rules, the builder and the
 * program checks, all lazy.
 */

import type { Intensity } from './types';

/** Easiest first, so "at or above hard" is a comparison rather than a set. */
export const INTENSITY_ORDER: readonly Intensity[] = ['easy', 'moderate', 'hard', 'max'];

/** True when `a` is as demanding as `b`, or more so. */
export function atLeastAsHard(a: Intensity, b: Intensity): boolean {
  return INTENSITY_ORDER.indexOf(a) >= INTENSITY_ORDER.indexOf(b);
}
