import { afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { addDays, formatDate, fromKey, shortLabel } from './dates';

/**
 * One formatter per set of options, and the same words (PLAN.md M355, M359).
 *
 * Profiled on warm launches at a quarter CPU speed: the Progress heat grid
 * spent up to 1.2 seconds building a `toLocaleDateString` formatter per day
 * per tooltip, and `shortLabel` cost Journal 150ms and Week 83ms. The fix
 * is only safe if the text is identical, so that is checked first, day by
 * day, for every set of options that now goes through `formatDate`.
 *
 * M355 moved only the calls its profile named, and left the rest on the
 * grounds that they ran once a render. Nine of them ran once a row, the
 * heat grid's month labels among them, so since M359 every call does.
 */

/** Every option set routed through `formatDate`, as its call sites write them. */
const OPTION_SETS: Intl.DateTimeFormatOptions[] = [
  { month: 'short', day: 'numeric' }, // shortLabel, charts, Career, Year, projects, seasons
  { weekday: 'short', day: 'numeric', month: 'short' }, // the heat grid's tooltips, Progress's days
  { month: 'long', year: 'numeric' }, // month headings, Body, Career's start
  { weekday: 'long', month: 'long', day: 'numeric' }, // Home's heading, the log's day heading
  { weekday: 'long' }, // Home's limit day, the live bar, the coach, the log
  { weekday: 'long', day: 'numeric' }, // Home's week strip
  { month: 'short' }, // the heat grid's month labels, the conversion grid
  { month: 'long' }, // the share card's busiest month
  { day: 'numeric', month: 'short' }, // charts, check-ins, objectives, away
  { day: 'numeric', month: 'short', year: 'numeric' }, // the share card, Finish, away
  { year: 'numeric', month: 'short', day: 'numeric' }, // a chart's table across a year
  { weekday: 'long', day: 'numeric', month: 'short' }, // the log, Data
  { weekday: 'long', day: 'numeric', month: 'long' }, // search
  { month: 'long', day: 'numeric' }, // objectives, injuries, the Year's comparison
  { month: 'short', year: 'numeric' }, // achievements, Finish
  { weekday: 'short' }, // Week, Review
  { day: 'numeric', month: 'long', year: 'numeric' }, // a backup's date
  { day: 'numeric', month: 'long' }, // an import's date
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

  it('says what toLocaleTimeString says, for the one call that formats a time', () => {
    // An import's time of day. `toLocaleDateString` would add a date to
    // these options; `toLocaleTimeString` adds nothing when an hour is asked
    // for, which is what a formatter built with them does too.
    const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
    const times = Array.from({ length: 96 }, (_, i) => new Date(2026, 2, 5, Math.floor(i / 4), (i % 4) * 15 + 7));
    expect(times.filter((t) => formatDate(t, options) !== t.toLocaleTimeString(undefined, options))).toEqual([]);
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

describe('no formatter built per call, anywhere (PLAN.md M359)', () => {
  /**
   * Every source file, not a list of the ones a profile found. A list is
   * what M355 had, and the heat grid's month labels were not on it.
   *
   * With arguments only: `toLocaleDateString()` with none is a formatter V8
   * keeps, about a microsecond a call, where one with options is about
   * seventy, built and thrown away.
   */
  /** A call with something inside its parentheses. */
  const PER_CALL = /\.toLocale(Date|Time)String\(\s*[^)\s]/;

  /** The lines of one file that build a formatter per call, counted from 1. */
  const offendingLines = (source: string): number[] =>
    source.split('\n').flatMap((line, i) => (PER_CALL.test(line) ? [i + 1] : []));

  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sources(path);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });

  it('finds the source it is meant to read', () => {
    const files = sources('src');
    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain('src/engine/consistency.ts');
    expect(files).toContain('src/features/career/CareerPage.tsx');
    expect(files.some((file) => file.includes('.test.'))).toBe(false);
  });

  it('formats a date with options only through formatDate', () => {
    const offenders = sources('src')
      .filter((file) => file !== 'src/engine/dates.ts')
      .flatMap((file) => offendingLines(readFileSync(file, 'utf8')).map((line) => `${file}:${line}`));
    expect(offenders).toEqual([]);
  });

  it('would catch one', () => {
    const source = [
      "const label = formatDate(fromKey(day), { month: 'short' });",
      "const label = fromKey(day).toLocaleDateString(undefined, { month: 'short' });",
      '{when.toLocaleTimeString(undefined, {',
      'aria-label={fromKey(grid.to).toLocaleDateString()}',
    ].join('\n');
    expect(offendingLines(source)).toEqual([2, 3]);
  });
});
