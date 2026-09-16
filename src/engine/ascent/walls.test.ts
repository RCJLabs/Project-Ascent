import { describe, expect, it } from 'vitest';
import { contrast } from '@/ui/contrast';
import { OUTFITS } from '@/engine/kits';
import {
  WALLS,
  earnedWalls,
  freeWalls,
  lockNote,
  shopWalls,
  unlocked,
  wall,
  wallFor,
  type Wall,
  type WallAccess,
} from './walls';

const ACCESS = (over: Partial<WallAccess> = {}): WallAccess => ({
  feet: 0,
  owned: [],
  rested: false,
  ...over,
});

describe('the walls', () => {
  it('are all complete palettes, so no colour is ever undefined', () => {
    const keys = Object.keys(WALLS[0]!.palette).sort();
    for (const w of WALLS) {
      expect(Object.keys(w.palette).sort(), w.id).toEqual(keys);
      for (const [key, value] of Object.entries(w.palette)) {
        expect(value, `${w.id} ${key}`).toBeTruthy();
      }
    }
  });

  it('have distinct ids and names, and a line each', () => {
    expect(new Set(WALLS.map((w) => w.id)).size).toBe(WALLS.length);
    expect(new Set(WALLS.map((w) => w.name)).size).toBe(WALLS.length);
    for (const w of WALLS) expect(w.blurb.length, w.id).toBeGreaterThan(8);
  });

  it('share no name with a kit', () => {
    // Three of them did — Granite, Sandstone and Alpine are kits too — and
    // "you already own Granite" would be true of one and false of the other
    // on the same screen. They are separate buckets in the wallet for the
    // same reason; this keeps the copy honest as well as the storage.
    const kits = new Set(OUTFITS.map((o) => o.name));
    const clashes = shopWalls().filter((w) => kits.has(w.name));
    expect(clashes.map((w) => w.name)).toEqual([]);
  });

  it('are earned or bought, never both', () => {
    // The mixing M62 had to undo in the kit shop: something granted for
    // training must not also have a price on it.
    for (const w of WALLS) {
      const ways = [w.feet, w.price].filter((v) => v !== undefined).length;
      expect(ways, w.id).toBeLessThanOrEqual(1);
      if (w.rest === true) expect(ways, w.id).toBe(0);
    }
  });

  it('are opened by real climbing, never by playing', () => {
    /**
     * The one-way wall the game is built on: training feeds the game and the
     * game never feeds training. A wall earned by the altimeter is the good
     * direction — a wall earned by a *run* would be the bad one, so there is
     * no such field to set.
     */
    for (const w of earnedWalls()) expect(w.feet, w.id).toBeGreaterThan(0);
    expect(earnedWalls().length).toBeGreaterThanOrEqual(2);
    expect(freeWalls().length).toBeGreaterThanOrEqual(1);
    expect(shopWalls().length).toBeGreaterThanOrEqual(4);
  });

  it('price the bought ones in the kit shop band, cheapest first', () => {
    const prices = shopWalls().map((w) => w.price!);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(Math.min(...prices)).toBeGreaterThanOrEqual(1_000);
    expect(Math.max(...prices)).toBeLessThanOrEqual(50_000);
  });
});

describe('a wall is paint', () => {
  /**
   * The rule with teeth. Everything else here is taste; this is the one that
   * stops a cosmetic changing the game.
   *
   * A rock you cannot see is a rock that kills you, so the three obstacle
   * colours have to stand off the two rock colours and the sky behind them
   * on every wall — including the ones that cost thirty thousand coins,
   * where "hard to read" would be something a climber had *paid* for.
   */
  const OBSTACLES = ['rock', 'boulder', 'debris'] as const;
  /**
   * The fields, and `strata` is not one of them.
   *
   * It is a stroke — `ctx.strokeStyle = palette.strata`, one line every 64
   * units — so a rock crossing it is still read against the rock face either
   * side. Including it failed `recovery`, which has been drawn that way since
   * M31 and is perfectly readable; a rule that condemns a wall a climber has
   * been playing on for months is a rule measuring the wrong thing. `lane` is
   * out for the same reason, and it is translucent besides.
   */
  const BACKS = ['sky', 'rockNear', 'rockFar'] as const;

  it('never hides an obstacle in the wall behind it', () => {
    for (const w of WALLS) {
      for (const front of OBSTACLES) {
        for (const back of BACKS) {
          expect(
            contrast(w.palette[front], w.palette[back]),
            `${w.id}: ${front} on ${back}`,
          ).toBeGreaterThan(2);
        }
      }
    }
  });

  it('keeps the pickups apart from the obstacles', () => {
    // Taking a rock for a coin is the same mistake in the other direction.
    for (const w of WALLS) {
      for (const good of ['coin', 'heart', 'slowmo', 'magnet'] as const) {
        for (const back of BACKS) {
          expect(
            contrast(w.palette[good], w.palette[back]),
            `${w.id}: ${good} on ${back}`,
          ).toBeGreaterThan(2);
        }
      }
    }
  });

  it('keeps the read-out legible on the sky', () => {
    for (const w of WALLS) {
      expect(contrast(w.palette.ink, w.palette.sky), w.id).toBeGreaterThan(4.5);
    }
  });
});

