import { useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { RETURN_DISCLAIMER } from '@/content/returnToClimbing';
import { fromKey, shortLabel, today } from '@/engine/dates';
import { badDays, describeInjuryHistory, injuryHistory } from '@/engine/injuryLog';
import { useSessions } from '@/store/sessions';
import { PROGRAMS as programs } from '@/content/programs';
import type { TissueFeel } from '@/engine/readiness';
import { describeInjury } from '@/engine/injury';
import { addStep, progress, removeStep, stepsFor, toggleStep } from '@/engine/returnPlan';
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  useProfile,
  type InjurySeverity,
  type InjuryStatus,
} from '@/store/profile';
import { offerUndo } from '@/store/undo';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { OptionCard } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Checkbox, Input, TextArea } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';
import { PageSkeleton } from '@/ui/Skeleton';

/**
 * One injury, and the climber's own record of coming back from it.
 *
 * The disclaimer sits above the list rather than below it, and is not
 * collapsible: it is the first thing read, every time, because the list
 * underneath is a memory aid that could otherwise be mistaken for a plan.
 */
/**
 * A tint per answer, behind a chip that says the answer in words.
 *
 * **Not coloured text.** `themes.test.ts` holds the status colours to
 * **3:1** against a surface — *"graphics rather than text, so 3:1 is the
 * bar"* — and painting them as 11px words on a tint of themselves measured
 * 3.72, 3.99 and 4.47 in light mode, three AA failures out of tokens every
 * palette test passes. `ui.test.ts` holds that pairing shut now.
 *
 * **And not a signal either.** Measured against the card it sits on, the
 * tint is 1.06:1 in dark and 1.41:1 in light — decoration, a long way under
 * the 3:1 the app asks of a graphic that means something. So the word does
 * all of the work and the tint only reinforces it, which is the one job it
 * can honestly hold. `warn` is a fifth heavier because amber tints least
 * against a light card, not because niggly matters more.
 */
const FEEL_TONE: Record<TissueFeel, string> = {
  good: 'bg-positive/15',
  tender: 'bg-warn/20',
  sore: 'bg-danger/15',
};

const FEEL_WORD: Record<TissueFeel, string> = { good: 'fine', tender: 'niggly', sore: 'worse' };

/**
 * How many answers the strip shows.
 *
 * An injury logged in January and answered about all year is hundreds of
 * chips, which is a wall rather than a picture. The counts above the strip
 * are all of them; the strip is the recent shape, and says when it is a
 * slice.
 */
const STRIP = 14;

