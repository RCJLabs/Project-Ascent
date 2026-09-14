import { describe, expect, it } from 'vitest';
import { IRON_GRIP } from '@/content/programs/catalogue';
import type { Session } from '@/db/sessions';
import { addDays, programWeek } from './dates';
import {
  MIN_MISSED_WEEKS,
  describeInterruption,
  interruption,
  shiftedStart,
  type AwayReason,
} from './resume';

/**
 * A block that notices it was interrupted (PLAN.md M149).
 *
 * Every week is derived from the start date, so resuming and re-entering
 * are the same operation with a different number of weeks — and nothing
 * rewrites a dose, which is what keeps the block readable ahead.
 */

// A Sunday, so the block's own window opens on it.
const START = '2026-03-08';
/** Iron Grip runs twelve weeks; its phases open on 1, 5 and 9. */
const day = (week: number, offset = 1) => addDays(START, (week - 1) * 7 + offset);

const did = (date: string): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: true,
    completed: true,
    rewarded: false,
    mode: 'indoor',
    climbs: [],
    programId: IRON_GRIP.id,
    sessionTypeId: 'fp',
  }) as unknown as Session;

function found(lastWeek: number, nowWeek: number, reason?: AwayReason) {
  return interruption({
    program: IRON_GRIP,
    startDate: START,
    sessions: [did(day(1)), did(day(lastWeek))],
    today: day(nowWeek, 3),
    ...(reason ? { reason } : {}),
  });
}

