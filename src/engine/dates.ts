/**
 * Date helpers.
 *
 * Every date in this app is a local-time `YYYY-MM-DD` key. The prototype's
 * one durable good idea here was never touching UTC: a session logged at
 * 11pm belongs to that day, not the next one, and string keys compare and
 * sort correctly without parsing.
 */

/** Local `YYYY-MM-DD` for a Date. */
export function toKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` key into a local Date at midnight. */
export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/**
 * Whether a string is a real day in the app's own key format (PLAN.md M42).
 *
 * The shape test alone is not enough, because `fromKey` is built on `new
 * Date(y, m - 1, d)`, which rolls overflow forward without complaint:
 * `2026-13-45` becomes 14 February 2027 and `2026-02-30` becomes 2 March.
 * `/log/2026-13-45` rendered "Sunday, February 14" — a different day from
 * the one in the URL, with no sign anything was wrong.
 *
 * So it round-trips. A key that survives `fromKey` and `toKey` unchanged is
 * a real day written the one way this app writes days; anything else — an
 * overflow, an unpadded `2026-9-1`, `nope` — is not.
 */
export function isDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(fromKey(key)) === key;
}

/**
 * Whether a string names a year this app could hold sessions for.
 *
 * `/year/:year` read `Number(params.year) || years[0] || thisYear`, which
 * quietly showed the current year for `nope` and for `0`, and rendered
 * `-5`, `2026.5` and `1e9` as headings.
 */
export function isYearKey(value: string, now: number = new Date().getFullYear()): boolean {
  if (!/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  // No climbing log starts before modern grading, and a year that has not
  // begun has nothing to review.
  return year >= 1900 && year <= now;
}

export function today(): string {
  return toKey(new Date());
}

export function addDays(key: string, days: number): string {
  const date = fromKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
}

/** Days from `a` to `b`, positive when b is later. */
export function daysBetween(a: string, b: string): number {
  const ms = fromKey(b).getTime() - fromKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday, matching Date#getDay and the layout slot keys. */
export function dayOfWeek(key: string): number {
  return fromKey(key).getDay();
}

/** Sunday-aligned start of the week containing `key`. */
export function startOfWeek(key: string): string {
  return addDays(key, -dayOfWeek(key));
}

/** All seven date keys of the week containing `key`, Sunday first. */
export function weekDays(key: string): string[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * Which program week a date falls in, 1-based, Sunday-aligned so a week
 * always means the same calendar block regardless of the start day.
 * Returns null before the program started; clamps at the final week so a
 * program you keep logging into does not run off the end.
 */
export function programWeek(startDate: string, date: string, totalWeeks: number): number | null {
  const from = startOfWeek(startDate);
  const diff = daysBetween(from, date);
  if (diff < 0) return null;
  return Math.min(totalWeeks, Math.floor(diff / 7) + 1);
}

/** Calendar grid for a month: whole weeks, Sunday-aligned, covering it. */
export function monthGrid(year: number, month: number): string[] {
  const first = toKey(new Date(year, month, 1));
  const last = toKey(new Date(year, month + 1, 0));
  const start = startOfWeek(first);
  const days: string[] = [];
  let cursor = start;
  while (cursor <= last || days.length % 7 !== 0) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
    if (days.length > 42) break;
  }
  return days;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function shortLabel(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
