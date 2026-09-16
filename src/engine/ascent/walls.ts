/**
 * The walls the Ascent is climbed on, and the three ways to have one
 * (PLAN.md M227).
 *
 * Four of these existed from M31 and none of them could be chosen: the
 * palette was picked for you from the altimeter, with a lighter one forced
 * on rest days, and the page listed them read-only. Asked for as "unlockable
 * themes for the Ascent game to change the looks", which is most of the way
 * to what was already there — the part missing was the picking.
 *
 * Its own module rather than a section of `features/ascent/render.ts` for
 * M213's reason, one layer along: the chosen wall is an id on the wallet, so
 * `store/game.ts` and `db/game.ts` — both read before anything renders —
 * carry a string and never this table. `perf.test.ts` holds that.
 *
 * **A wall is paint.** Nothing here reaches the run: the same seed on the
 * same day plays the same wall whichever one you are looking at, and the
 * obstacles are held to a contrast against the rock behind them so a
 * cosmetic cannot make the game harder. `walls.test.ts` is the rule.
 */

import { formatHeight, type UnitSystem } from '@/engine/units';

export interface Palette {
  sky: string;
  rockNear: string;
  rockFar: string;
  strata: string;
  lane: string;
  rock: string;
  boulder: string;
  debris: string;
  coin: string;
  slowmo: string;
  magnet: string;
  heart: string;
  ink: string;
}

export interface Wall {
  id: string;
  name: string;
  /** One line, in climbing terms, for the row under the name. */
  blurb: string;
  palette: Palette;
  /**
   * Earned by the altimeter — lifetime feet of real climbing.
   *
   * This is the one-way wall the game is built on (see `GamePage`): training
   * feeds the game and the game never feeds training. A wall you unlock by
   * climbing is the good direction; a wall that unlocked *by playing* would
   * be the bad one, so there is no such row here.
   */
  feet?: number;
  /** Bought from the balance, like a kit. Never also earned. */
  price?: number;
  /** Given on a logged rest day, and not otherwise pickable. */
  rest?: boolean;
}

