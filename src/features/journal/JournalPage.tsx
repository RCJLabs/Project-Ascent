import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { BookOpen, Dumbbell, NotebookPen, Ruler, Search, Target, X } from 'lucide-react';
import {
  buildJournal,
  byMonth,
  filterJournal,
  journalTags,
  type JournalEntry,
  type JournalKind,
} from '@/engine/journal';
import { fromKey, shortLabel } from '@/engine/dates';
import { useMetrics } from '@/store/metrics';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

const KINDS: { value: JournalKind; label: string; Icon: typeof BookOpen }[] = [
  { value: 'session', label: 'Sessions', Icon: Dumbbell },
  { value: 'beta', label: 'Beta', Icon: NotebookPen },
  { value: 'attempt', label: 'Burns', Icon: Target },
  { value: 'assessment', label: 'Tests', Icon: Ruler },
];

export function JournalPage() {
  const byDate = useSessions((s) => s.byDate);
  const sessionsHydrated = useSessions((s) => s.hydrated);
  const loadSessions = useSessions((s) => s.load);
  const projects = useProjects((s) => s.projects);
  const projectsHydrated = useProjects((s) => s.hydrated);
  const loadProjects = useProjects((s) => s.load);
  const metrics = useMetrics((s) => s.entries);
  const metricsHydrated = useMetrics((s) => s.hydrated);
  const loadMetrics = useMetrics((s) => s.load);

  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<JournalKind[]>([]);
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionsHydrated) void loadSessions();
    if (!projectsHydrated) void loadProjects();
    if (!metricsHydrated) void loadMetrics();
  }, [sessionsHydrated, loadSessions, projectsHydrated, loadProjects, metricsHydrated, loadMetrics]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const journal = useMemo(
    () => buildJournal({ sessions, projects, metrics }),
    [sessions, projects, metrics],
  );
  const tags = useMemo(() => journalTags(journal), [journal]);
  const shown = useMemo(
    () => filterJournal(journal, { query, kinds, ...(tag ? { tag } : {}) }),
    [journal, query, kinds, tag],
  );
  const groups = useMemo(() => byMonth(shown), [shown]);

  const filtering = query.trim() !== '' || kinds.length > 0 || tag !== null;

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle={
          journal.length === 0
            ? 'Everything you write, in one place'
            : filtering
              ? `${shown.length} of ${journal.length}`
              : `${journal.length} entr${journal.length === 1 ? 'y' : 'ies'}`
        }
      />

      {journal.length === 0 ? (
        <Card>
          <p className="text-sm leading-relaxed text-ink-soft">
            Nothing written yet. Notes you add to a session, beta you save on a project, and notes
            beside an assessment result all land here — nothing to fill in twice. Add{' '}
            <span className="text-ink font-semibold">#tags</span> as you write and they become filters.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          <Card>
            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes"
                aria-label="Search the journal"
                className="w-full bg-sunken border border-line rounded-xl pl-9 pr-3 py-2.5 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(({ value, label, Icon }) => {
                const on = kinds.includes(value);
                return (
                  <button
                    key={value}
                    onClick={() => setKinds(on ? kinds.filter((k) => k !== value) : [...kinds, value])}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border text-xs font-semibold ${
                      on ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-sunken text-ink-soft'
                    }`}
                  >
                    <Icon size={13} /> {label}
                  </button>
                );
              })}
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.slice(0, 10).map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => setTag(tag === t.tag ? null : t.tag)}
                    className={`rounded-lg px-2.5 py-1.5 border text-xs font-semibold ${
                      tag === t.tag ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-sunken text-ink-soft'
                    }`}
                  >
                    #{t.tag} <span className="opacity-60">{t.count}</span>
                  </button>
                ))}
              </div>
            )}

            {filtering && (
              <button
                onClick={() => {
                  setQuery('');
                  setKinds([]);
                  setTag(null);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-accent mt-3"
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </Card>

          {shown.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-soft">Nothing matches that.</p>
            </Card>
          ) : (
            groups.map((group) => (
              <section key={group.month}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-2 px-1">
                  {monthTitle(group.month)}
                </h2>
                <ul className="grid grid-cols-1 gap-2">
                  {group.entries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </>
  );
}

function monthTitle(month: string): string {
  return fromKey(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const KIND_ICON: Record<JournalKind, typeof BookOpen> = {
  session: Dumbbell,
  beta: NotebookPen,
  attempt: Target,
  assessment: Ruler,
};

function EntryCard({ entry }: { entry: JournalEntry }) {
  const Icon = KIND_ICON[entry.kind];
  return (
    <li>
      <Link href={entry.href} className="block bg-surface border border-line rounded-2xl p-3.5">
        <div className="flex items-baseline gap-2 mb-1.5">
          <Icon size={13} className="text-accent shrink-0 translate-y-0.5" />
          <span className="font-semibold text-sm truncate">{entry.title}</span>
          {entry.detail && <span className="text-xs text-ink-soft shrink-0">{entry.detail}</span>}
          <span className="text-xs text-ink-soft ml-auto shrink-0">{shortLabel(entry.date)}</span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{entry.text}</p>
      </Link>
    </li>
  );
}
