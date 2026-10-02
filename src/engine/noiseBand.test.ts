import { describe, expect, it } from 'vitest';
import { getMetric, METRICS } from '@/content/metrics';
import type { MetricId } from '@/content/types';
import { bandFor, held } from './blockReport';

/**
 * Small changes are held (PLAN.md M367).
 *
 * The bands are the coach's, confirmed in M367: added load within 5 lbs,
 * timed holds within 10% and at least 2 seconds, reps within one, box jump
 * and toe touch within an inch, ARC within 10%, project high point within 5
 * points, the 0–10 scores within one; min edge, laps, sends and outdoor
 * days count any change; grades and pass/fail have no band.
 */

const m = (id: MetricId) => getMetric(id)!;

describe('every metric', () => {
  it('that is a number states its band, and no other kind has one', () => {
    for (const metric of Object.values(METRICS)) {
      if (metric.kind === 'number') expect(metric.held, metric.id).toBeDefined();
      else expect(metric.held, metric.id).toBeUndefined();
    }
  });

  it('has the band the coach set', () => {
    expect(m('max_hang_20mm_7s').held).toEqual({ abs: 5 });
    expect(m('weighted_pullup_3rm').held).toEqual({ abs: 5 });
    expect(m('repeater_weight').held).toEqual({ abs: 5 });
    expect(m('dead_hang').held).toEqual({ pct: 10, atLeast: 2 });
    expect(m('max_pullups').held).toEqual({ abs: 1 });
    expect(m('box_jump_height').held).toEqual({ abs: 1 });
    expect(m('arc_duration').held).toEqual({ pct: 10, atLeast: 0 });
    expect(m('project_high_point').held).toEqual({ abs: 5 });
    expect(m('capacity_4x4_quality').held).toEqual({ abs: 1 });
    expect(m('min_edge').held).toEqual({ abs: 0 });
  });
});

describe('where a change falls against the band', () => {
  // M367 held the edge; the coach called it light progress, and its mirror a
  // light decline (PLAN.md M370). Inside is held, exactly the width is the
  // edge, past it is beyond.
  it('reads an absolute band: inside, the edge either way, and past it', () => {
    expect(bandFor(m('max_hang_20mm_7s'), 40, 0.5)).toBe('held');
    expect(bandFor(m('max_hang_20mm_7s'), 40, 2.5)).toBe('held');
    expect(bandFor(m('max_hang_20mm_7s'), 40, 5)).toBe('edge');
    expect(bandFor(m('max_hang_20mm_7s'), 40, -5)).toBe('edge');
    expect(bandFor(m('max_hang_20mm_7s'), 40, 7.5)).toBe('beyond');
    expect(bandFor(m('max_pullups'), 10, 1)).toBe('edge');
    expect(bandFor(m('max_pullups'), 10, 2)).toBe('beyond');
    expect(held(m('max_hang_20mm_7s'), 40, 2.5)).toBe(true);
    expect(held(m('max_hang_20mm_7s'), 40, 5), 'the edge was held, as in M367').toBe(false);
  });

  it('reads a share of the baseline, with its floor', () => {
    expect(bandFor(m('dead_hang'), 60, 5)).toBe('held');
    expect(bandFor(m('dead_hang'), 60, 6)).toBe('edge'); // 10%
    expect(bandFor(m('dead_hang'), 60, 7)).toBe('beyond');
    expect(bandFor(m('dead_hang'), 10, 1.5)).toBe('held'); // 10% is 1s; the floor is 2
    expect(bandFor(m('dead_hang'), 10, 2)).toBe('edge');
    expect(bandFor(m('dead_hang'), 10, 2.5)).toBe('beyond');
    expect(bandFor(m('arc_duration'), 20, 2)).toBe('edge');
  });

  it('finds the edge through decimals', () => {
    // 33 × 10% is 3.3, and 36.3 − 33 is 3.2999999999999972.
    expect(bandFor(m('dead_hang'), 33, 36.3 - 33)).toBe('edge');
  });

  it('holds no change at all, and counts any where the band is zero, or on a grade or a pass', () => {
    expect(bandFor(m('min_edge'), 10, 0)).toBe('held');
    expect(bandFor(m('min_edge'), 10, 1)).toBe('beyond');
    expect(bandFor(m('max_hang_20mm_7s'), 40, 0)).toBe('held');
    expect(bandFor(m('max_boulder_grade'), 5, 1)).toBe('beyond');
    expect(bandFor(m('max_boulder_grade'), 5, 0)).toBe('held');
    expect(bandFor(m('landing_control'), 0, 1)).toBe('beyond');
  });
});

describe('the block report', () => {
  const report = async (entries: [string, number, number][]) => {
    const { getProgram } = await import('@/content/programs');
    const { blockReport } = await import('./blockReport');
    const at = ([metricId, day, value]: [string, number, number]) =>
      ({ id: `${metricId}@${day}`, metricId, date: `2026-03-${String(day).padStart(2, '0')}`, value }) as never;
    return blockReport({ program: getProgram('iron_grip')!, startDate: '2026-03-01', today: '2026-04-30', entries: entries.map(at) })!;
  };

  it('counts held, light progress and a light decline apart from the rest, and says so', async () => {
    const { describeBlock } = await import('./blockReport');
    const r = await report([
      ['max_hang_20mm_7s', 2, 40], ['max_hang_20mm_7s', 29, 45], // +5: light progress
      ['dead_hang', 2, 60], ['dead_hang', 29, 67], // +7 against 6: improved
      ['max_pullups', 2, 10], ['max_pullups', 29, 9], // −1: a light decline
      ['max_pushups', 2, 30], ['max_pushups', 29, 30], // held
    ]);
    const hang = r.results.find((x) => x.metric.id === 'max_hang_20mm_7s')!;
    expect(hang.moved).toBe('better');
    expect(hang.light).toBe(true);
    expect(r.results.find((x) => x.metric.id === 'dead_hang')!.light).toBe(false);
    expect([r.better, r.lightBetter, r.flat, r.worse, r.lightWorse]).toEqual([1, 1, 1, 0, 1]);
    expect(describeBlock(r)).toMatch(
      /^One of the 4 retested numbers improved, one made light progress, one held, one had a light decline\. Up: Dead Hang and Max Hang 20mm 7s \(light\)\. Down: Max Pull-Ups \(light\)\./,
    );
  });
});
