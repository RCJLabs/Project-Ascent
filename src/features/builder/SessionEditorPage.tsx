import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { DRILLS, getDrill } from '@/content/drills';
import { PROTOCOLS } from '@/content/protocols';
import type { Exercise, ExerciseBlock, Program, SessionType } from '@/content/types';
import {
  blankExercise,
  copyPhase,
  copyPhaseToAll,
  describeBlock,
  newBlock,
  phasePrescription,
  reconcilePhases,
  setPrescription,
} from '@/engine/prescription';
import { useCustomPrograms } from '@/store/programs';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { OptionCard } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Input, Select, TextArea } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';

const small = 'bg-surface border border-line rounded-lg px-2 py-1.5 text-sm min-w-0';

export function SessionEditorPage({ params }: { params: { id: string; typeId: string } }) {
  const custom = useCustomPrograms((s) => s.custom);
  const hydrated = useCustomPrograms((s) => s.hydrated);
  const load = useCustomPrograms((s) => s.load);
  const save = useCustomPrograms((s) => s.save);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = custom.find((p) => p.id === params.id);
  const type = program?.sessionTypes.find((t) => t.id === params.typeId);
  const ordered = useMemo(
    () => [...(program?.phases ?? [])].sort((a, b) => a.weekStart - b.weekStart),
    [program?.phases],
  );
  const [phaseId, setPhaseId] = useState<string | null>(null);

  if (!hydrated) return null;
  if (!program || !type) {
    return (
      <>
        <PageHeader title="Not found" />
        <Card>
          <p className="text-sm text-ink-soft">That session is not here any more.</p>
        </Card>
      </>
    );
  }

  const phase = ordered.find((p) => p.id === phaseId) ?? ordered[0];
  const blocks = type.blocks ?? [];

  const writeType = (patch: Partial<SessionType>) =>
    void save({
      ...program,
      sessionTypes: program.sessionTypes.map((t) => (t.id === type.id ? { ...t, ...patch } : t)),
    });
  const writeBlock = (next: ExerciseBlock) =>
    writeType({ blocks: blocks.map((b) => (b.id === next.id ? next : b)) });

  return (
    <>
      {/* Explicit, because the parent is *this* program rather than the
          list of them, and the route table cannot know the id. */}
      <BackLink href={`/build/${program.id}`} title={program.name || 'Program'} />
      <PageHeader title={`${type.icon} ${type.name}`} subtitle="What this session asks for" />

      <div className="grid grid-cols-1 gap-3">
        {ordered.length > 1 && phase && (
          <Card title="Which block of weeks">
            <div className="flex flex-wrap gap-2">
              {ordered.map((p) => (
                <OptionCard
                  key={p.id}
                  active={p.id === phase.id}
                  onClick={() => setPhaseId(p.id)}
                  label={p.name || p.id}
                  blurb={`weeks ${p.weekStart}–${p.weekEnd}`}
                />
              ))}
            </div>
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              Everything below is what this session looks like during these weeks. Periodisation is
              the point — the same block can be repeaters here and max hangs later.
            </p>
          </Card>
        )}

        {phase &&
          blocks.map((block) => (
            <BlockCard
              key={block.id}
              block={block}
              phaseId={phase.id}
              phases={ordered}
              onChange={writeBlock}
              onRemove={() => writeType({ blocks: blocks.filter((b) => b.id !== block.id) })}
            />
          ))}

        <AddBlock
          onAdd={(name) =>
            writeType({ blocks: [...blocks, newBlock(name, ordered, blocks)] })
          }
        />

        <DrillsCard program={program} type={type} onChange={writeType} />
      </div>
    </>
  );
}

function AddBlock({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Card title="Add a block">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        A block groups exercises that belong together — "Hangboard", "Pull", "Core". Each one gets
        its own prescription per block of weeks.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) {
              onAdd(name);
              setName('');
            }
          }}
          placeholder="Hangboard"
          aria-label="New block name"
          className="flex-1 min-w-0"
        />
        <Button
          size="sm"
          onClick={() => {
            if (!name.trim()) return;
            onAdd(name);
            setName('');
          }}
        >
          <Plus size={14} /> Add
        </Button>
      </div>
    </Card>
  );
}

