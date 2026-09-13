import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import {
  ARCHIVE_SHEETS,
  COLUMNS,
  countOf,
  guessColumns,
  guessKind,
  importCsv,
  readCount,
  readDate,
  readDiscipline,
  readMode,
  readNumber,
  readResult,
  REQUIRED,
  selfScaling,
  type ColumnKind,
  type CsvKind,
} from './importCsv';
import { CSV_FILES } from './exportCsv';

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

/**
 * Three shapes, not one (PLAN.md M139).
 *
 * A row was a climb, and a training log is mostly not climbs. These cover
 * the two kinds that did not exist and the four climb columns that were
 * written by M133 and read by nothing.
 */

const read = (text: string, kind: CsvKind, columns?: ColumnKind[], units?: 'metric' | 'imperial') => {
  const [header = [], ...rows] = parseCsv(text);
  return importCsv({
    kind,
    rows,
    columns: columns ?? guessColumns(header, kind),
    ...(units ? { units } : {}),
  });
};

describe('what kind of file this is', () => {
  it('knows a benchmark sheet by its metric column', () => {
    expect(guessKind(['Date', 'Metric', 'Value', 'Unit'])).toBe('benchmarks');
  });

  it('knows a hangboard log by its exercise column', () => {
    expect(guessKind(['Date', 'Exercise', 'Sets', 'Reps'])).toBe('exercises');
  });

  it('calls anything else a tick list, which is what one usually is', () => {
    expect(guessKind(['Date', 'Grade', 'Crag'])).toBe('climbs');
  });

  /**
   * `Name` is in `exercise`'s spellings, because a gym log's column for
   * what the lift was is often called that — and it is also the archive's
   * column for what a climb is called. The climb file must not read as a
   * gym log on the strength of it.
   */
  it('does not mistake a climb name for an exercise name', () => {
    expect(guessKind(['Date', 'Grade', 'Name', 'Angle', 'Rope'])).toBe('climbs');
  });
});

describe('one spelling, two meanings', () => {
  // The reason each kind has its own column list rather than one shared
  // set: `Reps` is a count of climbs in a tick list and a count of reps on
  // a hangboard, and neither kind can offer the other's meaning.
  it('reads Reps as a count of climbs in a tick list', () => {
    expect(guessColumns(['Date', 'Grade', 'Reps'], 'climbs')).toEqual(['date', 'grade', 'count']);
  });

  it('reads Reps as reps in a gym log', () => {
    expect(guessColumns(['Date', 'Exercise', 'Reps'], 'exercises')).toEqual([
      'date', 'exercise', 'reps',
    ]);
  });

  // A grade column on a hangboard log is a column that cannot be named,
  // which is the honest answer rather than a wrong one.
  it('offers no meaning a kind does not have', () => {
    expect(guessColumns(['Date', 'Exercise', 'Grade'], 'exercises')).toEqual([
      'date', 'exercise', 'skip',
    ]);
  });

  it('offers every column of a kind and no column of another', () => {
    expect(COLUMNS.benchmarks).not.toContain('grade');
    expect(COLUMNS.climbs).not.toContain('sets');
    expect(COLUMNS.exercises).not.toContain('metric');
  });
});

