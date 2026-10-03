import { useMemo } from 'react';
import { testWeek, type TestWeek } from '@/engine/testDays';
import { usePlannedDay } from './usePlannedDay';
import { useProfile } from '@/store/profile';

/**
 * The week's battery and the session each test goes to (PLAN.md M325).
 *
 * Beside `usePlannedDay` rather than inside it: that hook is in the entry
 * chunk, because Home reads it, and this is needed only in a test week — the
 * planner and the list that shows its answer are fetched when one arrives.
 * It reads the same five profile fields through the same day, so the card
 * and the tests cannot be about different weeks.
 */
export function useTestWeek(date: string): TestWeek | null {
  // The day's own start, so a week before a pick-up is tested as the week it
  // was, and a paused one not at all (PLAN.md M374).
  const { program, day, activeProgramId, startDate } = usePlannedDay(date);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);

  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;

  return useMemo(
    () =>
      program && startDate && plan && day?.test !== undefined
        ? testWeek(program, startDate, plan, date, overrides)
        : null,
    [program, startDate, plan, date, overrides, day],
  );
}
