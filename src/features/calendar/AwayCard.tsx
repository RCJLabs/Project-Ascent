import { useState } from 'react';
import { Plane, Trash2 } from 'lucide-react';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Field, Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import {
  AWAY_KINDS,
  AWAY_LABELS,
  type AwayKind,
  type AwayPeriod,
  awayLength,
  cleanNote,
  newAwayId,
  NOTE_LIMIT,
} from '@/engine/away';
import { fromKey } from '@/engine/dates';
import { useAway } from '@/store/away';
import { offerUndo } from '@/store/undo';

/**
 * Telling the app you were away (PLAN.md M275).
 *
 * It lives on the calendar and borrows the calendar's own gesture: the same
 * tapped days M100 uses for *"days you trained but did not log"*, read as a
 * range rather than as a list. The two belong together — they are the two
 * answers to the same question, and the coach's tip has been sending climbers
 * to this screen for one of them since M100.
 *
 * **First tap to last tap, everything between included.** A range is what the
 * record is, so the days in the middle do not need tapping and a climber who
 * taps only the ends gets what they meant. Said in the copy, because a picker
 * that quietly fills the gap would otherwise be a surprise.
 */
function span(from: string, to: string): string {
  const short = { day: 'numeric', month: 'short' } as const;
  const start = fromKey(from).toLocaleDateString(undefined, short);
  if (from === to) return start;
  return `${start} – ${fromKey(to).toLocaleDateString(undefined, { ...short, year: 'numeric' })}`;
}

export function AwayCard({ picked, onSaved }: { picked: Set<string>; onSaved: () => void }) {
  const periods = useAway((s) => s.periods);
  const save = useAway((s) => s.save);
  const remove = useAway((s) => s.remove);
  const [kind, setKind] = useState<AwayKind>('trip');
  const [note, setNote] = useState('');

  const dates = [...picked].sort();
  const from = dates[0];
  const to = dates.at(-1);

  /**
   * Taking a marker back, with the offer every destructive call in the app
   * makes — `ui/safety.test.ts` holds the rule, and it caught this missing.
   *
   * The whole record goes back rather than a flag flipping, which is why the
   * period is captured before the delete: `remove` takes an id, and the id is
   * all that would be left to put back.
   */
  async function drop(period: AwayPeriod): Promise<void> {
    await remove(period.id);
    offerUndo(period.note ?? AWAY_LABELS[period.kind], async () => {
      await save(period);
    });
  }

  async function add(): Promise<void> {
    if (from === undefined || to === undefined) return;
    await save({
      id: newAwayId(),
      from,
      to,
      kind,
      note: cleanNote(note),
      updatedAt: new Date().toISOString(),
    });
    setNote('');
    onSaved();
  }

  return (
    <Card className="mb-3">
      <h3 className="font-bold text-sm mb-1">Days you were away</h3>
      <p className="text-sm text-ink-soft leading-relaxed">
        Tap the first day and the last; everything between them counts. This adds no training and
        changes no number — it stops the app reading the quiet as a gap, and tells the coach which
        kind of quiet it was.
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        {AWAY_KINDS.map((k) => (
          <Chip key={k} active={k === kind} onClick={() => setKind(k)}>
            {AWAY_LABELS[k]}
          </Chip>
        ))}
      </div>

      <Field
        label="Call it something"
        hint="Optional. It is what the coach card and the grid will say."
        className="mt-3"
      >
        {(props) => (
          <Input
            {...props}
            size="compact"
            value={note}
            maxLength={NOTE_LIMIT}
            placeholder="Font '26"
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>

      {from !== undefined && to !== undefined && (
        <Button size="sm" className="mt-3" onClick={() => void add()}>
          <Plane size={15} /> Mark {span(from, to)} away
        </Button>
      )}

      {periods.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line pt-3">
          {periods.map((period: AwayPeriod) => (
            <li key={period.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 min-w-0">
                <span className="font-semibold">{period.note ?? AWAY_LABELS[period.kind]}</span>
                <span className="text-ink-soft">
                  {' · '}
                  {span(period.from, period.to)} · {awayLength(period)} day
                  {awayLength(period) === 1 ? '' : 's'}
                </span>
              </span>
              <IconButton onClick={() => void drop(period)} label={`Remove ${span(period.from, period.to)}`}>
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
