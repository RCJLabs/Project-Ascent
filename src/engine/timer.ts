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

import type { ProtocolTimer } from '@/content/types';

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
