import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowRight, CircleCheck, Plus, Target, Trash2 } from 'lucide-react';
import { DRILL_CATEGORIES } from '@/content/drills';
import { V_GRADES, YDS_GRADES } from '@/engine/grades';
import { fromKey, today } from '@/engine/dates';
import {
  describeProgress,
  newRequirementId,
  objectiveProgress,
  trainableByProgram,
  type Objective,
  type ObjectiveStatus,
} from '@/engine/objectives';
import type { SkillRequirement } from '@/engine/skills';
import { WEEK_LABEL, describePeak, keepsFitness, peakPlan, type PeakPlan } from '@/engine/peak';
import { loadTrend } from '@/engine/loadTrend';
import { getProgram } from '@/content/programs';
import { useSessions } from '@/store/sessions';
import { useProfile } from '@/store/profile';
import { LoadTrendLine } from '@/ui/charts/LoadTrendLine';
import { useObjectives } from '@/store/objectives';
import { offerUndo } from '@/store/undo';
import { useProjects } from '@/store/projects';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CHIP_LINK, Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Meter } from '@/ui/Meter';
import { Input, Select, TextArea } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { useGradeOptions } from '@/ui/useGrade';
import { useSkillInput } from './ObjectivesPage';
import { RecordNotFound } from '@/ui/RecordNotFound';
import { PageSkeleton } from '@/ui/Skeleton';

const STATUSES: { value: ObjectiveStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'training', label: 'Training for it' },
  { value: 'sent', label: 'Done' },
  { value: 'shelved', label: 'Shelved' },
];

/** The requirement kinds worth offering by hand, with sensible starting values. */
const ADDABLE: { label: string; make: () => SkillRequirement }[] = [
  { label: 'Sends at a grade', make: () => ({ kind: 'sends', scale: 'V', grade: 'V5', count: 10 }) },
  { label: 'Clean first goes', make: () => ({ kind: 'style-sends', style: 'flash', count: 10 }) },
  { label: 'Days on rock', make: () => ({ kind: 'outdoor-days', count: 12 }) },
  { label: 'Sessions logged', make: () => ({ kind: 'sessions', count: 60 }) },
  { label: 'Hours climbing', make: () => ({ kind: 'hours', hours: 80 }) },
  { label: 'Weeks on target', make: () => ({ kind: 'streak-weeks', weeks: 8 }) },
  { label: 'Projects sent', make: () => ({ kind: 'projects-sent', count: 3 }) },
  { label: 'Rest days logged', make: () => ({ kind: 'rest-days', count: 20 }) },
  { label: 'Grade variety', make: () => ({ kind: 'grade-variety', count: 6 }) },
  { label: 'Drills of a kind', make: () => ({ kind: 'drills', category: 'technique', count: 10 }) },
];

