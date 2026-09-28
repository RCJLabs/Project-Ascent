/**
 * The four rest-day habits, and a rest day with none of them ticked
 * (PLAN.md M94, M191).
 *
 * What the ticks say over a season is `restReading.ts` (PLAN.md M344): the
 * logger and a new session need the list at once, and only Progress reads
 * the habit back, so the reading is out of the first load.
 */

import type { RestChecklist } from '@/db/sessions';

export type RestItem = keyof RestChecklist;

/**
 * The four, their checkbox wording and their wording in a sentence.
 *
 * One place for both: the logger needs "Sleep 8+ hrs" on a box and a
 * sentence needs "sleep", and a second copy of this list is how the two
 * drift apart.
 */
export const REST_ITEMS: readonly { key: RestItem; label: string; noun: string }[] = [
  { key: 'hydration', label: 'Hydration', noun: 'hydration' },
  { key: 'mobility', label: 'Mobility', noun: 'mobility' },
  { key: 'zone1', label: 'Walking / Zone 1', noun: 'walking' },
  { key: 'sleep', label: 'Sleep 8+ hrs', noun: 'sleep' },
];

/**
 * Every habit unticked — what a rest day starts as (PLAN.md M191).
 *
 * Built from `REST_ITEMS` rather than written out, in the file that owns
 * that list: a fifth habit added there must not leave a hand-written
 * literal one key short, and `RestItem` is `keyof RestChecklist` so the two
 * cannot drift apart without the compiler saying so.
 */
export const NO_HABITS: RestChecklist = Object.fromEntries(
  REST_ITEMS.map(({ key }) => [key, false]),
) as Record<RestItem, boolean>;
