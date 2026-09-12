import { useMemo } from 'react';
import { getProgram } from '@/content/programs';
import type { Program } from '@/content/types';
import { plannedDay, type PlannedDay } from '@/engine/plan';
import { useProfile } from '@/store/profile';

/**
 * What the running block says about one date (PLAN.md M117).
 *
 * Three components need the same reading — the day heading (week and
 * phase), the pre-session card (what is planned, what it loads) and the
 * editor (the prescription) — and before this each of them re-derived it
 * from five profile selectors. One hook, so they cannot disagree about
 * which day it is.
 *
 * `overrides` is in the memo's dependencies. The logger's own copy left it
 * out, so a week rearranged on the calendar did not reach an already-open
 * log until something else re-rendered it.
 */
export function usePlannedDay(date: string): {
  program: Program | undefined;
  day: PlannedDay | undefined;
  trackId: string | undefined;
  activeProgramId: string | null;
} {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const tracks = useProfile((s) => s.tracks);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;
  const trackId = activeProgramId ? tracks[activeProgramId] : undefined;

  const day = useMemo(
    () =>
      program && startDate && plan ? plannedDay(program, startDate, plan, date, overrides) : undefined,
    [program, startDate, plan, date, overrides],
  );

  return { program, day, trackId, activeProgramId };
}