export const WALLS: Wall[] = [
  {
    id: 'granite',
    name: 'Granite',
    blurb: 'Where everyone starts.',
    palette: {
      sky: '#1b2733', rockNear: '#2e3d4c', rockFar: '#243141', strata: '#35465a',
      lane: 'rgba(255,255,255,0.05)', rock: '#8a97a5', boulder: '#6d7d8d', debris: '#c2ccd6',
      coin: '#f2b705', slowmo: '#5aa3d4', magnet: '#b57edc', heart: '#e2574c', ink: '#e8eef3',
    },
  },
  {
    id: 'recovery',
    name: 'Recovery skies',
    blurb: 'The weather on a logged rest day.',
    rest: true,
    palette: {
      sky: '#22384a', rockNear: '#365065', rockFar: '#2b4155', strata: '#436a85',
      lane: 'rgba(255,255,255,0.07)', rock: '#9fb6c9', boulder: '#7f9ab0', debris: '#d9e6f0',
      coin: '#ffd97d', slowmo: '#8fd0f0', magnet: '#cfa8e8', heart: '#ef7f74', ink: '#eef6fb',
    },
  },

  // Earned by the altimeter. Real climbing, and nothing else, opens these.
  {
    id: 'sandstone',
    name: 'Sandstone',
    blurb: 'Desert rock, and the first thing your altimeter buys you.',
    feet: 2_900,
    palette: {
      sky: '#2b1d18', rockNear: '#4a2f24', rockFar: '#3a251d', strata: '#5d3b2c',
      lane: 'rgba(255,255,255,0.05)', rock: '#c98b5f', boulder: '#a86f47', debris: '#e8c9a8',
      coin: '#ffd166', slowmo: '#6fb3d9', magnet: '#c48fd6', heart: '#e2574c', ink: '#f6ece3',
    },
  },
  {
    id: 'alpine',
    name: 'Alpine',
    blurb: 'Everest, in feet, on your own altimeter.',
    feet: 29_032,
    palette: {
      sky: '#101c28', rockNear: '#22323f', rockFar: '#1a2733', strata: '#2c4050',
      lane: 'rgba(255,255,255,0.06)', rock: '#b9c9d6', boulder: '#94a8b8', debris: '#e9f2f8',
      coin: '#ffd166', slowmo: '#7dc3e8', magnet: '#c8a4e0', heart: '#e2574c', ink: '#eef6fb',
    },
  },

  // Bought. One balance pays for these and for the kits, so they are rungs
  // of the same ladder rather than a second one — which is the thing M227
  // got wrong by pricing them "in the same band" and leaving it there. The
  // ladder, and what each rung is spaced against, is `engine/shop.ts`
  // (PLAN.md M233).
  {
    id: 'limestone',
    name: 'Limestone',
    blurb: 'Blue tufas and a hot sky.',
    price: 2_000,
    palette: {
      sky: '#1d3140', rockNear: '#3b4f55', rockFar: '#2c3d44', strata: '#4d6a6f',
      lane: 'rgba(255,255,255,0.06)', rock: '#cbb994', boulder: '#a6946f', debris: '#efe4c9',
      coin: '#ffd166', slowmo: '#69c0e0', magnet: '#c9a0e4', heart: '#e2574c', ink: '#eef4f6',
    },
  },
  {
    id: 'gritstone',
    name: 'Gritstone',
    blurb: 'Dark, rounded and unfriendly. No holds.',
    price: 4_400,
    palette: {
      sky: '#241f1c', rockNear: '#3d352f', rockFar: '#2e2823', strata: '#4f453c',
      lane: 'rgba(255,255,255,0.05)', rock: '#a99172', boulder: '#87735a', debris: '#e0d2ba',
      coin: '#f2b705', slowmo: '#6fb3d9', magnet: '#bb8fd6', heart: '#e2574c', ink: '#f2ebe2',
    },
  },
  {
    id: 'seacliff',
    name: 'Sea cliff',
    blurb: 'Green rock over deep water. The fall is the least of it.',
    price: 5_200,
    palette: {
      sky: '#0f2c2e', rockNear: '#1f4445', rockFar: '#173536', strata: '#2a5a5a',
      lane: 'rgba(255,255,255,0.06)', rock: '#9fc4ae', boulder: '#7aa48d', debris: '#dcefe2',
      coin: '#ffd166', slowmo: '#72cbd2', magnet: '#c3a3e0', heart: '#ef6a5e', ink: '#e9f6f0',
    },
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    blurb: 'A headtorch, and the rest of the route in the dark.',
    price: 6_800,
    palette: {
      sky: '#0c1020', rockNear: '#1d2340', rockFar: '#151a30', strata: '#2b3358',
      lane: 'rgba(255,255,255,0.07)', rock: '#aab4e0', boulder: '#8690c2', debris: '#e4e8ff',
      coin: '#ffe08a', slowmo: '#8fd6f5', magnet: '#d3b0f0', heart: '#f0736a', ink: '#eef1ff',
    },
  },

  // Added at M233, to fill the stretch of the ladder that had one rung in
  // it. Picked to be told apart from what is already here at a glance:
  // Moonlight is the night wall and Volcanic the black one, so this is warm
  // rock in low sun.
  {
    id: 'desert',
    name: 'Desert tower',
    blurb: 'Soft golden sandstone, a long way from the road.',
    price: 8_400,
    palette: {
      sky: '#2e2113', rockNear: '#5c3f1c', rockFar: '#412c14', strata: '#6b4d21',
      lane: 'rgba(255,255,255,0.06)', rock: '#e8bb63', boulder: '#c79a45', debris: '#f7e8bd',
      coin: '#ffd166', slowmo: '#6fb3d9', magnet: '#cf9ae0', heart: '#ef6a5e', ink: '#fbeade',
    },
  },
  {
    id: 'volcanic',
    name: 'Volcanic',
    blurb: 'Black rock, and the glow behind it.',
    price: 9_200,
    palette: {
      sky: '#1a0f12', rockNear: '#33201f', rockFar: '#241617', strata: '#552a22',
      lane: 'rgba(255,255,255,0.06)', rock: '#d99a6c', boulder: '#b57850', debris: '#f5d9bc',
      coin: '#ffca45', slowmo: '#6fb3d9', magnet: '#cf9ae0', heart: '#ff7a68', ink: '#f8e9e2',
    },
  },
  {
    id: 'quartzite',
    name: 'Quartzite',
    blurb: 'Pale banded rock, no features, and a hard blue sky.',
    price: 10_800,
    palette: {
      sky: '#12283d', rockNear: '#4a5560', rockFar: '#37414b', strata: '#5f6d7a',
      lane: 'rgba(255,255,255,0.06)', rock: '#d8d2c4', boulder: '#b3aa98', debris: '#f2ece0',
      coin: '#ffd166', slowmo: '#7dc3e8', magnet: '#c8a4e0', heart: '#e2574c', ink: '#f4f2ec',
    },
  },
];

