import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import {
  guessColumns,
  importCsv,
  readCount,
  readDate,
  readDiscipline,
  readMode,
  readResult,
  selfScaling,
  type ColumnKind,
} from './importCsv';

/**
 * A climber's history, out of a spreadsheet (PLAN.md M105).
 *
 * Every fixture here is a shape a real export produces. The rule is
 * `programFile.ts`'s: rebuild, never cast — and refuse a row by name rather
 * than filing it as something it is not.
 */

const of = (text: string, columns: ColumnKind[], assume?: 'boulder' | 'route') => {
  const [, ...rows] = parseCsv(text);
  return importCsv({ rows, columns, ...(assume ? { assume } : {}) });
};

describe('guessing what the columns are', () => {
  it('reads an ordinary header', () => {
    expect(guessColumns(['Date', 'Grade', 'Result', 'Notes'])).toEqual([
      'date', 'grade', 'result', 'notes',
    ]);
  });

  it('is not fooled by case or padding', () => {
    expect(guessColumns([' DATE ', 'Crag'])).toEqual(['date', 'place']);
  });

  it('leaves a column it does not know alone', () => {
    expect(guessColumns(['Date', 'Partner', 'Grade'])).toEqual(['date', 'skip', 'grade']);
  });

  // A wrong guess is free because the climber confirms it. Two columns
  // claiming one meaning is not free, so the first wins and the rest are
  // left for the climber to move.
  it('gives each meaning to one column', () => {
    expect(guessColumns(['Date', 'Session Date'])).toEqual(['date', 'skip']);
  });

  it('knows the spellings a climbing log actually uses', () => {
    expect(guessColumns(['Crag', 'Tick Type', 'Problems'])).toEqual(['place', 'result', 'count']);
  });
});

describe('the dates a spreadsheet writes', () => {
  it('reads the app\'s own key', () => {
    expect(readDate('2026-01-09')).toBe('2026-01-09');
  });

  it('reads the other punctuation for the same order', () => {
    expect(readDate('2026/01/09')).toBe('2026-01-09');
    expect(readDate('2026.1.9')).toBe('2026-01-09');
  });

  // Day first: every ambiguous spelling outside the United States, and
  // guessing the other way moves sessions to a different month silently.
  it('reads an ambiguous date day-first', () => {
    expect(readDate('09/01/2026')).toBe('2026-01-09');
    expect(readDate('9-1-2026')).toBe('2026-01-09');
  });

  it('reads a written month', () => {
    expect(readDate('9 January 2026')).toBe('2026-01-09');
    expect(readDate('Jan 9, 2026')).toBe('2026-01-09');
  });

  it('refuses what it cannot read rather than inventing a day', () => {
    expect(readDate('')).toBeNull();
    expect(readDate('last tuesday')).toBeNull();
    expect(readDate('2026-13-01')).toBeNull();
  });

  /**
   * `Date.parse` reads the 30th of February as the 2nd of March rather than
   * refusing it. A spreadsheet with a typo in one cell would land a session
   * in the wrong month and say nothing — the same failure the day-first
   * rule above exists to avoid, arriving by a different door.
   */
  it('refuses a day that does not exist, in every spelling it reads', () => {
    expect(readDate('2026-02-30')).toBeNull();
    expect(readDate('2026/02/30')).toBeNull();
    expect(readDate('2026.2.30')).toBeNull();
    expect(readDate('30/02/2026')).toBeNull();
    expect(readDate('2026/13/01')).toBeNull();
    // And a written one, which is the only spelling `Date.parse` still sees.
    expect(readDate('30 February 2026')).toBeNull();
  });
});

