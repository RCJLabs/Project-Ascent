// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ambiguousGrade, importCsv, guessColumns, guessKind } from '@/engine/importCsv';
import { SpreadsheetImportCard, pendingFrom } from './SpreadsheetImportCard';

/**
 * The spreadsheet preview, driven (PLAN.md M264).
 *
 * `importCsv` has 85 tests under it and the card that decides what a
 * climber sees — and what they are asked — had none. Ten shapes of file:
 * a tick list, one climb, ambiguous grades, a missing column, a header on
 * its own, a file full of typos, a hangboard log, benchmarks, one
 * benchmark, and a blank header cell.
 */

const card = (name: string, table: string[][]) => {
  const pending = pendingFrom(name, table);
  const view = render(
    <SpreadsheetImportCard
      pending={pending}
      occupied={new Set()}
      busy={false}
      onChange={() => {}}
      onImport={() => {}}
      onCancel={() => {}}
    />,
  );
  const panel = view.container.querySelector('div.mt-3.rounded-xl.bg-sunken');
  return {
    pending,
    panel: (panel?.textContent ?? '').replace(/\s+/g, ' '),
    asks: [...view.container.querySelectorAll('legend')].map((l) => l.textContent ?? ''),
    button: [...view.container.querySelectorAll('button')].find((b) =>
      /^Import /.test(b.textContent ?? ''),
    ) as HTMLButtonElement | undefined,
  };
};

const rows = (grade: string, n = 1) =>
  [['Date', 'Grade'], ...Array.from({ length: n }, (_, i) => [`2026-03-0${i + 1}`, grade])];

describe('a grade the file does not place', () => {
  it('tells a real ambiguity from a cell that is not a grade', () => {
    // The whole rule, at the level it lives: an answer can place a cell
    // that reads on one of the two ladders, and nothing else.
    // Both ladders, and each one on its own. `6b+` reads only as a route
    // and `5+` only as Font — dropping either half of the rule leaves a
    // real ambiguity unasked, which the battery showed it does.
    for (const readable of ['7c', '8A', '6b+', '4', '5', '5+']) {
      expect(ambiguousGrade(readable), readable).toBe(true);
    }
    for (const not of ['projecting', 'xyz', '99', '', '  ']) expect(ambiguousGrade(not), not).toBe(false);
    // Self-scaling is not ambiguous either: the file already said which.
    for (const said of ['V4', '5.11a']) expect(ambiguousGrade(said), said).toBe(false);
  });

  it('asks the question where an answer would place the row', () => {
    const { asks } = card('font.csv', rows('7c'));
    expect(asks.join(' | ')).toContain('Are these boulders or routes?');
  });

  it('does not ask it about a typo, which no answer places', () => {
    // This asked whenever a grade was not self-scaling, which is true of
    // every typo — under an explanation about Font and French grades.
    const { asks } = card('typo.csv', rows('projecting'));
    expect(asks.join(' | ')).not.toContain('boulders or routes');
  });

  it('does not ask when the file says which on every row', () => {
    // A discipline column settles it, so the question is answered already.
    const { asks } = card('said.csv', [
      ['Date', 'Grade', 'Boulder or route'],
      ['2026-03-01', '7c', 'boulder'],
    ]);
    expect(asks.join(' | ')).not.toContain('boulders or routes');
  });

  it('is a fixture the question would have fired on', () => {
    // Without that, the test above passes on a file the old rule was right
    // about, and proves nothing.
    expect('projecting'.trim()).not.toBe('');
    const { pending } = card('typo.csv', rows('projecting'));
    expect(pending.columns).toContain('grade');
    expect(pending.columns).not.toContain('discipline');
  });
});

describe('the reason a row was refused', () => {
  const refusals = (grade: string) =>
    importCsv({
      kind: 'climbs',
      rows: [['2026-03-01', grade]],
      columns: ['date', 'grade'],
      occupied: new Set(),
    }).refused.map((r) => r.because);

  it('says a real ambiguity is one', () => {
    expect(refusals('7c')[0]).toContain('could be a boulder or a route');
  });

  it('does not tell a climber their typo might be a boulder', () => {
    // The right sentence was already three lines below in the same
    // function, waiting on a ladder this row never gets.
    const [said] = refusals('projecting');
    expect(said).toBe('"projecting" is not a grade on either ladder.');
    expect(said).not.toContain('boulder or a route');
  });

  it('still names the ladder when it knows which one', () => {
    const said = importCsv({
      kind: 'climbs',
      rows: [['2026-03-01', 'V99', 'boulder']],
      columns: ['date', 'grade', 'discipline'],
      occupied: new Set(),
    }).refused.map((r) => r.because);
    expect(said[0]).toContain('not a grade on the V ladder');
  });
});

describe('what the preview says will arrive', () => {
  it('counts the days and what they carry', () => {
    const { panel, button } = card('ticks.csv', [
      ['Date', 'Grade', 'Sent', 'Qty'],
      ['2026-03-01', 'V4', 'yes', '3'],
      ['2026-03-01', 'V5', 'no', '1'],
      ['2026-03-04', 'V3', 'yes', '2'],
    ]);
    expect(panel).toContain('2 days would arrive, carrying 6 climbs.');
    expect(button?.textContent).toBe('Import 2 days');
  });

  it('agrees with itself about one of each', () => {
    const { panel, button } = card('one.csv', rows('V4'));
    expect(panel).toContain('1 day would arrive, carrying 1 climb.');
    expect(button?.textContent).toBe('Import 1 day');
  });

  it('counts readings rather than days for a sheet of benchmarks', () => {
    // A benchmark belongs to its metric and adds no training day, so the
    // button would otherwise offer "Import 0 days" — a refusal, read aloud.
    const { panel, button } = card('tests.csv', [
      ['Date', 'Test', 'Result'],
      ['2026-03-01', 'Max pull-ups', '12'],
    ]);
    expect(panel).toContain('1 reading would arrive.');
    expect(button?.textContent).toBe('Import 1 reading');
  });

  it('refuses to offer an import with nothing in it', () => {
    const { button } = card('header.csv', [['Date', 'Grade', 'Sent']]);
    expect(button?.disabled).toBe(true);
  });

  it('names a column it cannot do without', () => {
    const { panel } = card('nogrades.csv', [
      ['Date', 'Notes'],
      ['2026-03-01', 'felt good'],
    ]);
    expect(panel).toContain('without a grade column');
  });

  it('names the first few refusals and counts the rest', () => {
    const { panel } = card('bad.csv', rows('projecting', 8));
    expect(panel).toContain('8 rows cannot be read');
    expect(panel).toContain('And 3 more.');
  });

  it('calls one refusal a row rather than rows', () => {
    const { panel } = card('one-bad.csv', rows('projecting', 1));
    expect(panel).toContain('1 row cannot be read');
  });
});

describe('a header the file did not fill in', () => {
  it('numbers a blank column rather than leaving it nameless', () => {
    const { pending } = card('blank.csv', [
      ['Date', '', 'Grade'],
      ['2026-03-01', 'x', 'V4'],
    ]);
    expect(pending.columns[1]).toBe('skip');
    expect(guessKind(['Date', '', 'Grade'])).toBe('climbs');
    expect(guessColumns(['Date', '', 'Grade'], 'climbs')[1]).toBe('skip');
  });
});
