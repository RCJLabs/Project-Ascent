/**
 * Protocol interval timer (PLAN.md §5.4).
 *
 * A protocol is expanded into a flat list of segments once, then position is
 * computed from elapsed wall-clock time rather than accumulated ticks. That
 * matters at the wall: phones throttle timers in background tabs and sleep
 * the screen mid-hang, and a tick-accumulating timer drifts or stalls under
 * both. Deriving position from a timestamp cannot drift.
 *
 * Pure — no React, no audio, no DOM.
 */

import type { CircuitFormat, Protocol, ProtocolTimer } from '@/content/types';
import { circuitPlan } from './circuit';

export type SegmentKind = 'prepare' | 'work' | 'rest' | 'setRest';

export interface Segment {
  kind: SegmentKind;
  seconds: number;
  /** 1-based set this segment belongs to. */
  set: number;
  /** 1-based rep within the set; 0 for prepare and set rest. */
  rep: number;
}

export interface TimerPlan {
  segments: Segment[];
  totalSeconds: number;
  sets: number;
  repsPerSet: number;
}

export const DEFAULT_PREPARE_SEC = 10;

/**
 * Expand a protocol into segments.
 *
 * Two rules that are easy to get wrong: the intra-rep rest is dropped after
 * the final rep of a set (the set rest takes over), and the set rest is
 * dropped after the final set (the session is over, not resting).
 */
export function buildTimer(
  timer: ProtocolTimer,
  sets: number,
  prepareSec: number = DEFAULT_PREPARE_SEC,
): TimerPlan {
  const segments: Segment[] = [];
  const totalSets = Math.max(1, sets);
  const reps = Math.max(1, timer.repsPerSet);

  if (prepareSec > 0) segments.push({ kind: 'prepare', seconds: prepareSec, set: 1, rep: 0 });

  for (let set = 1; set <= totalSets; set++) {
    for (let rep = 1; rep <= reps; rep++) {
      segments.push({ kind: 'work', seconds: timer.workSec, set, rep });
      const lastRep = rep === reps;
      if (!lastRep && timer.restSec > 0) {
        segments.push({ kind: 'rest', seconds: timer.restSec, set, rep });
      }
    }
    const lastSet = set === totalSets;
    if (!lastSet && timer.setRestSec > 0) {
      segments.push({ kind: 'setRest', seconds: timer.setRestSec, set, rep: 0 });
    }
  }

  return {
    segments,
    totalSeconds: segments.reduce((sum, s) => sum + s.seconds, 0),
    sets: totalSets,
    repsPerSet: reps,
  };
}

export interface TimerPosition {
  index: number;
  segment: Segment | null;
  /** Milliseconds left in the current segment. */
  remainingMs: number;
  /** Milliseconds left in the whole plan. */
  totalRemainingMs: number;
  done: boolean;
}

/** Where the timer stands after `elapsedMs` of running time. */
export function positionAt(plan: TimerPlan, elapsedMs: number): TimerPosition {
  const totalMs = plan.totalSeconds * 1000;
  if (elapsedMs >= totalMs) {
    return { index: plan.segments.length, segment: null, remainingMs: 0, totalRemainingMs: 0, done: true };
  }
  let cursor = Math.max(0, elapsedMs);
  for (let i = 0; i < plan.segments.length; i++) {
    const segment = plan.segments[i]!;
    const ms = segment.seconds * 1000;
    if (cursor < ms) {
      return {
        index: i,
        segment,
        remainingMs: ms - cursor,
        totalRemainingMs: totalMs - Math.max(0, elapsedMs),
        done: false,
      };
    }
    cursor -= ms;
  }
  return { index: plan.segments.length, segment: null, remainingMs: 0, totalRemainingMs: 0, done: true };
}

/** Elapsed time at which a segment begins — used to skip forward. */
export function segmentStartMs(plan: TimerPlan, index: number): number {
  let ms = 0;
  for (let i = 0; i < Math.min(index, plan.segments.length); i++) {
    ms += plan.segments[i]!.seconds * 1000;
  }
  return ms;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}

export const SEGMENT_LABEL: Record<SegmentKind, string> = {
  prepare: 'Get ready',
  work: 'Hang',
  rest: 'Rest',
  setRest: 'Set rest',
};

