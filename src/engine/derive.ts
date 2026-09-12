/**
 * The one place that reads raw sessions (PLAN.md §2, §8.1).
 *
 * Everything downstream — progress charts, load management, stats, the
 * game layer in M4 — consumes `ClimberState` rather than walking the logs
 * itself. The prototype had roughly fifteen systems independently
 * re-deriving from a global `logs` object, which is how the same number
 * came to be computed three different ways (AUDIT.md §8).
 *
 * Pure: sessions in, state out. No storage, no React, no clock beyond the
 * `today` argument, so every number is reproducible in a test.
 */

import { getDrill } from '@/content/drills';
import type { Climb, Session } from '@/db/sessions';
import { gradeOrdinal, maxGrade, type GradeScale } from './grades';
import { addDays, daysBetween, startOfWeek, today as todayKey } from './dates';

export interface GradeTally {
  /** Canonical grade → number sent. */
  sends: Record<string, number>;
  attempts: Record<string, number>;
  totalSends: number;
  totalAttempts: number;
  best: string | null;
  bestOrdinal: number;
}

/**
 * One climb into a tally (PLAN.md M106).
 *
 * Lifted out of `deriveClimberState` so the per-mode ladders can be built
 * from the same code rather than from a second reading of what a send is.
 * Note that it moves `best`, so a caller that needs the best *before* this
 * climb has to read it first — `deriveClimberState` does, for the personal
 * records.
 */
export function addClimb(tally: GradeTally, climb: Climb): void {
  const bucket = climb.result === 'send' ? tally.sends : tally.attempts;
  bucket[climb.grade] = (bucket[climb.grade] ?? 0) + climb.count;
  if (climb.result !== 'send') {
    tally.totalAttempts += climb.count;
    return;
  }
  tally.totalSends += climb.count;
  const ord = gradeOrdinal(climb.scale, climb.grade);
  if (ord > tally.bestOrdinal) {
    tally.bestOrdinal = ord;
    tally.best = climb.grade;
  }
}

export interface DayLoad {
  date: string;
  /** sRPE: session RPE × duration in hours. */
  load: number;
  deload: boolean;
}

export type AcwrZone = 'detraining' | 'optimal' | 'caution' | 'danger' | 'unknown';

/**
 * The zone boundaries, named once.
 *
 * Exported because the injury guide states them in prose and a test asserts
 * the two agree. A guide that says 1.3 while the app draws the line at 1.4
 * is worse than a guide that says nothing.
 */
export const ACWR_BOUNDS = {
  optimalFrom: 0.8,
  optimalTo: 1.3,
  cautionTo: 1.5,
} as const;

export interface LoadState {
  daily: DayLoad[];
  /** Rolling 7-day load. */
  acute: number;
  /** 28-day load divided by four — a weekly-equivalent baseline. */
  chronic: number;
  /** acute ÷ chronic, or null before there is enough history. */
  acwr: number | null;
  zone: AcwrZone;
  /** True when the current week is a planned deload, which explains a dip. */
  inPlannedDeload: boolean;
  /** Days of history available — ACWR is meaningless below ~21. */
  daysOfHistory: number;
}

export interface PersonalRecord {
  scale: GradeScale;
  grade: string;
  date: string;
}

export interface ClimberState {
  totalSessions: number;
  completedSessions: number;
  restSessions: number;
  /** Completed sessions in the last 30 days. */
  recentSessions: number;
  sessionsByType: Record<string, number>;
  boulder: GradeTally;
  sport: GradeTally;
  load: LoadState;
  /** Consecutive weeks meeting the weekly session target. */
  streakWeeks: number;
  /** Consecutive days trained without a rest day, right now. */
  consecutiveTrainingDays: number;
  drillsCompleted: number;
  warmupRate: number;
  totalMinutes: number;
  personalRecords: PersonalRecord[];
  /** Distinct days logged outdoors. */
  outdoorDays: number;
  /** Sends by ascent style, for technique credit. */
  styleSends: { onsight: number; flash: number };
  /** The longest run of target-meeting weeks ever, not just the current one. */
  longestStreakWeeks: number;
  /** Completed drills by category — the skill trees and bounties both read
   *  this, and neither should walk the log itself to get it. */
  drillsByCategory: Record<string, number>;
  /** Training sessions in the last week that skipped the warmup. */
  recentSkippedWarmups: number;
  /** A rest day logged today or yesterday. */
  restedWithin24h: boolean;
}

