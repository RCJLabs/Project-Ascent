/**
 * What a day of Ascent pays (PLAN.md §5.11, §7).
 *
 * An arcade game lives on instant retries, so plays are never rationed —
 * rewards are. You can climb the wall all evening; the payout comes from
 * your best run of the day, and a logged rest day multiplies it. Training
 * days block nothing, the good paydays just happen to live on rest days,
 * which is the only nudge in the app that pushes toward doing less.
 *
 * Everything here is capped by the economy's game-lane rule, so a whole
 * day's play can never approach a session. That is enforced, not tuned.
 */

import { GAME_ACTION_CAP, unitsToXp } from '../economy';
import type { Mode } from './game';

/**
 * Where the distance and coin terms max out.
 *
 * The distance curve is a square root, not a line. Real runs cluster short —
 * a first attempt is a few hundred metres — and a linear curve pays those
 * one or two XP, which reads as an insult rather than a reward. The root
 * pays a beginner something real while still leaving the ceiling to skill.
 */
export const PAYOUT = {
  metresForMax: 5_000,
  maxMetresUnits: 0.025,
  coinsForMax: 40,
  maxCoinUnits: 0.01,
  freeSoloMultiplier: 2,
  restDayMultiplier: 1.5,
} as const;

export interface DailyRun {
  date: string;
  mode: Mode;
  metres: number;
  coins: number;
}

export interface PayoutLine {
  label: string;
  units: number;
}

export interface AscentPayout {
  units: number;
  xp: number;
  lines: PayoutLine[];
  /** True when the cap trimmed the total, so the UI can say so. */
  capped: boolean;
  restBoost: boolean;
}

export function payoutFor(run: DailyRun, restedToday: boolean): AscentPayout {
  const metresUnits =
    Math.min(1, Math.sqrt(Math.max(0, run.metres) / PAYOUT.metresForMax)) * PAYOUT.maxMetresUnits;
  const coinUnits = Math.min(
    PAYOUT.maxCoinUnits,
    (run.coins / PAYOUT.coinsForMax) * PAYOUT.maxCoinUnits,
  );

  const lines: PayoutLine[] = [
    { label: `Best run · ${run.metres.toLocaleString()} m`, units: metresUnits },
  ];
  if (coinUnits > 0) lines.push({ label: `${Math.round(run.coins)} coins`, units: coinUnits });

  let units = metresUnits + coinUnits;
  if (run.mode === 'freesolo') {
    const bonus = units * (PAYOUT.freeSoloMultiplier - 1);
    units += bonus;
    lines.push({ label: 'Free Solo ×2', units: bonus });
  }
  if (restedToday) {
    const bonus = units * (PAYOUT.restDayMultiplier - 1);
    units += bonus;
    lines.push({ label: 'Rest day ×1.5', units: bonus });
  }

  const capped = units > GAME_ACTION_CAP;
  const final = Math.min(units, GAME_ACTION_CAP);

  return {
    units: final,
    xp: unitsToXp(final),
    lines,
    capped,
    restBoost: restedToday,
  };
}

/**
 * The day's wall number, so a score can be quoted without a date.
 *
 * A fixed epoch rather than "days since you installed it" — the number has
 * to mean the same thing to two people comparing screenshots.
 */
export const WALL_EPOCH = '2026-01-01';

export function wallNumber(dateKey: string, epoch = WALL_EPOCH): number {
  const from = Date.parse(`${epoch}T00:00:00Z`);
  const to = Date.parse(`${dateKey}T00:00:00Z`);
  return Math.floor((to - from) / 86_400_000) + 1;
}
