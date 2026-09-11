/**
 * The day's wall, kept (PLAN.md M96).
 *
 * `AscentRecords.daily` held **one** record and overwrote it every day. The
 * game's own copy says everyone gets the same wall and that "a score is
 * comparable without anything leaving your phone" — and the app kept
 * nothing to compare it to.
 *
 * **What survived was an accident.** The rewards ledger writes one
 * `ascent:${date}` entry a day whose *label* reads "The Ascent · 1,063 m",
 * so the heights existed only as text inside a string written for a feed.
 * `recoverDays` reads them back out exactly once, on the way to a record
 * that stores the number as a number, and nothing reads that label again.
 */

import type { ClimbedDay, DayRecord, LedgerEntry } from '@/db/game';
import { addDays, daysBetween } from '../dates';

/**
 * A year. The Ascent is a daily game and a year is the unit it is played
 * in; a day is four small fields, so the whole history is smaller than one
 * tape.
 */
export const MAX_DAYS = 365;

/** The day's record, or null when that day was not climbed. */
export function dayRun(days: readonly DayRecord[], date: string): DayRecord | null {
  return days.find((d) => d.date === date) ?? null;
}

/**
 * Fold a run into the history, keeping the better of the two for its day.
 *
 * The tape travels with the height and only with it: a better run that
 * brought no tape — one past the move cap, or finished on yesterday's wall
 * — leaves the day with none rather than inheriting the old run's inputs,
 * which would put a ghost on the wall claiming a height it never climbed.
 *
 * Older days lose their tapes here rather than at read time, so the stored
 * blob is the small thing and not just the rendered one.
 */
export function recordDay(days: readonly DayRecord[], run: ClimbedDay): DayRecord[] {
  const existing = dayRun(days, run.date);
  // A recovered day is a best-effort reconstruction and a real recording
  // supersedes it outright, even a lower one: keeping the parsed height
  // beside the new run's tape would put a ghost on the wall claiming a
  // height it never climbed.
  const kept =
    existing === null || existing.recovered === true || run.metres > existing.metres ? run : existing;
  const merged = [...days.filter((d) => d.date !== run.date), kept].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const newest = merged[merged.length - 1]?.date;
  return merged
    .slice(-MAX_DAYS)
    .map((d) => (d.date === newest ? d : stripTape(d)));
}

function stripTape(day: DayRecord): DayRecord {
  if (day.recovered === true || day.tape === undefined) return day;
  const { tape: _tape, ...rest } = day;
  return rest;
}

/** "The Ascent · 1,063 m" → 1063. Null when the label is not one of those. */
export function heightFromLabel(label: string): number | null {
  const match = /^The Ascent · (.+) m$/.exec(label);
  if (!match) return null;
  // Heights are whole metres (`Math.floor`), so a localised one is groups
  // of ASCII digits joined by separators and nothing else. Anything that
  // does not have that shape — a locale with its own digits, a label with
  // a word in it — yields nothing, which is the right way to fail: a
  // number invented from a string is worse than a day left unrecovered.
  const raw = match[1]!;
  if (!/^[0-9]+(?:[,.\s'\u2019][0-9]+)*$/.test(raw)) return null;
  const value = Number(raw.replace(/[^0-9]/g, ''));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Days the ledger remembers and the record does not.
 *
 * Never overwrites a day already recorded: a real record knows the mode and
 * the coins, and a label knows a number.
 */
export function recoverDays(days: readonly DayRecord[], ledger: readonly LedgerEntry[]): DayRecord[] {
  const known = new Set(days.map((d) => d.date));
  const found: DayRecord[] = [];
  for (const entry of ledger) {
    if (entry.origin !== 'ascent' || known.has(entry.date)) continue;
    const metres = heightFromLabel(entry.label);
    if (metres === null) continue;
    known.add(entry.date);
    found.push({ date: entry.date, metres, recovered: true });
  }
  if (found.length === 0) return [...days];
  return [...days, ...found].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DAYS);
}

export interface AscentHistory {
  from: string;
  to: string;
  /** The days climbed inside the window, oldest first. */
  days: DayRecord[];
  /** Days in the window that were climbed. */
  played: number;
  /** Days in the window that were not. */
  missed: number;
  /**
   * Days climbed in a row, counting back from today.
   *
   * A streak survives today until today is over: missing the day you are
   * still in is not a miss, so the count may start at yesterday.
   */
  streak: number;
  best: DayRecord | null;
  /** Metres climbed across the window. */
  total: number;
}

export interface HistoryInput {
  days: readonly DayRecord[];
  to: string;
  /** Window length. Defaults to a month, which is what a grid can show. */
  window?: number;
}

export function ascentHistory(input: HistoryInput): AscentHistory {
  const window = input.window ?? 30;
  const earliest = addDays(input.to, -(window - 1));
  // Never further back than the first wall climbed: days before a climber
  // had the game are not walls they skipped, and a grid that draws them as
  // gaps says they were (PLAN.md M96, and the same clamp as M93's).
  const first = input.days.reduce<string | null>(
    (a, d) => (d.date <= input.to && (a === null || d.date < a) ? d.date : a),
    null,
  );
  const from = first !== null && first > earliest ? first : earliest;
  const days = input.days
    .filter((d) => d.date >= from && d.date <= input.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  const climbed = new Set(days.map((d) => d.date));
  let streak = 0;
  // From today when today was climbed, else from yesterday: the day you are
  // still in cannot have been missed yet.
  let cursor = climbed.has(input.to) ? input.to : addDays(input.to, -1);
  while (climbed.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const elapsed = Math.min(window, daysBetween(from, input.to) + 1);
  return {
    from,
    to: input.to,
    days,
    played: days.length,
    missed: elapsed - days.length,
    streak,
    best: days.reduce<DayRecord | null>((a, d) => (a === null || d.metres > a.metres ? d : a), null),
    total: days.reduce((sum, d) => sum + d.metres, 0),
  };
}

/**
 * The series, in one sentence. Null while there is nothing to compare — one
 * day's wall is a score, not a history.
 */
export function describeAscent(history: AscentHistory): string | null {
  if (history.played < 2) return null;

  const window = daysBetween(history.from, history.to) + 1;
  const lead = `${history.played} of the last ${window} walls, ${history.total.toLocaleString()} m in total.`;
  const best = `Your best was ${history.best!.metres.toLocaleString()} m.`;
  if (history.streak < 2) return `${lead} ${best}`;
  return `${lead} ${best} ${history.streak} days in a row.`;
}
