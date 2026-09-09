import { useMemo } from 'react';
import { SKILL_TREES } from '@/content/skills';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveClimberState } from '@/engine/derive';
import { evaluateSkills, type SkillState } from '@/engine/skills';
import { deriveStats } from '@/engine/stats';
import { useXp } from './game';
import { useMetrics } from './metrics';
import { useProjects } from './projects';
import { useSessions } from './sessions';
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
  const xp = useXp();
  const display = useSettings((s) => s.display);

  return useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    return evaluateSkills(SKILL_TREES, {
      state,
      stats: deriveStats({ state, metrics, projects }),
      metrics,
      projects,
      level: xp.progress.level,
      feet: deriveAltimeter(sessions).feet,
      display,
    });
  }, [byDate, metrics, projects, xp.progress.level, display]);
}

/** Just the perks, for the systems that only need those. */
export function useSkillEffects() {
  return useSkills().effects;
}
