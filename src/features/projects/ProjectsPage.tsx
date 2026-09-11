import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Check, Lightbulb, Plus, X } from 'lucide-react';
import { ACTIVE_CAP, type Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { V_GRADES, YDS_GRADES, displayGrade, type GradeScale } from '@/engine/grades';
import { PageGrid } from '@/ui/PageGrid';
import { useGradeLabel, useGradeOptions } from '@/ui/useGrade';
import { suggestProjects, summariseProject, type ProjectSuggestion } from '@/engine/projects';
import { ENOUGH, projectHistory } from '@/engine/projectHistory';
import { useSettings } from '@/store/settings';
import { useProjects } from '@/store/projects';
import { useSkillEffects } from '@/store/skills';
import { useSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { Input, Select } from '@/ui/Field';
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

      <PageGrid>
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
          <EmptyState>
            A project is a climb you cannot do yet. Track one and every burn you log builds a
            high-point line, so you can see the difference between grinding and progressing.
          </EmptyState>
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

        <CostCard projects={projects} sessions={sessions} />

        {shelved.length > 0 && (
          <Card title="Shelved">
            <ul className="grid grid-cols-1 gap-2">
              {shelved.map((p) => (
                <ProjectRow key={p.id} project={p} sessions={sessions} />
              ))}
            </ul>
          </Card>
        )}
      </PageGrid>
    </>
  );
}

/**
 * What the projects have cost (PLAN.md M69).
 *
 * Every attempt was stored and nothing ever read them together, so a climber
 * could see one project's history and never "how do I send". Counts of what
 * happened, not advice about it — and quiet where there is too little to
 * mean anything.
 */
function CostCard({ projects, sessions }: { projects: Project[]; sessions: Session[] }) {
  const display = useSettings((s) => s.display);
  const history = useMemo(() => projectHistory(projects, sessions), [projects, sessions]);
  if (history.sent.length === 0) return null;

  const stale = history.openest[0];
  return (
    <Card title="What they cost">
      {history.overall ? (
        <p className="text-sm leading-relaxed">
          Across {history.overall.sends} sends, a project takes you{' '}
          <strong>{history.overall.burns} burns</strong> over{' '}
          <strong>{history.overall.sessions} {history.overall.sessions === 1 ? 'session' : 'sessions'}</strong>
          {history.overall.span > 0 && <> and {history.overall.span} days</>}. Middle values, so one
          epic does not move them.
        </p>
      ) : (
        <p className="text-sm text-ink-soft leading-relaxed">
          {history.sent.length} sent so far. {ENOUGH} is where these numbers start meaning
          something rather than describing one climb.
        </p>
      )}

      {history.byGrade.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 mt-3">
          {history.byGrade.map((row) => (
            <li key={`${row.scale}:${row.grade}`} className="flex items-baseline gap-2 text-sm">
              <span className="font-semibold w-14 shrink-0">
                {displayGrade(row.scale, row.grade, display)}
              </span>
              <span className="flex-1 min-w-0 text-ink-soft">
                {row.burns} burns · {row.sessions} {row.sessions === 1 ? 'session' : 'sessions'}
                {row.span > 0 ? ` · ${row.span} days` : ''}
              </span>
              <span className={`text-xs shrink-0 ${row.solid ? 'text-ink-soft' : 'text-warn'}`}>
                {row.sends} {row.sends === 1 ? 'send' : 'sends'}
                {row.solid ? '' : '*'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {history.byGrade.some((row) => !row.solid) && (
        <p className="text-xs text-warn mt-2 leading-relaxed">
          * Fewer than {ENOUGH} sends at that grade — one climb, not a pattern.
        </p>
      )}

      {stale !== undefined && stale.days >= 30 && (
        <p className="text-xs text-ink-soft mt-3 leading-relaxed">
          {stale.name} has sat {stale.days} days since its last burn.
          {history.shelved > 0 && ` ${history.shelved} shelved.`}
        </p>
      )}
    </Card>
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
  const gradeLabel = useGradeLabel();
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
            <span className="text-xs font-bold text-accent shrink-0">
              {gradeLabel(project.scale, project.grade)}
            </span>
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
          <span className="shrink-0 text-2xs font-bold uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5">
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
  const gradeOptions = useGradeOptions();
  const create = useProjects((s) => s.create);
  const [name, setName] = useState(initial.name ?? '');
  const [scale, setScale] = useState<GradeScale>(initial.scale ?? 'V');
  const [grade, setGrade] = useState(initial.grade ?? 'V5');
  const [setting, setSetting] = useState<'indoor' | 'outdoor'>(initial.setting ?? 'indoor');
  const [location, setLocation] = useState(initial.location ?? '');
  const grades = gradeOptions(scale, scale === 'V' ? V_GRADES : YDS_GRADES);

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
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Midnight Lightning"
          
        />
      </label>
      <div className="flex gap-2 mb-3">
        <Select
          value={scale}
          onChange={(e) => {
            const next = e.target.value as GradeScale;
            setScale(next);
            setGrade(next === 'V' ? 'V5' : '5.11a');
          }}
          aria-label="Discipline"
          size="compact"
        >
          <option value="V">Boulder</option>
          <option value="YDS">Route</option>
        </Select>
        <Select
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          aria-label="Grade"
          className="flex-1" size="compact"
        >
          {grades.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
        <Select
          value={setting}
          onChange={(e) => setSetting(e.target.value as 'indoor' | 'outdoor')}
          aria-label="Setting"
          size="compact"
        >
          <option value="indoor">Indoor</option>
          <option value="outdoor">Outdoor</option>
        </Select>
      </div>
      <label className="text-sm block mb-3">
        <span className="block text-ink-soft mb-1">Where (optional)</span>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Camp 4, or the cave"
          
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
