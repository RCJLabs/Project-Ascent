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
import { dayOfWeek, programWeek } from './dates';
import type { WeekPlan } from './scheduler';

export interface PlannedDay {
  date: string;
  /** 1-based program week, or null if the date precedes the start. */
  week: number | null;
  phase?: Phase;
  sessionType?: SessionType;
  drill?: Drill;
  isDeload: boolean;
  /** The plan puts nothing here, or puts a rest session here. */
  isRest: boolean;
}

export function plannedDay(
  program: Program,
  startDate: string,
  plan: WeekPlan,
  date: string,
): PlannedDay {
  const week = programWeek(startDate, date, program.weeks);
  const phase = week === null ? undefined : phaseForWeek(program, week);
  const typeId = plan[dayOfWeek(date) as 0 | 1 | 2 | 3 | 4 | 5 | 6];
  const sessionType = typeId ? program.sessionTypes.find((t) => t.id === typeId) : undefined;

  const drillId = week !== null && sessionType?.drillsByWeek ? sessionType.drillsByWeek[week] : undefined;
  const drill = drillId ? getDrill(drillId) : undefined;

  return {
    date,
    week,
    ...(phase ? { phase } : {}),
    ...(sessionType ? { sessionType } : {}),
    ...(drill ? { drill } : {}),
    isDeload: week !== null && (program.deloadWeeks ?? []).includes(week),
    isRest: !sessionType || sessionType.isRest === true,
  };
}

export function plannedRange(
  program: Program,
  startDate: string,
  plan: WeekPlan,
  dates: string[],
): PlannedDay[] {
  return dates.map((d) => plannedDay(program, startDate, plan, d));
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
