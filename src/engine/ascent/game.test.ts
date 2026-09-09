import { describe, expect, it } from 'vitest';
import { DIFFICULTY, HOOKS, LANES, POWERUP, SPAWN, SPEED, VIEW, arrivalWindowAt, difficultyAt, spawnGapAt, spawnWeightsAt } from './config';
import {
  createRun,
  isObstacle,
  metres,
  modifiersFrom,
  step,
  type Entity,
  type Input,
  type RunState,
} from './game';
import { createRng, dailySeed, next, pickWeighted } from './rng';

/** Play a run to its end, or until `maxMs`, with a scripted input stream. */
function play(state: RunState, maxMs: number, inputs: (t: number) => Input = () => 0): RunState {
  for (let t = 0; t < maxMs && !state.over; t += 16) step(state, 16, inputs(t));
  return state;
}

describe('the seeded RNG', () => {
  it('reproduces a sequence from a seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const drawsA = Array.from({ length: 20 }, () => next(a));
    const drawsB = Array.from({ length: 20 }, () => next(b));
    expect(drawsA).toEqual(drawsB);
    expect(new Set(drawsA).size).toBe(20);
  });

  it('stays inside [0, 1) and differs between seeds', () => {
    const rng = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = next(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(next(createRng(1))).not.toBe(next(createRng(2)));
  });

  it('survives a zero seed rather than getting stuck', () => {
    const rng = createRng(0);
    expect(new Set(Array.from({ length: 10 }, () => next(rng))).size).toBe(10);
  });

  it('gives one date one wall, and different dates different walls', () => {
    expect(dailySeed('2026-09-09')).toBe(dailySeed('2026-09-09'));
    expect(dailySeed('2026-09-09')).not.toBe(dailySeed('2026-09-10'));
  });

  it('respects a weighted table', () => {
    const rng = createRng(99);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 4000; i++) {
      counts[pickWeighted(rng, [['a', 90], ['b', 10]] as [('a' | 'b'), number][])]++;
    }
    expect(counts.a / 4000).toBeGreaterThan(0.85);
    expect(counts.a / 4000).toBeLessThan(0.95);
  });
});

describe('determinism', () => {
  it('replays the same run from the same seed and inputs', () => {
    const script = (t: number): Input => (t % 640 === 0 ? 1 : t % 960 === 0 ? -1 : 0);
    const a = play(createRun({ seed: 4242 }), 30_000, script);
    const b = play(createRun({ seed: 4242 }), 30_000, script);
    expect(metres(b)).toBe(metres(a));
    expect(b.coins).toBe(a.coins);
    expect(b.over).toBe(a.over);
    expect(b.entities.map((e) => e.id)).toEqual(a.entities.map((e) => e.id));
  });

  it('does not depend on frame rate', () => {
    const smooth = createRun({ seed: 777 });
    for (let i = 0; i < 600; i++) step(smooth, 1000 / 60);
    const choppy = createRun({ seed: 777 });
    for (let i = 0; i < 200; i++) step(choppy, 1000 / 20);
    expect(metres(choppy)).toBe(metres(smooth));
  });

  it('does not fast-forward through a backgrounded tab', () => {
    const state = createRun({ seed: 5 });
    step(state, 60_000);
    // A minute of wall-clock advances at most a quarter second of climbing.
    expect(state.timeMs).toBeLessThanOrEqual(250);
  });

  it('gives different seeds different walls', () => {
    const a = play(createRun({ seed: 1 }), 8_000);
    const b = play(createRun({ seed: 2 }), 8_000);
    expect(a.entities.map((e) => `${e.kind}${e.lane}`).join()).not.toBe(
      b.entities.map((e) => `${e.kind}${e.lane}`).join(),
    );
  });
});

