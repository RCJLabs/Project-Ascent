import { describe, expect, it } from 'vitest';
import { OUTFITS, earnedOutfits, freeOutfits, shopOutfits } from './avatar';
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
