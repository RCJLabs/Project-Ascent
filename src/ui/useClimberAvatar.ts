import { useMemo } from 'react';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveAvatar, type AvatarConfig } from '@/engine/avatar';
import { deriveClimberState } from '@/engine/derive';
import { deriveStats } from '@/engine/stats';
import { deriveVitality } from '@/engine/vitality';
import { useProfile } from '@/store/profile';
import { useSessions, allSessions } from '@/store/sessions';
import { useDeloadDates } from '@/store/deload';
import { useSkillEffects } from '@/store/skills';
import { useXp } from '@/store/game';

/**
 * The climber's avatar as it stands right now.
 *
 * Three screens needed this and two of them had written it out: the home
 * strip, the climber page, and — since M26 — the share card on a personal
 * record. Four derivations feed it (state, stats, vitality, altimeter), so
 * three copies is three chances for the avatar on one screen to disagree
 * with the avatar on another.
 *
 * `enabled` exists for the third caller. A record card is a rare moment and
 * the derivation walks the whole log; running it on every reward card, most
 * of which show no record at all, would be a full climber-state derivation
 * per logged session for nothing.
 */
export function useClimberAvatar(): AvatarConfig;
export function useClimberAvatar(enabled: boolean): AvatarConfig | undefined;
export function useClimberAvatar(enabled = true): AvatarConfig | undefined {
  const xp = useXp();
  const byDate = useSessions((s) => s.byDate);
  const injuries = useProfile((s) => s.injuries);
  const palette = useProfile((s) => s.avatarPalette);
  const figure = useProfile((s) => s.avatarFigure);
  const restBonus = useSkillEffects().restRecovery;

  const deloadDates = useDeloadDates();
  return useMemo(() => {
    if (!enabled) return undefined;
    const sessions = allSessions(byDate);
    const state = deriveClimberState(sessions, { deloadDates });
    const vitality = deriveVitality({
      state,
      endurance: deriveStats({ state }).END,
      injuries,
      restBonus,
    });
    return deriveAvatar({
      level: xp.progress.level,
      vitality: vitality.state,
      feet: deriveAltimeter(sessions).feet,
      palette,
      figure,
    });
  }, [enabled, byDate, figure, injuries, palette, restBonus, xp.progress.level, deloadDates]);
}
