import { describe, expect, it } from 'vitest';
import type { Climb } from '@/db/sessions';
import { gymSummary } from './gym';
import { REST_PRESETS, climbOutcome, restLabel, restRemaining } from './gymWords';

/**
 * Gym mode's arithmetic (PLAN.md M74).
 *
 * Small, because most of the milestone is a screen — but the tally is the
 * one control the climber uses without looking at it, and a tally that
 * miscounts is worse than no tally.
 */

let n = 0;
const climb = (over: Partial<Climb> = {}): Climb => ({
  id: `c${(n += 1)}`,
  grade: 'V4',
  scale: 'V',
  count: 1,
  result: 'send',
  ...over,
});

describe('how a climb went', () => {
  it('has a word for each of the four', () => {
    expect(climbOutcome(climb())).toBe('sent');
    expect(climbOutcome(climb({ style: 'flash' }))).toBe('flash');
    expect(climbOutcome(climb({ style: 'onsight' }))).toBe('on-sight');
    expect(climbOutcome(climb({ result: 'attempt' }))).toBe('tried');
  });

  it('calls an attempt an attempt whatever style is on it', () => {
    // A stored style on an attempt is a leftover from an edit, not a claim
    // that the climber flashed something they fell off.
    expect(climbOutcome(climb({ result: 'attempt', style: 'flash' }))).toBe('tried');
  });
});

describe('the running total', () => {
  it('counts repeats rather than rows', () => {
    const summary = gymSummary([climb({ count: 4 }), climb({ count: 2, result: 'attempt' })]);
    expect(summary).toMatchObject({ total: 6, sends: 4, attempts: 2 });
  });

  it('names the hardest thing sent, not the hardest thing tried', () => {
    const rows = [climb({ grade: 'V4' }), climb({ grade: 'V8', result: 'attempt' })];
    expect(gymSummary(rows).hardest?.grade).toBe('V4');
  });

  it('weighs a route against a boulder on the one ladder that can', () => {
    // 5.13a is harder than V4, and there is no way to know that without
    // putting both on the same scale.
    const rows = [climb({ grade: 'V4' }), climb({ grade: '5.13a', scale: 'YDS' })];
    expect(gymSummary(rows).hardest?.grade).toBe('5.13a');
  });

  it('never picks a grade it cannot place', () => {
    expect(gymSummary([climb({ grade: 'V nonsense' })]).hardest).toBeNull();
  });

  it('has no hardest when nothing has been sent', () => {
    expect(gymSummary([climb({ result: 'attempt' })]).hardest).toBeNull();
    expect(gymSummary([]).hardest).toBeNull();
  });
});

describe('the rest timer', () => {
  it('counts down from an end time, so a sleeping phone does not pause it', () => {
    expect(restRemaining(1_000_000, 999_000)).toBe(1000);
  });

  it('floors at zero rather than going negative', () => {
    expect(restRemaining(1_000_000, 1_100_000)).toBe(0);
  });

  it('offers rests a climber actually takes, shortest first', () => {
    expect([...REST_PRESETS]).toEqual([...REST_PRESETS].sort((a, b) => a - b));
    expect(REST_PRESETS[0]).toBeGreaterThanOrEqual(60);
    expect(REST_PRESETS[REST_PRESETS.length - 1]).toBeLessThanOrEqual(600);
  });

  it('labels whole minutes as minutes', () => {
    expect(restLabel(60)).toBe('1 min');
    expect(restLabel(300)).toBe('5 min');
  });

  it('labels the rest as a clock', () => {
    expect(restLabel(90)).toBe('1:30');
    expect(restLabel(45)).toBe('0:45');
  });

  it('labels every preset it offers', () => {
    for (const seconds of REST_PRESETS) expect(restLabel(seconds)).toMatch(/^\d/);
  });
});
