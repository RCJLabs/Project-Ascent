import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { today } from '@/engine/dates';
import {
  describeInterruption,
  interruption,
  type AwayReason,
  type ResumeOption,
} from '@/engine/resume';
import { useProfile } from '@/store/profile';
import { useSessions, allSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';

/**
 * A block that noticed it was interrupted, asking what to do (PLAN.md M149).
 *
 * **Proposed, never applied.** The whole operation is one field — every week
 * in the app is derived from the block's start date — so the app could
 * silently slide the block back and the numbers would all agree. It does not,
 * because a block that rewrites itself while you are not looking is a block
 * you cannot trust to be the thing you read last week.
 *
 * **It asks why.** The app knows exactly how long the gap was and where in
 * the block it fell, and it cannot know the reason — and the three reasons
 * do not want the same answer. A fortnight's holiday costs very little; an
 * illness costs more than it feels like it did; and a climber whose fingers
 * are only now quiet should not re-enter at the week that hurt them. The
 * answer reorders the choices and changes the sentence; it never picks for
 * anyone.
 */
const REASONS: { value: AwayReason; label: string }[] = [
  { value: 'away', label: 'Away' },
  { value: 'ill', label: 'Ill' },
  { value: 'hurt', label: 'Hurt' },
];

export function PickItUp() {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const resumeBlock = useProfile((s) => s.resumeBlock);
  const resumedAt = useProfile((s) => s.resumedAt);
  const byDate = useSessions((s) => s.byDate);
  const [reason, setReason] = useState<AwayReason | undefined>(undefined);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  if (!program || !startDate || !activeProgramId) return null;

  const found = interruption({
    program,
    startDate,
    sessions: allSessions(byDate),
    today: today(),
    reason,
    resumedAt: activeProgramId ? resumedAt[activeProgramId] : undefined,
  });
  if (found === null) return null;

  const take = (option: ResumeOption) => resumeBlock(activeProgramId, option.shiftWeeks);

  return (
    <Card title="This block has moved on without you" className="mb-2">
      <p className="text-sm leading-relaxed">{describeInterruption(found, reason)}</p>

      <fieldset className="mt-3">
        <legend className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
          Why were you away?
        </legend>
        <div className="flex gap-2">
          {REASONS.map((r) => (
            <Chip
              key={r.value}
              active={reason === r.value}
              onClick={() => setReason(reason === r.value ? undefined : r.value)}
            >
              <span className="font-semibold">{r.label}</span>
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-2 mt-3">
        {found.options.map((option, i) => (
          <div key={option.kind} className="bg-sunken rounded-xl p-3">
            <p className="font-semibold text-sm flex items-start gap-2">
              <CalendarClock size={15} className="shrink-0 mt-0.5 text-accent" aria-hidden />
              {option.headline}
            </p>
            <p className="text-xs text-ink-soft mt-1 leading-relaxed">{option.body}</p>
            <Button
              size="sm"
              variant={i === 0 ? 'primary' : 'outline'}
              onClick={() => take(option)}
              className="mt-2.5"
            >
              Move the block here
            </Button>
          </div>
        ))}
      </div>

      {/* Doing nothing is a real answer and the card says so, because a
          climber who genuinely wants to carry on at week nine should not
          have to dismiss anything to do it. */}
      <p className="text-xs text-ink-soft mt-3 leading-relaxed">
        Or leave it. Carrying on means the next weeks ask for more than you have been doing, which
        is a choice rather than an accident once it is said out loud.
      </p>
    </Card>
  );
}
