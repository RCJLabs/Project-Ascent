import { describe, expect, it } from 'vitest';
import { SKILL_TREES } from '@/content/skills';
import { GAME_ACTION_CAP } from '@/engine/economy';
import { CLIMBER, HOOKS, LANE_WIDTH } from './config';
import { BOONS, BOON_IDS, applyBoons, boonLabel, type BoonId } from './boons';
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
    );
    expect(payout.units).toBeLessThanOrEqual(GAME_ACTION_CAP);
    expect(payout.capped).toBe(true);
  });
});
