import { describe, expect, it } from 'vitest';
import { SKILL_TREES } from '@/content/skills';
import { GAME_ACTION_CAP } from '@/engine/economy';
import { CLIMBER, HOOKS, INVULNERABLE_MS, LANE_WIDTH, POWERUP, SIZES } from './config';
import { BOONS, BOON_IDS, BOON_RAMP, BOON_STRETCH, applyBoons, boonLabel, type BoonId } from './boons';
import {
  NO_MODIFIERS,
  climberX,
  createRun,
  laneCenter,
  laneChangeDuration,
  modifiersFrom,
  step,
  type Input,
  type RunState,
} from './game';
import { payoutFor } from './rewards';

/**
 * What a skill node claims, and what it does (PLAN.md M31).
 *
 * The two lived in different files and two of the three had drifted apart —
 * a climber who trained forty power drills was told they had earned "a
 * longer reach", a mechanic that has never existed in this game.
 */

const boonNodes = () =>
  SKILL_TREES.flatMap((tree) => tree.nodes).flatMap((node) =>
    node.effect?.kind === 'ascent-boon' ? [{ node, effect: node.effect }] : [],
  );

function play(state: RunState, ms: number, inputs: (t: number) => Input = () => 0): RunState {
  for (let t = 0; t < ms && !state.over; t += 16) step(state, 16, inputs(t));
  return state;
}

describe('what a skill node says it grants', () => {
  it('is a boon the game actually knows about', () => {
    const nodes = boonNodes();
    expect(nodes.length).toBeGreaterThan(0);
    for (const { effect } of nodes) {
      expect(BOON_IDS, effect.id).toContain(effect.id);
    }
  });

  it('reads the same words the game does', () => {
    // Not "both files say something plausible" — the same string, from the
    // one table, so the tree cannot describe a mechanic the run does not
    // have.
    for (const { node, effect } of boonNodes()) {
      expect(effect.label, node.name).toBe(boonLabel(effect.id as BoonId));
    }
  });

  it('describes something the effect really does', () => {
    // Every boon has to move a modifier. A label attached to a no-op is the
    // same lie in a quieter form.
    for (const id of BOON_IDS) {
      expect(BOONS[id].apply(NO_MODIFIERS), id).not.toEqual(NO_MODIFIERS);
    }
  });

  it('is granted only to a climber who holds it', () => {
    expect(applyBoons(NO_MODIFIERS, [])).toEqual(NO_MODIFIERS);
    expect(applyBoons(NO_MODIFIERS, ['boon-nonsense'])).toEqual(NO_MODIFIERS);
    expect(applyBoons(NO_MODIFIERS, ['boon-slowmo']).startWithSlowmo).toBe(true);
  });

  it('stacks with the stat that feeds the same modifier', () => {
    const stats = modifiersFrom({ str: 100 });
    const both = modifiersFrom({ str: 100, boons: ['boon-doublejump'] });
    expect(both.coinMultiplier).toBeCloseTo(stats.coinMultiplier * 1.5, 6);
  });
});

describe('every stat reaching the wall', () => {
  it('gives a climber who has logged nothing exactly nothing', () => {
    // Stats start at a base of 10 that nobody earned.
    expect(modifiersFrom({ end: 10, agi: 10, men: 10, tec: 10, str: 10 })).toEqual(NO_MODIFIERS);
    expect(modifiersFrom({})).toEqual(NO_MODIFIERS);
  });

  it('hooks all five, not three', () => {
    const maxed = modifiersFrom({ end: 100, agi: 100, men: 100, tec: 100, str: 100 });
    expect(maxed.rampReduction).toBeCloseTo(HOOKS.maxRampReduction, 6);
    expect(maxed.hitboxTrim).toBeCloseTo(HOOKS.maxHitboxTrim, 6);
    expect(maxed.chalkSaves).toBe(1);
    expect(maxed.laneTrim).toBeCloseTo(HOOKS.maxLaneTrim, 6);
    expect(maxed.coinMultiplier).toBeCloseTo(1 + HOOKS.maxCoinBonus, 6);
  });

  it('never exceeds its cap, whatever the stat says', () => {
    const absurd = modifiersFrom({ end: 9999, agi: 9999, tec: 9999, str: 9999 });
    expect(absurd.rampReduction).toBeLessThanOrEqual(HOOKS.maxRampReduction);
    expect(absurd.hitboxTrim).toBeLessThanOrEqual(HOOKS.maxHitboxTrim);
    expect(absurd.laneTrim).toBeLessThanOrEqual(HOOKS.maxLaneTrim);
    expect(absurd.coinMultiplier).toBeLessThanOrEqual(1 + HOOKS.maxCoinBonus);
  });
});

