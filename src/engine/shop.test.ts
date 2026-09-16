import { describe, expect, it } from 'vitest';
import { GEAR_STAGE_LEVELS } from './avatar';
import { levelFor } from './economy';
import { shopOutfits } from './kits';
import { WALLS } from './ascent/walls';
import { deriveXp, CURRENCY_RATE } from './xp';
import type { Session } from '@/db/sessions';
import { ALL_BOUGHT, coinLine, purchaseLadder, unbought } from './shop';

/**
 * One ladder, two shops (PLAN.md M233).
 *
 * The rules here are about *spacing*, which is the thing neither table can
 * see on its own: kits and walls are priced independently and paid for out of
 * one balance, so the ladder a climber walks exists only when the two are
 * merged. M227 added the second shop without merging them anywhere, and the
 * gear tie M213 had built and tested quietly stopped holding.
 */

/** What an ordinary indoor session pays, measured rather than assumed. */
function coinsPerSession(): number {
  const sessions: Session[] = Array.from({ length: 60 }, (_, i) => {
    const date = new Date(Date.UTC(2024, 0, 1 + i * 2)).toISOString().slice(0, 10);
    return {
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: true,
      climbs: [
        { id: `a${i}`, grade: 'V4', scale: 'V', count: 5, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session;
  });
  return deriveXp({ sessions }).earned / sessions.length;
}

const PER_SESSION = coinsPerSession();

describe('the ladder both shops share', () => {
  it('holds every priced thing in the app and nothing else', () => {
    const ladder = purchaseLadder();
    const kits = shopOutfits().length;
    const walls = WALLS.filter((w) => w.price !== undefined).length;
    expect(ladder).toHaveLength(kits + walls);
    expect(ladder.filter((p) => p.kind === 'kit')).toHaveLength(kits);
    expect(ladder.filter((p) => p.kind === 'wall')).toHaveLength(walls);
    // Free and earned things are not rungs: a kit a capstone grants is not
    // something to save for.
    expect(ladder.map((p) => p.name)).not.toContain('Glacier');
    expect(ladder.map((p) => p.name)).not.toContain('Iron');
  });

  it('runs cheapest first, with the running total on each rung', () => {
    const ladder = purchaseLadder();
    let running = 0;
    for (let i = 0; i < ladder.length; i++) {
      const rung = ladder[i]!;
      running += rung.price;
      expect(rung.cumulative, rung.name).toBe(running);
      if (i > 0) expect(rung.price).toBeGreaterThanOrEqual(ladder[i - 1]!.price);
      expect(rung.level).toBe(levelFor(rung.cumulative / CURRENCY_RATE));
    }
  });

  /**
   * The rule this milestone exists for.
   *
   * Before it the last four rungs sat 57, 91, 115 and 191 sessions apart —
   * the last is fifteen months at three a week with one thing to aim at, and
   * it arrived years before the "nothing left to aim at" the item was
   * written about.
   *
   * Sessions rather than coins, because coins are not the unit a climber
   * feels. The measurement is an ordinary indoor session: warmed up, drill
   * done, RPE 7, five sends at V4.
   */
  it('never leaves more than fifty sessions between two rungs', () => {
    const ladder = purchaseLadder();
    let previous = 0;
    const gaps: string[] = [];
    for (const rung of ladder) {
      const sessions = (rung.cumulative - previous) / PER_SESSION;
      if (sessions > 50) gaps.push(`${rung.name} (${Math.round(sessions)} sessions)`);
      previous = rung.cumulative;
    }
    expect(gaps).toEqual([]);
  });

  /** And they grow, so early progress is quick and later rungs are earned. */
  it('spaces them wider as it goes, never narrower', () => {
    const ladder = purchaseLadder();
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]!.price, `${ladder[i]!.name} is cheaper than the rung below`).toBeGreaterThan(
        ladder[i - 1]!.price,
      );
    }
  });

  /**
   * M213's rule, restored — and this is the test M213 wrote in a form that
   * could still see it.
   *
   * A kit is priced to arrive with a piece of gear, and the four that are
   * named for one have to land on its level *on the merged ladder*. M213's
   * own check was against the kits alone, which is why it stayed green for
   * the whole of M227: it was asking about a shop that had stopped existing.
   */
  it('lands each gear-named kit with its gear', () => {
    const ladder = purchaseLadder();
    const at = (name: string) => ladder.find((p) => p.name === name)?.level;
    expect(GEAR_STAGE_LEVELS).toEqual([8, 20, 40, 60, 90]);
    expect(at('Basalt'), 'the chalk bag').toBe(8);
    expect(at('Dusk'), 'the harness').toBe(20);
    expect(at('Serac'), 'the rope and helmet').toBe(40);
    expect(at('Bivouac'), 'the pack').toBe(60);
  });

  /** The two kits without a gear name sit between them rather than on one. */
  it('leaves the other kits between the gear stages', () => {
    const ladder = purchaseLadder();
    for (const name of ['Lichen', 'Copper', 'Cornice']) {
      const level = ladder.find((p) => p.name === name)!.level;
      expect(GEAR_STAGE_LEVELS, `${name} sits on a gear stage`).not.toContain(level);
    }
  });

  it('ends where the last kit does, and says how far that is', () => {
    const ladder = purchaseLadder();
    const last = ladder.at(-1)!;
    expect(last.name).toBe('Bivouac');
    // Two and a bit years at three sessions a week. Pinned because the
    // milestone traded length for spacing on purpose and a silent drift back
    // to three and a half years would undo half of it.
    const sessions = last.cumulative / PER_SESSION;
    expect(sessions).toBeGreaterThan(300);
    expect(sessions).toBeLessThan(400);
  });
});

