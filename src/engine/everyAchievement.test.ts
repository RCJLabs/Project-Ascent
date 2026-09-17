import { describe, expect, it } from 'vitest';
import type { DayRecord } from '@/db/game';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import {
  ACHIEVEMENT_COUNT,
  BREAK_DAYS,
  BURNS_FOR_PERSISTENCE,
  CLEAN_SHEET_CLIMBS,
  DELOAD_RPE_CAP,
  EASY_RPE,
  LONG_SESSION_MIN,
  MAXIMAL_RPE,
  OUTDOOR_MONTHS,
  PURE_RUN_FEET,
  SPREAD_GRADES,
  TRIP_DAYS,
  WARM_RUN,
  WEEK_DAYS,
  deriveAchievements,
  type AchievementId,
  type AchievementInput,
} from './achievements';
import { addDays } from './dates';
import { V_GRADES, YDS_GRADES } from './grades';
import { feetFromMetres } from './units';

/**
 * Every one of the twenty-six can actually be earned (PLAN.md M255).
 *
 * `achievements.test.ts` holds eighty-seven tests about how individual
 * shapes are read, and one of them checks that the list has
 * `ACHIEVEMENT_COUNT` entries in it. None of them asks the question this
 * file exists for: **is there a log that earns this one at all?**
 *
 * An unearnable achievement is invisible. It sits in the list, named, with
 * its condition printed under it, indistinguishable from one the climber has
 * not got to yet — which is exactly the shape of the M250 finding, where
 * five cards had been wired into a corpus and never once produced a
 * sentence because a silent card looks like a card that is fine.
 *
 * The map below is typed `Record<AchievementId, …>`, so leaving one out is a
 * compile error rather than a gap. Adding the twenty-seventh achievement
 * means writing the log that earns it, here, before the suite will build.
 */

const DAY = '2026-03-01';
let seq = 0;

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `s${seq++}`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 90,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const climb = (grade: string, patch: Record<string, unknown> = {}) => ({
  id: `c${seq++}`,
  grade,
  scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
  count: 1,
  result: 'send' as const,
  ...patch,
});

const restDay = (date: string): Session =>
  session(date, {
    rpe: undefined,
    durationMin: undefined,
    restChecklist: { hydration: true, mobility: true, zone1: false, sleep: true },
  });

const sent = (id: string, sentDate: string): Project =>
  ({
    id,
    name: id,
    grade: 'V5',
    scale: 'V',
    setting: 'indoor',
    status: 'sent',
    sentDate,
    beta: [],
    createdAt: `${DAY}T10:00:00.000Z`,
    updatedAt: `${sentDate}T10:00:00.000Z`,
  }) as Project;

/** The metres a pure run needs, found from the app's own conversion. */
function pureMetresFor(feet: number): number {
  let metres = feet;
  while (feetFromMetres(metres) < feet) metres += 1;
  return metres;
}

const log = (sessions: Session[], extra: Partial<AchievementInput> = {}): AchievementInput => ({
  sessions,
  ...extra,
});

/**
 * A log that earns each one, and nothing spare in it.
 *
 * Kept minimal on purpose: a fixture that trains for a year earns half the
 * list by accident, and then proves nothing about the one it is named for.
 */
