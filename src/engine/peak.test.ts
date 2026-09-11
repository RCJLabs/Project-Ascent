import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import type { Program } from '@/content/types';
import { getProgram } from '@/content/programs';
import { ACWR_BOUNDS } from './derive';
import { addDays, programWeek } from './dates';
import {
  DELOAD_EVERY,
  MAX_BUILD,
  MAX_RUNWAY_WEEKS,
  RAMP,
  describePeak,
  keepsFitness,
  peakPlan,
  staysInBand,
} from './peak';

/**
 * Planning the weeks up to a trip (PLAN.md M73).
 *
 * The two things the plan claims are that it arrives fresh and that it does
 * not arrive detrained, and both are arithmetic on its own output — so both
 * are checked directly rather than trusted.
 */

const FROM = '2026-06-01';

/** A steady climber: three sessions a week at RPE 7 for 90 minutes. */
function steady(weeks = 12, perWeek = 3): Session[] {
  const out: Session[] = [];
  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < perWeek; d += 1) {
      const date = addDays(FROM, -(weeks - w) * 7 + d * 2);
      out.push({
        id: `${date}#0`, date, planned: false, completed: true, rewarded: true,
        mode: 'indoor', rpe: 7, durationMin: 90, climbs: [],
        createdAt: date, updatedAt: date,
      } as Session);
    }
  }
  return out;
}

const at = (weeksOut: number, sessions = steady(), extra = {}) =>
  peakPlan({ sessions, target: addDays(FROM, weeksOut * 7), from: FROM, ...extra });

describe('the two things it promises', () => {
  it('arrives fresh — the last week is lighter than the baseline it built', () => {
    for (const weeks of [2, 4, 6, 8, 12]) {
      const plan = at(weeks);
      expect(plan.arriveAt!, `${weeks} weeks`).toBeLessThan(1);
      // Fresh, not collapsed: an acute week of nothing is not a taper.
      expect(plan.arriveAt!, `${weeks} weeks`).toBeGreaterThan(0.4);
    }
  });

  it('arrives no less fit than it started, given weeks to build in', () => {
    for (const weeks of [4, 6, 8, 12]) {
      expect(keepsFitness(at(weeks)), `${weeks} weeks`).toBe(true);
    }
  });

  it('admits when there is no time to build, rather than claiming both', () => {
    const plan = at(1);
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0]!.kind).toBe('taper');
    // A light week on its own can only take the baseline down with it.
    expect(keepsFitness(plan)).toBe(false);
    expect(describePeak(plan)).toMatch(/no time to build/);
  });

  it('keeps every working week inside the band the app judges by', () => {
    for (const weeks of [2, 4, 6, 8, 12]) {
      const plan = at(weeks);
      expect(staysInBand(plan), `${weeks} weeks`).toBe(true);
      for (const week of plan.weeks) {
        if (week.kind === 'build' || week.kind === 'hold') {
          expect(week.acwr, `${weeks}w / week ${week.week}`).toBeLessThanOrEqual(ACWR_BOUNDS.optimalTo);
        }
      }
    }
  });

  it('takes the easy weeks below the band, which is what an easy week is', () => {
    // The finding this milestone turns on: a taper reads as "detraining" to
    // the same bands that judge a training week, and nothing about it is.
    const plan = at(8);
    const taper = plan.weeks[plan.weeks.length - 1]!;
    expect(taper.acwr).toBeLessThan(ACWR_BOUNDS.optimalFrom);
  });
});

describe('it starts from where you are', () => {
  it('reads the weeks just gone, not the baseline alone', () => {
    // Four weeks of training and then a week off leaves the same 28-day
    // baseline as four weeks of training and a fifth — and a plan that
    // could not tell those apart would prescribe the same first week to a
    // climber mid-block and one coming back off a rest week.
    const full = steady(12);
    const rested = full.filter((s) => s.date < addDays(FROM, -6));
    expect(at(4, full).weeks[0]!.acwr).not.toBeCloseTo(at(4, rested).weeks[0]!.acwr, 2);
  });

  it('asks the same of both, though — the target is the baseline, not last week', () => {
    const full = steady(12);
    const rested = full.filter((s) => s.date < addDays(FROM, -6));
    // What changes is the ratio it produces, not the load it asks for.
    expect(at(4, rested).weeks[0]!.load).toBeCloseTo(at(4, full).weeks[0]!.load * (at(4, rested).baseline! / at(4, full).baseline!), 6);
  });
});

describe('the shape', () => {
  it('ramps at the named rate and stops at the ceiling', () => {
    const plan = at(12);
    const first = plan.weeks[0]!;
    expect(first.ofNow).toBeCloseTo(RAMP, 6);
    expect(Math.max(...plan.weeks.map((w) => w.ofNow))).toBeCloseTo(MAX_BUILD, 6);
  });

  it('never asks for more than the ceiling, however long the runway', () => {
    for (const weeks of [4, 8, 12]) {
      for (const week of at(weeks).weeks) {
        expect(week.ofNow, `${weeks}w / week ${week.week}`).toBeLessThanOrEqual(MAX_BUILD + 1e-9);
      }
    }
  });

  it('ends on a taper, always', () => {
    for (const weeks of [1, 2, 4, 8, 12]) {
      const plan = at(weeks);
      expect(plan.weeks[plan.weeks.length - 1]!.kind, `${weeks} weeks`).toBe('taper');
      expect(plan.weeks.filter((w) => w.kind === 'taper'), `${weeks} weeks`).toHaveLength(1);
    }
  });

  it('puts an easy week in when nothing else has, rather than holding for two months', () => {
    const kinds = at(12).weeks.map((w) => w.kind);
    expect(kinds.filter((k) => k === 'deload').length).toBeGreaterThan(0);
    for (const week of at(12).weeks) {
      if (week.kind === 'deload') expect(week.week % DELOAD_EVERY).toBe(0);
    }
  });

  it('never puts one in the week before the taper — that is the taper starting early', () => {
    for (const weeks of [5, 8, 9, 12]) {
      const plan = at(weeks);
      const before = plan.weeks[plan.weeks.length - 2];
      expect(before?.kind, `${weeks} weeks`).not.toBe('deload');
    }
  });
});

