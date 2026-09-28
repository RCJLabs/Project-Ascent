/**
 * The days of the week, named and in order (PLAN.md M345).
 *
 * Out of `scheduler.ts`, whose intensity reading today's card needs at
 * boot. The names are for the pages that lay a week out, all lazy.
 */

import type { DayOfWeek } from '@/content/types';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Sunday to Saturday, as `Date.getDay()` numbers them. */
export const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];
