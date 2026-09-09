/**
 * The Ascent's tuning, in one table (PLAN.md §5.11).
 *
 * The simulation runs in a fixed virtual resolution and a fixed timestep, so
 * a seed produces the same run on every device and at every frame rate.
 * Without both, "Daily Wall #214" would mean something different on each
 * phone and the shared seed would be decoration.
 */

export const VIEW = { width: 360, height: 640 } as const;
export const LANES = 3;
export const LANE_WIDTH = VIEW.width / LANES;

/** Where the climber sits, and how long a lane change takes. */
export const CLIMBER = {
  y: VIEW.height * 0.74,
  width: LANE_WIDTH * 0.44,
  height: 46,
  laneChangeMs: 110,
} as const;

export const SPEED = {
  base: 220,
  /** Added per second elapsed. END trims this, never the base. */
  rampPerSecond: 8,
  max: 480,
  freeSoloMultiplier: 1.3,
  slowmoMultiplier: 0.5,
} as const;

/** 1 px climbed is 0.4 m, from the old tuning. */
export const METRES_PER_PX = 0.4;

export const SPAWN = {
  /** Distance between spawn rows, so density does not change with speed. */
  gap: 240,
  /** Climbing before the first row, so a run does not open on a dodge. */
  grace: VIEW.height * 2,
  /**
   * Two obstacles arriving within this much of each other count as the same
   * moment. Debris drifts down between rows, so "one clear lane per row" is
   * not the same guarantee as "one clear lane at any instant".
   */
  arrivalWindow: 130,
  /** The mix, as the plan specifies it. */
  weights: [
    ['obstacle', 47.5],
    ['coin', 47.5],
    ['powerup', 5],
  ] as const,
  obstacles: [
    ['rock', 60],
    ['boulder', 25],
    ['debris', 15],
  ] as const,
  powerups: [
    ['slowmo', 45],
    ['magnet', 35],
    ['heart', 20],
  ] as const,
  /** A row may hold this many entities at most. */
  maxPerRow: 2,
} as const;

export const SIZES = {
  rock: { width: LANE_WIDTH * 0.72, height: 34, lanes: 1, fallRate: 0 },
  boulder: { width: LANE_WIDTH * 1.62, height: 44, lanes: 2, fallRate: 0 },
  /** Small and half again as fast — a timing dodge rather than a spatial one. */
  debris: { width: LANE_WIDTH * 0.36, height: 22, lanes: 1, fallRate: 0.5 },
  coin: { width: 22, height: 22, lanes: 1, fallRate: 0 },
  powerup: { width: 28, height: 28, lanes: 1, fallRate: 0 },
} as const;

export const POWERUP = {
  slowmoMs: 5000,
  maxLives: 3,
} as const;

/** Forgiveness window after a hit that a life or a chalk save absorbed. */
export const INVULNERABLE_MS = 900;

/** Fixed simulation tick. Everything advances in these, never in frame time. */
export const TICK_MS = 1000 / 120;

/** Training hooks, hard-capped so this stays a reflex game. */
export const HOOKS = {
  /** END trims the ramp by up to this fraction. */
  maxRampReduction: 0.1,
  /** AGI trims the hitbox by up to this fraction. */
  maxHitboxTrim: 0.12,
  /** MEN at or above this grants one chalk save. */
  chalkSaveStat: 55,
} as const;