describe('technique on the lane change', () => {
  const run = (tec: number) =>
    createRun({ mode: 'ascent', seed: 42, modifiers: modifiersFrom({ tec }) });

  it('shortens it, and only within the cap', () => {
    expect(laneChangeDuration(NO_MODIFIERS)).toBe(CLIMBER.laneChangeMs);
    expect(laneChangeDuration(modifiersFrom({ tec: 100 }))).toBeCloseTo(
      CLIMBER.laneChangeMs * (1 - HOOKS.maxLaneTrim),
      6,
    );
  });

  it('lands the move sooner in real ticks', () => {
    const ticksToLand = (tec: number) => {
      const state = run(tec);
      step(state, 16, 1);
      let ticks = 1;
      while (state.laneChangeMs > 0 && ticks < 50) {
        step(state, 16, 0);
        ticks++;
      }
      return ticks;
    };
    expect(ticksToLand(100)).toBeLessThan(ticksToLand(10));
  });

  it('still starts the move at the lane it left', () => {
    // The interpolation divides by the run's own duration. Dividing by the
    // untrimmed constant instead would start a shortened lane change
    // partway across, teleporting the climber on the first frame.
    const state = run(100);
    step(state, 16, 1);
    expect(state.fromLane).toBe(1);
    expect(state.lane).toBe(2);
    const x = climberX(state);
    const travelled = (x - laneCenter(1)) / LANE_WIDTH;
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(0.35);
  });

  it('arrives exactly at the new lane', () => {
    const state = run(100);
    play(state, 400, (t) => (t === 0 ? 1 : 0));
    expect(state.laneChangeMs).toBe(0);
    expect(climberX(state)).toBeCloseTo(laneCenter(2), 6);
  });
});

describe('the cap that makes all of this safe', () => {
  it('cannot pay more than the game lane allows, however trained the climber', () => {
    const maxed = modifiersFrom({ end: 100, agi: 100, men: 100, tec: 100, str: 100 });
    const coins = 10_000 * maxed.coinMultiplier;
    const payout = payoutFor(
      { date: '2026-09-10', mode: 'freesolo', metres: 999_999, coins },
      true,
      'metric',
    );
    expect(payout.units).toBeLessThanOrEqual(GAME_ACTION_CAP);
    expect(payout.capped).toBe(true);
  });
});

describe('one boon per tree (PLAN.md M211)', () => {
  /** Every `ascent-boon` the trees grant, with the tree that grants it. */
  const granted = SKILL_TREES.flatMap((tree) =>
    tree.nodes
      .filter((node) => node.effect?.kind === 'ascent-boon')
      .map((node) => ({ tree: tree.id, node: node.name, id: (node.effect as { id: string }).id })),
  );

  it('reaches every tree, which it did not before', () => {
    // All three used to sit in Dynamic Power, so a climber who trained
    // endurance for a year got their END stat's ramp hook and no boon.
    const trees = new Set(granted.map((g) => g.tree));
    expect(trees.size).toBe(SKILL_TREES.length);
    for (const tree of SKILL_TREES) expect(trees.has(tree.id), tree.id).toBe(true);
  });

  it('grants only boons that exist, and every boon is granted', () => {
    // The fault this file was written for: a tree naming a mechanic that was
    // never built. It cuts both ways — a boon nothing grants is unreachable.
    for (const g of granted) expect(BOON_IDS, `${g.tree}/${g.node}`).toContain(g.id);
    for (const id of BOON_IDS) expect(granted.map((g) => g.id)).toContain(id);
  });

  it('says the same thing in the tree as in the game', () => {
    for (const tree of SKILL_TREES) {
      for (const node of tree.nodes) {
        if (node.effect?.kind !== 'ascent-boon') continue;
        expect(node.effect.label, node.name).toBe(boonLabel(node.effect.id as BoonId));
      }
    }
  });
});