const EARNERS: Record<AchievementId, () => AchievementInput> = {
  'no-takes': () =>
    log([], {
      ascent: [
        // Enough metres that `feetFromMetres` clears El Capitan.
        { date: DAY, metres: 3000, coins: 0, mode: 'ascent', pureMetres: pureMetresFor(PURE_RUN_FEET) },
      ] as DayRecord[],
    }),

  'full-circle': () =>
    log(Array.from({ length: 12 }, (_, m) => session(`2026-${String(m + 1).padStart(2, '0')}-05`))),

  'long-way-back': () => log([session(DAY), session(addDays(DAY, BREAK_DAYS))]),

  // Five distinct dates inside one Sunday-to-Saturday week.
  'full-week': () => {
    const sunday = '2026-03-01'; // a Sunday
    return log(Array.from({ length: WEEK_DAYS }, (_, i) => session(addDays(sunday, i))));
  },

  'always-warm': () =>
    log(Array.from({ length: WARM_RUN }, (_, i) => session(addDays(DAY, i * 2), { warmup: true }))),

  'hard-outside': () =>
    log([session(DAY, { mode: 'outdoor', climbs: [climb('V5')] })]),

  'straight-up': () => log([session(DAY, { climbs: [climb('V5', { style: 'flash' })] })]),

  'no-beta-outdoors': () =>
    log([session(DAY, { mode: 'outdoor', climbs: [climb('V4', { style: 'onsight' })] })]),

  'whole-spread': () =>
    log([
      session(DAY, {
        climbs: Array.from({ length: SPREAD_GRADES }, (_, i) => climb(`V${i + 1}`)),
      }),
    ]),

  persistence: () =>
    log(
      [
        session(DAY, {
          projectAttempts: [
            { id: 'a1', projectId: 'p1', outcome: 'fell-mid', count: BURNS_FOR_PERSISTENCE },
          ],
        }),
      ],
      { projects: [sent('p1', addDays(DAY, 1))] },
    ),

  'weekend-on-rock': () =>
    log([0, 1].map((i) => session(addDays(DAY, i), { mode: 'outdoor' }))),

  'a-trip': () =>
    log(Array.from({ length: TRIP_DAYS }, (_, i) => session(addDays(DAY, i), { mode: 'outdoor' }))),

  'both-sides': () => log([session(DAY, { climbs: [climb('V4'), climb('5.11a')] })]),

  // A rest day the day after a session at the top of the scale.
  listened: () =>
    log([session(DAY, { rpe: MAXIMAL_RPE }), restDay(addDays(DAY, 1))]),

  'block-finished': () => {
    const weeks = 4;
    return log(
      Array.from({ length: weeks }, (_, w) => session(addDays(DAY, w * 7), { programId: 'p' })),
      { programWeeks: () => weeks },
    );
  },

  'twice-in-a-day': () => log([session(DAY), session(DAY)]),

  'long-haul': () => log([session(DAY, { durationMin: LONG_SESSION_MIN })]),

  'both-ends': () =>
    log([session(DAY, { rpe: EASY_RPE }), session(addDays(DAY, 1), { rpe: MAXIMAL_RPE })]),

  'clean-sheet': () =>
    log([session(DAY, { climbs: [climb('V3', { count: CLEAN_SHEET_CLIMBS })] })]),

  'the-double': () =>
    log([session(DAY)], { projects: [sent('p1', DAY), sent('p2', DAY)] }),

  'both-in-a-day': () => log([session(DAY, { climbs: [climb('V4'), climb('5.10a')] })]),

  'deload-honoured': () =>
    log([
      session('2026-03-01', { rpe: DELOAD_RPE_CAP, deload: true }),
      session('2026-03-03', { rpe: DELOAD_RPE_CAP - 1, deload: true }),
    ]),

  'the-comeback': () =>
    log([
      session(DAY, { climbs: [climb('V4')] }),
      session(addDays(DAY, BREAK_DAYS), { climbs: [climb('V5')] }),
    ]),

  'months-outside': () =>
    log(
      Array.from({ length: OUTDOOR_MONTHS }, (_, m) =>
        session(`2026-0${m + 1}-10`, { mode: 'outdoor' }),
      ),
    ),

  'rested-and-ready': () =>
    log([restDay(DAY), session(addDays(DAY, 1), { climbs: [climb('V5')] })]),

  redemption: () =>
    log([
      session(DAY, { climbs: [climb('V6', { result: 'attempt' })] }),
      session(addDays(DAY, 2), { climbs: [climb('V6')] }),
    ]),
};

const ids = Object.keys(EARNERS) as AchievementId[];

const earnedIn = (input: AchievementInput): Set<AchievementId> =>
  new Set(deriveAchievements(input).filter((a) => a.date !== null).map((a) => a.id));

/**
 * What this proves, and what it cannot.
 *
 * It proves each achievement has *a* log that earns it. It cannot police
 * whether the condition is achievable by a person, because that needs a model
 * of a plausible climber the app does not have — raising `LONG_SESSION_MIN`
 * to a sixty-nine-day session leaves it reachable, and this file says so.
 *
 * What it can hold is the thresholds against limits the app itself sets: a
 * ladder has a length, and RPE is a one-to-ten scale that `effort.ts` calls
 * fixed. A threshold outside one of those is not a hard achievement, it is
 * an unearnable one, and the bound is the app's rather than a number chosen
 * here.
 */
describe('the thresholds sit inside the app’s own limits', () => {
  it('asks for no more grades than a ladder holds', () => {
    expect(SPREAD_GRADES).toBeLessThanOrEqual(Math.max(V_GRADES.length, YDS_GRADES.length));
  });

  it('asks for no effort the scale does not have', () => {
    for (const [name, rpe] of [
      ['MAXIMAL_RPE', MAXIMAL_RPE],
      ['EASY_RPE', EASY_RPE],
      ['DELOAD_RPE_CAP', DELOAD_RPE_CAP],
    ] as const) {
      expect(rpe, `${name} is off the 1-10 scale`).toBeGreaterThanOrEqual(1);
      expect(rpe, `${name} is off the 1-10 scale`).toBeLessThanOrEqual(10);
    }
  });

  it('asks for no more days than a week or months than a year', () => {
    expect(WEEK_DAYS).toBeLessThanOrEqual(7);
    expect(OUTDOOR_MONTHS).toBeLessThanOrEqual(12);
  });
});

describe('every achievement can be earned', () => {
  it('has a fixture for every one in the set', () => {
    expect(ids).toHaveLength(ACHIEVEMENT_COUNT);
    expect(new Set(deriveAchievements(log([])).map((a) => a.id))).toEqual(new Set(ids));
  });

  for (const id of ids) {
    it(`${id} is reachable`, () => {
      const earned = earnedIn(EARNERS[id]());
      expect([...earned], `${id} was not earned by the log written for it`).toContain(id);
    });
  }

  /**
   * The probe on the probe: an empty log earns none of them, so a fixture
   * that earns its achievement is doing so because of what is in it.
   */
  it('earns none of them from an empty log', () => {
    expect(earnedIn(log([])).size).toBe(0);
  });
});
