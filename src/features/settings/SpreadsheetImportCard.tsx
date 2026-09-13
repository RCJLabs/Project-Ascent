import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  COLUMNS,
  countOf,
  guessColumns,
  guessKind,
  importCsv,
  REQUIRED,
  selfScaling,
  type ColumnKind,
  type CsvKind,
  type Discipline,
} from '@/engine/importCsv';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip, OptionCard } from '@/ui/Chip';
import { Select } from '@/ui/Field';

/**
 * What this spreadsheet says, before any of it is written (PLAN.md M105).
 *
 * The same stance as M20's backup preview: the two words "replace" and
 * "merge" mean nothing until you know what they would do, so the numbers
 * come first. Here the numbers move as the climber corrects the column
 * mapping, which is what makes a wrong guess free — the preview *is* the
 * confirmation step, not a screen in front of one.
 *
 * **Refusals are named, not counted.** A spreadsheet five years deep will
 * have bad rows in it, and "412 rows imported, 9 skipped" is a number
 * nobody can act on. Each refusal carries its line and its reason, so it
 * can be looked up in the file it came from.
 */

const LABEL: Record<ColumnKind, string> = {
  date: 'Date',
  grade: 'Grade',
  result: 'Sent or tried',
  count: 'How many',
  discipline: 'Boulder or route',
  mode: 'Indoor/outdoor',
  place: 'Where',
  name: 'Climb name',
  angle: 'Wall angle',
  rope: 'Lead or top-rope',
  style: 'Ascent style',
  exercise: 'Exercise',
  sets: 'Sets',
  reps: 'Reps',
  hold: 'Hold (seconds)',
  load: 'Weight',
  metric: 'Benchmark',
  value: 'Result',
  unit: 'Unit',
  notes: 'Notes',
  skip: "Don't import",
};

/** What each kind of file is, in the words the question asks. */
const KINDS: { kind: CsvKind; label: string; blurb: string }[] = [
  { kind: 'climbs', label: 'Climbs', blurb: 'A tick list — one row per climb, with its grade.' },
  { kind: 'exercises', label: 'Exercises', blurb: 'A hangboard or gym log — sets, reps, hold, weight.' },
  { kind: 'benchmarks', label: 'Benchmarks', blurb: 'Max hangs, dead hangs, pull-ups — a number per test.' },
];

/** How many refusals to print before the rest become a count. */
const NAMED = 5;

