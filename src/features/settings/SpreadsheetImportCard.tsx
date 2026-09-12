import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  guessColumns,
  importCsv,
  selfScaling,
  type ColumnKind,
  type Discipline,
} from '@/engine/importCsv';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
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
  mode: 'Indoor or outdoor',
  place: 'Where',
  notes: 'Notes',
  skip: "Don't import",
};

const ORDER: ColumnKind[] = ['date', 'grade', 'result', 'count', 'discipline', 'mode', 'place', 'notes', 'skip'];

/** How many refusals to print before the rest become a count. */
const NAMED = 5;

export interface CsvPending {
  name: string;
  header: string[];
  rows: string[][];
  columns: ColumnKind[];
  assume: Discipline | null;
}

export function pendingFrom(name: string, table: string[][]): CsvPending {
  const [header = [], ...rows] = table;
  return { name, header: [...header], rows, columns: guessColumns(header), assume: null };
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
  onImport: (sessions: ReturnType<typeof importCsv>['sessions']) => void;
  onCancel: () => void;
}) {
  const read = useMemo(
    () =>
      importCsv({
        rows: pending.rows,
        columns: pending.columns,
        occupied,
        ...(pending.assume ? { assume: pending.assume } : {}),
      }),
    [pending.rows, pending.columns, pending.assume, occupied],
  );

  const hasDate = pending.columns.includes('date');
  const hasGrade = pending.columns.includes('grade');
  // Only worth asking where a grade in this file actually needs it: a log of
  // V grades and YDS says its own scale on every row.
  const gradeAt = pending.columns.indexOf('grade');
  const ambiguous =
    gradeAt !== -1 &&
    !pending.columns.includes('discipline') &&
    pending.rows.some((r) => {
      const cell = r[gradeAt]?.trim() ?? '';
      return cell !== '' && selfScaling(cell) === null;
    });

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
                {ORDER.map((kind) => (
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
        {!hasDate || !hasGrade ? (
          <p className="text-sm flex items-start gap-2">
            <TriangleAlert size={15} className="text-warn shrink-0 mt-0.5" aria-hidden />
            <span>
              Nothing can be read without a {!hasDate ? 'date' : 'grade'} column. Say which one
              it is above.
            </span>
          </p>
        ) : (
          <>
            <p className="text-sm">
              <span className="font-semibold">{read.sessions.length.toLocaleString()}</span> day
              {read.sessions.length === 1 ? '' : 's'} would arrive, carrying{' '}
              <span className="font-semibold">{read.climbs.toLocaleString()}</span> climb
              {read.climbs === 1 ? '' : 's'}.
            </p>
            <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
              They count for your grades, your pyramid, the career page and the altimeter. They
              pay no XP — five years cashed out at once is a level nobody climbed for.
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
        <Button
          disabled={busy || read.sessions.length === 0}
          onClick={() => onImport(read.sessions)}
        >
          Import {read.sessions.length.toLocaleString()} day
          {read.sessions.length === 1 ? '' : 's'}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
