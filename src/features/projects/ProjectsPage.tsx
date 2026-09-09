import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Check, Lightbulb, Plus, X } from 'lucide-react';
import { ACTIVE_CAP, type Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import { suggestProjects, summariseProject, type ProjectSuggestion } from '@/engine/projects';
import { useProjects } from '@/store/projects';
import { useSkillEffects } from '@/store/skills';
import { useSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

export function ProjectsPage() {
  const projects = useProjects((s) => s.projects);
  const dismissed = useProjects((s) => s.dismissed);
  const hydrated = useProjects((s) => s.hydrated);
  const load = useProjects((s) => s.load);
  const dismiss = useProjects((s) => s.dismiss);
  const byDate = useSessions((s) => s.byDate);
  const [adding, setAdding] = useState<Partial<Project> | null>(null);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const suggestions = useMemo(
    () => suggestProjects(sessions, projects, dismissed),
    [sessions, projects, dismissed],
  );

  const extraSlots = useSkillEffects().projectSlots;
  const cap = ACTIVE_CAP + extraSlots;
  const active = projects.filter((p) => p.status === 'active');
  const sent = projects.filter((p) => p.status === 'sent');
  const shelved = projects.filter((p) => p.status === 'shelved');
  const full = active.length >= cap;

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={active.length > 0 ? `${active.length} of ${cap} active` : 'The climbs you are working'}
        action={
          !adding && (
            <Button size="sm" onClick={() => setAdding({})}>
              <Plus size={15} /> New
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3">
        {adding && (
          <ProjectForm
            initial={adding}
            capped={full}
            cap={cap}
            onCancel={() => setAdding(null)}
            onSaved={() => setAdding(null)}
          />
        )}

        {suggestions.length > 0 && !adding && (
          <Card title="Spotted in your logs">
            <ul className="grid grid-cols-1 gap-2">
              {suggestions.slice(0, 3).map((s) => (
                <SuggestionRow
                  key={s.key}
                  suggestion={s}
                  onTrack={() =>
                    setAdding({ name: s.name, grade: s.grade, scale: s.scale, setting: 'indoor' })
                  }
                  onDismiss={() => void dismiss(s.key)}
                />
              ))}
            </ul>
          </Card>
        )}

        {projects.length === 0 && !adding && (
          <Card>
            <p className="text-sm leading-relaxed text-ink-soft">
              A project is a climb you cannot do yet. Track one and every burn you log builds a
              high-point line, so you can see the difference between grinding and progressing.
            </p>
          </Card>
        )}

        {active.length > 0 && (
          <Card title="Active">
            <ul className="grid grid-cols-1 gap-2">
              {active.map((p) => (
                <ProjectRow key={p.id} project={p} sessions={sessions} />
              ))}
            </ul>
            {full && (
              <p className="text-xs text-ink-soft mt-3">
                {cap} is the cap{extraSlots > 0 ? ' with your skill-tree slots' : ''}. Send one or
                shelve one before starting another — a project you are not actually trying is a
                to-do list, not a project.
              </p>
            )}
          </Card>
        )}

        {sent.length > 0 && (
          <Card title="Sent">
            <ul className="grid grid-cols-1 gap-2">
              {sent.map((p) => (
                <ProjectRow key={p.id} project={p} sessions={sessions} />
              ))}
            </ul>
          </Card>
        )}

        {shelved.length > 0 && (
          <Card title="Shelved">
            <ul className="grid grid-cols-1 gap-2">
              {shelved.map((p) => (
                <ProjectRow key={p.id} project={p} sessions={sessions} />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

function SuggestionRow({
  suggestion,
  onTrack,
  onDismiss,
}: {
  suggestion: ProjectSuggestion;
  onTrack: () => void;
  onDismiss: () => void;
}) {
  return (
    <li className="bg-sunken rounded-xl px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Lightbulb size={15} className="text-accent shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">
            You have tried <span className="font-semibold">{suggestion.name}</span> ({suggestion.grade})
            on {suggestion.sessions} sessions. Track it as a project?
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={onTrack}>
              Track it
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Not a project
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}

function ProjectRow({ project, sessions }: { project: Project; sessions: Session[] }) {
  const summary = summariseProject(project.id, sessions);
  const stale = summary.daysSinceLast !== null && summary.daysSinceLast >= 14 && project.status === 'active';

  return (
    <li>
      <Link
        href={`/projects/${project.id}`}
        className="flex items-center gap-3 bg-sunken rounded-xl px-3 py-2.5"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-sm truncate">{project.name}</span>
            <span className="text-xs font-bold text-accent shrink-0">{project.grade}</span>
          </div>
          <p className="text-xs text-ink-soft mt-0.5">
            {summary.burns === 0
              ? 'No burns yet'
              : `${summary.burns} burn${summary.burns === 1 ? '' : 's'} over ${summary.days} day${summary.days === 1 ? '' : 's'}`}
            {project.location ? ` · ${project.location}` : ''}
          </p>
        </div>
        {project.status === 'sent' ? (
          <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-positive">
            <Check size={13} /> Sent
          </span>
        ) : summary.highPoint !== null ? (
          <span className="shrink-0 text-xs font-bold tabular-nums">{summary.highPoint}%</span>
        ) : null}
        {stale && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5">
            {summary.daysSinceLast}d
          </span>
        )}
      </Link>
    </li>
  );
}

export function ProjectForm({
  initial,
  capped,
  cap = ACTIVE_CAP,
  onCancel,
  onSaved,
}: {
  initial: Partial<Project>;
  capped: boolean;
  cap?: number;
  onCancel: () => void;
  onSaved: (project: Project) => void;
}) {
  const create = useProjects((s) => s.create);
  const [name, setName] = useState(initial.name ?? '');
  const [scale, setScale] = useState<GradeScale>(initial.scale ?? 'V');
  const [grade, setGrade] = useState(initial.grade ?? 'V5');
  const [setting, setSetting] = useState<'indoor' | 'outdoor'>(initial.setting ?? 'indoor');
  const [location, setLocation] = useState(initial.location ?? '');
  const grades = scale === 'V' ? V_GRADES : YDS_GRADES;

  async function save() {
    const project = await create({
      name: name.trim(),
      grade,
      scale,
      setting,
      ...(location.trim() ? { location: location.trim() } : {}),
    });
    onSaved(project);
  }

  return (
    <Card title="New project">
      {capped && (
        <p className="text-sm text-warn mb-3">
          You already have {cap} active. This one will be added anyway — but consider shelving one
          you have not touched.
        </p>
      )}
      <label className="text-sm block mb-3">
        <span className="block text-ink-soft mb-1">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Midnight Lightning"
          className="w-full bg-sunken border border-line rounded-xl px-3 py-2.5"
        />
      </label>
      <div className="flex gap-2 mb-3">
        <select
          value={scale}
          onChange={(e) => {
            const next = e.target.value as GradeScale;
            setScale(next);
            setGrade(next === 'V' ? 'V5' : '5.11a');
          }}
          aria-label="Discipline"
          className="bg-sunken border border-line rounded-xl px-2.5 py-2.5 text-sm"
        >
          <option value="V">Boulder</option>
          <option value="YDS">Route</option>
        </select>
        <select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          aria-label="Grade"
          className="flex-1 bg-sunken border border-line rounded-xl px-2.5 py-2.5 text-sm"
        >
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={setting}
          onChange={(e) => setSetting(e.target.value as 'indoor' | 'outdoor')}
          aria-label="Setting"
          className="bg-sunken border border-line rounded-xl px-2.5 py-2.5 text-sm"
        >
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
        </select>
      </div>
      <label className="text-sm block mb-3">
        <span className="block text-ink-soft mb-1">Where (optional)</span>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Camp 4, or the cave"
          className="w-full bg-sunken border border-line rounded-xl px-3 py-2.5"
        />
      </label>
      <div className="flex gap-2">
        <Button disabled={name.trim() === ''} onClick={() => void save()}>
          <Check size={15} /> Track it
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          <X size={15} /> Cancel
        </Button>
      </div>
    </Card>
  );
}