function BlockCard({
  block,
  phaseId,
  phases,
  onChange,
  onRemove,
}: {
  block: ExerciseBlock;
  phaseId: string;
  phases: { id: string; name: string }[];
  onChange: (b: ExerciseBlock) => void;
  onRemove: () => void;
}) {
  const p = phasePrescription(block, phaseId);
  const set = (patch: Parameters<typeof setPrescription>[2]) =>
    onChange(setPrescription(reconcilePhases(block, phases as never), phaseId, patch));

  const setExercise = (i: number, patch: Partial<Exercise>) =>
    set({ exercises: p.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  return (
    <Card>
      <div className="flex items-start gap-2 mb-1">
        <Input
          value={block.name}
          onChange={(e) => onChange({ ...block, name: e.target.value })}
          aria-label="Block name"
          className="flex-1 min-w-0 bg-transparent font-bold text-base border-0 p-0 focus:outline-none"
        />
        <IconButton tone="danger" onClick={onRemove} label={`Remove ${block.name}`}>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <p className="text-xs text-ink-soft mb-3">{describeBlock(block, phaseId)}</p>

      <TextArea
        value={p.rationale}
        onChange={(e) => set({ rationale: e.target.value })}
        rows={2}
        placeholder="Why this, in these weeks"
        aria-label="Rationale"
        className="resize-y mb-3"
      />

      <div className="grid grid-cols-1 gap-2 mb-3">
        {p.exercises.map((exercise, i) => (
          <div key={i} className="bg-sunken rounded-xl p-2.5">
            <div className="flex gap-2 mb-2">
              <Input
                value={exercise.name}
                onChange={(e) => setExercise(i, { name: e.target.value })}
                placeholder="Max Hangs"
                aria-label={`Exercise ${i + 1} name`}
                className={`${small} flex-1`}
              />
              <IconButton
                tone="danger"
                onClick={() => set({ exercises: p.exercises.filter((_, j) => j !== i) })}
                label={`Remove exercise ${i + 1}`}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['sets', 'Sets', '3-5'],
                  ['reps', 'Reps', '8-10'],
                  ['hold', 'Hold', '7s'],
                  ['load', 'Load', 'BW+15lb'],
                  ['rest', 'Rest', '2-3 min'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <Input
                  key={key}
                  value={exercise[key] ?? ''}
                  onChange={(e) => setExercise(i, { [key]: e.target.value || undefined })}
                  placeholder={`${label} · ${placeholder}`}
                  aria-label={`Exercise ${i + 1} ${label.toLowerCase()}`}
                  className={small}
                />
              ))}
              <Select
                value={exercise.protocolId ?? ''}
                onChange={(e) => setExercise(i, { protocolId: e.target.value || undefined })}
                aria-label={`Exercise ${i + 1} timer`}
                className={small}
              >
                <option value="">No timer</option>
                {Object.values(PROTOCOLS).map((protocol) => (
                  <option key={protocol.id} value={protocol.id}>
                    {protocol.name}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              value={exercise.notes ?? ''}
              onChange={(e) => setExercise(i, { notes: e.target.value || undefined })}
              placeholder="Form cue — never dosage"
              aria-label={`Exercise ${i + 1} note`}
              className={`${small} w-full mt-2`}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={() => set({ exercises: [...p.exercises, blankExercise()] })}>
          <Plus size={14} /> Exercise
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            set({ selection: p.selection ? undefined : { pick: Math.max(1, p.exercises.length - 1) } })
          }
        >
          {p.selection ? 'Not a menu' : 'Make it a menu'}
        </Button>
      </div>

      {p.selection && (
        <div className="flex items-center gap-2 text-sm mb-3">
          <span className="text-ink-soft">Pick</span>
          <Input
            type="number"
            min={1}
            value={p.selection.pick}
            onChange={(e) => set({ selection: { ...p.selection!, pick: Math.max(1, Number(e.target.value) || 1) } })}
            aria-label="How many to pick"
            className={`${small} w-16`}
          />
          <span className="text-ink-soft">of {p.exercises.length}</span>
        </div>
      )}

      {phases.length > 1 && (
        <div className="border-t border-line pt-3">
          <p className="text-xs text-ink-soft mb-2">
            Most blocks of weeks are not different. Copy this one rather than typing it again.
          </p>
          <div className="flex flex-wrap gap-2">
            {phases
              .filter((other) => other.id !== phaseId)
              .map((other) => (
                <Button
                  key={other.id}
                  size="sm"
                  variant="ghost"
                  onClick={() => onChange(copyPhase(block, phaseId, other.id))}
                >
                  <Copy size={13} /> To {other.name || other.id}
                </Button>
              ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(copyPhaseToAll(block, phaseId, phases as never))}
            >
              <Copy size={13} /> To all
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DrillsCard({
  program,
  type,
  onChange,
}: {
  program: Program;
  type: SessionType;
  onChange: (patch: Partial<SessionType>) => void;
}) {
  const byWeek = type.drillsByWeek ?? {};
  const [open, setOpen] = useState(false);

  const suitable = useMemo(
    () => DRILLS.filter((d) => d.equipment.every((e) => e === 'none' || program.equipment.includes(e))),
    [program.equipment],
  );

  return (
    <Card title="Drill of the week">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        Optional. A drill is ten minutes of deliberate practice inside a session you are already
        having, and it is the only thing that moves the Technique stat.
      </p>
      {!open ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {Object.keys(byWeek).length > 0
            ? `Edit ${Object.keys(byWeek).length} assigned`
            : 'Assign drills by week'}
        </Button>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {Array.from({ length: program.weeks }, (_, i) => i + 1).map((week) => (
            <div key={week} className="flex items-center gap-2">
              <span className="w-12 text-xs font-semibold text-ink-soft">Wk {week}</span>
              <Select
                value={byWeek[week] ?? ''}
                onChange={(e) => {
                  const next = { ...byWeek };
                  if (e.target.value) next[week] = e.target.value;
                  else delete next[week];
                  onChange({ drillsByWeek: next });
                }}
                aria-label={`Week ${week} drill`}
                className="flex-1 min-w-0"
              >
                <option value="">None</option>
                {suitable.map((drill) => (
                  <option key={drill.id} value={drill.id}>
                    {drill.name}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <p className="text-xs text-ink-soft mt-1">
            {suitable.length} of {DRILLS.length} drills match what this program trains on.
            {byWeek[1] && getDrill(byWeek[1]) ? ` Week 1: ${getDrill(byWeek[1])!.focus}.` : ''}
          </p>
        </div>
      )}
    </Card>
  );
}