describe('a gym log', () => {
  const LOG = [
    'Date,Exercise,Sets,Reps,Hold (s),Load (lb),Note',
    '2026-01-09,Max hang,5,1,10,40,felt strong',
    '2026-01-09,Pull-up,4,6,,20,',
    '2026-01-11,Max hang,5,1,10,45,',
  ].join('\n');

  it('reads the archive\'s own header without a hand on it', () => {
    expect(guessColumns(parseCsv(LOG)[0]!, 'exercises')).toEqual([
      'date', 'exercise', 'sets', 'reps', 'hold', 'load', 'notes',
    ]);
  });

  it('makes one day out of the rows that share a date', () => {
    const out = read(LOG, 'exercises');
    expect(out.sessions).toHaveLength(2);
    expect(out.sessions[0]!.exercises?.map((e) => e.name)).toEqual(['Max hang', 'Pull-up']);
  });

  it('carries the numbers a climber typed', () => {
    const first = read(LOG, 'exercises').sessions[0]!.exercises![0]!;
    expect([first.sets, first.reps, first.hold, first.load]).toEqual([5, 1, 10, 40]);
    expect(first.note).toBe('felt strong');
  });

  it('counts exercises, not rows and not days', () => {
    const out = read(LOG, 'exercises');
    expect(out.exercises).toBe(3);
    expect(countOf(out, 'exercises')).toEqual({ n: 3, noun: 'exercise' });
  });

  // One place decides what a kind counts and what it calls them, so the
  // preview sentence and the import button cannot disagree.
  it('names what each kind counts in its own words', () => {
    const gym = read(LOG, 'exercises');
    expect(countOf(gym, 'climbs')).toEqual({ n: 0, noun: 'climb' });
    expect(countOf(gym, 'benchmarks')).toEqual({ n: 0, noun: 'reading' });
  });

  // A blank load column is a bodyweight log, not a zero-pound lift.
  it('leaves a number out rather than inventing a zero', () => {
    const second = read(LOG, 'exercises').sessions[0]!.exercises![1]!;
    expect(second.hold).toBeUndefined();
    expect(second.note).toBeUndefined();
  });

  // Assisted, which is how a climber works toward their first one-arm
  // anything — so the bound cannot be zero at the bottom.
  it('reads an assisted weight as the negative number it is', () => {
    const out = read('Date,Exercise,Load (lb)\n2026-01-09,One-arm hang,-30', 'exercises');
    expect(out.sessions[0]!.exercises![0]!.load).toBe(-30);
  });

  it('refuses a number it cannot read, by its line and its reason', () => {
    const out = read('Date,Exercise,Sets\n2026-01-09,Max hang,a few', 'exercises');
    expect(out.sessions).toEqual([]);
    expect(out.refused).toEqual([{ line: 2, because: '"a few" is not a sets the app can read.' }]);
  });

  it('refuses a number outside what the field allows', () => {
    // 4000 seconds is a 66-minute hang. A cell like that is a typo or a
    // different unit, and writing it would poison every chart that reads it.
    const out = read('Date,Exercise,Hold (s)\n2026-01-09,Max hang,4000', 'exercises');
    expect(out.refused[0]!.because).toMatch(/hold in seconds/);
  });

  /**
   * Each field's bounds are its own, and a hold's are not a weight's.
   * A negative weight is assisted and a negative hold is nothing; a ten
   * minute ARC hang is a real entry and a 600 lb one is not.
   */
  it('bounds a hold by what a hold can be, not by what a weight can be', () => {
    const negative = read('Date,Exercise,Hold (s)\n2026-01-09,Max hang,-30', 'exercises');
    expect(negative.refused[0]!.because).toMatch(/hold in seconds/);
    const long = read('Date,Exercise,Hold (s)\n2026-01-09,ARC hang,600', 'exercises');
    expect(long.sessions[0]!.exercises![0]!.hold).toBe(600);
  });

  it('refuses a row with no exercise on it', () => {
    const out = read('Date,Exercise\n2026-01-09,', 'exercises');
    expect(out.refused).toEqual([{ line: 2, because: 'No exercise named on this row.' }]);
  });

  it('cannot be read without a date and an exercise', () => {
    expect(REQUIRED.exercises).toEqual(['date', 'exercise']);
  });
});

