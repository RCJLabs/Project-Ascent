import { describe, expect, it } from 'vitest';
import { IRON_GRIP, PEAK_PERFORMANCE } from '@/content/programs/catalogue';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { blockAdherence, describeAdherence, type AdherenceInput } from './adherence';

/**
 * Which sessions the plan placed, and which of them happened (PLAN.md M91).
 */

// 2026-03-08 is a Sunday, so the block window starts there.
const START = '2026-03-09';
const FROM = '2026-03-08';
// Monday Finger Protocol, Wednesday Performance, Friday Finger Protocol:
// two `fp` and one `perf` a week, for twelve weeks.
const PLAN = { 1: 'fp', 3: 'perf', 5: 'fp' } as const;

const did = (date: string, sessionTypeId?: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#${sessionTypeId ?? 'x'}`,
    date,
    planned: true,
    completed: true,
    rewarded: false,
    mode: 'indoor',
    climbs: [],
    programId: IRON_GRIP.id,
    ...(sessionTypeId ? { sessionTypeId } : {}),
    ...patch,
  }) as Session;

function run(sessions: Session[], today = '2026-05-30', plan: Record<number, string> = { ...PLAN }) {
  return blockAdherence({
    program: IRON_GRIP,
    startDate: START,
    plan: plan as AdherenceInput['plan'],
    sessions,
    today,
  })!;
}

/** The nth Monday, Wednesday or Friday of the block. */
const monday = (week: number) => addDays(FROM, (week - 1) * 7 + 1);
const wednesday = (week: number) => addDays(FROM, (week - 1) * 7 + 3);
const friday = (week: number) => addDays(FROM, (week - 1) * 7 + 5);

describe('what the plan placed', () => {
  it('counts every placement across the block', () => {
    const a = run([]);
    expect(a.planned).toBe(36);
    expect(a.types.find((t) => t.typeId === 'fp')?.planned).toBe(24);
    expect(a.types.find((t) => t.typeId === 'perf')?.planned).toBe(12);
  });

  // A rest day is not work the plan is owed.
  it('does not count the rest days it placed', () => {
    expect(run([], '2026-05-30', { 1: 'fp', 2: 'rest', 3: 'rest' }).planned).toBe(12);
  });

  /**
   * Otherwise every climber is behind from Sunday to Saturday, which is a
   * number that teaches you to ignore the number.
   */
  it('asks a part-finished week only for the days that have happened', () => {
    // Wednesday of week one: Monday has passed, Friday has not.
    const a = run([], wednesday(1));
    expect(a.planned).toBe(2);
    expect(a.weeks).toBe(1);
  });

  it('stops at the block’s last day rather than at today', () => {
    const a = run([], '2027-01-01');
    expect(a.through).toBe(a.to);
    expect(a.weeks).toBe(12);
  });

  it('has nothing to say before the block starts', () => {
    expect(
      blockAdherence({ program: IRON_GRIP, startDate: START, plan: PLAN as AdherenceInput['plan'], sessions: [], today: '2026-01-01' }),
    ).toBeNull();
  });
});

