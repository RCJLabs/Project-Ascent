import { describe, expect, it } from 'vitest';
import { getDrill } from '@/content/drills';
import { BASE_CAMP, IRON_GRIP, TRIP_PREP } from '@/content/programs/catalogue';
import type { Drill, Exercise } from '@/content/types';
import type { BlockPrescription } from './plan';
import { prescriptionFor } from './plan';
import { describeWork, secondsRange, workMinutes } from './sessionLength';

/**
 * How long the prescribed work takes (PLAN.md M131).
 *
 * The arithmetic is the easy half. The half worth testing is what the module
 * *refuses* to answer, because every wrong answer here is confidently wrong:
 * a three-minute estimate over an evening of limit bouldering is worse than
 * no estimate, and the first draft produced exactly that.
 */

const block = (...exercises: Exercise[]): BlockPrescription[] => [
  { blockId: 'b', name: 'Block', entry: { rationale: '', exercises } },
];

describe('reading a duration', () => {
  it('reads seconds and minutes', () => {
    expect(secondsRange('45s')).toEqual({ low: 45, high: 45 });
    expect(secondsRange('3 min')).toEqual({ low: 180, high: 180 });
  });

  it('reads a range as a range', () => {
    expect(secondsRange('2-3 min')).toEqual({ low: 120, high: 180 });
  });

  it('reads a duration that carries a word after it', () => {
    // ARC is '15-30 min continuous', and the continuous part is the point.
    expect(secondsRange('15-30 min continuous')).toEqual({ low: 900, high: 1800 });
  });

  it('refuses what is not a duration', () => {
    expect(secondsRange('a while')).toBeNull();
    expect(secondsRange(undefined)).toBeNull();
    expect(secondsRange('0 min')).toBeNull();
  });
});

describe('what the prescription comes to', () => {
  it('counts work and the rest between sets', () => {
    // 6 sets of a 60s hold with 3 min rest: 6 minutes of work, five rests of
    // three, and the 45s gap before whatever is next. 21.75 min, so 22.
    const estimate = workMinutes(block({ name: 'Hang', sets: '6', hold: '60s', rest: '3 min' }));
    expect(estimate?.low).toBe(22);
  });

  it('drops the rest after the last set, because the session is over', () => {
    const one = workMinutes(block({ name: 'Hang', sets: '1', hold: '15 min', rest: '5 min' }));
    const two = workMinutes(block({ name: 'Hang', sets: '2', hold: '15 min', rest: '5 min' }));
    // The second set adds its own fifteen minutes and one rest, not two.
    expect(two!.low - one!.low).toBe(20);
  });

  it('gives a range when the dose is a range', () => {
    const estimate = workMinutes(block({ name: 'Hang', sets: '3-5', hold: '2 min', rest: '3 min' }));
    expect(estimate!.high).toBeGreaterThan(estimate!.low);
  });

  it('counts reps when there is no hold', () => {
    const few = workMinutes(block({ name: 'Pull-ups', sets: '5', reps: '5', rest: '3 min' }));
    const many = workMinutes(block({ name: 'Pull-ups', sets: '5', reps: '25', rest: '3 min' }));
    expect(many!.low).toBeGreaterThan(few!.low);
  });

  it('says nothing about a session it cannot read', () => {
    expect(workMinutes(block({ name: 'Climb hard' }))).toBeNull();
    expect(workMinutes([])).toBeNull();
  });

  it('says nothing when a quarter of the lines are unreadable', () => {
    const half = workMinutes(
      block(
        { name: 'Hang', sets: '10', hold: '60s', rest: '2 min' },
        { name: 'And then climb' },
      ),
    );
    expect(half).toBeNull();
  });
});

describe('a burn is not a rep', () => {
  it('refuses a set counted in climbs', () => {
    // '5 sets of 1 burn each' parses perfectly and means nothing to a clock.
    // Read as reps it is fifteen seconds of limit bouldering.
    expect(workMinutes(block({ name: 'Limit burns', sets: '8', reps: '1 burn each', rest: '4 min' }))).toBeNull();
  });

  it('refuses the other words a climb is counted in', () => {
    for (const reps of ['4-6 easy problems', '2 easy routes', '3-4 boulders', '4 laps', '30-40 minutes']) {
      expect(workMinutes(block({ name: 'Volume', sets: '2', reps, rest: '3 min' })), reps).toBeNull();
    }
  });

  it('still reads a plain count', () => {
    expect(workMinutes(block({ name: 'Rows', sets: '8', reps: '10-12', rest: '3 min' }))).not.toBeNull();
  });
});

describe('the floor under a session', () => {
  /**
   * Both directions, against the real catalogue, because a floor cannot
   * notice being moved. Base Camp's performance day is nine lines of
   * post-climb core circuit with the climbing itself nowhere in the data;
   * Trip Prep's finger primer is two lines and genuinely the whole session.
   * Raise the floor and the second test fails; drop it and the first does.
   */
  const first = (id: string, typeId: string) => {
    const program = id === 'base_camp' ? BASE_CAMP : TRIP_PREP;
    const type = program.sessionTypes.find((t) => t.id === typeId)!;
    return workMinutes(prescriptionFor(type, program.phases[0]!, undefined, 1, false));
  };

  it('refuses a prescription that is plainly a corner of a session', () => {
    expect(first('base_camp', 'perf')).toBeNull();
  });

  it('reports a session that is genuinely short', () => {
    const primer = first('trip_prep', 'fp');
    expect(primer).not.toBeNull();
    expect(primer!.low).toBeLessThan(20);
  });
});

describe('the drill is the day’s climbing', () => {
  const drill = (): Drill => getDrill('sticky_feet')!;

  it('counts the drill the program placed', () => {
    const estimate = workMinutes([], drill());
    expect(estimate).not.toBeNull();
    expect(secondsRange(drill().duration)!.low / 60).toBeCloseTo(estimate!.low, 0);
  });

  it('adds it to the blocks rather than replacing them', () => {
    // Longer than either half, not merely longer than the shorter one:
    // a version that dropped the blocks the moment a drill existed still
    // beat the blocks alone, because the drill is the longer of the two.
    const blocks = block({ name: 'Hang', sets: '6', hold: '60s', rest: '3 min' });
    const alone = workMinutes(blocks)!;
    const drillOnly = workMinutes([], drill())!;
    const both = workMinutes(blocks, drill())!;
    expect(both.low).toBe(alone.low + drillOnly.low);
  });
});

describe('it moves with the prescription', () => {
  /** Iron Grip's finger day, in an ordinary week and in a deload one. */
  const fingerDay = (deload: boolean) => {
    const type = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    return workMinutes(prescriptionFor(type, IRON_GRIP.phases[0]!, undefined, 4, deload));
  };

  it('is shorter on a deload week, without being told', () => {
    // A set comes off each block that has one to give (M128), so the day is
    // genuinely shorter — and nothing here knows what a deload is.
    expect(fingerDay(true)!.low).toBeLessThan(fingerDay(false)!.low);
  });
});

describe('saying it', () => {
  it('reads as a range when it is one', () => {
    expect(describeWork({ low: 40, high: 55, read: 4, lines: 4 })).toBe('about 40-55 min of work');
  });

  it('reads as one number when the dose is exact', () => {
    expect(describeWork({ low: 40, high: 40, read: 4, lines: 4 })).toBe('about 40 min of work');
  });

  it('says nothing when there is nothing to say', () => {
    expect(describeWork(null)).toBeNull();
  });
});