describe('a sheet of benchmark readings', () => {
  const SHEET = [
    'Date,Metric,Value,Unit,Note',
    '2026-01-09,Max Hang 20mm 7s,40,BW+lbs,two hands',
    '2026-01-11,Max Pull-Ups,12,reps,',
  ].join('\n');

  it('reads the archive\'s own header without a hand on it', () => {
    expect(guessColumns(parseCsv(SHEET)[0]!, 'benchmarks')).toEqual([
      'date', 'metric', 'value', 'unit', 'notes',
    ]);
  });

  /**
   * Not a session. A reading belongs to its metric and its day, and
   * inventing a session to hang it on would put a training day in the log
   * that nobody had.
   */
  it('brings readings in without inventing a training day', () => {
    const out = read(SHEET, 'benchmarks');
    expect(out.sessions).toEqual([]);
    expect(out.metrics).toHaveLength(2);
  });

  it('lands them on the metric the app records, by its own label', () => {
    const out = read(SHEET, 'benchmarks');
    expect(out.metrics[0]!.metricId).toBeTruthy();
    expect(out.metrics[0]!.date).toBe('2026-01-09');
    expect(out.metrics[0]!.note).toBe('two hands');
  });

  /**
   * The label is what a person writes and the id is what the app stores,
   * and they are not the same string — *Weighted Pull-Ups 3RM* against
   * `weighted_pullup_3rm`, which differ by a plural even after the
   * punctuation is stripped. Both have to land on the same metric.
   */
  it('takes the benchmark by the name a person writes', () => {
    const out = read('Date,Metric,Value\n2026-01-09,Weighted Pull-Ups 3RM,25', 'benchmarks');
    expect(out.metrics[0]!.metricId).toBe('weighted_pullup_3rm');
  });

  it('takes it by the name the app stores, too', () => {
    const out = read('Date,Metric,Value\n2026-01-09,weighted_pullup_3rm,25', 'benchmarks');
    expect(out.metrics[0]!.metricId).toBe('weighted_pullup_3rm');
  });

  // Exactly, not loosely: *Max Hang* is not *Max Hang 20mm 7s*, and a
  // near-match filed on the wrong metric is worse than a refusal a climber
  // can see and fix.
  it('will not take a name that merely contains the right words', () => {
    const out = read('Date,Metric,Value\n2026-01-09,Max Hang,40', 'benchmarks');
    expect(out.metrics).toEqual([]);
    expect(out.refused[0]!.because).toMatch(/not a benchmark this app records/);
  });

  it('refuses a benchmark the app does not record', () => {
    const out = read('Date,Metric,Value\n2026-01-09,Vertical leap,40', 'benchmarks');
    expect(out.metrics).toEqual([]);
    expect(out.refused[0]!.because).toBe('"Vertical leap" is not a benchmark this app records.');
  });

  /**
   * The file's own unit wins where it names one, which is what closes the
   * round trip: the archive writes the unit it stored, and a climber
   * reading in kilograms must not have their own export re-read as kilos.
   */
  it('takes the unit from the file over the climber\'s own', () => {
    const named = read(
      'Date,Metric,Value,Unit\n2026-01-09,Max Hang 20mm 7s,40,BW+lbs',
      'benchmarks',
      undefined,
      'metric',
    );
    const silent = read('Date,Metric,Value\n2026-01-09,Max Hang 20mm 7s,40', 'benchmarks', undefined, 'metric');
    expect(named.metrics[0]!.value).not.toBe(silent.metrics[0]!.value);
  });

  it('reads the number the way the climber types it when the file is silent', () => {
    const imperial = read('Date,Metric,Value\n2026-01-09,Max Hang 20mm 7s,40', 'benchmarks', undefined, 'imperial');
    expect(imperial.metrics[0]!.value).toBe(40);
  });

  it('counts readings, in the word a reading is called', () => {
    expect(countOf(read(SHEET, 'benchmarks'), 'benchmarks')).toEqual({ n: 2, noun: 'reading' });
  });

  it('cannot be read without a date, a metric and a value', () => {
    expect(REQUIRED.benchmarks).toEqual(['date', 'metric', 'value']);
  });
});

