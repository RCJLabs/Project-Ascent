/**
 * Weekly scheduling engine (PLAN.md §5.3).
 *
 * Validates a week of planned sessions against a program's constraints, so
 * the app can warn *before* a climber commits to a plan that puts finger
 * sessions 24 hours apart. In the prototype these rules existed only as
 * prose, so nothing could check them (AUDIT.md §8.13).
 *
 * Pure functions over plain data — no React, no storage.
 */

import type { Constraint, DayOfWeek, Program, SessionTypeId, WeeklyLayout } from '@/content/types';

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

function daysOf(plan: WeekPlan, typeId: SessionTypeId): DayOfWeek[] {
  return ALL_DAYS.filter((d) => plan[d] === typeId);
}

/**
 * Hours between two days *within the same repeating week*. Weeks repeat, so
 * Saturday → Monday is 48 hours, not 120 backwards: the gap that matters is
 * the shorter way around the circle.
 */
export function gapHours(a: DayOfWeek, b: DayOfWeek): number {
  const forward = (b - a + 7) % 7;
  const backward = (a - b + 7) % 7;
  return Math.min(forward, backward) * 24;
}

/** Smallest gap between any two *distinct* occurrences among these days. */
function smallestGap(days: DayOfWeek[]): { hours: number; pair: DayOfWeek[] } | null {
  if (days.length < 2) return null;
  let best: { hours: number; pair: DayOfWeek[] } | null = null;
  for (let i = 0; i < days.length; i++) {
    for (let j = i + 1; j < days.length; j++) {
      const hours = gapHours(days[i]!, days[j]!);
      if (!best || hours < best.hours) best = { hours, pair: [days[i]!, days[j]!] };
    }
  }
  return best;
}

export function validateWeek(program: Program, plan: WeekPlan): Violation[] {
  const violations: Violation[] = [];
  const restIds = new Set(program.sessionTypes.filter((t) => t.isRest).map((t) => t.id));
  const trainingDays = ALL_DAYS.filter((d) => plan[d] && !restIds.has(plan[d]!));
  const nameOf = (id: SessionTypeId) => program.sessionTypes.find((t) => t.id === id)?.name ?? id;

  for (const c of program.constraints) {
    switch (c.kind) {
      case 'sessions-per-week': {
        const n = trainingDays.length;
        if (n < c.min) {
          violations.push({
            severity: 'warning',
            kind: c.kind,
            message: `${n} training ${n === 1 ? 'day' : 'days'} planned. ${c.note}`,
            days: [],
          });
        } else if (n > c.max) {
          violations.push({
            severity: 'warning',
            kind: c.kind,
            message: `${n} training days planned — more than this program asks for. ${c.note}`,
            days: [],
          });
        }
        break;
      }

      case 'min-gap-hours': {
        // `between` with one entry means "between occurrences of this type";
        // with several, it means "between any of these types".
        const days =
          c.between.length === 1
            ? daysOf(plan, c.between[0]!)
            : c.between.flatMap((id) => daysOf(plan, id));
        const worst = smallestGap(days);
        if (worst && worst.hours < c.hours) {
          violations.push({
            severity: 'error',
            kind: c.kind,
            message: `Only ${worst.hours}h between ${DAY_SHORT[worst.pair[0]!]} and ${DAY_SHORT[worst.pair[1]!]}. ${c.note}`,
            days: worst.pair,
          });
        }
        break;
      }

      case 'max-per-week': {
        const count = daysOf(plan, c.sessionTypeId).length;
        if (count > c.count) {
          violations.push({
            severity: 'error',
            kind: c.kind,
            message: `${count} ${nameOf(c.sessionTypeId)} sessions planned. ${c.note}`,
            days: daysOf(plan, c.sessionTypeId),
          });
        }
        break;
      }

      case 'order-in-week': {
        const firstDays = daysOf(plan, c.first);
        const thenDays = daysOf(plan, c.then);
        if (firstDays.length === 0 || thenDays.length === 0) break;
        if (Math.min(...firstDays) > Math.min(...thenDays)) {
          violations.push({
            severity: 'warning',
            kind: c.kind,
            message: `${nameOf(c.then)} is scheduled before ${nameOf(c.first)}. ${c.note}`,
            days: [Math.min(...thenDays) as DayOfWeek, Math.min(...firstDays) as DayOfWeek],
          });
        }
        break;
      }

      case 'not-day-before': {
        for (const day of daysOf(plan, c.sessionTypeId)) {
          const next = ((day + 1) % 7) as DayOfWeek;
          if (plan[next] === c.before) {
            violations.push({
              severity: 'error',
              kind: c.kind,
              message: `${nameOf(c.sessionTypeId)} on ${DAY_SHORT[day]} sits the day before ${nameOf(c.before)}. ${c.note}`,
              days: [day, next],
            });
          }
        }
        break;
      }
    }
  }

  return violations;
}

export function planFromLayout(layout: WeeklyLayout): WeekPlan {
  return { ...layout.slots };
}

/**
 * Build weekly layouts for a program: its hand-tuned recommendation first,
 * then generic shapes derived from its own session types so custom and
 * edited programs get scheduling for free (the prototype's best scheduling
 * idea — AUDIT.md §6).
 *
 * Generated layouts are filtered to those that pass validation, so the
 * picker never offers a plan the app would immediately warn about.
 */
export function layoutsFor(program: Program, daysPerWeek?: number): WeeklyLayout[] {
  const layouts: WeeklyLayout[] = [];
  if (program.recommendedLayout) layouts.push(program.recommendedLayout);

  const workTypes = program.sessionTypes.filter((t) => !t.isRest).map((t) => t.id);
  if (workTypes.length === 0) return layouts;

  const target =
    daysPerWeek ??
    (program.constraints.find((c) => c.kind === 'sessions-per-week') as
      | { min: number; max: number }
      | undefined
    )?.min ??
    Math.min(workTypes.length, 4);

  const shapes: { name: string; description: string; days: DayOfWeek[] }[] = [
    { name: 'Front-loaded', description: 'Hard days early in the week, weekend free.', days: [1, 2, 4, 5, 6, 0, 3] },
    { name: 'Spread out', description: 'Maximum recovery between sessions.', days: [1, 3, 5, 0, 2, 4, 6] },
    { name: 'Weekend-heavy', description: 'Built around weekend availability.', days: [6, 0, 2, 4, 1, 3, 5] },
  ];

  for (const shape of shapes) {
    const chosen = shape.days.slice(0, Math.min(target, 7)).sort((a, b) => a - b);
    const slots: WeekPlan = {};
    chosen.forEach((day, i) => {
      slots[day] = workTypes[i % workTypes.length]!;
    });
    const layout: WeeklyLayout = { name: shape.name, description: shape.description, slots };
    if (validateWeek(program, slots).every((v) => v.severity !== 'error')) {
      layouts.push(layout);
    }
  }

  return layouts;
}
