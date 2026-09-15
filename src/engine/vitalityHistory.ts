/**
 * Vitality over time (PLAN.md M201).
 *
 * `vitality.ts` says its job is to *"make the cost of grinding legible"*,
 * and the app showed one number: today's. Three weeks of running cooked
 * read exactly like one bad Tuesday, which is the half of the cost that
 * matters — a climber grinding themselves down does it gradually and the
 * only signal was a bar that had always looked like that.
 *
 * **Nothing new is stored.** Vitality is a pure function of three facts
 * about a day, and this walks the log once to work them out for each of the
 * last `days` and calls the same function per day. One implementation of
 * the concept, which is the rule `deriveVitality` already lives by.
 *
 * **Two things are held still across the window, both deliberately.** The
 * endurance stat sets the ceiling and is read as it is today: recomputing
 * the stats per day means re-deriving the whole climber per day, which is
 * the cost this module exists to avoid, and END moves over months rather
 * than days. And injuries count from the day they were logged — the live
 * list is *what is wrong now* (M177 moved healed ones elsewhere), so a
 * history can honestly say "this was already logged by then" and not "this
 * was still open then".
 */

import { addDays, daysBetween } from './dates';
import { isRestSession } from './rest';
import { deriveVitality, type Vitality, type VitalityState } from './vitality';
import type { Injury } from '@/store/profile';
import type { Session } from '@/db/sessions';
import type { Stat } from './stats';

/** A month, which is long enough for a grind to be visible as a shape. */
export const HISTORY_DAYS = 30;

export interface VitalityDay {
  date: string;
  current: number;
  max: number;
  fraction: number;
  state: VitalityState;
}

export interface VitalityHistoryInput {
  sessions: readonly Session[];
  injuries?: readonly Injury[];
  endurance: Stat | number;
  restBonus?: number;
  to: string;
  days?: number;
}

export interface VitalityHistory {
  days: VitalityDay[];
  /** The worst band the window reached, and how many days sat in it. */
  low: { state: VitalityState; days: number };
  /** Days spent at `cooked` or `tired`, which is the number the sentence uses. */
  under: number;
}

const RANK: Record<VitalityState, number> = { fresh: 0, worked: 1, tired: 2, cooked: 3 };

/**
 * The window, day by day. Empty when there is nothing logged inside it —
 * an axis with no marks on it says less than no axis.
 */
export function vitalityHistory(input: VitalityHistoryInput): VitalityHistory {
  const span = input.days ?? HISTORY_DAYS;
  const first = addDays(input.to, -(span - 1));

  // One pass. `trained` and `rested` are date sets rather than counts
  // because the three facts are all questions about which days are in them.
  const trained = new Set<string>();
  const rested = new Set<string>();
  const skippedWarmup: string[] = [];
  for (const session of input.sessions) {
    if (session.completed !== true) continue;
    if (isRestSession(session)) {
      rested.add(session.date);
      continue;
    }
    trained.add(session.date);
    if (session.warmup !== true) skippedWarmup.push(session.date);
  }

  const days: VitalityDay[] = [];
  for (let i = 0; i < span; i += 1) {
    const date = addDays(first, i);

    // The same walk `deriveConsecutiveDays` makes, from this day back.
    let run = 0;
    let cursor = trained.has(date) ? date : addDays(date, -1);
    while (trained.has(cursor)) {
      run += 1;
      cursor = addDays(cursor, -1);
    }

    const vitality: Vitality = deriveVitality({
      state: {
        consecutiveTrainingDays: run,
        recentSkippedWarmups: skippedWarmup.filter((d) => {
          const ago = daysBetween(d, date);
          return ago >= 0 && ago <= 7;
        }).length,
        restedWithin24h: rested.has(date) || rested.has(addDays(date, -1)),
      },
      endurance: input.endurance,
      injuries: (input.injuries ?? []).filter((injury) => injury.since <= date),
      ...(input.restBonus !== undefined ? { restBonus: input.restBonus } : {}),
    });

    days.push({
      date,
      current: vitality.current,
      max: vitality.max,
      fraction: vitality.fraction,
      state: vitality.state,
    });
  }

  const worst = days.reduce<VitalityState>(
    (low, d) => (RANK[d.state] > RANK[low] ? d.state : low),
    'fresh',
  );

  return {
    days,
    low: { state: worst, days: days.filter((d) => d.state === worst).length },
    under: days.filter((d) => RANK[d.state] >= RANK.tired).length,
  };
}

/**
 * What the window amounts to, or null when it amounts to nothing.
 *
 * Null rather than *"you were fresh"*: a climber who trained twice this
 * month has a flat green line and no story, and a sentence claiming one
 * would be the app talking for the sake of it.
 */
export function describeVitalityHistory(history: VitalityHistory): string | null {
  const { under, days } = history;
  if (days.length === 0 || under === 0) return null;
  const run = longestRun(days);
  if (run >= 5) {
    return `${run} days in a row below Worked in the last ${days.length} — that is a stretch rather than a session.`;
  }
  return `${under} of the last ${days.length} days below Worked, in runs of ${run} or fewer.`;
}

function longestRun(days: readonly VitalityDay[]): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    if (RANK[day.state] >= RANK.tired) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}
