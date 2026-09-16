/**
 * The avatar, derived (PLAN.md §5.6, §9.1 — layered SVG, decided).
 *
 * The prototype generated six pixel-art portraits from an AI image model, so
 * the figure cost an API key and could never reflect anything but level
 * (AUDIT.md §4). This is a stack of coloured paths instead: every layer is
 * one value, so a cosmetic a skill tree unlocks is a row in a table rather
 * than a new asset, and the climber can look like the person using the app.
 *
 * Nothing is stored except the palette. Gear comes from your level, the
 * ground from your altimeter, and the posture from your vitality — so the
 * figure slumps when you are grinding without anyone deciding it should.
 */

import type { VitalityState } from './vitality';

export interface AvatarPalette {
  skin: string;
  hair: string;
  top: string;
  shorts: string;
  shoes: string;
  gear: string;
}

export const DEFAULT_PALETTE: AvatarPalette = {
  skin: '#c68a5e',
  hair: '#3b2a1e',
  top: '#2f7bb0',
  shorts: '#35434e',
  shoes: '#eb6834',
  gear: '#5b6b78',
};

/**
 * Which build the figure has (PLAN.md M225).
 *
 * Asked for in those words. It is a silhouette and nothing else: shoulders
 * against hips, whether there is a waist, how wide the neck is, and whether
 * the hair goes past the jaw. No content changes with it, no number moves,
 * and nothing in the app reads it except the code that draws the figure.
 *
 * The tones and labels the picker offers live in `engine/kits.ts` with the
 * rest of the cosmetics, because this module is on the boot path and that
 * one is not — M213's finding, and the reason the shop moved out.
 *
 * `male` is the default because it is the figure every existing install is
 * already looking at. Defaulting the other way would reshape a climber
 * somebody has been growing for months, without being asked.
 */
export type AvatarFigure = 'male' | 'female';

/** Skin is its own row because it is the one people want to match first. */
export const SKIN_TONES = [
  '#f2d3b8',
  '#e8b98c',
  '#c68a5e',
  '#a4673d',
  '#7a4a2c',
  '#4d2f1c',
] as const;

/**
 * Which of the three postures the figure takes, and it is a vitality tier
 * rather than a gesture.
 *
 * The names used to be `reach`, `highstep` and `hang`, which described what
 * the climbing figure did. Two tables draw a pose now — the climbing one the
 * Ascent animates, and the standing one the portrait shows — and a standing
 * figure called `highstep` is a lie in the type. The key names what the
 * climber has left; each table says what that looks like.
 */
export type AvatarPose = 'strong' | 'steady' | 'spent';
export type AvatarGround = 'gym' | 'rock' | 'alpine';

export interface AvatarGear {
  chalk: boolean;
  harness: boolean;
  rope: boolean;
  helmet: boolean;
  pack: boolean;
  jacket: boolean;
  axe: boolean;
}

export interface AvatarStage {
  level: number;
  name: string;
  unlock: string;
}

/** Six stages, each adding gear you can see. */
export const STAGES: AvatarStage[] = [
  { level: 0, name: 'Newcomer', unlock: 'Rental shoes' },
  { level: 8, name: 'Chalked up', unlock: 'Chalk bag' },
  { level: 20, name: 'Roped in', unlock: 'Harness' },
  { level: 40, name: 'On the sharp end', unlock: 'Rope and helmet' },
  { level: 60, name: 'Approach ready', unlock: 'Pack' },
  { level: 90, name: 'Alpinist', unlock: 'Jacket and axe' },
];

const GEAR_BY_LEVEL: [number, Partial<AvatarGear>][] = [
  [8, { chalk: true }],
  [20, { harness: true }],
  [40, { rope: true, helmet: true }],
  [60, { pack: true }],
  [90, { jacket: true, axe: true }],
];

/**
 * The levels at which the figure gains something to wear.
 *
 * Exported because the shop's prices are set against it (see `price` above,
 * and PLAN.md M213) and a rule that says so has to be able to read it.
 */
export const GEAR_STAGE_LEVELS: readonly number[] = GEAR_BY_LEVEL.map(([level]) => level);

const NO_GEAR: AvatarGear = {
  chalk: false,
  harness: false,
  rope: false,
  helmet: false,
  pack: false,
  jacket: false,
  axe: false,
};

export function gearForLevel(level: number): AvatarGear {
  const gear = { ...NO_GEAR };
  for (const [at, unlocks] of GEAR_BY_LEVEL) {
    if (level >= at) Object.assign(gear, unlocks);
  }
  return gear;
}

export function stageForLevel(level: number): AvatarStage {
  let current = STAGES[0]!;
  for (const stage of STAGES) if (level >= stage.level) current = stage;
  return current;
}

export function nextStage(level: number): AvatarStage | null {
  return STAGES.find((s) => s.level > level) ?? null;
}

/** Where you are standing, from the altimeter rather than your level. */
export function groundForHeight(feet: number): AvatarGround {
  if (feet >= 29_032) return 'alpine';
  if (feet >= 5_790) return 'rock';
  return 'gym';
}

/** Posture reads vitality: fresh climbers move, tired ones hang. */
export function poseForVitality(state: VitalityState | undefined): AvatarPose {
  switch (state) {
    case 'fresh':
      return 'strong';
    case 'worked':
      return 'steady';
    case 'tired':
    case 'cooked':
      return 'spent';
    default:
      return 'steady';
  }
}

export interface AvatarConfig {
  pose: AvatarPose;
  figure: AvatarFigure;
  ground: AvatarGround;
  gear: AvatarGear;
  palette: AvatarPalette;
  stage: AvatarStage;
  next: AvatarStage | null;
}

export interface AvatarInput {
  level: number;
  vitality?: VitalityState;
  /** Lifetime feet from the altimeter. */
  feet?: number;
  palette?: Partial<AvatarPalette>;
  figure?: AvatarFigure;
}

export function deriveAvatar(input: AvatarInput): AvatarConfig {
  const level = Math.max(0, input.level);
  return {
    pose: poseForVitality(input.vitality),
    figure: input.figure ?? 'male',
    ground: groundForHeight(input.feet ?? 0),
    gear: gearForLevel(level),
    palette: { ...DEFAULT_PALETTE, ...input.palette },
    stage: stageForLevel(level),
    next: nextStage(level),
  };
}