const byId = new Map(WALLS.map((wall) => [wall.id, wall]));

export function wall(id: string): Wall | undefined {
  return byId.get(id);
}

/** Free from the first run, rest-day weather aside. */
export function freeWalls(): Wall[] {
  return WALLS.filter((w) => w.feet === undefined && w.price === undefined && w.rest !== true);
}

/** Opened by the altimeter, and never for sale. */
export function earnedWalls(): Wall[] {
  return WALLS.filter((w) => w.feet !== undefined);
}

/** Bought from the balance, and never granted. */
export function shopWalls(): Wall[] {
  return WALLS.filter((w) => w.price !== undefined);
}

export interface WallAccess {
  /** Lifetime feet on the altimeter. */
  feet: number;
  /** Wall ids already bought. */
  owned: readonly string[];
  /** Whether a rest day has been logged today. */
  rested: boolean;
}

/** Whether this wall can be climbed right now. */
export function unlocked(w: Wall, access: WallAccess): boolean {
  if (w.rest === true) return access.rested;
  if (w.feet !== undefined) return access.feet >= w.feet;
  if (w.price !== undefined) return access.owned.includes(w.id);
  return true;
}

/**
 * What a locked wall is waiting for, in one line.
 *
 * Never a price for an earned wall and never a height for a bought one:
 * mixing the two is what M62 had to undo in the kit shop, where three
 * capstones granted things that were free to everyone anyway.
 *
 * **In the climber's own units**, which is not a nicety: the first version
 * of this printed `2,900 ft` whatever the setting, and M201's rule about
 * exactly that — the wall list is the example it uses — caught it. Heights
 * are stored in feet because the altimeter is; nothing prints them raw.
 */
export function lockNote(w: Wall, units: UnitSystem): string {
  if (w.rest === true) return 'On a logged rest day';
  if (w.feet !== undefined) return `${formatHeight(w.feet, units)} on the altimeter`;
  if (w.price !== undefined) return `${w.price.toLocaleString()} coins`;
  return '';
}

/**
 * The wall to climb, given what has been chosen and what is open.
 *
 * `null` is **Auto**, which is what every climber has had since M31 and what
 * they keep unless they touch this: the best wall the altimeter has opened,
 * with rest-day weather over the top of it. Picking one pins it.
 *
 * A chosen wall that is not open falls back to Auto rather than refusing to
 * draw. The id is a string on a record that can be restored from a backup
 * file, so "the wall you chose is one you have not earned on this device" is
 * a state that will happen, and a black canvas is the worst answer to it.
 */
export function wallFor(chosen: string | null, access: WallAccess): Wall {
  if (chosen !== null) {
    const picked = wall(chosen);
    if (picked !== undefined && unlocked(picked, access)) return picked;
  }
  if (access.rested) return wall('recovery')!;
  let best = WALLS[0]!;
  for (const w of earnedWalls()) if (access.feet >= (w.feet ?? 0)) best = w;
  return best;
}
