/**
 * A climber's history, out of a spreadsheet (PLAN.md M105).
 *
 * Onboarding says *"your altimeter starts at zero"*, and for someone with
 * five years in a spreadsheet — or an export from the app they are leaving
 * — that is the app throwing their climbing away and asking them to be
 * patient. M87 recovered block history from the app's own records; this is
 * the history the app never had.
 *
 * `csv.ts` decides what the cells are. This decides what a row *means*, and
 * follows `programFile.ts`'s rule for every foreign document: **rebuild,
 * never cast.** Every field is read individually, checked against what it
 * is allowed to be, and copied onto a fresh object. A row that cannot be
 * read is refused **with its line number and a reason**, and the rest of
 * the file still imports — a spreadsheet five years deep will have bad rows
 * in it, and an all-or-nothing import is one that never succeeds.
 *
 * ## The grade problem, which is not solvable from the text
 *
 * The milestone says grades "go through `parseGrade`, so Font and French
 * come in". Measured, that cannot work on a bare grade string:
 *
 * ```
 * 6A   → V3 (Font)  and  5.10a (French)
 * 7c   → V9 (Font)  and  5.12c (French)
 * 8A   → V11 (Font) and  5.13a (French)
 * ```
 *
 * Every Font grade collides with a French one, because they share the
 * number-plus-letter shape and `parseGrade` matches case-insensitively. So
 * `7c` in a spreadsheet is either a V9 boulder or a 5.12c route and
 * **nothing in the cell says which**.
 *
 * The app does not guess. `V…` and `5.…` name their own scale and are read
 * on sight; everything else needs the discipline, from a column if the file
 * has one and from the climber if it does not. A file with neither gets its
 * ambiguous rows refused by name rather than silently filed as boulders.
 *
 * ## Three shapes, not one (PLAN.md M139)
 *
 * A row was a climb, and a training log is mostly not climbs. The archive
 * writes five spreadsheets and this could read one of them, losing four of
 * its columns on the way — `Ascent style`, `Name`, `Angle` and `Rope`, the
 * last three added by M133 and the first named *Ascent style* precisely so
 * this file's guesser would not mistake it for a result. The reader it was
 * waiting for never arrived.
 *
 * So the file says what kind it is first, and each kind has its own columns:
 * a row is a climb, an exercise, or a benchmark reading. The shapes are the
 * ones the archive already writes, which is the point — `exercises.csv` and
 * `benchmarks.csv` come back in.
 *
 * **The day is still the unit.** Rows sharing a date become one session,
 * whichever kind they are, because that is what the app stores. Two sessions
 * on one day in the archive come back as one, the same flattening the climb
 * path has always done.
 */

import { METRICS } from '@/content/metrics';
import type { Metric } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type {
  AscentStyle,
  Climb,
  ClimbResult,
  LoggedExercise,
  RopeStyle,
  Session,
  SessionMode,
  WallAngle,
} from '@/db/sessions';
import { newSession, sessionId } from '@/db/sessions';
import { parseMetricInput } from './assessments';
import { isDateKey, toKey } from './dates';
import { CSV_FILES } from './exportCsv';
import { parseGrade, type GradeScale } from './grades';
import { unitLabel, type UnitSystem } from './units';

export type Discipline = 'boulder' | 'route';

/** What a spreadsheet is a list of (PLAN.md M139). */
export type CsvKind = 'climbs' | 'exercises' | 'benchmarks';

/** What a column holds. `skip` is a column the climber has waved away. */
export type ColumnKind =
  | 'date'
  | 'notes'
  | 'skip'
  // A climb.
  | 'grade'
  | 'result'
  | 'count'
  | 'discipline'
  | 'mode'
  | 'place'
  | 'name'
  | 'angle'
  | 'rope'
  | 'style'
  // An exercise.
  | 'exercise'
  | 'sets'
  | 'reps'
  | 'hold'
  | 'load'
  // A benchmark reading.
  | 'metric'
  | 'value'
  | 'unit';

/**
 * Which columns each kind can hold, in the order the picker offers them.
 *
 * The list is also what the guesser considers, which is how one spelling
 * can mean two things: *Reps* is a count of climbs in a tick list and a
 * count of reps in a hangboard log, and neither kind offers the other's
 * meaning.
 */