export function InjuryPage({ params }: { params: { id: string } }) {
  const injuries = useProfile((s) => s.injuries);
  const hydrated = useProfile((s) => s.hydrated);
  const updateInjury = useProfile((s) => s.updateInjury);
  const removeInjury = useProfile((s) => s.removeInjury);
  const restoreInjury = useProfile((s) => s.restoreInjury);
  const byDate = useSessions((s) => s.byDate);
  const sessionsReady = useSessions((s) => s.hydrated);
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState('');

  const injury = injuries.find((i) => i.id === params.id);

  if (!hydrated || !sessionsReady) return <PageSkeleton title="Injury" />;
  if (!injury) {
    return (
      <RecordNotFound what="That injury record" backTo="/climber" backLabel="Back to your climber">
        Recovered injuries are cleared from the tracker.
      </RecordNotFound>
    );
  }

  const steps = stepsFor(injury);
  const { done, total } = progress(injury);
  // How it has been, which nothing recorded before M103.
  const sessions = Object.values(byDate).flat();
  const nameOf = (id: string): string | undefined =>
    programs.flatMap((p) => p.sessionTypes).find((t) => t.id === id)?.name;
  const history = injuryHistory({ part: injury.part, since: injury.since, sessions, to: today() });
  const bad = badDays(history, sessions, nameOf);
  // Null until something has been answered, so the card is not an empty
  // heading over nothing — which is what a `history !== null` gate gave,
  // since the reading is always an object.
  const said = describeInjuryHistory(history);

  return (
    <>
      <BackLink />
      <PageHeader
        title={injury.part.charAt(0).toUpperCase() + injury.part.slice(1)}
        subtitle={`${describeInjury(injury)} · since ${fromKey(injury.since).toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
        })}`}
      />

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="text-warn shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">{RETURN_DISCLAIMER}</p>
          </div>
        </Card>

        <Card title="How it is">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(Object.keys(SEVERITY_LABEL) as InjurySeverity[]).map((level) => (
              <OptionCard
                key={level}
                active={injury.severity === level}
                onClick={() => updateInjury(injury.id, { severity: level })}
                label={SEVERITY_LABEL[level].label}
                blurb={SEVERITY_LABEL[level].blurb}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_LABEL) as InjuryStatus[]).map((state) => (
              <OptionCard
                key={state}
                active={injury.status === state}
                onClick={() => updateInjury(injury.id, { status: state })}
                label={STATUS_LABEL[state].label}
                blurb={STATUS_LABEL[state].blurb}
              />
            ))}
          </div>
        </Card>

        {/* How it has been, which nothing recorded before M103. The counts
            first, then the bad days with what was logged around them — and
            no ratio, because two counts side by side are a causal claim
            however they are worded. */}
        {said !== null && (
          <Card title="How it has been">
            <p className="text-sm leading-relaxed">{said}</p>
            {/* The word, not only the colour. Red-amber-green is a
                convention and not a reading: a chip that says only SEP 3
                means nothing to anyone who cannot separate the three, and
                the app puts the alternative in the element rather than in a
                `title` no phone will ever show. */}
            <ul className="flex flex-wrap gap-1.5 mt-3" aria-label="How it felt, by day">
              {history.days.slice(-STRIP).map((d) => (
                <li
                  key={d.date}
                  className={`text-2xs font-bold uppercase tracking-wide rounded-md px-1.5 py-1 ${FEEL_TONE[d.feel]}`}
                >
                  {shortLabel(d.date)} {FEEL_WORD[d.feel]}
                </li>
              ))}
            </ul>
            {history.days.length > STRIP && (
              <p className="text-xs text-ink-soft mt-2">
                The last {STRIP} answers. The counts above are all {history.days.length}.
              </p>
            )}
            {bad.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line">
                <h3 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-2">
                  The days it was worse
                </h3>
                <ul className="grid grid-cols-1 gap-2">
                  {bad.map((day) => (
                    <li key={day.date} className="bg-sunken rounded-xl px-3 py-2">
                      <div className="font-semibold text-sm">{shortLabel(day.date)}</div>
                      <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                        {day.before.length > 0 ? `The day before: ${day.before.join(', ')}. ` : ''}
                        {day.after.length > 0 ? `That day: ${day.after.join(', ')}.` : ''}
                        {day.before.length === 0 && day.after.length === 0
                          ? 'Nothing logged either side of it.'
                          : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                  What was logged around each, not a cause. The app knows what you logged and
                  nothing at all about the rest of your week.
                </p>
              </div>
            )}
          </Card>
        )}

        <Card title="What you were told">
          <p className="text-sm text-ink-soft mb-2 leading-relaxed">
            If someone qualified has seen it, write down what they actually said. Their words are
            worth more than anything here, and this is a place they will not get lost.
          </p>
          <TextArea
            value={injury.clinicalNote ?? ''}
            onChange={(e) => updateInjury(injury.id, { clinicalNote: e.target.value || undefined })}
            rows={3}
            placeholder="What they said, and anything they asked you to watch for"
            aria-label="What a clinician said"
            className="resize-y"
          />
        </Card>

        <Card title="Coming back">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Things climbers tend to notice on the way back, as questions rather than instructions.
            Ticking them earns nothing and unlocks nothing — they are here so you can be honest with
            yourself over months rather than relying on how today happens to feel.
          </p>

          <ul className="grid grid-cols-1 gap-2 mb-3">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2.5 bg-sunken rounded-xl px-3 py-2.5">
                <Checkbox
                  checked={step.done}
                  onChange={() => updateInjury(injury.id, toggleStep(injury, step.id))}
                  label={step.text}
                  className="flex-1"
                />
                <IconButton
                  onClick={() => updateInjury(injury.id, removeStep(injury, step.id))}
                  label={`Remove: ${step.text}`}
                >
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draft.trim()) {
                  updateInjury(injury.id, addStep(injury, draft));
                  setDraft('');
                }
              }}
              placeholder="Add your own, or your physio's"
              aria-label="New checklist item"
              className="flex-1 min-w-0"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!draft.trim()) return;
                updateInjury(injury.id, addStep(injury, draft));
                setDraft('');
              }}
            >
              <Plus size={14} /> Add
            </Button>
          </div>

          <p className="text-xs text-ink-soft mt-3">
            {done} of {total} noted. That is a count, not a verdict.
          </p>
        </Card>

        <Card title="When it is behind you">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Marking it healed removes it here and stops it changing your warmups, the finder and your
            vitality. Your notes go with it.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              // Whole record back on undo — notes and return ticks included
              // — not a fresh injury with a new id (PLAN.md M79).
              const healed = injury;
              removeInjury(healed.id);
              offerUndo(`${healed.side && healed.part !== 'back' ? `${healed.side} ` : ''}${healed.part} injury`, async () => restoreInjury(healed));
              navigate('/climber');
            }}
          >
            Mark healed
          </Button>
        </Card>
      </div>
    </>
  );
}
