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

import type { DayOfWeek } from '@/content/types';
import { startOfWeek } from './dates';
import type { WeekPlan } from './scheduler';

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

/** Per-week changes, keyed by the week's start date. */
export type WeekOverrides = Record<string, WeekPlan>;

/** The plan in force for a given date: its week's override, or the default. */
export function effectivePlan(plan: WeekPlan, overrides: WeekOverrides | undefined, date: string): WeekPlan {
  return overrides?.[startOfWeek(date)] ?? plan;
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
