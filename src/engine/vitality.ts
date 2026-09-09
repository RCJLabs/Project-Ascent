/**
 * Vitality — the avatar's visible health (PLAN.md §5.5).
 *
 * It gates nothing in real training. That is deliberate and it is the whole
 * point: an app that locked a session behind a resource bar would be
 * coaching the bar instead of the climber. What it does is make the cost of
 * grinding legible — six straight days, skipped warmups, an untreated
 * injury — and give resting a visible reward, which is the one direction
 * gamification can push a climber that a coach would agree with.
 *
 * Derived, like everything else: there is no stored HP to drift.
 */

import type { ClimberState } from './derive';
import type { Stat } from './stats';

/** END scales the ceiling from 100 to 500, as the prototype had it. */
export const VITALITY_FLOOR = 100;
export const VITALITY_CEILING = 500;

/** Consecutive training days → points drained. */
export const GRIND_COST: Record<number, number> = { 3: 10, 4: 30, 5: 50, 6: 70 };
export const SKIPPED_WARMUP_COST = 10;
export const INJURY_COST = 20;
/** A rest day inside 24 hours divides the day's damage by this. */
export const REST_RELIEF = 1.5;

export type VitalityState = 'fresh' | 'worked' | 'tired' | 'cooked';

export interface VitalityPenalty {
  label: string;
  points: number;
  note: string;
}

export interface Vitality {
  max: number;
  current: number;
  fraction: number;
  state: VitalityState;
  headline: string;
  penalties: VitalityPenalty[];
  buff?: { label: string; factor: number; note: string };
}

const HEADLINE: Record<VitalityState, string> = {
  fresh: 'Fresh',
  worked: 'Worked',
  tired: 'Running low',
  cooked: 'Cooked',
};

export interface VitalityInput {
  state: ClimberState;
  /** The END stat, which sets the ceiling. */
  endurance: Stat | number;
  injuries?: unknown[];
}

export function deriveVitality(input: VitalityInput): Vitality {
  const end = typeof input.endurance === 'number' ? input.endurance : input.endurance.value;
  const max = Math.round(
    VITALITY_FLOOR + (clamp01((end - 10) / 90) * (VITALITY_CEILING - VITALITY_FLOOR)),
  );

  const { state } = input;
  const penalties: VitalityPenalty[] = [];

  const days = state.consecutiveTrainingDays;
  const grind = GRIND_COST[Math.min(6, days)] ?? 0;
  if (grind > 0) {
    penalties.push({
      label: `${days} training days in a row`,
      points: grind,
      note: 'Consecutive days cost more the longer the run gets. One rest day resets it.',
    });
  }

  if (state.recentSkippedWarmups > 0) {
    penalties.push({
      label: `${state.recentSkippedWarmups} warmup${state.recentSkippedWarmups === 1 ? '' : 's'} skipped this week`,
      points: state.recentSkippedWarmups * SKIPPED_WARMUP_COST,
      note: 'Only sessions in the last seven days count, so this clears itself.',
    });
  }

  const injuries = input.injuries?.length ?? 0;
  if (injuries > 0) {
    penalties.push({
      label: `${injuries} active injur${injuries === 1 ? 'y' : 'ies'}`,
      points: injuries * INJURY_COST,
      note: 'Marking an injury healed in Settings clears this.',
    });
  }

  const raw = penalties.reduce((sum, p) => sum + p.points, 0);
  const buff = state.restedWithin24h && raw > 0;
  const damage = buff ? raw / REST_RELIEF : raw;
  const current = Math.max(0, Math.min(max, Math.round(max - damage)));
  const fraction = max === 0 ? 0 : current / max;

  return {
    max,
    current,
    fraction,
    state: bandOf(fraction),
    headline: HEADLINE[bandOf(fraction)],
    penalties,
    ...(buff
      ? {
          buff: {
            label: 'Rested in the last 24 hours',
            factor: REST_RELIEF,
            note: `Logging a rest day cuts the damage by a third while it lasts.`,
          },
        }
      : {}),
  };
}

function bandOf(fraction: number): VitalityState {
  if (fraction >= 0.85) return 'fresh';
  if (fraction >= 0.6) return 'worked';
  if (fraction >= 0.3) return 'tired';
  return 'cooked';
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