describe('unlocking', () => {
  it('opens the free ones to everybody', () => {
    for (const w of freeWalls()) expect(unlocked(w, ACCESS()), w.id).toBe(true);
  });

  it('opens an earned wall at its height and not one foot below', () => {
    const sandstone = wall('sandstone')!;
    expect(unlocked(sandstone, ACCESS({ feet: sandstone.feet! - 1 }))).toBe(false);
    expect(unlocked(sandstone, ACCESS({ feet: sandstone.feet! }))).toBe(true);
  });

  it('opens a bought wall only once it is bought', () => {
    const [first] = shopWalls();
    expect(unlocked(first!, ACCESS({ feet: 1e9 }))).toBe(false);
    expect(unlocked(first!, ACCESS({ owned: [first!.id] }))).toBe(true);
  });

  it('gives the rest-day wall on a rest day and not otherwise', () => {
    const recovery = wall('recovery')!;
    expect(unlocked(recovery, ACCESS({ feet: 1e9, owned: ['recovery'] }))).toBe(false);
    expect(unlocked(recovery, ACCESS({ rested: true }))).toBe(true);
  });

  it('says what each locked one is waiting for, in its own currency', () => {
    for (const w of earnedWalls()) expect(lockNote(w, 'imperial')).toMatch(/altimeter/);
    for (const w of shopWalls()) expect(lockNote(w, 'imperial')).toMatch(/coins/);
    expect(lockNote(wall('recovery')!, 'imperial')).toMatch(/rest day/);
  });

  it('gives the height in the climber own units', () => {
    // Heights are stored in feet because the altimeter is. Nothing prints
    // them raw — M201's rule, and the first draft of this broke it.
    const sandstone = wall('sandstone')!;
    expect(lockNote(sandstone, 'imperial')).toContain('2,900 ft');
    expect(lockNote(sandstone, 'metric')).toContain('884 m');
    for (const w of shopWalls()) {
      expect(lockNote(w, 'metric'), w.id).toBe(lockNote(w, 'imperial'));
    }
  });
});

describe('which wall gets climbed', () => {
  it('keeps the old behaviour for anyone who never picks one', () => {
    // `null` is Automatic, and it is what every climber has had since M31.
    expect(wallFor(null, ACCESS()).id).toBe('granite');
    expect(wallFor(null, ACCESS({ feet: 2_899 })).id).toBe('granite');
    expect(wallFor(null, ACCESS({ feet: 2_900 })).id).toBe('sandstone');
    expect(wallFor(null, ACCESS({ feet: 500_000 })).id).toBe('alpine');
    expect(wallFor(null, ACCESS({ rested: true })).id).toBe('recovery');
    expect(wallFor(null, ACCESS({ feet: 500_000, rested: true })).id).toBe('recovery');
  });

  it('pins the one you picked, over the altimeter and over the rest day', () => {
    expect(wallFor('granite', ACCESS({ feet: 500_000 })).id).toBe('granite');
    expect(wallFor('granite', ACCESS({ rested: true })).id).toBe('granite');
    const bought = shopWalls()[0]!;
    expect(wallFor(bought.id, ACCESS({ owned: [bought.id] })).id).toBe(bought.id);
  });

  it('falls back rather than refusing to draw', () => {
    /**
     * The id is a string on a record that can be restored from a backup
     * file, so "the wall you chose is one you have not earned on this
     * device" is a state that will happen. A black canvas is the worst
     * available answer to it.
     */
    const bought = shopWalls()[0]!;
    expect(wallFor(bought.id, ACCESS()).id).toBe('granite');
    expect(wallFor('sandstone', ACCESS({ feet: 0 })).id).toBe('granite');
    expect(wallFor('a horse', ACCESS({ feet: 500_000 })).id).toBe('alpine');
    expect(wallFor('', ACCESS({ rested: true })).id).toBe('recovery');
  });

  it('always returns a wall with a palette', () => {
    const every: (string | null)[] = [null, 'a horse', ...WALLS.map((w: Wall) => w.id)];
    for (const id of every) {
      for (const access of [ACCESS(), ACCESS({ feet: 1e9, rested: true, owned: WALLS.map((w) => w.id) })]) {
        expect(wallFor(id, access).palette.sky, String(id)).toBeTruthy();
      }
    }
  });
});
