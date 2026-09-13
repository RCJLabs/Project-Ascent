import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { tallied, trained, weekTally, type TalliedDay } from './weekTally';

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

const day = (training: boolean, sessions: Session[] = []): TalliedDay => ({ training, sessions });

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
    const tally = weekTally([day(true), day(true), day(false), day(true)]);
    expect(tally.planned).toBe(3);
  });

  it('counts the planned days that were finished', () => {
    const tally = weekTally([day(true, [session()]), day(true), day(true, [session()])]);
    expect(tally).toMatchObject({ planned: 3, done: 2 });
  });

  /**
   * A planned day logged as a rest still closes that day. The climber
   * planned to train, looked at it, and answered — which is not the same
   * as the day going by untouched, and not the same as training either.
   */
  it('closes a planned day that was answered with a rest', () => {
    const tally = weekTally([day(true, [session({ restChecklist: { mobility: true } } as Partial<Session>)])]);
    expect(tally).toMatchObject({ planned: 1, done: 1, extra: 0 });
  });

  it('does not count a planned day that was started and left open', () => {
    const tally = weekTally([day(true, [session({ completed: false })])]);
    expect(tally).toMatchObject({ planned: 1, done: 0 });
  });

  it('counts training on a day the plan left empty as extra', () => {
    const tally = weekTally([day(true), day(false, [session()])]);
    expect(tally).toMatchObject({ planned: 1, done: 0, extra: 1 });
  });

  // A rest logged on an unplanned day is a rest, not a session.
  it('does not count a rest on an unplanned day', () => {
    const tally = weekTally([day(false, [session({ restChecklist: { mobility: true } } as Partial<Session>)])]);
    expect(tally.extra).toBe(0);
  });

  it('counts two sessions on one unplanned day as two', () => {
    const tally = weekTally([day(false, [session(), session()])]);
    expect(tally.extra).toBe(2);
  });

  it('counts nothing in an empty week', () => {
    expect(weekTally([])).toEqual({ planned: 0, done: 0, extra: 0 });
  });
});

describe('whether a week has anything to report', () => {
  // "0/0" down eleven rows of an empty calendar is worse than an empty
  // gutter, so a week with no plan and nothing logged says nothing.
  it('is nothing for a week outside any block', () => {
    expect(tallied(weekTally([day(false), day(false)]))).toBe(false);
  });

  it('is something once the plan asks for a day', () => {
    expect(tallied(weekTally([day(true)]))).toBe(true);
  });

  it('is something once a day was trained off the plan', () => {
    expect(tallied(weekTally([day(false, [session()])]))).toBe(true);
  });
});
