/**
 * The Ascent — the simulation (PLAN.md §5.11).
 *
 * Pure logic, no canvas and no DOM. It advances in fixed ticks from a seeded
 * RNG, so a seed plus a sequence of inputs reproduces a run exactly on any
 * device at any frame rate — which is what lets the daily wall be the same
 * wall for everyone without a server.
 *
 * `step` mutates the state it is given rather than rebuilding it sixty times
 * a second. It is still deterministic, which is the property the tests hold
 * it to.
 */

import {
  CLIMBER,
  HOOKS,
  arrivalWindowAt,
  spawnGapAt,
  spawnWeightsAt,
  INVULNERABLE_MS,
  LANES,
  LANE_WIDTH,
  METRES_PER_PX,
  POWERUP,
  SIZES,
  SPAWN,
  SPEED,
  TICK_MS,
  VIEW,
} from './config';
import { applyBoons } from './boons';
import { createRng, next, nextInt, pickWeighted, type Rng } from './rng';

export type Mode = 'ascent' | 'freesolo';
export type ObstacleKind = 'rock' | 'boulder' | 'debris';
export type PickupKind = 'coin' | 'slowmo' | 'magnet' | 'heart';
export type EntityKind = ObstacleKind | PickupKind;

const OBSTACLES: ReadonlySet<string> = new Set<EntityKind>(['rock', 'boulder', 'debris']);
export const isObstacle = (kind: EntityKind): boolean => OBSTACLES.has(kind);

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Leftmost lane it occupies. */
  lane: number;
  lanes: number;
  /** Height up the wall where it sits. Debris drifts down. */
  worldY: number;
  width: number;
  height: number;
  fallRate: number;
  collected: boolean;
}

export interface Modifiers {
  /** END: trims the speed ramp, never the base. */
  rampReduction: number;
  /** AGI: trims the climber's hitbox. */
  hitboxTrim: number;
  /** MEN and skill boons: near-miss forgiveness, once each. */
  chalkSaves: number;
  /** TEC: shortens the lane change, so a committed move lands sooner. */
  laneTrim: number;
  /** STR and skill boons: what a coin is worth. */
  coinMultiplier: number;
  startWithSlowmo: boolean;
}

export const NO_MODIFIERS: Modifiers = {
  rampReduction: 0,
  hitboxTrim: 0,
  chalkSaves: 0,
  laneTrim: 0,
  coinMultiplier: 1,
  startWithSlowmo: false,
};

export type RunEvent =
  | { kind: 'coin'; value: number }
  | { kind: 'powerup'; type: Exclude<PickupKind, 'coin'> }
  | { kind: 'hit'; absorbed: 'life' | 'save' }
  | { kind: 'over' };

export interface RunState {
  mode: Mode;
  seed: number;
  rng: Rng;
  modifiers: Modifiers;

  timeMs: number;
  /**
   * Fixed ticks simulated so far (PLAN.md M81).
   *
   * The index a replay tape is keyed on. Counted rather than derived from
   * `timeMs / TICK_MS`: `timeMs` accumulates a non-terminating float
   * (1000/120) and a tape that drifts by one tick after twenty minutes
   * replays a different run.
   */
  ticks: number;
  accumulator: number;
  distance: number;
  speed: number;

  lane: number;
  fromLane: number;
  laneChangeMs: number;

  entities: Entity[];
  nextEntityId: number;
  nextSpawnDistance: number;

  lives: number;
  saves: number;
  coins: number;
  slowmoMs: number;
  invulnMs: number;
  /** False the moment a power-up is touched. */
  pure: boolean;
  over: boolean;
  /** Cleared at the start of every step; the renderer reads them for feedback. */
  events: RunEvent[];
  /**
   * A lane change waiting for the next tick.
   *
   * A frame can be shorter than a tick — 144 Hz is 6.9 ms against an 8.3 ms
   * tick — so an input handed to `step` on such a frame would simply vanish
   * if it were not held here.
   */
  pendingInput: Input;
}

export interface RunOptions {
  mode?: Mode;
  seed: number;
  modifiers?: Partial<Modifiers>;
}

