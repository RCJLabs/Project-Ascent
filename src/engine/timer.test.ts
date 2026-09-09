import { describe, expect, it } from 'vitest';
import { PROTOCOLS } from '@/content/protocols';
import { buildTimer, formatClock, positionAt, segmentStartMs } from './timer';

const REPEATERS = PROTOCOLS['repeaters_7_3']!.timer!;
const MAX_HANGS = PROTOCOLS['max_hangs_10s']!.timer!;

describe('buildTimer', () => {
  it('expands 7/3 repeaters correctly', () => {
    const plan = buildTimer(REPEATERS, 3, 0);
    // 6 reps per set: work,rest x5 then a final work with no trailing rest.
    const set1 = plan.segments.filter((s) => s.set === 1);
    expect(set1.filter((s) => s.kind === 'work')).toHaveLength(6);
    expect(set1.filter((s) => s.kind === 'rest')).toHaveLength(5);
    // Two set rests between three sets, never after the last.
    expect(plan.segments.filter((s) => s.kind === 'setRest')).toHaveLength(2);
    expect(plan.segments.at(-1)!.kind).toBe('work');
  });

  it('computes total duration', () => {
    const plan = buildTimer(REPEATERS, 3, 0);
    // per set: 6x7s work + 5x3s rest = 57s; 3 sets = 171s; + 2x180s set rest.
    expect(plan.totalSeconds).toBe(57 * 3 + 180 * 2);
  });

  it('omits intra-set rest when the protocol has none', () => {
    const plan = buildTimer(MAX_HANGS, 5, 0);
    expect(plan.segments.filter((s) => s.kind === 'rest')).toHaveLength(0);
    expect(plan.segments.filter((s) => s.kind === 'work')).toHaveLength(5);
    expect(plan.segments.filter((s) => s.kind === 'setRest')).toHaveLength(4);
  });

  it('includes a prepare segment when asked', () => {
    const plan = buildTimer(MAX_HANGS, 2);
    expect(plan.segments[0]!.kind).toBe('prepare');
    expect(plan.segments[0]!.seconds).toBe(10);
  });

  it('never builds a zero-set or zero-rep plan', () => {
    const plan = buildTimer({ workSec: 5, restSec: 0, repsPerSet: 0, setRestSec: 0 }, 0, 0);
    expect(plan.sets).toBe(1);
    expect(plan.repsPerSet).toBe(1);
    expect(plan.segments).toHaveLength(1);
  });
});

describe('positionAt', () => {
  const plan = buildTimer(REPEATERS, 2, 0); // set1: 57s, setRest 180s, set2: 57s

  it('reports the first segment at zero', () => {
    const p = positionAt(plan, 0);
    expect(p.segment!.kind).toBe('work');
    expect(p.segment!.set).toBe(1);
    expect(p.segment!.rep).toBe(1);
    expect(p.remainingMs).toBe(7000);
  });

  it('crosses a boundary exactly on the second', () => {
    // 7s in: first work is over, first rest begins.
    const p = positionAt(plan, 7000);
    expect(p.segment!.kind).toBe('rest');
    expect(p.remainingMs).toBe(3000);
  });

  it('locates a mid-plan position', () => {
    // 57s in: set 1 done, set rest begins.
    const p = positionAt(plan, 57_000);
    expect(p.segment!.kind).toBe('setRest');
    expect(p.remainingMs).toBe(180_000);
    // Deep into set 2's third rep.
    const q = positionAt(plan, 57_000 + 180_000 + 21_000);
    expect(q.segment!.set).toBe(2);
    expect(q.segment!.rep).toBe(3);
  });

  it('finishes cleanly and stays finished', () => {
    const end = plan.totalSeconds * 1000;
    expect(positionAt(plan, end).done).toBe(true);
    // A long background gap must not wrap around or throw.
    const late = positionAt(plan, end + 10 * 60_000);
    expect(late.done).toBe(true);
    expect(late.remainingMs).toBe(0);
  });

  it('survives a jump across many segments at once', () => {
    // Simulates a throttled tab resuming after 45 seconds.
    const p = positionAt(plan, 45_000);
    expect(p.done).toBe(false);
    expect(p.segment!.set).toBe(1);
    expect(p.segment!.rep).toBeGreaterThan(3);
  });

  it('clamps negative elapsed time', () => {
    expect(positionAt(plan, -5000).segment!.rep).toBe(1);
  });
});

describe('segmentStartMs', () => {
  it('gives the offset of a segment, for skipping', () => {
    const plan = buildTimer(REPEATERS, 2, 0);
    expect(segmentStartMs(plan, 0)).toBe(0);
    expect(segmentStartMs(plan, 1)).toBe(7000);
    expect(segmentStartMs(plan, plan.segments.length)).toBe(plan.totalSeconds * 1000);
  });
});

describe('formatClock', () => {
  it('rounds up so the display never shows 0 while time remains', () => {
    expect(formatClock(6800)).toBe('7');
    expect(formatClock(1)).toBe('1');
    expect(formatClock(0)).toBe('0');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(180_000)).toBe('3:00');
  });
});