describe('the speed ramp', () => {
  it('starts at the base and climbs', () => {
    const state = createRun({ seed: 3 });
    expect(state.speed).toBe(SPEED.base);
    step(state, 5000);
    expect(state.speed).toBeGreaterThan(SPEED.base);
  });

  it('caps, however long the run goes', () => {
    const state = createRun({ seed: 3, modifiers: { chalkSaves: 99 } });
    for (let i = 0; i < 60 * 120; i++) step(state, 1000 / 60);
    expect(state.speed).toBeLessThanOrEqual(SPEED.max);
  });

  it('runs Free Solo faster', () => {
    const normal = createRun({ seed: 3 });
    const hard = createRun({ seed: 3, mode: 'freesolo' });
    step(normal, 1000);
    step(hard, 1000);
    expect(hard.speed).toBeCloseTo(normal.speed * SPEED.freeSoloMultiplier, 4);
  });

  it('lets endurance trim the ramp but never the base', () => {
    const plain = createRun({ seed: 3 });
    const fit = createRun({ seed: 3, modifiers: { rampReduction: HOOKS.maxRampReduction } });
    expect(fit.speed).toBe(plain.speed);
    step(plain, 20_000);
    step(fit, 20_000);
    expect(fit.speed).toBeLessThan(plain.speed);
    expect(fit.speed).toBeGreaterThan(SPEED.base);
  });

  it('halves the speed under slow-mo', () => {
    const plain = createRun({ seed: 3 });
    const slowed = createRun({ seed: 3, modifiers: { startWithSlowmo: true } });
    step(plain, 100);
    step(slowed, 100);
    expect(slowed.speed).toBeCloseTo(plain.speed * SPEED.slowmoMultiplier, 4);
  });
});

