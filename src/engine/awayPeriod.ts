/**
 * What a stored away period must look like (PLAN.md M345).
 *
 * Out of `away.ts`, for the store that reads the periods at boot and has to
 * refuse a malformed one. Everything else about being away — the labels, the
 * readings of a gap, the card that writes one — only runs on lazy pages, and
 * `away.ts` goes with them.
 */

import { isDateKey } from './dates';
import type { AwayKind, AwayPeriod } from './away';

export const AWAY_KINDS: readonly AwayKind[] = ['trip', 'rest', 'injured', 'life'];

/**
 * Whether a stored value is a usable period.
 *
 * Guarded rather than trusted because this comes back out of IndexedDB, where
 * an older schema or a hand-edited backup can put anything. `isDateKey` before
 * the comparison for the reason `trip.ts` gives: a half-typed date reaches the
 * store from a text field, and its arithmetic is NaN — so a malformed range
 * would silently read as covering nothing, or everything.
 */
export function isAwayPeriod(value: unknown): value is AwayPeriod {
  if (typeof value !== 'object' || value === null) return false;
  const period = value as Partial<AwayPeriod>;
  if (typeof period.id !== 'string' || period.id === '') return false;
  if (typeof period.from !== 'string' || !isDateKey(period.from)) return false;
  if (typeof period.to !== 'string' || !isDateKey(period.to)) return false;
  if (period.to < period.from) return false;
  if (!AWAY_KINDS.includes(period.kind as AwayKind)) return false;
  if (period.note !== undefined && typeof period.note !== 'string') return false;
  return true;
}
