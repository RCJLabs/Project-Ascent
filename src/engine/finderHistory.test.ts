import { describe, expect, it } from 'vitest';
import { IRON_GRIP, LOCKDOWN } from '@/content/programs/catalogue';
import { newSession, type Session } from '@/db/sessions';
import { blockId, type BlockRecord } from './blocks';
import { addDays } from './dates';
import {
  ENOUGH_PLANNED,
  LOW_ADHERENCE,
  REPEAT_WINDOW_DAYS,
  recommend,
  type FinderInput,
} from './finder';
import { lastBlockFor } from './finderHistory';
import { planFromLayout } from './scheduler';

/**
 * The finder reads the block just run (PLAN.md M101).
 *
 * It asked seven questions and used the answers, plus the grades M85 taught
 * it to take from the log, and threw away the one fact most obviously
 * relevant to "what should I run next": what you just ran.
 */

const TODAY = '2026-09-11';

/** A twelve-week Iron Grip block that ended `daysAgo` days ago. */
function block(daysAgo: number, patch: Partial<BlockRecord> = {}): BlockRecord {
  const startDate = addDays(TODAY, -(IRON_GRIP.weeks * 7 + daysAgo));
  return {
    id: blockId('iron_grip', startDate),
    programId: 'iron_grip',
    name: IRON_GRIP.name,
    startDate,
    weeks: IRON_GRIP.weeks,
    endedAt: null,
    ...patch,
  };
}

const BASE: FinderInput = {
  discipline: 'boulder',
  experience: 'intermediate',
  boulderGrade: 'V5',
  goal: 'fingers',
  daysPerWeek: 4,
  equipment: ['wall', 'hangboard', 'gym', 'weight'],
};

const pick = (input: FinderInput, id: string) =>
  recommend(input).find((r) => r.program.id === id)!;

describe('reading the last block off the log', () => {
  it('is null before anything has been run', () => {
    expect(lastBlockFor([], [], TODAY)).toBeNull();
  });

  // The days come off the block's own window, which `blockWindow` snaps to
  // the start's Sunday — so the expectation is the newer of the two rather
  // than an arithmetic guess at the gap.
  it('finds the newest block that has ended', () => {
    const older = block(200);
    const newer = block(10);
    const expected = lastBlockFor([newer], [], TODAY)!.daysSince;
    expect(expected).toBeLessThan(lastBlockFor([older], [], TODAY)!.daysSince);
    expect(lastBlockFor([older, newer], [], TODAY)?.daysSince).toBe(expected);
    expect(lastBlockFor([newer, older], [], TODAY)?.daysSince).toBe(expected);
  });

  /**
   * The gap runs from the block's last day, not its first.
   *
   * A mutation reading it from `startDate` survived everything else, because
   * every other assertion about `daysSince` is relative. On a twelve-week
   * block the two are eighty-four days apart, which is the difference
   * between inside the repeat window and well outside it.
   */
  it('measures the gap from the day the block ended', () => {
    const gap = lastBlockFor([block(21)], [], TODAY)!.daysSince;
    // `blockWindow` snaps the start to its Sunday, so the end moves by up to
    // a week — but nowhere near the twelve weeks the block itself ran.
    expect(gap).toBeGreaterThanOrEqual(21 - 7);
    expect(gap).toBeLessThanOrEqual(21 + 7);
    expect(gap).toBeLessThan(IRON_GRIP.weeks * 7);
  });

  // A block still running is not a thing you are choosing a successor for.
  it('ignores a block that is still going', () => {
    const running: BlockRecord = { ...block(0), startDate: addDays(TODAY, -14) };
    expect(lastBlockFor([running], [], TODAY)).toBeNull();
  });

  it('says whether it ran to the end', () => {
    expect(lastBlockFor([block(10)], [], TODAY)?.completed).toBe(true);
    const left = block(10, { endedAt: addDays(TODAY, -40) });
    expect(lastBlockFor([left], [], TODAY)?.completed).toBe(false);
  });

  it('measures adherence against the layout the block started with', () => {
    const plan = planFromLayout(IRON_GRIP.recommendedLayout!);
    const row = block(10, { plan });
    const sessions: Session[] = [];
    for (let w = 0; w < 4; w++) {
      sessions.push(newSession(addDays(row.startDate, w * 7 + 1), 0, {
        completed: true,
        programId: 'iron_grip',
        sessionTypeId: 'fp',
      }));
    }
    const history = lastBlockFor([row], sessions, TODAY)!;
    expect(history.adherence!.planned).toBeGreaterThan(ENOUGH_PLANNED);
    expect(history.adherence!.done).toBeLessThan(history.adherence!.planned);
  });

  // A block from before the app kept a layout has nothing to measure
  // against, and a guess would be a comparison to a plan it never ran.
  it('reports no adherence for a block with no layout snapshot', () => {
    expect(lastBlockFor([block(10)], [], TODAY)?.adherence).toBeUndefined();
  });
});