export const COLUMNS: Record<CsvKind, ColumnKind[]> = {
  climbs: ['date', 'grade', 'result', 'count', 'discipline', 'mode', 'place', 'name', 'angle', 'rope', 'style', 'notes', 'skip'],
  exercises: ['date', 'exercise', 'sets', 'reps', 'hold', 'load', 'notes', 'skip'],
  benchmarks: ['date', 'metric', 'value', 'unit', 'notes', 'skip'],
};

/** The columns a kind cannot be read without. */
export const REQUIRED: Record<CsvKind, ColumnKind[]> = {
  climbs: ['date', 'grade'],
  exercises: ['date', 'exercise'],
  benchmarks: ['date', 'metric', 'value'],
};

/**
 * The archive's five spreadsheets, and which of them come back in.
 *
 * Said out loud rather than by omission (PLAN.md M139). A climber who
 * exported a backup has five files and no way to tell, short of trying
 * each one, that two of them are an archive to read rather than a history
 * to restore. The reason is the same for both, and it is not laziness:
 *
 * - `sessions.csv` is one row per session — the program, the type, the RPE,
 *   the check-in answers. Every one of those is a fact *about* a session the
 *   app already holds, so importing it would either duplicate days the
 *   climbs file already brought in or write sessions with nothing in them.
 * - `attempts.csv` is project burns, and a burn belongs to a project. There
 *   is no project store in a spreadsheet import to hang them on, and a burn
 *   whose project is invented from a name is a burn on the wrong project.
 *
 * Both restore from `backup.json`, which is the statement of record and
 * carries all five of these as records rather than as prose.
 */
export const ARCHIVE_SHEETS: { file: string; kind: CsvKind | null; holds: string }[] = [
  { file: CSV_FILES.climbs, kind: 'climbs', holds: 'Every climb, with its grade and how it went.' },
  { file: CSV_FILES.exercises, kind: 'exercises', holds: 'Every logged set — reps, hold, weight.' },
  { file: CSV_FILES.metrics, kind: 'benchmarks', holds: 'Every benchmark reading you have taken.' },
  {
    file: CSV_FILES.sessions,
    kind: null,
    holds: 'One row per session. Restores from the backup file, not from here — the days it names arrive with your climbs.',
  },
  {
    file: CSV_FILES.attempts,
    kind: null,
    holds: 'Project burns. Restores from the backup file, not from here — a burn belongs to a project, and a spreadsheet has none.',
  },
];

/**
 * Header spellings worth recognising, lowercased.
 *
 * A guess the climber confirms, never a mapping applied silently: the
 * confirm step is what makes a wrong guess free.
 */
const HEADERS: Record<Exclude<ColumnKind, 'skip'>, string[]> = {
  date: ['date', 'day', 'when', 'session date', 'climbed'],
  grade: ['grade', 'difficulty', 'level', 'font', 'french', 'v grade', 'vgrade', 'yds'],
  result: ['result', 'outcome', 'sent', 'send', 'status', 'tick', 'tick type', 'style'],
  count: ['count', 'qty', 'quantity', 'climbs', 'number', 'reps', 'problems', 'routes'],
  discipline: ['discipline', 'type', 'kind', 'boulder or route', 'climb type'],
  mode: ['mode', 'indoor', 'indoor/outdoor', 'inside', 'venue type', 'setting'],
  place: ['place', 'location', 'crag', 'gym', 'where', 'area', 'venue', 'wall'],
  name: ['name', 'climb', 'problem', 'route name', 'climb name', 'title'],
  angle: ['angle', 'wall angle', 'steepness', 'terrain'],
  rope: ['rope', 'lead or top-rope', 'lead', 'rope style'],
  // 'style' stays in `result`'s list and is not repeated here, so a file
  // whose only style column is spelled *Style* still reads as a result —
  // the older behaviour and the more common file, where one column holds
  // redpoint/flash. `result` is offered first, so it wins that spelling.
  // The archive writes *Ascent style* precisely to stay out of its way,
  // which is why M133 chose those two words (PLAN.md M139).
  style: ['ascent style', 'ascent'],
  exercise: ['exercise', 'movement', 'lift', 'name', 'what'],
  sets: ['sets', 'set'],
  reps: ['reps', 'rep', 'repetitions'],
  hold: ['hold', 'hold (s)', 'hang', 'seconds', 'time'],
  load: ['load', 'load (lb)', 'weight', 'added weight', 'kg', 'lbs'],
  metric: ['metric', 'benchmark', 'test', 'assessment', 'measure'],
  value: ['value', 'result', 'score', 'number', 'reading'],
  unit: ['unit', 'units'],
  notes: ['notes', 'note', 'comment', 'comments', 'description'],
};

