import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { addDays, formatDate, fromKey, shortLabel } from './dates';

/**
 * One formatter per set of options, and the same words (PLAN.md M355).
 *
 * Profiled on warm launches at a quarter CPU speed: the Progress heat grid
 * spent up to 1.2 seconds building a `toLocaleDateString` formatter per day
 * per tooltip, and `shortLabel` cost Journal 150ms and Week 83ms. The fix
 * is only safe if the text is identical, so that is checked first, day by
 * day, for every set of options that now goes through `formatDate`.
 */

/** Every option set routed through `formatDate`, as its call sites write them. */
const OPTION_SETS: Intl.DateTimeFormatOptions[] = [
  { month: 'short', day: 'numeric' }, // shortLabel
  { weekday: 'short', day: 'numeric', month: 'short' }, // the heat grid's tooltips
  { month: 'long', year: 'numeric' }, // Calendar's and Journal's month headings
  { weekday: 'long', month: 'long', day: 'numeric' }, // Home's heading
  { weekday: 'long' }, // Home's limit day
  { weekday: 'long', day: 'numeric' }, // Home's week strip
];

/** Two and a half years of days, through a leap day and the clock changes. */
const DAYS = Array.from({ length: 900 }, (_, i) => addDays('2023-12-01', i));

/**
 * The suite runs in UTC, which has no clock change to cross. So the same
 * check runs again with a zone that has one, handed to both sides.
 */
const ZONES = [undefined, 'America/New_York', 'Australia/Sydney'];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatDate', () => {
  it.each(
    OPTION_SETS.flatMap((o) => ZONES.map((zone) => [`${JSON.stringify(o)} in ${zone ?? 'the default zone'}`, zone ? { ...o, timeZone: zone } : o] as const)),
  )('says what toLocaleDateString says, every day, for %s', (_, options) => {
    const differ = DAYS.filter(
      (day) => formatDate(fromKey(day), options) !== fromKey(day).toLocaleDateString(undefined, options),
    );
    expect(differ).toEqual([]);
  });

  it('covers a leap day and the clock changes, so the check above means something', () => {
    expect(DAYS).toContain('2024-02-29');
    // New York's spring and autumn changes, and Sydney's.
    for (const day of ['2024-03-10', '2024-11-03', '2024-04-07', '2024-10-06']) expect(DAYS).toContain(day);
  });

  it('builds one formatter per set of options, not one per call', () => {
    const built = vi.spyOn(Intl, 'DateTimeFormat');
    const options: Intl.DateTimeFormatOptions = { month: 'narrow', day: '2-digit' };
    for (const day of DAYS.slice(0, 50)) formatDate(fromKey(day), options);
    expect(built.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('keeps option sets apart', () => {
    const date = fromKey('2026-03-05');
    expect(formatDate(date, { weekday: 'long' })).not.toBe(formatDate(date, { month: 'long' }));
  });

  it('is what shortLabel uses', () => {
    expect(shortLabel('2026-03-05')).toBe(fromKey('2026-03-05').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  });
});

describe('the labels a page writes once per cell', () => {
  /**
   * The functions the profile found, which run once per day on screen. A
   * `toLocaleDateString(undefined, {` in any of them is a formatter built
   * per cell again.
   */
  it.each([
    ['src/engine/dates.ts', 'shortLabel'],
    ['src/ui/charts/ConsistencyGrid.tsx', 'title'],
    ['src/engine/calendarDates.ts', 'monthLabel'],
    ['src/features/journal/JournalPage.tsx', 'monthTitle'],
  ])('%s: %s formats through formatDate', (file, name) => {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf(`function ${name}(`);
    expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    expect(body).toContain('formatDate(');
    expect(body).not.toContain('toLocaleDateString(');
  });

  it("Home's heading and week strip format through formatDate", () => {
    const source = readFileSync('src/features/home/HomeHeading.tsx', 'utf8');
    expect(source).not.toMatch(/toLocaleDateString\(undefined, \{/);
    expect(source.match(/formatDate\(/g)?.length).toBe(3);
  });
});
