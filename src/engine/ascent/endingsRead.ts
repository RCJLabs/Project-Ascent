/**
 * How your runs end — the reading (PLAN.md M214).
 *
 * Split from `endings.ts`, which holds the tally, because that one is on the
 * boot path through `db/game.ts` and this one needs the spawn weights. See
 * the note there: merging them puts the arcade's whole tuning table into the
 * first load of an app most of whose screens are not a game.
 *
 * ## The statistic is a ratio, not a count
 *
 * The page's own instructions claim **"Rocks end the run; the small fast
 * ones are the ones that get you"** — and until this, nothing had checked
 * it. A raw tally would not check it either: rocks are 60% of what spawns
 * and debris 15% (`SPAWN.obstacles`), so rocks would top a count of deaths
 * even if they were the easiest thing on the wall.
 *
 * What answers the question is **share of deaths against share of spawns**.
 * Debris at 15% of the wall ending 31% of runs is twice as dangerous as it
 * is common; rocks at 60% ending 64% are doing no more than their share.
 * The instruction turns out to be a claim the app can now confirm or
 * contradict, per climber.
 *
 * ## One tally, not one per mode
 *
 * Free Solo is faster and has one life, so its deaths are not the same
 * event. They are pooled anyway: this is a reading about the climber rather
 * than about a mode, and a climber who mostly plays Free Solo should get an
 * answer about the game they actually play rather than an empty second
 * table. Recorded here so the next person knows it was a choice.
 */

import { SPAWN } from './config';
import type { Endings } from './endings';
import type { ObstacleKind } from './game';

/**
 * Below this, a pattern is a coincidence with a percentage sign on it.
 *
 * Ten rather than three, because the rarest obstacle is 15% of the wall:
 * at three runs a single unlucky one reads as *"debris ends a third of your
 * runs"*. The same house rule as `ENOUGH_SENDS` and `ENOUGH_TRIES`.
 */
export const ENOUGH_ENDINGS = 10;

/** How far ahead of its own share a kind must run before it is worth naming. */
export const DANGEROUS = 1.25;

export const ENDING_LABELS: Record<ObstacleKind, string> = {
  rock: 'Rocks',
  boulder: 'Boulders',
  debris: 'Falling debris',
};

/** Share of spawned obstacles, per kind, from the one weight table. */
export function spawnShares(): Record<ObstacleKind, number> {
  const total = SPAWN.obstacles.reduce((sum, [, weight]) => sum + weight, 0);
  const out = { rock: 0, boulder: 0, debris: 0 };
  for (const [kind, weight] of SPAWN.obstacles) out[kind] = weight / total;
  return out;
}

export interface EndingShare {
  kind: ObstacleKind;
  label: string;
  deaths: number;
  /** Share of the runs counted, 0..1. */
  share: number;
  /** Share of the obstacles that spawn, 0..1. */
  spawnShare: number;
  /** `share / spawnShare`. Above one is worse than its share of the wall. */
  ratio: number;
}

export interface EndingsReading {
  counted: number;
  averageMetres: number;
  /** Every kind, worst first. */
  kinds: EndingShare[];
  /** The one furthest ahead of its share, or null when nothing is. */
  worst: EndingShare | null;
}

/** Null until there are enough endings for a share to mean anything. */
export function readEndings(endings: Endings): EndingsReading | null {
  if (endings.counted < ENOUGH_ENDINGS) return null;
  const spawn = spawnShares();
  const kinds: EndingShare[] = (Object.keys(ENDING_LABELS) as ObstacleKind[]).map((kind) => {
    const deaths = endings[kind];
    const share = deaths / endings.counted;
    const spawnShare = spawn[kind];
    return { kind, label: ENDING_LABELS[kind], deaths, share, spawnShare, ratio: share / spawnShare };
  });
  kinds.sort((a, b) => b.ratio - a.ratio || b.deaths - a.deaths);
  const top = kinds[0]!;
  return {
    counted: endings.counted,
    averageMetres: endings.metres / endings.counted,
    kinds,
    worst: top.ratio >= DANGEROUS ? top : null,
  };
}

const percent = (share: number): string => `${Math.round(share * 100)}%`;

/**
 * The reading, in one sentence.
 *
 * It answers the instruction rather than reciting the table: the climber
 * was told the small fast ones get you, and this says whether that is true
 * of their own runs.
 */
export function describeEndings(reading: EndingsReading): string {
  const { worst } = reading;
  if (worst === null) {
    const most = reading.kinds.reduce((a, b) => (b.deaths > a.deaths ? b : a));
    return `${most.label} end most of your runs, and are most of the wall. Nothing is getting you more than its share.`;
  }
  const tail =
    worst.kind === 'debris'
      ? ' The small fast ones really are the ones that get you.'
      : '';
  return `${worst.label} are ${percent(worst.spawnShare)} of what spawns and end ${percent(worst.share)} of your runs.${tail}`;
}
