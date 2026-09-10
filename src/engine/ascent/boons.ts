import type { Modifiers } from './game';

/**
 * What a skill node actually grants in The Ascent (PLAN.md M31).
 *
 * **One table, because there were two and they disagreed.** The skill tree
 * carried a label and the game carried an effect, written in different files
 * months apart, and two of the three had drifted: "Campus Fluent — start
 * each run with a longer reach" granted a chalk save, and "Airborne — one
 * extra lane jump per run" granted half again as many coins. Neither reach
 * nor a second jump exists in the game at all. A climber who trained for
 * forty power drills was told they had earned a mechanic that had never been
 * written.
 *
 * So the label and the effect live in the same object, `content/skills.ts`
 * reads the label from here, and the two cannot drift again without someone
 * editing one line to contradict itself.
 */

export type BoonId = 'boon-reach' | 'boon-doublejump' | 'boon-slowmo';

export interface Boon {
  id: BoonId;
  /** What it does, in the words both the tree and the game use. */
  label: string;
  apply: (mods: Modifiers) => Modifiers;
}

export const BOONS: Record<BoonId, Boon> = {
  'boon-reach': {
    id: 'boon-reach',
    label: 'one extra chalk save each run',
    apply: (mods) => ({ ...mods, chalkSaves: mods.chalkSaves + 1 }),
  },
  'boon-doublejump': {
    id: 'boon-doublejump',
    label: 'coins are worth half again as much',
    apply: (mods) => ({ ...mods, coinMultiplier: mods.coinMultiplier * 1.5 }),
  },
  'boon-slowmo': {
    id: 'boon-slowmo',
    label: 'begin every run with a slow-mo charge',
    apply: (mods) => ({ ...mods, startWithSlowmo: true }),
  },
};

export const BOON_IDS = Object.keys(BOONS) as BoonId[];

export function boonLabel(id: BoonId): string {
  return BOONS[id].label;
}

/** Apply every boon the climber holds. Unknown ids are ignored, not guessed. */
export function applyBoons(mods: Modifiers, held: readonly string[]): Modifiers {
  let out = mods;
  for (const id of BOON_IDS) {
    if (held.includes(id)) out = BOONS[id].apply(out);
  }
  return out;
}
