import type { Project } from '@/db/projects';
import type { MetricEntry } from '@/db/metrics';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import { deriveStats, type StatId } from './stats';

/**
 * The same five stats, as they stood on an earlier day (PLAN.md M24).
 *
 * The radar's second shape. A shape on its own says what a climber is; two
 * shapes say what has been happening — and "everything went up a bit" and
 * "endurance went up while strength sat still" are different facts that the
 * bars could never show.
 *
 * Recomputed from the log rather than stored, which is the app's rule and
 * the right one here: a stored snapshot taken under an older formula would
 * compare today's stats against a different definition and call the
 * difference progress.
 */

export interface StatSnapshotInput {
  sessions: readonly Session[];
  metrics: readonly MetricEntry[];
  projects: readonly Project[];
  /** The day to stand on. Everything after it is ignored. */
  asOf: string;
}

export function statsAsOf(input: StatSnapshotInput): Record<StatId, number> {
  const sessions = input.sessions.filter((s) => s.date <= input.asOf);
  const state = deriveClimberState(sessions);
  const stats = deriveStats({
    state,
    metrics: input.metrics.filter((m) => m.date <= input.asOf),
    // A project counts once it was sent, and `sentDate` is written by
    // reconciliation rather than by hand. One sent without a date — only
    // possible from a backup older than that field — is left out rather than
    // credited to a past that cannot be dated.
    projects: input.projects.filter(
      (p) => p.status === 'sent' && p.sentDate !== undefined && p.sentDate <= input.asOf,
    ),
  });
  return {
    STR: stats.STR.value,
    END: stats.END.value,
    TEC: stats.TEC.value,
    MEN: stats.MEN.value,
    AGI: stats.AGI.value,
  };
}

/** How far back the comparison shape stands. */
export const COMPARE_DAYS = 182;

/**
 * Whether a past shape is worth drawing at all.
 *
 * A climber six weeks in has a "six months ago" of all-zeroes, and a ghost
 * pinned to the centre is not a comparison — it is a picture of the app not
 * having existed yet. Below this the radar draws one shape and says so.
 */
export const MIN_HISTORY_DAYS = 60;

export interface ComparisonInput {
  sessions: readonly Session[];
  metrics: readonly MetricEntry[];
  projects: readonly Project[];
  today: string;
}

export interface StatComparison {
  then: Record<StatId, number> | null;
  /** The day `then` stands on, when there is one. */
  asOf: string | null;
  /** Days of log behind the climber, for the "not yet" message. */
  historyDays: number;
}

export function compareStats(input: ComparisonInput): StatComparison {
  const dated = input.sessions.filter((s) => s.completed).map((s) => s.date);
  const earliest = dated.length === 0 ? null : dated.reduce((a, b) => (a < b ? a : b));
  const historyDays =
    earliest === null
      ? 0
      : Math.max(0, Math.round((Date.parse(input.today) - Date.parse(earliest)) / 86_400_000));

  if (historyDays < MIN_HISTORY_DAYS) return { then: null, asOf: null, historyDays };

  const asOf = addDays(input.today, -COMPARE_DAYS);
  return {
    then: statsAsOf({ ...input, asOf }),
    asOf,
    historyDays,
  };
}
