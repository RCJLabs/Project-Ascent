import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrograms } from '@/content/programs';
import type { Session } from '@/db/sessions';
import type { Objective } from './objectives';
import { PEAK_RATIO, QUIET_MIN_DAYS, comedownNow } from './comedown';
import { TRIP_RECENT_DAYS, tripNow, tripRecently } from './trip';
import { buildTips, type Tip } from './coach';
import { deriveClimberState } from './derive';
import { addDays } from './dates';
import { diagnose } from './plateau';

/**
 * A quiet week that has a reason (PLAN.md M188).
 *
 * ## What was measured before any of this was written
 *
 * Seven days after a nine-day trip, with none of the trip logged, the board
 * said **"16 days since you logged anything"** and offered a return at
 * two-thirds volume — and it was **identical** to the same log with no trip
 * on it, which is the proof the objective was invisible to the rule.
 *
 * The worse case is the climber who did it right and wrote it down: nine
 * outdoor days logged, then the week off any coach would prescribe, and the
 * app said **"Training has dropped off — a month is losing what you built."**
 * The evidence was in the log and the rule read the ratio instead.
 *
 * ## And the first draft of the fix was wrong too
 *
 * It read `state.load.daily`, which is truncated to the 28-day chronic
 * window — so the "month before the peak fortnight" was mostly absent and a
 * perfectly steady log reported a **3.5× peak**. The windows are taken over
 * the sessions now, with `derive.ts`'s own `sessionLoad`.
 */

beforeAll(async () => {
  await loadPrograms();
});

const DAY = '2026-03-02';

function train(
  days: readonly number[],
  options: { outdoor?: boolean; rpe?: number; minutes?: number } = {},
): Session[] {
  return days.map((d) => {
    const date = addDays(DAY, -d);
    return {
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: options.outdoor ? 'outdoor' : 'indoor',
      rpe: options.rpe ?? 7,
      durationMin: options.minutes ?? 90,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `c${d}`, grade: 'V4', scale: 'V', count: 4, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session;
  });
}

/** Every other day, which is the shape of an ordinary week. */
const steady = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let d = from; d >= to; d -= 2) out.push(d);
  return out;
};

const TRIP_DAYS = [16, 15, 14, 13, 12, 11, 10, 9, 8];

const trip = (daysAgo: number, name = 'Céüse'): Objective[] =>
  [
    {
      id: 'o1',
      name,
      kind: 'trip',
      status: 'training',
      targetDate: addDays(DAY, -daysAgo),
      requirements: [],
    },
  ] as unknown as Objective[];

const tipFor = (sessions: Session[], objectives: Objective[]): Tip | undefined => {
  const state = deriveClimberState(sessions, { today: DAY });
  return buildTips({
    sessions,
    state,
    diagnosis: diagnose({ sessions, state, today: DAY }),
    projects: [],
    metrics: [],
    programMetrics: [],
    objectives,
    today: DAY,
  } as never).find((t) => t.id === 'detraining');
};

describe('the trip the coach could not see', () => {
  /** The measurement this milestone exists for, kept as a test. */
  it('no longer reads a trip week the same as a stop', () => {
    const log = train(steady(76, 16));
    const withTrip = tipFor(log, trip(12))!;
    const without = tipFor(log, [])!;
    expect(without.headline, 'the unexplained reading changed').toBe(
      '16 days since you logged anything',
    );
    expect(withTrip.headline, 'the trip is still invisible').not.toBe(without.headline);
    expect(withTrip.headline).toBe('Quiet since Céüse');
    expect(withTrip.tone, 'still scolding a climber who was climbing').toBe('neutral');
  });

  it('says why, rather than asserting they stopped', () => {
    const tip = tipFor(train(steady(76, 16)), trip(12))!;
    expect(tip.body).toMatch(/Céüse is the obvious reason/);
    expect(tip.body, 'still offering the two-thirds return').not.toMatch(/two-thirds/);
  });

  /**
   * And the one status that means *abandoned* explains nothing either. The
   * filter is `datedTrips`, shared with `tripNow` since M188 rather than
   * copied into it — the battery found the copy by weakening one and
   * watching the other keep the test green.
   */
  it('reads no trip the climber gave up on', () => {
    const shelved = trip(5).map((o) => ({ ...o, status: 'shelved' })) as Objective[];
    expect(tripRecently(shelved, DAY)).toBeNull();
    expect(tripNow(shelved, DAY), 'the same rule, the other window').toBeNull();
    // `2026-02-30` rather than something obviously absurd: `fromKey` rolls
    // overflow forward without complaint, so this one lands on today and
    // would be *accepted* by a window that skipped `isDateKey`. A date that
    // rolls into next year falls out of the window anyway and cannot show
    // the guard working — which the battery proved by surviving one.
    const rolled = trip(5).map((o) => ({ ...o, targetDate: '2026-02-30' })) as Objective[];
    expect(tripRecently(rolled, DAY), 'a malformed date read as a trip').toBeNull();
    expect(tripNow(rolled, DAY)).toBeNull();
  });

  /** A trip still to come explains nothing about a week already quiet. */
  it('reads only trips that have happened', () => {
    expect(tripRecently(trip(5), DAY)?.name).toBe('Céüse');
    expect(tripRecently(trip(-5), DAY), 'a future trip explained the past').toBeNull();
    expect(tripRecently(trip(TRIP_RECENT_DAYS + 1), DAY), 'a trip from last month').toBeNull();
    expect(tripRecently(trip(TRIP_RECENT_DAYS), DAY), 'the far edge of the window').not.toBeNull();
  });
});

