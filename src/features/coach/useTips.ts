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
import { today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { diagnose } from '@/engine/plateau';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
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
  const lastExportAt = useProfile((s) => s.lastExportAt);
  const dismissed = useProfile((s) => s.dismissedTips);
  const display = useSettings((s) => s.display);

  return useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
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
            today: today(),
          })
        : null;
    const all = buildTips({
      state,
      sessions,
      projects,
      metrics,
      adherence,
      lastExportAt,
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
  }, [byDate, projects, metrics, injuries, equipment, activeProgramId, startDates, plans, weekOverrides, lastExportAt, dismissed, display]);
}
