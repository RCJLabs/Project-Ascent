import { useEffect, useRef, useState } from 'react';
import { Square, X } from 'lucide-react';

import type { Metric } from '@/content/types';
import { formatStopwatch, holdValue, marksBy, type HoldTest } from '@/engine/holdTest';
import { announce } from '@/ui/Announce';
import { IconButton } from '@/ui/IconButton';
import { useDialog } from '@/ui/useDialog';
import { cueCountdown, cueDone, cueRest, cueWork, unlock } from '@/lib/cues';
import { keepAwake, releaseAwake } from '@/lib/wakeLock';

/**
 * A stopwatch for the benchmarks that are a hold (PLAN.md M99b).
 *
 * **Not `TimerSheet`.** That counts *down* through a plan built in advance,
 * and a max hold has no plan: the whole question is how long you last. M99
 * refused to fake a `Protocol` for a circuit for the same kind of reason, and
 * faking a plan of unknown length here would be worse — the ring would be
 * drawing a fraction of a total nobody knows.
 *
 * **Wall clock, not accumulated ticks.** The same rule `timer.ts` states at
 * length: phones throttle intervals in a backgrounded tab and sleep the
 * screen, and a counter built from ticks drifts under both. Position comes
 * from `Date.now()` against a start, which cannot.
 *
 * **Three seconds to get on the bar.** Not ten, which is what a hangboard
 * protocol gives: you are already chalked and standing under it when you tap,
 * and a long wait is a long wait with your hands up.
 */
export function HoldTimer({
  metric,
  test,
  onStop,
  onClose,
}: {
  metric: Metric;
  test: HoldTest;
  /** The result, in the metric's own unit. The caller confirms it. */
  onStop: (value: number) => void;
  onClose: () => void;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const marks = useRef(0);

  // One interval for both phases; which one is running is decided by state.
  useEffect(() => {
    if (startedAt === null && countdown === null) return;
    const id = window.setInterval(() => {
      if (startedAt !== null) setElapsed(Date.now() - startedAt);
      else if (countdown !== null) setCountdown((n) => (n === null ? null : n - 1));
    }, startedAt !== null ? 100 : 1000);
    return () => window.clearInterval(id);
  }, [startedAt, countdown === null]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      cueCountdown();
      return;
    }
    setCountdown(null);
    // No resetting of `elapsed` or the mark counter here. Both start at zero
    // and nothing can make them non-zero before the first start — the sheet
    // has no restart, because closing it unmounts. Two mutations proved the
    // resets were saying nothing, so they are gone.
    setStartedAt(Date.now());
    cueWork();
    announce('Go.', 'assertive');
  }, [countdown]);

  // A mark you can hear while you are hanging, so the number at the end is
  // not a surprise. Derived from elapsed rather than scheduled, so a tab that
  // was backgrounded resumes instead of replaying a backlog.
  useEffect(() => {
    if (startedAt === null) return;
    const due = marksBy(elapsed, test);
    if (due <= marks.current) return;
    marks.current = due;
    cueRest();
    announce(formatStopwatch(elapsed), 'assertive');
  }, [elapsed, startedAt, test]);

  useEffect(() => {
    void keepAwake();
    return () => {
      void releaseAwake();
    };
  }, []);

  const sheet = useDialog<HTMLDivElement>(onClose);
  const running = startedAt !== null;

  function stop() {
    cueDone();
    onStop(holdValue(elapsed, test));
  }

  return (
    <div
      ref={sheet}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-bg flex flex-col outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${metric.label} stopwatch`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <div className="font-bold truncate">{metric.label}</div>
          <div className="text-xs text-ink-soft truncate">Timed, then confirmed</div>
        </div>
        <IconButton inline={false} onClick={onClose} label="Close stopwatch">
          <X size={22} />
        </IconButton>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {countdown !== null ? (
          <>
            <div className="text-xs font-bold uppercase tracking-widest text-ink-soft">Get ready</div>
            <div className="text-8xl font-black tabular-nums leading-none">{countdown}</div>
          </>
        ) : (
          <>
            <div
              className={`text-xs font-bold uppercase tracking-widest ${running ? 'text-accent' : 'text-ink-soft'}`}
            >
              {running ? 'Holding' : 'Ready'}
            </div>
            <div className="text-7xl font-black tabular-nums leading-none">{formatStopwatch(elapsed)}</div>
            <p className="text-sm text-ink-soft text-center max-w-sm leading-relaxed">
              {running
                ? 'Drop off, then stop the clock — a second late is not wrong. You confirm the number before anything is saved.'
                : metric.description ??
                  'Hold it until you cannot, then stop the clock.'}
            </p>
          </>
        )}
      </div>

      <div
        className="px-4 pb-8 pt-2 flex items-center justify-center gap-3"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        {running ? (
          <button
            onClick={stop}
            className="focus-ring w-20 h-20 rounded-full bg-accent text-accent-ink flex items-center justify-center"
            aria-label="Stop"
          >
            <Square size={28} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={() => {
              // Audio on a phone only plays after a gesture; this is it.
              unlock();
              setCountdown(3);
            }}
            disabled={countdown !== null}
            className="focus-ring px-8 h-20 rounded-full bg-accent text-accent-ink font-black text-xl disabled:opacity-40"
          >
            Start
          </button>
        )}
      </div>
    </div>
  );
}
