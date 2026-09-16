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
 *
 * ## One per tree since M211
 *
 * There were three boons and **all three were in Dynamic Power** — Campus
 * Fluent, Airborne and its capstone. A climber who trained endurance for a
 * year got the speed-ramp hook their END stat earned and no boon at all, and
 * the tree explicitly about commitment granted nothing to the mode
 * explicitly about commitment. Four more, one per remaining tree, each a
 * mechanic that reads as what the tree is for.
 *
 * **The first two ids are lies and stay that way.** `boon-reach` grants a
 * chalk save and `boon-doublejump` grants coins, because reach and a second
 * jump were never written — that is the drift this file exists to stop, and
 * renaming the ids now would break nothing and teach nothing. The four added
 * here are named for what they do.
 *
 * **No import of `ascent/config`.** `content/skills.ts` reads `boonLabel`,
 * and this file having a runtime dependency would drag the arcade's tuning
 * table along behind it — see the note in `endings.ts` and the guard in
 * `perf.test.ts`. So the numbers below are the boons' own, and the tables
 * they scale (`POWERUP.slowmoMs`, `INVULNERABLE_MS`) are applied in
 * `game.ts` where those constants already live.
 */

export type BoonId =
  | 'boon-reach'
  | 'boon-doublejump'
  | 'boon-slowmo'
  | 'boon-second-life'
  | 'boon-pace'
  | 'boon-read'
  | 'boon-recover';

/**
 * Added to whatever END already earned, so the ceiling is
 * `HOOKS.maxRampReduction + BOON_RAMP` — 0.10 + 0.05 — and only a climber
 * holding this boon can reach past the stat's own limit.
 */
export const BOON_RAMP = 0.05;

/** Slow-mo and the forgiveness window, half again as long. */
export const BOON_STRETCH = 1.5;

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

  // Static Tension: the tree about holding on. A life is the only thing in
  // the game that lets a mistake not be the end of it — and Free Solo keeps
  // its one life whatever this says, which `createRun` enforces rather than
  // trusting the label.
  'boon-second-life': {
    id: 'boon-second-life',
    label: 'a second life on every run but Free Solo',
    apply: (mods) => ({ ...mods, extraLives: mods.extraLives + 1 }),
  },

  // Endurance: the wall's speed climbs with the clock, and this is the one
  // thing that slows that climb past what the END stat alone can buy.
  'boon-pace': {
    id: 'boon-pace',
    label: 'the wall speeds up more slowly',
    apply: (mods) => ({ ...mods, rampReduction: mods.rampReduction + BOON_RAMP }),
  },

  // Technique: on-sighting is reading the wall as you go, and slow-mo is the
  // only time the game gives you to read it.
  'boon-read': {
    id: 'boon-read',
    label: 'slow-mo lasts half again as long',
    apply: (mods) => ({ ...mods, slowmoScale: mods.slowmoScale * BOON_STRETCH }),
  },

  // Mental Grit: thirty unbroken weeks of turning up. What that buys is
  // longer on your feet after a knock, not fewer knocks.
  'boon-recover': {
    id: 'boon-recover',
    label: 'longer to recover after a hit',
    apply: (mods) => ({ ...mods, invulnScale: mods.invulnScale * BOON_STRETCH }),
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
