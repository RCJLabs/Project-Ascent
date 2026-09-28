/**
 * A prescription's count as a number (PLAN.md M345).
 *
 * Out of `types.ts`. Prescriptions keep their words — "8-10", "to failure" —
 * and this is where the log page takes a number from them when it needs one.
 */

// ── Helpers ───────────────────────────────────────────────────────────────

/** Lowest number in a dosage string: '3' → 3, '3-5' → 3, '12 per arm' → 12.
 *  Returns null when there is no leading count (e.g. '1-2-3-4-5 matched'
 *  is a ladder pattern, not a count). */
export function parseCount(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+)(?:\s*[-–]\s*(\d+))?/.exec(value.trim());
  if (!match?.[1]) return null;
  return Number(match[1]);
}