describe('noticing', () => {
  it('says nothing while the block is being run', () => {
    expect(found(6, 6)).toBeNull();
    expect(found(6, 7)).toBeNull();
  });

  it('speaks once a whole week has gone by with nothing in it', () => {
    expect(found(6, 8)).not.toBeNull();
    expect(found(6, 8)!.missedWeeks).toBe(1);
    expect(MIN_MISSED_WEEKS).toBe(1);
  });

  it('counts only the weeks that were actually empty', () => {
    // Trained in week 6, today is week 10: weeks 7, 8 and 9 are missed and
    // the one in progress is not.
    expect(found(6, 10)!.missedWeeks).toBe(3);
    expect(found(6, 10)!.lastTrainedWeek).toBe(6);
    expect(found(6, 10)!.nowWeek).toBe(10);
  });

  it('says nothing about a block nobody has started training', () => {
    expect(
      interruption({ program: IRON_GRIP, startDate: START, sessions: [], today: day(9) }),
    ).toBeNull();
  });

  it('says nothing once the block has run its course', () => {
    expect(
      interruption({
        program: IRON_GRIP,
        startDate: START,
        sessions: [did(day(2))],
        today: addDays(START, 20 * 7),
      }),
    ).toBeNull();
  });

  it('ignores training logged outside this block', () => {
    // Before it started, and after today: a climber who logged a session
    // ahead of themselves has not trained it yet, and one who trained
    // before the block began did not train it in this block.
    const around = interruption({
      program: IRON_GRIP,
      startDate: START,
      sessions: [did(day(6)), did(addDays(START, -14)), did(day(11))],
      today: day(9, 3),
    });
    expect(around!.lastTrainedWeek).toBe(6);
    expect(around!.missedWeeks).toBe(2);
  });

  it('does not let a logged rest day close the gap', () => {
    const resting = interruption({
      program: IRON_GRIP,
      startDate: START,
      sessions: [
        did(day(6)),
        {
          ...did(day(8)),
          restChecklist: { hydration: true, mobility: true, zone1: false, sleep: true },
        } as unknown as Session,
      ],
      today: day(9, 3),
    });
    expect(resting!.lastTrainedWeek).toBe(6);
  });

  /**
   * The resume week can never run past the block, so nothing clamps it: an
   * interruption needs a whole empty week, and `programWeek` clamps today.
   */
  it('never proposes a week the block does not have', () => {
    for (const [last, now] of [[1, 3], [6, 9], [9, 12], [10, 12]] as const) {
      for (const option of found(last, now)!.options) {
        expect(option.week, `${last}->${now}`).toBeLessThanOrEqual(IRON_GRIP.weeks);
        expect(option.week).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('what it offers', () => {
  it('picks the block up at the week that was next', () => {
    const resume = found(6, 9)!.options.find((o) => o.kind === 'resume')!;
    expect(resume.week).toBe(7);
    expect(resume.shiftWeeks).toBe(2);
  });

  /**
   * The shift is the whole operation, so the arithmetic has to land: the
   * chosen week is what `programWeek` reads off the moved start date.
   */
  it('moves the start date so today really is that week', () => {
    const gap = found(6, 9)!;
    for (const option of gap.options) {
      const moved = shiftedStart(START, option);
      expect(programWeek(moved, day(9, 3), IRON_GRIP.weeks), option.kind).toBe(option.week);
    }
  });

  it('offers the opening of the phase, not a fixed number of weeks back', () => {
    // Week 6 is in the Hammer phase, which opens on week 5.
    const rewind = found(6, 9)!.options.find((o) => o.kind === 'rewind')!;
    expect(rewind.week).toBe(5);
    expect(rewind.headline).toMatch(/week 5/);
  });

  /**
   * A climber who stopped *on* a phase opening is offered that week again,
   * which is what re-entering at the start of a phase means after a gap.
   */
  it('offers the opening week again when that is where the log stopped', () => {
    const options = found(5, 8)!.options;
    expect(options.map((o) => o.kind)).toEqual(['resume', 'rewind']);
    expect(options.find((o) => o.kind === 'rewind')!.week).toBe(5);
  });

  it('always puts the rewind strictly earlier than the resume', () => {
    // Each pair is a last-trained week and a today, with at least one whole
    // week empty between them — below that there is no interruption to talk
    // about and `found` is null.
    for (const [last, now] of [[6, 9], [5, 8], [4, 7], [9, 12]] as const) {
      const options = found(last, now)!.options;
      const resume = options.find((o) => o.kind === 'resume');
      const rewind = options.find((o) => o.kind === 'rewind');
      if (resume && rewind) expect(rewind.week, `${last}->${now}`).toBeLessThan(resume.week);
    }
  });

  it('never proposes moving the block forwards', () => {
    for (const [last, now] of [[6, 8], [6, 12], [1, 4], [9, 12]] as const) {
      for (const option of found(last, now)!.options) {
        expect(option.shiftWeeks, `${last}->${now}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('why you were away', () => {
  it('leads with picking up where you left off when it was a holiday', () => {
    expect(found(6, 9, 'away')!.options[0]!.kind).toBe('resume');
  });

  it('leads with the phase opening when it hurt', () => {
    expect(found(6, 9, 'hurt')!.options[0]!.kind).toBe('rewind');
    expect(found(6, 9, 'ill')!.options[0]!.kind).toBe('rewind');
  });

  it('changes the sentence and not the choices', () => {
    const kinds = (r?: AwayReason) => found(6, 9, r)!.options.map((o) => o.kind).sort();
    expect(kinds('hurt')).toEqual(kinds('away'));
    expect(describeInterruption(found(6, 9, 'hurt')!, 'hurt')).toMatch(/hurt/);
    expect(describeInterruption(found(6, 9, 'away')!, 'away')).toMatch(/fortnight off/);
  });

  it('says the plain facts before anyone has answered', () => {
    const said = describeInterruption(found(6, 9)!);
    expect(said).toMatch(/2 weeks/);
    expect(said).toMatch(/today is week 9/);
    expect(said).toMatch(/last week you trained was 6/);
  });
});

/**
 * A shift is a translation, so it cannot close the gap it was asked about:
 * moving the start by `S` takes both `nowWeek` and `lastTrainedWeek` down by
 * `S` and the difference is exactly what it was. The first build fired again
 * the moment it had been dealt with, and offered to shift a second time.
 */
describe('a question already answered', () => {
  const after = (shiftWeeks: number, resumedAt?: string) =>
    interruption({
      program: IRON_GRIP,
      startDate: addDays(START, shiftWeeks * 7),
      sessions: [did(day(1)), did(day(6))],
      today: day(9, 3),
      ...(resumedAt ? { resumedAt } : {}),
    });

  it('still reads as a gap after the block has been moved', () => {
    // The proof that the record is needed rather than derivable.
    const before = found(6, 9)!;
    const moved = after(2)!;
    expect(moved.nowWeek - moved.lastTrainedWeek).toBe(before.nowWeek - before.lastTrainedWeek);
  });

  it('goes quiet once it has been answered', () => {
    expect(after(2, day(9, 3))).toBeNull();
  });

  it('comes back when the climber goes away again', () => {
    // Resumed, then trained, then away again: the gap is a new one.
    const resumedOn = day(6, 2);
    expect(
      interruption({
        program: IRON_GRIP,
        startDate: START,
        sessions: [did(day(1)), did(day(7))],
        today: day(10, 3),
        resumedAt: resumedOn,
      }),
    ).not.toBeNull();
  });
});
