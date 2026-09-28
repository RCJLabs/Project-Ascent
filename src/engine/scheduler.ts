/**
 * Weekly scheduling engine (PLAN.md §5.3).
 *
 * Validates a week of planned sessions against a program's constraints, so
 * the app can warn *before* a climber commits to a plan that puts finger
 * sessions 24 hours apart. In the prototype these rules existed only as
 * prose, so nothing could check them (AUDIT.md §8.13).
 *
 * Pure functions over plain data — no React, no storage.
 *
 * Building a week — the layouts a program offers for the days a climber has
 * — is `weekLayouts.ts` (PLAN.md M344). Checking one is here, because the
 * week screens that run at boot check every day they draw.
 */

import type { Constraint, DayOfWeek, Intensity, SessionType, SessionTypeId } from '@/content/types';

/** A week as day → session type. Days with no entry are rest. */
export type WeekPlan = Partial<Record<DayOfWeek, SessionTypeId>>;

export type Severity = 'error' | 'warning';

export interface Violation {
  severity: Severity;
  /** The constraint that was broken, for grouping and display. */
  kind: Constraint['kind'];
  message: string;
  /** Days involved, so the calendar can highlight them. */
  days: DayOfWeek[];
}

/**
 * How hard a session type is, with an answer for the types that do not say.
 *
 * A rest day is easy by definition — that is what `isRest` means — and
 * anything else that has not been authored is ordinary training. Not the
 * hardest: an unstated intensity that defaulted to `max` would make a
 * half-written custom program unschedulable, and one that defaulted to
 * `easy` would exempt it from the rule it most needs.
 */
export function intensityOf(type: SessionType | undefined): Intensity {
  if (!type) return 'easy';
  return type.intensity ?? (type.isRest ? 'easy' : 'moderate');
}
