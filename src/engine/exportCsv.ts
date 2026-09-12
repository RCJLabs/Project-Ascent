/**
 * The same history, back out (PLAN.md M105b).
 *
 * M105 wrote `csv.ts` with `toCsv` and `csvCell` in it, tested and
 * round-tripped, and shipped nothing that called them. The archive is one
 * JSON file: exactly right for a restore, and useless to a climber who
 * wants their own sessions in a spreadsheet. The app's whole offline
 * argument rests on the data being *theirs*, and data you can only give
 * back to the program that wrote it is not quite theirs.
 *
 * **`backup.json` stays the statement of record.** These ride beside it in
 * the archive and are never read back by the restore. A second source of
 * truth is how two halves of one file start disagreeing; if the climber
 * imports a CSV, it goes through `importCsv.ts` as a foreign document like
 * anyone else's spreadsheet, with the same refusals.
 *
 * **Grades go out canonical, not as displayed.** A climber reading in Font
 * sees `7C` in the app and `V9` here, which looks like a translation error
 * until you try the alternative: Font and French are written identically
 * (M105's finding), so exporting the display spelling would write a file
 * this app cannot read back without asking which discipline every row is.
 * `V9` and `5.12c` say their own scale, so the round trip is closed.
 *
 * **One fact, one column.** No second spelling of a grade beside the first,
 * no total beside the things being totalled. A spreadsheet with the same
 * number twice is a spreadsheet where the two can differ.
 *
 * **And nothing here may throw.** These read rows straight out of the
 * database, which `db/health.ts` and `engine/dataHealth.ts` exist because
 * it can hold records the app cannot walk — a session with no `climbs`
 * array is a real thing a restored or half-written backup produces. An
 * export is the one operation whose failure costs the climber everything
 * they were trying to protect, so a malformed row contributes no rows
 * rather than taking the archive down with it.
 */

import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { METRICS } from '@/content/metrics';
import { toCsv } from './csv';
import { isRestSession } from './rest';

/** What `importCsv` reads, in the order its header guesser expects. */
export const CLIMB_HEADER = [
  'Date',
  'Discipline',
  'Grade',
  'Result',
  'Count',
  // Not "Style": that spelling is in `importCsv`'s *result* list, for logs
  // where one column holds redpoint/flash. Reading this file back, the
  // guesser would only pass it over because `Result` claimed that meaning
  // first — a right answer by column order is a wrong answer waiting for
  // someone to move a column.
  'Ascent style',
  'Mode',
  'Place',
  'Notes',
] as const;

export const SESSION_HEADER = [
  'Date',
  'Session',
  'Program',
  'Type',
  'Mode',
  'Completed',
  'RPE',
  'Minutes',
  'Warmup',
  'Drill',
  'Rest day',
  'Notes',
] as const;

export const ATTEMPT_HEADER = [
  'Date',
  'Project',
  'Grade',
  'Outcome',
  'From %',
  'High point %',
  'Burns',
  'Note',
] as const;

export const METRIC_HEADER = ['Date', 'Metric', 'Value', 'Unit', 'Shown as', 'Note'] as const;

const yesNo = (value: boolean | undefined): string => (value === undefined ? '' : value ? 'yes' : 'no');
const num = (value: number | undefined): string => (value === undefined ? '' : String(value));

/**
 * One cell, from a stored value the types promise and the database does not.
 *
 * `csvCell` takes a string and a record missing a field hands it
 * `undefined`, which throws on `.includes` — an export lost to one bad row.
 * The types are not wrong about what a `Session` *should* be; they are
 * wrong about what is on disk, which is what `dataHealth` is for.
 */
const cell = (value: unknown): string => (value === undefined || value === null ? '' : String(value));

