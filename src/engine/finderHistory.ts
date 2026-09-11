/**
 * The block just run, in the shape the finder can read (PLAN.md M101).
 *
 * Its own module rather than a function inside `finder.ts`, because
 * `finder.ts` is reached from `onboarding.ts` and therefore from the first
 * screens the app paints. Pulling `adherence` and its dependencies in behind
 * it would put a block-scoring engine in front of a climber who has not
 * logged anything — the shape M78 spent a milestone undoing for the program
 * bodies.
 *
 * **A block that is over, and only one.** "What should I run next" is asked
 * after something ends. A block still running is not a thing you are
 * choosing a successor for, and the one before last is a season ago.
 *
 * Pure: rows and sessions in, one small fact out.
 */

import type { Session } from '@/db/sessions';
import { getProgram } from '@/content/programs';
import { blockAdherence } from './adherence';
import { outcomeOf, rowWindow, sortBlocks, type BlockRecord } from './blocks';
import { daysBetween } from './dates';
import type { FinderHistory } from './finder';

/**
 * The newest block that has ended, with what the log says about how it went.
 *
 * Null when nothing has finished — which is the cold start, and the case the
 * finder has always handled. Nothing about the recommendation changes for a
 * climber with no history, by construction.
 */
export function lastBlockFor(
  rows: readonly BlockRecord[],
  sessions: readonly Session[],
  today: string,
): FinderHistory | null {
  // `sortBlocks` is newest first, which is the order every screen wants and
  // is not the order a `.at(-1)` reads — a test caught that immediately.
  const row = sortBlocks(rows).find((candidate) => outcomeOf(candidate, today) !== 'running');
  if (row === undefined) return null;

  const program = getProgram(row.programId);
  const measured =
    program && row.plan
      ? blockAdherence({
          program,
          startDate: row.startDate,
          plan: row.plan,
          sessions: [...sessions],
          today,
        })
      : null;

  return {
    programId: row.programId,
    daysSince: daysBetween(rowWindow(row).to, today),
    completed: outcomeOf(row, today) === 'completed',
    ...(measured ? { adherence: { done: measured.done, planned: measured.planned } } : {}),
  };
}
