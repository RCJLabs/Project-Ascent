/**
 * Turns an active program plus a committed weekly plan into concrete days.
 *
 * Everything the calendar and logger need about "what am I supposed to do
 * on this date" is derived here, in one place, from data — never stored, so
 * editing a plan or a start date immediately re-derives the future without
 * migrating anything.
 */

import { getDrill } from '@/content/drills';
import {
  phaseForWeek,
  type Drill,
  type Phase,
  type PhasePrescription,
  type Program,
  type SessionType,
} from '@/content/types';
import { testWeeks, type TestReason } from './assessments';
import { addDays, dayOfWeek, daysBetween, programWeek, startOfWeek } from './dates';
import { effectivePlan, type WeekOverrides } from './reschedule';
import type { WeekPlan } from './scheduler';

export interface PlannedDay {
  date: string;
  /** 1-based program week, or null if the date precedes the start. */
  week: number | null;
  phase?: Phase;
  sessionType?: SessionType;
  drill?: Drill;
  isDeload: boolean;
  /**
   * Set when this week is one the program expects a test in, and why
   * (PLAN.md M67). A week-level fact, like `isDeload`, so every screen that
   * already reads a day gets it without being told.
   */
  test?: TestReason;
  /** The plan puts nothing here, or puts a rest session here. */
  isRest: boolean;
  /**
   * The block has finished and this day is past its last (PLAN.md M85).
   *
   * A week-level fact like the others, for the same reason: six screens
   * read a planned day, and before this every one of them was being told
   * that a twelve-week block a year in the past was still on week twelve.
   * `week` is null here *and* before the start date, so a screen that needs
   * to tell those apart reads this.
   */
  over?: boolean;
}

/**
 * The block's own window: week one's Sunday to the last day of its last week.
 *
 * One place, because three modules were each doing this arithmetic —
 * `calendar.lastDayOf` (which exists precisely because `programWeek`
 * clamps), `blockReport`, and this file. The Sunday matters: `programWeek`
 * snaps to the week, so a Wednesday start means the block's week one began
 * on the Sunday before it.
 */
export function blockWindow(program: Program, startDate: string): { from: string; to: string } {
  const from = startOfWeek(startDate);
  return { from, to: addDays(from, program.weeks * 7 - 1) };
}

export type BlockState = 'before' | 'running' | 'ended';

export interface BlockStatus {
  state: BlockState;
  from: string;
  to: string;
  /** Days since the block's last day. Zero or negative while it runs. */
  daysSince: number;
}

/**
 * Where the climber is in the block.
 *
 * `programWeek` cannot answer this: it clamps, so a date a year past a
 * twelve-week block still reports week twelve, and every screen that asked
 * it was repeating the last week forever — sessions, phase, and the "final
 * test week" banner alike.
 */
export function blockStatus(program: Program, startDate: string, today: string): BlockStatus {
  const { from, to } = blockWindow(program, startDate);
  return {
    state: today < from ? 'before' : today > to ? 'ended' : 'running',
    from,
    to,
    daysSince: daysBetween(to, today),
  };
}

export function plannedDay(
  program: Program,
  startDate: string,
  plan: WeekPlan,
  date: string,
  /** Per-week exceptions, if the climber has moved anything. */
  overrides?: WeekOverrides,
): PlannedDay {
  // Past the last week the block is over, and the app has nothing to
  // prescribe. Without this `programWeek` clamps and every caller is handed
  // week twelve of a block that finished months ago, with its sessions and
  // its final-test banner (PLAN.md M85).
  const { to } = blockWindow(program, startDate);
  if (date > to) return { date, week: null, isDeload: false, isRest: true, over: true };

  const week = programWeek(startDate, date, program.weeks);
  const phase = week === null ? undefined : phaseForWeek(program, week);
  const forWeek = effectivePlan(plan, overrides, date);
  const typeId = forWeek[dayOfWeek(date) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  const sessionType = typeId ? program.sessionTypes.find((t) => t.id === typeId) : undefined;

  const drillId = week !== null && sessionType?.drillsByWeek ? sessionType.drillsByWeek[week] : undefined;
  const drill = drillId ? getDrill(drillId) : undefined;
  const test = week === null ? undefined : testWeeks(program).find((t) => t.week === week);

  return {
    date,
    week,
    ...(phase ? { phase } : {}),
    ...(sessionType ? { sessionType } : {}),
    ...(drill ? { drill } : {}),
    isDeload: week !== null && (program.deloadWeeks ?? []).includes(week),
    ...(test ? { test: test.why } : {}),
    isRest: !sessionType || sessionType.isRest === true,
  };
}

export function plannedRange(
  program: Program,
  startDate: string,
  plan: WeekPlan,
  dates: string[],
  overrides?: WeekOverrides,
): PlannedDay[] {
  return dates.map((d) => plannedDay(program, startDate, plan, d, overrides));
}

export interface BlockPrescription {
  blockId: string;
  name: string;
  entry: PhasePrescription;
}

/** Blocks to show for a session type in a given phase, filtered to a track. */
export function prescriptionFor(
  sessionType: SessionType,
  phase: Phase,
  trackId?: string,
): BlockPrescription[] {
  const out: BlockPrescription[] = [];
  for (const block of sessionType.blocks ?? []) {
    const entry = block.perPhase[phase.id];
    if (!entry) continue;
    const exercises = trackId
      ? entry.exercises.filter((e) => !e.track || e.track === trackId)
      : entry.exercises;
    out.push({ blockId: block.id, name: block.name, entry: { ...entry, exercises } });
  }
  return out;
}