describe('the grade, which the text cannot always settle', () => {
  it('reads a grade that names its own scale', () => {
    expect(selfScaling('V4')).toBe('V');
    expect(selfScaling('v4')).toBe('V');
    expect(selfScaling('5.11a')).toBe('YDS');
  });

  /**
   * The finding the milestone was wrong about.
   *
   * `parseGrade` reads `7c` as V9 *and* as 5.12c, because Font and French
   * share the number-plus-letter shape. Nothing in the cell says which, so
   * nothing here guesses.
   */
  it('refuses to pick a scale for a grade that reads as two', () => {
    for (const g of ['6A', '6a', '7c', '8A', '7A+']) expect(selfScaling(g)).toBeNull();
  });

  it('takes the scale from a discipline column', () => {
    const out = of('date,grade,type\n2026-01-09,7c,boulder', ['date', 'grade', 'discipline']);
    expect(out.refused).toEqual([]);
    expect(out.sessions[0]!.climbs[0]).toMatchObject({ grade: 'V9', scale: 'V' });
  });

  it('reads the same cell as a route when the file says route', () => {
    const out = of('date,grade,type\n2026-01-09,7c,sport', ['date', 'grade', 'discipline']);
    expect(out.sessions[0]!.climbs[0]).toMatchObject({ grade: '5.12c', scale: 'YDS' });
  });

  it('takes the climber\'s answer where the file has no column', () => {
    const out = of('date,grade\n2026-01-09,7c', ['date', 'grade'], 'boulder');
    expect(out.sessions[0]!.climbs[0]!.grade).toBe('V9');
  });

  // Named by line, not counted, so it can be looked up in the spreadsheet.
  it('refuses an ambiguous grade by name when nothing says which', () => {
    const out = of('date,grade\n2026-01-09,7c', ['date', 'grade']);
    expect(out.sessions).toEqual([]);
    expect(out.refused).toEqual([
      { line: 2, because: '"7c" could be a boulder or a route and the file does not say which.' },
    ]);
  });

  // A grade that names its own scale needs no help and gets none.
  it('reads a self-scaling grade even in an ambiguous file', () => {
    const out = of('date,grade\n2026-01-09,V4\n2026-01-09,7c', ['date', 'grade']);
    expect(out.sessions[0]!.climbs).toHaveLength(1);
    expect(out.refused).toHaveLength(1);
  });

  it('refuses a grade that is on no ladder', () => {
    const out = of('date,grade\n2026-01-09,V99', ['date', 'grade']);
    expect(out.refused[0]!.because).toMatch(/not a grade on the V ladder/);
  });
});

describe('reading the rest of a row', () => {
  it('reads the words a log uses for a send', () => {
    for (const w of ['send', 'Sent', 'redpoint', 'flash', 'onsight', 'tick', 'yes']) {
      expect(readResult(w), w).toBe('send');
    }
  });

  it('reads the words a log uses for an attempt', () => {
    for (const w of ['attempt', 'DNF', 'fail', 'no', 'project']) expect(readResult(w), w).toBe('attempt');
  });

  it('reads indoor and outdoor', () => {
    expect(readMode('Crag')).toBe('outdoor');
    expect(readMode('gym')).toBe('indoor');
    expect(readMode('')).toBeNull();
  });

  it('reads a discipline', () => {
    expect(readDiscipline('Bouldering')).toBe('boulder');
    expect(readDiscipline('lead')).toBe('route');
    expect(readDiscipline('swimming')).toBeNull();
  });

  // A blank count is one climb, not zero climbs.
  it('reads a count, and calls a blank one', () => {
    expect(readCount('')).toBe(1);
    expect(readCount('4')).toBe(4);
    expect(readCount('1,200')).toBeNull();
    expect(readCount('0')).toBeNull();
    expect(readCount('-2')).toBeNull();
    expect(readCount('lots')).toBeNull();
  });

  // Stating an attempt is the way round that cannot invent sends.
  it('treats a row that says nothing about the result as a send', () => {
    const out = of('date,grade\n2026-01-09,V4', ['date', 'grade']);
    expect(out.sessions[0]!.climbs[0]!.result).toBe('send');
  });
});

