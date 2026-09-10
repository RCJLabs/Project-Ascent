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

export interface LayoutRequest {
  /** Training days a week. Defaults to what the program asks for. */
  daysPerWeek?: number;
  /**
   * The days this climber can actually train. Undefined means any day.
   *
   * Fridays, Saturdays and Sundays is a real answer, and until M55 the only
   * way to give it was to pick the nearest of three fixed shapes and drag
   * sessions around the calendar afterwards.
   */
  availableDays?: readonly DayOfWeek[];
}

export interface Layout extends WeeklyLayout {
  /** What this shape had to leave out, when it could not keep everything. */
  note?: string;
}

/**
 * A program's work sessions, most important first.
 *
 * Authored priorities come first in their own order; anything unset follows
 * in the order the program declares it. So an untuned program produces
 * exactly the order it always did, and tuning one type does not silently
 * reorder the rest.
 */
export function sessionPriority(program: Program): SessionTypeId[] {
  return program.sessionTypes
    .map((type, index) => ({ type, index }))
    .filter(({ type }) => !type.isRest)
    .sort((a, b) => (a.type.priority ?? 100 + a.index) - (b.type.priority ?? 100 + b.index))
    .map(({ type }) => type.id);
}

/** Per-week caps, so filling a long week does not break one. */
function capsOf(program: Program): Map<SessionTypeId, number> {
  const caps = new Map<SessionTypeId, number>();
  for (const c of program.constraints) {
    if (c.kind === 'max-per-week') caps.set(c.sessionTypeId, c.count);
  }
  return caps;
}

/**
 * Which sessions a week of `days` days should hold.
 *
 * Fewer days than sessions: the most important survive, which is the whole
 * point of `priority`. More days than sessions: they repeat from the top,
 * skipping any type that has hit its own weekly cap.
 */
export function sessionsForDays(program: Program, days: number): SessionTypeId[] {
  const priority = sessionPriority(program);
  if (priority.length === 0) return [];
  const caps = capsOf(program);
  const used = new Map<SessionTypeId, number>();
  const chosen: SessionTypeId[] = [];

  while (chosen.length < days) {
    const before = chosen.length;
    for (const id of priority) {
      if (chosen.length >= days) break;
      const cap = caps.get(id);
      const count = used.get(id) ?? 0;
      if (cap !== undefined && count >= cap) continue;
      chosen.push(id);
      used.set(id, count + 1);
    }
    // Every remaining type is capped out; a longer week cannot be filled
    // without breaking a rule, so it stays short rather than break one.
    if (chosen.length === before) break;
  }
  return chosen;
}

/** Errors count for far more than warnings, and no violation is free. */
function planCost(program: Program, plan: WeekPlan): number {
  return validateWeek(program, plan).reduce(
    (n, v) => n + (v.severity === 'error' ? 100 : 1),
    0,
  );
}

/** Distinct orderings, first one being the input order. Bounded. */
function* orderings(items: SessionTypeId[], budget: { left: number }): Generator<SessionTypeId[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  const seen = new Set<SessionTypeId>();
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i]!;
    if (seen.has(head)) continue;
    seen.add(head);
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of orderings(rest, budget)) {
      if (budget.left <= 0) return;
      budget.left -= 1;
      yield [head, ...tail];
    }
  }
}

/**
 * Which session goes on which of the chosen days.
 *
 * The priority order is tried first and kept on a tie, so a week that
 * already works is never reshuffled for the sake of it. Otherwise this
 * searches orderings for the one that breaks the fewest of the program's own
 * rules — which is how `order-in-week` gets respected rather than satisfied
 * by luck, and it was luck before.
 */
const SEARCH_BUDGET = 720;

export function assignSessions(
  program: Program,
  days: readonly DayOfWeek[],
  sessions: SessionTypeId[],
): WeekPlan {
  const lay = (order: SessionTypeId[]): WeekPlan => {
    const slots: WeekPlan = {};
    days.forEach((day, i) => {
      const id = order[i];
      if (id) slots[day] = id;
    });
    return slots;
  };

  let best = lay(sessions);
  let bestCost = planCost(program, best);
  if (bestCost === 0) return best;

  const budget = { left: SEARCH_BUDGET };
  for (const order of orderings(sessions, budget)) {
    const slots = lay(order);
    const cost = planCost(program, slots);
    if (cost < bestCost) {
      best = slots;
      bestCost = cost;
      if (cost === 0) break;
    }
  }
  return best;
}

