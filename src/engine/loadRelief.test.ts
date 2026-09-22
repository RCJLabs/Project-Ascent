import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { MIN_HISTORY, WORTH_DROPPING, loadRelief } from './loadRelief';
import { buildTips } from './coach';
import { deriveClimberState } from './derive';
import { addDays } from './dates';

/**
 * Which session to drop (PLAN.md M318).
 *
 * The coach has warned about a load spike since M162 with the true and
 * useless *"an easier week now costs a week"*. These hold the half that
 * makes it a decision: which week, which session, and what dropping it
 * comes to.
 */

const TODAY = '2026-09-22';

const session = (date: string, typeId: string, rpe: number, min: number): Session =>
  ({ id: `${date}#${typeId}`, date, sessionTypeId: typeId, completed: true, rpe, durationMin: min, climbs: [] }) as unknown as Session;

/**
 * Three quiet weeks and then a hard one, which is a spike by construction.
 *
 * A steady month was the first fixture and it produced a ratio of about
 * one — the sweet spot, where the tip this feeds does not fire at all, so
 * the coach half of these tests asserted against a tip that was never
 * there. The baseline has to be something the last week is high against.
 */
function history(): Session[] {
  const out: Session[] = [];
  for (let i = 28; i >= 8; i -= 1) {
    if (i % 3 === 0) out.push(session(addDays(TODAY, -i), 'easy', 4, 60));
  }
  for (let i = 7; i >= 1; i -= 1) {
    if (i % 2 === 1) out.push(session(addDays(TODAY, -i), 'hard', 8, 90));
    else out.push(session(addDays(TODAY, -i), 'easy', 5, 60));
  }
  // One outlier, so the mean and the median are different numbers and a
  // test can tell which one the estimate is. Every `hard` session weighing
  // exactly the same was the first fixture, and under it the two agree —
  // so the battery swapped median for mean and nothing noticed.
  out.push(session(addDays(TODAY, -4), 'hard', 10, 180));
  // And a type that weighs almost nothing, for the case where dropping a
  // session buys nothing worth a sentence.
  out.push(session(addDays(TODAY, -9), 'tiny', 2, 30));
  out.push(session(addDays(TODAY, -16), 'tiny', 2, 30));
  return out;
}

/** The same month of training, derived, which puts the ratio in caution. */
function hotState(): ReturnType<typeof deriveClimberState> {
  return deriveClimberState(history(), { today: TODAY });
}

const ahead = [
  { date: addDays(TODAY, 1), typeId: 'easy', name: 'Endurance' },
  { date: addDays(TODAY, 2), typeId: 'hard', name: 'Limit Bouldering' },
];