describe('the wall it builds', () => {
  const rows = (state: RunState) => {
    const byRow = new Map<number, Entity[]>();
    for (const e of state.entities) byRow.set(e.worldY, [...(byRow.get(e.worldY) ?? []), e]);
    return [...byRow.values()];
  };

  it('never blocks every lane', () => {
    for (const seed of [1, 2, 3, 42, 900, 12345]) {
      const state = play(createRun({ seed, modifiers: { chalkSaves: 999 } }), 40_000);
      for (const row of rows(state)) {
        const blocked = new Set<number>();
        for (const e of row) {
          if (!isObstacle(e.kind)) continue;
          for (let l = e.lane; l < e.lane + e.lanes; l++) blocked.add(l);
        }
        expect(blocked.size, `seed ${seed}`).toBeLessThan(LANES);
      }
    }
  });

  it('never puts a wall across all three lanes at one moment', () => {
    // Debris drifts down between rows, so two rows can arrive together and
    // per-row spacing does not cover it. What has to hold is that no three
    // obstacles land close enough together to be undodgeable: the window
    // here is about one lane change, which is the real test of fairness.
    // The spawner's own margin is twice this, so it errs on the safe side.
    const undodgeable = (t: number) => arrivalWindowAt(t) / 2;
    for (const seed of [1, 2, 3, 7, 42, 900, 12345, 88]) {
      const state = createRun({ seed, modifiers: { chalkSaves: 99999 } });
      // Past ninety seconds, so the tightest wall the game ever builds is
      // covered rather than just the opening minute.
      for (let t = 0; t < 150_000; t += 16) {
        step(state, 16);
        if (t % 320 !== 0) continue;
        const arrivals = state.entities
          .filter((e) => isObstacle(e.kind) && !e.collected)
          .map((e) => ({ e, at: state.distance + (e.worldY - state.distance) / (1 + e.fallRate) }));
        for (const { at } of arrivals) {
          const blocked = new Set<number>();
          for (const other of arrivals) {
            if (Math.abs(other.at - at) > undodgeable(state.timeMs)) continue;
            for (let l = other.e.lane; l < other.e.lane + other.e.lanes; l++) blocked.add(l);
          }
          expect(blocked.size, `seed ${seed} at ${Math.round(at)}`).toBeLessThan(LANES);
        }
      }
    }
  });

  it('gives the climber a runway before the first obstacle', () => {
    const state = createRun({ seed: 1 });
    // Nothing to dodge for the first few seconds of every run.
    for (let t = 0; t < 4000; t += 16) step(state, 16);
    expect(state.over).toBe(false);
    expect(state.distance).toBeLessThan(SPAWN.grace);
  });

  it('keeps every entity inside the lanes', () => {
    const state = play(createRun({ seed: 8, modifiers: { chalkSaves: 999 } }), 30_000);
    for (const e of state.entities) {
      expect(e.lane).toBeGreaterThanOrEqual(0);
      expect(e.lane + e.lanes).toBeLessThanOrEqual(LANES);
    }
  });

  it('never overlaps two things in one lane of a row', () => {
    const state = play(createRun({ seed: 55, modifiers: { chalkSaves: 999 } }), 30_000);
    for (const row of rows(state)) {
      const seen = new Set<number>();
      for (const e of row) {
        for (let l = e.lane; l < e.lane + e.lanes; l++) {
          expect(seen.has(l)).toBe(false);
          seen.add(l);
        }
      }
    }
  });

  it('crowds the wall until ninety seconds, then holds it there', () => {
    expect(difficultyAt(0)).toBe(0);
    expect(difficultyAt(45_000)).toBeCloseTo(0.5);
    expect(difficultyAt(DIFFICULTY.rampSeconds * 1000)).toBe(1);
    expect(difficultyAt(600_000)).toBe(1);

    // Rows close up and obstacles crowd out coins, both stopping at ninety.
    expect(spawnGapAt(0)).toBe(DIFFICULTY.gap.start);
    expect(spawnGapAt(45_000)).toBeLessThan(spawnGapAt(0));
    expect(spawnGapAt(90_000)).toBe(DIFFICULTY.gap.end);
    expect(spawnGapAt(300_000)).toBe(DIFFICULTY.gap.end);

    const share = (t: number) => spawnWeightsAt(t).find(([k]) => k === 'obstacle')![1];
    expect(share(0)).toBeCloseTo(DIFFICULTY.obstacleWeight.start);
    expect(share(90_000)).toBeCloseTo(DIFFICULTY.obstacleWeight.end);
    expect(share(300_000)).toBeCloseTo(DIFFICULTY.obstacleWeight.end);
    // Power-ups keep their share the whole way.
    for (const t of [0, 45_000, 90_000, 300_000]) {
      expect(spawnWeightsAt(t).find(([k]) => k === 'powerup')![1]).toBe(DIFFICULTY.powerupWeight);
      expect(spawnWeightsAt(t).reduce((sum, [, w]) => sum + w, 0)).toBeCloseTo(100);
    }
  });

  it('keeps the dodge window in proportion as rows close up', () => {
    // A fixed window would make the spawner refuse nearly every obstacle
    // once rows tightened, and the wall would get easier the longer you
    // survived — the opposite of the point.
    expect(arrivalWindowAt(90_000)).toBeLessThan(arrivalWindowAt(0));
    for (const t of [0, 30_000, 90_000, 300_000]) {
      expect(arrivalWindowAt(t) / spawnGapAt(t)).toBeCloseTo(SPAWN.arrivalWindowRatio);
    }
  });

  it('spawns roughly the mix the plan asks for', () => {
    let obstacles = 0;
    let coins = 0;
    let powerups = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const state = createRun({ seed, modifiers: { chalkSaves: 9999 } });
      const seen = new Set<number>();
      for (let t = 0; t < 90_000 && !state.over; t += 16) {
        step(state, 16);
        for (const e of state.entities) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          if (isObstacle(e.kind)) obstacles++;
          else if (e.kind === 'coin') coins++;
          else powerups++;
        }
      }
    }
    const total = obstacles + coins + powerups;
    expect(total).toBeGreaterThan(300);
    // Coins run a little high because a lane-blocking obstacle downgrades
    // to one, which is the safety valve doing its job. The share rises over
    // a run as difficulty ramps, so this covers the whole ninety seconds.
    expect(obstacles / total).toBeGreaterThan(0.3);
    expect(obstacles / total).toBeLessThan(0.62);
    expect(powerups / total).toBeLessThan(0.09);
  });

  it('never offers a heart in Free Solo', () => {
    for (const seed of [1, 2, 3, 4]) {
      const state = createRun({ seed, mode: 'freesolo', modifiers: { chalkSaves: 9999 } });
      const seen: string[] = [];
      for (let t = 0; t < 60_000 && !state.over; t += 16) {
        step(state, 16);
        seen.push(...state.entities.map((e) => e.kind));
      }
      expect(seen).not.toContain('heart');
    }
  });
});

