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

/**
 * How long the wall keeps getting harder.
 *
 * Speed caps at 480 px/s around 32 seconds, which is where the old tuning
 * put it and where the run stops *feeling* like it is accelerating. From
 * there to ninety seconds the pressure comes from density instead: rows
 * arrive closer together and more of them are obstacles. After ninety
 * seconds nothing changes again — the wall is as hard as it gets, and
 * staying on it is the whole test.
 */
export const DIFFICULTY = {
  rampSeconds: 90,
  /** Distance between rows, at the start and at full difficulty. */
  gap: { start: 240, end: 168 },
  /** Obstacle share of the spawn mix, in percent. Coins take the rest. */
  obstacleWeight: { start: 47.5, end: 66 },
  /** Power-ups hold their share throughout. */
  powerupWeight: 5,
} as const;

export const SPAWN = {
  /** Climbing before the first row, so a run does not open on a dodge. */
  grace: VIEW.height * 2,
  /**
   * Two obstacles arriving within this much of each other count as the same
   * moment. Debris drifts down between rows, so "one clear lane per row" is
   * not the same guarantee as "one clear lane at any instant".
   *
   * It is a fraction of the current gap rather than a constant: as rows
   * close up, "the same moment" has to shrink with them or the spawner
   * would refuse almost every obstacle and the wall would get *easier* the
   * longer you survived.
   */
  arrivalWindowRatio: 0.55,
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

/** 0 at the start of a run, 1 once difficulty has finished rising. */
export function difficultyAt(timeMs: number): number {
  return Math.max(0, Math.min(1, timeMs / 1000 / DIFFICULTY.rampSeconds));
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export function spawnGapAt(timeMs: number): number {
  return lerp(DIFFICULTY.gap.start, DIFFICULTY.gap.end, difficultyAt(timeMs));
}

export function arrivalWindowAt(timeMs: number): number {
  return spawnGapAt(timeMs) * SPAWN.arrivalWindowRatio;
}

/** The spawn mix at a moment: obstacles crowd out coins as the run goes on. */
export function spawnWeightsAt(timeMs: number): [string, number][] {
  const obstacle = lerp(
    DIFFICULTY.obstacleWeight.start,
    DIFFICULTY.obstacleWeight.end,
    difficultyAt(timeMs),
  );
  return [
    ['obstacle', obstacle],
    ['coin', 100 - DIFFICULTY.powerupWeight - obstacle],
    ['powerup', DIFFICULTY.powerupWeight],
  ];
}

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

/**
 * Training hooks, hard-capped so this stays a reflex game.
 *
 * All five stats reach the wall. Two of them did not until M31, which made
 * "what your training does here" a list with holes in it — a climber whose
 * training had gone into strength and technique saw the game acknowledge
 * none of it. The caps are what make this safe: the largest possible
 * advantage is small, and the payout on top of it is capped again by the
 * economy's game lane.
 */
export const HOOKS = {
  /** END trims the ramp by up to this fraction. */
  maxRampReduction: 0.1,
  /** AGI trims the hitbox by up to this fraction. */
  maxHitboxTrim: 0.12,
  /** MEN at or above this grants one chalk save. */
  chalkSaveStat: 55,
  /** TEC shortens the lane change by up to this fraction. */
  maxLaneTrim: 0.3,
  /** STR raises what a coin is worth by up to this fraction. */
  maxCoinBonus: 0.25,
} as const;
