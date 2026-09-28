/**
 * Which drills are the climber's own (PLAN.md M286).
 *
 * The prefix and the test for it, which the drill store needs at boot to
 * keep written drills apart from shipped ones. Writing one — the blank, the
 * checks, the tidy-up — is `drillWriting.ts` (PLAN.md M344), loaded with the
 * editor.
 */

export const CUSTOM_DRILL_PREFIX = 'own_';

export function isCustomDrill(id: string): boolean {
  return id.startsWith(CUSTOM_DRILL_PREFIX);
}
