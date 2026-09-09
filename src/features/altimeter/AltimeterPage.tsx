import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, Flag, Mountain } from 'lucide-react';
import {
  EVEREST,
  HEIGHT,
  MILESTONES,
  deriveAltimeter,
  weeklyHeight,
  type AltimeterState,
} from '@/engine/altimeter';
import { ShareButton } from '@/features/share/ShareSheet';
import { useSessions } from '@/store/sessions';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { Meter } from '@/ui/Meter';
import { LoadBars } from '@/ui/charts/Charts';
import { MountainMeter } from '@/ui/MountainMeter';
import { PageHeader } from '@/ui/PageHeader';
import { altimeterCard } from '@/ui/shareCard';

export function AltimeterPage() {
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const alt = useMemo(() => deriveAltimeter(sessions), [sessions]);
  const weeks = useMemo(() => weeklyHeight(sessions, 12), [sessions]);
  const hasHeight = alt.feet > 0;

  return (
    <>
      <BackLink />

      <PageHeader
        title="Altimeter"
        subtitle={alt.laps > 0 ? `Lap ${alt.laps + 1} of the ladder` : 'Every send, added up'}
        action={
          hasHeight ? <ShareButton content={altimeterCard(alt)} filename="ascent-altimeter.png" /> : undefined
        }
      />

      <div className="grid grid-cols-1 gap-3">
        <Card>
          <div className="text-center mb-3">
            <div className="text-4xl font-black tabular-nums leading-none">
              {alt.feet.toLocaleString()}
              <span className="text-lg font-bold text-ink-soft ml-1.5">ft</span>
            </div>
            <p className="text-sm text-ink-soft mt-1.5">{alt.meters.toLocaleString()} m climbed</p>
          </div>
          <MountainMeter
            fraction={alt.fraction}
            caption={
              alt.next
                ? `${Math.round(alt.fraction * 100)}% of the way to ${alt.next.name}`
                : 'The whole ladder is behind you'
            }
          />
          <NextUp alt={alt} />
        </Card>

        {!hasHeight && (
          <Card>
            <p className="text-sm leading-relaxed text-ink-soft">
              A boulder send is {HEIGHT.boulder} feet, a route is {HEIGHT.route}, and real rock
              counts for a quarter more. Nothing else adds height — not a game, not a streak, not a
              level. Log a send and the mountain starts filling.
            </p>
          </Card>
        )}

        {hasHeight && !alt.everest.reached && (
          <Card title="Everest">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-sm">
                {Math.round(alt.everest.fraction * 100)}% of {EVEREST.feet.toLocaleString()} ft
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {alt.everest.toGo.toLocaleString()} ft to go
              </span>
            </div>
            <Meter
              value={alt.everest.fraction}
              size="lg"
              label="Progress to Everest"
              valueText={`${alt.feet.toLocaleString()} of ${EVEREST.feet.toLocaleString()} feet`}
            />
            <p className="text-sm text-ink-soft mt-2.5 leading-relaxed">
              {alt.everest.etaLabel
                ? `At ${alt.pace.toLocaleString()} ft a week, that is ${alt.everest.etaLabel}.`
                : 'Three weeks of logging and this gets an estimate.'}
            </p>
          </Card>
        )}

        {alt.everest.reached && (
          <Card title="Everest">
            <p className="flex items-center gap-2 text-sm font-semibold text-positive">
              <Check size={16} /> Sea level to the summit, and past it.
            </p>
          </Card>
        )}

        {hasHeight && (
          <Card title="Height per week">
            <LoadBars
              data={weeks.map((w) => ({ date: w.week, value: w.feet }))}
              label="Feet climbed per week over the last twelve weeks"
              formatValue={(n) => `${Math.round(n).toLocaleString()} ft`}
            />
            <p className="text-xs text-ink-soft mt-2">
              Rolling seven-day windows. Current pace {alt.pace.toLocaleString()} ft a week.
            </p>
          </Card>
        )}

        <Card title="The ladder">
          <ol className="grid grid-cols-1 gap-1.5">
            {MILESTONES.map((m) => {
              const done = alt.reached.includes(m);
              const isNext = alt.next === m;
              return (
                <li
                  key={m.name}
                  className={`flex items-baseline gap-2.5 text-sm ${done || isNext ? '' : 'opacity-45'}`}
                >
                  {done ? (
                    <Check size={13} className="text-positive shrink-0 translate-y-0.5" />
                  ) : isNext ? (
                    <Flag size={13} className="text-accent shrink-0 translate-y-0.5" />
                  ) : (
                    <Mountain size={13} className="text-ink-soft shrink-0 translate-y-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={isNext ? 'font-bold' : done ? 'font-semibold' : ''}>{m.name}</div>
                    {(done || isNext) && (
                      <p className="text-xs text-ink-soft leading-relaxed">{m.note}</p>
                    )}
                  </div>
                  <span className="text-xs text-ink-soft tabular-nums shrink-0">
                    {m.feet.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-ink-soft mt-3 leading-relaxed">
            {alt.laps > 0
              ? `You have been round this ladder ${alt.laps === 1 ? 'once' : `${alt.laps} times`}. It repeats; your career does not.`
              : 'The ladder ends at the top. Milestones that do not are on the career page.'}
          </p>
          <Link
            href="/career"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent mt-2"
          >
            Career milestones <ArrowRight size={14} />
          </Link>
        </Card>
      </div>
    </>
  );
}

function NextUp({ alt }: { alt: AltimeterState }) {
  if (!alt.next) return null;
  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-sm">{alt.next.name}</span>
        <span className="text-sm text-ink-soft tabular-nums shrink-0">
          {alt.toNext.toLocaleString()} ft to go
        </span>
      </div>
      <p className="text-sm text-ink-soft mt-1 leading-relaxed">
        {alt.etaLabel
          ? `At ${alt.pace.toLocaleString()} ft a week, ${alt.etaLabel}.`
          : alt.pace > 0
            ? 'A few more weeks of logging and this gets an estimate.'
            : 'Log a send and this starts moving.'}
      </p>
    </div>
  );
}
