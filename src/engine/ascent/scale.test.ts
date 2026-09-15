import { describe, expect, it } from 'vitest';
import { CLIMBS_TO_EVEREST, MILESTONES } from '@/engine/altimeter';
import { describeScale, everests, matchedClimb, nextClimb, runHeight } from './scale';

/** Metres, from the feet the ladder is written in. */
const m = (feet: number) => feet * 0.3048;

describe('a run in the climber’s own units', () => {
  it('answers in metres or in feet', () => {
    expect(runHeight(1_063, 'metric').label).toBe('1,063 m');
    expect(runHeight(1_063, 'imperial').label).toBe('3,488 ft');
  });

  it('splits the number from the unit, for the card that sets them apart', () => {
    expect(runHeight(1_063, 'imperial')).toEqual({ value: '3,488', unit: 'ft', label: '3,488 ft' });
  });

  it('round-trips a metric height rather than drifting through feet', () => {
    // The conversion goes metres → feet → back, so a metric climber must
    // read the number the simulation produced and not one off by a unit.
    for (const metres of [1, 7, 99, 950, 1_063, 12_345]) {
      expect(runHeight(metres, 'metric').label).toBe(`${metres.toLocaleString()} m`);
    }
  });
});

describe('the climb a run would have topped out', () => {
  it('says nothing below the first gym wall', () => {
    // A 9m run has not cleared one lead wall, and saying so on somebody's
    // first attempt is a joke at their expense.
    expect(matchedClimb(m(44))).toBeNull();
    expect(describeScale(m(44), 'metric')).toBeNull();
    expect(matchedClimb(m(45))?.name).toBe('First gym wall');
  });

  it('names the tallest one cleared, never the one still above', () => {
    expect(matchedClimb(m(2_899))?.name).toBe('Half Dome');
    expect(matchedClimb(m(2_900))?.name).toBe('El Capitan');
    expect(matchedClimb(m(2_901))?.name).toBe('El Capitan');
  });

  it('points at the next one up, and stops at Everest', () => {
    expect(nextClimb(m(2_000))?.name).toBe('El Capitan');
    expect(nextClimb(m(29_032))).toBeNull();
  });

  it('counts whole Everests for the climbers who get past one', () => {
    expect(everests(m(29_031))).toBe(0);
    expect(everests(m(29_032))).toBe(1);
    expect(everests(m(58_064))).toBe(2);
  });
});

describe('the scale, said out loud', () => {
  it('names what was cleared and what is next', () => {
    expect(describeScale(m(2_000), 'metric')).toBe('Past Half Dome. El Capitan is 274 m higher.');
  });

  it('measures the gap in the climber’s units too', () => {
    expect(describeScale(m(2_000), 'imperial')).toBe('Past Half Dome. El Capitan is 900 ft higher.');
  });

  it('has somewhere to stop', () => {
    expect(describeScale(m(29_032), 'metric')).toBe('Past Everest.');
    expect(describeScale(m(70_000), 'metric')).toBe('Past Everest, 2 times over.');
  });

  it('is a comparison and never a credit', () => {
    // `altimeter.ts` opens by promising no game action adds a foot, which is
    // the whole reason the altimeter means anything. This reads the ladder
    // and the copy says *past* a climb rather than claiming one.
    const said = describeScale(m(2_900), 'metric')!;
    expect(said.startsWith('Past ')).toBe(true);
    expect(said).not.toMatch(/reached|climbed|summit/i);
  });
});

describe('the ladder this borrows', () => {
  it('is the part where a rung is a mountain rather than a running total', () => {
    // Above Everest the ladder stacks, so K2 sits at 57,283 feet and naming
    // it for a run of that height would be wrong by an Everest.
    expect(CLIMBS_TO_EVEREST.at(-1)!.name).toBe('Everest');
    expect(CLIMBS_TO_EVEREST.every((c, i) => i === 0 || c.feet > CLIMBS_TO_EVEREST[i - 1]!.feet)).toBe(true);
    expect(MILESTONES.find((mile) => mile.name === 'K2')!.feet).toBeGreaterThan(29_032);
  });

  it('is the same ten the altimeter opens with, not a second copy', () => {
    expect(MILESTONES.slice(0, CLIMBS_TO_EVEREST.length)).toEqual(CLIMBS_TO_EVEREST);
  });
});
