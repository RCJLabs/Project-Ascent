import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';

import type { Exercise } from '@/content/types';
import type { LoggedExercise } from '@/db/sessions';
import { describeEntry, hasNumbers, type Dimension } from '@/engine/exerciseLog';
import { fromInput, toDisplay, unitLabel, type UnitSystem } from '@/engine/units';
import { shortLabel } from '@/engine/dates';
import { Chip } from '@/ui/Chip';
import { Input } from '@/ui/Field';

/**
 * The numbers under a ticked exercise (PLAN.md M98).
 *
 * **Which boxes appear is decided by the prescription, not by the field
 * list.** An exercise that declares sets and reps gets two boxes; Iron Grip's
 * Max Hangs, which declares sets, a hold and a load, gets three; a menu item
 * with no dose at all gets none, because there is nothing there to record and
 * a row of empty boxes on every line is how a logger becomes unusable. That
 * also keeps the untouched path untouched: nothing renders until the
 * exercise is ticked, so an unticked session costs exactly what it did.
 *
 * **Nothing is pre-filled.** The prescription's dose is prose — `'3-5'`,
 * `'85-90% max added weight'` — and turning that into a starting value would
 * write a number into the log that nobody did. What is offered instead is
 * *last time*, which is a number the climber made, behind a tap: the tap is
 * what makes it a claim, the same line `templates.ts` draws when it refuses
 * to copy climbs forward.
 */

/** Which boxes this exercise's own prescription justifies. */
export function dimensionsFor(exercise: Exercise): Dimension[] {
  const out: Dimension[] = [];
  if (exercise.sets !== undefined) out.push('sets');
  if (exercise.reps !== undefined) out.push('reps');
  if (exercise.hold !== undefined) out.push('hold');
  if (exercise.load !== undefined) out.push('load');
  return out;
}

const LABEL: Record<Dimension, string> = {
  sets: 'Sets',
  reps: 'Reps',
  hold: 'Hold',
  load: 'Load',
};

/**
 * One number box.
 *
 * The text is local so a half-typed "22." survives the keystroke that
 * produced it — a controlled input fed straight from the stored number
 * rewrites `22.` to `22` under the cursor. It is pushed back from the store
 * only when the stored value is genuinely something else, which is what
 * "Same again" does.
 */
function NumberBox({
  dimension,
  value,
  units,
  onChange,
}: {
  dimension: Dimension;
  value: number | undefined;
  units: UnitSystem;
  onChange: (next: number | undefined) => void;
}) {
  const shown = (v: number) => (dimension === 'load' ? toDisplay(Math.abs(v), 'lbs', units) : v);
  const [text, setText] = useState(() => (value === undefined ? '' : String(shown(value))));

  useEffect(() => {
    const parsed = text === '' ? undefined : Number(text);
    const current = value === undefined ? undefined : shown(value);
    if (parsed !== current && !(parsed !== undefined && Number.isNaN(parsed))) {
      setText(current === undefined ? '' : String(current));
    }
    // `text` is deliberately not a dependency: the climber's own typing must
    // not re-run this and overwrite itself. Only a stored value that has
    // become something else — "Same again", or a unit switch — pushes back.
  }, [value, units]);

  const negative = dimension === 'load' && value !== undefined && value < 0;

  const commit = (raw: string) => {
    setText(raw);
    if (raw === '') return onChange(undefined);
    const typed = Number(raw);
    if (Number.isNaN(typed)) return;
    const magnitude = dimension === 'load' ? fromInput(Math.abs(typed), 'lbs', units) : typed;
    onChange(dimension === 'load' && negative ? -magnitude : magnitude);
  };

  const suffix =
    dimension === 'load' ? unitLabel('lbs', units) : dimension === 'hold' ? 'sec' : '';

  return (
    <label className="flex-1 min-w-[4.5rem]">
      <span className="block text-2xs font-bold uppercase tracking-wide text-ink-soft mb-0.5">
        {LABEL[dimension]}
        {suffix && <span className="font-normal normal-case tracking-normal"> ({suffix})</span>}
      </span>
      <Input
        type="number"
        size="compact"
        min={dimension === 'load' ? undefined : 0}
        value={text}
        placeholder="—"
        onChange={(e) => commit(e.target.value)}
      />
    </label>
  );
}

export interface ExerciseNumbersProps {
  exercise: Exercise;
  entry: LoggedExercise;
  units: UnitSystem;
  /** The newest earlier reading of this exercise, when there is one. */
  last: { date: string; entry: LoggedExercise } | null;
  onChange: (next: LoggedExercise) => void;
}

export function ExerciseNumbers({ exercise, entry, units, last, onChange }: ExerciseNumbersProps) {
  const dimensions = dimensionsFor(exercise);
  if (dimensions.length === 0) return null;

  const assisted = entry.load !== undefined && entry.load < 0;
  const lastLine = last && hasNumbers(last.entry) ? describeEntry(last.entry, units) : null;

  return (
    <div className="mt-2 pt-2 border-t border-line">
      <div className="flex flex-wrap items-end gap-2">
        {dimensions.map((dimension) => (
          <NumberBox
            key={dimension}
            dimension={dimension}
            value={entry[dimension]}
            units={units}
            onChange={(next) => {
              const { [dimension]: _drop, ...rest } = entry;
              onChange(next === undefined ? rest : { ...rest, [dimension]: next });
            }}
          />
        ))}
        {/* The keypad has no minus sign — `Input` says so in as many words —
            and weight taken off is how a climber works toward their first
            one-arm anything. So the sign is a control rather than a
            character. */}
        {dimensions.includes('load') && (
          <Chip
            active={assisted}
            disabled={entry.load === undefined || entry.load === 0}
            onClick={() => onChange({ ...entry, load: -(entry.load ?? 0) })}
            className="text-xs font-bold uppercase tracking-wide"
          >
            {assisted ? 'Assisted' : 'Added'}
          </Chip>
        )}
      </div>

      {lastLine && (
        // Wrapping rather than truncating: at 430px the chip took the row and
        // left "Sep 4: 5 × …", which is the one line on the card whose whole
        // job is to say what the numbers were. Found in a browser; jsdom has
        // no layout and reported it as present either way.
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mt-2">
          <p className="text-xs text-ink-soft">
            {shortLabel(last!.date)}: {lastLine}
          </p>
          <Chip
            active={false}
            onClick={() => onChange({ ...last!.entry, name: entry.name })}
            className="shrink-0 text-xs font-bold uppercase tracking-wide"
          >
            <RotateCcw size={12} />
            Same again
          </Chip>
        </div>
      )}
    </div>
  );
}