describe('the climber', () => {
  it('moves one lane per input and stops at the wall', () => {
    const state = createRun({ seed: 3 });
    expect(state.lane).toBe(1);
    step(state, 16, -1);
    expect(state.lane).toBe(0);
    step(state, 200, -1);
    expect(state.lane).toBe(0);
    step(state, 200, 1);
    expect(state.lane).toBe(1);
  });

  it('queues an input given mid-change and fires it when the change lands', () => {
    // Crossing two lanes is a double tap, and it is the only answer to a
    // boulder pinning you against the wall. Dropping the second tap makes
    // that fail for no reason the player can see.
    const state = createRun({ seed: 3 });
    step(state, 16, -1);
    expect(state.lane).toBe(0);
    step(state, 16, 1);
    expect(state.lane).toBe(0);
    step(state, 120);
    expect(state.lane).toBe(1);
  });

  it('climbs, and reports height in metres', () => {
    // A second of real frames, not one giant step: `step` deliberately
    // refuses to simulate more than 250 ms at a time.
    const state = createRun({ seed: 3 });
    for (let i = 0; i < 60; i++) step(state, 1000 / 60);
    expect(state.distance).toBeGreaterThan(200);
    expect(metres(state)).toBe(Math.floor(state.distance * 0.4));
  });

  it('keeps an input given on a frame shorter than a tick', () => {
    // 144 Hz frames are 6.9 ms against an 8.3 ms tick.
    const state = createRun({ seed: 3 });
    step(state, 6.9, 1);
    expect(state.lane).toBe(1);
    step(state, 6.9);
    expect(state.lane).toBe(2);
  });
});

describe('hits, saves and lives', () => {
  /** Drop one obstacle directly onto the climber. */
  function hitState(overrides: Parameters<typeof createRun>[0] = { seed: 1 }): RunState {
    const state = createRun(overrides);
    state.entities = [
      {
        id: 999,
        kind: 'rock',
        lane: 1,
        lanes: 1,
        worldY: state.distance,
        width: 40,
        height: 34,
        fallRate: 0,
        collected: false,
      },
    ];
    return state;
  }

  it('ends the run on a hit with one life and no saves', () => {
    const state = hitState();
    step(state, 16);
    expect(state.over).toBe(true);
    expect(state.events.some((e) => e.kind === 'over')).toBe(true);
  });

  it('spends a chalk save first, and only once each', () => {
    const state = hitState({ seed: 1, modifiers: { chalkSaves: 1 } });
    step(state, 16);
    expect(state.over).toBe(false);
    expect(state.saves).toBe(0);
    expect(state.events).toContainEqual({ kind: 'hit', absorbed: 'save' });
    expect(state.invulnMs).toBeGreaterThan(0);
  });

  it('is briefly untouchable after a hit', () => {
    const state = hitState({ seed: 1, modifiers: { chalkSaves: 1 } });
    step(state, 16);
    const lives = state.lives;
    state.entities.push({
      id: 1000, kind: 'rock', lane: 1, lanes: 1, worldY: state.distance,
      width: 40, height: 34, fallRate: 0, collected: false,
    });
    step(state, 16);
    expect(state.lives).toBe(lives);
    expect(state.over).toBe(false);
  });

  it('trims the hitbox for a mobile climber', () => {
    const near = (trim: number) => {
      const state = createRun({ seed: 1, modifiers: { hitboxTrim: trim } });
      state.entities = [{
        id: 1, kind: 'rock', lane: 1, lanes: 1,
        worldY: state.distance + 40, width: 40, height: 34, fallRate: 0, collected: false,
      }];
      step(state, 16);
      return state.over;
    };
    expect(near(0)).toBe(true);
    expect(near(HOOKS.maxHitboxTrim)).toBe(false);
  });
});