export function ObjectiveDetailPage({ params }: { params: { id: string } }) {
  const objectives = useObjectives((s) => s.objectives);
  const hydrated = useObjectives((s) => s.hydrated);
  const load = useObjectives((s) => s.load);
  const save = useObjectives((s) => s.save);
  const remove = useObjectives((s) => s.remove);
  const projects = useProjects((s) => s.projects);
  const skillInput = useSkillInput();
  const [, navigate] = useLocation();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const objective = objectives.find((o) => o.id === params.id);

  // Wait for the store before deciding it is missing, or a reload lands on
  // "Not found" for one frame and then swaps to the record (PLAN.md M22).
  if (!hydrated) return <PageSkeleton title="Objective" />;
  if (!objective) {
    return (
      <RecordNotFound what="That objective" backTo="/objectives" backLabel="Back to objectives">
        It may have been completed and cleared, or deleted.
      </RecordNotFound>
    );
  }

  const progress = objectiveProgress(objective, skillInput);
  // Returns the write, so an undo that calls it resolves when the store has
  // actually changed — the bar announces "restored" on that promise.
  const edit = (patch: Partial<Objective>) => save({ ...objective, ...patch });
  const planning = objective.status === 'planning' || objective.status === 'training';

  return (
    <>
      <BackLink />
      <PageHeader
        title={objective.name}
        subtitle={[
          objective.grade,
          objective.location,
          objective.targetDate &&
            `for ${fromKey(objective.targetDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-2xl font-black tabular-nums">{Math.round(progress.readiness * 100)}%</span>
            <span className="text-sm text-ink-soft">
              {progress.met} of {progress.total} met
            </span>
          </div>
          <Meter
            value={progress.readiness}
            size="lg"
            label="Readiness"
            valueText={`${progress.met} of ${progress.total} requirements met`}
            className="mb-2"
          />
          <p className="text-sm text-ink-soft leading-relaxed">{describeProgress(progress)}</p>
        </Card>

        {objective.targetDate && planning && <RunwayCard target={objective.targetDate} />}

        {progress.weakest && (
          <Card title="Furthest away">
            <div className="flex items-start gap-2">
              <Target size={16} className="text-accent shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-sm">{progress.weakest.measurement.detail}</p>
                <p className="text-sm text-ink-soft mt-0.5">
                  {progress.weakest.measurement.current} of {progress.weakest.measurement.target} so far.
                  {progress.weakest.why ? ` ${progress.weakest.why}` : ''}
                </p>
              </div>
            </div>
            {trainableByProgram(progress.weakest.requirement) && (
              <Link
                href="/find"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent mt-3"
              >
                Find a program that trains this <ArrowRight size={14} />
              </Link>
            )}
          </Card>
        )}

        <Card title="What has to be true">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            Measured from your log, not ticked by hand. Change any of them — you know what the climb
            asks for and the app does not.
          </p>
          <ul className="grid grid-cols-1 gap-2 mb-3">
            {progress.measured.map((m) => (
              <li key={m.id} className="bg-sunken rounded-xl px-3 py-2.5">
                <div className="flex items-start gap-2">
                  {m.measurement.met ? (
                    <CircleCheck size={15} className="text-positive shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-[15px] h-[15px] rounded-full border border-line shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${m.measurement.met ? 'opacity-70' : ''}`}>
                      {m.measurement.detail}
                    </div>
                    <div className="text-xs text-ink-soft tabular-nums">
                      {m.measurement.current} / {m.measurement.target}
                    </div>
                    {!m.measurement.met && (
                      <Meter
                        value={m.fraction}
                        size="sm"
                        label={m.measurement.detail}
                        valueText={`${m.measurement.current} of ${m.measurement.target}`}
                        className="mt-1.5"
                      />
                    )}
                  </div>
                  <IconButton
                    onClick={() => {
                      // A requirement can carry the climber's own "why"; the
                      // whole list goes back, order included (PLAN.md M79).
                      const before = objective.requirements;
                      void edit({ requirements: before.filter((r) => r.id !== m.id) });
                      offerUndo(m.measurement.detail, () => edit({ requirements: before }));
                    }}
                    label={`Remove: ${m.measurement.detail}`}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
                <RequirementFields
                  requirement={m.requirement}
                  onChange={(next) =>
                    edit({
                      requirements: objective.requirements.map((r) =>
                        r.id === m.id ? { ...r, requirement: { ...r.requirement, ...next } as SkillRequirement } : r,
                      ),
                    })
                  }
                />
              </li>
            ))}
          </ul>

          {adding ? (
            <div className="flex flex-wrap gap-1.5">
              {ADDABLE.map((option) => (
                <Button
                  key={option.label}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    edit({
                      requirements: [
                        ...objective.requirements,
                        { id: newRequirementId(), requirement: option.make() },
                      ],
                    });
                    setAdding(false);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add one
            </Button>
          )}
        </Card>

        <Card title="Where it stands">
          <div className="flex flex-wrap gap-2 mb-3">
            {STATUSES.map((s) => (
              <Chip
                key={s.value}
                active={objective.status === s.value}
                onClick={() => edit({ status: s.value })}
              >
                {s.label}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-ink-soft leading-relaxed">
            Marking it done records that it happened. It pays nothing — the session that sent it
            already did, and a status you set by hand is not something to be paid for.
          </p>
        </Card>

        <Card title="Details">
          <label className="text-sm block mb-3">
            <span className="block text-ink-soft mb-1">Where is it?</span>
            <Input
              value={objective.location ?? ''}
              onChange={(e) => edit({ location: e.target.value || undefined })}
              placeholder="Yosemite, the cave at the back, anywhere"
              aria-label="Location"
            />
          </label>
          <label className="text-sm block mb-3">
            <span className="block text-ink-soft mb-1">Notes</span>
            <TextArea
              value={objective.notes ?? ''}
              onChange={(e) => edit({ notes: e.target.value || undefined })}
              rows={3}
              placeholder="Beta, conditions, who you are going with"
              aria-label="Notes"
              className="resize-y"
            />
          </label>
          {projects.length > 0 && (
            <label className="text-sm block">
              <span className="block text-ink-soft mb-1">Is this a project you are already on?</span>
              <Select
                value={objective.projectId ?? ''}
                onChange={(e) => edit({ projectId: e.target.value || undefined })}
                aria-label="Linked project"
              >
                <option value="">Not yet</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </Card>

        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            const deleted = objective;
            // `save` filters by id and appends, so it puts a deleted
            // objective back on its own — no restore action needed here.
            void remove(deleted.id).then(() =>
              offerUndo(deleted.name || 'Objective', () => save(deleted)),
            );
            navigate('/objectives');
          }}
        >
          <Trash2 size={16} /> Delete this objective
        </Button>
      </div>
    </>
  );
}

/** The one or two numbers a requirement actually has. */
function RequirementFields({
  requirement,
  onChange,
}: {
  requirement: SkillRequirement;
  onChange: (patch: Partial<SkillRequirement>) => void;
}) {
  const gradeOptions = useGradeOptions();
  const small = 'bg-surface w-20';
  const wide = 'bg-surface flex-1 min-w-0';
  const number = (value: number, label: string, key: string) => (
    <Input
      type="number"
      min={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange({ [key]: Math.max(1, Number(e.target.value) || 1) } as Partial<SkillRequirement>)}
      size="compact"
      className={small}
    />
  );

  switch (requirement.kind) {
    case 'sends': {
      const ladder = requirement.scale === 'V' ? V_GRADES : YDS_GRADES;
      return (
        <div className="flex flex-wrap items-center gap-2 mt-2 pl-6">
          {number(requirement.count, 'How many sends', 'count')}
          <span className="text-xs text-ink-soft">at</span>
          <Select
            value={requirement.grade}
            aria-label="Grade"
            onChange={(e) => onChange({ grade: e.target.value } as Partial<SkillRequirement>)}
            size="compact"
            className={wide}
          >
            {gradeOptions(requirement.scale, ladder).map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </Select>
        </div>
      );
    }
    case 'drills':
      return (
        <div className="flex flex-wrap items-center gap-2 mt-2 pl-6">
          {number(requirement.count, 'How many drills', 'count')}
          <Select
            value={requirement.category}
            aria-label="Drill category"
            onChange={(e) => onChange({ category: e.target.value } as Partial<SkillRequirement>)}
            size="compact"
            className={wide}
          >
            {Object.entries(DRILL_CATEGORIES).map(([id, meta]) => (
              <option key={id} value={id}>
                {meta.label}
              </option>
            ))}
          </Select>
        </div>
      );
    case 'hours':
      return <div className="mt-2 pl-6">{number(requirement.hours, 'Hours', 'hours')}</div>;
    case 'streak-weeks':
      return <div className="mt-2 pl-6">{number(requirement.weeks, 'Weeks', 'weeks')}</div>;
    case 'sessions':
    case 'style-sends':
    case 'grade-variety':
    case 'outdoor-days':
    case 'projects-sent':
    case 'rest-days':
      return <div className="mt-2 pl-6">{number(requirement.count, 'How many', 'count')}</div>;
    default:
      // Level, height, metric and stat requirements come from the skill
      // trees' vocabulary and have no sensible editor here yet.
      return null;
  }
}

/**
 * The weeks between here and the trip (PLAN.md M73).
 *
 * A prescription, not a forecast, and the copy is held to that: it says what
 * the weeks should weigh and never what the trip will be like. It is also
 * recomputed from scratch every time it is looked at, so a week that did not
 * go to plan is not a failure the app remembers — it is just a different
 * starting point for the same question.
 */
function RunwayCard({ target }: { target: string }) {
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;

  const plan = useMemo(
    () => peakPlan({ sessions, target, ...(program ? { program } : {}), ...(startDate ? { startDate } : {}) }),
    [sessions, target, program, startDate],
  );
  // Six weeks of history rather than the usual ninety days: the plan can add
  // twelve weeks to the far end, and a chart squeezing four months of past
  // against three of future is unreadable at either end.
  const trend = useMemo(() => loadTrend({ sessions, to: today(), days: HISTORY_DAYS }), [sessions]);

  if (plan.withheld !== null) {
    return (
      <Card title="The runway">
        <p className="text-sm text-ink-soft leading-relaxed">{describePeak(plan)}</p>
        {plan.withheld === 'too-far' && (
          <Link href="/find" className={`${CHIP_LINK} mt-3`}>
            Find a program <ArrowRight size={14} className="ml-1" />
          </Link>
        )}
      </Card>
    );
  }

  return (
    <Card title="The runway">
      <p className="text-sm leading-relaxed mb-3">{describePeak(plan)}</p>
      <LoadTrendLine trend={trend} plan={plan} />
      <WeekTable plan={plan} />
      {!keepsFitness(plan) && (
        <p className="text-xs text-ink-soft mt-2 leading-relaxed">
          Too short to build in, so the baseline goes down rather than up. That is the cost of
          a late start, not a mistake in the plan.
        </p>
      )}
      <p className="text-xs text-ink-soft mt-2 leading-relaxed">
        Loads are what the app counts from your own sessions — effort times time. This is
        recomputed from where you actually are, so a week that went differently changes the
        plan rather than breaking it.
      </p>
    </Card>
  );
}

/** Six weeks back, so the plan has room on the same axis. */
const HISTORY_DAYS = 42;

function WeekTable({ plan }: { plan: PeakPlan }) {
  return (
    <table className="w-full text-sm mt-3">
      <caption className="sr-only">Target load for each week up to the trip</caption>
      <thead>
        <tr className="text-2xs uppercase tracking-widest text-ink-soft">
          <th scope="col" className="text-left font-bold py-1">Week</th>
          <th scope="col" className="text-left font-bold py-1">Shape</th>
          <th scope="col" className="text-right font-bold py-1">Of your usual</th>
        </tr>
      </thead>
      <tbody>
        {plan.weeks.map((week) => (
          <tr key={week.ends} className="border-t border-line">
            <th scope="row" className="text-left font-normal text-ink-soft py-1.5">
              {fromKey(week.ends).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </th>
            <td className="py-1.5">{WEEK_LABEL[week.kind]}</td>
            <td className="py-1.5 text-right font-bold tabular-nums">{Math.round(week.ofNow * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