/**
 * What this file looks like, from its header alone.
 *
 * Only the columns that name a kind outright decide — a *Metric* column or
 * an *Exercise* one. Everything else is a climb list, which is what a
 * spreadsheet of climbing usually is and what this importer read for four
 * milestones. The climber can say otherwise; the guess only decides which
 * question is already answered.
 */
export function guessKind(header: readonly string[]): CsvKind {
  const names = header.map((h) => h.trim().toLowerCase());
  if (names.some((n) => HEADERS.metric.includes(n))) return 'benchmarks';
  if (names.some((n) => HEADERS.exercise.includes(n) && n !== 'name')) return 'exercises';
  return 'climbs';
}

/** The importer's first guess at what each column is. */
export function guessColumns(header: readonly string[], kind: CsvKind = 'climbs'): ColumnKind[] {
  const taken = new Set<ColumnKind>();
  const offered = COLUMNS[kind].filter((k) => k !== 'skip');
  return header.map((raw) => {
    const name = raw.trim().toLowerCase();
    for (const kindOf of offered) {
      // One column per kind: a file with `date` and `session date` gets the
      // first, and the climber moves it if the first was wrong.
      if (taken.has(kindOf)) continue;
      if (HEADERS[kindOf as Exclude<ColumnKind, 'skip'>].includes(name)) {
        taken.add(kindOf);
        return kindOf;
      }
    }
    return 'skip';
  });
}

/** Dates a spreadsheet writes, in the order they are tried. */
export function readDate(text: string): string | null {
  const raw = text.trim();
  if (raw === '') return null;
  if (isDateKey(raw)) return raw;

  // 2026/01/09 and 2026.01.09 — the same order, another punctuation.
  const iso = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(raw);
  if (iso) return pad(iso[1]!, iso[2]!, iso[3]!);

  // 09/01/2026. Day first: every ambiguous spelling in the world outside
  // the United States, and guessing the other way silently moves sessions
  // to a different month rather than failing.
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (dmy) return pad(dmy[3]!, dmy[2]!, dmy[1]!);

  // A written month, which is what `toLocaleDateString` and most exports
  // produce. **Only** where there is a letter in it: `Date.parse` is lenient
  // with numbers in a way that is silently wrong — it reads `2026-02-30` as
  // the 2nd of March rather than refusing a day that does not exist, which
  // is the same "moves a session to another month without saying so" the
  // day-first rule above exists to avoid. A numeric date that reached here
  // has already failed every spelling the app claims to read, and guessing
  // is worse than asking the climber to fix the cell.
  if (!/[a-z]/i.test(raw)) return null;
  const parsed = Date.parse(`${raw} 12:00:00 GMT`);
  if (Number.isNaN(parsed)) return null;
  const when = new Date(parsed);
  // `Date.parse` rolls a written month over too — "30 February 2026" comes
  // back as the 2nd of March, and the key it produces is a perfectly valid
  // date, so checking the *shape* catches nothing. The day that was written
  // has to be the day that came back.
  const written: string[] = raw.match(/\b\d{1,2}\b/g) ?? [];
  if (!written.includes(String(when.getUTCDate()))) return null;
  const key = toKey(when);
  return isDateKey(key) ? key : null;
}

function pad(y: string, m: string, d: string): string | null {
  const key = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isDateKey(key) ? key : null;
}

/**
 * The scale a grade names for itself, or null when it names two.
 *
 * `V4` and `5.11a` are unambiguous. Every Font grade reads as a French one
 * and the other way about, so those come back null and the caller supplies
 * the discipline.
 */
export function selfScaling(text: string): GradeScale | null {
  const raw = text.trim();
  if (raw === '') return null;
  if (/^v\d/i.test(raw)) return 'V';
  if (/^5\./.test(raw)) return 'YDS';
  return null;
}

