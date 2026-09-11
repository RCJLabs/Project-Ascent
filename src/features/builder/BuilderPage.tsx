import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, CircleCheck, Info, Plus, Share2, Trash2, TriangleAlert } from 'lucide-react';
import type { Constraint, DayOfWeek, Equipment, Phase, Program, SessionType } from '@/content/types';
import { allMetrics } from '@/engine/assessments';
import { V_GRADES, YDS_GRADES } from '@/engine/grades';
import { DAY_SHORT } from '@/engine/scheduler';
import {
  EQUIPMENT_LABELS,
  MAX_WEEKS,
  canRun,
  nextPhaseId,
  removeSessionType,
  retile,
  sessionTypeId,
  validateProgram,
  type Issue,
} from '@/engine/customProgram';
import { contentIssues, reconcileProgramPhases, trimDrills } from '@/engine/prescription';
import { buildProgramFile, fileName } from '@/engine/programFile';
import { useCustomPrograms } from '@/store/programs';
import { BackLink } from '@/ui/BackLink';
import { PageSkeleton } from '@/ui/Skeleton';
import { useGradeOptions } from '@/ui/useGrade';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Input, Select, TextArea } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';
import { offerUndo } from '@/store/undo';
import { useProfile } from '@/store/profile';

const ICONS = ['🧗', '✋', '⚡', '🔁', '🏋️', '🧘', '😴', '🪨', '🎯', '🔥', '🌀', '🦶'];
const EQUIPMENT: Equipment[] = ['wall', 'hangboard', 'campus', 'gym'];

