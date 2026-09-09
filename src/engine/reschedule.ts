/**
 * Moving a planned session (PLAN.md §5.3).
 *
 * Two departures from the plan's wording, both deliberate.
 *
 * **Not drag-and-drop.** A month grid on a 320px phone gives roughly 40px
 * cells; dragging between them with a thumb is a coin flip, and it is
 * unreachable by keyboard entirely. Pick-then-place is two taps, works the
 * same for touch, mouse and keyboard, and leaves room to show what the move
 * would do before it happens.
 *
 * **A move defaults to one week, not forever.** A planned day comes from the
 * weekly plan — `plan[dayOfWeek(date)]` — so moving Tuesday to Wednesday in
 * a month view would move it in *every* week of the program. That is almost
 * never what "I cannot train Tuesday this week" means. So a move writes a
 * per-week override by default, and changing the plan itself is the
 * deliberate second option.
 *
 * Landing on a day that already has a session swaps the two rather than
 * overwriting one, because a gesture that silently deletes a training day is
 * a gesture nobody can trust.
 */

import type { DayOfWeek, Program } from '@/content/types';
import { startOfWeek } from './dates';
import { validateWeek, type Violation, type WeekPlan } from './scheduler';

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

/** Per-week changes, keyed by the week's start date. */
export type WeekOverrides = Record<string, WeekPlan>;

/** The plan in force for a given date: its week's override, or the default. */
export function effectivePlan(plan: WeekPlan, overrides: WeekOverrides | undefined, date: string): WeekPlan {
  return overrides?.[startOfWeek(date)] ?? plan;
}

/**
 * The plan after moving whatever sits on `from` to `to`. An occupied target
 * swaps; an empty one leaves `from` empty.
 */
export function movePlan(plan: WeekPlan, from: DayOfWeek, to: DayOfWeek): WeekPlan {
  if (from === to) return { ...plan };
  const next: WeekPlan = { ...plan };
  const moving = plan[from];
  const displaced = plan[to];

  if (moving === undefined) return next;
  next[to] = moving;
  if (displaced === undefined) delete next[from];
  else next[from] = displaced;
  return next;
}

export interface MovePreview {
  /** The week as it would be. */
  plan: WeekPlan;
  /** Everything wrong with the resulting week, including what already was. */
  violations: Violation[];
  /** Only what this move would cause. See `previewMove`. */
  introduced: Violation[];
  /** Introduced problems that make the week unsafe rather than untidy. */
  blocking: Violation[];
  /** True when the target already holds a session, so this is a swap. */
  swaps: boolean;
}

/**
 * What moving `from` to `to` would produce, and what it would break.
 *
 * Only violations the move *introduces* are reported as its fault. A plan
 * can already be in breach — three finger days in a program that allows two,
 * say — and blaming every candidate landing for a problem that was there
 * before means the grid marks all seven days unsafe and the climber learns
 * to ignore it.
 */
export function previewMove(
  program: Program,
  plan: WeekPlan,
  from: DayOfWeek,
  to: DayOfWeek,
): MovePreview {
  const next = movePlan(plan, from, to);
  const violations = validateWeek(program, next);
  const before = new Set(validateWeek(program, plan).map(signature));
  const introduced = violations.filter((v) => !before.has(signature(v)));
  return {
    plan: next,
    violations,
    introduced,
    blocking: introduced.filter((v) => v.severity === 'error'),
    swaps: plan[to] !== undefined && from !== to,
  };
}

/** Identity of a violation, so "the same problem" survives a reordering. */
function signature(v: Violation): string {
  return `${v.kind}:${v.severity}:${v.message}`;
}

/**
 * How every day of the week would fare as a target, so the grid can say
 * which landings are fine before a finger goes near them.
 */
export function targetsFor(program: Program, plan: WeekPlan, from: DayOfWeek): Record<DayOfWeek, MovePreview> {
  const out = {} as Record<DayOfWeek, MovePreview>;
  for (const d of ALL_DAYS) out[d] = previewMove(program, plan, from, d);
  return out;
}

/** Store a week's override, dropping it again when it matches the plan. */
export function withOverride(
  overrides: WeekOverrides,
  weekStart: string,
  next: WeekPlan,
  plan: WeekPlan,
): WeekOverrides {
  const copy = { ...overrides };
  // An override identical to the plan is noise: it would survive a later
  // plan change and silently pin the old shape.
  if (samePlan(next, plan)) delete copy[weekStart];
  else copy[weekStart] = next;
  return copy;
}

export function samePlan(a: WeekPlan, b: WeekPlan): boolean {
  for (const d of ALL_DAYS) if (a[d] !== b[d]) return false;
  return true;
}

/** Overrides for weeks that have already finished are dead weight. */
export function pruneOverrides(overrides: WeekOverrides, today: string): WeekOverrides {
  const current = startOfWeek(today);
  const out: WeekOverrides = {};
  for (const [week, plan] of Object.entries(overrides)) if (week >= current) out[week] = plan;
  return out;
}
