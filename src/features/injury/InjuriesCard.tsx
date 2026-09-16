import { useState } from 'react';
import { Link } from 'wouter';
import { Plus } from 'lucide-react';
import {
  REGIONS,
  REGION_LABEL,
  SIDES,
  bodyPart,
  hasSides,
  partLabel,
  partsIn,
  type BodyPart,
} from '@/content/bodyParts';
import { today } from '@/engine/dates';
import { recurrenceFor } from '@/engine/injuryLog';
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  useProfile,
  type InjurySeverity,
  type InjurySide,
  type InjuryStatus,
} from '@/store/profile';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Input } from '@/ui/Field';


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
  const healedInjuries = useProfile((s) => s.healedInjuries);
  const addInjury = useProfile((s) => s.addInjury);
  const updateInjury = useProfile((s) => s.updateInjury);

  /**
   * Parts that have gone before and are not going now (PLAN.md M177).
   *
   * Here as well as on the injury page, and that is the half that keeps this
   * from being another store nothing renders: the page only exists while an
   * injury is live, so a history read *only* there would be invisible to
   * exactly the climber who is currently fine — which is when knowing a part
   * has gone twice is worth most.
   */
  const healedParts = [...new Set(healedInjuries.map((injury) => injury.part))]
    .filter((part) => !injuries.some((injury) => injury.part === part))
    .map((part) => recurrenceFor(part, healedInjuries))
    .sort((a, b) => b.past.length - a.past.length);

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
                  <span className="font-semibold text-sm">
                    {partLabel(injury.part)}
                    {injury.side !== undefined && (
                      <span className="text-ink-soft font-normal">
                        {' · '}
                        {SIDES.find((s) => s.value === injury.side)?.label ?? injury.side}
                      </span>
                    )}
                  </span>
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

              {/* Its own row. Status and side used to share one wrapped
                  line, so "Healing · Coming back · Left · Right · Both"
                  read as a single set of five choices (PLAN.md M223). */}
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
              </div>

              {hasSides(injury.part) && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {SIDES.map(({ value, label }) => (
                    <Chip
                      key={value}
                      active={injury.side === value}
                      onClick={() =>
                        updateInjury(injury.id, { side: injury.side === value ? undefined : value })
                      }
                      className="text-xs"
                    >
                      {label}
                    </Chip>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddInjury onAdd={addInjury} />

      {healedParts.length > 0 && (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
            Healed
          </p>
          <ul className="grid grid-cols-1 gap-1">
            {healedParts.map((recurrence) => (
              <li key={recurrence.part} className="text-xs text-ink-soft leading-relaxed">
                <span className="font-semibold text-ink">{partLabel(recurrence.part)}</span>
                {' — '}
                {recurrence.past.length === 1
                  ? `one episode, ${recurrence.past[0]!.days} days, healed ${recurrence.past[0]!.healedAt}`
                  : `${recurrence.past.length} episodes, last healed ${recurrence.past.at(-1)!.healedAt}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * Adding one, as four facts in one step (PLAN.md M223).
 *
 * Before this, tapping a part chip *created the record on the spot* — dated
 * today, no side, severity guessed — and left the climber to correct it
 * from three more chip rows. Two of those four are usually wrong: an injury
 * is rarely logged the day it happens, and a side is not optional
 * information about an elbow.
 *
 * The parts are grouped because eighteen chips in a row is a wall and four
 * short rows is a body. The order runs hands outward and then down, which
 * is the order people point at themselves.
 *
 * Nothing is written until **Add**, so backing out of this costs nothing —
 * which is the other half of why instant-create was wrong. It is not an
 * undoable action if it never happened.
 */
function AddInjury({
  onAdd,
}: {
  onAdd: (part: BodyPart, details: { side?: InjurySide; since: string; severity: InjurySeverity }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [part, setPart] = useState<BodyPart | null>(null);
  const [side, setSide] = useState<InjurySide | undefined>(undefined);
  const [since, setSince] = useState(today());
  const [severity, setSeverity] = useState<InjurySeverity>('managing');

  const reset = () => {
    setOpen(false);
    setPart(null);
    setSide(undefined);
    setSince(today());
    setSeverity('managing');
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus size={15} /> Log an injury
      </Button>
    );
  }

  return (
    // A named group, so the form is addressable: the card below it carries
    // the same Left/Right/Both chips per injury, and "the Right in the form"
    // has to be sayable — by a screen reader and by a test.
    <div className="bg-sunken rounded-xl p-3" role="group" aria-label="Log an injury">
      {REGIONS.map((region) => (
        <div key={region} className="mb-2.5">
          <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
            {REGION_LABEL[region]}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {partsIn(region).map((info) => (
              <Chip
                key={info.id}
                active={part === info.id}
                onClick={() => {
                  setPart(info.id);
                  // A part with no sides must not carry one from the part
                  // picked before it.
                  if (!hasSides(info.id)) setSide(undefined);
                }}
                className="text-xs"
              >
                {info.label}
              </Chip>
            ))}
          </div>
        </div>
      ))}

      {part !== null && (
        <>
          {/* The hint is here rather than on the chip: eighteen chips
              carrying a subtitle each is the wall again. */}
          {bodyPart(part).hint !== undefined && (
            <p className="text-xs text-ink-soft mb-2.5 leading-relaxed">{bodyPart(part).hint}</p>
          )}

          {hasSides(part) && (
            <div className="mb-2.5">
              <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
                Which side
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SIDES.map(({ value, label }) => (
                  <Chip
                    key={value}
                    active={side === value}
                    onClick={() => setSide(side === value ? undefined : value)}
                    className="text-xs"
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="mb-2.5">
            <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
              How bad
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SEVERITY_LABEL) as InjurySeverity[]).map((level) => (
                <Chip
                  key={level}
                  active={severity === level}
                  onClick={() => setSeverity(level)}
                  className="text-xs"
                >
                  {SEVERITY_LABEL[level].label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label
              htmlFor="injury-since"
              className="block text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5"
            >
              Since when
            </label>
            {/* Not stamped with today and left to be noticed: you do not
                open an app the moment you tweak something. */}
            <Input
              id="injury-since"
              type="date"
              value={since}
              max={today()}
              onChange={(e) => setSince(e.target.value || today())}
              size="compact"
              className="bg-surface"
            />
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={part === null}
          onClick={() => {
            if (part === null) return;
            onAdd(part, { ...(side ? { side } : {}), since, severity });
            reset();
          }}
        >
          Add
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
