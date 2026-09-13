import { useEffect, useMemo } from 'react';
import { getProgram } from '@/content/programs';
import { today, weekDays } from '@/engine/dates';
import { concerning, injuryPolicy } from '@/engine/injury';
import { weekOutline, type WeekOutline } from '@/engine/week';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';

/**
 * The week containing `date`, read from the stores (PLAN.md M135).
 *
 * One hook for the two places that show a week — Home's card and the
 * week's own page — for the reason `usePlannedDay` is one hook: two
 * readings of the same stores drift, and a card that says "2 of 3" over a
 * page that says "1 of 3" is the kind of disagreement nobody can settle.
 *
 * The hurt parts go through `injuryPolicy`, the rule the pre-session card
 * has followed since M89: a part the climber is deliberately loading again
 * is not one to count against a day.
 */
export function useWeekOutline(date: string): WeekOutline {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const tracks = useProfile((s) => s.tracks);
  const injuries = useProfile((s) => s.injuries);
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;
  const trackId = activeProgramId ? tracks[activeProgramId] : undefined;
  const injured = useMemo(() => concerning(injuryPolicy(injuries)), [injuries]);

  return useMemo(
    () =>
      weekOutline({
        date,
        today: today(),
        sessions: weekDays(date).flatMap((d) => byDate[d] ?? []),
        program,
        startDate,
        plan,
        overrides,
        trackId,
        injured,
      }),
    [date, byDate, program, startDate, plan, overrides, trackId, injured],
  );
}
