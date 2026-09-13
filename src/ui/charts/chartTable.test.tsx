// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LoadBars, ProgressionLine } from './Charts';

/**
 * The table under the picture, and what it says its columns are (PLAN.md M140).
 *
 * `DataTable` is the chart's accessible form — what a screen reader is
 * handed instead of the SVG. Both primitives hard-coded the header of the
 * one caller they were written for, so a project's high point per day read
 * *Week: Sep 3 · Hardest grade: 60%* and a week of feet climbed read
 * *Day · Load*. The header is now the caller's to name, with no default to
 * inherit by accident.
 */

afterEach(cleanup);

const head = (): string[] =>
  [...document.querySelectorAll('th[scope="col"]')].map((th) => th.textContent ?? '');

const rows = (): string[][] =>
  [...document.querySelectorAll('tbody tr')].map((tr) =>
    [...tr.querySelectorAll('th,td')].map((c) => c.textContent ?? ''),
  );

const point = (at: string, value: number | null, display: string | null) => ({ at, value, display });

describe('a line chart names its own columns', () => {
  it('says what the caller said, not what the first caller said', () => {
    render(
      <ProgressionLine
        points={[point('2026-09-01', 40, '40%'), point('2026-09-04', 60, '60%')]}
        label="High point per day"
        head={['Day tried', 'High point']}
        formatValue={(v) => `${v}%`}
      />,
    );
    expect(head()).toEqual(['Day tried', 'High point']);
    expect(head()).not.toContain('Hardest grade');
  });

  it('puts one row under it per point, in order', () => {
    render(
      <ProgressionLine
        points={[point('2026-09-01', 40, '40%'), point('2026-09-04', 60, '60%')]}
        label="High point per day"
        head={['Day tried', 'High point']}
        formatValue={(v) => `${v}%`}
      />,
    );
    expect(rows()).toEqual([
      ['Sep 1', '40%'],
      ['Sep 4', '60%'],
    ]);
  });

  // A gap is not a zero, and the table has to say which it is.
  it('says nothing was logged rather than leaving the cell empty', () => {
    render(
      <ProgressionLine
        points={[point('2026-09-01', 40, '40%'), point('2026-09-04', null, null)]}
        label="High point per day"
        head={['Day tried', 'High point']}
        formatValue={(v) => `${v}%`}
      />,
    );
    expect(rows()[1]).toEqual(['Sep 4', 'nothing logged']);
  });
});

describe('a bar chart names its own columns too', () => {
  // The altimeter plots feet per week through the same primitive that
  // Progress plots a day's load through, and the header was the load one.
  it('says feet per week where that is what it is', () => {
    render(
      <LoadBars
        data={[{ date: '2026-09-01', value: 1200 }]}
        label="Feet climbed per week"
        head={['Week', 'Height climbed']}
        formatValue={(n) => `${n} ft`}
      />,
    );
    expect(head()).toEqual(['Week', 'Height climbed']);
  });

  // The altimeter's weeks run as long as the climber has been logging, so
  // this primitive needs the year back for the same reason the line does.
  it('brings the year back across a span of years too', () => {
    render(
      <LoadBars
        data={[
          { date: '2025-09-01', value: 1200 },
          { date: '2026-09-01', value: 1400 },
        ]}
        label="Feet climbed per week"
        head={['Week', 'Height climbed']}
        formatValue={(n) => `${n} ft`}
      />,
    );
    const dates = rows().map((r) => r[0]!);
    expect(dates[0]).toMatch(/2025/);
    expect(new Set(dates).size).toBe(2);
  });

  it('still marks a deload day in the row, not only in the picture', () => {
    render(
      <LoadBars
        data={[{ date: '2026-09-01', value: 3, muted: true }]}
        label="Daily training load"
        head={['Day', 'Load']}
        formatValue={(n) => `${n} load`}
      />,
    );
    expect(rows()[0]).toEqual(['Sep 1', '3 load (deload)']);
  });
});

/**
 * A benchmark history runs for as long as the climber has been testing.
 * Two readings a year apart both reading "Sep 3" is the accessible table
 * saying less than the picture — and two rows keyed by the same string is
 * React reconciling the wrong one.
 */
describe('a series that crosses a year', () => {
  const twoYears = [point('2025-09-03', 40, '40 lb'), point('2026-09-03', 50, '50 lb')];

  it('brings the year back when it needs to', () => {
    render(
      <ProgressionLine
        points={twoYears}
        label="Max Hang over time"
        head={['Date tested', 'Max Hang']}
        formatValue={(v) => `${v} lb`}
      />,
    );
    const dates = rows().map((r) => r[0]!);
    expect(dates[0]).toMatch(/2025/);
    expect(dates[1]).toMatch(/2026/);
    expect(new Set(dates).size).toBe(2);
  });

  it('leaves the year off where one year holds the whole series', () => {
    render(
      <ProgressionLine
        points={[point('2026-09-01', 40, '40 lb'), point('2026-09-04', 50, '50 lb')]}
        label="Max Hang over time"
        head={['Date tested', 'Max Hang']}
        formatValue={(v) => `${v} lb`}
      />,
    );
    expect(rows().map((r) => r[0])).toEqual(['Sep 1', 'Sep 4']);
  });

  it('draws a row per reading even where two format alike', () => {
    render(
      <ProgressionLine
        points={twoYears}
        label="Max Hang over time"
        head={['Date tested', 'Max Hang']}
        formatValue={(v) => `${v} lb`}
      />,
    );
    expect(rows()).toHaveLength(2);
    expect(rows().map((r) => r[1])).toEqual(['40 lb', '50 lb']);
  });
});
