import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { RETURN_DISCLAIMER } from '@/content/returnToClimbing';
import { fromKey } from '@/engine/dates';
import { describeInjury } from '@/engine/injury';
import { addStep, progress, removeStep, stepsFor, toggleStep } from '@/engine/returnPlan';
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  useProfile,
  type InjurySeverity,
  type InjuryStatus,
} from '@/store/profile';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { OptionCard } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Checkbox, Input, TextArea } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';

/**
 * One injury, and the climber's own record of coming back from it.
 *
 * The disclaimer sits above the list rather than below it, and is not
 * collapsible: it is the first thing read, every time, because the list
 * underneath is a memory aid that could otherwise be mistaken for a plan.
 */
export function InjuryPage({ params }: { params: { id: string } }) {
  const injuries = useProfile((s) => s.injuries);
  const hydrated = useProfile((s) => s.hydrated);
  const updateInjury = useProfile((s) => s.updateInjury);
  const removeInjury = useProfile((s) => s.removeInjury);
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState('');

  const injury = injuries.find((i) => i.id === params.id);

  useEffect(() => {
    if (hydrated && !injury) navigate('/settings', { replace: true });
  }, [hydrated, injury, navigate]);

  if (!injury) return null;

  const steps = stepsFor(injury);
  const { done, total } = progress(injury);

  return (
    <>
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Settings
      </Link>
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
              removeInjury(injury.id);
              navigate('/settings');
            }}
          >
            Mark healed
          </Button>
        </Card>
      </div>
    </>
  );
}
