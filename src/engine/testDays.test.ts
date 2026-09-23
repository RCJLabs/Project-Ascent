import { describe, expect, it } from 'vitest';
import { BASE_CAMP, CATALOGUE, GRAVITY_DEFIED, IRON_GRIP, LOCKDOWN, THE_SIEGE, TWO_DAY_WEEK } from '@/content/programs/catalogue';
import { METRICS } from '@/content/metrics';
import type { Program } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import { testWeeks } from './assessments';
import { addDays } from './dates';
import { layoutsFor, planFromLayout, type WeekPlan } from './scheduler';
import { onTheWall, stillToTake, takenIn, testWeek, testsOn, type TestWeek } from './testDays';
import { directFingerWork, typeWords } from './fingerGap';

/**
 * Which test on which day (PLAN.md M325).
 *
 * The battery was a week-level fact: every day of a test week read "Test
 * week" and the list was everything at once. These hold the spread — each
 * test once, on a session that already does that kind of work, and not two
 * of a kind on one day while another day of that kind has none.
 */

/** A Sunday, so week `n` of a block started here is `START + 7(n-1)`. */
const START = '2026-01-04';
const weekOf = (week: number) => addDays(START, (week - 1) * 7);
/** Iron Grip the way the sample climber and its recommended layout run it. */
const IRON: WeekPlan = { 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' };

const newMetric = (metricId: string, date: string): MetricEntry => ({ metricId, date, value: 1 });
const ids = (week: TestWeek | null, day: number) => testsOn(week, addDays(weekOf(1), day)).map((m) => m.id);
const typeOf = (program: Program, id: string) => program.sessionTypes.find((t) => t.id === id)!;

/** Every program with test weeks, on the layout the app recommends for it. */
const RUNNING = CATALOGUE.filter((p) => testWeeks(p).length > 0).map((p) => ({
  program: p,
  plan: planFromLayout(layoutsFor(p)[0]!),
}));

describe('Iron Grip, as written', () => {
  const week = testWeek(IRON_GRIP, START, IRON, weekOf(1));

  it('puts the finger tests on the finger days, one heavy one each', () => {
    expect(ids(week, 1)).toEqual(['max_hang_20mm_7s', 'weighted_pullup_3rm', 'core_lever', 'dead_hang']);
    expect(ids(week, 4)).toEqual(['repeater_weight', 'lock_off_90', 'max_pullups', 'max_pushups']);
  });

  it('puts the grade on a climbing day, and leaves the other one alone', () => {
    expect(ids(week, 3)).toEqual(['max_boulder_grade']);
    expect(ids(week, 6)).toEqual([]);
  });

  it('says why the week tests, and which week it is', () => {
    expect(week?.why).toBe('baseline');
    expect(week?.start).toBe(weekOf(1));
    expect(week?.end).toBe(addDays(weekOf(1), 6));
    expect(testWeek(IRON_GRIP, START, IRON, weekOf(5))?.why).toBe('phase');
    expect(testWeek(IRON_GRIP, START, IRON, weekOf(12))?.why).toBe('final');
  });

  it('follows a session the climber moved', () => {
    const moved = testWeek(IRON_GRIP, START, IRON, weekOf(1), { [weekOf(1)]: { 2: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' } });
    expect(ids(moved, 1)).toEqual([]);
    expect(ids(moved, 2)).toEqual(['max_hang_20mm_7s', 'weighted_pullup_3rm', 'core_lever', 'dead_hang']);
  });
});

describe('which weeks have a plan at all', () => {
  it('is none in an ordinary week', () => {
    expect(testWeek(IRON_GRIP, START, IRON, weekOf(2))).toBeNull();
  });

  it('is none before the block or after it', () => {
    expect(testWeek(IRON_GRIP, START, IRON, addDays(START, -3))).toBeNull();
    expect(testWeek(IRON_GRIP, START, IRON, weekOf(13))).toBeNull();
  });

  it('is none in a logging mode, which has no test weeks', () => {
    for (const mode of CATALOGUE.filter((p) => p.kind === 'mode')) {
      expect(testWeek(mode, START, planFromLayout(layoutsFor(mode)[0]!), weekOf(1))).toBeNull();
    }
  });

  it('is a week with nowhere to put anything when nothing trains', () => {
    expect(testWeek(IRON_GRIP, START, {}, weekOf(1))?.days).toEqual([]);
  });
});

describe('every program, on the layout it recommends', () => {
  it('places every test in the battery once', () => {
    for (const { program, plan } of RUNNING) {
      const week = testWeek(program, START, plan, weekOf(1))!;
      const placed = week.days.flatMap((d) => d.metrics.map((m) => m.id));
      expect(new Set(placed).size, program.id).toBe(placed.length);
      expect([...placed].sort(), program.id).toEqual(
        program.assessments.filter((id) => METRICS[id]!.place !== 'tally').sort(),
      );
    }
  });

  it('keeps each day in the order the program lists its battery', () => {
    for (const { program, plan } of RUNNING) {
      for (const day of testWeek(program, START, plan, weekOf(1))!.days) {
        const order = day.metrics.map((m) => program.assessments.indexOf(m.id));
        expect(order, `${program.id} ${day.date}`).toEqual([...order].sort((a, b) => a - b));
      }
    }
  });

  it('puts a test on the kind of day it belongs on, whenever the week has one', () => {
    for (const { program, plan } of RUNNING) {
      const week = testWeek(program, START, plan, weekOf(1))!;
      const types = Object.values(plan).map((id) => typeOf(program, id!)).filter((t) => t.isRest !== true);
      const board = types.some((t) => directFingerWork(typeWords(t)));
      const wall = types.some((t) => onTheWall(t));
      const gym = types.some((t) => (t.blocks ?? []).length > 0 && !onTheWall(t));
      for (const day of week.days) {
        for (const m of day.metrics) {
          const where = `${program.id} ${m.id} on ${day.sessionType.id}`;
          if (m.place === 'board' && board) expect(directFingerWork(typeWords(day.sessionType)), where).toBe(true);
          if (m.place === 'wall' && wall) expect(onTheWall(day.sessionType), where).toBe(true);
          if (m.place === 'gym' && gym) expect(onTheWall(day.sessionType), where).toBe(false);
        }
      }
    }
  });

  it('never piles two of a kind on one day while a day of the same kind has none', () => {
    for (const { program, plan } of RUNNING) {
      const week = testWeek(program, START, plan, weekOf(1))!;
      const training = Object.entries(plan)
        .map(([dow, id]) => ({ date: addDays(weekOf(1), Number(dow)), type: typeOf(program, id!) }))
        .filter((d) => d.type.isRest !== true);
      for (const place of ['board', 'gym', 'wall'] as const) {
        const count = (date: string) => testsOn(week, date).filter((m) => m.place === place).length;
        const hosts = training.filter((d) => count(d.date) > 0);
        if (hosts.length === 0) continue;
        // The days the planner treated as the same kind as the ones it used.
        const peers = training.filter((d) =>
          hosts.some((h) => h.type.id === d.type.id || sameKind(h.type, d.type)),
        );
        const most = Math.max(...peers.map((d) => count(d.date)));
        const least = Math.min(...peers.map((d) => count(d.date)));
        expect(most - least, `${program.id} ${place}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

/** Same answers to the three questions the planner asks of a day. */
function sameKind(a: Program['sessionTypes'][number], b: Program['sessionTypes'][number]): boolean {
  const finger = (t: typeof a) => directFingerWork(typeWords(t));
  const work = (t: typeof a) => (t.blocks ?? []).length > 0;
  return finger(a) === finger(b) && onTheWall(a) === onTheWall(b) && work(a) === work(b);
}

describe('the tie-breaks', () => {
  it('sends a grade to the harder climbing day', () => {
    // Base Camp climbs on a technique day and a performance day. A flash
    // grade found on the technique day is a technique day's number.
    const plan: WeekPlan = { 1: 'tech', 2: 'eng', 4: 'perf' };
    const week = testWeek(BASE_CAMP, START, plan, weekOf(1));
    expect(ids(week, 4)).toContain('flash_grade');
    expect(ids(week, 1)).not.toContain('flash_grade');
  });

  it('separates two tests of a kind across two days of that kind', () => {
    // The Siege's high point belongs on the project day, and its laps on the
    // power-endurance one — not both on the first climbing day it finds.
    const plan: WeekPlan = { 1: 'proj', 2: 'fp', 4: 'pe', 6: 'proj' };
    const week = testWeek(THE_SIEGE, START, plan, weekOf(1))!;
    const wall = week.days.map((d) => d.metrics.filter((m) => m.place === 'wall').length);
    expect(Math.max(...wall)).toBe(1);
  });

  it('falls back to a climbing day with work in it when no day is only gym', () => {
    // Two Day Week climbs on both of its days and does its strength work
    // after the climbing. The max hang goes with the finger protocol on the
    // first; the pull-ups fall back to a day with prescribed work, and the
    // spread sends them to the second rather than piling them on the first.
    const plan: WeekPlan = { 2: 'climb', 6: 'build' };
    const week = testWeek(TWO_DAY_WEEK, START, plan, weekOf(1));
    expect(ids(week, 2)).toContain('max_hang_20mm_7s');
    expect(ids(week, 6)).toContain('max_pullups');
  });
});

describe('the kind of day comes first', () => {
  it('sends a finger test to the finger day, even when a strength day comes before it', () => {
    // Lockdown's Session B is strength work with no board in it; Session A
    // is the board. Placed B-first, the earlier day must not win.
    const week = testWeek(LOCKDOWN, START, { 1: 'sb', 4: 'sa' }, weekOf(1));
    expect(ids(week, 4)).toContain('density_hang_bw_20mm');
    expect(ids(week, 1)).not.toContain('density_hang_bw_20mm');
  });

  it('sends a grade to a climbing day, even when the strength day is the harder one', () => {
    // Gravity Defied's engine day is `hard` and its technique day
    // `moderate`: the harder-day tie-break must not reach past the wall. The
    // grade alone, so the strength day is not already the busier one.
    expect(GRAVITY_DEFIED.sessionTypes.find((t) => t.id === 'eng')!.intensity).toBe('hard');
    const grade: Program = { ...GRAVITY_DEFIED, assessments: ['max_dynamic_grade'] };
    const week = testWeek(grade, START, { 1: 'eng', 2: 'tech' }, weekOf(1));
    expect(ids(week, 2)).toContain('max_dynamic_grade');
    expect(ids(week, 1)).not.toContain('max_dynamic_grade');
  });

  it('sends a bar test to a climbing day with strength work before one without', () => {
    // Base Camp on its two climbing days: technique has no prescribed work,
    // performance ends in a block. Push-ups go where a block already is.
    const push: Program = { ...BASE_CAMP, assessments: ['max_pushups'] };
    const week = testWeek(push, START, { 1: 'tech', 4: 'perf' }, weekOf(1));
    expect(ids(week, 4)).toEqual(['max_pushups']);
  });

  it('never puts a test on a rest day the plan names', () => {
    const week = testWeek(IRON_GRIP, START, { 1: 'rest', 3: 'perf' }, weekOf(1));
    expect(ids(week, 1)).toEqual([]);
    expect(ids(week, 3)).toHaveLength(IRON_GRIP.assessments.length);
  });

  it('keeps two tests of a kind apart, even when that leaves one day heavier', () => {
    // Both board tests have to go on the one board day. Counting tests alone
    // would then send both pull tests to the other day — a 3RM and a set to
    // failure back to back — because it has fewer. Counting the kind first
    // splits them.
    const battery: Program = {
      ...LOCKDOWN,
      assessments: ['max_hang_20mm_7s', 'min_edge', 'weighted_pullup_3rm', 'max_pullups'],
    };
    const week = testWeek(battery, START, { 1: 'sa', 4: 'sb' }, weekOf(1));
    expect(ids(week, 1)).toEqual(['max_hang_20mm_7s', 'min_edge', 'max_pullups']);
    expect(ids(week, 4)).toEqual(['weighted_pullup_3rm']);
  });
});

describe('what the week has taken', () => {
  const week = testWeek(IRON_GRIP, START, IRON, weekOf(1))!;
  const monday = addDays(weekOf(1), 1);
  const thursday = addDays(weekOf(1), 4);

  it('counts a result anywhere inside the week, and nothing outside it', () => {
    const taken = takenIn(week, [
      newMetric('max_hang_20mm_7s', monday),
      newMetric('dead_hang', addDays(weekOf(1), -1)),
      newMetric('repeater_weight', addDays(weekOf(1), 7)),
    ]);
    expect([...taken]).toEqual(['max_hang_20mm_7s']);
  });

  it('lists what an earlier day was given and did not get', () => {
    const left = stillToTake(week, [newMetric('max_hang_20mm_7s', monday), newMetric('dead_hang', monday)], thursday);
    expect(left.map((m) => m.id)).toEqual(['weighted_pullup_3rm', 'core_lever', 'max_boulder_grade']);
  });

  it('does not count the day itself, or anything after it, as earlier', () => {
    expect(stillToTake(week, [], monday)).toEqual([]);
  });
});

describe('what a climbing day is', () => {
  it('is a day that records climbing, or one on rock', () => {
    expect(onTheWall({ fields: ['hardestGradeSent'] })).toBe(true);
    expect(onTheWall({ outdoor: true })).toBe(true);
    expect(onTheWall({ fields: ['location', 'conditions'] })).toBe(false);
    expect(onTheWall({})).toBe(false);
  });

  it('agrees with every shipped session type whose name says it climbs', () => {
    for (const program of CATALOGUE) {
      for (const type of program.sessionTypes) {
        if (/^Climbing:|Bouldering|Projecting|Performance Climbing/.test(type.name)) {
          expect(onTheWall(type), `${program.id} ${type.id}`).toBe(true);
        }
      }
    }
  });
});