export function readResult(text: string): ClimbResult | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;
  if (['send', 'sent', 'redpoint', 'flash', 'onsight', 'on-sight', 'tick', 'yes', 'y', 'true', 'rp', 'os', 'fl'].includes(raw)) {
    return 'send';
  }
  if (['attempt', 'attempted', 'try', 'tries', 'fail', 'failed', 'dnf', 'no', 'n', 'false', 'project', 'working'].includes(raw)) {
    return 'attempt';
  }
  return null;
}

export function readMode(text: string): SessionMode | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;
  if (['outdoor', 'outdoors', 'outside', 'rock', 'crag', 'out'].includes(raw)) return 'outdoor';
  if (['indoor', 'indoors', 'inside', 'gym', 'wall', 'in'].includes(raw)) return 'indoor';
  return null;
}

export function readDiscipline(text: string): Discipline | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;
  if (['boulder', 'bouldering', 'boulders', 'problem', 'problems', 'b'].includes(raw)) return 'boulder';
  if (['route', 'routes', 'sport', 'lead', 'rope', 'ropes', 'trad', 'r'].includes(raw)) return 'route';
  return null;
}

export function readAngle(text: string): WallAngle | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;
  if (['slab', 'slabby', 'less than vertical'].includes(raw)) return 'slab';
  if (['vertical', 'vert', 'wall', 'face'].includes(raw)) return 'vertical';
  if (['overhang', 'overhanging', 'steep', 'overhung'].includes(raw)) return 'overhang';
  if (['roof', 'horizontal', 'cave'].includes(raw)) return 'roof';
  return null;
}

export function readRope(text: string): RopeStyle | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;
  if (['lead', 'leading', 'led', 'sport', 'trad'].includes(raw)) return 'lead';
  if (['toprope', 'top-rope', 'top rope', 'tr', 'seconding', 'second'].includes(raw)) return 'toprope';
  return null;
}

/**
 * How the ascent went, which is not the same question as whether it went.
 *
 * `result` says sent or tried; this says how. A cell the app does not know
 * — "worked", "hangdog" — is left unsaid rather than filed as a redpoint,
 * because a redpoint is a claim.
 */
export function readStyle(text: string): AscentStyle | null {
  const raw = text.trim().toLowerCase();
  if (raw === '') return null;
  if (['onsight', 'on-sight', 'on sight', 'os'].includes(raw)) return 'onsight';
  if (['flash', 'fl'].includes(raw)) return 'flash';
  if (['redpoint', 'red point', 'rp', 'pinkpoint', 'headpoint'].includes(raw)) return 'redpoint';
  return null;
}

/**
 * A benchmark this app records, by whatever the file calls it.
 *
 * Its id, its label, or either with the punctuation and spacing taken out
 * — so *Max Hang 20mm 7s*, *max_hang_20mm_7s* and *max hang 20 mm 7 s* are
 * the same benchmark. Exact after that flattening and never fuzzy: a
 * near-match written into the wrong benchmark is a wrong number in a chart
 * the climber will trust.
 */
export function findMetric(text: string): Metric | undefined {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = flat(text);
  if (wanted === '') return undefined;
  return Object.values(METRICS).find((m) => flat(m.id) === wanted || flat(m.label) === wanted);
}

/** A number a spreadsheet wrote, inside the bounds a field allows. */
export function readNumber(text: string, min: number, max: number): number | null {
  const raw = text.trim();
  if (raw === '') return null;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** A count, or one. A blank count is one climb, not zero climbs. */
export function readCount(text: string): number | null {
  const raw = text.trim();
  if (raw === '') return 1;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 1 || n > 200) return null;
  return Math.floor(n);
}

/** One row the importer could not read, named so it can be looked up. */
export interface RefusedRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  because: string;
}

export interface ImportCsvInput {
  /** What a row is. Climbs, which is what it always was, unless told. */
  kind?: CsvKind;
  rows: readonly (readonly string[])[];
  columns: readonly ColumnKind[];
  /** Used where the file has no discipline column, or leaves one blank. */
  assume?: Discipline;
  /**
   * The units the climber reads in, for benchmark values (PLAN.md M48).
   *
   * A spreadsheet says 80 and the app stores pounds, so a climber who reads
   * kilograms means kilograms — the same rule as typing it in. Where the
   * file carries a unit column that names one outright, the file wins.
   */
  units?: UnitSystem;
  /**
   * Session ids already in the log.
   *
   * An import is a **merge**, and a session's key is `${date}#${index}`. A
   * climber who logged Saturday in the app and also has Saturday in their
   * spreadsheet would otherwise have the logged one silently overwritten by
   * a row — data loss inside the one operation that promises not to lose
   * any. Imported days take the first free index instead, so the two sit
   * side by side and the climber decides.
   */
  occupied?: ReadonlySet<string>;
}

