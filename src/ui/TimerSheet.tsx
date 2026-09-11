import { useCallback, useEffect, useRef, useState } from 'react';
import { useDialog } from './useDialog';
import { Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { announce } from './Announce';
import { IconButton } from './IconButton';
import {
  buildTimer,
  formatClock,
  positionAt,
  segmentStartMs,
  type SegmentKind,
  type TimerSubject,
} from '@/engine/timer';
import { cueCountdown, cueDone, cueRest, cueSetRest, cueWork, cuesEnabled, setCuesEnabled, unlock } from '@/lib/cues';
import { keepAwake, releaseAwake } from '@/lib/wakeLock';

const TONE: Record<SegmentKind, string> = {
  prepare: 'text-ink-soft',
  work: 'text-accent',
  rest: 'text-positive',
  setRest: 'text-warn',
};

const RING: Record<SegmentKind, string> = {
  prepare: 'stroke-ink-soft',
  work: 'stroke-accent',
  rest: 'stroke-positive',
  setRest: 'stroke-warn',
};

/**
 * The interval timer, over anything with intervals (PLAN.md M99).
 *
 * It used to take a `Protocol` and read the header, the work word, the hint
 * and the intervals off it. A circuit has intervals and none of the rest, so
 * what arrives now is a `TimerSubject` — plain data, built by
 * `protocolSubject` or `circuitSubject`, and the same shape a reload restores.
 */
export function TimerSheet({
  subject,
  resume,
  onPersist,
  onClose,
  onComplete,
}: {
  subject: TimerSubject;
  /** Where a reload left off, if it left off anywhere. */
  resume?: { baseElapsed: number; startedAt: number | null } | undefined;
  /** Called whenever the clock starts, stops or resets, so the owner can
   *  write it somewhere a reload cannot reach. */
  onPersist?: (state: { baseElapsed: number; startedAt: number | null }) => void;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const plan = useRef(buildTimer(subject.timer, subject.sets)).current;
  const setWord = subject.setWord.toLowerCase();

  const [running, setRunning] = useState(resume?.startedAt != null);
  const [elapsed, setElapsed] = useState(() =>
    resume === undefined
      ? 0
      : resume.startedAt === null
        ? resume.baseElapsed
        : resume.baseElapsed + Math.max(0, Date.now() - resume.startedAt),
  );
  const [sound, setSound] = useState(cuesEnabled());
  const startedAt = useRef<number | null>(resume?.startedAt ?? null);
  const baseElapsed = useRef(resume?.baseElapsed ?? 0);
  const lastIndex = useRef(-1);
  const lastCountdown = useRef(-1);
  const finished = useRef(false);

  // Position is derived from wall-clock time, so throttled ticks and a
  // sleeping screen cannot make the timer drift.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const from = startedAt.current;
      if (from !== null) setElapsed(baseElapsed.current + (Date.now() - from));
    }, 100);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    void keepAwake();
    return () => {
      void releaseAwake();
    };
  }, []);

  const pos = positionAt(plan, elapsed);

  // Cues fire on transitions, derived from position rather than scheduled,
  // so a backgrounded tab resumes correctly instead of replaying a backlog.
  useEffect(() => {
    if (!running) return;
    if (pos.done) {
      if (!finished.current) {
        finished.current = true;
        cueDone();
        setRunning(false);
        // Assertive: a cue you hear and a cue you are told are the same
        // information, and both are useless if they arrive after the set.
        announce(`${subject.title} complete. ${plan.sets} ${setWord}s done.`, 'assertive');
        onComplete?.();
      }
      return;
    }
    if (pos.index !== lastIndex.current) {
      lastIndex.current = pos.index;
      lastCountdown.current = -1;
      const kind = pos.segment?.kind;
      const seconds = pos.segment?.seconds;
      if (kind === 'work') cueWork();
      else if (kind === 'rest') cueRest();
      else if (kind === 'setRest') cueSetRest();
      if (kind !== undefined) {
        const said =
          kind === 'work' ? 'Work' : kind === 'rest' ? 'Rest' : kind === 'setRest' ? 'Set rest' : 'Get ready';
        announce(seconds === undefined ? said : `${said}, ${seconds} seconds`, 'assertive');
      }
    }
    // Three ticks leading into the next work phase.
    const next = plan.segments[pos.index + 1];
    const leadsToWork = pos.segment?.kind !== 'work' && (next?.kind === 'work' || pos.segment?.kind === 'prepare');
    if (leadsToWork) {
      const secs = Math.ceil(pos.remainingMs / 1000);
      if (secs <= 3 && secs >= 1 && secs !== lastCountdown.current) {
        lastCountdown.current = secs;
        cueCountdown();
      }
    }
  }, [pos.index, pos.remainingMs, pos.done, running, plan, onComplete, subject.title, setWord, pos.segment?.kind, pos.segment?.seconds]);

  const start = useCallback(() => {
    unlock();
    finished.current = false;
    startedAt.current = Date.now();
    setRunning(true);
    onPersist?.({ baseElapsed: baseElapsed.current, startedAt: startedAt.current });
  }, [onPersist]);

  const pause = useCallback(() => {
    const from = startedAt.current;
    if (from !== null) baseElapsed.current += Date.now() - from;
    startedAt.current = null;
    setRunning(false);
    onPersist?.({ baseElapsed: baseElapsed.current, startedAt: null });
  }, [onPersist]);

  const reset = useCallback(() => {
    baseElapsed.current = 0;
    startedAt.current = null;
    lastIndex.current = -1;
    lastCountdown.current = -1;
    finished.current = false;
    setElapsed(0);
    onPersist?.({ baseElapsed: 0, startedAt: null });
    setRunning(false);
  }, []);

  const skip = useCallback(() => {
    const target = segmentStartMs(plan, pos.index + 1);
    baseElapsed.current = target;
    startedAt.current = running ? Date.now() : null;
    setElapsed(target);
  }, [plan, pos.index, running]);

  // Escape here does what the X does, including discarding a running
  // protocol — see `useDialog`.
  const sheet = useDialog<HTMLDivElement>(onClose);

  const segment = pos.segment;
  const steps = subject.steps;
  const kind: SegmentKind = segment?.kind ?? 'prepare';
  const label =
    kind === 'work'
      ? subject.workWord
      : kind === 'prepare'
        ? 'Get ready'
        : kind === 'rest'
          ? 'Rest'
          : `${subject.setWord} rest`;
  const fraction = segment ? 1 - pos.remainingMs / (segment.seconds * 1000) : 1;
  const circumference = 2 * Math.PI * 46;

  return (
    <div
      ref={sheet}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-bg flex flex-col outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${subject.title} timer`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <div className="font-bold truncate">{subject.title}</div>
          {subject.subtitle !== undefined && (
            <div className="text-xs text-ink-soft truncate">{subject.subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconButton
            inline={false}
            onClick={() => {
              const next = !sound;
              setSound(next);
              setCuesEnabled(next);
              if (next) unlock();
            }}
            label={sound ? 'Mute cues' : 'Unmute cues'}
          >
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </IconButton>
          <IconButton inline={false} onClick={onClose} label="Close timer">
            <X size={22} />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        <div className="relative w-64 h-64 max-w-[70vw] max-h-[70vw]">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="46" className="stroke-line" strokeWidth="5" fill="none" />
            <circle
              cx="50"
              cy="50"
              r="46"
              className={pos.done ? 'stroke-positive' : RING[kind]}
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - (pos.done ? 1 : fraction))}
              style={{ transition: 'stroke-dashoffset 120ms linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {pos.done ? (
              <>
                <div className="text-4xl font-black text-positive">Done</div>
                <div className="text-sm text-ink-soft mt-1">{plan.sets} sets complete</div>
              </>
            ) : (
              <>
                <div className={`text-xs font-bold uppercase tracking-widest ${TONE[kind]}`}>{label}</div>
                <div className="text-6xl font-black tabular-nums leading-none mt-1">
                  {formatClock(pos.remainingMs)}
                </div>
                {/* A circuit's reps are different exercises, so the name is
                    the useful thing rather than "rep 3 of 5" — and during the
                    rest it is the *next* one, which is what a climber
                    standing up needs to know. It gets its own line: at 320px
                    "Round 1 of 2 · Mountain Climbers" wrapped out past the
                    ring, which a browser showed and jsdom could not. */}
                {segment && segment.rep > 0 && (
                  <div className="text-sm text-ink-soft mt-2 px-5 text-center text-balance">
                    {steps === undefined ? (
                      `${subject.setWord} ${segment.set} of ${plan.sets} · rep ${segment.rep} of ${plan.repsPerSet}`
                    ) : (
                      <>
                        <span className="block text-xs uppercase tracking-wide">
                          {subject.setWord} {segment.set} of {plan.sets}
                        </span>
                        <span className="block">
                          {kind === 'work'
                            ? (steps[segment.rep - 1] ?? `Exercise ${segment.rep}`)
                            : `Next: ${steps[segment.rep] ?? '—'}`}
                        </span>
                      </>
                    )}
                  </div>
                )}
                {segment && segment.rep === 0 && kind === 'setRest' && (
                  <div className="text-sm text-ink-soft mt-2 px-4">
                    Next: {setWord} {segment.set + 1} of {plan.sets}
                    {steps === undefined ? '' : `, from ${steps[0] ?? '—'}`}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!pos.done && subject.hint !== undefined && (
          <p className="text-sm text-ink-soft text-center max-w-sm">{subject.hint}</p>
        )}

        <div className="text-xs text-ink-soft tabular-nums">
          {formatClock(pos.totalRemainingMs)} left overall
        </div>
      </div>

      <div className="px-4 pb-8 pt-2 flex items-center justify-center gap-3" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={reset}
          className="focus-ring w-14 h-14 rounded-full border border-line flex items-center justify-center text-ink-soft"
          aria-label="Restart"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={running ? pause : start}
          disabled={pos.done}
          className="focus-ring w-20 h-20 rounded-full bg-accent text-accent-ink flex items-center justify-center disabled:opacity-40"
          aria-label={running ? 'Pause' : 'Start'}
        >
          {running ? <Pause size={30} /> : <Play size={30} className="ml-1" />}
        </button>
        <button
          onClick={skip}
          disabled={pos.done}
          className="focus-ring w-14 h-14 rounded-full border border-line flex items-center justify-center text-ink-soft disabled:opacity-40"
          aria-label="Skip segment"
        >
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
}
