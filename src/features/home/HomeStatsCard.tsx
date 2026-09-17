import { useMemo } from 'react';
import { Link } from 'wouter';
import { deriveAltimeter } from '@/engine/altimeter';
import { today as todayKey } from '@/engine/dates';
import { homeStats, showStat, type HomeStat } from '@/engine/homeStats';
import { formatHeight, heightValue, unitLabel } from '@/engine/units';
import { allSessions, useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { Meter } from '@/ui/Meter';
import { Sparkline } from '@/ui/Sparkline';

/**
 * How high, and how hard (PLAN.md M239).
 *
 * The two blocks that turn Home from a column of sentences into a screen
 * with numbers on it: the altimeter as one figure with the next summit under
 * it, and the week's load, ratio and sends as three tiles each carrying the
 * eight weeks behind it.
 *
 * ## Lazy, like everything else on this screen that thinks
 *
 * Home is the app's one eager route, so an engine imported here is an engine
 * in the entry chunk — the finding M183 paid 14.4KB to learn and M231 held
 * at 2.12KB. This card reaches `altimeter.ts`, `loadTrend.ts` and
 * `derive.ts`, so it is loaded the way the coach card and the daily task are,
 * behind a `Suspense` whose fallback is card-shaped rather than `null`.
 *
 * **What paid for it was a duplicate.** Home rendered `ReviewCard` above the
 * week card, and its title and its body both read *"2 of 4 sessions"* — the
 * same fact twice, in one card, with the week card under it saying it a
 * third time. It was also the only eager importer of `engine/review.ts`.
 * Taking it off Home measured **2.09KB** back out of the first load, which
 * is more than this milestone spends.
 *
 * ## The numbers are the app's own
 *
 * Nothing is computed here. `engine/homeStats.ts` reads the load from
 * `sessionLoad`, the sends through `gymSummary` and the ratio off
 * `loadTrend`, and the height comes from `deriveAltimeter` — so every figure
 * on Home is the same figure the screen it links to shows.
 */
export function HomeStatsCard() {
  const byDate = useSessions((s) => s.byDate);
  const units = useSettings((s) => s.units);
  const sessions = useMemo(() => allSessions(byDate), [byDate]);
  const today = todayKey();

  const alt = useMemo(() => deriveAltimeter(sessions, { today }), [sessions, today]);
  const { stats, empty } = useMemo(() => homeStats(sessions, today), [sessions, today]);

  // A log with nothing in it has nothing to say here, and three zeroes under
  // a zero would be the app's first impression of a climber who has not
  // logged anything yet. The cards below still ask them to.
  if (alt.feet === 0 && empty) return null;

  return (
    <div className="grid grid-cols-1 gap-3">
      <Link href="/altimeter" className="focus-ring block rounded-2xl px-0.5 pt-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-5xl font-black tracking-tighter tabular-nums leading-none">
            {heightValue(alt.feet, units).toLocaleString()}
          </span>
          <span className="text-lg font-extrabold text-ink-soft">{unitLabel('ft', units)}</span>
        </div>
        <div className="text-2xs font-extrabold uppercase tracking-widest text-ink-soft mt-2.5">
          Climbed so far
        </div>
        {alt.next && (
          <>
            {/* `Meter`, not a hand-rolled bar: the same `fraction` the
                altimeter page draws, through the same primitive, so the two
                cannot disagree about how far along the segment is or about
                what a screen reader is told it says. */}
            <Meter
              value={alt.fraction}
              label={`Progress to ${alt.next.name}`}
              valueText={`${formatHeight(alt.toNext, units)} to go`}
              size="lg"
              className="mt-4"
            />
            <div className="flex items-baseline justify-between gap-2 mt-2">
              <span className="text-xs font-bold text-ink-soft truncate">
                {alt.reached.at(-1)?.name ?? 'The ground'}
              </span>
              <span className="text-xs font-extrabold shrink-0">
                {alt.next.name} · {formatHeight(alt.toNext, units)} to go
              </span>
            </div>
          </>
        )}
      </Link>

      <div className="flex gap-2">
        {stats.map((stat) => (
          <StatTile key={stat.label} stat={stat} />
        ))}
      </div>
    </div>
  );
}

/**
 * One number, and the run behind it.
 *
 * `judged` rather than the label decides the colour: only the ratio means
 * something on its own, and colouring on a string comparison is how a
 * renamed label silently turns a number grey.
 */
function StatTile({ stat }: { stat: HomeStat }) {
  const tone = stat.judged ? 'text-positive' : 'text-ink';
  return (
    <div className="flex-1 min-w-0 bg-surface border border-line rounded-2xl p-3">
      <div className="text-2xs font-extrabold uppercase tracking-widest text-ink-soft truncate">
        {stat.label}
      </div>
      <div className={`text-2xl font-black tracking-tight tabular-nums leading-none mt-1.5 ${tone}`}>
        {showStat(stat)}
      </div>
      <div className={`mt-2.5 ${stat.judged ? 'text-positive' : 'text-accent'}`}>
        <Sparkline
          values={stat.series}
          label={stat.label}
          format={(v) => showStat({ ...stat, value: v })}
          height={22}
        />
      </div>
    </div>
  );
}
