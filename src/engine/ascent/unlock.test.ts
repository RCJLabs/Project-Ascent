import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIMBS_TO_EVEREST } from '../altimeter';
import { NO_MODIFIERS, createRun, metres, step } from './game';
import { matchedClimb } from './scale';
import { FREE_SOLO_UNLOCK, describeFreeSoloUnlock, unlockSentence } from './unlock';

/**
 * The gate is a duration, and it is written as a distance (PLAN.md M218).
 *
 * `FREE_SOLO_UNLOCK = 2000` reads like a target. It is eighteen seconds of
 * survival, and nothing said so — not the constant, not the copy, not a
 * test — so retuning `SPEED` or `DIFFICULTY` would have moved the bar
 * without anyone noticing which way.
 */

/** Steps a run forward with no input, ignoring collisions, to time the ramp. */
function secondsTo(target: number, mode: 'ascent' | 'freesolo'): number {
  let run = createRun({ seed: 1, mode, modifiers: NO_MODIFIERS });
  let ms = 0;
  while (metres(run) < target && ms < 300_000) {
    run = step(run, 16, 0);
    // Survival is not what is being measured — the speed ramp is — so the
    // climber is held alive rather than steered. A run that died here would
    // measure this seed's obstacle layout instead.
    run.lives = 5;
    run.over = false;
    ms += 16;
  }
  return ms / 1000;
}

describe('what the unlock actually asks for', () => {
  it('is about eighteen seconds on the normal wall', () => {
    const seconds = secondsTo(FREE_SOLO_UNLOCK, 'ascent');
    // A belay check, not a grind: wide enough to survive ordinary tuning,
    // tight enough that turning it into a minute fails here.
    expect(seconds).toBeGreaterThan(14);
    expect(seconds).toBeLessThan(23);
  });

  it('is shorter in the mode it unlocks, which is why it is measured in the other one', () => {
    // Free Solo runs 30% faster, so the same distance arrives sooner. The
    // gate is on the normal wall precisely so the bar is the harder one.
    expect(secondsTo(FREE_SOLO_UNLOCK, 'freesolo')).toBeLessThan(
      secondsTo(FREE_SOLO_UNLOCK, 'ascent'),
    );
  });

  it('sits well inside the run a climber can already have', () => {
    // Reachable long before the speed caps, which is what makes it a check
    // on understanding the controls rather than on endurance.
    expect(secondsTo(FREE_SOLO_UNLOCK, 'ascent')).toBeLessThan(32.5);
  });
});

describe('what the unlock says', () => {
  it('names a climb rather than a converted number', () => {
    // The last bare figure on that page after M210.
    const climb = matchedClimb(FREE_SOLO_UNLOCK)!;
    expect(climb.name).toBe('Mt. Washington');
    for (const units of ['imperial', 'metric'] as const) {
      const said = describeFreeSoloUnlock(units);
      expect(said, units).toContain(climb.name);
      expect(said, units).toContain('normal wall');
    }
  });

  it("says the height in the climber's own units", () => {
    expect(describeFreeSoloUnlock('imperial')).toContain('6,562 ft');
    expect(describeFreeSoloUnlock('metric')).toContain('2,000 m');
  });

  it('names whatever climb the bar actually passes, not a remembered one', () => {
    // The half a hardcoded 'Mt. Washington' would break silently: it reads
    // identically at today's constant and goes stale the moment it moves.
    // So the sentence is driven at every rung of the ladder.
    for (const climb of CLIMBS_TO_EVEREST) {
      const justPast = climb.feet * 0.3048 + 1;
      expect(unlockSentence(justPast, 'imperial'), climb.name).toContain(climb.name);
    }
  });

  it('falls back to the bare height below the first climb on the ladder', () => {
    // 45 ft is the lowest rung, so there is a band underneath it with no
    // climb to name, and the sentence still has to be a sentence.
    const said = unlockSentence(1, 'imperial');
    expect(said).toContain('normal wall');
    expect(said).not.toContain('Climb past');
  });
});

describe('the decision this milestone made', () => {
  it('reads nothing from the training log, and cannot start to', () => {
    /**
     * The whole of M218's answer, made checkable. Gating a game mode on
     * sessions or outdoor days would put a reason to log a rock day that
     * has nothing to do with climbing into the record the coach reads, and
     * this module is where that would have to be imported. Its imports are
     * the arcade's own and the unit formatter, and nothing else.
     */
    const source = readFileSync('src/engine/ascent/unlock.ts', 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    expect(imports.length).toBeGreaterThan(0);
    for (const path of imports) {
      expect(path.startsWith('./') || path === '../units', `${path} is outside the arcade`).toBe(
        true,
      );
    }
  });
});