export function createRun(options: RunOptions): RunState {
  const modifiers = { ...NO_MODIFIERS, ...options.modifiers };
  const mode = options.mode ?? 'ascent';
  return {
    mode,
    seed: options.seed,
    rng: createRng(options.seed),
    modifiers,
    timeMs: 0,
    ticks: 0,
    accumulator: 0,
    distance: 0,
    speed: SPEED.base,
    lane: 1,
    fromLane: 1,
    laneChangeMs: 0,
    entities: [],
    nextEntityId: 1,
    nextSpawnDistance: SPAWN.grace,
    lives: 1,
    saves: modifiers.chalkSaves,
    coins: 0,
    slowmoMs: modifiers.startWithSlowmo ? POWERUP.slowmoMs : 0,
    invulnMs: 0,
    pure: true,
    over: false,
    events: [],
    pendingInput: 0,
  };
}

/**
 * Modifiers from the climber's own stats and skill boons.
 *
 * Every stat is scaled from its base of 10, so a climber who has logged
 * nothing gets exactly nothing — the floor every stat starts on is not
 * training anyone did, and paying out for it would make the hooks read as
 * free rather than earned.
 */
export function modifiersFrom(input: {
  end?: number;
  agi?: number;
  men?: number;
  tec?: number;
  str?: number;
  boons?: readonly string[];
}): Modifiers {
  const scale = (stat: number | undefined, cap: number) =>
    Math.max(0, Math.min(cap, ((stat ?? 10) - 10) / 90 * cap));

  const base: Modifiers = {
    rampReduction: scale(input.end, HOOKS.maxRampReduction),
    hitboxTrim: scale(input.agi, HOOKS.maxHitboxTrim),
    chalkSaves: (input.men ?? 0) >= HOOKS.chalkSaveStat ? 1 : 0,
    laneTrim: scale(input.tec, HOOKS.maxLaneTrim),
    coinMultiplier: 1 + scale(input.str, HOOKS.maxCoinBonus),
    startWithSlowmo: false,
  };
  return applyBoons(base, input.boons ?? []);
}

/** How long a lane change takes for this run, with TEC's trim applied. */
export function laneChangeDuration(modifiers: Modifiers): number {
  return CLIMBER.laneChangeMs * (1 - modifiers.laneTrim);
}

export function laneCenter(lane: number, lanes = 1): number {
  return (lane + lanes / 2) * LANE_WIDTH;
}

/** The climber's x, mid lane-change. */
export function climberX(state: RunState): number {
  if (state.laneChangeMs <= 0) return laneCenter(state.lane);
  const t = 1 - state.laneChangeMs / laneChangeDuration(state.modifiers);
  return laneCenter(state.fromLane) + (laneCenter(state.lane) - laneCenter(state.fromLane)) * t;
}

export function metres(state: RunState): number {
  return Math.floor(state.distance * METRES_PER_PX);
}

/** Where an entity sits on screen, given the climber is fixed at CLIMBER.y. */
export function screenY(state: RunState, entity: Entity): number {
  return CLIMBER.y - (entity.worldY - state.distance);
}

function currentSpeed(state: RunState): number {
  const ramp = SPEED.rampPerSecond * (1 - state.modifiers.rampReduction);
  const raw = Math.min(SPEED.max, SPEED.base + ramp * (state.timeMs / 1000));
  const mode = state.mode === 'freesolo' ? SPEED.freeSoloMultiplier : 1;
  const slow = state.slowmoMs > 0 ? SPEED.slowmoMultiplier : 1;
  return raw * mode * slow;
}

export type Input = -1 | 0 | 1;

/**
 * Advance by real time. Input is applied once, at the first tick, so holding
 * a key does not stack lane changes.
 */
export function step(state: RunState, dtMs: number, input: Input = 0): RunState {
  state.events = [];
  if (state.over) return state;

  if (input !== 0) state.pendingInput = input;

  // Never simulate more than a quarter second in one call: a backgrounded
  // tab must not resume by fast-forwarding the climber into an obstacle.
  state.accumulator = Math.min(state.accumulator + dtMs, 250);

  while (state.accumulator >= TICK_MS && !state.over) {
    state.accumulator -= TICK_MS;
    tick(state, TICK_MS);
  }
  return state;
}

