import { describe, expect, it } from 'vitest';
import { PROTOCOLS } from '@/content/protocols';
import type { Protocol } from '@/content/types';
import {
  buildTimer,
  circuitSubject,
  formatClock,
  positionAt,
  protocolSubject,
  readSubject,
  segmentStartMs,
} from './timer';

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

/**
 * The sheet's subject (PLAN.md M99).
 *
 * The timer used to take a `Protocol` and read six things off it. A circuit
 * has intervals and none of the rest — no cues, no grip, and reps that are
 * different exercises rather than repetitions of one — so what it takes now
 * is plain data, and that data is also what a reload restores.
 */
describe('what the sheet is given', () => {
  const HANGS: Protocol = {
    id: 'max_hangs_10s',
    name: 'Max Hangs',
    description: 'Heavy, short, long rests.',
    timer: { workSec: 10, restSec: 0, repsPerSet: 1, setRestSec: 180 },
    grip: 'Half crimp on a 20mm edge.',
    cues: ['No burn, just tension.'],
  };

  it('builds a protocol subject from the protocol', () => {
    const subject = protocolSubject(HANGS, 'Max Hangs', 5);
    expect(subject).toMatchObject({
      title: 'Max Hangs',
      sets: 5,
      workWord: 'Hang',
      setWord: 'Set',
      hint: 'Half crimp on a 20mm edge.',
    });
    // Same name twice is one name, not a header repeated under itself.
    expect(subject?.subtitle).toBeUndefined();
    expect(subject?.steps).toBeUndefined();
  });

  it('keeps the exercise name when it differs from the protocol', () => {
    expect(protocolSubject(HANGS, 'Heavy hangs on the 20', 5)?.subtitle).toBe('Heavy hangs on the 20');
  });

  it('lets a week-specific override supersede the protocol', () => {
    expect(protocolSubject(HANGS, 'Max Hangs', 5, { setRestSec: 120 })?.timer.setRestSec).toBe(120);
  });

  it('falls back to the first cue when there is no grip', () => {
    const { grip: _drop, ...noGrip } = HANGS;
    expect(protocolSubject(noGrip, 'x', 2)?.hint).toBe('No burn, just tension.');
  });

  it('refuses a protocol with no intervals', () => {
    const { timer: _drop, ...untimed } = HANGS;
    expect(protocolSubject(untimed, 'x', 2)).toBeNull();
  });

  it('never builds a subject of no sets', () => {
    expect(protocolSubject(HANGS, 'x', 0)?.sets).toBe(1);
  });

  it('builds a circuit subject over the picked exercises', () => {
    const subject = circuitSubject(
      { rounds: '2', work: '40-60s', restBetween: '20s' },
      'Core circuit',
      ['Plank', 'Hollow Body Hold', 'L-Sit'],
    );
    expect(subject).toMatchObject({
      title: 'Core circuit',
      subtitle: '3 exercises',
      sets: 2,
      workWord: 'Work',
      setWord: 'Round',
      steps: ['Plank', 'Hollow Body Hold', 'L-Sit'],
    });
    expect(subject?.timer).toEqual({ workSec: 40, restSec: 20, repsPerSet: 3, setRestSec: 0 });
  });

  it('counts one exercise in the singular', () => {
    expect(circuitSubject({ rounds: '2', work: '30s' }, 'Core', ['Plank'])?.subtitle).toBe('1 exercise');
  });

  it('is null where the circuit cannot be read', () => {
    expect(circuitSubject({ rounds: '3', restBetweenRounds: '60s' }, 'Core', ['Plank'])).toBeNull();
    expect(circuitSubject({ rounds: '2', work: '30s' }, 'Core', [])).toBeNull();
  });
});

/**
 * Read back rather than cast. `sessionStorage` holds whatever was last
 * written to it, including a shape from a version of the app that has since
 * been replaced, and half a restored timer is worse than none.
 */
describe('reading a stored subject', () => {
  const GOOD = {
    title: 'Core circuit',
    timer: { workSec: 40, restSec: 20, repsPerSet: 3, setRestSec: 0 },
    sets: 2,
    workWord: 'Work',
    setWord: 'Round',
    steps: ['Plank', 'L-Sit'],
    hint: 'Brace, do not sag.',
  };

  it('accepts a whole one', () => {
    expect(readSubject(GOOD)).toEqual(GOOD);
  });

  it('refuses anything that is not an object', () => {
    for (const bad of [null, undefined, 'x', 42, []]) expect(readSubject(bad)).toBeNull();
  });

  it('refuses one with no intervals', () => {
    const { timer: _drop, ...rest } = GOOD;
    expect(readSubject(rest)).toBeNull();
    expect(readSubject({ ...GOOD, timer: { workSec: 40 } })).toBeNull();
  });

  it('refuses one missing a word it draws with', () => {
    for (const key of ['title', 'workWord', 'setWord']) {
      const broken: Record<string, unknown> = { ...GOOD };
      delete broken[key];
      expect(readSubject(broken), key).toBeNull();
    }
    expect(readSubject({ ...GOOD, sets: '2' })).toBeNull();
  });

  // Optional fields are optional, not required-and-blank.
  it('drops optional fields it cannot trust, keeping the rest', () => {
    expect(readSubject({ ...GOOD, steps: [1, 2] })?.steps).toBeUndefined();
    expect(readSubject({ ...GOOD, subtitle: 7 })?.subtitle).toBeUndefined();
    expect(readSubject({ ...GOOD, hint: {} })?.hint).toBeUndefined();
    expect(readSubject({ ...GOOD, hint: {} })?.title).toBe('Core circuit');
  });
});
