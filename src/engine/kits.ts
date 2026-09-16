/**
 * The kits, and the shop that sells six of them (PLAN.md M62, M213).
 *
 * Its own module rather than a section of `avatar.ts`, and the reason is the
 * budget: `store/profile.ts` reaches that file for `DEFAULT_PALETTE` on the
 * boot path, so everything sharing it lands in the entry chunk even though
 * only two lazy pages read it. M213 measured sixteen colour quartets and the
 * shop's copy in the first load of an app that opens on Home. The same split
 * M214 made for the arcade's tuning table, for the same reason.
 *
 * Nothing here is derived from the climber. The figure — gear, ground,
 * posture, stage — is `avatar.ts`; this is what the climber is wearing and
 * what it cost.
 */

export interface Outfit {
  name: string;
  top: string;
  shorts: string;
  shoes: string;
  gear: string;
  /**
   * The skill cosmetic id that grants this kit (PLAN.md M62).
   *
   * Five capstones already granted a kit by id, and nothing in the app ever
   * turned one into something a climber could wear: two named kits that did
   * not exist, and three named kits that were free to everyone from the
   * first run. A kit with an `unlock` is earned and cannot be bought.
   */
  unlock?: string;
  /**
   * What this kit costs, for the ones that are bought rather than earned.
   *
   * Prices are in coins, and a coin is a quarter of an XP point
   * (`CURRENCY_RATE`). **Read them cumulatively**, which is the correction
   * M213 made: this comment used to say the four landed "at roughly level 7,
   * 10, 14 and 18", which was wrong twice — those are each price on its own,
   * for a climber who buys nothing, and they are rounded up from 6, 10, 14
   * and 17. A shop priced on the assumption that nothing in it is bought.
   * Bought in order, the six land at levels **6, 12, 18, 25, 40 and 60**.
   *
   * Those last two are not round numbers picked to be large. **A kit is
   * priced to arrive with a piece of gear**, from `GEAR_STAGE_LEVELS` in
   * `avatar.ts`:
   * Basalt lands about when the chalk bag does and Dusk about when the
   * harness does, which was a coincidence until M213 made it the rule.
   * `Serac` arrives with the rope and helmet and `Bivouac` with the pack, so
   * a kit bought late is bought for a figure that is mostly gear — and the
   * `gear` colour is the one that carries on that climber.
   */
  price?: number;
}

/**
 * Three ways to have a kit, and each means something different.
 *
 * **Free** — no `unlock`, no `price`. The six the app has always had, and
 * they stay free: locking one now would take a kit off a climber's back to
 * make a point.
 * **Earned** — an `unlock`, matching the cosmetic id a skill capstone grants.
 * Never purchasable, because the tree is a record of what you did.
 * **Bought** — a `price`, paid from the balance. Never granted, because
 * something you can buy is not a reward for training.
 */
export const OUTFITS: Outfit[] = [
  { name: 'Glacier', top: '#2f7bb0', shorts: '#35434e', shoes: '#eb6834', gear: '#5b6b78' },
  { name: 'Granite', top: '#4c5d52', shorts: '#2b3138', shoes: '#d6b24a', gear: '#7b8a93' },
  { name: 'Sandstone', top: '#c2503f', shorts: '#3d3a44', shoes: '#1f2933', gear: '#8a7a6b' },
  { name: 'Alpine', top: '#e4e9ee', shorts: '#1f6f8b', shoes: '#f2b705', gear: '#48606e' },
  { name: 'Slate', top: '#5c6b7a', shorts: '#22303c', shoes: '#9fb3c8', gear: '#3d4b58' },
  { name: 'Chalk', top: '#f0efe9', shorts: '#7d7468', shoes: '#c2503f', gear: '#a89e91' },

  // Earned. One per cosmetic id the skill trees already grant.
  { name: 'Iron', top: '#3f4650', shorts: '#20252b', shoes: '#b9c2cc', gear: '#6d7681', unlock: 'kit-iron' },
  { name: 'Tension', top: '#7a4a6b', shorts: '#2a2130', shoes: '#e8d8b7', gear: '#5d4a63', unlock: 'kit-tension' },
  { name: 'Anchor', top: '#26424f', shorts: '#141d24', shoes: '#c9d6dd', gear: '#456170', unlock: 'gear-tension' },
  { name: 'Weathered', top: '#8a6a3f', shorts: '#3a2f26', shoes: '#d9cbb4', gear: '#6f5a3e', unlock: 'kit-granite' },
  { name: 'Summit', top: '#f2f4f7', shorts: '#2c3e50', shoes: '#e0533d', gear: '#8fa3b3', unlock: 'kit-alpine' },

  // Bought. The only thing in the app that costs anything.
  { name: 'Basalt', top: '#33383d', shorts: '#1b1e21', shoes: '#c86b3c', gear: '#585f66', price: 1_200 },
  { name: 'Lichen', top: '#6f8a5c', shorts: '#2f3a2c', shoes: '#e4dcc6', gear: '#55684a', price: 2_500 },
  { name: 'Dusk', top: '#4a4270', shorts: '#221f33', shoes: '#f0a35e', gear: '#6b6294', price: 5_000 },
  { name: 'Copper', top: '#a75a35', shorts: '#2d2723', shoes: '#f0e2cf', gear: '#7d4526', price: 8_000 },
  // The two the shop gained at M213, for the climbers the first four ran out
  // on. Both are named for the gear they arrive with rather than a colour.
  { name: 'Serac', top: '#1d6b74', shorts: '#0e2429', shoes: '#e8f1f4', gear: '#7fb4c4', price: 24_000 },
  { name: 'Bivouac', top: '#38474a', shorts: '#1a2022', shoes: '#f2a33c', gear: '#c9a227', price: 50_000 },
];

