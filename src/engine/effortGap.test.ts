import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  RPE_SWING,
  checkInHistory,
  describeCheckIns,
  oneSessionIsWorth,
} from './checkIns';
import type { CheckIn } from './readiness';

/**
 * The one number on the card that answers the card's own question
 * (PLAN.md M245).
 *
 * "Did the check-in change what I did?" is answered by the sign and size of
 * the gap between the flagged-day mean and the clear-day mean. The card
 * computed it, printed both numbers, said nothing about which way they ran,
 * and then appended **"which is few enough that one hard session moves it"**
 * to every difference it ever printed — whether or not that was true, and
 * measured, usually it was not.
 */

const TO = '2026-09-10';

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#a`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const fine: CheckIn = { fingers: 'good', sleep: 'good' };
const rough: CheckIn = { fingers: 'tender', sleep: 'short' };

function run(n: number, endsAgo: number, patch: Partial<Session> = {}): Session[] {
  return Array.from({ length: n }, (_, i) => session(addDays(TO, -(endsAgo + (n - 1 - i))), patch));
}

const said = (sessions: Session[]) => describeCheckIns(checkInHistory({ sessions, to: TO }));

/** Ten flagged days at RPE 9 against twenty clear ones at 6: the measured case. */
const MEASURED = [...run(10, 1, { checkIn: rough, rpe: 9 }), ...run(20, 20, { checkIn: fine, rpe: 6 })];

describe('which way the gap runs', () => {
  it('says harder when the flagged days were harder', () => {
    expect(said(MEASURED)).toContain('came out 3.0 harder than the clear ones');
  });

  /**
   * The opposite climber, who backed off exactly as asked. Before this, the
   * two of them were handed the same sentence shape with the numbers the
   * other way round and left to work it out.
   */
  it('says easier when they were easier', () => {
    const backedOff = [
      ...run(10, 1, { checkIn: rough, rpe: 5 }),
      ...run(20, 20, { checkIn: fine, rpe: 8 }),
    ];
    expect(said(backedOff)).toContain('came out 3.0 easier than the clear ones');
  });

  /** And still prints both means, so the sentence is checkable. */
  it('keeps both numbers beside the direction', () => {
    expect(said(MEASURED)).toContain('RPE 9.0 against 6.0, over 10 days and 20.');
  });

  /** A gap under half a point is not a direction, and is not given one. */
  it('claims no direction when there is none', () => {
    const level = [
      ...run(10, 1, { checkIn: rough, rpe: 6 }),
      ...run(20, 20, { checkIn: fine, rpe: 6 }),
    ];
    const text = said(level);
    expect(text).toContain('about the same either way');
    expect(text).not.toMatch(/harder|easier/);
  });
});

describe('what one session is worth', () => {
  /**
   * The claim the old copy made, tested rather than asserted: with ten
   * flagged days at 9 and twenty clear at 6, move any single session to any
   * RPE on the scale and the gap does not close. That is the fact the fixed
   * phrase was wrong about, and pinning it here means the bound in
   * `oneSessionIsWorth` cannot be quietly widened.
   */
  it('cannot be closed by one session in the measured case', () => {
    const base = checkInHistory({ sessions: MEASURED, to: TO }).effort!;
    const gap = base.flagged - base.clear;
    let best = Math.abs(gap);
    for (let rpe = 1; rpe <= 10; rpe += 1) {
      // One flagged day moved anywhere on the scale...
      const moved = [
        ...run(1, 1, { checkIn: rough, rpe }),
        ...run(9, 2, { checkIn: rough, rpe: 9 }),
        ...run(20, 20, { checkIn: fine, rpe: 6 }),
      ];
      const e = checkInHistory({ sessions: moved, to: TO }).effort!;
      best = Math.min(best, Math.abs(e.flagged - e.clear));
    }
    expect(best, 'no single session closes a 3.0 gap over 10 days').toBeGreaterThan(0);
    expect(said(MEASURED)).not.toContain('could close that gap');
  });

  /** So it states the leverage instead, and the number is 9 over the smaller side. */
  it('states the leverage instead', () => {
    expect(said(MEASURED)).toContain('One session either side moves that by at most 0.9.');
    expect(oneSessionIsWorth(10, 20)).toBeCloseTo(0.9);
    expect(oneSessionIsWorth(20, 10), 'the smaller side decides, either way round').toBeCloseTo(0.9);
    expect(RPE_SWING, 'RPE is a fixed 1-10 scale, so nine points wide').toBe(9);
  });

  /** And it does say one session could close it, when one session could. */
  it('says so when the gap really is that fragile', () => {
    const thin = [
      ...run(4, 1, { checkIn: rough, rpe: 7 }),
      ...run(4, 10, { checkIn: fine, rpe: 6 }),
    ];
    const text = said(thin);
    expect(text).toContain('could close that gap');
    expect(text).not.toContain('moves that by at most');
  });
});
