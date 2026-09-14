import { AlertTriangle, CheckCircle2, Info, TrendingDown } from 'lucide-react';
import { RATIO_NEEDS, type AcwrZone } from '@/engine/derive';

/**
 * Status presentation for ACWR, in one place (PLAN.md M46).
 *
 * Colour never carries the meaning alone — every zone ships with an icon and
 * a sentence. It lived inside `ProgressPage` while that was the only screen
 * showing it; Home shows the gauge §5.5 asked for now, and two copies of a
 * threshold's wording is how a guide ends up saying 1.3 while the app draws
 * the line at 1.4.
 */
/**
 * Why the ratio is unreadable, when it is (PLAN.md M162, M173).
 *
 * `unknown` had one note — *"three weeks of logged sessions"* — because it
 * had one cause. There are two now, and telling a climber with four months
 * of history that they need three weeks of it is worse than saying nothing:
 * the thing they can actually do is fill in the effort on the sessions they
 * already logged.
 *
 * **And the history note was a promise the app could not keep (M173).**
 * Three weeks of *span* is one of two conditions; the other is
 * `MIN_CHRONIC_DAYS` of scored training inside the rolling 28-day window,
 * which a climber training once a week never reaches — measured, they top
 * out at four. So the note says what it needs rather than when it arrives,
 * and the `cold-start` coach rule is what tells a given climber which of the
 * two they are short of.
 */
export const UNKNOWN_NOTE: Record<'history' | 'unscored', string> = {
  history: RATIO_NEEDS,
  unscored:
    'Some of the last month has no effort score on it, and load is effort × hours — so the ratio would be a guess. Add the RPE to those sessions and it fills in.',
};

export const ZONE: Record<AcwrZone, { label: string; note: string; color: string; Icon: typeof Info }> = {
  unknown: {
    label: 'Not enough to say',
    // The same sentence, not a second copy of it (PLAN.md M173). This one
    // was left behind when M162 split the reason in two: `ProgressPage`
    // overrides it at the call site, so the retired wording sat one
    // `ZONE[zone].note` away from a screen for ten milestones.
    note: UNKNOWN_NOTE.history,
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
    note: 'A rise this sharp is what this model exists to flag — connective tissue adapts slower than the muscle driving the change. Worth an easier week, or a reason it is not.',
    color: 'var(--viz-critical)',
    Icon: AlertTriangle,
  },
};