const SHAPES: { name: string; description: string; days: DayOfWeek[] }[] = [
  { name: 'Front-loaded', description: 'Hard days early in the week, weekend free.', days: [1, 2, 4, 5, 6, 0, 3] },
  { name: 'Spread out', description: 'Maximum recovery between sessions.', days: [1, 3, 5, 0, 2, 4, 6] },
  { name: 'Weekend-heavy', description: 'Built around weekend availability.', days: [6, 0, 2, 4, 1, 3, 5] },
];

/**
 * A name and a description for a week built from days the climber chose.
 *
 * The three fixed shapes describe a strategy — "hard days early, weekend
 * free" — and that sentence is false the moment the only days available are
 * Friday and Saturday. A chosen week is named by its days and described by
 * its spacing, which are the two things about it that are true.
 */
export function describeDays(days: readonly DayOfWeek[]): { name: string; description: string } {
  const name = days.map((d) => DAY_SHORT[d]).join(', ');
  if (days.length <= 1) return { name, description: 'One session a week.' };
  const gaps = days.map((d, i) => gapHours(d, days[(i + 1) % days.length]!));
  const tightest = Math.min(...gaps);
  const description =
    tightest <= 24
      ? 'Sessions on consecutive days.'
      : tightest <= 48
        ? 'A rest day between sessions.'
        : 'Spread across the week.';
  return { name, description };
}

function sameSlots(a: WeekPlan, b: WeekPlan): boolean {
  return ALL_DAYS.every((d) => a[d] === b[d]);
}

function nameOf(program: Program, id: SessionTypeId): string {
  return program.sessionTypes.find((t) => t.id === id)?.name ?? id;
}

/** A sentence naming what a short week keeps and what it costs. */
function noteFor(program: Program, kept: SessionTypeId[]): string | undefined {
  const all = sessionPriority(program);
  const inWeek = new Set(kept);
  const dropped = all.filter((id) => !inWeek.has(id));
  if (dropped.length === 0) return undefined;
  const list = (ids: SessionTypeId[]) => {
    const names = ids.map((id) => nameOf(program, id));
    return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  };
  return `Keeps ${list(all.filter((id) => inWeek.has(id)))}. Leaves out ${list(dropped)}.`;
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
export function layoutsFor(program: Program, request: LayoutRequest = {}): Layout[] {
  const layouts: Layout[] = [];
  if (program.recommendedLayout) layouts.push(program.recommendedLayout);

  const priority = sessionPriority(program);
  if (priority.length === 0) return layouts;

  const available = request.availableDays?.length
    ? ALL_DAYS.filter((d) => request.availableDays!.includes(d))
    : ALL_DAYS;

  const asked =
    (program.constraints.find((c) => c.kind === 'sessions-per-week') as
      | { min: number; max: number }
      | undefined
    )?.min ?? Math.min(priority.length, 4);
  const target = Math.max(1, Math.min(request.daysPerWeek ?? asked, available.length));

  // Step down rather than offer nothing. Iron Grip on Friday, Saturday and
  // Sunday is the case: it needs 48 hours between finger sessions and no
  // fingers the day before hard climbing, and across three consecutive days
  // there is no arrangement that does both. A two-day weekend works, and
  // "here is a two-day week" is an answer where an empty list is not
  // (PLAN.md M55). The layouts carry their own day count, so the screen can
  // say what it had to do without being told.
  for (let days = target; days >= 1; days -= 1) {
    for (const shape of SHAPES) {
      const chosen = shape.days
        .filter((d) => available.includes(d))
        .slice(0, days)
        .sort((a, b) => a - b);
      if (chosen.length === 0) continue;

      const sessions = sessionsForDays(program, chosen.length);
      const slots = assignSessions(program, chosen, sessions);
      if (validateWeek(program, slots).some((v) => v.severity === 'error')) continue;
      if (layouts.some((l) => sameSlots(l.slots, slots))) continue;

      const note = noteFor(program, sessions);
      // Named for the strategy when the whole week is open, and for the days
      // themselves when it is not — see describeDays.
      const named = request.availableDays?.length
        ? describeDays(chosen)
        : { name: shape.name, description: shape.description };
      layouts.push({ ...named, slots, ...(note ? { note } : {}) });
    }
    if (layouts.some((l) => l.name !== 'Recommended')) break;
  }

  return layouts;
}
