import { describe, expect, it } from 'vitest';
import { METRICS } from '@/content/metrics';
import { formatEntry, parseMetricInput } from './assessments';
import { formatHeight, fromInput, heightValue, toDisplay, unitLabel } from './units';

/**
 * Weight and length in the units the climber uses (PLAN.md M48).
 *
 * The app lets you read grades as V or Font and routes as YDS or French —
 * it is plainly built for climbers outside the US — and then prescribed max
 * hangs in pounds and box jumps in inches. Meanwhile `min_edge` was already
 * in millimetres, because a 20mm edge is a 20mm edge everywhere. The app was
 * not imperial; it was inconsistent.
 *
 * Canonical storage stays imperial so nothing has to be migrated. Which unit
 * a number is *stored* in is invisible; which one it is *shown* in is not.
 */
describe('units', () => {
  it('names the unit the way this climber reads it', () => {
    expect(unitLabel('lbs', 'imperial')).toBe('lbs');
    expect(unitLabel('lbs', 'metric')).toBe('kg');
    expect(unitLabel('BW+lbs', 'metric')).toBe('BW+kg');
    expect(unitLabel('in', 'metric')).toBe('cm');
    expect(unitLabel('in from floor', 'metric')).toBe('cm from floor');
  });

  it('leaves a unit that is already universal alone', () => {
    // Climbers say 20mm edge in every country, and seconds are seconds.
    for (const unit of ['mm', 'sec', 'reps', 'min', 'laps', 'sends', '']) {
      expect(unitLabel(unit, 'metric'), unit).toBe(unit);
    }
  });

  it('converts a stored number for display', () => {
    expect(toDisplay(60, 'lbs', 'metric')).toBeCloseTo(27.2, 1);
    expect(toDisplay(60, 'lbs', 'imperial')).toBe(60);
    expect(toDisplay(24, 'in', 'metric')).toBeCloseTo(61, 0);
  });

  it('converts a typed number back to storage', () => {
    expect(fromInput(27.2, 'lbs', 'metric')).toBeCloseTo(60, 0);
    expect(fromInput(60, 'lbs', 'imperial')).toBe(60);
  });

  it('round-trips, so editing an entry does not drift it', () => {
    // Type 27.2kg, store, show it again: still 27.2, not 27.19999.
    for (const kg of [5, 12.5, 27.2, 40]) {
      expect(toDisplay(fromInput(kg, 'lbs', 'metric'), 'lbs', 'metric')).toBeCloseTo(kg, 1);
    }
  });

  it('covers every imperial unit the metric registry actually uses', () => {
    // The floor: a new metric measured in pounds must not slip past by
    // being spelled differently.
    const imperial = [...new Set(Object.values(METRICS).map((m) => m.unit))].filter((u) =>
      /\b(lbs?|in|ft|oz)\b/.test(u),
    );
    expect(imperial.length, 'no imperial units found — this check is asleep').toBeGreaterThan(2);
    for (const unit of imperial) {
      expect(unitLabel(unit, 'metric'), `${unit} has no metric form`).not.toBe(unit);
    }
  });
});

describe('the altimeter, which is feet everywhere', () => {
  it('reads in metres when that is what the climber uses', () => {
    expect(formatHeight(10_238, 'imperial')).toBe('10,238 ft');
    expect(formatHeight(10_238, 'metric')).toBe('3,121 m');
  });

  it('rounds to whole units, because a lifetime total is not a measurement', () => {
    expect(formatHeight(2_900, 'metric')).toBe('884 m');
    expect(heightValue(2_900, 'metric')).toBe(884);
  });

  it('keeps a thousands separator either way', () => {
    expect(formatHeight(29_032, 'imperial')).toContain(',');
    expect(formatHeight(29_032, 'metric')).toContain(',');
  });
});

describe('entering a number in your own units', () => {
  it('stores what the climber meant, not what they typed', () => {
    // The dangerous direction. Type 27.2 reading kilograms, store 27.2
    // pounds, and every comparison against that climber's history is wrong
    // from then on — silently, because the number looks plausible.
    const metric = METRICS['weighted_pullup_3rm']!;
    expect(parseMetricInput(metric, '27.2', 'metric')).toEqual({ ok: true, value: 60 });
    expect(parseMetricInput(metric, '60', 'imperial')).toEqual({ ok: true, value: 60 });
  });

  it('leaves a unit that needs no conversion exactly as typed', () => {
    const edge = METRICS['min_edge']!;
    expect(parseMetricInput(edge, '14', 'metric')).toEqual({ ok: true, value: 14 });
  });

  it('shows back what was typed', () => {
    // Round trip through storage: 27.2 in, 27.2 out.
    const metric = METRICS['weighted_pullup_3rm']!;
    const parsed = parseMetricInput(metric, '27.2', 'metric');
    expect(parsed.ok && formatEntry(metric, { metricId: metric.id, date: 'x', value: parsed.value }, undefined, 'metric')).toBe(
      '27.2 BW+kg',
    );
  });
});
