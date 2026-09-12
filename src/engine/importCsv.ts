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
 */

import type { Climb, ClimbResult, Session, SessionMode } from '@/db/sessions';
import { newSession, sessionId } from '@/db/sessions';
import { isDateKey, toKey } from './dates';
import { parseGrade, type GradeScale } from './grades';

export type Discipline = 'boulder' | 'route';

/** What a column holds. `skip` is a column the climber has waved away. */
export type ColumnKind =
  | 'date'
  | 'grade'
  | 'result'
  | 'count'
  | 'discipline'
  | 'mode'
  | 'place'
  | 'notes'
  | 'skip';

/** A column the importer will fill in from nothing if it has to. */
export const OPTIONAL: ColumnKind[] = ['result', 'count', 'discipline', 'mode', 'place', 'notes'];

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
  notes: ['notes', 'note', 'comment', 'comments', 'description'],
};

/** The importer's first guess at what each column is. */
export function guessColumns(header: readonly string[]): ColumnKind[] {
  const taken = new Set<ColumnKind>();
  return header.map((raw) => {
    const name = raw.trim().toLowerCase();
    for (const [kind, spellings] of Object.entries(HEADERS) as [Exclude<ColumnKind, 'skip'>, string[]][]) {
      // One column per kind: a file with `date` and `session date` gets the
      // first, and the climber moves it if the first was wrong.
      if (taken.has(kind)) continue;
      if (spellings.includes(name)) {
        taken.add(kind);
        return kind;
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
  rows: readonly (readonly string[])[];
  columns: readonly ColumnKind[];
  /** Used where the file has no discipline column, or leaves one blank. */
  assume?: Discipline;
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
  refused: RefusedRow[];
  /** Climbs that were read, across every session. */
  climbs: number;
}

const SCALE_OF: Record<Discipline, GradeScale> = { boulder: 'V', route: 'YDS' };

/**
 * Rows into sessions, one session per day.
 *
 * A spreadsheet is a list of climbs and the app's unit is a day, so rows
 * sharing a date become one session. Mode and place come from the first row
 * of the day that states them; notes are joined, because a climber who wrote
 * something on three rows of one day meant all three.
 */
export function importCsv(input: ImportCsvInput): ImportedCsv {
  const at = (row: readonly string[], kind: ColumnKind): string => {
    const i = input.columns.indexOf(kind);
    return i === -1 ? '' : (row[i] ?? '');
  };

  const byDate = new Map<string, { climbs: Climb[]; mode?: SessionMode; place?: string; notes: string[] }>();
  const refused: RefusedRow[] = [];
  let climbs = 0;

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

    const day = byDate.get(date) ?? { climbs: [], notes: [] };
    day.climbs.push({ id: `csv-${date}-${day.climbs.length}`, grade, scale, count, result });
    climbs += count;

    const mode = readMode(at(row, 'mode'));
    if (mode !== null && day.mode === undefined) day.mode = mode;
    const place = at(row, 'place').trim();
    if (place !== '' && day.place === undefined) day.place = place;
    const note = at(row, 'notes').trim();
    if (note !== '' && !day.notes.includes(note)) day.notes.push(note);

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
        ...(day.mode ? { mode: day.mode } : {}),
        ...(day.place ? { fields: { location: day.place } } : {}),
        ...(day.notes.length ? { notes: day.notes.join('\n') } : {}),
      }),
    );

  return { sessions, refused, climbs };
}
