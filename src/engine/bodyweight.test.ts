import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import type { MetricEntry } from '@/db/metrics';
import { buildBlockFile } from './blockFile';
import { blockReport, describeBlock, type AssessmentResult } from './blockReport';

/**
 * Bodyweight at test weeks (PLAN.md M371).
 *
 * The max hang and the weighted pull-up record the plate. With the climber's
 * weight beside both readings, the review judges the whole load against
 * bodyweight, in pounds at the first reading's weight, and the coach's file
 * still carries only the plate.
 */

const IG = getProgram('iron_grip')!;
const at = (metricId: string, day: number, value: number, bodyweight?: number) =>
  ({
    id: `${metricId}@${day}`,
    metricId,
    date: `2026-03-${String(day).padStart(2, '0')}`,
    value,
    ...(bodyweight !== undefined ? { bodyweight } : {}),
  }) as unknown as MetricEntry;

function hang(entries: MetricEntry[], bodyweight = true): AssessmentResult {
  const report = blockReport({ program: IG, startDate: '2026-03-01', today: '2026-06-30', entries, bodyweight })!;
  return report.results.find((r) => r.metric.id === 'max_hang_20mm_7s')!;
}

describe('an added-load test with a weight at both readings', () => {
  it('holds ten pounds more on the plate carried by thirty-five more of climber', () => {
    // 180 of 150 is 1.2; 225 of 185 is 1.216. At 150 lbs that is 2.4 lbs
    // more, inside the max hang's five.
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 40, 185)]);
    expect(r.moved).toBe('flat');
    expect(r.light).toBe(false);
    expect(r.percent).toBeCloseTo((225 / 185 / 1.2 - 1) * 100, 6);
    expect(r.relative!.from).toBeCloseTo(20, 6);
    expect(r.relative!.to).toBeCloseTo((40 / 185) * 100, 6);
  });

  it('counts the same plate at thirty pounds lighter as progress', () => {
    // 150 of 120 is 1.25: 0.05 more than 1.2, which is 7.5 lbs at 150.
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 30, 120)]);
    expect(r.moved).toBe('better');
    expect(r.light).toBe(false);
    expect(r.percent).toBeCloseTo((1.25 / 1.2 - 1) * 100, 6);
  });

  it('calls exactly the band, in pounds at the first weight, a light decline', () => {
    // 210 of 180 is 1.1667: 0.0333 under 1.2, which is 5 lbs at 150.
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 30, 180)]);
    expect(r.moved).toBe('worse');
    expect(r.light).toBe(true);
  });

  it('calls past the band a decline', () => {
    // 205 of 180 is 1.139: 9.2 lbs under at 150. The plate alone fell five.
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 25, 180)]);
    expect(r.moved).toBe('worse');
    expect(r.light).toBe(false);
  });

  it('reads a hang with weight taken off as part of the load', () => {
    // -20 added at 150 is 130 held, 0.867; -10 at 150 is 0.933.
    const r = hang([at('max_hang_20mm_7s', 2, -20, 150), at('max_hang_20mm_7s', 29, -10, 150)]);
    expect(r.moved).toBe('better');
    expect(r.percent).toBeCloseTo(((140 / 150) / (130 / 150) - 1) * 100, 6);
    expect(r.relative!.from).toBeCloseTo((-20 / 150) * 100, 6);
  });
});

describe('without a weight at both readings', () => {
  it('judges the plate when only one reading has a weight, and gives no percentage', () => {
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 40)]);
    expect(r.moved).toBe('better');
    expect(r.percent).toBeNull();
    expect(r.relative).toBeUndefined();
  });

  it('judges the plate when the later reading alone has one', () => {
    const r = hang([at('max_hang_20mm_7s', 2, 30), at('max_hang_20mm_7s', 29, 30, 120)]);
    expect(r.moved).toBe('flat');
    expect(r.relative).toBeUndefined();
  });

  it('ignores a weight of nothing', () => {
    const r = hang([at('max_hang_20mm_7s', 2, 30, 0), at('max_hang_20mm_7s', 29, 30, 120)]);
    expect(r.moved).toBe('flat');
    expect(r.relative).toBeUndefined();
  });

  it('ignores a later weight of nothing', () => {
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 30, 0)]);
    expect(r.moved).toBe('flat');
    expect(r.relative).toBeUndefined();
  });

  it('ignores stored weights when the climber has switched it off', () => {
    const r = hang([at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 30, 120)], false);
    expect(r.moved).toBe('flat');
    expect(r.percent).toBeNull();
    expect(r.relative).toBeUndefined();
  });

  /**
   * The plate's percentage was M234's defect and the block report still gave
   * it: thirty to forty is a third more plate and nothing like a third more
   * load. Found while building this.
   */
  it('gives no percentage of the plate', () => {
    const r = hang([at('max_hang_20mm_7s', 2, 30), at('max_hang_20mm_7s', 29, 40)], false);
    expect(r.percent).toBeNull();
  });
});

describe('a test that is not added load', () => {
  it('pays a stored weight no attention', () => {
    const report = blockReport({
      program: IG, startDate: '2026-03-01', today: '2026-06-30', bodyweight: true,
      entries: [at('dead_hang', 2, 60, 150), at('dead_hang', 29, 70, 120)],
    })!;
    const r = report.results.find((x) => x.metric.id === 'dead_hang')!;
    expect(r.moved).toBe('better');
    expect(r.percent).toBeCloseTo((10 / 60) * 100, 6);
    expect(r.relative).toBeUndefined();
  });
});

describe('the coach’s file', () => {
  const report = blockReport({
    program: IG, startDate: '2026-03-01', today: '2026-06-30', bodyweight: true,
    entries: [
      at('max_hang_20mm_7s', 2, 30, 150), at('max_hang_20mm_7s', 29, 30, 120),
      at('dead_hang', 2, 60, 151), at('dead_hang', 29, 70, 121),
    ],
  })!;
  const file = buildBlockFile({ report, outcome: 'completed', weeksRun: 12, sessions: null, planned: null, summary: describeBlock(report) });
  const text = JSON.stringify(file);

  it('carries the plate and the judgement, not the weight or the ratio', () => {
    const hangRow = file.block.results.find((r) => r.metricId === 'max_hang_20mm_7s')!;
    expect(hangRow).toMatchObject({ baseline: 30, latest: 30, moved: 'better', percent: null });
    expect(text).not.toMatch(/relative|bodyweight/);
    // Neither weight, nor either ratio, anywhere in it.
    for (const n of ['150', '120', '151', '121', '"20"', '25']) expect(text).not.toContain(n);
  });

  it('keeps the percentage of a test that is not added load', () => {
    const deadHang = file.block.results.find((r) => r.metricId === 'dead_hang')!;
    expect(deadHang.percent).toBeCloseTo((10 / 60) * 100, 6);
  });
});
