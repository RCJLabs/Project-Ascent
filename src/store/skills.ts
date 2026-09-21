import { useMemo } from 'react';
import { SKILL_TREES } from '@/content/skills';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveClimberState } from '@/engine/derive';
import { nextUnlock, type NextUnlock } from '@/engine/nextUnlock';
import { evaluateSkills, type SkillState } from '@/engine/skills';
import { deriveStats } from '@/engine/stats';
import { useMetrics } from './metrics';
import { useProjects } from './projects';
import { useDeloadDates } from './deload';
import { useSessions, allSessions } from './sessions';
import { useSettings } from './settings';

/**
 * The trees, evaluated against the log.
 *
 * Derived like everything else, so a node can never be unlocked in storage
 * while the training that earned it has been edited away. The perks it
 * returns are read by the systems they affect rather than copied into them.
 */
export function useSkills(): SkillState {
  const byDate = useSessions((s) => s.byDate);
  const metrics = useMetrics((s) => s.entries);
  const projects = useProjects((s) => s.projects);
  const display = useSettings((s) => s.display);

  const deloadDates = useDeloadDates();
  return useMemo(() => {
    const sessions = allSessions(byDate);
    const state = deriveClimberState(sessions, { deloadDates });
    return evaluateSkills(SKILL_TREES, {
      state,
      stats: deriveStats({ state, metrics, projects }),
      metrics,
      projects,
      feet: deriveAltimeter(sessions).feet,
      display,
    });
  }, [byDate, metrics, projects, display, deloadDates]);
}

/**
 * The one thing closest to unlocking, for the screens that show a prompt.
 *
 * `useSkills` is memoised on the log, so the three callers share one
 * evaluation of 130 nodes rather than each running their own.
 */
export function useNextUnlock(): NextUnlock | null {
  const skills = useSkills();
  return useMemo(() => nextUnlock(skills), [skills]);
}

/** Just the perks, for the systems that only need those. */
export function useSkillEffects() {
  return useSkills().effects;
}
