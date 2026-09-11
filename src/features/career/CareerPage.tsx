import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ChevronRight, Mountain, Trophy } from 'lucide-react';
import { CATEGORY_LABEL, byYear, deriveCareer, type CareerCategory } from '@/engine/career';
import { fromKey } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { describeVenues } from '@/engine/venues';
import { useVenues } from '@/features/venues/useVenues';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Meter } from '@/ui/Meter';
import { PageHeader } from '@/ui/PageHeader';

const DOT: Record<CareerCategory, string> = {
  grade: 'bg-accent',
  height: 'bg-positive',
  years: 'bg-warn',
  outdoor: 'bg-positive',
  sends: 'bg-ink-soft',
  sessions: 'bg-ink-soft',
  hours: 'bg-ink-soft',
};

/**
 * The career timeline: every milestone the log has crossed, with the date it
 * happened on.
 *
 * Deliberately a list rather than a bar. A bar gets less interesting as it
 * fills; a list of dated days gets longer.
 */
export function CareerPage() {
  const byDate = useSessions((s) => s.byDate);
  const display = useSettings((s) => s.display);
  const [filter, setFilter] = useState<CareerCategory | 'all'>('all');
  // Where the climbing happened (PLAN.md M88b). On Career rather than
  // Progress: a place is part of the story of a climbing life, not a
  // reading of this block's load.
  const places = useVenues();


  const career = useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    return deriveCareer({ sessions, records: state.personalRecords, display });
  }, [byDate, display]);

  const years = useMemo(() => {
    const filtered =
      filter === 'all'
        ? career
        : { ...career, achieved: career.achieved.filter((m) => m.category === filter) };
    return byYear(filtered);
  }, [career, filter]);

  const present = useMemo(
    () => new Set(career.achieved.map((m) => m.category)),
    [career],
  );

  return (
    <>
      <BackLink />
      <PageHeader
        title="Career"
        subtitle={
          career.first === null
            ? 'Every milestone, with the day it happened.'
            : `${career.achieved.length} milestones since ${fromKey(career.first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
        }
      />

      <PageGrid>
        {career.next.length > 0 && (
          <Card title="Coming up">
            <ul className="grid grid-cols-1 gap-2.5">
              {career.next.slice(0, 4).map((next) => (
                <li key={`${next.category}-${next.target}`}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-sm font-semibold flex-1 min-w-0 truncate">{next.label}</span>
                    <span className="text-xs text-ink-soft tabular-nums shrink-0">
                      {next.category === 'years'
                        ? `${next.toGo} ${next.toGo === 1 ? 'day' : 'days'}`
                        : `${next.toGo.toLocaleString()} to go`}
                    </span>
                  </div>
                  <Meter
                    value={next.fraction}
                    size="sm"
                    label={next.label}
                    valueText={
                      next.category === 'years'
                        ? `${next.toGo} days to go`
                        : `${next.current.toLocaleString()} of ${next.target.toLocaleString()}`
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Where the fourteen named days went (PLAN.md M63). They are on the
            climber now, and a page that used to hold them should say so
            rather than let a returning climber hunt. */}
        {describeVenues(places) !== null && (
          <Card title="Where you climb">
            <dl className="grid grid-cols-1 gap-1.5 text-sm">
              {places
                .filter((place) => place.days > 0)
                .slice(0, 8)
                .map((place) => (
                  <div key={place.key} className="flex items-baseline gap-2">
                    <dt className="flex-1 min-w-0 truncate">{place.name}</dt>
                    <dd className="shrink-0 text-ink-soft tabular-nums">
                      {place.days === 1 ? '1 day' : `${place.days} days`}
                      {place.outdoorDays > 0 && ` · ${place.outdoorDays} outside`}
                    </dd>
                  </div>
                ))}
            </dl>
            <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeVenues(places)}</p>
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              Read off what you typed. Capitals and spacing are ignored, so &ldquo;The Works&rdquo;
              and &ldquo;the works&rdquo; are one place — but &ldquo;Works&rdquo; is another, because
              the app cannot tell a second gym from a second way of writing the first.
            </p>
          </Card>
        )}

        <Card title="Achievements">
          <Link href="/climber" className="flex items-center gap-3">
            <Trophy size={18} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">On your climber</p>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                Fourteen named days, beside your level and your stats.
              </p>
            </div>
            <ChevronRight size={18} className="text-ink-soft shrink-0" />
          </Link>
        </Card>

        {career.achieved.length === 0 ? (
          <Card>
            <p className="text-sm leading-relaxed">
              Nothing here yet. Milestones are worked out from the log rather than handed out — the
              first few arrive on their own once there are sessions behind you.
            </p>
          </Card>
        ) : (
          <>
            {present.size > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
                {(Object.keys(CATEGORY_LABEL) as CareerCategory[])
                  .filter((c) => present.has(c))
                  .map((category) => (
                    <FilterChip
                      key={category}
                      active={filter === category}
                      onClick={() => setFilter(category)}
                      label={CATEGORY_LABEL[category]}
                    />
                  ))}
              </div>
            )}

            {years.map((group) => (
              <section key={group.year}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">
                    {group.year}
                  </h2>
                  <Link href={`/year/${group.year}`} className="text-xs font-semibold text-accent">
                    The year in review
                  </Link>
                </div>
                <ul className="grid grid-cols-1 gap-2">
                  {group.milestones.map((milestone) => (
                    <li
                      key={milestone.id}
                      className="bg-surface border border-line rounded-2xl p-3.5 flex items-start gap-3"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${DOT[milestone.category]}`}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-bold">{milestone.label}</span>
                          <span className="text-xs text-ink-soft">
                            {fromKey(milestone.date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-ink-soft leading-relaxed">{milestone.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <Link
          href="/altimeter"
          className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3"
        >
          <Mountain size={18} className="shrink-0 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">The altimeter</div>
            <p className="text-sm text-ink-soft">Every send, as height on one lifetime climb.</p>
          </div>
          <ArrowRight size={16} className="text-ink-soft shrink-0" />
        </Link>
      </PageGrid>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Chip active={active} onClick={onClick}>
      {label}
    </Chip>
  );
}

