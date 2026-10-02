/**
 * Whether two values read the same, all the way down (PLAN.md M350).
 *
 * For what IndexedDB hands back: plain objects, arrays, strings, numbers,
 * booleans and null. Anything it cannot place — a key on one side and not
 * the other, even one holding `undefined`, or a prototype it does not
 * recognise — reads as different, which costs a replace and never a stale
 * value.
 *
 * Out of `sessions.ts` since M360, when six more stores needed it.
 */
export const has = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);

export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((value, i) => sameData(value, other[i]));
  }
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  // `hasOwnProperty` rather than `Object.hasOwn`, which the browsers Vite
  // builds for by default (Chrome 87, Safari 14) do not all have.
  const left = Object.keys(a);
  const right = Object.keys(b);
  if (left.length !== right.length) return false;
  const rec = b as Record<string, unknown>;
  return left.every((key) => has(rec, key) && sameData((a as Record<string, unknown>)[key], rec[key]));
}

/**
 * What a store should hold after a fresh read: what it has, if the read says
 * the same thing (PLAN.md M360).
 *
 * M350's rule, for every store a page also loads itself. `hydrateAll` loads
 * each store at launch, and a page that needs one loads it too, in case it
 * mounted first; the two reads race, and the second used to replace an
 * array with an equal one. Everything that read it took that as a change
 * and derived again: the board twice on Home, the Board and the Ascent, the
 * projects twice on three pages. Every load still reads, because a shared
 * read can answer a load with the value from before a write (PLAN.md
 * M220); only the answer is compared.
 */
export function kept<T>(current: T, next: T): T {
  return sameData(current, next) ? current : next;
}