/** Oldest first, because that is how a climber reads their own history. */
function chronological(sessions: readonly Session[]): Session[] {
  return [...sessions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** A list off a stored record, or none. Never a throw: see the note above. */
function listOf<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Every climb, one per row — the file this app can read back.
 *
 * `Discipline` is written even though `V…` and `5.…` already say their
 * scale: a spreadsheet is also read by people, and "boulder" is the column
 * a climber sorts on.
 */
export function climbsCsv(sessions: readonly Session[]): string {
  const rows: string[][] = [[...CLIMB_HEADER]];
  for (const session of chronological(sessions)) {
    for (const climb of listOf(session.climbs)) {
      rows.push([
        cell(session.date),
        climb.scale === 'V' ? 'boulder' : 'route',
        cell(climb.grade),
        cell(climb.result),
        cell(climb.count),
        cell(climb.style),
        cell(session.mode),
        cell(session.fields?.location),
        cell(session.notes),
      ]);
    }
  }
  return toCsv(rows);
}

export interface SessionCsvInput {
  sessions: readonly Session[];
  /** Program and session-type names, so a row reads without the app. */
  nameOf?: (programId: string | undefined, typeId: string | undefined) => [string, string];
}

/**
 * Every session, one per row.
 *
 * Not importable, and not meant to be: this is the RPE, the duration and
 * the warmup — everything `climbsCsv` has no column for because a climb is
 * not a session. A climber asking "how many hours last year" reads this one.
 */
export function sessionsCsv(input: SessionCsvInput): string {
  const nameOf = input.nameOf ?? (() => ['', '']);
  const rows: string[][] = [[...SESSION_HEADER]];
  for (const session of chronological(input.sessions)) {
    const [program, type] = nameOf(session.programId, session.sessionTypeId);
    rows.push([
      cell(session.date),
      // The index within the day, so two sessions on one date are two rows
      // a reader can tell apart.
      String(Number(cell(session.id).split('#')[1] ?? 0) + 1),
      cell(program),
      cell(type),
      cell(session.mode),
      yesNo(session.completed),
      num(session.rpe),
      num(session.durationMin),
      yesNo(session.warmup),
      session.drillDone === true ? cell(session.drillId ?? 'yes') : '',
      // The rest-day rule spelled out rather than `isRestSession`, which
      // reads `session.climbs.length` and throws on the malformed record
      // this file must survive. Not a fourteenth copy by accident — the one
      // place the shared helper cannot be used.
      yesNo(isRestSession(session)),
      cell(session.notes),
    ]);
  }
  return toCsv(rows);
}

/** Every burn on a tracked project, with the project named rather than keyed. */
export function attemptsCsv(sessions: readonly Session[], projects: readonly Project[]): string {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const rows: string[][] = [[...ATTEMPT_HEADER]];
  for (const session of chronological(sessions)) {
    for (const attempt of listOf(session.projectAttempts)) {
      const project = byId.get(attempt.projectId);
      rows.push([
        cell(session.date),
        cell(project?.name ?? attempt.projectId),
        cell(project?.grade),
        cell(attempt.outcome),
        // Absent means the ground for every burn but `worked` (M102), and
        // the export says nothing the record does not.
        num(attempt.from),
        num(attempt.highPoint),
        cell(attempt.count),
        cell(attempt.note),
      ]);
    }
  }
  return toCsv(rows);
}

/** Every benchmark reading, with its unit, because 20 of what is the question. */
export function metricsCsv(entries: readonly MetricEntry[]): string {
  const rows: string[][] = [[...METRIC_HEADER]];
  const sorted = [...listOf(entries)].sort((a, b) =>
    a.date === b.date ? (a.metricId < b.metricId ? -1 : 1) : a.date < b.date ? -1 : 1,
  );
  for (const entry of sorted) {
    const metric = METRICS[entry.metricId];
    rows.push([
      cell(entry.date),
      cell(metric?.label ?? entry.metricId),
      cell(entry.value),
      cell(metric?.unit),
      cell(entry.display),
      cell(entry.note),
    ]);
  }
  return toCsv(rows);
}

/** Where each one sits inside the archive. */
export const CSV_DIR = 'spreadsheets/';
export const CSV_FILES = {
  climbs: `${CSV_DIR}climbs.csv`,
  sessions: `${CSV_DIR}sessions.csv`,
  attempts: `${CSV_DIR}attempts.csv`,
  metrics: `${CSV_DIR}benchmarks.csv`,
} as const;
