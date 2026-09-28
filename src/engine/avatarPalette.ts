/**
 * The figure's colours before a climber picks any (PLAN.md M345).
 *
 * Out of `avatar.ts` for the profile store, which fills in a missing palette
 * when it hydrates at boot. Everything else about the figure — its stages,
 * gear, pose and the derivation itself — is drawn on the game pages, and
 * `avatar.ts` goes with them.
 */

import type { AvatarPalette } from './avatar';

export const DEFAULT_PALETTE: AvatarPalette = {
  skin: '#c68a5e',
  hair: '#3b2a1e',
  top: '#2f7bb0',
  shorts: '#35434e',
  shoes: '#eb6834',
  gear: '#5b6b78',
};
