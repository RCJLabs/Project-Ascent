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

import type { Session } from '@/db/sessions';
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

export interface DayLoad {
  date: string;
  /** sRPE: session RPE × duration in hours. */
  load: number;
  deload: boolean;
}

export type AcwrZone = 'detraining' | 'optimal' | 'caution' | 'danger' | 'unknown';

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
}

const EMPTY_TALLY = (): GradeTally => ({
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

  const boulder = EMPTY_TALLY();
  const sport = EMPTY_TALLY();
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

  const loadByDate = new Map<string, { load: number; deload: boolean }>();

  for (const session of completed) {
    const isRest = session.restChecklist !== undefined && session.climbs.length === 0;
    if (isRest) restSessions++;
    else nonRest++;

    if (session.sessionTypeId) {
      sessionsByType[session.sessionTypeId] = (sessionsByType[session.sessionTypeId] ?? 0) + 1;
    }
    if (session.drillDone) drillsCompleted++;
    if (session.warmup) warmups++;
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
    }

    for (const climb of session.climbs) {
      const tally = climb.scale === 'V' ? boulder : sport;
      const bucket = climb.result === 'send' ? tally.sends : tally.attempts;
      bucket[climb.grade] = (bucket[climb.grade] ?? 0) + climb.count;
      if (climb.result === 'send') {
        tally.totalSends += climb.count;
        // First send of a grade on its own ladder is a personal record.
        const seen = climb.scale === 'V' ? seenBoulder : seenSport;
        if (!seen.has(climb.grade)) {
          seen.add(climb.grade);
          const ord = gradeOrdinal(climb.scale, climb.grade);
          if (ord > tally.bestOrdinal) {
            personalRecords.push({ scale: climb.scale, grade: climb.grade, date: session.date });
          }
        }
      } else {
        tally.totalAttempts += climb.count;
      }
      if (climb.result === 'send') {
        const ord = gradeOrdinal(climb.scale, climb.grade);
        if (ord > tally.bestOrdinal) {
          tally.bestOrdinal = ord;
          tally.best = climb.grade;
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
    load: deriveLoad(loadByDate, today, options.deloadDates ?? new Set()),
    streakWeeks: deriveStreak(completed, today, weeklyTarget),
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

export type LoadIndex = Map<string, { load: number; deload: boolean }>;

/**
 * Daily training load, keyed by date.
 *
 * Exported so a caller can ask for the load state *as of* an arbitrary date
 * — the economy prices a session against the load you were carrying when
 * you did it, not the load you are carrying today.
 */
export function buildLoadIndex(sessions: Session[]): LoadIndex {
  const index: LoadIndex = new Map();
  for (const session of sessions) {
    if (!session.completed) continue;
    const load = sessionLoad(session);
    if (load <= 0) continue;
    const existing = index.get(session.date);
    index.set(session.date, {
      load: (existing?.load ?? 0) + load,
      deload: existing?.deload || session.deload === true,
    });
  }
  return index;
}

export function loadStateAt(
  index: LoadIndex,
  date: string,
  deloadDates: Set<string> = new Set(),
): LoadState {
  return deriveLoad(index, date, deloadDates);
}

function deriveLoad(
  loadByDate: Map<string, { load: number; deload: boolean }>,
  today: string,
  deloadDates: Set<string>,
): LoadState {
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

  const dates = [...loadByDate.keys()].filter((d) => d <= today).sort();
  const daysOfHistory = dates.length === 0 ? 0 : daysBetween(dates[0]!, today) + 1;
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
    if (acwr < 0.8) zone = inPlannedDeload ? 'optimal' : 'detraining';
    else if (acwr <= 1.3) zone = 'optimal';
    else if (acwr <= 1.5) zone = 'caution';
    else zone = 'danger';
  }

  return { daily, acute, chronic, acwr, zone, inPlannedDeload, daysOfHistory };
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