describe('the peak the coach could not see', () => {
  const peaked = [...train(steady(76, 18)), ...train(TRIP_DAYS, { outdoor: true })];

  it('reads a week off after a big fortnight as the taper it is', () => {
    const tip = tipFor(peaked, trip(12))!;
    expect(tip.headline).toBe('Coming down from Céüse');
    expect(tip.body).toMatch(/That is a taper, not a loss/);
    expect(tip.tone).toBe('neutral');
  });

  /**
   * And needs no objective to do it. This is the half the recorded finding
   * did not have: the log alone says the fortnight was heavy.
   */
  it('needs no trip on the board', () => {
    const tip = tipFor(peaked, [])!;
    expect(tip.headline).toBe('Coming down from the last block');
    expect(tip.body).toMatch(/ran at 1\.6× your own baseline/);
  });

  /**
   * The failure the first draft had, kept as a test: a steady log has no
   * peak in it, and calling one would excuse every genuine drop.
   */
  it('finds no peak in a steady log', () => {
    expect(comedownNow(train(steady(76, 5)), [], DAY)).toBeNull();
    const tip = tipFor(train(steady(76, 5)), [])!;
    expect(tip.headline, 'a steady log was excused as a comedown').toBe('Training has dropped off');
  });

  it('leaves a real layoff alone', () => {
    const tip = tipFor(train(steady(90, 30)), [])!;
    expect(tip.headline).toBe('30 days since you logged anything');
    expect(tip.tone).toBe('caution');
  });
});

describe('the gate', () => {
  const peaked = [...train(steady(76, 18)), ...train(TRIP_DAYS, { outdoor: true })];

  it('says nothing about a rest day or two', () => {
    const fresh = [...train(steady(76, 18)), ...train([16, 15, 14, 13, 12, 11, 10, 9, 8, 2])];
    expect(comedownNow(fresh, trip(12), DAY), 'two days off is not a comedown').toBeNull();
  });

  /**
   * The quiet threshold on its own. The trip days here are deliberately
   * heavy — RPE 9 for three hours — so the peak is unambiguous and the only
   * thing the boundary can be measuring is the gap. The first draft of this
   * test used ordinary days and landed at a ratio of 1.286, a hair under
   * `PEAK_RATIO`, so it failed for a reason that had nothing to do with what
   * it was asking.
   */
  it('opens at the day it says it does', () => {
    const at = (quiet: number) =>
      comedownNow(
        [
          ...train(steady(76, 18)),
          ...train(
            TRIP_DAYS.map((d) => d - 8 + quiet),
            { outdoor: true, rpe: 9, minutes: 180 },
          ),
        ],
        [],
        DAY,
      );
    expect(at(QUIET_MIN_DAYS - 1), 'fired a day early').toBeNull();
    expect(at(QUIET_MIN_DAYS), 'did not fire at the threshold').not.toBeNull();
  });

  it('measures the fortnight against the month before it, not the month around it', () => {
    const found = comedownNow(peaked, [], DAY)!;
    expect(found.because).toBe('peak');
    expect(found.ratio!).toBeGreaterThanOrEqual(PEAK_RATIO);
    expect(found.ratio!, 'the baseline window is missing, as it was in the first draft').toBeLessThan(3);
    expect(found.peak).toBeGreaterThan(found.baseline);
  });

  /**
   * A planned week is not a peak. `sessions` carries days the climber has
   * placed and not yet done, and counting them would call a comedown on a
   * fortnight that has not happened — the load model itself only ever counts
   * completed days.
   */
  it('counts only the days that were actually done', () => {
    // The planned days sit *inside* the fortnight the peak is measured over
    // — a fixture that put them outside it could not reach the guard at all,
    // which the battery showed by surviving.
    const planned = train([12, 11, 10, 9, 8, 7], { outdoor: true, rpe: 9, minutes: 180 }).map(
      (session) => ({ ...session, id: `${session.id}p`, completed: false }),
    );
    const log = [...train(steady(76, 6)), ...planned];
    expect(comedownNow(log, [], DAY), 'a week that was planned and not done read as a peak')
      .toBeNull();
    // And the same days, actually done, are a peak — so the fixture is not
    // failing to fire for some other reason.
    const done = planned.map((session) => ({ ...session, completed: true }));
    expect(comedownNow([...train(steady(76, 6)), ...done], [], DAY)).not.toBeNull();
  });

  it('claims nothing when there is no earlier log to compare against', () => {
    // The trip is the whole log: a made-up denominator would call any first
    // fortnight a peak.
    expect(comedownNow(train(TRIP_DAYS, { outdoor: true }), [], DAY)).toBeNull();
  });

  it('falls back to the trip when the log holds no peak', () => {
    const found = comedownNow(train(steady(76, 16)), trip(12), DAY)!;
    // Narrowed rather than asserted, so the union does the work: a `trip`
    // reading always has a trip, which is why the copy can name it without a
    // fallback.
    if (found.because !== 'trip') throw new Error(`read as ${found.because}, not a trip`);
    expect(found.ratio).toBeNull();
    expect(found.trip.name).toBe('Céüse');
  });
});

