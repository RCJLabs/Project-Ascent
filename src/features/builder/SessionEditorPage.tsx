import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { DRILLS, getDrill } from '@/content/drills';
import { FIELDS } from '@/content/fields';
import { PROTOCOLS } from '@/content/protocols';
import type {
  CircuitFormat,
  Exercise,
  ExerciseBlock,
  FieldId,
  Phase,
  Program,
  SessionType,
  Track,
  WeekStep,
} from '@/content/types';
import { circuitPlan } from '@/engine/circuit';
import {
  DOSE_FIELDS,
  blankExercise,
  copyPhase,
  copyPhaseToAll,
  describeBlock,
  flatAcrossPhases,
  newBlock,
  nextStepWeek,
  phaseLength,
  phasePrescription,
  prescriptionLine,
  reconcilePhases,
  setPrescription,
  withStep,
  withStepDose,
  withoutStep,
} from '@/engine/prescription';
import { useCustomPrograms } from '@/store/programs';
import { BackLink } from '@/ui/BackLink';
import { PageSkeleton } from '@/ui/Skeleton';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip, OptionCard } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Input, Select, TextArea } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';

const small = 'bg-surface border border-line rounded-lg px-2 py-1.5 text-sm min-w-0';

/**
 * What a session asks for, and everything the catalogue can say about it
 * (PLAN.md M136).
 *
 * The editor offered a name, a rationale, a list of exercises with five
 * dose fields each, a timer, and *pick N of*. The catalogue is made of
 * more than that — nineteen blocks run as circuits, five move their dose
 * week by week, eight say why they never move, three programs have two
 * tracks through them, one block folds into another for a phase — and none
 * of it could be written here. A forked Cruiser kept its circuits and Iron
 * Grip its weekly steps invisibly: the editor spread what it did not show,
 * so they survived a save and never appeared. Every one of those is a
 * control on this page now, and the warnings the catalogue's content tests
 * raise are raised on the builder page for the same faults.
 */
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

  // Not `null`: with nothing in `main` the page has no height, so the
  // layout collapses and snaps back a frame later — which reads as a fault
  // rather than as loading (PLAN.md M22).
  if (!hydrated) return <PageSkeleton title="Edit a session" />;
  if (!program || !type) {
    return (
      <RecordNotFound what="That session" backTo="/build" backLabel="Back to your programs" />
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
              phase={phase}
              phases={ordered}
              siblings={blocks}
              tracks={program.tracks ?? []}
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
        <FieldsCard type={type} onChange={writeType} />
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

/** The circuit's four fields, as the editor labels them. */
const CIRCUIT_FIELDS: [keyof CircuitFormat, string, string][] = [
  ['rounds', 'Rounds', '2-3'],
  ['work', 'Each', '45s'],
  ['restBetween', 'Rest between', '15s'],
  ['restBetweenRounds', 'Between rounds', '2 min'],
];

const DOSE_LABEL: Record<(typeof DOSE_FIELDS)[number], [string, string]> = {
  sets: ['Sets', '3-5'],
  reps: ['Reps', '8-10'],
  hold: ['Hold', '7s'],
  load: ['Load', 'BW+15lb'],
  rest: ['Rest', '2-3 min'],
};

/** The block with its reason for never changing, or without one. */
function withConstantDose(block: ExerciseBlock, text: string): ExerciseBlock {
  const { constantDose: _was, ...rest } = block;
  return text.trim() === '' ? rest : { ...rest, constantDose: text };
}

function BlockCard({
  block,
  phase,
  phases,
  siblings,
  tracks,
  onChange,
  onRemove,
}: {
  block: ExerciseBlock;
  phase: Phase;
  phases: Phase[];
  /** Every block in this session, for folding one into another. */
  siblings: ExerciseBlock[];
  tracks: Track[];
  onChange: (b: ExerciseBlock) => void;
  onRemove: () => void;
}) {
  const phaseId = phase.id;
  const p = phasePrescription(block, phaseId);
  const set = (patch: Parameters<typeof setPrescription>[2]) =>
    onChange(setPrescription(reconcilePhases(block, phases), phaseId, patch));

  const setExercise = (i: number, patch: Partial<Exercise>) =>
    set({ exercises: p.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });

  const others = siblings.filter((b) => b.id !== block.id);
  const host = others.find((b) => b.id === p.mergedInto);
  const length = phaseLength(phase);
  const steps = p.perWeek ?? [];
  const nextWeek = nextStepWeek(p.perWeek, length);
  const flat = flatAcrossPhases(block, phases);
  // The clock's verdict on the circuit as written, so an author finds out
  // here rather than a climber at the wall (PLAN.md M99). Only once there
  // is a round count to read: an empty one is its own warning.
  const clock = p.circuit && p.circuit.rounds.trim() ? circuitPlan(p.circuit, Math.max(1, p.exercises.length)) : null;

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

      {/* One block performed inside another for a phase — Base Camp's Pull
          supersetted into Push. The catalogue has one of these; the editor
          showed it as an empty exercise list. */}
      {others.length > 0 && (
        <div className="flex items-center gap-2 text-sm mb-3">
          <span className="text-ink-soft shrink-0">These weeks</span>
          <Select
            value={host?.id ?? ''}
            onChange={(e) => set({ mergedInto: e.target.value || undefined })}
            aria-label={`Where ${block.name} is done`}
            className={`${small} flex-1`}
          >
            <option value="">On its own</option>
            {others.map((b) => (
              <option key={b.id} value={b.id}>
                Folded into {b.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {host ? (
        <p className="text-sm text-ink-soft mb-3 leading-relaxed">
          Performed inside {host.name} these weeks — nothing of its own to prescribe.
        </p>
      ) : (
        <>
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
                  {DOSE_FIELDS.map((key) => (
                    <Input
                      key={key}
                      value={exercise[key] ?? ''}
                      onChange={(e) => setExercise(i, { [key]: e.target.value || undefined })}
                      placeholder={`${DOSE_LABEL[key][0]} · ${DOSE_LABEL[key][1]}`}
                      aria-label={`Exercise ${i + 1} ${key}`}
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
                  {/* Only when the program has tracks: a control for a
                      choice the program does not offer is a question with
                      one answer. */}
                  {tracks.length > 0 && (
                    <Select
                      value={exercise.track ?? ''}
                      onChange={(e) => setExercise(i, { track: e.target.value || undefined })}
                      aria-label={`Exercise ${i + 1} track`}
                      className={small}
                    >
                      <option value="">Every track</option>
                      {tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  )}
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
            {/* A block run in timed rounds rather than straight sets —
                nineteen of the catalogue's blocks. Independent of the menu:
                a block can be both, or either alone. */}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set({ circuit: p.circuit ? undefined : { rounds: '3' } })}
            >
              {p.circuit ? 'Not a circuit' : 'Run as a circuit'}
            </Button>
          </div>

          {p.selection && (
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="text-ink-soft">Pick</span>
              <span className="w-16 shrink-0 inline-block">
              <Input
                type="number"
                min={1}
                value={p.selection.pick}
                onChange={(e) => set({ selection: { ...p.selection!, pick: Math.max(1, Number(e.target.value) || 1) } })}
                aria-label="How many to pick"
                className={small}
              />
              </span>
              <span className="text-ink-soft">of {p.exercises.length}</span>
            </div>
          )}

          {p.circuit && (
            <div className="bg-sunken rounded-xl p-2.5 mb-3">
              <p className="text-xs font-semibold mb-2">
                Circuit{prescriptionLine(undefined, p.circuit, p.exercises.length) ? ` · ${prescriptionLine(undefined, p.circuit, p.exercises.length)}` : ''}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CIRCUIT_FIELDS.map(([key, label, placeholder]) => (
                  <Input
                    key={key}
                    value={p.circuit![key] ?? ''}
                    onChange={(e) =>
                      set({
                        circuit:
                          key === 'rounds'
                            ? { ...p.circuit!, rounds: e.target.value }
                            : { ...p.circuit!, [key]: e.target.value || undefined },
                      })
                    }
                    placeholder={`${label} · ${placeholder}`}
                    aria-label={`Circuit ${label.toLowerCase()}`}
                    className={small}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-soft mt-2 leading-relaxed">
                {clock === null
                  ? 'A number of rounds is what makes it a circuit.'
                  : clock.ok
                    ? 'The clock can run this one from the log.'
                    : `The clock cannot run this one: ${clock.because}`}
              </p>
            </div>
          )}

          {/* The dose moving inside the phase (PLAN.md M127). Week one is
              the list above; a later week says what it asks in a line and,
              where a number moves, in the number. Every exercise gets a row
              of the five fields with the phase's own dose as the placeholder,
              so a value typed is a change and a value cleared is not. */}
          {length >= 2 && (
            <div className="border-t border-line pt-3 mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-1">Week by week</p>
              <p className="text-xs text-ink-soft mb-2 leading-relaxed">
                Week 1 of {phase.name || phaseId} is what is written above. A later week can ask more
                — in a line, and in whichever numbers move.
              </p>
              {steps.map((step) => (
                <StepRow
                  key={step.week}
                  step={step}
                  length={length}
                  taken={steps.map((s) => s.week)}
                  exercises={p.exercises}
                  onChange={(next) => set({ perWeek: withStep(withoutStep(p.perWeek, step.week), next) })}
                  onRemove={() => set({ perWeek: withoutStep(p.perWeek, step.week) })}
                />
              ))}
              {nextWeek !== null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => set({ perWeek: withStep(p.perWeek, { week: nextWeek, step: '' }) })}
                >
                  <Plus size={14} /> Week {nextWeek}
                </Button>
              )}
            </div>
          )}
        </>
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
              onClick={() => onChange(copyPhaseToAll(block, phaseId, phases))}
            >
              <Copy size={13} /> To all
            </Button>
          </div>
        </div>
      )}

      {/* A block that never changes says why (PLAN.md M33), and a block that
          says so does not change. The program page prints the reason under
          the dose; a flat block with no reason reads as an oversight there. */}
      {phases.length > 1 && (flat || block.constantDose !== undefined) && (
        <div className="border-t border-line pt-3 mt-3">
          <p className="text-xs text-ink-soft mb-1.5 leading-relaxed">
            {flat
              ? 'This block prescribes the same dose in every block of weeks. A block that never changes says why, and the program page prints it.'
              : 'This block says its dose never changes, and it does. Clear the reason, or make the blocks of weeks the same again.'}
          </p>
          <TextArea
            value={block.constantDose ?? ''}
            onChange={(e) => onChange(withConstantDose(block, e.target.value))}
            rows={2}
            placeholder="Why the dose is the same all the way through"
            aria-label={`Why ${block.name} never changes`}
            className="resize-y"
          />
        </div>
      )}
    </Card>
  );
}

function StepRow({
  step,
  length,
  taken,
  exercises,
  onChange,
  onRemove,
}: {
  step: WeekStep;
  length: number;
  taken: number[];
  exercises: Exercise[];
  onChange: (next: WeekStep) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-sunken rounded-xl p-2.5 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-ink-soft shrink-0">Week</span>
        <Select
          value={step.week}
          onChange={(e) => onChange({ ...step, week: Number(e.target.value) })}
          aria-label="Which week"
          className={small}
        >
          {Array.from({ length: Math.max(0, length - 1) }, (_, i) => i + 2).map((week) => (
            <option key={week} value={week} disabled={week !== step.week && taken.includes(week)}>
              {week}
            </option>
          ))}
        </Select>
        <span className="flex-1" />
        <IconButton tone="danger" onClick={onRemove} label={`Remove the week ${step.week} step`}>
          <Trash2 size={14} />
        </IconButton>
      </div>
      <Input
        value={step.step}
        onChange={(e) => onChange({ ...step, step: e.target.value })}
        placeholder="What this week asks that last week did not"
        aria-label={`Week ${step.week} step`}
        className={`${small} w-full mb-2`}
      />
      {exercises.map((exercise) => (
        <div key={exercise.name} className="mb-2 last:mb-0">
          <p className="text-xs font-semibold mb-1">{exercise.name || 'Unnamed'}</p>
          <div className="grid grid-cols-5 gap-1">
            {DOSE_FIELDS.map((field) => (
              <Input
                key={field}
                value={step.dose?.[exercise.name]?.[field] ?? ''}
                onChange={(e) => onChange(withStepDose(step, exercise.name, field, e.target.value))}
                placeholder={exercise[field] ?? DOSE_LABEL[field][0]}
                aria-label={`Week ${step.week} ${exercise.name} ${field}`}
                className={`${small} px-1.5`}
                size="compact"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
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

/**
 * The questions the log puts to this session (PLAN.md M70, offered here
 * since M136). Not *where* — that is asked of every session since M133 —
 * and not the retired clip style, which nothing renders an input for.
 */
const ASKABLE = Object.values(FIELDS).filter((f) => f.id !== 'location' && f.id !== 'clipStyle');

function FieldsCard({ type, onChange }: { type: SessionType; onChange: (patch: Partial<SessionType>) => void }) {
  const chosen = new Set<FieldId>(type.fields ?? []);
  return (
    <Card title="Ask at the end">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        Questions the log puts to this session under the climbs. The grades and the climb count
        answer themselves from the climb list; a number or a scale is charted on Progress once it
        has been answered a few times.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ASKABLE.map((field) => {
          const on = chosen.has(field.id);
          return (
            <Chip
              key={field.id}
              active={on}
              onClick={() => {
                const next = on ? (type.fields ?? []).filter((id) => id !== field.id) : [...(type.fields ?? []), field.id];
                onChange({ fields: next.length > 0 ? next : undefined });
              }}
            >
              {field.label}
            </Chip>
          );
        })}
      </div>
    </Card>
  );
}