describe('what the finder does with it', () => {
  const recent = { programId: 'iron_grip', daysSince: 21, completed: true };

  it('changes nothing at all without a history', () => {
    const without = recommend(BASE);
    const same = recommend({ ...BASE });
    expect(without.map((r) => [r.program.id, r.score])).toEqual(same.map((r) => [r.program.id, r.score]));
  });

  it('argues against repeating what you just finished', () => {
    const before = pick(BASE, 'iron_grip');
    const after = pick({ ...BASE, history: recent }, 'iron_grip');
    expect(after.score).toBeLessThan(before.score);
    expect(after.cautions.join(' ')).toMatch(/You finished this 3 weeks ago/);
  });

  // Not finishing it is the reason to run it again.
  it('says nothing about a block that was left early', () => {
    const after = pick({ ...BASE, history: { ...recent, completed: false } }, 'iron_grip');
    expect(after.cautions.join(' ')).not.toMatch(/You finished this/);
    expect(after.score).toBe(pick(BASE, 'iron_grip').score);
  });

  /**
   * The calendar running out is not the work being done (PLAN.md M91).
   *
   * `outcomeOf` says "completed" when the last week has passed and the
   * climber never switched away, so a block done at 13% of its plan reads as
   * finished. The finder said "you finished this four weeks ago" about
   * twelve weeks the climber had mostly skipped — and argued against the one
   * program they had most reason to go back to. Found in a browser.
   */
  it('does not argue against repeating a block that was barely done', () => {
    const barely = { ...recent, adherence: { done: 6, planned: 46 } };
    const after = pick({ ...BASE, history: barely }, 'iron_grip');
    expect(after.cautions.join(' ')).not.toMatch(/You finished this/);
    expect(after.score).toBe(pick(BASE, 'iron_grip').score);
  });

  it('still argues against repeating one that was actually run', () => {
    const kept = { ...recent, adherence: { done: 40, planned: 46 } };
    expect(pick({ ...BASE, history: kept }, 'iron_grip').cautions.join(' ')).toMatch(/You finished this/);
  });

  // A season later, running it again is a fresh decision rather than a loop.
  it('stops arguing once the window has passed', () => {
    const old = { ...recent, daysSince: REPEAT_WINDOW_DAYS + 1 };
    expect(pick({ ...BASE, history: old }, 'iron_grip').score).toBe(pick(BASE, 'iron_grip').score);
  });

  /**
   * `nextPrograms` is authored on all thirteen programs with a reason per
   * destination, and until now was read on `/finish` and nowhere else — not
   * on the screen whose entire question it answers.
   */
  it('carries the authored reason the last block gives for what follows it', () => {
    const after = pick({ ...BASE, history: recent }, 'peak_performance');
    const before = pick(BASE, 'peak_performance');
    expect(after.score).toBeGreaterThan(before.score);
    const said = after.reasons.join(' ');
    expect(said).toContain('Iron Grip names this as what follows it');
    expect(said).toContain(IRON_GRIP.nextPrograms.find((n) => n.id === 'peak_performance')!.reason);
  });

  it('says nothing about a program the last block does not name', () => {
    const after = pick({ ...BASE, history: recent }, 'lockdown');
    expect(after.reasons.join(' ')).not.toMatch(/names this as what follows/);
    expect(LOCKDOWN.id).toBe('lockdown');
  });

  it('stops carrying it once the window has passed', () => {
    const old = { ...recent, daysSince: REPEAT_WINDOW_DAYS + 1 };
    expect(pick({ ...BASE, history: old }, 'peak_performance').score).toBe(
      pick(BASE, 'peak_performance').score,
    );
  });
});

describe('adherence, said and never scored', () => {
  const thin = {
    programId: 'iron_grip',
    daysSince: 21,
    completed: true,
    adherence: { done: 10, planned: 40 },
  };

  it('mentions the days a program asks for', () => {
    const after = pick({ ...BASE, history: thin }, 'peak_performance');
    expect(after.cautions.join(' ')).toMatch(/You ran Iron Grip at 25% of its plan/);
  });

  // The climber has already told this screen how many days they have.
  // Deducting here would be the app disbelieving that answer.
  it('does not move the score', () => {
    const withIt = pick({ ...BASE, history: thin }, 'peak_performance');
    const without = pick({ ...BASE, history: { ...thin, adherence: { done: 38, planned: 40 } } }, 'peak_performance');
    expect(withIt.score).toBe(without.score);
  });

  it('says nothing when the block was mostly done', () => {
    const kept = { ...thin, adherence: { done: 30, planned: 40 } };
    expect(kept.adherence.done / kept.adherence.planned).toBeGreaterThan(LOW_ADHERENCE);
    expect(pick({ ...BASE, history: kept }, 'peak_performance').cautions.join(' ')).not.toMatch(/of its plan/);
  });

  // Below the threshold a ratio is an anecdote, which is the rule
  // `projectHistory` set and `conversion` follows.
  it('says nothing when the plan placed too little to be a ratio', () => {
    const tiny = { ...thin, adherence: { done: 1, planned: ENOUGH_PLANNED - 1 } };
    expect(pick({ ...BASE, history: tiny }, 'peak_performance').cautions.join(' ')).not.toMatch(/of its plan/);
  });

  it('says nothing about a program that asks for fewer days', () => {
    const easier = pick({ ...BASE, history: thin }, 'the_cruiser');
    expect(easier.cautions.join(' ')).not.toMatch(/of its plan/);
  });

  // "This asks for the same days as the program you just ran" is a circle
  // when *this* is that program.
  it('does not say it about the program it came from', () => {
    expect(pick({ ...BASE, history: thin }, 'iron_grip').cautions.join(' ')).not.toMatch(/of its plan/);
  });
});
