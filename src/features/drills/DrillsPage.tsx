import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Search } from 'lucide-react';
import { DRILL_CATEGORIES, DRILLS, filterDrills } from '@/content/drills';
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
 * **No equipment filter, measured.** One was built here on the assumption
 * that the library is mostly unavailable to someone with a wall and nothing
 * else. Counted: **all 144 drills list `wall`**, and exactly **three** ask
 * for anything more. A filter that separates three entries out of 144 is a
 * control and a sentence for nothing — and its failure mode is much worse
 * than its benefit, since a climber who has not listed a wall would open the
 * library to *zero* drills. What each one needs is on its own page, where it
 * is read before doing it rather than before finding it.
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
  const [search, setSearch] = useState('');

  const history = useMemo(
    () => drillHistory({ sessions: Object.values(byDate).flat(), today: today() }),
    [byDate],
  );

  const shown = useMemo(
    () =>
      filterDrills({
        ...(category ? { category } : {}),
        ...(search.trim() ? { search } : {}),
      }),
    [category, search],
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
        subtitle={`${shown.length} of ${DRILLS.length} — every one the programs prescribe`}
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

        </Card>

        {shown.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">
              Nothing matches. Try a different category, or turn the kit filter off.
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
              A drill is a way of climbing for an hour, not a workout to get through. The ones your
              program picks are here too — this is the whole library, including what it did not pick.
            </span>
          </p>
        </Card>
      </div>
    </>
  );
}