export interface ImportedCsv {
  sessions: Session[];
  /** Benchmark readings, for a file of those. */
  metrics: MetricEntry[];
  refused: RefusedRow[];
  /** Climbs that were read, across every session. */
  climbs: number;
  /** Exercises that were read, across every session. */
  exercises: number;
}

/** What a kind counts, for the line that says what would arrive. */
export function countOf(read: ImportedCsv, kind: CsvKind): { n: number; noun: string } {
  if (kind === 'exercises') return { n: read.exercises, noun: 'exercise' };
  if (kind === 'benchmarks') return { n: read.metrics.length, noun: 'reading' };
  return { n: read.climbs, noun: 'climb' };
}

const SCALE_OF: Record<Discipline, GradeScale> = { boulder: 'V', route: 'YDS' };

/** One day, gathering whatever kind of row the file holds. */
interface Day {
  climbs: Climb[];
  exercises: LoggedExercise[];
  mode?: SessionMode;
  place?: string;
  notes: string[];
}

/**
 * Rows into sessions, one session per day.
 *
 * A spreadsheet is a list and the app's unit is a day, so rows sharing a
 * date become one session. Mode and place come from the first row of the
 * day that states them; notes are joined, because a climber who wrote
 * something on three rows of one day meant all three.
 *
 * Benchmarks are the one kind that is not a session: a reading belongs to
 * its metric and its day, and inventing a session to hang it on would put
 * a training day in the log that nobody had.
 */
