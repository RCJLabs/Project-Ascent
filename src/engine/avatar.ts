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
  top: string;
  shorts: string;
  shoes: string;
  gear: string;
}

export const DEFAULT_PALETTE: AvatarPalette = {
  skin: '#c68a5e',
  top: '#2f7bb0',
  shorts: '#35434e',
  shoes: '#eb6834',
  gear: '#5b6b78',
};

/** Skin is its own row because it is the one people want to match first. */
export const SKIN_TONES = [
  '#f2d3b8',
  '#e8b98c',
  '#c68a5e',
  '#a4673d',
  '#7a4a2c',
  '#4d2f1c',
] as const;

export interface Outfit {
  name: string;
  top: string;
  shorts: string;
  shoes: string;
  gear: string;
}

export const OUTFITS: Outfit[] = [
  { name: 'Glacier', top: '#2f7bb0', shorts: '#35434e', shoes: '#eb6834', gear: '#5b6b78' },
  { name: 'Granite', top: '#4c5d52', shorts: '#2b3138', shoes: '#d6b24a', gear: '#7b8a93' },
  { name: 'Sandstone', top: '#c2503f', shorts: '#3d3a44', shoes: '#1f2933', gear: '#8a7a6b' },
  { name: 'Alpine', top: '#e4e9ee', shorts: '#1f6f8b', shoes: '#f2b705', gear: '#48606e' },
  { name: 'Slate', top: '#5c6b7a', shorts: '#22303c', shoes: '#9fb3c8', gear: '#3d4b58' },
  { name: 'Chalk', top: '#f0efe9', shorts: '#7d7468', shoes: '#c2503f', gear: '#a89e91' },
];

export type AvatarPose = 'reach' | 'highstep' | 'hang';
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
      return 'highstep';
    case 'worked':
      return 'reach';
    case 'tired':
    case 'cooked':
      return 'hang';
    default:
      return 'reach';
  }
}

export interface AvatarConfig {
  pose: AvatarPose;
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
}

export function deriveAvatar(input: AvatarInput): AvatarConfig {
  const level = Math.max(0, input.level);
  return {
    pose: poseForVitality(input.vitality),
    ground: groundForHeight(input.feet ?? 0),
    gear: gearForLevel(level),
    palette: { ...DEFAULT_PALETTE, ...input.palette },
    stage: stageForLevel(level),
    next: nextStage(level),
  };
}