describe('what the rest of the week weighs', () => {
  it('names the heaviest session left in it', () => {
    const found = loadRelief({ sessions: history(), ahead, today: TODAY })!;
    expect(found).not.toBeNull();
    expect(found.drop!.session.name).toBe('Limit Bouldering');
    // Heaviest first, whatever order the plan hands them over in.
    expect(found.planned.map((p) => p.name)).toEqual(['Limit Bouldering', 'Endurance']);
  });

  /**
   * The median, and the fixture has an outlier so that means something.
   *
   * Four sessions at 8 × 1.5h and one at 10 × 3h: the median is 12 and the
   * mean is 15.6. One hard evening does not make every Thursday heavier,
   * which is the whole reason this is a median.
   */
  it('estimates each one from this climber’s own sessions of that type', () => {
    const found = loadRelief({ sessions: history(), ahead, today: TODAY })!;
    const limit = found.planned.find((p) => p.name === 'Limit Bouldering')!;
    expect(limit.load).toBeCloseTo(8 * 1.5, 5);
    expect(limit.load, 'that is the mean, not the median').not.toBeCloseTo(15.6, 1);
    expect(limit.from).toBeGreaterThanOrEqual(MIN_HISTORY);
  });

  /**
   * And nothing at all when dropping it buys nothing.
   *
   * *"1.94× with it and 1.93× without"* is a suggestion to skip a session
   * for no reason, which is worse than the general sentence it replaces.
   */
  it('says nothing when the heaviest session left is barely anything', () => {
    const found = loadRelief({
      sessions: history(),
      ahead: [{ date: addDays(TODAY, 1), typeId: 'tiny', name: 'Mobility' }],
      today: TODAY,
    })!;
    expect(found, 'the week still has something in it').not.toBeNull();
    expect(found.planned).toHaveLength(1);
    expect(found.drop, 'a session worth 1 load is not worth a sentence').toBeNull();
    // And the same week with a heavy session in it does suggest one, so
    // this is the threshold separating them rather than the code having
    // gone quiet.
    const heavy = loadRelief({
      sessions: history(),
      ahead: [{ date: addDays(TODAY, 1), typeId: 'hard', name: 'Limit Bouldering' }],
      today: TODAY,
    })!;
    expect(heavy.drop, 'nothing is being suggested at all').not.toBeNull();
    expect(heavy.asPlanned - heavy.drop!.without).toBeGreaterThanOrEqual(WORTH_DROPPING);
  });

  it('says what the week comes to, and what dropping it comes to', () => {
    const found = loadRelief({ sessions: history(), ahead, today: TODAY })!;
    expect(found.asPlanned).toBeGreaterThan(0);
    expect(found.drop!.without).toBeLessThan(found.asPlanned);
  });

  /**
   * Withheld whole rather than guessed at.
   *
   * A ranking with one invented number in it ranks wrongly and still sounds
   * certain, and the tip it feeds names one session out of four.
   */
  it('says nothing when a planned session has no history to estimate from', () => {
    const unknown = [...ahead, { date: addDays(TODAY, 3), typeId: 'campus', name: 'Campus' }];
    expect(loadRelief({ sessions: history(), ahead: unknown, today: TODAY })).toBeNull();
  });

  it('says nothing when a type has been done once, which is not a median', () => {
    const once = [...history(), session(addDays(TODAY, -2), 'board', 9, 60)];
    const withBoard = [...ahead, { date: addDays(TODAY, 1), typeId: 'board', name: 'Board' }];
    expect(loadRelief({ sessions: once, ahead: withBoard, today: TODAY })).toBeNull();
  });

  it('says nothing when the week has nothing left in it', () => {
    expect(loadRelief({ sessions: history(), ahead: [], today: TODAY })).toBeNull();
  });

  it('says nothing without a baseline to be hot against', () => {
    expect(loadRelief({ sessions: [], ahead, today: TODAY })).toBeNull();
  });

  /**
   * The heaviest, not the one that lands in the sweet spot.
   *
   * A session chosen by the answer it produces is chosen by arithmetic
   * rather than by training, and a coach pointing at the third-biggest
   * session because it happens to reach 1.29 is giving advice about a
   * number.
   */
  it('picks by what the session weighs, not by where it lands the ratio', () => {
    const three = [
      { date: addDays(TODAY, 1), typeId: 'easy', name: 'Endurance' },
      { date: addDays(TODAY, 2), typeId: 'hard', name: 'Limit Bouldering' },
      { date: addDays(TODAY, 3), typeId: 'easy', name: 'Second Endurance' },
    ];
    const found = loadRelief({ sessions: history(), ahead: three, today: TODAY })!;
    expect(found.drop!.session.name).toBe('Limit Bouldering');
    expect(found.drop!.session.load).toBe(Math.max(...found.planned.map((p) => p.load)));
  });
});

/**
 * The sentence the coach builds from it (PLAN.md M318).
 *
 * Held here rather than in `coach.test.ts` because what it must not say is
 * a property of this engine's contract: a statement about the plan, never
 * about the climber.
 */
describe('what the coach says with it', () => {
  it('names the day, the session and both numbers', () => {
    const tip = buildTips({
      state: hotState(),
      sessions: history(),
      relief: loadRelief({ sessions: history(), ahead, today: TODAY }),
    }).find((t) => t.id === 'load-spike')!;
    expect(tip, 'no load-spike tip').toBeTruthy();
    expect(tip.body).toMatch(/Limit Bouldering/);
    expect(tip.body).toMatch(/2 sessions left in the week as planned/);
    // "ends at", not "comes to": both numbers describe the end of the
    // week, and printing them beside today's ratio without saying so read
    // as training more lowering the ratio (PLAN.md M318).
    expect(tip.body).toMatch(/the week ends at \d+\.\d\d× with it and \d+\.\d\d× without/);
  });

  it('says nothing extra when the relief could not be worked out', () => {
    const tip = buildTips({ state: hotState(), sessions: history(), relief: null }).find(
      (t) => t.id === 'load-spike',
    )!;
    expect(tip).toBeTruthy();
    expect(tip.body).not.toMatch(/left in the week as planned/);
  });

  /**
   * A statement about the plan, not a prediction about the person.
   *
   * `engine/objectives.ts`: *"no projection that has not been earned"*. The
   * difference is a sentence apart — *"the week comes to 1.84×"* is
   * checkable arithmetic and *"you will be at 1.84×"* is a claim about what
   * somebody is going to do.
   */
  it('never tells the climber what they are going to do', () => {
    const tip = buildTips({
      state: hotState(),
      sessions: history(),
      relief: loadRelief({ sessions: history(), ahead, today: TODAY }),
    }).find((t) => t.id === 'load-spike')!;
    expect(tip.body).not.toMatch(/you will be|you'll be|you are going to/i);
  });
});