/**
 * A fresh tally. Exported so `ladders.ts` can build the same shape per mode
 * rather than keeping a second definition of what a tally is.
 */
export const emptyTally = (): GradeTally => ({
  sends: {},
  attempts: {},
  totalSends: 0,
  totalAttempts: 0,
  best: null,
  bestOrdinal: -1,
});

export interface DeriveOptions {
  /** Reference date; defaults to the real today. Injected so tests are stable. */
  today?: string;
  /** Sessions per week the active program asks for, for streak counting. */
  weeklyTarget?: number;
  /** Dates inside a planned deload week. */
  deloadDates?: Set<string>;
}

export function deriveClimberState(sessions: Session[], options: DeriveOptions = {}): ClimberState {
  const today = options.today ?? todayKey();
  const weeklyTarget = options.weeklyTarget ?? 3;

  const completed = sessions
    .filter((s) => s.completed)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const boulder = emptyTally();
  const sport = emptyTally();
  const sessionsByType: Record<string, number> = {};
  const personalRecords: PersonalRecord[] = [];
  const seenBoulder = new Set<string>();
  const seenSport = new Set<string>();

  let restSessions = 0;
  let drillsCompleted = 0;
  let warmups = 0;
  let nonRest = 0;
  let totalMinutes = 0;
  let recentSessions = 0;
  let onsight = 0;
  let flash = 0;
  let recentSkippedWarmups = 0;
  let restedWithin24h = false;
  const outdoorDates = new Set<string>();
  const drillsByCategory: Record<string, number> = {};

  const loadByDate = new Map<string, { load: number; deload: boolean }>();
  let earliestLoad: string | null = null;

  for (const session of completed) {
    const isRest = session.restChecklist !== undefined && session.climbs.length === 0;
    if (isRest) restSessions++;
    else nonRest++;

    if (session.sessionTypeId) {
      sessionsByType[session.sessionTypeId] = (sessionsByType[session.sessionTypeId] ?? 0) + 1;
    }
    if (session.drillDone) {
      drillsCompleted++;
      const category = session.drillId ? getDrill(session.drillId)?.category : undefined;
      if (category) drillsByCategory[category] = (drillsByCategory[category] ?? 0) + 1;
    }
    if (session.warmup) warmups++;
    if (session.mode === 'outdoor' && !isRest) outdoorDates.add(session.date);

    const daysAgo = daysBetween(session.date, today);
    if (isRest && daysAgo >= 0 && daysAgo <= 1) restedWithin24h = true;
    if (!isRest && !session.warmup && daysAgo >= 0 && daysAgo <= 7) recentSkippedWarmups++;
    totalMinutes += session.durationMin ?? 0;
    if (daysBetween(session.date, today) <= 30 && daysBetween(session.date, today) >= 0) {
      recentSessions++;
    }

    // sRPE training load. Deload sessions are *included* — a lighter week is
    // genuinely lighter, and the flag is used to explain the dip rather than
    // to hide it. The prototype excluded them, which made a planned deload
    // read as detraining.
    const load = (session.rpe ?? 0) * ((session.durationMin ?? 0) / 60);
    if (load > 0) {
      const existing = loadByDate.get(session.date);
      loadByDate.set(session.date, {
        load: (existing?.load ?? 0) + load,
        deload: existing?.deload || session.deload === true,
      });
      if (earliestLoad === null || session.date < earliestLoad) earliestLoad = session.date;
    }

    for (const climb of session.climbs) {
      const tally = climb.scale === 'V' ? boulder : sport;
      // Read before the climb goes in: a personal record is a send that beat
      // the best *so far*, and `addClimb` moves the best. Getting this the
      // other way round silently stops recording records at all.
      const bestBefore = tally.bestOrdinal;
      addClimb(tally, climb);
      if (climb.result === 'send') {
        if (climb.style === 'onsight') onsight += climb.count;
        else if (climb.style === 'flash') flash += climb.count;
        // First send of a grade on its own ladder is a personal record.
        const seen = climb.scale === 'V' ? seenBoulder : seenSport;
        if (!seen.has(climb.grade)) {
          seen.add(climb.grade);
          const ord = gradeOrdinal(climb.scale, climb.grade);
          if (ord > bestBefore) {
            personalRecords.push({ scale: climb.scale, grade: climb.grade, date: session.date });
          }
        }
      }
    }
  }

  boulder.best = maxGrade('V', Object.keys(boulder.sends));
  boulder.bestOrdinal = boulder.best ? gradeOrdinal('V', boulder.best) : -1;
  sport.best = maxGrade('YDS', Object.keys(sport.sends));
  sport.bestOrdinal = sport.best ? gradeOrdinal('YDS', sport.best) : -1;

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    restSessions,
    recentSessions,
    sessionsByType,
    boulder,
    sport,
    load: deriveLoad({ byDate: loadByDate, earliest: earliestLoad }, today, options.deloadDates ?? new Set()),
    streakWeeks: deriveStreak(completed, today, weeklyTarget),
    longestStreakWeeks: deriveLongestStreak(completed, weeklyTarget),
    outdoorDays: outdoorDates.size,
    drillsByCategory,
    recentSkippedWarmups,
    restedWithin24h,
    styleSends: { onsight, flash },
    consecutiveTrainingDays: deriveConsecutiveDays(completed, today),
    drillsCompleted,
    warmupRate: nonRest === 0 ? 0 : warmups / nonRest,
    totalMinutes,
    personalRecords,
  };
}

