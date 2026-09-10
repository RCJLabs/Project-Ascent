import { AlertTriangle, CheckCircle2, Info, TrendingDown } from 'lucide-react';
import type { AcwrZone } from '@/engine/derive';

/**
 * Status presentation for ACWR, in one place (PLAN.md M46).
 *
 * Colour never carries the meaning alone — every zone ships with an icon and
 * a sentence. It lived inside `ProgressPage` while that was the only screen
 * showing it; Home shows the gauge §5.5 asked for now, and two copies of a
 * threshold's wording is how a guide ends up saying 1.3 while the app draws
 * the line at 1.4.
 */
export const ZONE: Record<AcwrZone, { label: string; note: string; color: string; Icon: typeof Info }> = {
  unknown: {
    label: 'Not enough history',
    note: 'Three weeks of logged sessions and this becomes meaningful.',
    color: 'var(--c-ink-soft)',
    Icon: Info,
  },
  detraining: {
    label: 'Load dropping',
    note: 'You are training well below your recent baseline. Fine after a trip or illness; worth noticing otherwise.',
    color: 'var(--viz-warning)',
    Icon: TrendingDown,
  },
  optimal: {
    label: 'In the sweet spot',
    note: 'Your recent load sits close to what you are used to. This is where adaptation happens.',
    color: 'var(--viz-good)',
    Icon: CheckCircle2,
  },
  caution: {
    label: 'Ramping quickly',
    note: 'You are training noticeably harder than your baseline. Sustainable briefly, not for weeks.',
    color: 'var(--viz-serious)',
    Icon: AlertTriangle,
  },
  danger: {
    label: 'Load spike',
    note: 'A jump this size is the pattern most associated with injury. Consider an easier week.',
    color: 'var(--viz-critical)',
    Icon: AlertTriangle,
  },
};
