import { describe, expect, it } from 'vitest';
import { BASE_CAMP, IRON_GRIP, LOCKDOWN, PROGRAMS, THE_LONG_GAME } from '@/content/programs';
import { gapHours, layoutsFor, planFromLayout, validateWeek, type WeekPlan } from './scheduler';

describe('gapHours', () => {
  it('measures the shorter way around a repeating week', () => {
    expect(gapHours(1, 4)).toBe(72);
    // Saturday to Monday is two days, not five.
    expect(gapHours(6, 1)).toBe(48);
    expect(gapHours(0, 6)).toBe(24);
    expect(gapHours(3, 3)).toBe(0);
  });
});

describe('validateWeek', () => {
  it('passes every program on its own recommended layout', () => {
    for (const program of PROGRAMS) {
      if (!program.recommendedLayout) continue;
      const violations = validateWeek(program, planFromLayout(program.recommendedLayout));
      expect(violations.filter((v) => v.severity === 'error'), program.id).toEqual([]);
    }
  });

  it('catches finger sessions scheduled too close together', () => {
    const plan: WeekPlan = { 1: 'fp', 2: 'fp', 4: 'perf' };
    const errors = validateWeek(IRON_GRIP, plan).filter((v) => v.severity === 'error');
    expect(errors.map((e) => e.kind)).toContain('min-gap-hours');
    expect(errors[0]!.message).toMatch(/24h between Mon and Tue/);
    expect(errors[0]!.days).toEqual([1, 2]);
  });

  it('catches finger work the day before a hard climb', () => {
    const plan: WeekPlan = { 1: 'fp', 2: 'perf', 5: 'fp' };
    const errors = validateWeek(IRON_GRIP, plan).filter((v) => v.kind === 'not-day-before');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.days).toEqual([1, 2]);
    expect(errors[0]!.message).toMatch(/day before/);
  });

  it('does not fire the adjacency rule when the order is reversed', () => {
    // Hard climb first, fingers the day after, is fine.
    const plan: WeekPlan = { 1: 'perf', 2: 'fp', 5: 'fp' };
    expect(validateWeek(IRON_GRIP, plan).filter((v) => v.kind === 'not-day-before')).toEqual([]);
  });

  it('warns when the week is ordered against the program', () => {
    const plan: WeekPlan = { 1: 'perf', 3: 'tech', 5: 'eng' };
    const warnings = validateWeek(BASE_CAMP, plan).filter((v) => v.kind === 'order-in-week');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe('warning');
    expect(warnings[0]!.message).toMatch(/before/);
  });

  it('enforces a per-week cap on the heavy session', () => {
    const plan: WeekPlan = { 1: 'sa', 3: 'sa', 5: 'sa' };
    const errors = validateWeek(LOCKDOWN, plan).filter((v) => v.kind === 'max-per-week');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toMatch(/3 Session A/);
  });

  it('warns on too few or too many training days', () => {
    const thin = validateWeek(THE_LONG_GAME, { 1: 'end' });
    expect(thin.some((v) => v.kind === 'sessions-per-week')).toBe(true);
    const fat: WeekPlan = { 0: 'eng', 1: 'end', 2: 'eng', 3: 'end', 4: 'eng', 5: 'end' };
    expect(validateWeek(THE_LONG_GAME, fat).some((v) => v.kind === 'sessions-per-week')).toBe(true);
  });

  it('ignores rest days when counting training load', () => {
    const plan: WeekPlan = { 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf', 0: 'rest', 2: 'rest' };
    expect(validateWeek(IRON_GRIP, plan).filter((v) => v.kind === 'sessions-per-week')).toEqual([]);
  });
});

describe('layoutsFor', () => {
  it('offers the recommended layout first', () => {
    expect(layoutsFor(IRON_GRIP)[0]!.name).toBe('Recommended');
  });

  it('only offers generated layouts that pass validation', () => {
    for (const program of PROGRAMS) {
      for (const layout of layoutsFor(program)) {
        const errors = validateWeek(program, planFromLayout(layout)).filter((v) => v.severity === 'error');
        expect(errors, `${program.id}/${layout.name}`).toEqual([]);
      }
    }
  });

  it('honours a requested number of days', () => {
    const generated = layoutsFor(BASE_CAMP, 3).filter((l) => l.name !== 'Recommended');
    expect(generated.length).toBeGreaterThan(0);
    for (const layout of generated) {
      expect(Object.keys(layout.slots)).toHaveLength(3);
    }
  });
});
