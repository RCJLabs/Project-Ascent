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
 * The day a block beginning on `startDate` actually runs from
 * (PLAN.md M259).
 *
 * A program week is a calendar week, Sunday to Saturday — the streak, the
 * week screen, `weekTally` and the month gutter are all built on that and
 * it is not up for negotiation here. The question is what to do when a
 * climber presses Start on a Thursday.
 *
 * This used to snap **backwards**: `startOfWeek` put week one's Sunday
 * before the day they started, so a block begun on Thursday the 17th drew
 * planned sessions onto the 13th, the 15th and the 16th — days the climber
 * had not started — and the month gutter graded the week *0/4* against
 * four sessions, three of which were never offered.
 *
 * So it snaps forward instead. Week one is the first **whole** week, and
 * the days between pressing Start and that Sunday belong to no week: the
 * block is `before`, and the twelve weeks of a twelve-week block are twelve
 * whole ones. Snapping backwards kept the end date and quietly spent three
 * quarters of week one; this keeps the program.
 */
export function blockStart(startDate: string): string {
  const sunday = startOfWeek(startDate);
  // Already a Sunday: that week is the first whole one, nothing to skip.
  return sunday === startDate ? sunday : addDays(sunday, 7);
}

/**
 * The calendar a block covers: whole weeks from `blockStart` (PLAN.md M307).
 *
 * One function because there were two, and they disagreed. `plan.blockWindow`
 * took the arithmetic from `blockStart`; `blocks.rowWindow` took it from
 * `startOfWeek` while its own docblock said *"The arithmetic is the same and
 * deliberately so."* For any start that is not a Sunday the two were seven
 * days apart — which is six starts in seven — and the app contradicted itself
 * for the whole of a block's final week:
 *
 * ```
 * 2026-11-08  week 12 | Train says running | Finish says completed
 * ...
 * 2026-11-14  week 12 | Train says running | Finish says completed
 * ```
 *
 * A comment is not a mechanism. Both callers take `weeks` from whatever they
 * have — a `Program` or a history row that outlives one — and the arithmetic
 * from here, so the claim is true by construction.
 */
export function blockSpan(startDate: string, weeks: number): { from: string; to: string } {
  const from = blockStart(startDate);
  return { from, to: addDays(from, weeks * 7 - 1) };
}

/**
 * Which program week a date falls in, 1-based, Sunday-aligned so a week
 * always means the same calendar block regardless of the start day.
 * Returns null before the program started — which is `blockStart`, the
 * first whole week, and not the Sunday behind the day Start was pressed
 * (PLAN.md M259). Clamps at the final week so a program you keep logging
 * into does not run off the end.
 */
export function programWeek(startDate: string, date: string, totalWeeks: number): number | null {
  const from = blockStart(startDate);
  const diff = daysBetween(from, date);
  if (diff < 0) return null;
  return Math.min(totalWeeks, Math.floor(diff / 7) + 1);
}

export function shortLabel(key: string): string {
  return formatDate(fromKey(key), { month: 'short', day: 'numeric' });
}

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/**
 * A date in the climber's locale, through one formatter per set of options
 * (PLAN.md M355).
 *
 * `toLocaleDateString` with options builds a new `Intl.DateTimeFormat` on
 * every call, and the pages that label a day per cell called it hundreds of
 * times a render. Progress spent up to 1.2 seconds of its launch at a
 * quarter CPU speed in the heat grid's tooltips, and Journal and Week lost
 * 80 to 150ms to `shortLabel`. The text is the same, because a formatter
 * built with `undefined` locale and date options is exactly what
 * `toLocaleDateString` builds, just not thrown away.
 *
 * Every call with options goes through here since M359, not only the ones
 * a profile named: M355's list missed the heat grid's month labels and
 * eight other lists, and `formatDate.test.ts` now reads the whole tree for
 * a call that does not.
 */
export function formatDate(date: Date, options: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(options);
  let formatter = FORMATTERS.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(undefined, options);
    FORMATTERS.set(key, formatter);
  }
  return formatter.format(date);
}
