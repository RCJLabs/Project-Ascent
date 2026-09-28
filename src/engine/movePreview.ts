/**
 * What moving a planned session would do, before it is done (PLAN.md M345).
 *
 * Out of `reschedule.ts`, which the first load needs for the moves
 * themselves: today's plan reads the week's overrides at boot. The preview
 * validates the whole week twice per landing, and only the week page asks.
 */

import type { DayOfWeek, Program } from '@/content/types';
import type { Violation, WeekPlan } from './scheduler';
import { validateWeek } from './weekRules';
import { ALL_DAYS } from './days';

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
