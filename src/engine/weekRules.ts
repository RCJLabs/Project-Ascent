/**
 * A week checked against its program's rules (PLAN.md M345).
 *
 * Out of `scheduler.ts`, whose session intensity the first load reads for
 * today's card. The rules are checked only where a week is laid out or
 * moved — the start page, the week page and the layout search — all lazy.
 */

import type { DayOfWeek, Program, SessionTypeId } from '@/content/types';
import { atLeastAsHard } from '@/content/intensity';
import { intensityOf, type Violation, type WeekPlan } from './scheduler';
import { ALL_DAYS, DAY_SHORT } from './days';

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
  const typeOf = (id: SessionTypeId | undefined) =>
    id === undefined ? undefined : program.sessionTypes.find((t) => t.id === id);
  const nameOf = (id: SessionTypeId) => typeOf(id)?.name ?? id;

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

      case 'no-back-to-back': {
        // Every adjacent pair around the repeating week, Saturday into
        // Sunday included: a week that ends hard and begins hard is two
        // hard days running for anyone whose weeks follow each other.
        // Consecutive only — a clear day between them is the rest the rule
        // is asking for, and `min-gap-hours` is the constraint for programs
        // that want more than one.
        for (const day of ALL_DAYS) {
          const next = ((day + 1) % 7) as DayOfWeek;
          const here = intensityOf(typeOf(plan[day]));
          const there = intensityOf(typeOf(plan[next]));
          if (atLeastAsHard(here, c.intensity) && atLeastAsHard(there, c.intensity)) {
            violations.push({
              severity: 'error',
              kind: c.kind,
              message: `${nameOf(plan[day]!)} on ${DAY_SHORT[day]} runs straight into ${nameOf(plan[next]!)} on ${DAY_SHORT[next]}. ${c.note}`,
              days: [day, next],
            });
          }
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