describe('pickups', () => {
  function drop(state: RunState, kind: Entity['kind'], lane = 1): void {
    state.entities.push({
      id: state.nextEntityId++, kind, lane, lanes: 1,
      worldY: state.distance, width: 28, height: 28, fallRate: 0, collected: false,
    });
  }

  it('banks a coin, scaled by the coin boon', () => {
    const plain = createRun({ seed: 1 });
    drop(plain, 'coin');
    step(plain, 16);
    expect(plain.coins).toBe(1);
    expect(plain.pure).toBe(true);

    const boosted = createRun({ seed: 1, modifiers: { coinMultiplier: 1.5 } });
    drop(boosted, 'coin');
    step(boosted, 16);
    expect(boosted.coins).toBe(1.5);
  });

  it('ends a pure run the moment a power-up is touched', () => {
    const state = createRun({ seed: 1 });
    drop(state, 'slowmo');
    step(state, 16);
    expect(state.pure).toBe(false);
    expect(state.slowmoMs).toBe(POWERUP.slowmoMs);
  });

  it('caps lives, and a heart at full lives still costs the pure run', () => {
    const state = createRun({ seed: 1 });
    state.lives = POWERUP.maxLives;
    drop(state, 'heart');
    step(state, 16);
    expect(state.lives).toBe(POWERUP.maxLives);
    expect(state.pure).toBe(false);
  });

  it('sweeps the coins on screen with a magnet, and no others', () => {
    const state = createRun({ seed: 1 });
    drop(state, 'magnet');
    for (const lane of [0, 2]) {
      state.entities.push({
        id: state.nextEntityId++, kind: 'coin', lane, lanes: 1,
        worldY: state.distance + 200, width: 22, height: 22, fallRate: 0, collected: false,
      });
    }
    // On screen but well below the climber: still swept.
    state.entities.push({
      id: state.nextEntityId++, kind: 'coin', lane: 2, lanes: 1,
      worldY: state.distance - 100, width: 22, height: 22, fallRate: 0, collected: false,
    });
    // Far above the screen: the magnet must not reach it.
    state.entities.push({
      id: state.nextEntityId++, kind: 'coin', lane: 0, lanes: 1,
      worldY: state.distance + VIEW.height * 3, width: 22, height: 22, fallRate: 0, collected: false,
    });
    step(state, 16);
    expect(state.coins).toBe(3);
  });
});

describe('training hooks', () => {
  it('are all zero for an untrained climber', () => {
    const m = modifiersFrom({});
    expect(m.rampReduction).toBe(0);
    expect(m.hitboxTrim).toBe(0);
    expect(m.chalkSaves).toBe(0);
    expect(m.coinMultiplier).toBe(1);
    expect(m.startWithSlowmo).toBe(false);
  });

  it('cap out at the ceilings the plan sets, so it stays a reflex game', () => {
    const m = modifiersFrom({ end: 100, agi: 100, men: 100 });
    expect(m.rampReduction).toBeCloseTo(HOOKS.maxRampReduction);
    expect(m.hitboxTrim).toBeCloseTo(HOOKS.maxHitboxTrim);
    const beyond = modifiersFrom({ end: 500, agi: 500 });
    expect(beyond.rampReduction).toBe(HOOKS.maxRampReduction);
    expect(beyond.hitboxTrim).toBe(HOOKS.maxHitboxTrim);
  });

  it('grants a chalk save at the mental threshold, and a second from a boon', () => {
    expect(modifiersFrom({ men: HOOKS.chalkSaveStat - 1 }).chalkSaves).toBe(0);
    expect(modifiersFrom({ men: HOOKS.chalkSaveStat }).chalkSaves).toBe(1);
    expect(modifiersFrom({ men: HOOKS.chalkSaveStat, boons: ['boon-reach'] }).chalkSaves).toBe(2);
  });

  it('reads the skill-tree boons', () => {
    expect(modifiersFrom({ boons: ['boon-slowmo'] }).startWithSlowmo).toBe(true);
    expect(modifiersFrom({ boons: ['boon-doublejump'] }).coinMultiplier).toBe(1.5);
  });
});

