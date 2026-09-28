/**
 * What an injury's severity and status are called (PLAN.md M345).
 *
 * Out of `store/profile.ts`, which hydrates at boot. Only the injury card
 * and page show these.
 */

import type { InjurySeverity, InjuryStatus } from '../../store/profile';

export const SEVERITY_LABEL: Record<InjurySeverity, { label: string; blurb: string }> = {
  niggle: { label: 'A niggle', blurb: 'Noticeable, not stopping you' },
  managing: { label: 'Managing it', blurb: 'Training around it deliberately' },
  serious: { label: 'Serious', blurb: 'Off it entirely for now' },
};

export const STATUS_LABEL: Record<InjuryStatus, { label: string; blurb: string }> = {
  active: { label: 'Healing', blurb: 'Keep load off it' },
  returning: { label: 'Coming back', blurb: 'Loading it again, carefully' },
};
