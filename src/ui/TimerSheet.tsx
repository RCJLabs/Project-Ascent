import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import type { Protocol, ProtocolTimer } from '@/content/types';
import {
  buildTimer,
  formatClock,
  positionAt,
  segmentStartMs,
  workLabel,
  type SegmentKind,
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

export function TimerSheet({
  protocol,
  sets,
  exerciseName,
  override,
  onClose,
  onComplete,
}: {
  protocol: Protocol;
  sets: number;
  exerciseName: string;
  /** Week-specific timing that supersedes the protocol's defaults. */
  override?: Partial<ProtocolTimer>;
  onClose: () => void;
  onComplete?: () => void;
}) {
  const plan = useRef(buildTimer({ ...protocol.timer!, ...override }, sets)).current;

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sound, setSound] = useState(cuesEnabled());
  const startedAt = useRef<number | null>(null);
  const baseElapsed = useRef(0);
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
        onComplete?.();
      }
      return;
    }
    if (pos.index !== lastIndex.current) {
      lastIndex.current = pos.index;
      lastCountdown.current = -1;
      const kind = pos.segment?.kind;
      if (kind === 'work') cueWork();
      else if (kind === 'rest') cueRest();
      else if (kind === 'setRest') cueSetRest();
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
  }, [pos.index, pos.remainingMs, pos.done, running, plan, onComplete, pos.segment?.kind]);

  const start = useCallback(() => {
    unlock();
    finished.current = false;
    startedAt.current = Date.now();
    setRunning(true);
  }, []);

  const pause = useCallback(() => {
    const from = startedAt.current;
    if (from !== null) baseElapsed.current += Date.now() - from;
    startedAt.current = null;
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    baseElapsed.current = 0;
    startedAt.current = null;
    lastIndex.current = -1;
    lastCountdown.current = -1;
    finished.current = false;
    setElapsed(0);
    setRunning(false);
  }, []);

  const skip = useCallback(() => {
    const target = segmentStartMs(plan, pos.index + 1);
    baseElapsed.current = target;
    startedAt.current = running ? Date.now() : null;
    setElapsed(target);
  }, [plan, pos.index, running]);

  const segment = pos.segment;
  const kind: SegmentKind = segment?.kind ?? 'prepare';
  const label =
    kind === 'work' ? workLabel(protocol.name) : kind === 'prepare' ? 'Get ready' : kind === 'rest' ? 'Rest' : 'Set rest';
  const fraction = segment ? 1 - pos.remainingMs / (segment.seconds * 1000) : 1;
  const circumference = 2 * Math.PI * 46;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" role="dialog" aria-label={`${protocol.name} timer`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="min-w-0">
          <div className="font-bold truncate">{protocol.name}</div>
          {exerciseName !== protocol.name && (
            <div className="text-xs text-ink-soft truncate">{exerciseName}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              const next = !sound;
              setSound(next);
              setCuesEnabled(next);
              if (next) unlock();
            }}
            className="p-2 text-ink-soft"
            aria-label={sound ? 'Mute cues' : 'Unmute cues'}
          >
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button onClick={onClose} className="p-2 text-ink-soft" aria-label="Close timer">
            <X size={22} />
          </button>
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
                {segment && segment.rep > 0 && (
                  <div className="text-sm text-ink-soft mt-2">
                    Set {segment.set} of {plan.sets} · rep {segment.rep} of {plan.repsPerSet}
                  </div>
                )}
                {segment && segment.rep === 0 && kind === 'setRest' && (
                  <div className="text-sm text-ink-soft mt-2">
                    Next: set {segment.set + 1} of {plan.sets}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!pos.done && (
          <p className="text-sm text-ink-soft text-center max-w-sm">
            {protocol.grip ?? protocol.cues[0]}
          </p>
        )}

        <div className="text-xs text-ink-soft tabular-nums">
          {formatClock(pos.totalRemainingMs)} left overall
        </div>
      </div>

      <div className="px-4 pb-8 pt-2 flex items-center justify-center gap-3" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={reset}
          className="w-14 h-14 rounded-full border border-line flex items-center justify-center text-ink-soft"
          aria-label="Restart"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={running ? pause : start}
          disabled={pos.done}
          className="w-20 h-20 rounded-full bg-accent text-accent-ink flex items-center justify-center disabled:opacity-40"
          aria-label={running ? 'Pause' : 'Start'}
        >
          {running ? <Pause size={30} /> : <Play size={30} className="ml-1" />}
        </button>
        <button
          onClick={skip}
          disabled={pos.done}
          className="w-14 h-14 rounded-full border border-line flex items-center justify-center text-ink-soft disabled:opacity-40"
          aria-label="Skip segment"
        >
          <SkipForward size={20} />
        </button>
      </div>
    </div>
  );
}