function tick(state: RunState, dt: number): void {
  const seconds = dt / 1000;
  state.ticks += 1;

  // A queued input survives an in-progress lane change and fires the moment
  // it finishes. Dropping it would make the double-tap that crosses two
  // lanes — the only answer to a boulder pinning you against the wall —
  // fail for no reason the player can see.
  if (state.pendingInput !== 0 && state.laneChangeMs <= 0) {
    const target = Math.max(0, Math.min(LANES - 1, state.lane + state.pendingInput));
    state.pendingInput = 0;
    if (target !== state.lane) {
      state.fromLane = state.lane;
      state.lane = target;
      state.laneChangeMs = laneChangeDuration(state.modifiers);
    }
  }

  state.timeMs += dt;
  state.laneChangeMs = Math.max(0, state.laneChangeMs - dt);
  state.slowmoMs = Math.max(0, state.slowmoMs - dt);
  state.invulnMs = Math.max(0, state.invulnMs - dt);

  state.speed = currentSpeed(state);
  state.distance += state.speed * seconds;

  for (const entity of state.entities) {
    if (entity.fallRate > 0) entity.worldY -= state.speed * entity.fallRate * seconds;
  }

  while (state.nextSpawnDistance < state.distance + VIEW.height) {
    spawnRow(state, state.nextSpawnDistance);
    state.nextSpawnDistance += spawnGapAt(state.timeMs);
  }

  collide(state);

  // Anything below the climber by more than a climber's height is gone.
  const floor = state.distance - CLIMBER.y;
  state.entities = state.entities.filter((e) => !e.collected && e.worldY > floor);
}

/**
 * When an entity reaches the climber, in climbed distance.
 *
 * Static things arrive where they sit. Debris drifts down while the climber
 * climbs, so it closes at 1 + fallRate and arrives sooner — which is what
 * makes it a timing dodge, and what makes per-row spacing insufficient on
 * its own.
 */
function arrivalOf(state: RunState, entity: Pick<Entity, 'worldY' | 'fallRate'>): number {
  return state.distance + (entity.worldY - state.distance) / (1 + entity.fallRate);
}

/** Lanes already threatened at roughly this moment by anything on screen. */
function threatenedAt(state: RunState, arrival: number): Set<number> {
  const lanes = new Set<number>();
  for (const entity of state.entities) {
    if (entity.collected || !isObstacle(entity.kind)) continue;
    if (Math.abs(arrivalOf(state, entity) - arrival) > arrivalWindowAt(state.timeMs)) continue;
    for (let l = entity.lane; l < entity.lane + entity.lanes; l++) lanes.add(l);
  }
  return lanes;
}

function spawnRow(state: RunState, worldY: number): void {
  const count = next(state.rng) < 0.65 ? 1 : SPAWN.maxPerRow;
  const taken = new Set<number>();
  /** Lanes this row's own obstacles have claimed, for the wall check. */
  const rowBlocked = new Set<number>();
  const row: Entity[] = [];

  for (let i = 0; i < count; i++) {
    const category = pickWeighted(state.rng, spawnWeightsAt(state.timeMs));
    let kind: EntityKind;
    if (category === 'obstacle') {
      kind = pickWeighted(state.rng, SPAWN.obstacles as unknown as [ObstacleKind, number][]);
    } else if (category === 'powerup') {
      const table = (
        state.mode === 'freesolo'
          ? SPAWN.powerups.filter(([type]) => type !== 'heart')
          : SPAWN.powerups
      ) as unknown as [PickupKind, number][];
      kind = pickWeighted(state.rng, table);
    } else {
      kind = 'coin';
    }

    let size = SIZES[kind === 'slowmo' || kind === 'magnet' || kind === 'heart' ? 'powerup' : kind];

    // An obstacle may not share a lane with anything already arriving at
    // roughly the same moment...
    const threat = isObstacle(kind)
      ? threatenedAt(state, arrivalOf(state, { worldY, fallRate: size.fallRate }))
      : new Set<number>();
    const blocked = new Set([...taken, ...threat]);

    let lane = placeLane(state, size.lanes, blocked);

    // ...and it may not be the one that closes the last gap. Debris drifts
    // between rows, so a row that looks clear on its own can still complete
    // a wall with the row before it. Whichever obstacle would do that
    // becomes a coin, which is the safety valve the whole spawner rests on.
    if (isObstacle(kind) && lane !== null) {
      const wall = new Set([...threat, ...rowBlocked]);
      for (let l = lane; l < lane + size.lanes; l++) wall.add(l);
      if (wall.size >= LANES) {
        kind = 'coin';
        size = SIZES.coin;
        lane = placeLane(state, 1, taken);
      }
    }

    if (lane === null) continue;
    for (let l = lane; l < lane + size.lanes; l++) {
      taken.add(l);
      if (isObstacle(kind)) rowBlocked.add(l);
    }

    row.push({
      id: state.nextEntityId++,
      kind,
      lane,
      lanes: size.lanes,
      worldY,
      width: size.width,
      height: size.height,
      fallRate: size.fallRate,
      collected: false,
    });
  }

  state.entities.push(...row);
}

