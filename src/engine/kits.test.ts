import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, GEAR_STAGE_LEVELS, SKIN_TONES } from './avatar';
import {
  FIGURES,
  HAIR_TONES,
  OUTFITS,
  describeShop,
  earnedOutfits,
  freeOutfits,
  shopOutfits,
  shopProgress,
} from './kits';
import { levelFor } from './economy';
import { CURRENCY_RATE } from './xp';
import { cosmeticSources } from './skills';
import { SKILL_TREES } from '@/content/skills';

/**
 * Three ways to have a kit, and none of them overlap (PLAN.md M62).
 *
 * The bug this milestone exists for was two of them being the same thing:
 * five capstones granted a cosmetic id, and three of those named kits that
 * were free to everyone from the first run while two named kits that did not
 * exist anywhere in the app.
 */

describe('the kits', () => {
  it('sorts every kit into exactly one of free, earned and bought', () => {
    expect(freeOutfits().length + earnedOutfits().length + shopOutfits().length).toBe(OUTFITS.length);
    for (const outfit of OUTFITS) {
      const ways = [outfit.unlock !== undefined, outfit.price !== undefined].filter(Boolean).length;
      expect(ways, `${outfit.name} is in ${ways} groups`).toBeLessThanOrEqual(1);
    }
  });

  it('never charges for a kit the trees give away, or gives away one it charges for', () => {
    for (const outfit of earnedOutfits()) expect(outfit.price, outfit.name).toBeUndefined();
    for (const outfit of shopOutfits()) expect(outfit.unlock, outfit.name).toBeUndefined();
  });

  it('gives every kit four real colours', () => {
    // Moved from avatar.test.ts with the table (PLAN.md M213). A kit missing
    // one of the four is a figure rendered with `undefined` for a leg.
    for (const outfit of OUTFITS) {
      for (const key of ['top', 'shorts', 'shoes', 'gear'] as const) {
        expect(outfit[key], `${outfit.name}.${key}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('gives every kit a distinct name and a distinct look', () => {
    const names = OUTFITS.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    const looks = OUTFITS.map((o) => `${o.top}|${o.shorts}|${o.shoes}|${o.gear}`);
    expect(new Set(looks).size).toBe(looks.length);
  });

  it('keeps the six that were always free, free', () => {
    // Locking one now would take a kit off a climber's back to make a point.
    const free = freeOutfits().map((o) => o.name);
    for (const name of ['Glacier', 'Granite', 'Sandstone', 'Alpine', 'Slate', 'Chalk']) {
      expect(free, name).toContain(name);
    }
  });

  it('prices every bought kit above nothing', () => {
    for (const outfit of shopOutfits()) expect(outfit.price ?? 0, outfit.name).toBeGreaterThan(0);
  });
});

/**
 * What a price means, and that the shop ends somewhere a climber reaches
 * (PLAN.md M213).
 *
 * The shop used to cost 16,700 coins in total, which is level 25, and past
 * that the Currency card counted an `earned` upward forever against a
 * `spent` that could never move again. M213 added two kits — and the reason
 * the rule below is a *cumulative* one is that the code's own comment used
 * to quote each price on its own, which is the level a climber reaches only
 * if they buy nothing.
 */
describe('the shop ladder', () => {
  const ladder = shopOutfits().sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

  /** The level a climber is at when the *n*th kit becomes affordable. */
  function levelsInOrder(): number[] {
    let coins = 0;
    return ladder.map((kit) => {
      coins += kit.price ?? 0;
      return levelFor(coins / CURRENCY_RATE);
    });
  }

  it('gets more expensive every rung, so the order is never ambiguous', () => {
    const prices = ladder.map((kit) => kit.price ?? 0);
    for (const [i, price] of prices.entries()) {
      if (i === 0) continue;
      expect(price, `${ladder[i]!.name} against ${ladder[i - 1]!.name}`).toBeGreaterThan(
        prices[i - 1]!,
      );
    }
  });

  it('reads the gear ladder itself, not the stage list around it', () => {
    // `STAGES` opens with Newcomer at level 0, which grants rental shoes and
    // is not a gear stage. A price tied to that list rather than to
    // `GEAR_BY_LEVEL` would pass the rule below while meaning something
    // else, so the ladder is pinned here.
    expect([...GEAR_STAGE_LEVELS]).toEqual([8, 20, 40, 60, 90]);
  });

  it('lands the last two kits exactly on a gear stage', () => {
    // The point of the prices, not a coincidence like the first four: a kit
    // bought late is bought for a figure that is mostly gear.
    const levels = levelsInOrder();
    const late = levels.slice(-2);
    for (const level of late) expect(GEAR_STAGE_LEVELS, `level ${level}`).toContain(level);
    expect(late).toEqual([40, 60]);
  });

  it('ends below the top gear stage, because a price nobody reaches is not a price', () => {
    // Level 90 is 810,000 XP. The gear ladder may keep a horizon up there;
    // a shop may not, because "all bought" has to be a state that arrives.
    const last = levelsInOrder().at(-1)!;
    expect(last).toBeLessThan(GEAR_STAGE_LEVELS.at(-1)!);
  });

  it('costs, all in, the level the last kit lands at', () => {
    const total = ladder.reduce((sum, kit) => sum + (kit.price ?? 0), 0);
    expect(total).toBe(90_700);
    expect(levelFor(total / CURRENCY_RATE)).toBe(levelsInOrder().at(-1));
  });
});

describe('where a climber is on that ladder', () => {
  const ladder = shopOutfits().sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  const cheapest = ladder[0]!;
  const dearest = ladder.at(-1)!;
  const names = ladder.map((kit) => kit.name);

  it('points at the cheapest kit not yet owned, not the next one authored', () => {
    // Owning out of order is ordinary: a climber can save past the cheapest.
    const progress = shopProgress([ladder[1]!.name], 0);
    expect(progress.next?.name).toBe(cheapest.name);
    expect(progress.owned).toBe(1);
    expect(progress.total).toBe(ladder.length);
  });

  it('counts what is still to earn, and nothing below zero', () => {
    expect(shopProgress([], 0).short).toBe(cheapest.price);
    expect(shopProgress([], 200).short).toBe((cheapest.price ?? 0) - 200);
    expect(shopProgress([], cheapest.price ?? 0).short).toBe(0);
    expect(shopProgress([], 1_000_000).short).toBe(0);
  });

  it('runs out, and says so rather than counting on', () => {
    const done = shopProgress(names, 500_000);
    expect(done.next).toBeNull();
    expect(done.owned).toBe(ladder.length);
    expect(describeShop(done)).toBe(`All ${ladder.length} bought — nothing left to spend on.`);
  });

  it('says the count first at every rung, which is what makes the gap mean anything', () => {
    expect(describeShop(shopProgress([], 0))).toBe(
      `0 of ${ladder.length} bought. ${cheapest.name} next, ${(cheapest.price ?? 0).toLocaleString()} to go.`,
    );
    expect(describeShop(shopProgress(names.slice(0, -1), 0))).toContain(
      `${ladder.length - 1} of ${ladder.length} bought. ${dearest.name} next,`,
    );
  });

  it('stops saying "to go" once the coins are there', () => {
    const afford = describeShop(shopProgress([], cheapest.price ?? 0));
    expect(afford).toContain(`${cheapest.name} is yours for`);
    expect(afford).not.toContain('to go');
  });

  it('never names a kit that is already owned', () => {
    for (let i = 0; i < names.length; i += 1) {
      const said = describeShop(shopProgress(names.slice(0, i), 0));
      for (const owned of names.slice(0, i)) expect(said, owned).not.toContain(owned);
    }
  });
});

describe('what the skill trees promise', () => {
  const granted = cosmeticSources(SKILL_TREES);

  // The finding: 90 days outside earned "the Granite kit", which every
  // climber already had, and 50kg on a max hang earned an Iron kit that
  // existed in no list anywhere.
  it('gives every granted cosmetic a kit to actually wear', () => {
    for (const id of Object.keys(granted)) {
      const kit = earnedOutfits().find((o) => o.unlock === id);
      expect(kit, `nothing wears ${id}, granted by ${granted[id]}`).toBeDefined();
    }
  });

  it('has a granting node for every earned kit', () => {
    for (const outfit of earnedOutfits()) {
      expect(granted[outfit.unlock ?? ''], `${outfit.name} is unlocked by nothing`).toBeDefined();
    }
  });

  it('grants each cosmetic from exactly one node', () => {
    const ids = earnedOutfits().map((o) => o.unlock);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // A reward that names something is a promise about what you get.
  it('names the kit it grants', () => {
    for (const tree of SKILL_TREES) {
      for (const node of tree.nodes) {
        const effect = node.effect;
        if (effect === undefined || effect.kind !== 'cosmetic') continue;
        const kit = earnedOutfits().find((o) => o.unlock === effect.id)!;
        expect(effect.label.toLowerCase(), node.name).toContain(kit.name.toLowerCase());
      }
    }
  });
});

describe('the figure the picker offers (PLAN.md M225)', () => {
  it('offers both builds, labelled', () => {
    expect(FIGURES.map((f) => f.id)).toEqual(['male', 'female']);
    for (const { label } of FIGURES) expect(label.length).toBeGreaterThan(2);
  });

  it('offers as many hair colours as skin tones, all distinct', () => {
    // Fewer than the skin tones and the hair row would look like an
    // afterthought beside it; the two are picked independently, so the range
    // has to cover the same ground.
    expect(HAIR_TONES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(HAIR_TONES).size).toBe(HAIR_TONES.length);
    for (const tone of HAIR_TONES) expect(tone).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('starts every colour row on one of its own swatches', () => {
    /**
     * Found in the browser, which is the only place it shows: the default
     * hair was a colour the picker did not offer, so a fresh install opened
     * the card with six hair swatches and none of them selected. Skin got
     * this right by luck rather than by rule, and the rule is what was
     * missing — the two constants live in different modules precisely so the
     * table stays off the boot path, which is exactly the split that lets
     * them drift.
     */
    expect(HAIR_TONES).toContain(DEFAULT_PALETTE.hair);
    expect(SKIN_TONES).toContain(DEFAULT_PALETTE.skin);
  });

  it('spans dark to light rather than clustering in the browns', () => {
    // One narrow band would make five of the six indistinguishable at the
    // size a profile picture is drawn.
    const light = HAIR_TONES.map((t) => parseInt(t.slice(1, 3), 16));
    expect(Math.max(...light) - Math.min(...light)).toBeGreaterThan(120);
  });
});
