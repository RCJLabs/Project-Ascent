import { describe, expect, it } from 'vitest';
import { getDrill } from '@/content/drills';
import { BASE_CAMP, IRON_GRIP, OUTDOOR_CLIMBING, THE_CRUISER, TRIP_PREP } from '@/content/programs/catalogue';
import type { Drill, Exercise } from '@/content/types';
import type { BlockPrescription } from './plan';
import { prescriptionFor } from './plan';
import { describeWork, programSessionLengths, secondsRange, sessionMinutes, workMinutes } from './sessionLength';

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
    for (const reps of ['4-6 easy problems', '2 easy routes', '3-4 boulders', '4 laps']) {
      expect(workMinutes(block({ name: 'Volume', sets: '2', reps, rest: '3 min' })), reps).toBeNull();
    }
  });

  it('reads a count that is really a stretch of time', () => {
    // *1 set of 30-40 minutes* of varied volume has already answered the
    // question (PLAN.md M138). It was refused for saying "minutes", a word
    // in the climbing vocabulary above to catch "climb for a while" — and
    // it caught six lines across the catalogue that state their own length.
    // Plus the 45-second gap before whatever is next, which every exercise
    // gets — so 31 rather than 30.
    const spell = workMinutes(block({ name: 'Varied volume', sets: '1', reps: '30-40 minutes' }));
    expect(spell).toMatchObject({ low: 31, high: 41 });
    // Times the sets, like any other work: three twenty-minute blocks is an
    // hour, not twenty minutes.
    expect(workMinutes(block({ name: 'Laps', sets: '3', reps: '20 min' }))).toMatchObject({ low: 62 });
  });

  it('reads a hold before a spell of time, and a spell before a count', () => {
    // A hold is the more specific statement; a count of *12 per arm* is not
    // a duration at all and `secondsRange` must not read one into it.
    // Five 10s hangs on three minutes' rest is fourteen minutes; read as
    // twenty-minute sets it would be an hour and a half.
    expect(
      workMinutes(block({ name: 'Hang', sets: '5', reps: '20 minutes', hold: '10s', rest: '3 min' })),
    ).toMatchObject({ low: 14 });
    expect(workMinutes(block({ name: 'Rotations', sets: '30', reps: '12 per arm' }))).toMatchObject({ low: 41 });
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

/**
 * How long a session takes, where the dose cannot say (PLAN.md M138).
 *
 * The estimate answered for twenty-five of forty-two session types and the
 * other seventeen were the climbing days, whose length is a coaching
 * decision rather than a consequence of sets and reps. `sessionMinutes` is
 * the one resolver every reader shares: the author's line where there is
 * one, the prescription where there is not.
 */
describe('the length a session says it takes', () => {
  it('reads the authored line, and reads only it', () => {
    // The field means the whole session, blocks included — a limit day is
    // ninety minutes *with* the core circuit at the end, not ninety plus
    // three. `validate.ts` keeps the catalogue from saying both.
    const vol = THE_CRUISER.sessionTypes.find((t) => t.id === 'vol')!;
    expect(sessionMinutes({ type: vol, program: THE_CRUISER, week: 1 })).toMatchObject({ low: 45, high: 60 });
    // Iron Grip's finger day reads 42-51 off its dose. Authored, it reads
    // the authored number and not 42 more than it.
    const fp = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    const said = sessionMinutes({ type: { ...fp, duration: '90 min' }, program: IRON_GRIP, week: 1 });
    expect(said).toMatchObject({ low: 90, high: 90 });
    // And a line no clock can read is not a line: it falls through to the
    // prescription, which for a climbing day says nothing.
    expect(sessionMinutes({ type: { ...vol, duration: 'a while' }, program: THE_CRUISER, week: 1 })).toBeNull();
  });

  it('falls back to the prescription when nothing is authored', () => {
    const fp = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    expect(fp.duration).toBeUndefined();
    const derived = sessionMinutes({ type: fp, program: IRON_GRIP, week: 1 });
    expect(derived).toMatchObject({ low: 42, high: 51 });
    // And it still moves with the prescription: the deload week is shorter.
    const lighter = sessionMinutes({ type: fp, program: IRON_GRIP, week: 4, deload: true })!;
    expect(lighter.low).toBeLessThan(derived!.low);
  });

  it('says nothing without a program to resolve a prescription from', () => {
    const fp = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    expect(sessionMinutes({ type: fp })).toBeNull();
  });

  it('lets a genuinely short week through where a corner of a session never gets through', () => {
    // Trip Prep's taper halves the primer's sets to two — seven minutes,
    // and the point of a taper. The same floor rejects Base Camp's
    // performance day in every phase, because a corner is a corner
    // throughout.
    const primer = TRIP_PREP.sessionTypes.find((t) => t.id === 'fp')!;
    const taper = TRIP_PREP.phases.find((p) => p.id === 'taper')!;
    expect(sessionMinutes({ type: primer, program: TRIP_PREP, week: taper.weekStart })!.low).toBeLessThan(12);
    const corner = { ...BASE_CAMP.sessionTypes.find((t) => t.id === 'perf')!, duration: undefined };
    for (const phase of BASE_CAMP.phases) {
      expect(sessionMinutes({ type: corner, program: BASE_CAMP, week: phase.weekStart }), phase.id).toBeNull();
    }
  });

  it('resolves the drill, because for seven programs the drill is the session', () => {
    // Asking without a week reported Iron Grip's climbing day as unreadable.
    const perf = IRON_GRIP.sessionTypes.find((t) => t.id === 'perf')!;
    expect(sessionMinutes({ type: perf, program: IRON_GRIP })).toBeNull();
    expect(sessionMinutes({ type: perf, program: IRON_GRIP, week: 1 })).not.toBeNull();
  });
});

describe('how long a program’s sessions run', () => {
  it('answers for every working session of a shipped program', () => {
    for (const program of [IRON_GRIP, THE_CRUISER, TRIP_PREP, BASE_CAMP]) {
      const { known, silent } = programSessionLengths(program);
      expect(silent.map((t) => t.id), program.id).toEqual([]);
      expect(known.length).toBe(program.sessionTypes.filter((t) => !t.isRest).length);
    }
  });

  it('hands back what it cannot read rather than calling it a fit', () => {
    // A day at the crag is as long as the day is. Outdoor Climbing is a
    // mode with no blocks, and it is exempt from the content rule for
    // exactly this reason.
    const { known, silent } = programSessionLengths(OUTDOOR_CLIMBING);
    expect(known).toEqual([]);
    expect(silent.length).toBeGreaterThan(3);
  });

  it('reads the track the climber is on', () => {
    // Base Camp's strength lines are split across a bodyweight and a loaded
    // track, so the two answers are allowed to differ — and neither may be
    // the sum of both.
    const both = (BASE_CAMP.tracks ?? []).map(
      (track) => programSessionLengths(BASE_CAMP, track.id).known.find((k) => k.type.id === 'eng')!.estimate.low,
    );
    expect(both).toHaveLength(2);
    const untracked = programSessionLengths(BASE_CAMP).known.find((k) => k.type.id === 'eng')!.estimate.low;
    expect(Math.max(...both)).toBeLessThanOrEqual(untracked);
  });
});
