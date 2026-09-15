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
import type { Climb, Session, SessionMode } from '@/db/sessions';
import { gradeOrdinal, maxGrade, type GradeScale } from './grades';
import { addDays, daysBetween, startOfWeek, today as todayKey } from './dates';
import { isRestSession } from './rest';

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
 *
 * ## Which ACWR this is, decided rather than defaulted (PLAN.md M168)
 *
 * **The coupled form.** `acute` is the seven days ending today and `chronic`
 * is the twenty-eight days ending today divided by four — so the acute week
 * sits *inside* its own baseline, on both sides of the division. That is the
 * specific thing the method's critics name: the same load appears in the
 * numerator and the denominator, which induces correlation between them
 * independent of any relationship to injury. The uncoupled form — this week
 * against the twenty-one days *before* it — is the usual answer to that, and
 * there is a broader argument that the ratio should not carry this much weight
 * in either form.
 *
 * **It stays coupled, and these are the measurements that decided it.** The
 * two forms agree exactly at steady state and diverge as load rises:
 *
 * | shape | coupled | uncoupled |
 * | --- | --- | --- |
 * | steady three or four sessions a week | 1.00 | 1.00 |
 * | one extra session this week | 1.23 | 1.33 |
 * | a week at double the usual load | 2.09 | 3.29 |
 * | five big days on a trip | 3.11 | **10.52** |
 * | a deload week | 0.20 | 0.16 |
 *
 * Three things follow. The bounds above are the ones that travel with the
 * coupled form, and applying them to a statistic that reads 10.52 where this
 * one reads 3.11 would be using thresholds calibrated for a different number.
 * `peak.ts` derives its whole ramp from this form in its own prose — *"a steady
 * geometric ramp of `r` settles at `4 / (1 + 1/r + 1/r² + 1/r³)`, which reaches
 * 1.3 at about 1.22 a week"* — and that arithmetic is the coupled one; under
 * the uncoupled form a 1.20 ramp already reads 1.42, so `RAMP`, `MAX_BUILD` and
 * `staysInBand` would all need redrawing. And every climber's history would
 * change overnight, on a question the literature has not settled.
 *
 * **What follows from it being contested is the language, not the formula.**
 * The app said *"the pattern most associated with injury"* in three places and
 * the injury guide called the ratio *"a powerful metric… to minimize injury
 * risk"*. Those are claims about evidence. What the app can actually say is
 * what the model does and why the mechanism is plausible — see M168's entry.
 */
/**
 * The two windows the ratio is built from, named once (PLAN.md M168).
 *
 * They were written twice — `deriveLoad` walks a 28-entry array and takes
 * `slice(-7)`, `loadSeries` rolls two pointers at `today - 27` and
 * `today - 6` — because one answers for a single day and the other for a
 * series, and the series exists for a measured reason (see `LoadIndex`).
 * The *algorithms* can differ. The **windows** are the decision this
 * milestone exists to make explicit, and a decision written in two places is
 * one that can drift: a mutation to either copy used to survive every test of
 * the other.
 */
export const ACUTE_DAYS = 7;
export const CHRONIC_DAYS = 28;
/** The divisor that turns a 28-day total into a weekly-equivalent baseline. */
export const CHRONIC_WEEKS = CHRONIC_DAYS / ACUTE_DAYS;

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
  /** Days of history available — ACWR is meaningless below `MIN_HISTORY_DAYS`. */
  daysOfHistory: number;
  /**
   * Training days *with a load* inside the 28-day window (PLAN.md M173).
   *
   * The second of the two conditions on a readable ratio, and the one a
   * climber cannot fix by waiting. Published because the coach has to say
   * which condition is short, and a coach that recounted it from `daily`
   * would be a second copy of this number.
   */
  scoredDays: number;
  /**
   * Training days in the 28-day window with no effort recorded
   * (PLAN.md M162).
   */
  unmeasuredDays: number;
  /**
   * `acwr` is the best available estimate rather than a measurement,
   * because some of the window was not scored. The zone is still reported
   * only when it holds across the whole plausible range — see `bracket`.
   */
  estimated: boolean;
  /** Why the zone is 'unknown', when it is. */
  unknownBecause: 'history' | 'unscored' | null;
}

