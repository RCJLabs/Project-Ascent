import { describe, expect, it } from 'vitest';
import { GAME_ACTION_CAP, AWARDS, unitsToXp } from '../economy';
import { PAYOUT, payoutFor, wallNumber, type DailyRun } from './rewards';

const run = (patch: Partial<DailyRun> = {}): DailyRun => ({
  date: '2026-09-09',
  mode: 'ascent',
  metres: 10_000,
  coins: 20,
  ...patch,
});

describe('the daily payout', () => {
  it('pays nothing for a run that went nowhere', () => {
    const payout = payoutFor(run({ metres: 0, coins: 0 }), false);
    expect(payout.units).toBe(0);
    expect(payout.xp).toBe(0);
  });

  it('scales with height and with coins, and names both', () => {
    const short = payoutFor(run({ metres: 1_000 }), false);
    const long = payoutFor(run({ metres: 4_000 }), false);
    expect(long.units).toBeGreaterThan(short.units);
    expect(long.lines[0]!.label).toContain('4,000 m');
    expect(long.lines.some((l) => l.label.includes('coins'))).toBe(true);
  });

  it('pays a short run something worth having', () => {
    // A first attempt is a few hundred metres. Linear scaling paid it 1 XP.
    const first = payoutFor(run({ metres: 600, coins: 0 }), false);
    expect(first.xp).toBeGreaterThanOrEqual(10);
    // And still leaves most of the range to skill.
    expect(first.units).toBeLessThan(payoutFor(run({ metres: 5_000, coins: 0 }), false).units / 2);
  });

  it('stops rewarding height and coins past their ceilings', () => {
    const at = payoutFor(run({ metres: PAYOUT.metresForMax, coins: PAYOUT.coinsForMax }), false);
    const far = payoutFor(run({ metres: 500_000, coins: 5_000 }), false);
    expect(far.units).toBeCloseTo(at.units);
    expect(at.units).toBeCloseTo(PAYOUT.maxMetresUnits + PAYOUT.maxCoinUnits);
  });

  it('doubles for Free Solo and adds half again for a rest day', () => {
    const plain = payoutFor(run({ metres: 4_000, coins: 0 }), false);
    const hard = payoutFor(run({ metres: 4_000, coins: 0, mode: 'freesolo' }), false);
    const rested = payoutFor(run({ metres: 4_000, coins: 0 }), true);
    expect(hard.units).toBeCloseTo(plain.units * PAYOUT.freeSoloMultiplier);
    expect(rested.units).toBeCloseTo(plain.units * PAYOUT.restDayMultiplier);
    expect(rested.restBoost).toBe(true);
    expect(rested.lines.some((l) => l.label.includes('Rest day'))).toBe(true);
  });

  it('never pays past the game-lane cap, however good the day was', () => {
    const best = payoutFor(run({ metres: 999_999, coins: 999, mode: 'freesolo' }), true);
    expect(best.units).toBe(GAME_ACTION_CAP);
    expect(best.capped).toBe(true);
    expect(payoutFor(run({ metres: 1_000, coins: 0 }), false).capped).toBe(false);
  });

  it('can never substitute for training', () => {
    // A perfect day of play against simply turning up and logging a session.
    const perfect = payoutFor(run({ metres: 999_999, coins: 999, mode: 'freesolo' }), true);
    expect(perfect.units).toBeLessThan(AWARDS.session);
    expect(perfect.xp).toBeLessThan(unitsToXp(AWARDS.session));
  });
});

describe('the wall number', () => {
  it('counts from a fixed epoch, so two people quote the same number', () => {
    expect(wallNumber('2026-01-01')).toBe(1);
    expect(wallNumber('2026-01-02')).toBe(2);
    expect(wallNumber('2026-09-09')).toBe(252);
  });

  it('moves by one per day across a month boundary', () => {
    expect(wallNumber('2026-02-01') - wallNumber('2026-01-31')).toBe(1);
  });
});