/** A free run of `width` lanes, or null when the row is full. */
function placeLane(state: RunState, width: number, taken: Set<number>): number | null {
  const options: number[] = [];
  for (let lane = 0; lane + width <= LANES; lane++) {
    let free = true;
    for (let l = lane; l < lane + width; l++) if (taken.has(l)) free = false;
    if (free) options.push(lane);
  }
  if (options.length === 0) return null;
  return options[nextInt(state.rng, options.length)]!;
}

function collide(state: RunState): void {
  const cx = climberX(state);
  const trim = 1 - state.modifiers.hitboxTrim;
  const halfW = (CLIMBER.width * trim) / 2;
  const halfH = (CLIMBER.height * trim) / 2;

  for (const entity of state.entities) {
    if (entity.collected) continue;
    const dy = Math.abs(entity.worldY - state.distance);
    if (dy > halfH + entity.height / 2) continue;
    const dx = Math.abs(laneCenter(entity.lane, entity.lanes) - cx);
    if (dx > halfW + entity.width / 2) continue;

    if (isObstacle(entity.kind)) {
      if (state.invulnMs > 0) continue;
      entity.collected = true;
      absorbHit(state);
      continue;
    }

    entity.collected = true;
    collect(state, entity.kind as PickupKind);
  }
}

function absorbHit(state: RunState): void {
  if (state.saves > 0) {
    state.saves--;
    state.invulnMs = INVULNERABLE_MS;
    state.events.push({ kind: 'hit', absorbed: 'save' });
    return;
  }
  state.lives--;
  state.events.push({ kind: 'hit', absorbed: 'life' });
  if (state.lives <= 0) {
    state.over = true;
    state.events.push({ kind: 'over' });
  } else {
    state.invulnMs = INVULNERABLE_MS;
  }
}

function collect(state: RunState, kind: PickupKind): void {
  if (kind === 'coin') {
    const value = state.modifiers.coinMultiplier;
    state.coins += value;
    state.events.push({ kind: 'coin', value });
    return;
  }

  // Touching any power-up ends a pure run, including one that does nothing
  // because you were already at full lives.
  state.pure = false;
  state.events.push({ kind: 'powerup', type: kind });

  if (kind === 'slowmo') state.slowmoMs = POWERUP.slowmoMs;
  else if (kind === 'heart') state.lives = Math.min(POWERUP.maxLives, state.lives + 1);
  else if (kind === 'magnet') sweepCoins(state);
}

/**
 * The magnet takes every coin currently on screen.
 *
 * An entity sits at screen y = CLIMBER.y - (worldY - distance), so the top
 * of the screen is `distance + CLIMBER.y` and the bottom is
 * `distance - (VIEW.height - CLIMBER.y)`. Getting that backwards makes the
 * magnet sweep a band that is mostly off-screen.
 */
function sweepCoins(state: RunState): void {
  const top = state.distance + CLIMBER.y;
  const bottom = state.distance - (VIEW.height - CLIMBER.y);
  for (const entity of state.entities) {
    if (entity.collected || entity.kind !== 'coin') continue;
    if (entity.worldY > top || entity.worldY < bottom) continue;
    entity.collected = true;
    state.coins += state.modifiers.coinMultiplier;
    state.events.push({ kind: 'coin', value: state.modifiers.coinMultiplier });
  }
}