describe('a bounded number', () => {
  it('takes one inside the bounds', () => {
    expect(readNumber('5', 1, 99)).toBe(5);
  });

  it('refuses one outside them at either end', () => {
    expect(readNumber('0', 1, 99)).toBeNull();
    expect(readNumber('100', 1, 99)).toBeNull();
  });

  it('refuses text that is not a number at all', () => {
    expect(readNumber('a few', 1, 99)).toBeNull();
    expect(readNumber('', 1, 99)).toBeNull();
  });

  /**
   * The blank is refused on its own account, not by the floor.
   * `Number('')` is 0, and 0 is inside the range a weight allows — so a
   * blank load column would become a zero-pound lift rather than the
   * bodyweight one it is.
   */
  it('refuses a blank even where zero would be allowed', () => {
    expect(readNumber('', -500, 500)).toBeNull();
    expect(readNumber('0', -500, 500)).toBe(0);
  });
});

describe('the four columns the archive wrote and nothing read', () => {
  const FILE = [
    'Date,Grade,Ascent style,Name,Angle,Rope',
    '2026-01-09,5.12a,redpoint,The Crucifix,overhang,lead',
  ].join('\n');

  it('guesses every one of them', () => {
    expect(guessColumns(parseCsv(FILE)[0]!, 'climbs')).toEqual([
      'date', 'grade', 'style', 'name', 'angle', 'rope',
    ]);
  });

  it('reads them onto the climb', () => {
    const climb = read(FILE, 'climbs').sessions[0]!.climbs[0]!;
    expect([climb.name, climb.angle, climb.ropeStyle, climb.style]).toEqual([
      'The Crucifix', 'overhang', 'lead', 'redpoint',
    ]);
  });

  /**
   * Each one absent rather than guessed. An unsaid angle is not vertical
   * and an unsaid rope style is not a top-rope: the archive leaves them
   * blank precisely because the climber never said.
   */
  it('leaves each one off where the cell is blank', () => {
    const climb = read('Date,Grade,Ascent style,Name,Angle,Rope\n2026-01-09,V4,,,,', 'climbs')
      .sessions[0]!.climbs[0]!;
    expect(climb.name).toBeUndefined();
    expect(climb.angle).toBeUndefined();
    expect(climb.ropeStyle).toBeUndefined();
    expect(climb.style).toBeUndefined();
  });

  // `Style` alone stays a result, for the files people already have where
  // one column holds redpoint/flash. *Ascent style* is spelled that way in
  // the archive for exactly this reason.
  it('still reads a bare Style column as the result', () => {
    expect(guessColumns(['Date', 'Grade', 'Style'], 'climbs')).toEqual(['date', 'grade', 'result']);
  });

  it('does not read a word it cannot place', () => {
    const climb = read('Date,Grade,Angle,Rope\n2026-01-09,V4,sideways,abseil', 'climbs')
      .sessions[0]!.climbs[0]!;
    expect(climb.angle).toBeUndefined();
    expect(climb.ropeStyle).toBeUndefined();
  });
});

describe('which of the archive\'s spreadsheets come back', () => {
  it('names every file the archive writes, and no other', () => {
    expect(ARCHIVE_SHEETS.map((s) => s.file).sort()).toEqual(Object.values(CSV_FILES).sort());
  });

  it('claims exactly the three kinds the importer has', () => {
    const kinds = ARCHIVE_SHEETS.map((s) => s.kind).filter((k): k is CsvKind => k !== null);
    expect(kinds.sort()).toEqual((Object.keys(COLUMNS) as CsvKind[]).sort());
  });

  // Said out loud rather than by omission: a climber with five files and
  // three importable ones would otherwise find out by trying each.
  it('says what the other two are for rather than leaving them out', () => {
    const silent = ARCHIVE_SHEETS.filter((s) => s.kind === null);
    expect(silent.map((s) => s.file)).toEqual([CSV_FILES.sessions, CSV_FILES.attempts]);
    for (const sheet of silent) expect(sheet.holds).toMatch(/backup file/);
  });
});