describe('what the four new boons actually do', () => {
  const held = (...ids: BoonId[]) => applyBoons(NO_MODIFIERS, ids);

  it('gives a second life — and never on Free Solo', () => {
    // Free Solo's whole premise is one life. A boon that took that away
    // would be the mode quietly ceasing to be itself.
    expect(held('boon-second-life').extraLives).toBe(1);
    expect(createRun({ seed: 1, modifiers: held('boon-second-life') }).lives).toBe(2);
    expect(
      createRun({ seed: 1, mode: 'freesolo', modifiers: held('boon-second-life') }).lives,
    ).toBe(1);
  });

  it('slows the ramp past what the stat alone can buy', () => {
    const maxed = modifiersFrom({ end: 100 });
    expect(maxed.rampReduction).toBeCloseTo(HOOKS.maxRampReduction, 10);
    const both = modifiersFrom({ end: 100, boons: ['boon-pace'] });
    expect(both.rampReduction).toBeCloseTo(HOOKS.maxRampReduction + BOON_RAMP, 10);
    expect(both.rampReduction).toBeGreaterThan(maxed.rampReduction);
  });

  it('stretches a slow-mo charge, picked up or started with', () => {
    const boon = held('boon-read', 'boon-slowmo');
    expect(createRun({ seed: 1, modifiers: boon }).slowmoMs).toBeCloseTo(
      POWERUP.slowmoMs * BOON_STRETCH,
      10,
    );
    // And the same again for one taken off the wall, through the real
    // collision path rather than a test-only door into it.
    const state = createRun({ seed: 1, modifiers: held('boon-read') });
    expect(state.slowmoMs).toBe(0);
    state.entities = [
      {
        id: 99,
        kind: 'slowmo',
        lane: state.lane,
        lanes: 1,
        worldY: state.distance,
        width: SIZES.powerup.width,
        height: SIZES.powerup.height,
        fallRate: 0,
        collected: false,
      },
    ];
    step(state, 16);
    // Set on collection, which runs after the tick's decay, so it is the
    // full charge and not the full charge minus one tick.
    expect(state.slowmoMs).toBe(POWERUP.slowmoMs * BOON_STRETCH);
    expect(state.slowmoMs).toBeGreaterThan(POWERUP.slowmoMs);
  });

  it('stretches the forgiveness after a hit a life absorbed', () => {
    const state = createRun({ seed: 11, modifiers: held('boon-recover') });
    state.lives = 2;
    for (let t = 0; t < 120_000 && state.lives === 2; t += 16) step(state, 16);
    expect(state.lives).toBe(1);
    expect(state.invulnMs).toBeCloseTo(INVULNERABLE_MS * BOON_STRETCH, 10);
  });

  it('stretches it after a hit a chalk save absorbed, which is the other branch', () => {
    // Two ways a hit is survived and two lines that set the window. The
    // first version of this test only drove the life branch, and a mutant
    // that left the save branch alone lived through the whole battery.
    const saves = 40;
    const state = createRun({ seed: 11, modifiers: { ...held('boon-recover'), chalkSaves: saves } });
    for (let t = 0; t < 120_000 && state.saves === saves; t += 16) step(state, 16);
    expect(state.saves).toBe(saves - 1);
    expect(state.lives).toBe(1);
    expect(state.invulnMs).toBeCloseTo(INVULNERABLE_MS * BOON_STRETCH, 10);
  });

  it('cannot pay more, however many of them are held', () => {
    // Every boon makes a run go further and none of them touches the
    // ceiling: the day is still capped at half a session.
    const all = modifiersFrom({ end: 100, agi: 100, men: 100, tec: 100, str: 100, boons: BOON_IDS });
    const payout = payoutFor(
      { date: '2026-09-10', mode: 'freesolo', metres: 999_999, coins: 10_000 * all.coinMultiplier },
      true,
      'metric',
    );
    expect(payout.units).toBeLessThanOrEqual(GAME_ACTION_CAP);
    expect(payout.capped).toBe(true);
  });
});
