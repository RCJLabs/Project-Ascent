// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Session } from '@/db/sessions';
import type { AwayPeriod } from '@/engine/away';
import { buildHeatGrid } from '@/engine/consistency';
import { ConsistencyGrid } from './ConsistencyGrid';

/**
 * The table under the picture (PLAN.md M278).
 *
 * It has carried one comment since M23 — *"the same information, for anyone
 * who cannot read the picture"* — and M275 made that false. The grid grew a
 * fourth state, a day inside a marker drawn with an outline, and the table
 * filtered on `sessions > 0`. So a fortnight in Font read to a screen reader
 * exactly as a fortnight of nothing: the failure M275 existed to fix,
 * reintroduced one layer down.
 *
 * Rendered rather than scanned. Four times in M270 and M271 a source scan in
 * this repo passed on prose in a comment; a table's rows are a thing to read,
 * not a string to find.
 */

// Each case renders its own grid, so the last one has to go or
// `getByRole('table')` finds every table this file ever drew.
afterEach(cleanup);

const TO = '2026-09-10';

const session = (date: string): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

const marker = (from: string, to: string, over: Partial<AwayPeriod> = {}): AwayPeriod => ({
  id: 'a1',
  from,
  to,
  kind: 'trip',
  note: "Font '26",
  updatedAt: `${TO}T00:00:00.000Z`,
  ...over,
});

function rowsFor(sessions: Session[], away: AwayPeriod[]) {
  render(<ConsistencyGrid grid={buildHeatGrid({ sessions, to: TO, weeks: 53, away })} />);
  const body = screen.getByRole('table').querySelector('tbody')!;
  return [...body.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('th, td')].map((cell) => cell.textContent?.trim()),
  );
}

describe('a marked stretch in the table', () => {
  it('is there at all, which it was not', () => {
    const rows = rowsFor([session('2026-07-01')], [marker('2026-08-01', '2026-08-14')]);
    const away = rows.filter((r) => r[1]?.startsWith('Away'));
    expect(away).toHaveLength(1);
    expect(away[0]?.[1]).toBe("Away — Font '26");
  });

  /**
   * One row, not fourteen. The rule this table has carried since M23: 371 rows
   * of "nothing logged" is *"a denial-of-service on a screen reader"*, and
   * fourteen rows of "away — Font '26" would be the same denial in a better
   * mood.
   */
  it('is one row naming its span, however long it runs', () => {
    const rows = rowsFor([session('2026-07-01')], [marker('2026-08-01', '2026-08-14')]);
    const away = rows.filter((r) => r[1]?.startsWith('Away'));
    expect(away).toHaveLength(1);
    expect(away[0]?.[0]).toBe('2026-08-01 to 2026-08-14');
  });

  it('reads as a single date when it is a single day', () => {
    const rows = rowsFor([session('2026-07-01')], [marker('2026-08-01', '2026-08-01')]);
    expect(rows.find((r) => r[1]?.startsWith('Away'))?.[0]).toBe('2026-08-01');
  });

  it('names the kind when the climber wrote no note', () => {
    const rows = rowsFor(
      [session('2026-07-01')],
      [marker('2026-08-01', '2026-08-03', { kind: 'injured', note: undefined })],
    );
    expect(rows.find((r) => r[1]?.startsWith('Away'))?.[1]).toBe('Away — injured');
  });

  /**
   * The session is the stronger fact, and `title` already names both — so a
   * trained day inside a marker keeps its own row rather than disappearing
   * into the stretch.
   */
  it('leaves a trained day inside it as its own row', () => {
    const rows = rowsFor(
      [session('2026-08-05')],
      [marker('2026-08-01', '2026-08-14')],
    );
    expect(rows.find((r) => r[0] === '2026-08-05')?.[1]).toContain('1 session');
    // And the stretch is still one row, which now has a hole in it.
    expect(rows.filter((r) => r[1]?.startsWith('Away'))).toHaveLength(1);
  });

  /**
   * And the span stops short of it when it sits on an end.
   *
   * A trained day in the middle is invisible to the span either way, which is
   * why the case above could not catch a mutant that let trained days into it.
   * On an end it is the difference between a stretch that double-counts a day
   * with its own row and one that does not.
   */
  it('starts and ends the stretch on days that have no row of their own', () => {
    const rows = rowsFor(
      [session('2026-08-01'), session('2026-08-14')],
      [marker('2026-08-01', '2026-08-14')],
    );
    expect(rows.find((r) => r[1]?.startsWith('Away'))?.[0]).toBe('2026-08-02 to 2026-08-13');
  });

  it('puts the rows in the order the caption promises', () => {
    const rows = rowsFor(
      [session('2026-06-01'), session('2026-09-01')],
      [marker('2026-08-01', '2026-08-14')],
    );
    const when = rows.map((r) => r[0]);
    expect(when).toEqual(['2026-09-01', '2026-08-01 to 2026-08-14', '2026-06-01']);
  });

  /**
   * The grid already refuses to mark a future day — `away` is `future ? null :
   * …` since M275 — so a marker running past today is trimmed before this sees
   * it. Kept as a property of the table because that is where a reader would
   * notice it going wrong.
   */
  it('never lists a day that has not happened', () => {
    const rows = rowsFor([session('2026-07-01')], [marker('2026-09-01', '2026-09-30')]);
    expect(rows.find((r) => r[1]?.startsWith('Away'))?.[0]).toBe('2026-09-01 to 2026-09-10');
  });

  it('leaves a log with no markers exactly as it was', () => {
    const rows = rowsFor([session('2026-07-01'), session('2026-08-20')], []);
    expect(rows).toEqual([
      ['2026-08-20', expect.stringContaining('1 session')],
      ['2026-07-01', expect.stringContaining('1 session')],
    ]);
  });
});
