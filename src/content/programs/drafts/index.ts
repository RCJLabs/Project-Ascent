/**
 * Programs written but not yet shipped (PLAN.md M58).
 *
 * These are structurally complete and validate against the same rules the
 * builder enforces, but they are **not** in `PROGRAMS`, so nothing
 * recommends them, nothing lists them, and nobody can start one. That is
 * deliberate: a program in the catalogue is a coaching prescription, and
 * these are drafts of one until the person who coaches has read them.
 *
 * Shipping one is a two-line change — add it to `PROGRAMS`, write its guide
 * — and the tests in `drafts.test.ts` are here so that change stays two
 * lines rather than a debugging session.
 */

import type { Program } from '../../types';
import { TRIP_PREP } from './tripPrep';
import { TWO_DAY_WEEK } from './twoDayWeek';

export const DRAFT_PROGRAMS: Program[] = [TWO_DAY_WEEK, TRIP_PREP];

export { TRIP_PREP, TWO_DAY_WEEK };