describe('rows into days', () => {
  const file = [
    'date,grade,result,count,where,note',
    '2026-01-09,V4,send,2,The Works,good day',
    '2026-01-09,V5,attempt,1,The Works,good day',
    '2026-01-11,V3,send,1,Malham,',
  ].join('\n');
  const columns: ColumnKind[] = ['date', 'grade', 'result', 'count', 'place', 'notes'];

  it('makes one session per day, oldest first', () => {
    const out = of(file, columns);
    expect(out.sessions.map((s) => s.date)).toEqual(['2026-01-09', '2026-01-11']);
    expect(out.sessions[0]!.climbs).toHaveLength(2);
  });

  it('counts the climbs, not the rows', () => {
    expect(of(file, columns).climbs).toBe(4);
  });

  it('puts the place where the venues engine already looks', () => {
    expect(of(file, columns).sessions[0]!.fields?.location).toBe('The Works');
  });

  // Written once on three rows of one day is one note, not three.
  it('joins the day\'s notes without repeating one', () => {
    expect(of(file, columns).sessions[0]!.notes).toBe('good day');
  });

  /**
   * Five years cashed out at once is the level-100-on-day-one the audit
   * cut. It counts for every stat, the career, the pyramid and the
   * altimeter, because height is a fact about climbing and XP is pacing.
   */
  it('arrives paid, so no XP is owed on it', () => {
    for (const s of of(file, columns).sessions) {
      expect(s.rewarded).toBe(true);
      expect(s.completed).toBe(true);
    }
  });

  it('marks where it came from', () => {
    expect(of(file, columns).sessions[0]!.imported).toBe('csv');
  });

  it('skips a blank row without refusing it', () => {
    const out = of('date,grade\n2026-01-09,V4\n\n2026-01-10,V5', ['date', 'grade']);
    expect(out.sessions).toHaveLength(2);
    expect(out.refused).toEqual([]);
  });

  // A spreadsheet five years deep will have bad rows in it, and an
  // all-or-nothing import is one that never succeeds.
  it('keeps the good rows when a row is bad', () => {
    const out = of('date,grade\n2026-01-09,V4\nnope,V5\n2026-01-10,V6', ['date', 'grade']);
    expect(out.sessions).toHaveLength(2);
    expect(out.refused).toEqual([{ line: 3, because: 'No date the app can read in "nope".' }]);
  });

  it('counts the header when it numbers a line', () => {
    const out = of('date,grade\n2026-01-09,V4\n2026-01-10,', ['date', 'grade']);
    expect(out.refused[0]!.line).toBe(3);
  });

  it('reads a column it was told to skip as nothing', () => {
    const out = of('date,partner,grade\n2026-01-09,Sam,V4', ['date', 'skip', 'grade']);
    expect(out.sessions[0]!.climbs[0]!.grade).toBe('V4');
    expect(out.sessions[0]!.notes).toBeUndefined();
  });

  // The first row of the day that says anything wins. A day is one place
  // and one setting, and the last row is not more authoritative than the
  // first — it is just the one that happened to be typed last.
  it('takes the first stated mode of a day, not the last', () => {
    const out = of('date,grade,where\n2026-01-09,V4,crag\n2026-01-09,V5,gym', ['date', 'grade', 'mode']);
    expect(out.sessions[0]!.mode).toBe('outdoor');
  });

  it('takes the first stated place of a day, not the last', () => {
    const out = of('date,grade,where\n2026-01-09,V4,Malham\n2026-01-09,V5,Kilnsey', ['date', 'grade', 'place']);
    expect(out.sessions[0]!.fields?.location).toBe('Malham');
  });

  it('steps over a blank cell to the next row that states one', () => {
    const out = of('date,grade,where\n2026-01-09,V4,\n2026-01-09,V5,crag', ['date', 'grade', 'mode']);
    expect(out.sessions[0]!.mode).toBe('outdoor');
  });

  /**
   * An import is a merge, and a session's key is `${date}#${index}`.
   * A climber who logged Saturday in the app and also has Saturday in their
   * spreadsheet would otherwise have the logged one overwritten by a row —
   * data loss inside the one operation that promises not to lose any.
   */
  it('does not land on a day already logged in the app', () => {
    const out = importCsv({
      rows: parseCsv('date,grade\n2026-01-09,V4').slice(1),
      columns: ['date', 'grade'],
      occupied: new Set(['2026-01-09#0']),
    });
    expect(out.sessions[0]!.id).toBe('2026-01-09#1');
  });

  it('keeps walking past every index that is taken', () => {
    const out = importCsv({
      rows: parseCsv('date,grade\n2026-01-09,V4').slice(1),
      columns: ['date', 'grade'],
      occupied: new Set(['2026-01-09#0', '2026-01-09#1', '2026-01-09#2']),
    });
    expect(out.sessions[0]!.id).toBe('2026-01-09#3');
  });

  it('takes the first index on a day the app has never seen', () => {
    const out = importCsv({
      rows: parseCsv('date,grade\n2026-01-09,V4').slice(1),
      columns: ['date', 'grade'],
      occupied: new Set(['2026-02-02#0']),
    });
    expect(out.sessions[0]!.id).toBe('2026-01-09#0');
  });

  it('leaves a day indoors when nothing says otherwise', () => {
    expect(of('date,grade\n2026-01-09,V4', ['date', 'grade']).sessions[0]!.mode).toBe('indoor');
  });
});
