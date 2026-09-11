import { Link } from 'wouter';
import type { BodyPart } from '@/content/warmups';
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  useProfile,
  type InjurySeverity,
  type InjuryStatus,
} from '@/store/profile';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';

const PARTS: { value: BodyPart; label: string }[] = [
  { value: 'fingers', label: 'Fingers' },
  { value: 'pulley', label: 'Pulley' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'back', label: 'Back' },
  { value: 'hip', label: 'Hip' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle', label: 'Ankle' },
];

/**
 * What hurts, on the page about the climber (PLAN.md M76).
 *
 * This lived in Settings, between the equipment list and the backup export,
 * which is where you go to change the app and not where you go to say
 * something about yourself. An injury is a fact about the climber — it
 * drains vitality on this very page, two cards up — so it sits with the
 * rest of them. The record, the store and the detail page are unchanged;
 * only the doorway moved.
 */
export function InjuriesCard() {
  const injuries = useProfile((s) => s.injuries);
  const addInjury = useProfile((s) => s.addInjury);
  const updateInjury = useProfile((s) => s.updateInjury);

  return (
    <Card title="Injuries">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        How bad it is decides what happens: something you are healing is kept out of your
        warmups and blocked in the finder, while a niggle — or a part you are deliberately
        loading again — is flagged beside the exercises that load it, and left to you.
      </p>
      {injuries.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 mb-3">
          {injuries.map((injury) => (
            <li key={injury.id} className="bg-sunken rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <span className="font-semibold text-sm capitalize">{injury.part}</span>
                  <span className="text-xs text-ink-soft ml-2">since {injury.since}</span>
                </div>
                <Link href={`/injury/${injury.id}`} className="text-sm font-semibold text-accent shrink-0 py-1.5">
                  Open
                </Link>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {(Object.keys(SEVERITY_LABEL) as InjurySeverity[]).map((level) => (
                  <Chip
                    key={level}
                    active={injury.severity === level}
                    onClick={() => updateInjury(injury.id, { severity: level })}
                    className="text-xs"
                  >
                    {SEVERITY_LABEL[level].label}
                  </Chip>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(STATUS_LABEL) as InjuryStatus[]).map((state) => (
                  <Chip
                    key={state}
                    active={injury.status === state}
                    onClick={() => updateInjury(injury.id, { status: state })}
                    className="text-xs"
                  >
                    {STATUS_LABEL[state].label}
                  </Chip>
                ))}
                {injury.part !== 'back' &&
                  (['left', 'right', 'both'] as const).map((side) => (
                    <Chip
                      key={side}
                      active={injury.side === side}
                      onClick={() => updateInjury(injury.id, { side: injury.side === side ? undefined : side })}
                      className="text-xs capitalize"
                    >
                      {side}
                    </Chip>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {PARTS.filter((p) => !injuries.some((i) => i.part === p.value)).map((p) => (
          <Chip key={p.value} active={false} onClick={() => addInjury(p.value)}>
            + {p.label}
          </Chip>
        ))}
      </div>
    </Card>
  );
}