/** Training days inside the 28-day window before a chronic baseline means
 *  anything — roughly a session and a half a week. */
const MIN_CHRONIC_DAYS = 6;

/** sRPE for one session: RPE × hours. Zero when either is missing. */
export function sessionLoad(session: Session): number {
  return (session.rpe ?? 0) * ((session.durationMin ?? 0) / 60);
}

export interface LoadIndex {
  byDate: Map<string, { load: number; deload: boolean }>;
  /**
   * The earliest day carrying load, or null for an empty log.
   *
   * Kept here because the alternative was recomputing it inside every call
   * to `loadStateAt` — which sorted every key in the map to read the first
   * one. That is O(n log n) per call, `deriveXp` calls it once per session,
   * and the result was the app's only superlinear derivation: measured at
   * 7.3ms for one year of logs, 43.2ms for five and 106.9ms for ten, on
   * every session write.
   */
  earliest: string | null;
}

/**
 * Daily training load, keyed by date.
 *
 * Exported so a caller can ask for the load state *as of* an arbitrary date
 * — the economy prices a session against the load you were carrying when
 * you did it, not the load you are carrying today.
 */
export function buildLoadIndex(sessions: Session[]): LoadIndex {
  const byDate = new Map<string, { load: number; deload: boolean }>();
  let earliest: string | null = null;
  for (const session of sessions) {
    if (!session.completed) continue;
    const load = sessionLoad(session);
    if (load <= 0) continue;
    const existing = byDate.get(session.date);
    byDate.set(session.date, {
      load: (existing?.load ?? 0) + load,
      deload: existing?.deload || session.deload === true,
    });
    if (earliest === null || session.date < earliest) earliest = session.date;
  }
  return { byDate, earliest };
}

export function loadStateAt(
  index: LoadIndex,
  date: string,
  deloadDates: Set<string> = new Set(),
): LoadState {
  return deriveLoad(index, date, deloadDates);
}

/**
 * `YYYY-MM-DD` as a day number, without constructing a Date.
 *
 * Howard Hinnant's days-from-civil. It exists because the 28-day window
 * below was the app's single most expensive operation: `deriveXp` prices
 * every session against the load it was done under, and generating those
 * 28 dates with `addDays` meant 43,680 Date constructions and ISO string
 * formats for a ten-year log — 46.6ms of a 59.5ms derivation, measured.
 */
