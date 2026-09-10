import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { Project } from '@/db/projects';
import { OUTCOME_LABEL, highPointOf, summariseProject } from '@/engine/projects';
import { fromKey, today } from '@/engine/dates';
import { useProjects } from '@/store/projects';
import { offerUndo } from '@/store/undo';
import { useSettings } from '@/store/settings';
import { BackLink } from '@/ui/BackLink';
import { PageSkeleton } from '@/ui/Skeleton';
import { projectCard } from '@/ui/shareCard';
import { useSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { TextArea } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { ShareButton } from '@/features/share/ShareSheet';
import { Card } from '@/ui/Card';
import { projectOwner } from '@/db/media';
import { MediaCard } from '@/features/media/MediaCard';
import { useGradeLabel } from '@/ui/useGrade';
import { ProgressionLine } from '@/ui/charts/Charts';
import { RecordNotFound } from '@/ui/RecordNotFound';

export function ProjectDetailPage({ params }: { params: { id: string } }) {
  const gradeLabel = useGradeLabel();
  const display = useSettings((s) => s.display);
  const [, navigate] = useLocation();
  const projects = useProjects((s) => s.projects);
  const hydrated = useProjects((s) => s.hydrated);
  const load = useProjects((s) => s.load);
  const update = useProjects((s) => s.update);
  const remove = useProjects((s) => s.remove);
  const restore = useProjects((s) => s.restore);
  const byDate = useSessions((s) => s.byDate);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const project = projects.find((p) => p.id === params.id);
  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const summary = useMemo(
    () => (project ? summariseProject(project.id, sessions) : null),
    [project, sessions],
  );

  // Not `null`: with nothing in `main` the page has no height, so the
  // layout collapses and snaps back a frame later — which reads as a fault
  // rather than as loading (PLAN.md M22).
  if (!hydrated) return <PageSkeleton title="Project" />;
  if (!project || !summary) {
    return (
      <RecordNotFound what="That project" backTo="/projects" backLabel="Back to projects">
        It may have been sent and archived, or deleted.
      </RecordNotFound>
    );
  }

  const points = summary.highPointByDay.map((d) => ({
    week: d.date,
    value: d.value,
    display: `${d.value}%`,
  }));

  return (
    <>
      <BackLink />

      <header className="mb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-2xl font-black tracking-tight">{project.name}</h1>
          <span className="text-lg font-black text-accent">{gradeLabel(project.scale, project.grade)}</span>
        </div>
        <p className="text-sm text-ink-soft mt-0.5">
          {project.setting === 'outdoor' ? 'Outdoor' : 'Indoor'}
          {project.location ? ` · ${project.location}` : ''}
          {project.status === 'sent' && project.sentDate ? ` · sent ${shortDate(project.sentDate)}` : ''}
          {project.status === 'shelved' ? ' · shelved' : ''}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Burns" value={String(summary.burns)} />
            <Stat label="Days" value={String(summary.days)} />
            <Stat label="High point" value={summary.highPoint === null ? '—' : `${summary.highPoint}%`} />
            <Stat
              label="Last burn"
              value={summary.daysSinceLast === null ? '—' : summary.daysSinceLast === 0 ? 'today' : `${summary.daysSinceLast}d`}
            />
          </div>
          {project.status === 'sent' && (
            <div className="mt-3 pt-3 border-t border-line">
              <ShareButton
                content={projectCard(project, summary, undefined, display)}
                label="Share the send"
                filename={`ascent-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}
              />
            </div>
          )}
          {summary.daysSinceLast !== null && summary.daysSinceLast >= 14 && project.status === 'active' && (
            <p className="text-sm text-warn mt-3">
              Nothing for {summary.daysSinceLast} days. Get back on it, or shelve it honestly.
            </p>
          )}
        </Card>

        {points.length >= 2 && (
          <Card title="High point">
            <ProgressionLine points={points} label="High point per day" formatValue={(v) => `${v}%`} />
            <p className="text-xs text-ink-soft mt-2">
              One point per day you tried it, in order — not to scale in time. Rehearsal days are
              left out, since working moves is not a high point.
            </p>
          </Card>
        )}

        <Card title="Burns">
          {summary.attempts.length === 0 ? (
            <>
              <p className="text-sm text-ink-soft mb-3">
                Nothing logged yet. Attempts are recorded on the session, so log a session and add
                your burns there.
              </p>
              <Link
                href={`/log/${today()}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
              >
                <Plus size={15} /> Open today
              </Link>
            </>
          ) : (
            <ol className="grid grid-cols-1 gap-2">
              {[...summary.attempts].reverse().map((a) => (
                <li key={a.id} className="flex items-baseline gap-2 bg-sunken rounded-xl px-3 py-2">
                  <span className="text-xs text-ink-soft w-16 shrink-0">{shortDate(a.date)}</span>
                  <span className={`text-sm font-semibold flex-1 ${a.outcome === 'send' ? 'text-positive' : ''}`}>
                    {OUTCOME_LABEL[a.outcome]}
                    {a.count > 1 ? ` ×${a.count}` : ''}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-ink-soft">
                    {highPointOf(a) === null ? '' : `${highPointOf(a)}%`}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <MediaCard
          owner={projectOwner(project.id)}
          blurb="Shoot the line, the crux, the foot you keep missing. Photos are resized on the way in and live on this device — they go into a backup with everything else."
          fullNote="That is the limit for one project. Delete one to add another — storage here is finite and nothing is backed up anywhere but your own export."
        />

        <BetaCard project={project} onChange={(p) => void update(p)} />

        <Card title="Status">
          <div className="flex flex-wrap gap-2">
            {project.status !== 'active' && (
              <Button size="sm" variant="outline" onClick={() => void update({ ...project, status: 'active' })}>
                Back on it
              </Button>
            )}
            {project.status === 'active' && (
              <Button size="sm" variant="outline" onClick={() => void update({ ...project, status: 'shelved' })}>
                Shelve it
              </Button>
            )}
            {confirmDelete ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const deleted = project;
                    // The photos come back too. `remove` used to delete them
                    // outright so nothing sat orphaned in the quota, which
                    // made this offer hand back a project with its pictures
                    // silently gone — and the bar said only "deleted, undo?".
                    // They now outlive the record and are collected at the
                    // next launch if the undo never comes (PLAN.md M30).
                    void remove(deleted.id).then(() =>
                      offerUndo(deleted.name || 'Project', () => restore(deleted)),
                    );
                    navigate('/projects');
                  }}
                >
                  <Trash2 size={14} /> Delete for good
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-soft mt-3">
            Shelving keeps the history. Deleting removes the project — the burns stay on the
            sessions that recorded them.
          </p>
        </Card>
      </div>
    </>
  );
}

function shortDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-black tabular-nums leading-none">{value}</div>
      <div className="text-2xs text-ink-soft mt-1">{label}</div>
    </div>
  );
}

function BetaCard({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const [text, setText] = useState('');

  function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onChange({
      ...project,
      beta: [
        { id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: today(), text: trimmed },
        ...project.beta,
      ],
    });
    setText('');
  }

  return (
    <Card title="Beta">
      {project.beta.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 mb-3">
          {project.beta.map((note) => (
            <li key={note.id} className="bg-sunken rounded-xl px-3 py-2.5">
              <div className="flex items-start gap-2">
                <p className="text-sm leading-relaxed flex-1 whitespace-pre-wrap">{note.text}</p>
                <IconButton
                  onClick={() => onChange({ ...project, beta: project.beta.filter((b) => b.id !== note.id) })}
                  label="Delete note"
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
              <p className="text-2xs text-ink-soft mt-1">{shortDate(note.date)}</p>
            </li>
          ))}
        </ul>
      )}
      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Left heel by the arête, then drop knee before the throw."
        aria-label="New beta note"
        className="mb-2"
      />
      <Button size="sm" variant="outline" disabled={text.trim() === ''} onClick={add}>
        <Check size={14} /> Save beta
      </Button>
    </Card>
  );
}