describe('what is still for sale', () => {
  const everyKit = shopOutfits().map((o) => o.name);
  const everyWall = WALLS.filter((w) => w.price !== undefined).map((w) => w.id);

  it('counts both shops', () => {
    expect(unbought([], [])).toBe(everyKit.length + everyWall.length);
    expect(unbought(everyKit, [])).toBe(everyWall.length);
    expect(unbought([], everyWall)).toBe(everyKit.length);
    expect(unbought(everyKit, everyWall)).toBe(0);
  });

  /**
   * The bug M227 left and M233 found: a climber holding every kit and no
   * walls was told there was nothing left to spend on while five things were
   * for sale.
   */
  it('does not call the shop finished while the other half is stocked', () => {
    expect(unbought(everyKit, [])).toBeGreaterThan(0);
    expect(unbought([], everyWall)).toBeGreaterThan(0);
  });

  /**
   * One thing left is not none, and the coin line turns on exactly that
   * boundary. A line that gave up a rung early would call the shop finished
   * with something still on the shelf.
   */
  it('still counts a single thing left', () => {
    expect(unbought(everyKit, everyWall.slice(0, -1))).toBe(1);
    expect(coinLine(10, 20, 1)).toBe('10 coins.');
    expect(coinLine(10, 20, 1)).not.toContain('everything bought');
  });

  it('ignores the walls a climber cannot buy at all', () => {
    // Free and height-unlocked walls are not for sale, so owning none of them
    // is not something still to spend on.
    const priced = new Set(everyWall);
    expect(WALLS.some((w) => !priced.has(w.id))).toBe(true);
    expect(unbought(everyKit, everyWall)).toBe(0);
  });
});

describe('the coin line', () => {
  it('is a balance while there is anything to spend it on', () => {
    expect(coinLine(12_345, 20_000, 3)).toBe('12,345 coins.');
  });

  /**
   * And stops being one when there is not. A spendable number is an
   * invitation to spend; past the end of the shop there is nothing to accept
   * it with, and a figure that can only rise against a spent that can never
   * move again is the card lying by omission M213 named.
   */
  it('becomes what the training paid once nothing is left', () => {
    const line = coinLine(114_572, 204_572, 0);
    expect(line).toBe('204,572 coins earned, and everything bought.');
    expect(line, 'a balance is still being offered').not.toContain('114,572');
  });

  it('says the same thing on the currency card, about both shops', () => {
    expect(ALL_BOUGHT).toMatch(/kit/);
    expect(ALL_BOUGHT).toMatch(/wall/);
  });
});
