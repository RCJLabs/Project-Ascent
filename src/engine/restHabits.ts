/**
 * What the rest day was actually spent on (PLAN.md M94).
 *
 * **Correcting the milestone twice.** It says `RestChecklist` has six
 * readers; it has twelve, across as many files. And it says the four ticks
 * "have never been read by anything", which is not true: `challenges.ts`
 * counts rest days where **all four** are ticked, and `sessionEdit.ts`
 * ORs them field by field when two sessions merge.
 *
 * What *is* true, and is the whole finding: **no individual tick has ever
 * been distinguished from another.** `Object.values(...).every(Boolean)`
 * collapses four different recovery behaviours into one bit, so a climber
 * who hydrates on every rest day and has never once ticked mobility looks
 * exactly like one who does the reverse. The app collects the difference
 * and has never said a word about it.
 *
 * Ninety days, like the check-in history, and for the same reason: a week
 * holds one or two rest days and a habit is not visible in two.
 *
 * **Nothing here scolds.** A climber who logs rest days and ticks nothing
 * is told nothing — see `answered`. The reading is for someone who uses the
 * checklist and has never been shown what it says back.
 */

import type { RestChecklist, Session } from '@/db/sessions';
import { addDays } from './dates';
import { isRestSession } from './templates';

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

export const REST_DAYS = 90;

/** Below this a share is a coincidence rather than a habit. */
export const ENOUGH_REST = 5;

/**
 * How far below half an item has to fall before it is named as the one that
 * gets skipped. **My number**: below half means you skip it more often than
 * you do it, which is a fact worth one sentence and not worth two.
 */
export const SKIPPED_BELOW = 0.5;

export interface ItemHabit {
  item: RestItem;
  noun: string;
  ticked: number;
  /** Ticked ÷ rest days that recorded anything. */
  share: number;
}

export interface RestHabits {
  from: string;
  to: string;
  /** Completed rest days in the window. */
  restDays: number;
  /** Of those, the ones with at least one tick: the ones that said anything. */
  answered: number;
  /** Rest days where all four were ticked. */
  complete: number;
  /** Most-ticked first. Always all four, so a zero is visible as a zero. */
  items: ItemHabit[];
  /**
   * The ones that usually get skipped. Empty when there is nothing to
   * single out.
   *
   * A list rather than one, because two items at zero are two items at
   * zero, and picking either would be a half-truth about the other. Empty
   * when every item clears half — there is no weak link — and empty when
   * three or four tie at the bottom, where the rows say it better than a
   * sentence naming almost everything.
   */
  skipped: ItemHabit[];
}

export interface RestInput {
  sessions: readonly Session[];
  /** The last day of the window. */
  to: string;
  days?: number;
}

export function restHabits(input: RestInput): RestHabits {
  const from = addDays(input.to, -((input.days ?? REST_DAYS) - 1));
  const rest = input.sessions.filter(
    (s) => s.completed && isRestSession(s) && s.date >= from && s.date <= input.to,
  );

  const said = rest.filter((s) => Object.values(s.restChecklist!).some(Boolean));
  const items: ItemHabit[] = REST_ITEMS.map(({ key, noun }) => {
    const ticked = said.filter((s) => s.restChecklist![key] === true).length;
    return { item: key, noun, ticked, share: said.length === 0 ? 0 : ticked / said.length };
  }).sort((a, b) => b.ticked - a.ticked || a.item.localeCompare(b.item));

  // The least-ticked, and only when it is actually being skipped. Read off
  // the end of the sorted list, so it agrees with the rows on screen.
  const lowest = items[items.length - 1]?.ticked ?? 0;
  const tied = items.filter((i) => i.ticked === lowest);
  const skipped =
    said.length >= ENOUGH_REST && tied.length <= 2 && (items[items.length - 1]?.share ?? 1) < SKIPPED_BELOW
      ? tied
      : [];

  return {
    from,
    to: input.to,
    restDays: rest.length,
    answered: said.length,
    complete: said.filter((s) => Object.values(s.restChecklist!).every(Boolean)).length,
    items,
    skipped,
  };
}

function joinNouns(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/**
 * What the ticks say, in one sentence.
 *
 * Null when there is nothing to read: too few rest days, or rest days that
 * never recorded anything. A climber who logs the day and skips the
 * checklist is not doing it wrong, and telling them so would be the app
 * inventing a failure out of a blank.
 */
export function describeRestHabits(habits: RestHabits): string | null {
  if (habits.answered < ENOUGH_REST) return null;

  const every = habits.items.filter((i) => i.ticked === habits.answered);
  const lead =
    every.length === habits.items.length
      ? `All four on every one of your last ${habits.answered} rest days.`
      : every.length > 0
        ? `${capitalise(joinNouns(every.map((i) => i.noun)))} on every one of your last ${habits.answered} rest days.`
        : `${habits.complete} of your last ${habits.answered} rest days had all four ticked.`;

  if (habits.skipped.length === 0) return lead;
  const names = joinNouns(habits.skipped.map((i) => i.noun));
  // "The one that usually gets skipped" claims a uniqueness the rule does
  // not check: it names the lowest, and a second item can be under half
  // too. "Skip most often" is true however many others are also low.
  const verb = habits.skipped.length === 1 ? 'is the one you skip' : 'are the ones you skip';
  return `${lead} ${capitalise(names)} ${verb} most often — ${habits.skipped[0]!.ticked} of ${habits.answered}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
