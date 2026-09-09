import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight, CircleAlert } from 'lucide-react';
import { fromKey } from '@/engine/dates';
import { describeSpan, elapsedMs, formatClock, runningSession, staleSessions } from '@/engine/live';
import type { Session } from '@/db/sessions';
import { useSessions } from '@/store/sessions';

export type Banner =
  | { kind: 'running'; session: Session; ms: number }
  | { kind: 'stale'; session: Session; ms: number }
  | null;

/**
 * The open session, if there is one, with a clock that ticks only while one
 * exists. A stale session displaces a running one: it needs a decision, and
 * a decision outranks a timer.
 */
export function useLiveBanner(): Banner {
  const byDate = useSessions((s) => s.byDate);
  const [now, setNow] = useState(() => Date.now());

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const stale = staleSessions(sessions, now)[0];
  const running = stale ? undefined : runningSession(sessions, now);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running?.id]);

  // A stale session is only discovered by the clock passing, so keep a slow
  // tick going for it too — a minute is fine when nothing is counting.
  useEffect(() => {
    if (running) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [Boolean(running)]);

  if (stale) return { kind: 'stale', session: stale, ms: elapsedMs(stale, now) };
  if (running) return { kind: 'running', session: running, ms: elapsedMs(running, now) };
  return null;
}

export function LiveBar({ banner }: { banner: Banner }) {
  const [location] = useLocation();
  if (!banner) return null;

  const href = `/log/${banner.session.date}`;
  // Two clocks on one screen is one too many.
  if (location === href) return null;

  const day = fromKey(banner.session.date).toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-4 py-2.5 border-b text-sm ${
        banner.kind === 'running'
          ? 'bg-accent/10 border-accent/25 text-ink'
          : 'bg-warn/10 border-warn/25 text-ink'
      }`}
    >
      {banner.kind === 'running' ? (
        <>
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
            <span className="relative size-2.5 rounded-full bg-accent" />
          </span>
          <span className="font-semibold">Session in progress</span>
          <span className="ml-auto font-bold tabular-nums">{formatClock(banner.ms)}</span>
        </>
      ) : (
        <>
          <CircleAlert size={16} className="text-warn shrink-0" />
          <span className="font-semibold">
            {day}'s session is still open
            <span className="font-normal text-ink-soft"> · {describeSpan(banner.ms)}</span>
          </span>
        </>
      )}
      <ChevronRight size={16} className="text-ink-soft shrink-0" />
    </Link>
  );
}