function dayNumber(key: string): number {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const year = y - (m <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yoe = year - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** One day's standing in the load model. */
export interface LoadPoint {
  date: string;
  /** acute ÷ chronic, or null before there is enough history to mean it. */
  acwr: number | null;
  zone: AcwrZone;
  /** Rolling 7-day load. */
  acute: number;
  /** 28-day load ÷ 4 — a weekly-equivalent baseline. */
  chronic: number;
  /** A planned deload day sits inside the acute window. */
  deload: boolean;
}

/**
 * The load standing on each of `dates`, which must be ascending.
 *
 * One pass with a sliding window rather than one 28-day walk per date. The
 * per-date version is still there for callers that need a single answer or
 * a full `LoadState`; this is for the callers that ask about every day in a
 * log at once, and turns that from 46.6ms into a few.
 *
 * `zonesFor` is this with everything but the zone thrown away. It was the
 * original, and the chart in M25 needed the *value* — two sliding windows
 * over the same data would be two chances for the number under the chart to
 * disagree with the number in the card.
 */
export function loadSeries(index: LoadIndex, dates: readonly string[]): LoadPoint[] {
  const entries = [...index.byDate.entries()]
    .map(([date, entry]) => ({ day: dayNumber(date), load: entry.load, deload: entry.deload }))
    .sort((a, b) => a.day - b.day);

  const earliestDay = index.earliest === null ? null : dayNumber(index.earliest);

  let hi = 0; // first entry not yet inside the window
  let lo28 = 0;
  let lo7 = 0;
  let chronic = 0;
  let chronicDays = 0;
  let acute = 0;
  let deloadDays = 0;

  return dates.map((date) => {
    const today = dayNumber(date);

    while (hi < entries.length && entries[hi]!.day <= today) {
      const entry = entries[hi]!;
      chronic += entry.load;
      if (entry.load > 0) chronicDays += 1;
      acute += entry.load;
      if (entry.deload) deloadDays += 1;
      hi += 1;
    }
    while (lo28 < hi && entries[lo28]!.day < today - 27) {
      const entry = entries[lo28]!;
      chronic -= entry.load;
      if (entry.load > 0) chronicDays -= 1;
      lo28 += 1;
    }
    while (lo7 < hi && entries[lo7]!.day < today - 6) {
      const entry = entries[lo7]!;
      acute -= entry.load;
      if (entry.deload) deloadDays -= 1;
      lo7 += 1;
    }

    const daysOfHistory = earliestDay === null || earliestDay > today ? 0 : today - earliestDay + 1;
    const baseline = chronic / 4;
    const deload = deloadDays > 0;
    if (daysOfHistory < 21 || chronicDays < MIN_CHRONIC_DAYS || baseline <= 0) {
      return { date, acwr: null, zone: 'unknown', acute, chronic: baseline, deload };
    }

    const acwr = acute / baseline;
    const zone: AcwrZone =
      acwr < ACWR_BOUNDS.optimalFrom
        ? deload
          ? 'optimal'
          : 'detraining'
        : acwr <= ACWR_BOUNDS.optimalTo
          ? 'optimal'
          : acwr <= ACWR_BOUNDS.cautionTo
            ? 'caution'
            : 'danger';
    return { date, acwr, zone, acute, chronic: baseline, deload };
  });
}

/** Just the zones, for the hot path that only wants those. */
export function zonesFor(index: LoadIndex, dates: readonly string[]): AcwrZone[] {
  return loadSeries(index, dates).map((point) => point.zone);
}

/**
 * Just the zone, for callers that only want the zone.
 *
 * `deriveXp` prices every session against the load it was done under, and
 * was calling `loadStateAt` to read one field off a full `LoadState` — a
 * 28-element array of objects, each built with a fresh `Date` and a string
 * format. At ten years of logs that is forty-four thousand Date objects per
 * derivation, for four bytes of answer.
 */
export function zoneAt(index: LoadIndex, date: string): AcwrZone {
  let acute = 0;
  let chronic = 0;
  let chronicDays = 0;
  let inPlannedDeload = false;

  for (let i = 0; i < 28; i += 1) {
    const day = addDays(date, -i);
    const entry = index.byDate.get(day);
    if (entry === undefined) continue;
    chronic += entry.load;
    if (entry.load > 0) chronicDays += 1;
    if (i < 7) {
      acute += entry.load;
      if (entry.deload) inPlannedDeload = true;
    }
  }

  const { earliest } = index;
  const daysOfHistory = earliest === null || earliest > date ? 0 : daysBetween(earliest, date) + 1;
  const baseline = chronic / 4;
  if (daysOfHistory < 21 || chronicDays < MIN_CHRONIC_DAYS || baseline <= 0) return 'unknown';

  const acwr = acute / baseline;
  if (acwr < ACWR_BOUNDS.optimalFrom) return inPlannedDeload ? 'optimal' : 'detraining';
  if (acwr <= ACWR_BOUNDS.optimalTo) return 'optimal';
  if (acwr <= ACWR_BOUNDS.cautionTo) return 'caution';
  return 'danger';
}

function deriveLoad(
  index: LoadIndex,
  today: string,
  deloadDates: Set<string>,
): LoadState {
  const loadByDate = index.byDate;
  const daily: DayLoad[] = [];
  for (let i = 27; i >= 0; i--) {
    const date = addDays(today, -i);
    const entry = loadByDate.get(date);
    daily.push({
      date,
      load: entry?.load ?? 0,
      deload: entry?.deload === true || deloadDates.has(date),
    });
  }

  const acute = daily.slice(-7).reduce((sum, d) => sum + d.load, 0);
  const chronicTotal = daily.reduce((sum, d) => sum + d.load, 0);
  const chronic = chronicTotal / 4;

  // The earliest day is a property of the index, not of this call: the
  // minimum over `d <= today` is the global minimum whenever that minimum
  // is itself on or before today, and zero otherwise. Reading it off the
  // index is what turns this from O(n log n) per call into O(1).
  const { earliest } = index;
  const daysOfHistory =
    earliest === null || earliest > today ? 0 : daysBetween(earliest, today) + 1;
  const chronicDays = daily.filter((d) => d.load > 0).length;

  // ACWR needs a real chronic baseline, which means both a long enough
  // window and enough sessions inside it. Three weeks of calendar with two
  // sessions in it produces arithmetic like 4.0 — true division, no
  // meaning — so density is a condition, not just span.
  const ready = daysOfHistory >= 21 && chronicDays >= MIN_CHRONIC_DAYS && chronic > 0;
  const acwr = ready ? acute / chronic : null;
  const inPlannedDeload = daily.slice(-7).some((d) => d.deload);

  let zone: AcwrZone = 'unknown';
  if (acwr !== null) {
    if (acwr < ACWR_BOUNDS.optimalFrom) zone = inPlannedDeload ? 'optimal' : 'detraining';
    else if (acwr <= ACWR_BOUNDS.optimalTo) zone = 'optimal';
    else if (acwr <= ACWR_BOUNDS.cautionTo) zone = 'caution';
    else zone = 'danger';
  }

  return { daily, acute, chronic, acwr, zone, inPlannedDeload, daysOfHistory };
}

/** The longest run of target-meeting weeks anywhere in the history. */
function deriveLongestStreak(completed: Session[], target: number): number {
  const byWeek = new Map<string, number>();
  for (const session of completed) {
    const week = startOfWeek(session.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  }
  const weeks = [...byWeek.entries()]
    .filter(([, count]) => count >= target)
    .map(([week]) => week)
    .sort();

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const week of weeks) {
    run = previous !== null && addDays(previous, 7) === week ? run + 1 : 1;
    previous = week;
    if (run > best) best = run;
  }
  return best;
}

/** Consecutive Sunday-aligned weeks that met the target, counting back. */
function deriveStreak(completed: Session[], today: string, target: number): number {
  const byWeek = new Map<string, number>();
  for (const s of completed) {
    const isRest = s.restChecklist !== undefined && s.climbs.length === 0;
    if (isRest) continue;
    const week = startOfWeek(s.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1);
  }
  let streak = 0;
  // The current week is still in progress, so it never breaks a streak.
  let cursor = startOfWeek(today);
  if ((byWeek.get(cursor) ?? 0) >= target) streak++;
  cursor = addDays(cursor, -7);
  while ((byWeek.get(cursor) ?? 0) >= target) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

/** Training days in an unbroken run ending today or yesterday. */
function deriveConsecutiveDays(completed: Session[], today: string): number {
  const trained = new Set(
    completed.filter((s) => !(s.restChecklist !== undefined && s.climbs.length === 0)).map((s) => s.date),
  );
  let count = 0;
  let cursor = trained.has(today) ? today : addDays(today, -1);
  while (trained.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