export function importCsv(input: ImportCsvInput): ImportedCsv {
  const kind = input.kind ?? 'climbs';
  const at = (row: readonly string[], column: ColumnKind): string => {
    const i = input.columns.indexOf(column);
    return i === -1 ? '' : (row[i] ?? '');
  };

  const byDate = new Map<string, Day>();
  const metrics: MetricEntry[] = [];
  const refused: RefusedRow[] = [];
  let climbs = 0;
  let exercises = 0;

  input.rows.forEach((row, i) => {
    // The header is line 1, so the first data row is line 2.
    const line = i + 2;
    const refuse = (because: string) => refused.push({ line, because });

    if (row.every((c) => c.trim() === '')) return;

    const date = readDate(at(row, 'date'));
    if (date === null) {
      refuse(`No date the app can read in "${at(row, 'date').trim()}".`);
      return;
    }

    const day = byDate.get(date) ?? { climbs: [], exercises: [], notes: [] };
    const keepNote = () => {
      const note = at(row, 'notes').trim();
      if (note !== '' && !day.notes.includes(note)) day.notes.push(note);
    };

    if (kind === 'benchmarks') {
      const named = at(row, 'metric').trim();
      const metric = findMetric(named);
      if (metric === undefined) {
        refuse(`"${named}" is not a benchmark this app records.`);
        return;
      }
      // The file's own unit wins where it names one, so the archive comes
      // back exactly; otherwise the number is read the way the climber
      // would have typed it.
      const stated = at(row, 'unit').trim().toLowerCase();
      const units: UnitSystem =
        stated === unitLabel(metric.unit, 'metric').toLowerCase() && stated !== unitLabel(metric.unit, 'imperial').toLowerCase()
          ? 'metric'
          : stated === unitLabel(metric.unit, 'imperial').toLowerCase()
            ? 'imperial'
            : (input.units ?? 'imperial');
      const parsed = parseMetricInput(metric, at(row, 'value'), units);
      if (!parsed.ok) {
        refuse(`${metric.label}: ${parsed.error}`);
        return;
      }
      const note = at(row, 'notes').trim();
      metrics.push({
        metricId: metric.id,
        date,
        value: parsed.value,
        ...(parsed.display ? { display: parsed.display } : {}),
        ...(note ? { note } : {}),
      });
      return;
    }

    if (kind === 'exercises') {
      const name = at(row, 'exercise').trim();
      if (name === '') {
        refuse('No exercise named on this row.');
        return;
      }
      // Every number optional and every number checked: a hangboard log
      // with a blank load column is a bodyweight log, and "12kg" in a cell
      // the app reads as a number is a cell to fix rather than to guess at.
      const numbers: [ColumnKind, keyof LoggedExercise, number, number][] = [
        ['sets', 'sets', 1, 99],
        ['reps', 'reps', 1, 999],
        ['hold', 'hold', 1, 3600],
        // Negative is assisted, which is how a climber works toward their
        // first one-arm anything (`LoggedExercise.load`).
        ['load', 'load', -500, 500],
      ];
      const exercise: LoggedExercise = { name };
      for (const [column, field, min, max] of numbers) {
        const text = at(row, column).trim();
        if (text === '') continue;
        const n = readNumber(text, min, max);
        if (n === null) {
          refuse(`"${text}" is not a ${field === 'hold' ? 'hold in seconds' : field === 'load' ? 'weight' : field} the app can read.`);
          return;
        }
        exercise[field] = n as never;
      }
      const note = at(row, 'notes').trim();
      if (note !== '') exercise.note = note;
      day.exercises.push(exercise);
      exercises += 1;
      byDate.set(date, day);
      return;
    }

    const gradeText = at(row, 'grade').trim();
    if (gradeText === '') {
      refuse('No grade on this row.');
      return;
    }

    const named = readDiscipline(at(row, 'discipline'));
    const scale = selfScaling(gradeText) ?? (named ? SCALE_OF[named] : input.assume ? SCALE_OF[input.assume] : null);
    if (scale === null) {
      refuse(`"${gradeText}" could be a boulder or a route and the file does not say which.`);
      return;
    }

    const grade = parseGrade(scale, gradeText);
    if (grade === null) {
      refuse(`"${gradeText}" is not a grade on the ${scale === 'V' ? 'V' : 'YDS'} ladder.`);
      return;
    }

    const count = readCount(at(row, 'count'));
    if (count === null) {
      refuse(`"${at(row, 'count').trim()}" is not a number of climbs.`);
      return;
    }

    // A row that says nothing about the result is a send: a climber logging
    // a grade in a spreadsheet is recording what they climbed. An attempt
    // has to be stated, which is the way round that cannot invent sends.
    const result = readResult(at(row, 'result')) ?? 'send';

    // The four M133 wrote into the archive and nothing could read back.
    // Each one absent rather than guessed: an unsaid angle is not vertical
    // and an unsaid style is not a redpoint.
    const name = at(row, 'name').trim();
    const angle = readAngle(at(row, 'angle'));
    const ropeStyle = readRope(at(row, 'rope'));
    const style = readStyle(at(row, 'style'));
    day.climbs.push({
      id: `csv-${date}-${day.climbs.length}`,
      grade,
      scale,
      count,
      result,
      ...(name ? { name } : {}),
      ...(angle ? { angle } : {}),
      ...(ropeStyle ? { ropeStyle } : {}),
      ...(style ? { style } : {}),
    });
    climbs += count;

    const mode = readMode(at(row, 'mode'));
    if (mode !== null && day.mode === undefined) day.mode = mode;
    const place = at(row, 'place').trim();
    if (place !== '' && day.place === undefined) day.place = place;
    keepNote();

    byDate.set(date, day);
  });

  const taken = input.occupied ?? new Set<string>();
  const freeIndex = (date: string): number => {
    let i = 0;
    while (taken.has(sessionId(date, i))) i++;
    return i;
  };

  const sessions = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, day]) =>
      newSession(date, freeIndex(date), {
        completed: true,
        // Imported history pays no XP. Five years cashed out at once is the
        // level-100-on-day-one the audit cut — and it counts for every stat,
        // the career, the pyramid and the altimeter, because height is a
        // fact about climbing and XP is pacing for a game.
        rewarded: true,
        imported: 'csv',
        climbs: day.climbs,
        ...(day.exercises.length ? { exercises: day.exercises } : {}),
        ...(day.mode ? { mode: day.mode } : {}),
        ...(day.place ? { fields: { location: day.place } } : {}),
        ...(day.notes.length ? { notes: day.notes.join('\n') } : {}),
      }),
    );

  return { sessions, metrics, refused, climbs, exercises };
}
