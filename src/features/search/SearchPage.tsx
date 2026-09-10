import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Search as SearchIcon, X } from 'lucide-react';
import { DRILLS } from '@/content/drills';
import { GLOSSARY } from '@/content/glossary';
import { GUIDES } from '@/content/guides';
import { sectionText, snippet } from '@/engine/guideText';
import { METRICS } from '@/content/metrics';
import { allPrograms } from '@/content/programs';
import { fromKey } from '@/engine/dates';
import { displayGrade } from '@/engine/grades';
import { groupResults, search, type SearchItem } from '@/engine/search';
import { useCustomPrograms } from '@/store/programs';
import { useObjectives } from '@/store/objectives';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { EmptyState } from '@/ui/EmptyState';
import { CHIP_LINK } from '@/ui/Chip';
import { Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { browsable } from '@/ui/routes';

/**
 * One place to find anything.
 *
 * The index is built here rather than kept anywhere: everything it covers
 * is already in memory, walking it costs a few milliseconds, and an index
 * that is never stored can never be stale. A session edited a second ago is
 * searchable as its new self.
 */
function useIndex(): SearchItem[] {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const objectives = useObjectives((s) => s.objectives);
  const custom = useCustomPrograms((s) => s.custom);
  const display = useSettings((s) => s.display);

  return useMemo(() => {
    const items: SearchItem[] = [];

    for (const route of browsable()) {
      items.push({
        id: `page:${route.path}`,
        kind: 'page',
        title: route.title,
        href: route.path,
        ...(route.keywords ? { keywords: route.keywords } : {}),
        ...(route.group ? { badge: route.group } : {}),
      });
    }

    for (const program of allPrograms()) {
      items.push({
        id: `program:${program.id}`,
        kind: 'program',
        title: program.name,
        detail: program.subtitle,
        href: `/train/${program.id}`,
        keywords: [`${program.weeks} weeks`],
      });
    }
    for (const program of custom) {
      if (program.name.trim() === '') continue;
      items.push({
        id: `custom:${program.id}`,
        kind: 'program',
        title: program.name,
        detail: program.subtitle || 'Yours',
        href: `/build/${program.id}`,
      });
    }

    for (const objective of objectives) {
      items.push({
        id: `objective:${objective.id}`,
        kind: 'objective',
        title: objective.name,
        detail: [objective.grade, objective.location].filter(Boolean).join(' · '),
        href: `/objectives/${objective.id}`,
      });
    }

    for (const project of projects) {
      items.push({
        id: `project:${project.id}`,
        kind: 'project',
        title: project.name,
        detail: [displayGrade(project.scale, project.grade, display), project.location]
          .filter(Boolean)
          .join(' · '),
        href: `/projects/${project.id}`,
        keywords: project.beta.map((note) => note.text),
      });
    }

    for (const entry of GLOSSARY) {
      items.push({
        id: `term:${entry.term}`,
        kind: 'term',
        title: entry.term,
        detail: entry.definition,
        href: '/glossary',
        badge: entry.category,
      });
    }

    for (const guide of GUIDES) {
      items.push({
        id: `guide:${guide.id}`,
        kind: 'guide',
        title: guide.name,
        ...(guide.subtitle ? { detail: guide.subtitle } : {}),
        href: `/guides/${guide.id}`,
        keywords: guide.sections.map((section) => section.title),
      });

      // And every section, matched on what it says rather than what it is
      // called (PLAN.md M65). One item per section rather than per guide, so
      // a hit can open the passage instead of the top of a document that
      // runs to several thousand words.
      guide.sections.forEach((section, index) => {
        items.push({
          id: `passage:${guide.id}:${index}`,
          kind: 'passage',
          title: section.title,
          detail: guide.name,
          href: `/guides/${guide.id}/${index + 1}`,
          body: sectionText(section),
        });
      });
    }

    for (const metric of Object.values(METRICS)) {
      items.push({
        id: `metric:${metric.id}`,
        kind: 'metric',
        title: metric.label,
        ...(metric.description ? { detail: metric.description } : {}),
        href: `/assessments/${metric.id}`,
      });
    }

    for (const drill of DRILLS) {
      items.push({
        id: `drill:${drill.id}`,
        kind: 'drill',
        title: drill.name,
        detail: drill.focus,
        href: '/train',
        keywords: [drill.description],
      });
    }

    for (const session of Object.values(byDate).flat()) {
      if (!session.completed) continue;
      const climbs = session.climbs
        .map((c) => `${displayGrade(c.scale, c.grade, display)} × ${c.count}`)
        .join(', ');
      items.push({
        id: `session:${session.id}`,
        kind: 'session',
        title: fromKey(session.date).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        detail: [climbs, session.notes].filter(Boolean).join(' — ') || 'No climbs logged',
        href: `/log/${session.date}`,
        date: session.date,
        ...(session.mode === 'outdoor' ? { badge: 'Outdoors' } : {}),
      });
    }

    return items;
  }, [byDate, projects, objectives, custom, display]);
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const index = useIndex();
  const field = useRef<HTMLInputElement>(null);

  // The point of a search page is searching, so it opens ready to type.
  // Only on a pointer-less first render — stealing focus on every keystroke
  // would fight the climber.
  useEffect(() => {
    field.current?.focus();
  }, []);

  const results = useMemo(() => search(index, query), [index, query]);
  const groups = groupResults(results);

  return (
    <>
      <PageHeader title="Search" subtitle={`${index.length.toLocaleString()} things, all on this device.`} />

      <div className="relative mb-3">
        <SearchIcon
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none"
          aria-hidden
        />
        <Input
          ref={field}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A term, a program, a project, a day"
          aria-label="Search everything"
          className="pl-9 pr-12"
        />
        {query !== '' && (
          <IconButton
            inline={false}
            onClick={() => {
              setQuery('');
              field.current?.focus();
            }}
            label="Clear search"
            className="absolute right-0.5 top-1/2 -translate-y-1/2"
          >
            <X size={16} />
          </IconButton>
        )}
      </div>

      {query.trim() === '' ? (
        <Browse />
      ) : results.length === 0 ? (
        <EmptyState>
          Nothing matches “{query}”. Search is exact rather than fuzzy — it would rather find
          nothing than offer you the wrong thing.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4" aria-live="polite" aria-atomic="false">
          <p className="sr-only">
            {results.length} {results.length === 1 ? 'result' : 'results'}
          </p>
          {groups.map((group) => (
            <section key={group.kind}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-2">
                {group.label}
              </h2>
              <ul className="grid grid-cols-1 gap-2">
                {group.items.map((result) => (
                  <li key={result.id}>
                    <Link
                      href={result.href}
                      className="focus-ring block bg-surface border border-line rounded-2xl p-3.5 hover:border-accent transition-colors"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm flex-1 min-w-0 truncate">
                          {result.title}
                        </span>
                        {result.badge !== undefined && (
                          <span className="text-2xs font-bold uppercase tracking-wide text-ink-soft shrink-0">
                            {result.badge}
                          </span>
                        )}
                      </div>
                      {result.detail !== undefined && result.detail !== '' && (
                        <p className="text-xs text-ink-soft mt-0.5 line-clamp-2 leading-relaxed">
                          {result.detail}
                        </p>
                      )}
                      {/* Why it matched. A passage hit that only shows the
                          section's title is asking a climber to open a
                          guide and search it again by eye. */}
                      {result.body !== undefined && (
                        <p className="text-xs text-ink mt-1.5 leading-relaxed">
                          {snippet(result.body, query)}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** Everything worth reaching, when there is nothing to search for yet. */
function Browse() {
  const routes = browsable();
  const groups = [...new Set(routes.map((r) => r.group))].filter(
    (g): g is NonNullable<typeof g> => g !== undefined,
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      {groups.map((group) => (
        <section key={group}>
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-2">{group}</h2>
          <div className="flex flex-wrap gap-1.5">
            {routes
              .filter((route) => route.group === group)
              .map((route) => (
                <Link key={route.path} href={route.path} className={CHIP_LINK}>
                  {route.title}
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
