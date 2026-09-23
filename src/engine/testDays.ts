/**
 * Which test on which day of a test week (PLAN.md M325).
 *
 * ## A test week said when, and never what
 *
 * M67 put the program's test weeks on the calendar — week one, the first
 * week of every later phase, the last week — and every day of such a week
 * has read *"Test week"* since. What it asked for was the whole battery, and
 * the only list of it is the assessments page, which shows everything due at
 * once. Iron Grip's battery is nine tests: a max hang, repeaters, a weighted
 * pull-up, a lock-off, a lever, max pull-ups, a dead hang, max push-ups and
 * a boulder grade. Nobody takes nine maximal efforts in one session, and a
 * climber who tried would get nine numbers describing how tired they were.
 *
 * So the week's battery is spread over the week's sessions, and each test
 * goes to a session that already does that kind of work:
 *
 * - a **board** test to the day that prescribes finger work;
 * - a **gym** test — a bar, the floor, a dumbbell — to a strength day that
 *   is not a climbing day;
 * - a **wall** test to a climbing day, the hardest one first.
 *
 * When a week has no day of the right kind the test falls back a step — to
 * a strength day, to any day with prescribed work, to any training day —
 * rather than being dropped: the program asked for it. A `tally` metric is
 * counted, not taken, and no day is the one for it.
 *
 * ## Spread, not piled
 *
 * Between days of the same kind, a test goes where fewer tests *of its own
 * kind* already are, then where fewer tests are at all, then to the earlier
 * day. So Iron Grip's two finger days take the max hang on one and the
 * repeaters on the other, and the weighted pull-up and max pull-ups land on
 * different days rather than back to back.
 *
 * Within a day the tests keep the order the program lists them in. Authors
 * list them freshest-first — Iron Grip opens with the max hang and ends its
 * body tests with the ones taken to failure — and a planner that re-sorted
 * them would be claiming to know better than the program about its own
 * battery.
 *
 * ## What it does not decide
 *
 * Whether to take a test at all. A test that loads something the climber
 * says is hurt is still placed, and the screen that shows it says so beside
 * it — `TestSafety`'s rule, which is that the app says what a test loads and
 * the decision is the climber's.
 */

import { getMetric } from '@/content/metrics';
import { INTENSITY_ORDER, type Metric, type MetricId, type Program, type SessionType, type TestPlace } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type { TestReason } from './assessments';
import { onTheWall } from './climbing';
import { addDays, startOfWeek } from './dates';
import { directFingerWork, typeWords } from './fingerGap';
import { plannedDay, type PlannedDay } from './plan';
import type { WeekOverrides } from './reschedule';
import { intensityOf, type WeekPlan } from './scheduler';

/** The day that prescribes finger work, by the finger-gap rule's own reading. */
function onTheBoard(type: SessionType): boolean {
  return directFingerWork(typeWords(type));
}

function prescribesWork(type: SessionType): boolean {
  return (type.blocks ?? []).length > 0;
}

/** The days a test taken at `place` can go on, best tier first. */
function candidates(place: TestPlace, days: readonly TestSlot[]): TestSlot[] {
  const gym = days.filter((d) => prescribesWork(d.type) && !onTheWall(d.type));
  const work = days.filter((d) => prescribesWork(d.type));
  const tiers: Record<TestPlace, TestSlot[][]> = {
    board: [days.filter((d) => onTheBoard(d.type)), gym, work, [...days]],
    gym: [gym, work, [...days]],
    wall: [days.filter((d) => onTheWall(d.type)), [...days]],
    tally: [],
  };
  return tiers[place].find((tier) => tier.length > 0) ?? [];
}

interface TestSlot {
  date: string;
  type: SessionType;
  metrics: Metric[];
}

/** One session in a test week and the tests it carries, in the program's order. */
export interface TestDay {
  date: string;
  sessionType: SessionType;
  metrics: Metric[];
}

export interface TestWeek {
  why: TestReason;
  /** Sunday. */
  start: string;
  /** Saturday. */
  end: string;
  /** The sessions carrying a test, in date order. */
  days: TestDay[];
}

/**
 * Lower is better: fewer of the same kind already there, then fewer at all,
 * then — for a wall test only — the harder day, since a grade is found on a
 * limit day and not on a technique one.
 */
function cost(metric: Metric, slot: TestSlot): number[] {
  const same = slot.metrics.filter((m) => m.place === metric.place).length;
  const hardness = metric.place === 'wall' ? -INTENSITY_ORDER.indexOf(intensityOf(slot.type)) : 0;
  return [same, slot.metrics.length, hardness];
}

function cheaper(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i]! < b[i]!;
  }
  return false;
}

/**
 * The battery for the week containing `date`, spread over its sessions.
 *
 * Null when the week is not a test week — before the block, after it, in a
 * logging mode, or in any ordinary week of it.
 */
export function testWeek(
  program: Program,
  startDate: string,
  plan: WeekPlan,
  date: string,
  overrides?: WeekOverrides,
): TestWeek | null {
  const start = startOfWeek(date);
  const days: PlannedDay[] = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    plannedDay(program, startDate, plan, addDays(start, i), overrides),
  );
  const why = days.find((d) => d.test !== undefined)?.test;
  if (why === undefined) return null;

  const slots: TestSlot[] = days
    .filter((d) => d.sessionType !== undefined && !d.isRest)
    .map((d) => ({ date: d.date, type: d.sessionType!, metrics: [] }));

  for (const id of program.assessments) {
    const metric = getMetric(id);
    if (!metric) continue;
    // A tally, or a week with no session left in it: the assessments page
    // still lists it as due, and no day is claimed for it.
    const options = candidates(metric.place, slots);
    if (options.length === 0) continue;
    // Ties keep the earlier day, which is the order `options` is in.
    const best = options.reduce((a, b) => (cheaper(cost(metric, b), cost(metric, a)) ? b : a));
    best.metrics.push(metric);
  }

  return {
    why,
    start,
    end: addDays(start, 6),
    days: slots
      .filter((s) => s.metrics.length > 0)
      .map((s) => ({ date: s.date, sessionType: s.type, metrics: s.metrics })),
  };
}

/** The tests one date carries, or none. */
export function testsOn(week: TestWeek | null, date: string): Metric[] {
  return week?.days.find((d) => d.date === date)?.metrics ?? [];
}

/** The tests with a result recorded inside the week. */
export function takenIn(week: TestWeek, entries: readonly MetricEntry[]): Set<MetricId> {
  return new Set(
    entries.filter((e) => e.date >= week.start && e.date <= week.end).map((e) => e.metricId),
  );
}

/**
 * Tests placed on a day before `date` that have no result yet.
 *
 * A session missed on Monday does not take its tests with it: they are
 * still the week's, and the next day that trains is the day to be told.
 */
export function stillToTake(week: TestWeek, entries: readonly MetricEntry[], date: string): Metric[] {
  const taken = takenIn(week, entries);
  return week.days
    .filter((d) => d.date < date)
    .flatMap((d) => d.metrics)
    .filter((m) => !taken.has(m.id));
}