describe('the event stream the cues read', () => {
  function withPickups(kinds: readonly ('coin' | 'slowmo' | 'magnet' | 'heart')[]): RunState {
    const state = createRun({ seed: 4 });
    state.entities = kinds.map((kind, i) => ({
      id: 500 + i,
      kind,
      lane: 1,
      lanes: 1,
      worldY: state.distance,
      width: 24,
      height: 24,
      fallRate: 0,
      collected: false,
    }));
    return state;
  }

  it('reports a coin with the value it was worth', () => {
    const state = withPickups(['coin']);
    step(state, 16);
    expect(state.events).toContainEqual({ kind: 'coin', value: 1 });
  });

  it('scales the reported coin value with the multiplier', () => {
    const state = createRun({ seed: 4, modifiers: { coinMultiplier: 1.5 } });
    state.entities = [{
      id: 500, kind: 'coin', lane: 1, lanes: 1, worldY: state.distance,
      width: 24, height: 24, fallRate: 0, collected: false,
    }];
    step(state, 16);
    expect(state.events).toContainEqual({ kind: 'coin', value: 1.5 });
  });

  it('names the power-up that was taken', () => {
    const state = withPickups(['slowmo']);
    step(state, 16);
    expect(state.events).toContainEqual({ kind: 'powerup', type: 'slowmo' });
  });

  // The sound wants the power-up first and the swept coins after it, so a
  // magnet reads as one event with an arpeggio behind it rather than a pile.
  it('puts the magnet ahead of the coins it sweeps', () => {
    const state = createRun({ seed: 4 });
    state.entities = [
      { id: 1, kind: 'magnet', lane: 1, lanes: 1, worldY: state.distance,
        width: 24, height: 24, fallRate: 0, collected: false },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: 10 + i, kind: 'coin' as const, lane: 0, lanes: 1,
        worldY: state.distance + 20 + i * 30,
        width: 24, height: 24, fallRate: 0, collected: false,
      })),
    ];
    step(state, 16);
    const kinds = state.events.map((e) => e.kind);
    expect(kinds[0]).toBe('powerup');
    expect(kinds.filter((k) => k === 'coin').length).toBeGreaterThan(4);
    expect(kinds.indexOf('coin')).toBeGreaterThan(0);
  });

  // A fatal hit is left silent by the page, which plays the closing sound
  // instead — so the two must be distinguishable, and arrive together.
  it('marks the fatal hit and the end of the run in one step', () => {
    const state = createRun({ seed: 4 });
    state.entities = [{
      id: 1, kind: 'rock', lane: 1, lanes: 1, worldY: state.distance,
      width: 40, height: 34, fallRate: 0, collected: false,
    }];
    step(state, 16);
    expect(state.events).toContainEqual({ kind: 'hit', absorbed: 'life' });
    expect(state.events).toContainEqual({ kind: 'over' });
  });

  it('clears the events at the start of every step', () => {
    const state = withPickups(['coin']);
    step(state, 16);
    expect(state.events.length).toBeGreaterThan(0);
    step(state, 16);
    expect(state.events.filter((e) => e.kind === 'coin')).toEqual([]);
  });
});
