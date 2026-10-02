import { describe, expect, it } from 'vitest';
import { getMetric, METRICS } from '@/content/metrics';
import type { MetricId } from '@/content/types';
import { held } from './blockReport';

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

describe('held', () => {
  it('holds a change inside an absolute band, edge included, either way', () => {
    expect(held(m('max_hang_20mm_7s'), 40, 0.5)).toBe(true);
    expect(held(m('max_hang_20mm_7s'), 40, 5)).toBe(true);
    expect(held(m('max_hang_20mm_7s'), 40, -5)).toBe(true);
    expect(held(m('max_hang_20mm_7s'), 40, 7.5)).toBe(false);
    expect(held(m('max_pullups'), 10, 1)).toBe(true);
    expect(held(m('max_pullups'), 10, 2)).toBe(false);
  });

  it('reads a share of the baseline, with its floor', () => {
    expect(held(m('dead_hang'), 60, 6)).toBe(true); // 10%
    expect(held(m('dead_hang'), 60, 7)).toBe(false);
    expect(held(m('dead_hang'), 60, -6)).toBe(true);
    expect(held(m('dead_hang'), 10, 2)).toBe(true); // 10% is 1s; the floor is 2
    expect(held(m('dead_hang'), 10, 2.5)).toBe(false);
    expect(held(m('arc_duration'), 20, 2)).toBe(true);
    expect(held(m('arc_duration'), 20, 3)).toBe(false);
  });

  it('counts any change where the band is zero, and on a grade or a pass', () => {
    expect(held(m('min_edge'), 10, 1)).toBe(false);
    expect(held(m('min_edge'), 10, 0)).toBe(true);
    expect(held(m('max_boulder_grade'), 5, 1)).toBe(false);
    expect(held(m('landing_control'), 0, 1)).toBe(false);
  });
});

describe('the block report', () => {
  it('counts a change inside the band as held, and says so', async () => {
    const { getProgram } = await import('@/content/programs');
    const { blockReport, describeBlock } = await import('./blockReport');
    const IG = getProgram('iron_grip')!;
    const start = '2026-03-01';
    const at = (day: number, metricId: string, value: number) => ({ id: `${metricId}@${day}`, metricId, date: `2026-03-${String(day).padStart(2, '0')}`, value }) as never;
    const r = blockReport({
      program: IG, startDate: start, today: '2026-04-30',
      entries: [at(2, 'max_hang_20mm_7s', 40), at(29, 'max_hang_20mm_7s', 45), at(2, 'dead_hang', 60), at(29, 'dead_hang', 67)],
    })!;
    expect(r.results.find((x) => x.metric.id === 'max_hang_20mm_7s')!.moved).toBe('flat');
    expect(r.results.find((x) => x.metric.id === 'dead_hang')!.moved).toBe('better');
    expect(describeBlock(r)).toMatch(/^One of the 2 retested numbers improved, one held\./);
  });
});
