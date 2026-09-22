/**
 * Everything the coach board needs, derived in one place (PLAN.md M104).
 *
 * **Its own module, and not `CoachPage.tsx`, because `HomePage` reads it.**
 * The page is `lazy()` in the router, and that boundary did nothing: one
 * eager import of this hook from Home pulled the page's JSX, its tone table
 * and its icons into the entry chunk with it. Splitting the hook out is what
 * makes the lazy route real.
 */

import { useMemo } from 'react';
import { getProgram } from '@/content/programs';
import { blockAdherence } from '@/engine/adherence';
import { buildTips, visibleTips, type Tip } from '@/engine/coach';
import { loadRelief } from '@/engine/loadRelief';
import { plannedDay } from '@/engine/plan';
import { addDays, startOfWeek } from '@/engine/dates';
import { today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { diagnose } from '@/engine/plateau';
import { planVsLog } from '@/engine/planVsLog';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useObjectives } from '@/store/objectives';
import { useAway } from '@/store/away';
import { useSessions, allSessions } from '@/store/sessions';
import { useDeloadDates } from '@/store/deload';
import { useSettings } from '@/store/settings';

/** Everything the board needs, derived in one place. */
export function useTips(): { all: Tip[]; visible: Tip[]; hidden: number } {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const metrics = useMetrics((s) => s.entries);
  const injuries = useProfile((s) => s.injuries);
  const equipment = useProfile((s) => s.equipment);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const tracks = useProfile((s) => s.tracks);
  const lastExportAt = useProfile((s) => s.lastExportAt);
  const dismissed = useProfile((s) => s.dismissedTips);
  const objectives = useObjectives((s) => s.objectives);
  const away = useAway((s) => s.periods);
  const display = useSettings((s) => s.display);

  const deloadDates = useDeloadDates();
  return useMemo(() => {
    const sessions = allSessions(byDate);
    const state = deriveClimberState(sessions, { deloadDates });
    const program = activeProgramId ? getProgram(activeProgramId) : undefined;
    // Planned against done, per type, for M104's skipped-type rule. Null
    // without a live block, which is the honest answer: nothing was placed,
    // so nothing was skipped.
    const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
    const plan = activeProgramId ? plans[activeProgramId] : undefined;
    const adherence =
      program && startDate && plan
        ? blockAdherence({
            program,
            startDate,
            plan,
            overrides: activeProgramId ? weekOverrides[activeProgramId] : undefined,
            sessions,
            // Days the climber marked away leave the denominator (M279), so a
            // fortnight in Font stops arriving home as six missed sessions.
            away,
            today: today(),
          })
        : null;
    // The plan against the log (PLAN.md M148). Same three things the
    // adherence call needs and nothing more, so it is null for exactly the
    // climbers that one is: no live block, no claim to check anything
    // against.
    const findings =
      program && startDate
        ? planVsLog({
            program,
            startDate,
            sessions,
            trackId: activeProgramId ? tracks[activeProgramId] : undefined,
            today: today(),
          })
        : [];
    /**
     * Which session the rest of this week could lose (PLAN.md M318).
     *
     * Only when the ratio is actually hot: it walks the plan to the end of
     * the week and takes a median per session type, and every other climber
     * would pay for an answer no tip is going to read.
     *
     * From today rather than tomorrow when today has nothing logged on it —
     * *"drop tonight's session"* is the most actionable thing the app can
     * say at nine in the morning, and the least useful once the session is
     * in the log.
     */
    const hot = state.load.zone === 'caution' || state.load.zone === 'danger';
    const relief =
      hot && program && startDate && plan
        ? loadRelief({
            sessions,
            ahead: plannedAhead(
              program,
              startDate,
              plan,
              activeProgramId ? weekOverrides[activeProgramId] : undefined,
              sessions,
              today(),
            ),
            today: today(),
          })
        : null;
    const all = buildTips({
      state,
      sessions,
      projects,
      relief,
      metrics,
      adherence,
      findings,
      lastExportAt,
      // So the spike tip can tell a trip from a Tuesday (PLAN.md M163).
      // Hydrated at boot in `store/index.ts` like every other store here,
      // so Home has it on the first render rather than a beat later.
      objectives,
      // The stretches the climber said they were away for (PLAN.md M275).
      // Two tips read it: the layoff rule, which had only a peak or a dated
      // objective to go on, and the rock-rust rule, which had nothing at all.
      away,
      // What the program asked to be measured (PLAN.md M174). The field has
      // carried its own reason since it was written — *"so staleness is
      // judged on what you were asked"* — and this hook never filled it, so
      // the benchmark rule could only see numbers already recorded. That is
      // why it had nothing to say to a climber who had recorded none.
      programMetrics: program?.assessments ?? [],
      // Whether this climber's program ever puts a drill in a week, so the
      // drill tip stops asserting one for the six programs that do not
      // (PLAN.md M132).
      // `undefined` when there is no program, which is a third thing and not
      // a program that happens to prescribe nothing (PLAN.md M249). `Boolean`
      // collapsed the two, so a climber running nothing was told what their
      // program does.
      prescribesDrills:
        program === undefined
          ? undefined
          : program.sessionTypes.some((t) => Object.keys(t.drillsByWeek ?? {}).length > 0),
      diagnosis: diagnose({
        display,
        state,
        sessions,
        injuries: injuries.map((i) => i.part),
        equipment,
        metrics,
        program,
      }),
    });
    const visible = visibleTips(all, dismissed);
    return { all, visible, hidden: all.length - visible.length };
  }, [byDate, projects, metrics, injuries, equipment, activeProgramId, startDates, plans, weekOverrides, tracks, lastExportAt, dismissed, display, objectives, away, deloadDates]);
}

/**
 * The sessions the plan still has in this week, today included when today
 * is still open (PLAN.md M318).
 *
 * The calendar week rather than the next seven days, because the week is
 * what the climber is looking at and what they can move. The ratio's own
 * window is a rolling seven days and `loadRelief` reads it that way; these
 * are the days there is any point offering to drop.
 */
function plannedAhead(
  program: Parameters<typeof plannedDay>[0],
  startDate: string,
  plan: Parameters<typeof plannedDay>[2],
  overrides: Parameters<typeof plannedDay>[4],
  sessions: { date: string; completed: boolean }[],
  from: string,
): { date: string; typeId: string; name: string }[] {
  const loggedToday = sessions.some((s) => s.date === from && s.completed);
  const end = addDays(startOfWeek(from), 6);
  const out: { date: string; typeId: string; name: string }[] = [];
  for (let date = loggedToday ? addDays(from, 1) : from; date <= end; date = addDays(date, 1)) {
    const day = plannedDay(program, startDate, plan, date, overrides);
    if (day.sessionType && !day.isRest) {
      out.push({ date, typeId: day.sessionType.id, name: day.sessionType.name });
    }
  }
  return out;
}
