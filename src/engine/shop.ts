/**
 * One ladder, two shops (PLAN.md M233).
 *
 * The kits and the Ascent's walls are the only things in this app that cost
 * anything, and they are paid for out of **one balance** — `earned` is
 * lifetime XP times `CURRENCY_RATE`, minus `spent`. So a climber does not
 * walk two ladders. They walk the merged one, cheapest rung first, and until
 * this milestone nothing in the codebase described it.
 *
 * ## What that cost
 *
 * M213 priced the kits to arrive with the gear stages in `avatar.ts` —
 * Basalt with the chalk bag at 8, Dusk with the harness at 20, Serac with
 * the rope and helmet at 40, Bivouac with the pack at 60 — and checked it.
 * M227 then added five walls at a price "in the same band", on the same
 * balance, and nothing recomputed anything. Bought cheapest-first, the six
 * kits landed at **6, 14, 23, 33, 52 and 76**. Serac twelve levels late,
 * Bivouac sixteen, and the rule in `kits.ts` no longer described the app.
 *
 * ## And the gaps were the part a climber actually met
 *
 * The item this milestone came from said the coins run out of anywhere to go:
 * true, at 147,700 coins, which is **564 sessions** of ordinary training —
 * about three and a half years at three a week. That is a long way off. What
 * was not a long way off was the top of the ladder, where the last four rungs
 * sat 57, 91, 115 and **191 sessions** apart. Fifteen months with one thing
 * to aim at arrives years before "nothing left to aim at" does.
 *
 * ## The shape now
 *
 * Fourteen rungs, spaced so no two are more than ~45 sessions apart and the
 * four gear-tied kits land back on their gear levels. Three items were added
 * to do it — two walls and a kit — and the top of the ladder was repriced
 * down, which shortens the whole shop from 564 sessions to **344**.
 *
 * That is the trade this milestone makes, and it is deliberate: a shop that
 * completes at two and a bit years with nothing dead in it is better than one
 * that completes at three and a half with a year of nothing in the middle.
 * The end is real either way, so the end says so — see `coinLine`.
 *
 * Nothing here is a sink. A shop of permanent things runs out by definition,
 * and the two ways out of that both cost more than they pay: selling power
 * breaks the wall that keeps the game from feeding training, and selling
 * paint for ever makes each purchase mean less than the last.
 */

import { shopOutfits } from './kits';
import { WALLS } from './ascent/walls';
import { levelFor } from './economy';
import { CURRENCY_RATE } from './xp';

export interface Purchase {
  name: string;
  kind: 'kit' | 'wall';
  price: number;
  /** Coins spent by the time this rung is bought, buying in order. */
  cumulative: number;
  /** The level a climber who has bought everything below it is at. */
  level: number;
}

/**
 * Both shops as one list, cheapest first, with the running total.
 *
 * Built rather than authored, so a price changed in either table moves this
 * and the rules below are asked about the ladder that exists. Cheapest-first
 * because that is how it is bought: nothing stops a climber buying out of
 * order, but the rung they are *saving for* is always the cheapest one they
 * do not own.
 */
export function purchaseLadder(): Purchase[] {
  const items: { name: string; kind: 'kit' | 'wall'; price: number }[] = [
    ...shopOutfits().map((o) => ({ name: o.name, kind: 'kit' as const, price: o.price ?? 0 })),
    ...WALLS.filter((w) => w.price !== undefined).map((w) => ({
      name: w.name,
      kind: 'wall' as const,
      price: w.price ?? 0,
    })),
  ].sort((a, b) => a.price - b.price);

  let cumulative = 0;
  return items.map((item) => {
    cumulative += item.price;
    return { ...item, cumulative, level: levelFor(cumulative / CURRENCY_RATE) };
  });
}

/**
 * How many things are still for sale, across both shops.
 *
 * Both, because the question the balance line asks is *is there anything left
 * to spend on* — and a kit card that said "nothing left" while three walls
 * were still for sale would be a card that had only looked at itself.
 */
export function unbought(kits: readonly string[], walls: readonly string[]): number {
  const haveKits = new Set(kits);
  const haveWalls = new Set(walls);
  return (
    shopOutfits().filter((o) => !haveKits.has(o.name)).length +
    WALLS.filter((w) => w.price !== undefined && !haveWalls.has(w.id)).length
  );
}

/**
 * The coin line, which stops being a balance when a balance stops meaning
 * anything.
 *
 * A spendable number is a number you are being invited to spend. Once there
 * is nothing to spend it on, showing one is the card lying by omission that
 * M213 named — a balance that can only rise against a spent that can never
 * move again. So it becomes what it actually is at that point: a total of
 * what the training paid, which is worth keeping and is not an invitation.
 *
 * The sentence after this one is each card's own — *cosmetic only, nothing
 * here trains for you* — because that part is true in both states.
 */
export function coinLine(balance: number, earned: number, left: number): string {
  if (left > 0) return `${balance.toLocaleString()} coins.`;
  return `${earned.toLocaleString()} coins earned, and everything bought.`;
}

/**
 * What the Currency card says once both shops are finished.
 *
 * Here rather than in `kits.ts` beside `describeShop`, because that function
 * can only see the kits and this sentence is a claim about the app. It is the
 * claim `describeShop` used to make and had no standing to.
 */
export const ALL_BOUGHT = 'Every kit and every wall bought — nothing left to spend on.';