/** "a grade", "an exercise" — the column names are data, so this is too. */
const article = (word: string): string => `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;

export interface CsvPending {
  name: string;
  /** What a row is (PLAN.md M139). Guessed from the header, changeable. */
  kind: CsvKind;
  header: string[];
  rows: string[][];
  columns: ColumnKind[];
  assume: Discipline | null;
}

export function pendingFrom(name: string, table: string[][]): CsvPending {
  const [header = [], ...rows] = table;
  const kind = guessKind(header);
  return { name, kind, header: [...header], rows, columns: guessColumns(header, kind), assume: null };
}

/** What arrives, in the words of the kind of file it is. */
export interface CsvResult {
  sessions: ReturnType<typeof importCsv>['sessions'];
  metrics: ReturnType<typeof importCsv>['metrics'];
}

export function SpreadsheetImportCard({
  pending,
  occupied,
  busy,
  onChange,
  onImport,
  onCancel,
}: {
  pending: CsvPending;
  /** Session ids already in the log, so an import never lands on one. */
  occupied: ReadonlySet<string>;
  busy: boolean;
  onChange: (next: CsvPending) => void;
  onImport: (read: CsvResult) => void;
  onCancel: () => void;
}) {
  const units = useSettings((s) => s.units);
  const read = useMemo(
    () =>
      importCsv({
        kind: pending.kind,
        rows: pending.rows,
        columns: pending.columns,
        occupied,
        units,
        ...(pending.assume ? { assume: pending.assume } : {}),
      }),
    [pending.kind, pending.rows, pending.columns, pending.assume, occupied, units],
  );

  const missing = REQUIRED[pending.kind].filter((c) => !pending.columns.includes(c));
  // Only worth asking where a grade in this file actually needs it: a log of
  // V grades and YDS says its own scale on every row. No check on the kind:
  // only a tick list is offered a grade column at all, so a gym log's
  // `indexOf` is already -1 (PLAN.md M139).
  const gradeAt = pending.columns.indexOf('grade');
  const ambiguous =
    gradeAt !== -1 &&
    !pending.columns.includes('discipline') &&
    pending.rows.some((r) => {
      const cell = r[gradeAt]?.trim() ?? '';
      return cell !== '' && selfScaling(cell) === null;
    });
  const arriving = countOf(read, pending.kind);
  /**
   * What the button offers to import, which is not always a day.
   *
   * A benchmark reading belongs to its metric and its date and adds no
   * training day at all, so a sheet of them would otherwise offer "Import
   * 0 days" — a sentence that reads like a refusal.
   */
  const landing =
    pending.kind === 'benchmarks' ? arriving : { n: read.sessions.length, noun: 'day' };
  const nothing = landing.n === 0;

  const set = (index: number, kind: ColumnKind) => {
    const columns = [...pending.columns];
    // One column per meaning, the same rule the guess follows — otherwise
    // two `date` columns make the second silently unreachable.
    if (kind !== 'skip') {
      const clash = columns.indexOf(kind);
      if (clash !== -1 && clash !== index) columns[clash] = 'skip';
    }
    columns[index] = kind;
    onChange({ ...pending, columns });
  };

  return (
    <Card title="Import this spreadsheet?">
      <p className="text-sm text-ink-soft leading-relaxed">{pending.name}</p>

      {/* What a row is, asked before what each column holds — because the
          answer decides which columns there are to name (PLAN.md M139). */}
      <fieldset className="mt-3">
        <legend className="text-sm text-ink-soft mb-1.5">What is this a list of?</legend>
        <div className="grid grid-cols-1 gap-2">
          {KINDS.map((k) => (
            <OptionCard
              key={k.kind}
              active={pending.kind === k.kind}
              onClick={() =>
                onChange({
                  ...pending,
                  kind: k.kind,
                  // The columns are re-guessed rather than kept: they mean
                  // different things per kind, and a `grade` column on a
                  // hangboard log is a column that cannot be named.
                  columns: guessColumns(pending.header, k.kind),
                })
              }
              label={k.label}
              blurb={k.blurb}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-3 grid grid-cols-1 gap-2">
        {pending.header.map((name, i) => (
          <div key={`${name}-${i}`} className="flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate text-sm font-semibold">
              {name.trim() === '' ? `Column ${i + 1}` : name}
            </span>
            {/* A sized wrapper, not `w-40` on the control: `CONTROL` sets
                `w-full` and the two are a coin flip Tailwind's emit order
                decides. Losing it rendered six full-width dropdowns with
                every column name squeezed to nothing (PLAN.md M105). */}
            <div className="w-40 shrink-0">
              <Select
                size="compact"
                value={pending.columns[i] ?? 'skip'}
                onChange={(e) => set(i, e.target.value as ColumnKind)}
                aria-label={`What is in "${name.trim() === '' ? `Column ${i + 1}` : name}"?`}
              >
                {COLUMNS[pending.kind].map((kind) => (
                  <option key={kind} value={kind}>
                    {LABEL[kind]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ))}
      </div>

      {ambiguous && (
        <fieldset className="mt-3">
          <legend className="text-sm text-ink-soft mb-1.5">
            Are these boulders or routes?
          </legend>
          <p className="text-xs text-ink-soft mb-2 leading-relaxed">
            Font and French grades are written the same way — 7c is a V9 boulder and a 5.12c
            route, and the file does not say which. Grades written V4 or 5.11a are read on
            sight either way.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['boulder', 'route'] as const).map((d) => (
              <Chip
                key={d}
                active={pending.assume === d}
                onClick={() => onChange({ ...pending, assume: d })}
              >
                {d === 'boulder' ? 'Boulders' : 'Routes'}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-3 rounded-xl bg-sunken p-3">
        {missing.length > 0 ? (
          <p className="text-sm flex items-start gap-2">
            <TriangleAlert size={15} className="text-warn shrink-0 mt-0.5" aria-hidden />
            <span>
              Nothing can be read without {article(LABEL[missing[0]!].toLowerCase())} column. Say
              which one it is above.
            </span>
          </p>
        ) : pending.kind === 'benchmarks' ? (
          <>
            <p className="text-sm">
              <span className="font-semibold">{arriving.n.toLocaleString()}</span> {arriving.noun}
              {arriving.n === 1 ? '' : 's'} would arrive.
            </p>
            <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
              They go where the ones you take in the app go: the assessment charts, the strength
              curve, and the before-and-after a block report compares.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold">{read.sessions.length.toLocaleString()}</span> day
              {read.sessions.length === 1 ? '' : 's'} would arrive, carrying{' '}
              <span className="font-semibold">{arriving.n.toLocaleString()}</span> {arriving.noun}
              {arriving.n === 1 ? '' : 's'}.
            </p>
            <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
              {pending.kind === 'exercises'
                ? 'They sit beside anything already logged on those days rather than over it, and they carry the load history the strength charts read.'
                : 'They count for your grades, your pyramid, the career page and the altimeter.'}{' '}
              They pay no XP — five years cashed out at once is a level nobody climbed for.
            </p>
          </>
        )}

        {read.refused.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-line">
            <p className="text-sm text-warn font-semibold">
              {read.refused.length.toLocaleString()} row
              {read.refused.length === 1 ? '' : 's'} cannot be read
            </p>
            <ul className="mt-1 grid grid-cols-1 gap-0.5">
              {read.refused.slice(0, NAMED).map((r) => (
                <li key={r.line} className="text-xs text-ink-soft leading-relaxed">
                  <span className="font-semibold">Line {r.line}:</span> {r.because}
                </li>
              ))}
            </ul>
            {read.refused.length > NAMED && (
              <p className="text-xs text-ink-soft mt-1">
                And {(read.refused.length - NAMED).toLocaleString()} more. Everything else still
                imports.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button disabled={busy || nothing} onClick={() => onImport(read)}>
          {`Import ${landing.n.toLocaleString()} ${landing.noun}${landing.n === 1 ? '' : 's'}`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