describe('what actually happened', () => {
  it('credits a session of the type the week asked for', () => {
    const a = run([did(monday(1), 'fp')], wednesday(1));
    expect(a.types.find((t) => t.typeId === 'fp')?.done).toBe(1);
  });

  /**
   * The week is the unit, not the day. A climber who moves Monday's session
   * to Tuesday did the work, and scoring the date would call that two
   * misses — a number about a diary rather than about training.
   */
  it('credits it on any day of the same week', () => {
    const tuesday = addDays(FROM, 2);
    const a = run([did(tuesday, 'fp')], wednesday(1));
    expect(a.types.find((t) => t.typeId === 'fp')?.done).toBe(1);
  });

  it('does not let one week pay for another', () => {
    // Both of week one's Finger Protocols done, none in week two.
    const a = run([did(monday(1), 'fp'), did(friday(1), 'fp'), did(monday(2), 'fp'), did(friday(2), 'fp')], friday(2));
    expect(a.types.find((t) => t.typeId === 'fp')?.done).toBe(4);

    const lopsided = run([did(monday(1), 'fp'), did(friday(1), 'fp'), did(wednesday(1), 'fp'), did(addDays(FROM, 2), 'fp')], friday(2));
    expect(lopsided.types.find((t) => t.typeId === 'fp')?.done, 'four in week one paid for week two').toBe(2);
    expect(lopsided.types.find((t) => t.typeId === 'fp')?.extra).toBe(2);
  });

  it('counts a third session of a twice-placed type as extra, not as done', () => {
    const a = run([did(monday(1), 'fp'), did(friday(1), 'fp'), did(wednesday(1), 'fp')], friday(1));
    const fp = a.types.find((t) => t.typeId === 'fp')!;
    expect(fp.done).toBe(2);
    expect(fp.extra).toBe(1);
  });

  it('counts a type the week never placed as extra', () => {
    const a = run([did(monday(1), 'perf')], monday(1), { 1: 'fp' });
    expect(a.types.find((t) => t.typeId === 'perf')?.extra).toBe(1);
    expect(a.types.find((t) => t.typeId === 'perf')?.planned).toBe(0);
  });

  it('ignores a session that was never finished', () => {
    const a = run([did(monday(1), 'fp', { completed: false })], monday(1));
    expect(a.done).toBe(0);
  });

  // Not a failure: a climber who logs by hand was still training, and a
  // bare "you did less than the plan asked" would be a lie about them.
  it('counts a hand-logged session rather than losing it', () => {
    const a = run([did(monday(1))], monday(1));
    expect(a.unplanned).toBe(1);
    expect(a.done).toBe(0);
  });

  it('does not count a rest day as work, planned or otherwise', () => {
    const a = run([did(monday(1), 'fp', { restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true } })], monday(1));
    expect(a.done).toBe(0);
    expect(a.unplanned).toBe(0);
  });
});

describe('said out loud', () => {
  const say = (sessions: Session[], today?: string, plan?: Record<number, string>) =>
    describeAdherence(run(sessions, today, plan));

  // Not the biggest gap in sessions — the biggest gap as a share of what
  // was asked. By Friday of week one `perf` is 0 of 1 and `fp` is 1 of 2,
  // and missing the only one you were asked for is the worse week.
  it('leads with what was missed worst, because that is the part worth saying', () => {
    const a = run([did(monday(1), 'fp')], friday(1));
    expect(describeAdherence(a)).toMatch(/^You did 0 of 1 Climbing Session and 1 of 2 Finger Protocol/);
  });

  it('names both numbers rather than a percentage', () => {
    expect(say([did(monday(1), 'fp')], friday(1))).toContain('1 of 2');
  });

  it('says so plainly when nothing was missed', () => {
    const a = run([did(monday(1), 'fp'), did(wednesday(1), 'perf'), did(friday(1), 'fp')], friday(1));
    expect(describeAdherence(a)).toMatch(/every session the plan placed — all 3 of them/);
  });

  it('mentions the sessions the plan did not place', () => {
    expect(say([did(FROM), did(monday(1))], monday(1))).toMatch(
      /You also logged 2 sessions the plan did not place/,
    );
  });

  // Iron Grip has two session types, so a fourth short one needs a program
  // that has four.
  it('counts the rest rather than listing every type short', () => {
    const a = blockAdherence({
      program: PEAK_PERFORMANCE,
      startDate: START,
      plan: { 1: 'perf', 2: 'tech', 3: 'fp', 4: 'proj' } as AdherenceInput['plan'],
      sessions: [],
      today: friday(1),
    })!;
    const said = describeAdherence(a)!;
    expect(said).toMatch(/and 2 other types short/);
    // And actually cut: a list of all four followed by "and 2 more" is the
    // bug that counting was supposed to avoid.
    expect(said.match(/ of 1 /g) ?? []).toHaveLength(2);
  });

  it('has nothing to say about a plan that placed nothing', () => {
    expect(describeAdherence(run([], friday(1), {}))).toBeNull();
  });
});
