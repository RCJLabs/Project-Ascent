import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { startOfWeek } from './dates';
import {
  effectivePlan,
  movePlan,
  previewMove,
  pruneOverrides,
  samePlan,
  targetsFor,
  withOverride,
  type WeekOverrides,
} from './reschedule';
import type { WeekPlan } from './scheduler';

const program = getProgram('iron_grip')!;
/** A legal Iron Grip week: two finger days, spaced, plus climbing. */
const PLAN: WeekPlan = { 1: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' };

describe('moving a day', () => {
  it('moves a session to an empty day', () => {
    expect(movePlan(PLAN, 1, 2)).toEqual({ 2: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' });
  });

  // A gesture that silently deletes a training day is one nobody can trust.
  it('swaps rather than overwriting when the target is taken', () => {
    const mixed: WeekPlan = { 1: 'fp', 2: 'endurance' };
    expect(movePlan(mixed, 1, 2)).toEqual({ 1: 'endurance', 2: 'fp' });
  });

  it('does nothing when the source is empty', () => {
    expect(movePlan(PLAN, 0, 2)).toEqual(PLAN);
  });

  it('swaps two occupied days both ways', () => {
    expect(movePlan(PLAN, 1, 3)).toEqual({ 1: 'perf', 3: 'fp', 4: 'fp', 6: 'perf' });
  });

  it('is a no-op onto itself', () => {
    expect(movePlan(PLAN, 1, 1)).toEqual(PLAN);
  });

  it('never mutates the plan it was given', () => {
    const before = { ...PLAN };
    movePlan(PLAN, 1, 2);
    expect(PLAN).toEqual(before);
  });
});

describe('what a move would break', () => {
  it('reports a clean move as clean', () => {
    const preview = previewMove(program, PLAN, 6, 0);
    expect(preview.blocking).toEqual([]);
    expect(preview.swaps).toBe(false);
  });

  // The example PLAN.md gives: moving this here puts two finger sessions
  // 24 hours apart.
  it('catches finger sessions landing back to back', () => {
    const preview = previewMove(program, PLAN, 1, 3);
    expect(preview.blocking.length).toBeGreaterThan(0);
    expect(preview.blocking[0]!.kind).toBe('min-gap-hours');
    expect(preview.blocking[0]!.message).toMatch(/\d+h between/);
  });

  // A plan can already be in breach. Blaming every landing for a problem
  // that was there before marks all seven days unsafe, and the climber
  // learns to ignore the warning.
  it('does not blame a move for breakage that was already there', () => {
    const overloaded: WeekPlan = { 1: 'fp', 3: 'fp', 5: 'fp' };
    const before = previewMove(program, overloaded, 5, 5).violations;
    expect(before.some((v) => v.kind === 'max-per-week')).toBe(true);

    const preview = previewMove(program, overloaded, 5, 6);
    expect(preview.violations.some((v) => v.kind === 'max-per-week')).toBe(true);
    expect(preview.introduced.some((v) => v.kind === 'max-per-week')).toBe(false);
    expect(preview.blocking).toEqual([]);
  });

  it('flags a swap as a swap', () => {
    expect(previewMove(program, PLAN, 1, 3).swaps).toBe(true);
    expect(previewMove(program, PLAN, 1, 2).swaps).toBe(false);
  });

  it('scores every day so the grid can show landings before a tap', () => {
    const targets = targetsFor(program, PLAN, 1);
    expect(Object.keys(targets)).toHaveLength(7);
    // Wednesday puts the two finger days 24h apart; Sunday is clear.
    expect(targets[3]!.blocking.length).toBeGreaterThan(0);
    expect(targets[0]!.blocking).toEqual([]);
  });
});

describe('per-week overrides', () => {
  const WEEK = startOfWeek('2026-03-04');
  const moved: WeekPlan = { 2: 'fp', 3: 'perf', 4: 'fp', 6: 'perf' };

  it('uses the plan when the week has no override', () => {
    expect(effectivePlan(PLAN, {}, '2026-03-04')).toEqual(PLAN);
    expect(effectivePlan(PLAN, undefined, '2026-03-04')).toEqual(PLAN);
  });

  it('uses the override for every day of that week', () => {
    const overrides: WeekOverrides = { [WEEK]: moved };
    expect(effectivePlan(PLAN, overrides, '2026-03-04')).toEqual(moved);
    expect(effectivePlan(PLAN, overrides, '2026-03-07')).toEqual(moved);
  });

  it('leaves other weeks alone', () => {
    const overrides: WeekOverrides = { [WEEK]: moved };
    expect(effectivePlan(PLAN, overrides, '2026-03-11')).toEqual(PLAN);
  });

  // An override identical to the plan would survive a later plan change and
  // silently pin the old shape.
  it('drops an override that matches the plan again', () => {
    const overrides = withOverride({ [WEEK]: moved }, WEEK, PLAN, PLAN);
    expect(overrides).toEqual({});
  });

  it('keeps one that differs', () => {
    expect(withOverride({}, WEEK, moved, PLAN)).toEqual({ [WEEK]: moved });
  });

  it('compares plans by day, not by key order', () => {
    expect(samePlan({ 1: 'fp', 3: 'fp' }, { 3: 'fp', 1: 'fp' })).toBe(true);
    expect(samePlan({ 1: 'fp' }, { 1: 'endurance' })).toBe(false);
    expect(samePlan({ 1: 'fp' }, {})).toBe(false);
  });

  it('prunes weeks that have already finished', () => {
    const overrides: WeekOverrides = {
      '2026-02-01': moved, '2026-03-01': moved, '2026-03-08': moved,
    };
    const kept = pruneOverrides(overrides, '2026-03-04');
    expect(Object.keys(kept).sort()).toEqual(['2026-03-01', '2026-03-08']);
  });

  it('keeps the current week, which is not finished', () => {
    const week = startOfWeek('2026-03-04');
    expect(Object.keys(pruneOverrides({ [week]: moved }, '2026-03-06'))).toEqual([week]);
  });
});