/** Work-phase wording differs by protocol; hangs "hang", others "work". */
export function workLabel(protocolName: string): string {
  return /hang|repeater|density|edge/i.test(protocolName) ? 'Hang' : 'Work';
}

/**
 * Everything the timer sheet needs, and nothing about where it came from
 * (PLAN.md M99).
 *
 * The sheet used to take a `Protocol` and read six things off it — the name
 * for the header, the name again for the work word, the grip or first cue for
 * the hint, the intervals, and "Set n of m". A circuit has intervals and none
 * of the rest: it has no cues, no grip, and its reps are different exercises
 * rather than repetitions of one. Faking a `Protocol` for it would be
 * inventing a named training method that does not exist, which is the kind of
 * thing `programFile.ts` refuses on the way in.
 *
 * So the sheet takes plain data. It is also what gets persisted across a
 * reload, which collapses two shapes into one: what the sheet needs to draw
 * and what a resume needs to restore are the same thing.
 */
export interface TimerSubject {
  /** Header line. */
  title: string;
  /** Second line, when there is more to say than the title. */
  subtitle?: string;
  timer: ProtocolTimer;
  sets: number;
  /** What the work phase is called — "Hang" on a fingerboard, else "Work". */
  workWord: string;
  /** What one pass through the reps is called: "Set", or "Round". */
  setWord: string;
  /** What each rep slot is, when the reps are different exercises. */
  steps?: string[];
  /** The line under the dial. */
  hint?: string;
}

/** A named protocol, as the sheet sees it. */
export function protocolSubject(
  protocol: Protocol,
  exerciseName: string,
  sets: number,
  override?: Partial<ProtocolTimer>,
): TimerSubject | null {
  if (!protocol.timer) return null;
  const hint = protocol.grip ?? protocol.cues[0];
  return {
    title: protocol.name,
    ...(exerciseName !== protocol.name ? { subtitle: exerciseName } : {}),
    timer: { ...protocol.timer, ...override },
    sets: Math.max(1, sets),
    workWord: workLabel(protocol.name),
    setWord: 'Set',
    ...(hint === undefined ? {} : { hint }),
  };
}

/**
 * A block run as a circuit, over the exercises the climber picked.
 *
 * Null rather than a subject when the prose cannot be read — the caller has
 * `circuitPlan` for the reason, which it needs anyway to say why the button
 * is not there.
 */
export function circuitSubject(
  circuit: CircuitFormat,
  blockName: string,
  steps: readonly string[],
): TimerSubject | null {
  const plan = circuitPlan(circuit, steps.length);
  if (!plan.ok) return null;
  return {
    title: blockName,
    subtitle: steps.length === 1 ? '1 exercise' : `${steps.length} exercises`,
    timer: plan.timer,
    sets: plan.sets,
    workWord: 'Work',
    setWord: 'Round',
    steps: [...steps],
  };
}

/**
 * The record of a subject, as it comes back from storage.
 *
 * `sessionStorage` holds whatever was last written to it, including a shape
 * from a version of the app that has since been replaced, and a half-restored
 * timer is worse than none — so this is checked rather than cast, the same
 * rule `sound.ts` applies to every record entering from the database.
 */
export function readSubject(raw: unknown): TimerSubject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const t = r['timer'];
  if (typeof t !== 'object' || t === null) return null;
  const timer = t as Record<string, unknown>;
  const numbers = ['workSec', 'restSec', 'repsPerSet', 'setRestSec'] as const;
  if (numbers.some((k) => typeof timer[k] !== 'number')) return null;
  if (['title', 'workWord', 'setWord'].some((k) => typeof r[k] !== 'string')) return null;
  if (typeof r['sets'] !== 'number') return null;
  const steps = r['steps'];
  return {
    title: r['title'] as string,
    ...(typeof r['subtitle'] === 'string' ? { subtitle: r['subtitle'] } : {}),
    timer: {
      workSec: timer['workSec'] as number,
      restSec: timer['restSec'] as number,
      repsPerSet: timer['repsPerSet'] as number,
      setRestSec: timer['setRestSec'] as number,
    },
    sets: r['sets'] as number,
    workWord: r['workWord'] as string,
    setWord: r['setWord'] as string,
    ...(Array.isArray(steps) && steps.every((s) => typeof s === 'string')
      ? { steps: steps as string[] }
      : {}),
    ...(typeof r['hint'] === 'string' ? { hint: r['hint'] } : {}),
  };
}
