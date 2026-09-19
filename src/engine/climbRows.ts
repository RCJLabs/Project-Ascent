import type { Climb } from '@/db/sessions';

/**
 * What makes two tally rows the same row (PLAN.md M298).
 *
 * Written out inside `addClimb` since M21 and needed a second time the
 * moment a logged climb could be corrected: an edit that lands on a row the
 * session already has must join it rather than sit beside it as a duplicate
 * of itself. Two spellings of this key would drift the first time a field
 * joined it — which has happened twice already, at M108 for the angle and
 * again for the rope style.
 *
 * The name is part of it because *"a named climb never merges into an
 * unnamed tally — the name is what makes project auto-suggest possible"*,
 * and the style is because a flash and a redpoint of the same grade are two
 * different things that happened.
 */
export function sameRow(a: Climb, b: Climb): boolean {
  return (
    a.grade === b.grade &&
    a.scale === b.scale &&
    a.result === b.result &&
    a.style === b.style &&
    a.angle === b.angle &&
    a.ropeStyle === b.ropeStyle &&
    (a.name ?? '') === (b.name ?? '')
  );
}

/**
 * Put a climb into the list, merging into an identical row.
 *
 * `climb.count` is what arrives, so adding one carries 1 and an edit
 * carries whatever the row had already been tallied to. The merged row
 * keeps the **first** row's id and position: the list is deliberately
 * unsorted (`gym.ts` says why), and a correction that moved a row to the
 * bottom would read as the climb having happened later than it did.
 */
export function mergeInto(climbs: readonly Climb[], climb: Climb): Climb[] {
  const existing = climbs.find((c) => sameRow(c, climb));
  if (!existing) return [...climbs, climb];
  return climbs.map((c) => (c === existing ? { ...c, count: c.count + climb.count } : c));
}

/**
 * Replace one row with an edited version of itself.
 *
 * Taken out of the list *before* the merge, so a climb edited into
 * something the list already holds joins that row — and one edited into
 * something only it holds does not merge with its own old self.
 */
export function replaceRow(climbs: readonly Climb[], id: string, edited: Climb): Climb[] {
  return mergeInto(climbs.filter((c) => c.id !== id), edited);
}
