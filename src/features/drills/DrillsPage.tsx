import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Search } from 'lucide-react';
import { DRILL_CATEGORIES, DRILLS, filterDrills } from '@/content/drills';
import { DRILL_TEXT } from '@/content/drillText';
import type { DrillCategory } from '@/content/types';
import { drillHistory } from '@/engine/drillHistory';
import { today } from '@/engine/dates';
import { useSessions } from '@/store/sessions';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { PageSkeleton } from '@/ui/Skeleton';

/**
 * The drill library, browsable (PLAN.md M107).
 *
 * 144 drills the app has always had, reachable only from the week a program
 * put one in and from search. A climber who wanted to *look* at what the app
 * knows had nowhere to do it, and a drill they had been given six times and
 * done twice looked exactly like one they had never met.
 *
 * **No equipment filter, measured — until the measurement changed.** One was
 * built here on the assumption that the library is mostly unavailable to
 * someone with a wall and nothing else. Counted at the time: all 144 drills
 * listed `wall` and exactly three asked for anything more, so a filter would
 * have separated three entries out of 144 — a control and a sentence for
 * nothing, whose failure mode was much worse than its benefit, since a
 * climber who had not listed a wall would open the library to *zero* drills.
 *
 * That last clause was the real finding, and M132 fixed the library rather
 * than the page: twelve drills that need nothing at all. One chip now
 * separates those twelve, and it answers a question a climber actually
 * arrives with — *the gym is shut and my finger hurts, what can I do* —
 * rather than describing a tag. The rest of what a drill needs is still on
 * its own page, read before doing it rather than before finding it.
 *
 * **Grouped by category, like the glossary.** A hundred-odd rows in one
 * flat list is a wall rather than a library — seen in a browser, where the
 * unfiltered page ran to nineteen thousand pixels. `GlossaryPage` settled
 * the shape for a long reference list here: a section per category with its
 * own heading and blurb, and the flat list only once a category is picked
 * and the scope is already narrow.
 */
export function DrillsPage() {
  const byDate = useSessions((s) => s.byDate);
  const ready = useSessions((s) => s.hydrated);
  const [category, setCategory] = useState<DrillCategory | null>(null);
  const [offWall, setOffWall] = useState(false);
  const [search, setSearch] = useState('');

  const history = useMemo(
    () => drillHistory({ sessions: Object.values(byDate).flat(), today: today() }),
    [byDate],
  );

  const shown = useMemo(
    () =>
      filterDrills({
        ...(category ? { category } : {}),
        ...(offWall ? { equipment: [] } : {}),
        ...(search.trim() ? { search, text: DRILL_TEXT } : {}),
      }),
    [category, offWall, search],
  );

  // Category order comes from the registry rather than from whatever order
  // the drills happen to be declared in.
  const groups = useMemo(
    () =>
      (Object.keys(DRILL_CATEGORIES) as DrillCategory[])
        .map((c) => [c, shown.filter((d) => d.category === c)] as const)
        .filter(([, list]) => list.length > 0),
    [shown],
  );

  if (!ready) return <PageSkeleton title="Drills" />;

  return (
    <>
      <BackLink />
      <PageHeader
        title="Drills"
        subtitle={`${shown.length} of ${DRILLS.length} — what the programs prescribe, and what the library adds`}
      />

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, focus or method"
            aria-label="Search the drills"
            className="mb-3"
          />
          <div className="flex flex-wrap gap-1.5">
            <Chip active={category === null} onClick={() => setCategory(null)}>
              Everything
            </Chip>
            {(Object.keys(DRILL_CATEGORIES) as DrillCategory[]).map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                {DRILL_CATEGORIES[c].label}
              </Chip>
            ))}
          </div>
          {/* Its own row, because it is not a category — it crosses them.
              An empty kit list is the whole filter: `filterDrills` keeps a
              drill only when the climber has everything it asks for, and
              `none` asks for nothing. */}
          <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-line">
            <Chip active={offWall} onClick={() => setOffWall(!offWall)}>
              {offWall ? '✓ ' : ''}No wall needed
            </Chip>
          </div>

        </Card>

        {shown.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">
              Nothing matches. Try a different category, a different search, or drop the
              no-wall filter.
            </p>
          </Card>
        ) : (
          groups.map(([group, drills]) => (
            <Card key={group} title={DRILL_CATEGORIES[group].label}>
              {category === null && (
                <p className="text-xs text-ink-soft mb-2 leading-relaxed">
                  {DRILL_CATEGORIES[group].description}
                </p>
              )}
              <ul className="grid grid-cols-1 gap-2">
                {drills.map((drill) => {
                  const record = history.get(drill.id);
                  return (
                    <li key={drill.id}>
                      <Link
                        href={`/drills/${drill.id}`}
                        className="focus-ring flex items-center gap-3 bg-sunken rounded-xl px-3 py-2.5"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-sm truncate">{drill.name}</span>
                          <span className="block text-xs text-ink-soft truncate">
                            {drill.focus} · {drill.level}
                            {record ? ` · done ${record.done} of ${record.given}` : ''}
                          </span>
                        </span>
                        <ChevronRight size={16} className="text-ink-soft shrink-0" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        )}

        <Card>
          <p className="text-xs text-ink-soft leading-relaxed flex items-start gap-2">
            <Search size={13} className="shrink-0 mt-0.5" aria-hidden />
            <span>
              Most of these are a way of climbing for an hour rather than a workout to get through,
              and twelve are for the days you are not climbing at all. Your program's own picks are
              here too — this is the whole library, including what it did not pick, and any of them
              can go on today from its own page.
            </span>
          </p>
        </Card>
      </div>
    </>
  );
}