describe('a program already has deloads', () => {
  // Deloads on weeks 5 and 9, which are not multiples of the interval the
  // plan falls back to — so a deload landing on one of them can only have
  // come from the program.
  const program = getProgram('peak_performance')!;
  /**
   * Started so that its week 5 lands on the second week of the runway.
   *
   * Searched rather than worked out by hand: `programWeek` snaps the start
   * to the beginning of its calendar week, so the offset is not the
   * arithmetic it looks like.
   */
  const startDate = (() => {
    const ends = addDays(FROM, 14);
    for (let back = 0; back < 120; back += 1) {
      const candidate = addDays(FROM, -back);
      if (programWeek(candidate, ends, program.weeks) === 5) return candidate;
    }
    throw new Error('no start date puts program week 5 on runway week 2');
  })();

  it('takes them from the program rather than laying its own on top', () => {
    expect(program.deloadWeeks).toEqual([5, 9]);
    const plan = at(8, steady(), { program, startDate });
    expect(plan.weeks[1]!.kind).toBe('deload');
  });

  it('would have called that week a build week on its own', () => {
    expect(at(8).weeks[1]!.kind).toBe('build');
  });

  it('is unaffected by a program whose deloads are all behind us', () => {
    const withProgram = at(4, steady(), { program, startDate: addDays(FROM, -7 * 30) });
    expect(withProgram.weeks.map((w) => w.kind)).toEqual(at(4).weeks.map((w) => w.kind));
  });
});

describe('what it will not do', () => {
  it('withholds when the log cannot support a baseline', () => {
    const plan = at(4, steady(2));
    expect(plan.withheld).toBe('no-baseline');
    expect(plan.baseline).toBeNull();
    expect(plan.weeks).toEqual([]);
  });

  it('withholds on a long enough log with too few sessions in it', () => {
    // Three weeks of calendar with two sessions in it produces arithmetic,
    // not a baseline — the same condition the ratio itself applies.
    const sparse = steady(12, 3).filter((_, i) => i % 8 === 0);
    expect(at(4, sparse).withheld).toBe('no-baseline');
  });

  it('withholds for a date that has been and gone', () => {
    expect(at(-2).withheld).toBe('past');
  });

  it('hands a long runway to the finder rather than calling it a peak', () => {
    const plan = at(MAX_RUNWAY_WEEKS + 1);
    expect(plan.withheld).toBe('too-far');
    expect(describePeak(plan)).toMatch(/program/);
  });

  it('takes the longest runway it will plan', () => {
    expect(at(MAX_RUNWAY_WEEKS).withheld).toBeNull();
  });

  it('says nothing about whether the trip will go well', () => {
    for (const weeks of [1, 2, 4, 8, 12]) {
      const sentence = describePeak(at(weeks));
      expect(sentence, `${weeks} weeks`).not.toMatch(/ready|strong|send|succeed|peak form/i);
    }
  });
});

describe('the numbers a climber reads', () => {
  it('states each week as a share of the week they actually do', () => {
    const plan = at(4);
    for (const week of plan.weeks) {
      expect(week.ofNow).toBeCloseTo(week.load / plan.baseline!, 9);
    }
  });

  it('reports the ratio its own loads produce, not a target it was handed', () => {
    // Re-derive the ratio from the plan's own weekly loads and the three real
    // weeks before it, which is the whole model.
    const plan = at(6);
    const loads = plan.weeks.map((w) => w.load);
    for (let i = 3; i < loads.length; i += 1) {
      const chronic = loads.slice(i - 3, i + 1).reduce((sum, n) => sum + n, 0) / 4;
      expect(plan.weeks[i]!.acwr).toBeCloseTo(loads[i]! / chronic, 9);
    }
  });

  it('ends each week seven days after the last', () => {
    const plan = at(6);
    expect(plan.weeks[0]!.ends).toBe(addDays(FROM, 7));
    for (let i = 1; i < plan.weeks.length; i += 1) {
      expect(plan.weeks[i]!.ends).toBe(addDays(plan.weeks[i - 1]!.ends, 7));
    }
  });
});

describe('the ramp against the model', () => {
  it('is slower than the model would allow, deliberately', () => {
    // A sustained ramp of r settles at 4 / (1 + 1/r + 1/r² + 1/r³). At the
    // rate the plan uses that is comfortably inside the band, and the point
    // of the margin is that a week which goes harder than planned still is.
    const settled = (r: number) => 4 / (1 + 1 / r + 1 / r ** 2 + 1 / r ** 3);
    expect(settled(RAMP)).toBeLessThan(ACWR_BOUNDS.optimalTo);
    // And the ceiling really is higher, so the choice is a choice.
    expect(settled(1.25)).toBeGreaterThan(ACWR_BOUNDS.optimalTo);
  });
});

/** Typed so an added field to Program cannot silently break the fixtures. */
const _typecheck: Program | undefined = getProgram('gravity_defied');
void _typecheck;
