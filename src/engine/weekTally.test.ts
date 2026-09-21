import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { tallied, trained, weekTally, weekTense, type TalliedDay } from './weekTally';

/**
 * How a week went, counted once (PLAN.md M146).
 *
 * The rule the week screen has read since M135 and the month grid's gutter
 * reads now. Held here rather than through either screen, because what
 * matters is that there is one rule — and a rule two screens share is a
 * rule worth testing on its own.
 */

const session = (patch: Partial<Session> = {}): Session =>
  newSession('2026-09-09', 0, { completed: true, ...patch });

/**
 * A day of a week that is entirely behind us, unless a test says otherwise.
 *
 * The counting tests below are about the counts, so their days are past and
 * `AFTER` stands after all of them — which makes `toCome` nought and leaves
 * every assertion written before M310 meaning what it meant.
 */
const PAST = '2026-09-09';
const AFTER = '2026-09-20';
const day = (training: boolean, sessions: Session[] = [], date = PAST): TalliedDay => ({
  date,
  training,
  sessions,
});

describe('what counts as training', () => {
  it('takes a finished session', () => {
    expect(trained(session())).toBe(true);
  });

  it('leaves out one that was started and never finished', () => {
    expect(trained(session({ completed: false }))).toBe(false);
  });

  // A rest day is one with a rest checklist and nothing climbed —
  // `isRestSession`'s rule, not a flag of its own.
  it('leaves out a day logged as a rest', () => {
    expect(trained(session({ restChecklist: { mobility: true } } as Partial<Session>))).toBe(false);
  });
});

describe('counting a week', () => {
  it('counts the days the plan asks for', () => {
    const tally = weekTally([day(true), day(true), day(false), day(true)], AFTER);
    expect(tally.planned).toBe(3);
  });

  it('counts the planned days that were finished', () => {
    const tally = weekTally([day(true, [session()]), day(true), day(true, [session()])], AFTER);
    expect(tally).toMatchObject({ planned: 3, done: 2 });
  });

  /**
   * A planned day logged as a rest still closes that day. The climber
   * planned to train, looked at it, and answered — which is not the same
   * as the day going by untouched, and not the same as training either.
   */
  it('closes a planned day that was answered with a rest', () => {
    const tally = weekTally([day(true, [session({ restChecklist: { mobility: true } } as Partial<Session>)])], AFTER);
    expect(tally).toMatchObject({ planned: 1, done: 1, extra: 0 });
  });

  it('does not count a planned day that was started and left open', () => {
    const tally = weekTally([day(true, [session({ completed: false })])], AFTER);
    expect(tally).toMatchObject({ planned: 1, done: 0 });
  });

  it('counts training on a day the plan left empty as extra', () => {
    const tally = weekTally([day(true), day(false, [session()])], AFTER);
    expect(tally).toMatchObject({ planned: 1, done: 0, extra: 1 });
  });

  // A rest logged on an unplanned day is a rest, not a session.
  it('does not count a rest on an unplanned day', () => {
    const tally = weekTally([day(false, [session({ restChecklist: { mobility: true } } as Partial<Session>)])], AFTER);
    expect(tally.extra).toBe(0);
  });

  it('counts two sessions on one unplanned day as two', () => {
    const tally = weekTally([day(false, [session(), session()])], AFTER);
    expect(tally.extra).toBe(2);
  });

  it('counts nothing in an empty week', () => {
    expect(weekTally([], AFTER)).toEqual({ planned: 0, done: 0, extra: 0, toCome: 0 });
  });
});

/**
 * The tense, which the gutter did not have (PLAN.md M310).
 *
 * `weekTally` counted what a week asked and what it got, and both screens
 * read it — then the week screen recounted the days still ahead from their
 * statuses and the month grid's gutter could not, so it drew the same
 * **1/4** on the Sunday of a week and on its Saturday. This is the fourth
 * number, counted with the other three.
 */
describe('what is still ahead', () => {
  const WEEK = ['2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'];
  /** Training on Monday, Wednesday and Friday, none of it done yet. */
  const week = (done: number[] = []): TalliedDay[] =>
    WEEK.map((date, i) => day([1, 3, 5].includes(i), done.includes(i) ? [session()] : [], date));

  it('counts the planned days that have not been done, from today on', () => {
    expect(weekTally(week(), WEEK[0]!).toCome).toBe(3);
    expect(weekTally(week(), WEEK[2]!).toCome).toBe(2);
    expect(weekTally(week(), WEEK[4]!).toCome).toBe(1);
    expect(weekTally(week(), WEEK[6]!).toCome).toBe(0);
  });

  /**
   * Today is ahead, not behind. A session planned for tonight is not one
   * you missed — `statusOf` in `week.ts` puts today in `'today'` rather
   * than `'missed'`, and this has to agree with it.
   */
  it('counts today as still ahead', () => {
    expect(weekTally(week(), WEEK[3]!).toCome).toBe(2);
  });

  it('never counts a day that was done', () => {
    // Monday trained. On Sunday it is done and *ahead*, which is still not
    // something to come — the same rule `statusOf` applies by putting
    // `'done'` before every test of the date.
    expect(weekTally(week([1]), WEEK[0]!).toCome).toBe(2);
    expect(weekTally(week([1]), WEEK[2]!).toCome).toBe(2);
  });

  it('is nothing for a week with no plan in it', () => {
    expect(weekTally([day(false, [session()], WEEK[0]!)], WEEK[0]!).toCome).toBe(0);
  });
});

describe('where a week sits against today', () => {
  const [start, end] = ['2026-09-06', '2026-09-12'];

  it('has three states, which is what the gutter was missing', () => {
    expect(weekTense(start, end, '2026-09-05')).toBe('ahead');
    expect(weekTense(start, end, start)).toBe('during');
    expect(weekTense(start, end, '2026-09-09')).toBe('during');
    expect(weekTense(start, end, end)).toBe('during');
    expect(weekTense(start, end, '2026-09-13')).toBe('over');
  });

  it('puts both ends of the week inside it', () => {
    // A week is not over on its own Saturday, and it has begun on its own
    // Sunday — the two days a `start > today` test got wrong in one
    // direction and right in the other.
    expect(weekTense(start, end, start)).not.toBe('ahead');
    expect(weekTense(start, end, end)).not.toBe('over');
  });
});

describe('whether a week has anything to report', () => {
  // "0/0" down eleven rows of an empty calendar is worse than an empty
  // gutter, so a week with no plan and nothing logged says nothing.
  it('is nothing for a week outside any block', () => {
    expect(tallied(weekTally([day(false), day(false)], AFTER))).toBe(false);
  });

  it('is something once the plan asks for a day', () => {
    expect(tallied(weekTally([day(true)], AFTER))).toBe(true);
  });

  it('is something once a day was trained off the plan', () => {
    expect(tallied(weekTally([day(false, [session()])], AFTER))).toBe(true);
  });
});