/** Free to everyone, from the first run. */
export function freeOutfits(): Outfit[] {
  return OUTFITS.filter((o) => o.unlock === undefined && o.price === undefined);
}

/** Granted by a skill capstone, and only by one. */
export function earnedOutfits(): Outfit[] {
  return OUTFITS.filter((o) => o.unlock !== undefined);
}

/** Bought with the balance, and only bought. */
export function shopOutfits(): Outfit[] {
  return OUTFITS.filter((o) => o.price !== undefined);
}

/** Where a climber is on the shop's ladder, in kits and in coins. */
export interface ShopProgress {
  /** The cheapest kit not yet owned, or null once every one is bought. */
  next: Outfit | null;
  /** Coins still to earn for `next`. Zero when it is already affordable. */
  short: number;
  owned: number;
  total: number;
}

/**
 * How far along the shop is, and what the next thing costs (PLAN.md M213).
 *
 * The Currency card showed a balance, a lifetime earned and a spent, and
 * never once said what a coin *buys*. A climber at level 10 held four
 * thousand of them with nothing on screen connecting that to a kit. The
 * milestone was written about the far end — the shop used to run out at
 * level 25 and the card carried on counting — but the far end is just where
 * a card that never said anything stops being survivable.
 *
 * Cheapest-first rather than in authored order, so a kit inserted in the
 * middle of the table cannot reorder the ladder a climber is climbing.
 */
export function shopProgress(owned: readonly string[], balance: number): ShopProgress {
  // `shopOutfits` filters, so this sorts a fresh array rather than OUTFITS.
  //
  // **Equivalent to no sort at all today**, and M213's battery confirmed it:
  // the table is authored in price order, so nothing can tell the two apart
  // without reordering it. Kept because it makes "cheapest" true of the
  // function rather than of the table, and a kit added in the middle is
  // exactly the edit that would otherwise break it silently.
  const kits = shopOutfits().sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  const have = new Set(owned);
  const next = kits.find((kit) => !have.has(kit.name)) ?? null;
  return {
    next,
    short: next === null ? 0 : Math.max(0, (next.price ?? 0) - balance),
    owned: kits.filter((kit) => have.has(kit.name)).length,
    total: kits.length,
  };
}

/**
 * The ladder in one sentence, including the end of it.
 *
 * Three states, and the third is the one M213 exists for: **a shop with
 * nothing left in it says so**. Adding kits moved that wall from level 25 to
 * level 60, it did not remove it, and a balance that can only rise against a
 * spent that can never move again is a card lying by omission. The count
 * leads in every state, because "4 of 6" is the fact that makes the
 * remaining number mean something.
 */
export function describeShop(progress: ShopProgress): string {
  const { next, owned, total, short } = progress;
  if (next === null) return `All ${total} bought — nothing left to spend on.`;
  const price = (next.price ?? 0).toLocaleString();
  const lead = `${owned} of ${total} bought.`;
  // `=== 0` rather than `<= 0`, and the two are equivalent because
  // `shopProgress` clamps at zero. Written as the exact test because that is
  // what it means: the coins are there, not that the sign worked out.
  if (short === 0) return `${lead} ${next.name} is yours for ${price}.`;
  return `${lead} ${next.name} next, ${short.toLocaleString()} to go.`;
}