export function BuilderPage({ params }: { params: { id: string } }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const custom = useCustomPrograms((s) => s.custom);
  const hydrated = useCustomPrograms((s) => s.hydrated);
  const load = useCustomPrograms((s) => s.load);
  const save = useCustomPrograms((s) => s.save);
  const remove = useCustomPrograms((s) => s.remove);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const stopProgram = useProfile((s) => s.stopProgram);
  const [, navigate] = useLocation();
  const gradeOptions = useGradeOptions();

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = custom.find((p) => p.id === params.id);
  const issues = useMemo(
    () => (program ? [...validateProgram(program), ...contentIssues(program)] : []),
    [program],
  );

  // Not `null`: with nothing in `main` the page has no height, so the
  // layout collapses and snaps back a frame later — which reads as a fault
  // rather than as loading (PLAN.md M22).
  if (!hydrated) return <PageSkeleton title="Edit a program" />;
  if (!program) {
    return (
      <RecordNotFound what="That program" backTo="/build" backLabel="Back to your programs">
        It may have been deleted.
      </RecordNotFound>
    );
  }

  /**
   * Every edit writes through: a builder that can lose work is not one.
   *
   * Phases and length are reconciled on the way past — adding a block of
   * weeks or shortening the program would otherwise leave prescriptions
   * keyed to phases that no longer exist, and drills stranded past the end.
   */
  const edit = (patch: Partial<Program>) => {
    const next = { ...program, ...patch };
    const settled = reconcileProgramPhases({
      ...next,
      sessionTypes: next.sessionTypes.map((t) => trimDrills(t, next.weeks)),
    });
    void save(settled);
  };

  const ladder = program.gradeRange.scale === 'V' ? V_GRADES : YDS_GRADES;

  return (
    <>
      <BackLink />
      <PageHeader title={program.name || 'Untitled'} subtitle={`${program.weeks} weeks`} />

      <div className="grid grid-cols-1 gap-3">
        <IssuePanel issues={issues} runnable={canRun(program)} />

        <Card title="What it is">
          <Field label="Name">
            <Input
              value={program.name}
              onChange={(e) => edit({ name: e.target.value })}
              aria-label="Program name"
            />
          </Field>
          <Field label="Your name (optional)">
            <Input
              value={program.author ?? ''}
              onChange={(e) => edit({ author: e.target.value || undefined })}
              placeholder="Shown on the program if you share it"
              aria-label="Author"
            />
          </Field>
          <Field label="One-line subtitle">
            <Input
              value={program.subtitle}
              onChange={(e) => edit({ subtitle: e.target.value })}
              placeholder="12-Week Finger Strength"
              aria-label="Subtitle"
            />
          </Field>
          <Field label="What is it for?">
            <TextArea
              value={program.intro.pitch}
              onChange={(e) => edit({ intro: { ...program.intro, pitch: e.target.value } })}
              rows={3}
              placeholder="Who this suits, and what it should do for them."
              className="resize-y"
              aria-label="Description"
            />
          </Field>
          <Field label="Discipline">
            <Row
              options={[
                { value: 'boulder', label: 'Boulder' },
                { value: 'sport', label: 'Routes' },
                { value: 'both', label: 'Both' },
              ]}
              value={program.discipline}
              onChange={(discipline) => edit({ discipline })}
            />
          </Field>
          <Field label="Trains on">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((e) => {
                const on = program.equipment.includes(e);
                return (
                  <Chip
                    key={e}
                    active={on}
                    onClick={() =>
                      edit({
                        equipment: on
                          ? program.equipment.filter((x) => x !== e)
                          : [...program.equipment, e],
                      })
                    }
                  >
                    {EQUIPMENT_LABELS[e]}
                  </Chip>
                );
              })}
            </div>
          </Field>
          <Field label="Grades it suits">
            <div className="flex flex-wrap gap-2">
              <Select
                value={program.gradeRange.scale}
                onChange={(e) => {
                  const scale = e.target.value as 'V' | 'YDS';
                  const list = scale === 'V' ? V_GRADES : YDS_GRADES;
                  edit({
                    gradeRange: { scale, min: list[0]!, max: list.at(-1)!, label: `${list[0]}–${list.at(-1)}` },
                  });
                }}
                className="flex-1 min-w-0"
                aria-label="Grade scale"
              >
                <option value="V">Boulder</option>
                <option value="YDS">Routes</option>
              </Select>
              {(['min', 'max'] as const).map((end) => (
                <Select
                  key={end}
                  value={program.gradeRange[end]}
                  onChange={(e) => {
                    const next = { ...program.gradeRange, [end]: e.target.value };
                    edit({ gradeRange: { ...next, label: `${next.min}–${next.max}` } });
                  }}
                  className="flex-1 min-w-0"
                  aria-label={end === 'min' ? 'Easiest grade' : 'Hardest grade'}
                >
                  {gradeOptions(program.gradeRange.scale, ladder).map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
          </Field>
        </Card>

        <Card title="Length and blocks">
          <Field label="Weeks">
            <Input
              type="number"
              min={1}
              max={MAX_WEEKS}
              value={program.weeks}
              onChange={(e) => {
                const weeks = Math.max(1, Math.min(MAX_WEEKS, Number(e.target.value) || 1));
                // Changing the length is the one edit that can invalidate
                // every phase at once, so the phases follow it.
                edit({
                  weeks,
                  phases: retile(program.phases, weeks),
                  ...(program.deloadWeeks
                    ? { deloadWeeks: program.deloadWeeks.filter((w) => w <= weeks) }
                    : {}),
                });
              }}
              aria-label="Weeks"
            />
          </Field>

          <div className="grid grid-cols-1 gap-2 mb-3">
            {program.phases.map((phase, i) => (
              <div key={phase.id} className="bg-sunken rounded-xl p-3">
                <div className="flex gap-2 mb-2">
                  <Input
                    value={phase.name}
                    onChange={(e) => edit({ phases: replace(program.phases, i, { name: e.target.value }) })}
                    placeholder={`Block ${i + 1}`}
                    aria-label={`Block ${i + 1} name`}
                    className="flex-1 min-w-0"
                  />
                  {program.phases.length > 1 && (
                    <IconButton
                      onClick={() =>
                        edit({ phases: retile(program.phases.filter((_, j) => j !== i), program.weeks) })
                      }
                      tone="danger"
                      label={`Remove ${phase.name || `block ${i + 1}`}`}
                    >
                      <Trash2 size={15} />
                    </IconButton>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-ink-soft">Weeks</span>
                  <NumberBox
                    value={phase.weekStart}
                    label={`${phase.name || `Block ${i + 1}`} first week`}
                    onChange={(weekStart) => edit({ phases: replace(program.phases, i, { weekStart }) })}
                  />
                  <span className="text-ink-soft">to</span>
                  <NumberBox
                    value={phase.weekEnd}
                    label={`${phase.name || `Block ${i + 1}`} last week`}
                    onChange={(weekEnd) => edit({ phases: replace(program.phases, i, { weekEnd }) })}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const phases: Phase[] = [
                ...program.phases,
                {
                  id: nextPhaseId(program.phases),
                  name: `Block ${program.phases.length + 1}`,
                  weekStart: 1,
                  weekEnd: 1,
                  description: '',
                  goals: [],
                },
              ];
              edit({ phases: retile(phases, program.weeks) });
            }}
          >
            <Plus size={14} /> Add a block
          </Button>

          <Field label="Deload weeks" className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: program.weeks }, (_, i) => i + 1).map((week) => {
                const on = (program.deloadWeeks ?? []).includes(week);
                return (
                  <Chip
                    key={week}
                    active={on}
                    onClick={() =>
                      edit({
                        deloadWeeks: on
                          ? (program.deloadWeeks ?? []).filter((w) => w !== week)
                          : [...(program.deloadWeeks ?? []), week].sort((a, b) => a - b),
                      })
                    }
                    className="w-11 justify-center text-center px-0 text-xs"
                  >
                    {week}
                  </Chip>
                );
              })}
            </div>
            <p className="text-xs text-ink-soft mt-2">
              Deload weeks are left out of training-load maths, so a planned easy week never reads as
              detraining.
            </p>
          </Field>
        </Card>

        <SessionTypesCard program={program} onChange={edit} />
        <LayoutCard program={program} onChange={edit} />
        <RulesCard program={program} onChange={edit} />

        <AssessmentsCard program={program} onChange={edit} />

        <Card title="Share it">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Save the program as a file. Anyone with the app can import it — the whole thing travels,
            blocks and prescriptions included.
          </p>
          <Button variant="outline" onClick={() => shareProgram(program)}>
            <Share2 size={15} /> Save as a file
          </Button>
        </Card>

        <Card title="Danger zone">
          {/* Ask, then offer it back (PLAN.md M49). This was one tap with no
              confirmation and no undo, on the most expensive thing in the app
              to recreate — a twelve-week block written by hand — while
              sessions, projects and objectives all had a net. */}
          {confirmDelete ? (
            <>
              <p className="text-sm text-ink-soft mb-3">
                {program.name || 'This program'} and everything in it — phases, sessions,
                prescriptions. You will have a moment to undo it.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={() => {
                    const deleted = program;
                    // Running a program that no longer exists leaves Home and
                    // the calendar reading a plan against nothing.
                    if (activeProgramId === deleted.id) stopProgram();
                    // `save` filters by id and appends, so it puts the program
                    // back on its own — no separate restore path needed.
                    void remove(deleted.id).then(() =>
                      offerUndo(deleted.name || 'Program', () => save(deleted)),
                    );
                    navigate('/build');
                  }}
                >
                  <Trash2 size={16} /> Delete for good
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </div>
            </>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={16} /> Delete this program
            </Button>
          )}
        </Card>
      </div>
    </>
  );
}

/** Hand the program over as a download. */
function shareProgram(program: Program): void {
  const blob = new Blob([JSON.stringify(buildProgramFile(program), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(program);
  a.click();
  URL.revokeObjectURL(url);
}

function replace<T>(list: T[], index: number, patch: Partial<T>): T[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-3 ${className}`}>
      <div className="text-sm text-ink-soft mb-1">{label}</div>
      {children}
    </div>
  );
}

function Row<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function NumberBox({ value, label, onChange }: { value: number; label: string; onChange: (n: number) => void }) {
  return (
    // A sized wrapper: `Input` sets `w-full`, so the `w-16` that used to sit
    // here was a coin flip on Tailwind's emit order rather than a width
    // (PLAN.md M102). The border and background it also carried were a
    // second copy of the control's own styling.
    <span className="w-16 shrink-0">
      <Input
        type="number"
        min={1}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="bg-surface"
        size="compact"
      />
    </span>
  );
}

function IssuePanel({ issues, runnable }: { issues: Issue[]; runnable: boolean }) {
  if (issues.length === 0) {
    return (
      <Card>
        <p className="text-sm flex items-center gap-2">
          <CircleCheck size={16} className="text-positive" /> Ready to run.
        </p>
      </Card>
    );
  }
  return (
    <Card>
      <p className="text-sm font-semibold mb-2">
        {runnable ? 'Ready to run, with notes' : 'Finish these before you can run it'}
      </p>
      <ul className="grid grid-cols-1 gap-1.5">
        {issues.map((issue, i) => (
          <li key={`${issue.field}-${i}`} className="flex gap-2 text-sm">
            {issue.level === 'error' ? (
              <TriangleAlert size={14} className="text-danger shrink-0 mt-0.5" />
            ) : (
              <Info size={14} className="text-ink-soft shrink-0 mt-0.5" />
            )}
            <span className="text-ink-soft">{issue.message}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** What the contents link should say, so it is worth tapping. */
function summarise(type: SessionType): string {
  const blocks = type.blocks?.length ?? 0;
  const drills = Object.keys(type.drillsByWeek ?? {}).length;
  if (blocks === 0 && drills === 0) return 'Write what it asks for';
  const parts = [];
  if (blocks > 0) parts.push(`${blocks} block${blocks === 1 ? '' : 's'}`);
  if (drills > 0) parts.push(`${drills} drill${drills === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function SessionTypesCard({ program, onChange }: { program: Program; onChange: (p: Partial<Program>) => void }) {
  const [name, setName] = useState('');

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const type: SessionType = {
      id: sessionTypeId(trimmed, program.sessionTypes),
      name: trimmed,
      icon: ICONS[program.sessionTypes.length % ICONS.length]!,
      description: '',
    };
    onChange({ sessionTypes: [...program.sessionTypes, type] });
    setName('');
  }

  return (
    <Card title="Session types">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        The kinds of session this program asks for. One of them should be a rest day.
      </p>
      <div className="grid grid-cols-1 gap-2 mb-3">
        {program.sessionTypes.map((type, i) => (
          <div key={type.id} className="bg-sunken rounded-xl p-3">
            <div className="flex gap-2 mb-2">
              <Select
                value={type.icon}
                onChange={(e) => onChange({ sessionTypes: replace(program.sessionTypes, i, { icon: e.target.value }) })}
                aria-label={`${type.name} icon`}
                className="bg-surface border border-line rounded-lg px-2 py-1.5 text-lg"
              >
                {ICONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </Select>
              <Input
                value={type.name}
                onChange={(e) => onChange({ sessionTypes: replace(program.sessionTypes, i, { name: e.target.value }) })}
                aria-label={`Session type ${i + 1} name`}
                className="flex-1 min-w-0"
              />
              <IconButton
                tone="danger"
                onClick={() => onChange(removeSessionType(program, type.id))}
                label={`Remove ${type.name}`}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
            <Input
              value={type.description}
              onChange={(e) =>
                onChange({ sessionTypes: replace(program.sessionTypes, i, { description: e.target.value }) })
              }
              placeholder="What happens in this session"
              aria-label={`${type.name} description`}
              className="mb-2"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                active={Boolean(type.isRest)}
                onClick={() => onChange({ sessionTypes: replace(program.sessionTypes, i, { isRest: !type.isRest }) })}
              >
                {type.isRest ? '✓ Rest day' : 'Mark as a rest day'}
              </Chip>
              {!type.isRest && (
                <Link
                  href={`/build/${program.id}/session/${type.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                >
                  {summarise(type)} <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Finger power"
          aria-label="New session type"
          className="flex-1 min-w-0"
        />
        <Button size="sm" onClick={add}>
          <Plus size={14} /> Add
        </Button>
      </div>
    </Card>
  );
}

function LayoutCard({ program, onChange }: { program: Program; onChange: (p: Partial<Program>) => void }) {
  const slots = program.recommendedLayout?.slots ?? {};

  function set(day: DayOfWeek, typeId: string) {
    const next = { ...slots };
    if (typeId === '') delete next[day];
    else next[day] = typeId;
    onChange({
      recommendedLayout: {
        name: program.recommendedLayout?.name ?? 'Recommended',
        description: program.recommendedLayout?.description ?? '',
        slots: next,
      },
    });
  }

  return (
    <Card title="Recommended week">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        Where the sessions fall in a normal week. This is what a climber gets offered when they start
        the program — they can move things afterwards.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {DAY_SHORT.map((label, day) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-10 text-sm font-semibold text-ink-soft">{label}</span>
            <Select
              value={slots[day as DayOfWeek] ?? ''}
              onChange={(e) => set(day as DayOfWeek, e.target.value)}
              aria-label={`${label} session`}
              className="flex-1 min-w-0"
            >
              <option value="">Rest</option>
              {program.sessionTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon} {t.name}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
    </Card>
  );
}

const RULE_KINDS = [
  { kind: 'sessions-per-week', label: 'Sessions per week' },
  { kind: 'min-gap-hours', label: 'Hours between sessions of a type' },
  { kind: 'max-per-week', label: 'Most of one type per week' },
  { kind: 'not-day-before', label: 'Never the day before' },
] as const;

function RulesCard({ program, onChange }: { program: Program; onChange: (p: Partial<Program>) => void }) {
  const types = program.sessionTypes;
  const [kind, setKind] = useState<(typeof RULE_KINDS)[number]['kind']>('sessions-per-week');

  function add() {
    const first = types[0]?.id;
    const second = types[1]?.id ?? first;
    if (kind !== 'sessions-per-week' && !first) return;
    const made: Constraint =
      kind === 'sessions-per-week'
        ? { kind, min: 3, max: 5, note: 'Three to five sessions a week.' }
        : kind === 'min-gap-hours'
          ? { kind, between: [first!], hours: 48, note: 'Leave time between these.' }
          : kind === 'max-per-week'
            ? { kind, sessionTypeId: first!, count: 2, note: 'No more than this many a week.' }
            : { kind, sessionTypeId: first!, before: second!, note: 'Do not stack these.' };
    onChange({ constraints: [...program.constraints, made] });
  }

  return (
    <Card title="Rules">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        What the planner should warn about. These are checked live when a week is arranged, so a rule
        you write here is a rule the calendar enforces.
      </p>

      <div className="grid grid-cols-1 gap-2 mb-3">
        {program.constraints.map((c, i) => (
          <div key={i} className="bg-sunken rounded-xl p-3">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-sm font-semibold flex-1">{ruleTitle(c, program)}</span>
              <IconButton
                tone="danger"
                onClick={() => onChange({ constraints: program.constraints.filter((_, j) => j !== i) })}
                label={`Remove rule ${i + 1}`}
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
            <RuleFields
              constraint={c}
              types={types}
              onChange={(next) => onChange({ constraints: replace(program.constraints, i, next) })}
            />
            <Input
              value={c.note}
              onChange={(e) => onChange({ constraints: replace(program.constraints, i, { note: e.target.value }) })}
              placeholder="Why — shown when the rule fires"
              aria-label={`Rule ${i + 1} note`}
              className="mt-2"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          aria-label="Rule type"
          className="flex-1 min-w-0"
        >
          {RULE_KINDS.map((r) => (
            <option key={r.kind} value={r.kind}>
              {r.label}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={add} disabled={types.length === 0 && kind !== 'sessions-per-week'}>
          <Plus size={14} /> Add
        </Button>
      </div>
    </Card>
  );
}

function ruleTitle(c: Constraint, program: Program): string {
  const name = (id: string) => program.sessionTypes.find((t) => t.id === id)?.name ?? id;
  switch (c.kind) {
    case 'sessions-per-week':
      return `${c.min}–${c.max} sessions a week`;
    case 'min-gap-hours':
      return `${c.hours}h between ${c.between.map(name).join(' and ') || 'sessions'}`;
    case 'max-per-week':
      return `At most ${c.count} × ${name(c.sessionTypeId)} a week`;
    case 'order-in-week':
      return `${name(c.first)} before ${name(c.then)}`;
    case 'not-day-before':
      return `${name(c.sessionTypeId)} never the day before ${name(c.before)}`;
  }
}

function RuleFields({
  constraint,
  types,
  onChange,
}: {
  constraint: Constraint;
  types: SessionType[];
  onChange: (patch: Partial<Constraint>) => void;
}) {
  const small = 'w-20 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm';
  const picker = 'flex-1 min-w-0 bg-surface border border-line rounded-lg px-2 py-1.5 text-sm';

  switch (constraint.kind) {
    case 'sessions-per-week':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="number" min={0} value={constraint.min} aria-label="Fewest sessions"
            onChange={(e) => onChange({ min: Number(e.target.value) || 0 } as Partial<Constraint>)}
            className={small}
          />
          <span className="text-ink-soft">to</span>
          <Input
            type="number" min={0} value={constraint.max} aria-label="Most sessions"
            onChange={(e) => onChange({ max: Number(e.target.value) || 0 } as Partial<Constraint>)}
            className={small}
          />
        </div>
      );
    case 'min-gap-hours':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Select
            value={constraint.between[0] ?? ''} aria-label="Which sessions"
            onChange={(e) => onChange({ between: [e.target.value] } as Partial<Constraint>)}
            className={picker}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Input
            type="number" min={0} value={constraint.hours} aria-label="Hours"
            onChange={(e) => onChange({ hours: Number(e.target.value) || 0 } as Partial<Constraint>)}
            className={small}
          />
          <span className="text-ink-soft">h</span>
        </div>
      );
    case 'max-per-week':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Select
            value={constraint.sessionTypeId} aria-label="Which session"
            onChange={(e) => onChange({ sessionTypeId: e.target.value } as Partial<Constraint>)}
            className={picker}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Input
            type="number" min={1} value={constraint.count} aria-label="How many"
            onChange={(e) => onChange({ count: Number(e.target.value) || 1 } as Partial<Constraint>)}
            className={small}
          />
        </div>
      );
    case 'not-day-before':
      return (
        <div className="flex items-center gap-2 text-sm">
          <Select
            value={constraint.sessionTypeId} aria-label="Which session"
            onChange={(e) => onChange({ sessionTypeId: e.target.value } as Partial<Constraint>)}
            className={picker}
          >
            {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </Select>
          <span className="text-ink-soft shrink-0">before</span>
          <Select
            value={constraint.before} aria-label="Before which session"
            onChange={(e) => onChange({ before: e.target.value } as Partial<Constraint>)}
            className={picker}
          >
            {types.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </Select>
        </div>
      );
    case 'order-in-week':
      // Forked programs can carry this; the builder does not offer to make
      // new ones, so it is shown and removable rather than editable.
      return <p className="text-xs text-ink-soft">Carried over from the program this was copied from.</p>;
  }
}

/**
 * Which benchmarks this program tries to move.
 *
 * They drive the assessment battery's phase-boundary prompts, so a program
 * that names none simply never asks the climber to retest — which is a
 * choice, not a fault.
 */
function AssessmentsCard({ program, onChange }: { program: Program; onChange: (p: Partial<Program>) => void }) {
  const [open, setOpen] = useState(false);
  const chosen = new Set(program.assessments);
  const metrics = allMetrics();

  return (
    <Card title="Benchmarks">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        Numbers this program is trying to move. The app asks for a retest at each block boundary, so
        the strength curve has something to draw.
      </p>
      {program.assessments.length > 0 && (
        <ul className="grid grid-cols-1 gap-1 mb-3 text-sm">
          {program.assessments.map((id) => (
            <li key={id} className="text-ink-soft">
              · {metrics.find((m) => m.id === id)?.label ?? id}
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="flex flex-wrap gap-1.5">
          {metrics.map((metric) => {
            const on = chosen.has(metric.id);
            return (
              <Chip
                key={metric.id}
                active={on}
                onClick={() =>
                  onChange({
                    assessments: on
                      ? program.assessments.filter((a) => a !== metric.id)
                      : [...program.assessments, metric.id],
                  })
                }
              >
                {metric.label}
              </Chip>
            );
          })}
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          {program.assessments.length > 0 ? 'Change' : 'Pick benchmarks'}
        </Button>
      )}
    </Card>
  );
}
