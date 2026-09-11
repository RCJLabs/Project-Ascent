import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { ChevronLeft, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { fromKey, isYearKey, today as todayKey } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { displayGrade } from '@/engine/grades';
import {
  availableYears,
  changes,
  describeYear,
  monthName,
  reviewYear,
  type Change,
} from '@/engine/yearReview';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { Select } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';
import { ShareButton } from '@/features/share/ShareSheet';
import { yearCard } from '@/ui/shareCard';
import { BadParameter } from '@/ui/RecordNotFound';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { pickPhotos } from '@/engine/photos';
import { describeTrips, realTrips, tripName, trips } from '@/engine/trips';
import { PhotoTile, useMediaOwners } from '@/features/media/Thumbnails';

/**
 * A year, summarised.
 *
 * The comparison against last year is the whole reason this page is worth
 * opening, and it is only honest if it compares like with like — see
 * engine/yearReview.ts. A running year is labelled as running.
 */
export function YearPage({ params }: { params: { year?: string } }) {
  // `/year` with no parameter is the route's own entry point and picks a
  // year itself. A parameter that is present and not a year is a broken
  // link, and used to render `-5` or `1000000000` as the heading.
  if (params.year !== undefined && !isYearKey(params.year)) {
    return (
      <BadParameter
        expected="a four-digit year"
        got={params.year}
        goTo="/year"
        goLabel="Go to the latest year"
      >
        There is nothing to review for a year that has not happened.
      </BadParameter>
    );
  }
  return <YearReview {...(params.year === undefined ? {} : { year: params.year })} />;
}

function YearReview({ year: requested }: { year?: string }) {
  const params = { year: requested };
  const byDate = useSessions((s) => s.byDate);
  const display = useSettings((s) => s.display);
  const blocks = useProfile((s) => s.blocks);
  const projects = useProjects((s) => s.projects);
  const loadProjects = useProjects((s) => s.load);
  const projectsReady = useProjects((s) => s.hydrated);
  const { owners } = useMediaOwners();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!projectsReady) void loadProjects();
  }, [projectsReady, loadProjects]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const years = useMemo(() => availableYears(sessions), [sessions]);
  const thisYear = Number(todayKey().slice(0, 4));
  const year = Number(params.year) || years[0] || thisYear;

  const review = useMemo(() => {
    const state = deriveClimberState(sessions);
    return reviewYear({ sessions, records: state.personalRecords, display, blocks }, year);
  }, [sessions, display, year, blocks]);

  const lines = describeYear(review);
  const rows = changes(review);
  const index = years.indexOf(year);
  const older = index >= 0 ? years[index + 1] : years[0];
  const newer = index > 0 ? years[index - 1] : undefined;
  const peak = Math.max(1, ...review.months.map((m) => m.sessions));

  // Twelve, spread across the months that have any: the grid is a year and
  // not a fortnight (PLAN.md M92).
  // The year's trips (PLAN.md M88c). "Days on real rock" is a count; this
  // is what those days were.
  const outings = useMemo(
    () => realTrips(trips({ sessions, from: review.from, to: review.to })),
    [sessions, review.from, review.to],
  );
  const photos = useMemo(
    () => pickPhotos({ owners, sessions, projects, from: review.from, to: review.to, limit: 12 }),
    [owners, sessions, projects, review.from, review.to],
  );

  return (
    <>
      <BackLink />
      <PageHeader
        title={String(year)}
        subtitle={review.complete ? 'The year in review' : 'The year so far'}
        action={
          review.totals.sessions > 0 ? (
            <ShareButton content={yearCard(review)} filename={`ascent-${year}.png`} />
          ) : undefined
        }
      />

      <PageGrid>
        {years.length > 1 && (
          <div className="flex items-center gap-2">
            <IconButton
              inline={false}
              onClick={() => older !== undefined && navigate(`/year/${older}`)}
              disabled={older === undefined}
              label="Previous year"
              className="border border-line bg-sunken"
            >
              <ChevronLeft size={16} />
            </IconButton>
            <Select
              value={year}
              onChange={(e) => navigate(`/year/${e.target.value}`)}
              aria-label="Year"
              className="flex-1 min-w-0"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <IconButton
              inline={false}
              onClick={() => newer !== undefined && navigate(`/year/${newer}`)}
              disabled={newer === undefined}
              label="Next year"
              className="border border-line bg-sunken"
            >
              <ChevronRight size={16} />
            </IconButton>
          </div>
        )}

        <Card>
          {lines.map((line) => (
            <p key={line} className="text-sm leading-relaxed mb-1.5 last:mb-0">
              {line}
            </p>
          ))}
        </Card>

        {review.totals.sessions > 0 && (
          <>
            <Card>
              <div className="flex gap-5 flex-wrap">
                <Stat label="Sessions" value={String(review.totals.sessions)} />
                <Stat label="Hours" value={String(Math.round(review.totals.hours))} />
                <Stat label="Sends" value={String(review.totals.sends)} />
                <Stat label="Feet" value={review.totals.feet.toLocaleString()} />
                <Stat label="Days on rock" value={String(review.totals.outdoorDays)} />
              </div>
            </Card>

            {(review.hardestBoulder || review.hardestRoute) && (
              <Card title="Hardest of the year">
                <div className="flex gap-5 flex-wrap">
                  {review.hardestBoulder && (
                    <Stat
                      label="Boulder"
                      value={displayGrade('V', review.hardestBoulder.grade, display)}
                      sub={fromKey(review.hardestBoulder.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    />
                  )}
                  {review.hardestRoute && (
                    <Stat
                      label="Route"
                      value={displayGrade('YDS', review.hardestRoute.grade, display)}
                      sub={fromKey(review.hardestRoute.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    />
                  )}
                </div>
              </Card>
            )}

            {outings.length > 0 && (
              <Card title="Trips">
                <ul className="grid grid-cols-1 gap-2.5">
                  {outings
                    .slice()
                    .sort((a, b) => b.from.localeCompare(a.from))
                    .map((trip) => (
                      <li key={trip.from} className="flex items-baseline gap-2 text-sm">
                        <span className="flex-1 min-w-0 truncate font-semibold">{tripName(trip)}</span>
                        <span className="shrink-0 text-ink-soft tabular-nums">
                          {trip.days} days ·{' '}
                          {fromKey(trip.from).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="text-sm text-ink-soft mt-3 leading-relaxed">{describeTrips(outings)}</p>
                {outings.some((trip) => !trip.numbered) && (
                  <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                    Outdoor days close together are read as one trip. Numbering the days on the
                    session — &ldquo;day of the trip&rdquo; — says where one starts instead.
                  </p>
                )}
              </Card>
            )}

            {photos.length > 0 && (
              <Card title="The year in pictures">
                <div className="grid grid-cols-3 gap-1.5">
                  {photos.map((photo) => (
                    <PhotoTile
                      key={photo.id}
                      id={photo.id}
                      href={photo.href}
                      title={photo.title}
                      date={fromKey(photo.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    />
                  ))}
                </div>
              </Card>
            )}

            {review.months.length > 1 && (
              <Card title="Month by month">
                {/* Columns stretch to the container's fixed height, which is
                    what makes the bars' percentage heights resolve at all. */}
                <div
                  className="flex items-stretch gap-1 h-24"
                  role="img"
                  aria-label={`Sessions per month: ${review.months
                    .map((b) => `${monthName(b.month)} ${b.sessions}`)
                    .join(', ')}`}
                >
                  {review.months.map((bar) => (
                    <div key={bar.month} className="flex-1 min-w-0 flex flex-col justify-end">
                      <div
                        className={`w-full rounded-t ${bar.sessions === 0 ? 'bg-line' : 'bg-accent'}`}
                        style={{
                          height: bar.sessions === 0 ? '2px' : `${(bar.sessions / peak) * 100}%`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 mt-1" aria-hidden>
                  {review.months.map((bar) => (
                    <span
                      key={bar.month}
                      className="flex-1 min-w-0 text-2xs text-ink-soft text-center"
                    >
                      {bar.month.slice(5)}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {rows.length > 0 && (
              <Card
                title={review.complete ? `Against ${year - 1}` : `Against the same stretch of ${year - 1}`}
              >
                <ul className="grid grid-cols-1 gap-2">
                  {rows.map((row) => (
                    <ChangeRow key={row.label} change={row} />
                  ))}
                </ul>
                {!review.complete && (
                  <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                    Compared with 1 January to {fromKey(review.to).toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                    })}{' '}
                    of {year - 1}, not the whole year — otherwise every year looks like a bad one
                    until December.
                  </p>
                )}
              </Card>
            )}

            {review.firsts.length > 0 && (
              <Card title="Firsts">
                <ul className="grid grid-cols-1 gap-2">
                  {review.firsts.map((milestone) => (
                    <li key={milestone.id} className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{milestone.label}</span>
                      <span className="text-xs text-ink-soft">
                        {fromKey(milestone.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </PageGrid>
    </>
  );
}

function ChangeRow({ change }: { change: Change }) {
  const flat = change.delta === 0;
  const up = change.delta > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <li className="flex items-center gap-2">
      <Icon
        size={14}
        className={`shrink-0 ${flat ? 'text-ink-soft' : up ? 'text-positive' : 'text-warn'}`}
        aria-hidden
      />
      <span className="text-sm flex-1 min-w-0 truncate">{change.label}</span>
      <span className="text-right shrink-0">
        <span className="block text-sm font-semibold tabular-nums">
          {format(change.now)}
          {change.unit}
        </span>
        <span className="block text-xs text-ink-soft tabular-nums">
          {flat
            ? 'same'
            : `${up ? '+' : ''}${format(change.delta)}${change.percent === null ? '' : ` · ${up ? '+' : ''}${change.percent}%`}`}
        </span>
      </span>
    </li>
  );
}

function format(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs text-ink-soft uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      {sub && <div className="text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}
