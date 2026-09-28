/**
 * A size in bytes, in words (PLAN.md M345).
 *
 * Out of `offline.ts`, whose update checks run at boot. Sizes are shown on
 * the data, settings and photo pages.
 */

/**
 * Human bytes, for a number nobody wants in full.
 *
 * Goes as far as gigabytes, which the two implementations this replaced did
 * not: both stopped at MB, so a browser offering a 60GB quota reported
 * "61440.0 MB" in Settings.
 */
export function formatBytes(bytes: number | undefined): string {
  // `?` for "the browser would not say" — and for a total that arithmetic
  // turned into NaN, which is the same thing from the reader's side and was
  // previously printed as "NaN KB" (PLAN.md M80).
  if (bytes === undefined || !Number.isFinite(bytes)) return '?';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
