/**
 * Records the app can actually read (PLAN.md M44).
 *
 * Every `list*` in this directory used to end `db.getAll(store) as unknown
 * as Thing[]` — a cast, which is a promise nothing checked. The database
 * holds whatever was last written to it, and what was last written to it
 * includes anything `importAll` accepted: it verifies the file is a Project
 * Ascent backup and that each store is an array, then writes every record
 * verbatim. A backup from an older schema is the app's own explanation in
 * its error text, and it is exactly what gets through.
 *
 * The consequence was not one bad card. Deleting `beta` from one project out
 * of seven replaced `/journal` and `/search` with the route boundary, because
 * both derive across every record in a `useMemo` in the page body — above the
 * `PageGrid` that gives each card its own boundary. A boundary catches what
 * its children throw while rendering; it cannot catch its parent computing
 * what to hand them.
 *
 * So the shape is checked where the records enter, once, instead of in every
 * engine that walks them.
 *
 * **Repair, then drop, and never silently.** A missing list is an empty list
 * — a project with no beta notes is a true statement about that project. A
 * missing identifier is not repairable, because a record that cannot be
 * addressed cannot be shown, edited or deleted; those are dropped. Both are
 * counted, and `readingProblems()` is what Settings reads so the climber is
 * told rather than left with a quietly shorter list.
 */

export type Primitive = 'string' | 'number' | 'boolean';

export interface Shape {
  /**
   * Fields the app dereferences without checking first. A record missing
   * one, or holding the wrong type for it, is dropped.
   */
  needs: Record<string, Primitive>;
  /**
   * Fields the app iterates. Absent, or not an array, becomes `[]`; an
   * element missing its own needs is dropped from the list.
   *
   * One level deep on purpose. It covers what the engines actually walk —
   * a session's climbs, a project's beta notes — and a general recursive
   * validator here would be a schema library, which is a different decision
   * from this one.
   */
  lists?: Record<string, Record<string, Primitive>>;
}

export interface Reading<T> {
  rows: T[];
  /** Records that could not be repaired and were left out. */
  dropped: number;
  /** Records that were readable once a missing or broken list was replaced. */
  repaired: number;
}

function holds(row: Record<string, unknown>, needs: Record<string, Primitive>): boolean {
  for (const [field, kind] of Object.entries(needs)) {
    const value = row[field];
    if (typeof value !== kind) return false;
    // An identifier that is the empty string addresses nothing, so it fails
    // for the same reason a missing one does.
    if (kind === 'string' && value === '') return false;
  }
  return true;
}

/** Coerce whatever the database returned into records the app can walk. */
export function sound<T>(rows: unknown[], shape: Shape): Reading<T> {
  const out: T[] = [];
  let dropped = 0;
  let repaired = 0;

  for (const raw of rows) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      dropped += 1;
      continue;
    }
    const row = { ...(raw as Record<string, unknown>) };
    if (!holds(row, shape.needs)) {
      dropped += 1;
      continue;
    }
    let changed = false;
    for (const [field, elementNeeds] of Object.entries(shape.lists ?? {})) {
      const value = row[field];
      if (!Array.isArray(value)) {
        row[field] = [];
        changed = true;
        continue;
      }
      const kept = value.filter(
        (element) =>
          typeof element === 'object' &&
          element !== null &&
          holds(element as Record<string, unknown>, elementNeeds),
      );
      if (kept.length !== value.length) changed = true;
      row[field] = kept;
    }
    if (changed) repaired += 1;
    out.push(row as T);
  }

  return { rows: out, dropped, repaired };
}

/**
 * What the last read of each store had to do to make it readable.
 *
 * Module-level rather than a store, because the counting happens inside the
 * db layer and hoisting it into zustand would make every `list*` depend on
 * React. Keyed by store so a climber can be told *which* part of their data
 * is short, not just that something is.
 */
const problems = new Map<string, { dropped: number; repaired: number }>();

export function recordReading(store: string, reading: Reading<unknown>): void {
  if (reading.dropped === 0 && reading.repaired === 0) {
    problems.delete(store);
    return;
  }
  problems.set(store, { dropped: reading.dropped, repaired: reading.repaired });
}

export function readingProblems(): { store: string; dropped: number; repaired: number }[] {
  return [...problems.entries()].map(([store, counts]) => ({ store, ...counts }));
}

/** Test seam, and what a fresh import should do before re-reading. */
export function clearReadingProblems(): void {
  problems.clear();
}
