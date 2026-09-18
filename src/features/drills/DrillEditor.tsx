import { useState } from 'react';
import { useLocation } from 'wouter';
import { Trash2 } from 'lucide-react';
import { DRILL_CATEGORIES } from '@/content/drills';
import type { Discipline, Drill, DrillCategory, Equipment } from '@/content/types';
import { EQUIPMENT_LABELS } from '@/engine/customProgram';
import { DRILL_DISCIPLINES, drillIssues, tidyDrill } from '@/engine/customDrill';
import { useCustomDrills } from '@/store/drills';
import { offerUndo } from '@/store/undo';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Field, Input, Select, TextArea } from '@/ui/Field';

/**
 * Writing a drill (PLAN.md M286).
 *
 * Every field is optional except the three `drillIssues` asks for — a name,
 * what it trains, and the thing itself. `customProgram.ts` validates at length
 * because a half-written program breaks the scheduler; a drill is read by
 * people rather than walked by an engine, so the bar is whether a climber
 * opening it in six months knows what to do.
 *
 * ## It saves as you go, and says what is still missing
 *
 * No draft state and no Save button. The drill exists from the moment it is
 * created — an incomplete one is a real record that reads as incomplete, which
 * is the shape `customProgram.ts` chose for the same reason: *"it spends most
 * of its life incomplete, and the app has to be able to say precisely what is
 * still wrong without refusing to hold the half-finished thing."*
 */
export function DrillEditor({ drill, onDone }: { drill: Drill; onDone: () => void }) {
  const save = useCustomDrills((s) => s.save);
  const remove = useCustomDrills((s) => s.remove);
  const [, navigate] = useLocation();
  const [draft, setDraft] = useState<Drill>(drill);

  const issues = drillIssues(draft);
  const patch = (fields: Partial<Drill>) => {
    const next = { ...draft, ...fields };
    setDraft(next);
    void save(next);
  };

  async function drop(): Promise<void> {
    await remove(draft.id);
    offerUndo(draft.name === '' ? 'the drill' : draft.name, async () => {
      await save(draft);
    });
    navigate('/drills', { replace: true });
  }

  return (
    <>
      <Card title="What it is">
        <Field label="Name" className="mb-3">
          {(props) => (
            <Input
              {...props}
              value={draft.name}
              maxLength={60}
              placeholder="Three-point rule"
              onChange={(e) => patch({ name: e.target.value })}
            />
          )}
        </Field>
        <Field label="What it trains" hint="A few words, the way the library says it." className="mb-3">
          {(props) => (
            <Input
              {...props}
              value={draft.focus}
              maxLength={60}
              placeholder="Foot precision under fatigue"
              onChange={(e) => patch({ focus: e.target.value })}
            />
          )}
        </Field>
        <Field label="The drill" hint="What you would tell someone doing it. The library's own are a paragraph.">
          {(props) => (
            <TextArea
              {...props}
              rows={6}
              value={draft.text ?? ''}
              onChange={(e) => patch({ text: e.target.value })}
            />
          )}
        </Field>
      </Card>

      <Card title="Where it belongs">
        <Field label="Category" className="mb-3">
          {(props) => (
            <Select
              {...props}
              value={draft.category}
              onChange={(e) => patch({ category: e.target.value as DrillCategory })}
            >
              {Object.entries(DRILL_CATEGORIES).map(([id, { label }]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Climbing" className="mb-3">
          {(props) => (
            <Select
              {...props}
              value={draft.discipline}
              onChange={(e) => patch({ discipline: e.target.value as Discipline })}
            >
              {DRILL_DISCIPLINES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How long" hint="e.g. 45-60 min">
            {(props) => (
              <Input
                {...props}
                size="compact"
                value={draft.duration}
                maxLength={20}
                onChange={(e) => patch({ duration: e.target.value })}
              />
            )}
          </Field>
          <Field label="Who for" hint="e.g. V3-V6">
            {(props) => (
              <Input
                {...props}
                size="compact"
                value={draft.level}
                maxLength={20}
                onChange={(e) => patch({ level: e.target.value })}
              />
            )}
          </Field>
        </div>
      </Card>

      <Card title="What it needs">
        {/* `EQUIPMENT_LABELS` rather than a list of our own: it covers every
            `Equipment` and the drill page already imports it. A second list
            is the shape M169 named, and a first draft of this wrote one with
            four values the type does not have. */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((kit) => (
            <Chip
              key={kit}
              active={draft.equipment.includes(kit)}
              onClick={() =>
                patch({
                  equipment: draft.equipment.includes(kit)
                    ? draft.equipment.filter((e) => e !== kit)
                    : [...draft.equipment, kit],
                })
              }
            >
              {EQUIPMENT_LABELS[kit]}
            </Chip>
          ))}
        </div>
      </Card>

      {issues.length > 0 && (
        <Card title="Still to do">
          <ul className="grid grid-cols-1 gap-1.5">
            {issues.map((issue) => (
              <li key={issue.field} className="text-sm leading-relaxed flex gap-2">
                <span className="text-warn" aria-hidden>
                  ·
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex gap-2">
          {/* Tidied here rather than on every keystroke: trimming as you type
              means you cannot type a space between two words. */}
          <Button
            onClick={() => {
              const tidy = tidyDrill(draft);
              setDraft(tidy);
              void save(tidy);
              onDone();
            }}
          >
            Done
          </Button>
          <Button variant="ghost" onClick={() => void drop()}>
            <Trash2 size={15} /> Delete
          </Button>
        </div>
      </Card>
    </>
  );
}
