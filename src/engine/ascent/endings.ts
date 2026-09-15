/**
 * How your runs end — the tally (PLAN.md M214).
 *
 * A run kept its height and forgot everything else. `ClimbedDay` is date,
 * metres, coins, mode and a tape; the simulation raised `{ kind: 'hit' }` on
 * every collision and the frame threw it away. So the app could not say a
 * single thing about *how you play* — the one genuine insight a daily arcade
 * game has to offer, and the only thing it did not keep.
 *
 * ## Why this is its own file
 *
 * **The budget.** `db/game.ts` is on the boot path — the ledger is read
 * before anything renders — so whatever this module imports lands in the
 * first load for every climber, whether or not they ever open the game. The
 * first version was one file and pulled `ascent/config` in behind it: the
 * whole arcade tuning table, 1.1KB gzipped, into the entry chunk, which
 * took the first load from 137.35KB to 138.47 and blew the 138.0 ceiling.
 *
 * So the **tally** lives here with no runtime imports at all, and the
 * **reading** — which needs the spawn weights — lives in `endingsRead.ts`,
 * which only the Ascent page imports and so only the Ascent chunk carries.
 * Do not merge them back.
 */

import type { ObstacleKind } from './game';

export interface Endings {
  rock: number;
  boulder: number;
  debris: number;
  /** Metres summed over the runs counted here, for the average. */
  metres: number;
  /**
   * Runs counted here — never `AscentRecords.runs`.
   *
   * That counter has been incrementing since long before any of this was
   * kept, so using it as the denominator would divide a handful of endings
   * by a lifetime of runs and report a percentage of nothing.
   */
  counted: number;
}

export const NO_ENDINGS: Endings = { rock: 0, boulder: 0, debris: 0, metres: 0, counted: 0 };

/** One ended run, folded in. A run that ended some other way is not one. */
export function recordEnding(endings: Endings, by: ObstacleKind, metres: number): Endings {
  return {
    ...endings,
    [by]: endings[by] + 1,
    metres: endings.metres + Math.max(0, metres),
    counted: endings.counted + 1,
  };
}
