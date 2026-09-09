import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, ArrowRight, Flag, Plus } from 'lucide-react';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import { today } from '@/engine/dates';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveClimberState } from '@/engine/derive';
import { deriveStats } from '@/engine/stats';
import {
  MAX_ACTIVE,
  activeObjectives,
  describeProgress,
  newObjectiveId,
  objectiveProgress,
  rankObjectives,
  suggestedRequirements,
  type Objective,
  type ObjectiveKind,
} from '@/engine/objectives';
import type { SkillInput } from '@/engine/skills';
import { useXp } from '@/store/game';
import { useMetrics } from '@/store/metrics';
import { useObjectives } from '@/store/objectives';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';
import { useGradeOptions } from '@/ui/useGrade';

const input = 'w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm';

const KINDS: { value: ObjectiveKind; label: string; blurb: string }[] = [
  { value: 'boulder', label: 'A boulder', blurb: 'A named line' },
  { value: 'route', label: 'A route', blurb: 'A pitch or a wall' },
  { value: 'trip', label: 'A trip', blurb: 'Somewhere you are going' },
  { value: 'other', label: 'Something else', blurb: 'A grade, a comp, a goal' },
];

/** Everything the requirement measurer needs, derived once. */
export function useSkillInput(): SkillInput {
  const byDate = useSessions((s) => s.byDate);
  const metrics = useMetrics((s) => s.entries);
  const projects = useProjects((s) => s.projects);
  const xp = useXp();
  const display = useSettings((s) => s.display);

  return useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    return {
      state,
      stats: deriveStats({ state, metrics, projects }),
      metrics,
      projects,
      level: xp.progress.level,
      feet: deriveAltimeter(sessions).feet,
      display,
    };
  }, [byDate, metrics, projects, xp.progress.level, display]);
}

export function ObjectivesPage() {
  const objectives = useObjectives((s) => s.objectives);
  const hydrated = useObjectives((s) => s.hydrated);
  const load = useObjectives((s) => s.load);
  const skillInput = useSkillInput();

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const readiness = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of objectives) map.set(o.id, objectiveProgress(o, skillInput).readiness);
    return map;
  }, [objectives, skillInput]);

  const ranked = rankObjectives(objectives, readiness);
  const active = activeObjectives(objectives);

  return (
    <>
      <Link href="/train" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Train
      </Link>
      <PageHeader
        title="Objectives"
        subtitle="Something to work toward that a single block of training cannot finish."
      />

      <div className="grid grid-cols-1 gap-3">
        {objectives.length === 0 && (
          <Card>
            <p className="text-sm leading-relaxed">
              A program ends. An objective does not. Name the thing you are actually training for —
              a line, a grade, a trip — and say what has to be true before it is realistic. The app
              measures the rest from your log.
            </p>
          </Card>
        )}

        {ranked.map((objective) => {
          const progress = objectiveProgress(objective, skillInput);
          return (
            <Link
              key={objective.id}
              href={`/objectives/${objective.id}`}
              className="block bg-surface border border-line rounded-2xl p-4"
            >
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-bold flex-1 min-w-0 truncate">{objective.name}</span>
                {objective.grade && <span className="text-xs font-semibold text-accent">{objective.grade}</span>}
                <ArrowRight size={15} className="text-ink-soft shrink-0" />
              </div>
              <div className="h-1.5 rounded-full bg-sunken overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(progress.readiness * 100)}%` }}
                />
              </div>
              <p className="text-xs text-ink-soft">
                {objective.status === 'sent'
                  ? 'Done.'
                  : objective.status === 'shelved'
                    ? 'Shelved.'
                    : describeProgress(progress)}
              </p>
            </Link>
          );
        })}

        {active.length < MAX_ACTIVE ? (
          <NewObjective />
        ) : (
          <Card>
            <p className="text-sm text-ink-soft leading-relaxed">
              {MAX_ACTIVE} on the go is the limit. More than that and none of them is really the
              objective — shelve one to start another.
            </p>
          </Card>
        )}
      </div>
    </>
  );
}

function NewObjective() {
  const save = useObjectives((s) => s.save);
  const [, navigate] = useLocation();
  const gradeOptions = useGradeOptions();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ObjectiveKind>('boulder');
  const [scale, setScale] = useState<GradeScale>('V');
  const [grade, setGrade] = useState('');
  const [targetDate, setTargetDate] = useState('');

  const ladder = scale === 'V' ? V_GRADES : YDS_GRADES;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const objective: Objective = {
      id: newObjectiveId(),
      name: trimmed.slice(0, 80),
      kind,
      status: 'planning',
      ...(grade ? { grade, scale } : {}),
      ...(targetDate ? { targetDate } : {}),
      // A starting point, not a prescription — all of it is editable.
      requirements: suggestedRequirements(kind, scale, grade, ladder),
      createdAt: now,
      updatedAt: now,
    };
    await save(objective);
    navigate(`/objectives/${objective.id}`);
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Plus size={16} /> Name an objective
      </Button>
    );
  }

  return (
    <Card title="What are you training for?">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="The Nose, first V8, Font in October"
        aria-label="Objective name"
        className={`${input} mb-3`}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-2 mb-3">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => setKind(k.value)}
            className={`rounded-xl px-3 py-2.5 border text-left ${
              kind === k.value ? 'border-accent bg-accent/10' : 'border-line bg-sunken'
            }`}
          >
            <div className="font-semibold text-sm">{k.label}</div>
            <div className="text-xs text-ink-soft">{k.blurb}</div>
          </button>
        ))}
      </div>

      {(kind === 'boulder' || kind === 'route' || kind === 'other') && (
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            value={scale}
            onChange={(e) => {
              setScale(e.target.value as GradeScale);
              setGrade('');
            }}
            aria-label="Grade scale"
            className={`${input} flex-1 min-w-0`}
          >
            <option value="V">Boulder</option>
            <option value="YDS">Route</option>
          </select>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            aria-label="Grade"
            className={`${input} flex-1 min-w-0`}
          >
            <option value="">No grade</option>
            {gradeOptions(scale, ladder).map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="text-sm block mb-3">
        <span className="block text-ink-soft mb-1">When do you want to be on it? (optional)</span>
        <input
          type="date"
          min={today()}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          aria-label="Target date"
          className={input}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void create()} disabled={!name.trim()}>
          <Flag size={15} /> Start it
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-ink-soft mt-3 leading-relaxed">
        You will get a suggested list of what has to be true first — a pyramid under the grade, time
        on rock, weeks that held together. Change all of it; you know the climb, the app does not.
      </p>
    </Card>
  );
}
