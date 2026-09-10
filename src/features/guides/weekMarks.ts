/**
 * Which rows of a guide table are a program's deload weeks (PLAN.md M34).
 *
 * Pure and separate from the drawing, because every rule here was got wrong
 * once and none of the mistakes were visible in a component: a 4x4-interval
 * row marked as week 4, a `1–4` range marked because one week inside it is a
 * deload, and "5 DELOAD | DELOAD 1" saying it twice.
 */

/**
 * A table is about weeks only when it says so.
 *
 * Guessing from the cells does not work. These guides head numeric columns
 * with Step, Level, RPE, Attempt, Metric, Protocol, Limiter and Position,
 * and rows like "4x4 Intervals" and "3-Finger Drag" start with a digit
 * without being a week.
 */
export function isWeekTable(head: readonly string[]): boolean {
  return /^weeks?$/i.test((head[0] ?? '').trim());
}

/**
 * The single week a row is about, or null.
 *
 * A range — `1–4`, `10–11` — is deliberately not a week: marking a whole
 * block because one week inside it is a deload says the opposite of the
 * truth.
 */
export function weekOf(row: readonly string[]): number | null {
  // `(?!\d)` is load-bearing. Without it the engine backtracks: `10–11`
  // matches "10", the range lookahead rejects it, it retries with "1", and
  // "0" is not a dash — so a two-week range came back as week 1.
  const match = /^(\d+)(?!\d)(?!\s*[–—-]\s*\d)/.exec(row[0]?.trim() ?? '');
  return match === null ? null : Number(match[1]);
}

/**
 * Whether a row already calls itself a deload.
 *
 * Peak Performance's week 5 really is a phase named "Deload 1", so the
 * derived mark would be the same word twice. Matched as a label rather than
 * as the bare word: that program's week 12 reads "Deload volume. All energy
 * toward project." — a send week that tapers, not a deload week.
 */
export function saysDeload(row: readonly string[]): boolean {
  return row.some((cell) => /\bDELOAD\b/.test(cell) || /\bDeload\b(?!\s+[a-z])/.test(cell));
}

/** True when this row should carry a derived deload mark. */
export function marksDeload(
  head: readonly string[],
  row: readonly string[],
  deloadWeeks: readonly number[] | undefined,
): boolean {
  if (!isWeekTable(head)) return false;
  const week = weekOf(row);
  if (week === null) return false;
  return (deloadWeeks ?? []).includes(week) && !saysDeload(row);
}