export interface PersonalRecord {
  scale: GradeScale;
  grade: string;
  date: string;
  /** Where it was set. A session carries the mode; a climb does not. */
  mode: SessionMode;
}

export interface ClimberState {
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
  /**
   * The same progression, counting only what was climbed on rock
   * (PLAN.md M112d).
   *
   * Not a filter over `personalRecords`, and that is the whole point: a
   * climber who sends V7 indoors and V5 outside has one record above — V7 —
   * and filtering it by mode leaves nothing at all. Rock has its own ladder
   * and this walks it separately.
   */
  outdoorRecords: PersonalRecord[];
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

/**
 * One result, reused while the inputs are identical (PLAN.md M157).
 *
 * Eighteen call sites, each memoising on its own — so a page mounting
 * several derivations walked the whole log several times. The cache is the
 * one `deriveXp` uses and works for the same reason: the stores replace
 * their arrays rather than mutating them, so if the same array comes back
 * the answer cannot have changed.
 *
 * It only pays once the callers share an array, which is what
 * `store/sessions.ts`'s `allSessions` is for — a caller flattening
 * `byDate` itself passes a fresh array and gets nothing from this.
 *
 * One entry, not a map: two different logs are never live at once, and an
 * unbounded cache of ten-year derivations is a memory leak wearing a
 * performance costume.
 */
let cached: { key: readonly unknown[]; value: ClimberState } | null = null;

/** Exported for tests and benchmarks that need to measure the real work. */
export function clearClimberStateCache(): void {
  cached = null;
}

export function deriveClimberState(sessions: Session[], options: DeriveOptions = {}): ClimberState {
  // Resolved values in the key, never the raw options.
  //
  // `today` is the one that could go wrong quietly: `todayKey()` is its
  // default, so keying on `options.today` would read `undefined` both sides
  // of midnight and hand an app left open overnight yesterday's answer — the
  // streak and the 30-day count both move at midnight with nothing logged.
  //
  // `weeklyTarget` is the one that made the cache miss for free: Progress
  // passes `3` where its own cards omit it, and an unresolved key calls
  // those two different questions when they are the same question.
  const resolved = {
    ...options,
    today: options.today ?? todayKey(),
    weeklyTarget: options.weeklyTarget ?? 3,
  };
  const key = [sessions, resolved.today, resolved.weeklyTarget, resolved.deloadDates] as const;
  if (cached !== null && cached.key.every((v, i) => v === key[i])) return cached.value;
  const value = deriveClimberStateUncached(sessions, resolved);
  cached = { key, value };
  return value;
}

function deriveClimberStateUncached(sessions: Session[], options: DeriveOptions): ClimberState {
  const today = options.today ?? todayKey();
  const weeklyTarget = options.weeklyTarget ?? 3;

  const completed = sessions
    .filter((s) => s.completed)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const boulder = emptyTally();
  const sport = emptyTally();
  const sessionsByType: Record<string, number> = {};
  const personalRecords: PersonalRecord[] = [];
  // Rock keeps its own running best, because the overall one is dominated by
  // whichever surface the climber does most — for nearly everyone, plastic.
  const outdoorRecords: PersonalRecord[] = [];
  let bestOutdoorBoulder = -1;
  let bestOutdoorSport = -1;

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

  const loadByDate = new Map<string, DayEntry>();
  let earliestLoad: string | null = null;
  let earliestTrained: string | null = null;

  for (const session of completed) {
    const isRest = isRestSession(session);
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
    //
    // Through `sessionLoad` rather than repeating its arithmetic: this was a
    // second copy of the formula, in the file whose own header exists
    // because the prototype computed the same number three ways. It meant
    // M162's change had to be made twice to be made at all.
    if (!isRest) {
      if (earliestTrained === null || session.date < earliestTrained) earliestTrained = session.date;
      const load = sessionLoad(session);
      const existing = loadByDate.get(session.date);
      const deload = existing?.deload === true || session.deload === true;
      if (load === null || load <= 0) {
        loadByDate.set(session.date, {
          load: existing?.load ?? 0,
          deload,
          unmeasured: true,
        });
      } else {
        loadByDate.set(session.date, {
          load: (existing?.load ?? 0) + load,
          deload,
          unmeasured: existing?.unmeasured === true,
        });
        if (earliestLoad === null || session.date < earliestLoad) earliestLoad = session.date;
      }
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
        // A send that beat the best so far on its own ladder. A `seen` set
        // stood beside this and could not change the answer: a grade sent
        // before is a grade the running best already covers, so `ord >
        // bestBefore` excludes every repeat on its own.
        const ord = gradeOrdinal(climb.scale, climb.grade);
        if (ord > bestBefore) {
          personalRecords.push({
            scale: climb.scale,
            grade: climb.grade,
            date: session.date,
            mode: session.mode,
          });
        }
        if (session.mode === 'outdoor') {
          const bestOutdoor = climb.scale === 'V' ? bestOutdoorBoulder : bestOutdoorSport;
          if (ord > bestOutdoor) {
            if (climb.scale === 'V') bestOutdoorBoulder = ord;
            else bestOutdoorSport = ord;
            outdoorRecords.push({
              scale: climb.scale,
              grade: climb.grade,
              date: session.date,
              mode: 'outdoor',
            });
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
    completedSessions: completed.length,
    restSessions,
    recentSessions,
    sessionsByType,
    boulder,
    sport,
    load: deriveLoad(
      { byDate: loadByDate, earliest: earliestLoad, earliestSeen: earliestTrained },
      today,
      options.deloadDates ?? new Set(),
    ),
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
    outdoorRecords,
  };
}

/**
 * The two conditions a readable ratio needs, named once (PLAN.md M173).
 *
 * `MIN_HISTORY_DAYS` was a bare `21` in three places — the readiness check
 * here, the same check inside `loadSeries`, and M162's `wouldAnswer` — which
 * is the shape M168 removed from the acute and chronic windows for the same
 * reason. `MIN_CHRONIC_DAYS` was private, and the coach now has to say which
 * of the two is short, so it is exported rather than guessed at one module
 * over.
 *
 * **They are not both reachable by every climber, and that is the finding
 * M173 turned on.** Density is counted inside the rolling 28-day window, so
 * a climber training once a week tops out at four scored days in it and
 * **never** satisfies the second condition — not after three weeks, not
 * after a year. The app used to tell them *"three weeks of logged sessions
 * and this becomes meaningful"*, which was a promise it could not keep.
 */
export const MIN_HISTORY_DAYS = 21;

/** Training days inside the 28-day window before a chronic baseline means
 *  anything — roughly a session and a half a week. */
export const MIN_CHRONIC_DAYS = 6;

/**
 * What a readable ratio needs, said once (PLAN.md M173).
 *
 * The browser check for this milestone is what found the rest of it. The old
 * promise — *"Three weeks of logged sessions and this becomes meaningful"* —
 * was written **four** times: `ui/loadZone.ts` twice (M162 replaced one copy
 * and left the other), `loadTrend.ts` for the line on Progress, and
 * `peak.ts` for a withheld runway. Fixing two of them left the Progress page
 * still saying it, because `describeTrend` had its own.
 *
 * Both numbers are interpolated, so the sentence cannot drift from the
 * condition the way the guide drifted from the bands before M168.
 */
export const RATIO_NEEDS = `Needs ${MIN_HISTORY_DAYS} days of logging and at least ${MIN_CHRONIC_DAYS} scored training days inside the last ${CHRONIC_DAYS}.`;

/** The zone a ratio falls in. One definition, read from two windows. */
function zoneOf(acwr: number, inDeload: boolean): AcwrZone {
  if (acwr < ACWR_BOUNDS.optimalFrom) return inDeload ? 'optimal' : 'detraining';
  if (acwr <= ACWR_BOUNDS.optimalTo) return 'optimal';
  if (acwr <= ACWR_BOUNDS.cautionTo) return 'caution';
  return 'danger';
}

interface Bracket {
  acwr: number | null;
  zone: AcwrZone;
  estimated: boolean;
  unknownBecause: 'history' | 'unscored' | null;
}

/**
 * The ratio when part of the window was not scored (PLAN.md M162).
 *
 * Unscored training pulls **both** halves of the ratio down, so it can
 * mislead in either direction: an unscored week makes the numerator small
 * and reads as detraining; unscored weeks further back make the denominator
 * small and read as a spike. Neither error is one to guess at.
 *
 * So the window is answered as a range rather than a number. The unscored
 * days are worth somewhere between nothing and a typical day — and the
 * climber's own measured days say what typical is — which gives a lowest and
 * a highest plausible ratio. When both ends land in the same zone the zone
 * is reported, because it holds however the missing sessions actually went;
 * the number is the midpoint and is flagged `estimated`, because it is one.
 * When the ends disagree the honest answer is that the app does not know.
 *
 * This is the same rule `MIN_CHRONIC_DAYS` follows one level up — do not
 * divide until the division means something — applied to which days went
 * into it rather than to how many there were.
 */
function bracket(
  acute: number,
  chronicTotal: number,
  measuredDays: number,
  unmeasuredAcute: number,
  unmeasuredChronic: number,
  inDeload: boolean,
): Bracket {
  const exact = acute / (chronicTotal / CHRONIC_WEEKS);
  if (unmeasuredChronic === 0) {
    return { acwr: exact, zone: zoneOf(exact, inDeload), estimated: false, unknownBecause: null };
  }
  // What a day of this climber's training is worth, from the days that were
  // scored. Both callers gate on `chronicDays >= MIN_CHRONIC_DAYS` before
  // reaching here and `measuredDays` is that same count, so there is always
  // something to estimate from — a guard for the zero case looked prudent
  // and was a branch nothing could reach, which the battery said by leaving
  // it alive under every mutation.
  const typical = chronicTotal / measuredDays;
  // Low: the unscored days were rest in all but name, so they add nothing to
  // the numerator and everything they might have been to the denominator.
  const low = acute / ((chronicTotal + unmeasuredChronic * typical) / CHRONIC_WEEKS);
  // High: they were ordinary training, which lifts the numerator most.
  const high = (acute + unmeasuredAcute * typical) / (chronicTotal / CHRONIC_WEEKS);
  const zone = zoneOf(low, inDeload);
  if (zone !== zoneOf(high, inDeload)) {
    return { acwr: null, zone: 'unknown', estimated: true, unknownBecause: 'unscored' };
  }
  return { acwr: (low + high) / 2, zone, estimated: true, unknownBecause: null };
}

/**
 * sRPE for one session: RPE × hours. **Null when either is missing**
 * (PLAN.md M162).
 *
 * Not zero. A session that recorded no effort has no load; a rest day has a
 * load of zero. Those are different facts and this used to return the same
 * number for both — so a completed session with climbs, a duration and
 * notes but no RPE was arithmetically a day off, and the ratio built on it
 * said so.
 */
export function sessionLoad(session: Session): number | null {
  if (session.rpe === undefined || session.durationMin === undefined) return null;
  return session.rpe * (session.durationMin / 60);
}

/** The same, as a number, for callers summing a window. */
export function loadOrZero(session: Session): number {
  return sessionLoad(session) ?? 0;
}

/** One day in the load index. */
export interface DayEntry {
  load: number;
  deload: boolean;
  /**
   * Training happened on this day that carries no load (PLAN.md M162).
   *
   * A day can be both: two sessions, one scored and one not. `load` is what
   * was measured and this says the figure is a floor rather than a total.
   */
  unmeasured: boolean;
}

export interface LoadIndex {
  byDate: Map<string, DayEntry>;
  /**
   * The earliest training day of any kind, scored or not (PLAN.md M162).
   *
   * `earliest` below is measured history, which is what a baseline can be
   * built from. This is what the *climber* has done, and the difference is
   * how `unknownBecause` tells "you have not trained long enough" from
   * "you have, and none of it is scored".
   */
  earliestSeen: string | null;
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
  const byDate = new Map<string, DayEntry>();
  let earliest: string | null = null;
  let earliestSeen: string | null = null;
  for (const session of sessions) {
    if (!session.completed) continue;
    // A rest day is not unrecorded training, and carrying no load is the
    // truth about it rather than a gap in the record.
    if (isRestSession(session)) continue;
    if (earliestSeen === null || session.date < earliestSeen) earliestSeen = session.date;
    const load = sessionLoad(session);
    const existing = byDate.get(session.date);
    const deload = existing?.deload === true || session.deload === true;
    if (load === null || load <= 0) {
      // Kept, where it used to be skipped (PLAN.md M162). A day the climber
      // turned up and did not score is a day the ratio has to know about,
      // or it reads as a rest day and drags the average down with it.
      byDate.set(session.date, {
        load: existing?.load ?? 0,
        deload,
        unmeasured: true,
      });
      continue;
    }
    byDate.set(session.date, {
      load: (existing?.load ?? 0) + load,
      deload,
      unmeasured: existing?.unmeasured === true,
    });
    // `earliest` stays a property of *measured* history, so a log made
    // entirely of unscored days still answers "not enough history" rather
    // than claiming a baseline it cannot compute.
    if (earliest === null || session.date < earliest) earliest = session.date;
  }
  return { byDate, earliest, earliestSeen };
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
  /** The ratio is an estimate: part of the window was not scored (M162). */
  estimated: boolean;
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
    .map(([date, entry]) => ({
      day: dayNumber(date),
      load: entry.load,
      deload: entry.deload,
      unmeasured: entry.unmeasured,
    }))
    .sort((a, b) => a.day - b.day);

  const earliestDay = index.earliest === null ? null : dayNumber(index.earliest);

  let hi = 0; // first entry not yet inside the window
  let lo28 = 0;
  let lo7 = 0;
  let chronic = 0;
  let chronicDays = 0;
  let acute = 0;
  let deloadDays = 0;
  let unmeasured28 = 0;
  let unmeasured7 = 0;

  return dates.map((date) => {
    const today = dayNumber(date);

    while (hi < entries.length && entries[hi]!.day <= today) {
      const entry = entries[hi]!;
      chronic += entry.load;
      if (entry.load > 0) chronicDays += 1;
      if (entry.unmeasured) {
        unmeasured28 += 1;
        unmeasured7 += 1;
      }
      acute += entry.load;
      if (entry.deload) deloadDays += 1;
      hi += 1;
    }
    while (lo28 < hi && entries[lo28]!.day < today - (CHRONIC_DAYS - 1)) {
      const entry = entries[lo28]!;
      chronic -= entry.load;
      if (entry.load > 0) chronicDays -= 1;
      if (entry.unmeasured) unmeasured28 -= 1;
      lo28 += 1;
    }
    while (lo7 < hi && entries[lo7]!.day < today - (ACUTE_DAYS - 1)) {
      const entry = entries[lo7]!;
      acute -= entry.load;
      if (entry.deload) deloadDays -= 1;
      if (entry.unmeasured) unmeasured7 -= 1;
      lo7 += 1;
    }

    const daysOfHistory = earliestDay === null || earliestDay > today ? 0 : today - earliestDay + 1;
    const baseline = chronic / CHRONIC_WEEKS;
    const deload = deloadDays > 0;
    if (daysOfHistory < MIN_HISTORY_DAYS || chronicDays < MIN_CHRONIC_DAYS || baseline <= 0) {
      return { date, acwr: null, zone: 'unknown', acute, chronic: baseline, deload, estimated: false };
    }

    const read = bracket(acute, chronic, chronicDays, unmeasured7, unmeasured28, deload);
    return {
      date,
      acwr: read.acwr,
      zone: read.zone,
      acute,
      chronic: baseline,
      deload,
      estimated: read.estimated,
    };
  });
}

/** Just the zones, for the hot path that only wants those. */
export function zonesFor(index: LoadIndex, dates: readonly string[]): AcwrZone[] {
  return loadSeries(index, dates).map((point) => point.zone);
}

function deriveLoad(
  index: LoadIndex,
  today: string,
  deloadDates: Set<string>,
): LoadState {
  const loadByDate = index.byDate;
  const daily: DayLoad[] = [];
  const unmeasured: boolean[] = [];
  for (let i = CHRONIC_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const entry = loadByDate.get(date);
    daily.push({
      date,
      load: entry?.load ?? 0,
      deload: entry?.deload === true || deloadDates.has(date),
    });
    unmeasured.push(entry?.unmeasured === true);
  }

  const acute = daily.slice(-ACUTE_DAYS).reduce((sum, d) => sum + d.load, 0);
  const chronicTotal = daily.reduce((sum, d) => sum + d.load, 0);
  const chronic = chronicTotal / CHRONIC_WEEKS;
  const unmeasuredDays = unmeasured.filter(Boolean).length;
  const unmeasuredAcute = unmeasured.slice(-ACUTE_DAYS).filter(Boolean).length;

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
  const ready = daysOfHistory >= MIN_HISTORY_DAYS && chronicDays >= MIN_CHRONIC_DAYS && chronic > 0;
  const inPlannedDeload = daily.slice(-ACUTE_DAYS).some((d) => d.deload);

  if (!ready) {
    // Which of the two reasons, decided by whether filling in the blanks
    // would actually answer the question (PLAN.md M162). Telling a climber
    // three weeks in to score their sessions is advice that does not work;
    // telling one with four months of unscored training to do it is the
    // whole of what stands between them and a number.
    const span =
      index.earliestSeen === null || index.earliestSeen > today
        ? 0
        : daysBetween(index.earliestSeen, today) + 1;
    const wouldAnswer = span >= MIN_HISTORY_DAYS && chronicDays + unmeasuredDays >= MIN_CHRONIC_DAYS;
    return {
      daily,
      acute,
      chronic,
      acwr: null,
      zone: 'unknown',
      inPlannedDeload,
      daysOfHistory,
      scoredDays: chronicDays,
      unmeasuredDays,
      estimated: false,
      unknownBecause: unmeasuredDays > 0 && wouldAnswer ? 'unscored' : 'history',
    };
  }

  const read = bracket(acute, chronicTotal, chronicDays, unmeasuredAcute, unmeasuredDays, inPlannedDeload);
  return {
    daily,
    acute,
    chronic,
    acwr: read.acwr,
    zone: read.zone,
    inPlannedDeload,
    daysOfHistory,
    scoredDays: chronicDays,
    unmeasuredDays,
    estimated: read.estimated,
    unknownBecause: read.unknownBecause,
  };
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
    const isRest = isRestSession(s);
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
    completed.filter((s) => !isRestSession(s)).map((s) => s.date),
  );
  let count = 0;
  let cursor = trained.has(today) ? today : addDays(today, -1);
  while (trained.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
