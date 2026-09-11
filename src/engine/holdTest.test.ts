import { describe, expect, it } from 'vitest';
import { METRICS } from '@/content/metrics';
import { CATALOGUE } from '@/content/programs/catalogue';
import type { Metric } from '@/content/types';
import { BENCHMARKS } from './onboarding';
import { formatStopwatch, holdTest, holdValue, marksBy } from './holdTest';

/**
 * The benchmarks that are a hold rather than a number (PLAN.md M99b).
 *
 * Which metrics these are is derived from what they already declare, so
 * there is no second table to keep in step with the registry.
 */

const metric = (id: string): Metric => METRICS[id]!;

describe('which benchmarks are a stopwatch', () => {
  it('finds a hold measured in seconds', () => {
    expect(holdTest(metric('front_lever_hold'))).toEqual({ unit: 'sec', markEvery: 10 });
    expect(holdTest(metric('dead_hang'))).toEqual({ unit: 'sec', markEvery: 10 });
    expect(holdTest(metric('core_plank'))).toEqual({ unit: 'sec', markEvery: 10 });
  });

  // A beep every ten seconds across a twenty-five minute ARC round is a
  // hundred and fifty beeps.
  it('marks an ARC round every five minutes instead', () => {
    expect(holdTest(metric('arc_duration'))).toEqual({ unit: 'min', markEvery: 300 });
  });

  it('refuses a metric measured in anything else', () => {
    expect(holdTest(metric('max_pullups'))).toBeNull();
    expect(holdTest(metric('max_hang_20mm_7s'))).toBeNull();
    expect(holdTest(metric('min_edge'))).toBeNull();
  });

  // `core_lever` is refused twice over, and a mutation showed which reason
  // does the work: its unit is 'level/sec', so the unit check alone already
  // stops it, and the `kind` check never fires on the registry as it stands.
  it('refuses a metric whose unit is not a bare duration', () => {
    expect(metric('core_lever').unit).toBe('level/sec');
    expect(holdTest(metric('core_lever'))).toBeNull();
    expect(holdTest(metric('wall_angel'))).toBeNull();
    expect(holdTest(metric('max_boulder_grade'))).toBeNull();
  });

  /**
   * The rule, rather than the mechanism.
   *
   * A stopwatch produces a number, so a metric that does not store one
   * cannot use it however its unit reads. Nothing in the registry is this
   * shape today, which is exactly why it takes a hand-built metric to hold
   * the rule — the alternative was a guard that no mutation could kill.
   */
  it('refuses a metric measured in seconds that does not store a number', () => {
    const passfail: Metric = {
      id: 'core_plank',
      label: 'Held for thirty',
      unit: 'sec',
      kind: 'passfail',
      higherIsBetter: true,
    };
    expect(holdTest(passfail)).toBeNull();
    expect(holdTest({ ...passfail, kind: 'text' })).toBeNull();
    expect(holdTest({ ...passfail, kind: 'number' })).not.toBeNull();
  });

  /**
   * The seven, measured rather than remembered — and kept as a test so a
   * metric that becomes a hold gets a stopwatch without anyone noticing it
   * needs one, and one that stops being a hold loses it.
   */
  it('covers exactly seven of the thirty-seven', () => {
    const holds = Object.values(METRICS).filter((m) => holdTest(m) !== null);
    expect(holds.map((m) => m.id).sort()).toEqual([
      'arc_duration',
      'core_plank',
      'dead_hang',
      'density_hang_bw_20mm',
      'front_lever_hold',
      'hollow_body',
      'lock_off_90',
    ]);
  });

  it('is only offered on metrics a program actually assesses', () => {
    const assessed = new Set(CATALOGUE.flatMap((p) => p.assessments));
    const holds = Object.values(METRICS).filter((m) => holdTest(m) !== null);
    expect(holds.filter((m) => !assessed.has(m.id))).toEqual([]);
  });
});

describe('turning a clock into a result', () => {
  const SEC = { unit: 'sec', markEvery: 10 } as const;
  const MIN = { unit: 'min', markEvery: 300 } as const;

  // A hold you were partway through is a hold you did not complete, which
  // is the direction a coach counts in.
  it('rounds seconds down', () => {
    expect(holdValue(12_900, SEC)).toBe(12);
    expect(holdValue(12_000, SEC)).toBe(12);
    expect(holdValue(999, SEC)).toBe(0);
  });

  // An ARC round is ten to thirty minutes and "22.5" is a precision the
  // test does not have.
  it('rounds minutes to the nearest whole one', () => {
    expect(holdValue(22 * 60_000 + 30_000, MIN)).toBe(23);
    expect(holdValue(22 * 60_000 + 20_000, MIN)).toBe(22);
  });

  it('never returns a negative from a clock that went backwards', () => {
    expect(holdValue(-5000, SEC)).toBe(0);
    expect(holdValue(-5000, MIN)).toBe(0);
  });
});

describe('the marks you hear while you are hanging', () => {
  const SEC = { unit: 'sec', markEvery: 10 } as const;

  it('counts one per interval, and none before the first', () => {
    expect(marksBy(0, SEC)).toBe(0);
    expect(marksBy(9_900, SEC)).toBe(0);
    expect(marksBy(10_000, SEC)).toBe(1);
    expect(marksBy(29_500, SEC)).toBe(2);
  });

  // Derived from elapsed rather than scheduled, so a tab that was
  // backgrounded resumes at the right count instead of replaying a backlog.
  it('reports the count reached, not the count fired', () => {
    expect(marksBy(95_000, SEC)).toBe(9);
  });

  it('follows the metric\'s own interval', () => {
    expect(marksBy(4 * 60_000, { unit: 'min', markEvery: 300 })).toBe(0);
    expect(marksBy(6 * 60_000, { unit: 'min', markEvery: 300 })).toBe(1);
  });
});

describe('the face of the clock', () => {
  // Always minutes and seconds, whatever unit the result is stored in: a
  // stopwatch reading "1350" while you hang is no use to anyone.
  it('counts in minutes and seconds', () => {
    expect(formatStopwatch(0)).toBe('0:00');
    expect(formatStopwatch(7_400)).toBe('0:07');
    expect(formatStopwatch(80_000)).toBe('1:20');
    expect(formatStopwatch(1_325_000)).toBe('22:05');
  });

  it('does not go backwards', () => {
    expect(formatStopwatch(-1000)).toBe('0:00');
  });
});

/**
 * The prose that was written twice (PLAN.md M99b).
 *
 * `BenchmarkPrompt.how` was a second copy of `Metric.description`, shown
 * only during onboarding, and the two had already drifted — one wrote
 * "20 mm", the other "20mm". The test is described once now, and the prompt
 * carries only what is true of the box you type into.
 */
describe('the benchmark battery and the registry', () => {
  it('describes every prompt from the registry', () => {
    const missing = BENCHMARKS.filter((b) => !METRICS[b.metricId]?.description);
    expect(missing.map((b) => b.metricId)).toEqual([]);
  });

  it('says nothing in the prompt that the registry already says', () => {
    for (const prompt of BENCHMARKS) {
      if (prompt.entry === undefined) continue;
      const described = METRICS[prompt.metricId]!.description!;
      // Not a substring check: the point is that the entry note is about
      // typing, so it should not be re-describing the test.
      expect(prompt.entry, prompt.metricId).not.toBe(described);
      expect(described.includes(prompt.entry), prompt.metricId).toBe(false);
    }
  });

  it('keeps a hint for every prompt, so the unit is never a guess', () => {
    expect(BENCHMARKS.filter((b) => b.hint.trim() === '')).toEqual([]);
  });
});