describe('what a dismissal covers', () => {
  /**
   * The explanation is part of the fact. Waving this away on the way home
   * from a trip must not also wave away the layoff the same silence becomes
   * three weeks later — which is M175's rule, applied to a tip that now has
   * two quite different things to say.
   */
  it('signs a comedown differently from a layoff', () => {
    const comedown = tipFor(train(steady(76, 16)), trip(12))!;
    const layoff = tipFor(train(steady(90, 30)), [])!;
    expect(comedown.signature).not.toBe(layoff.signature);
    expect(comedown.signature).toMatch(/^after:/);
  });

  it('signs the two explanations apart', () => {
    const byTrip = tipFor(train(steady(76, 16)), trip(12))!;
    const byPeak = tipFor([...train(steady(76, 18)), ...train(TRIP_DAYS, { outdoor: true })], [])!;
    expect(byTrip.signature).not.toBe(byPeak.signature);
  });
});

/**
 * The climber's own answer (PLAN.md M275).
 *
 * M188 gave this file two ways to explain a quiet stretch and both are
 * inferences: a peak is read out of the log, and a trip objective is a date
 * typed weeks in advance for a trip that may have been cancelled. An away
 * marker is neither — it is the sentence those two are guessing at, said out
 * loud, with real dates, after the fact.
 */
describe('a stretch the climber marked away', () => {
  const marker = (from: number, to: number, over: Record<string, unknown> = {}) => [
    {
      id: 'a1',
      from: addDays(DAY, -from),
      to: addDays(DAY, -to),
      kind: 'trip' as const,
      note: 'Font',
      updatedAt: `${DAY}T00:00:00.000Z`,
      ...over,
    },
  ];

  /** Nine quiet days, and the climber has said what they were. */
  const quiet = train(steady(60, 10));

  it('explains the quiet with no objective and no peak', () => {
    expect(comedownNow(quiet, [], DAY)).toBeNull();
    const reading = comedownNow(quiet, [], DAY, marker(9, 1));
    expect(reading?.because).toBe('away');
  });

  it('carries the marker, so the tip can name it', () => {
    const reading = comedownNow(quiet, [], DAY, marker(9, 1));
    expect(reading?.because === 'away' && reading.period.note).toBe('Font');
  });

  /**
   * A comedown is quiet *after load*, and flu is quiet after nothing. Naming
   * it here would tell a climber three weeks off sick that their ratio
   * falling is a taper; `coach.ts` names those in the layoff tip instead,
   * where the advice underneath is the advice they need.
   */
  it('reads only a trip, and leaves the other kinds to the layoff rule', () => {
    for (const kind of ['rest', 'injured', 'life'] as const) {
      expect(comedownNow(quiet, [], DAY, marker(9, 1, { kind })), kind).toBeNull();
    }
  });

  it('refuses a marker too small to be the reason', () => {
    expect(comedownNow(quiet, [], DAY, marker(4, 3))).toBeNull();
  });

  /** Both a peak and a marker: the one that is not a guess wins. */
  it('beats the peak reading it would otherwise get', () => {
    const peaked = [...train(steady(60, 24)), ...train(TRIP_DAYS, { outdoor: true })];
    expect(comedownNow(peaked, [], DAY)?.because).toBe('peak');
    expect(comedownNow(peaked, [], DAY, marker(8, 1))?.because).toBe('away');
  });

  /** And the dated objective, for the same reason. */
  it('beats the trip objective it would otherwise get', () => {
    expect(comedownNow(quiet, trip(5), DAY)?.because).toBe('trip');
    expect(comedownNow(quiet, trip(5), DAY, marker(9, 1))?.because).toBe('away');
  });

  /**
   * The shape's whole contract is that its numbers are measured. An early
   * return before the arithmetic put a fabricated `peak: 0, baseline: 0` into
   * it, which was the first draft.
   */
  it('reports the same measured figures the other two readings do', () => {
    const peaked = [...train(steady(60, 24)), ...train(TRIP_DAYS, { outdoor: true })];
    const inferred = comedownNow(peaked, [], DAY);
    const marked = comedownNow(peaked, [], DAY, marker(8, 1));
    expect(marked?.peak).toBe(inferred?.peak);
    expect(marked?.baseline).toBe(inferred?.baseline);
    expect(marked?.peak).toBeGreaterThan(0);
  });
});
