import { describe, expect, it } from 'vitest';
import { MILESTONES } from '../altimeter';
import { CLIMBER, METRES_PER_PX, SPAWN, SPEED, VIEW } from './config';
import { createRun, step } from './game';
import {
  MARK_HOLD_MS,
  RUN_MARKS,
  markCrossed,
  marksBetween,
  nextMark,
  secondsToClimb,
} from './marks';

/**
 * The climbs a run passes, while it is still going (PLAN.md M232).
 *
 * The ladder is derived rather than written down, so most of what is worth
 * checking is that the derivation still agrees with the tuning it was derived
 * from — and that it agrees with the *simulation*, which is a separate claim
 * from agreeing with the closed form the derivation uses.
 */

const FEET_PER_PX = METRES_PER_PX * 3.280839895013123;

/**
 * Run the real engine to a distance, and report the seconds it took.
 *
 * The wall is cleared every tick rather than played: a run that collected a
 * slow-mo would climb at half speed for four seconds and disagree with a
 * closed form that has no idea power-ups exist. That disagreement would be
 * the harness being wrong, not the formula, and the first version passed only
 * because seed 7 happened not to hand one over.
 */
function playTo(px: number, mode: 'ascent' | 'freesolo' = 'ascent'): number {
  const run = createRun({ mode, seed: 7 });
  // A tick at a time, so the answer is the engine's and not a coarse sample.
  while (run.distance < px && run.timeMs < 900_000) {
    run.entities = [];
    step(run, 1000 / 120);
  }
  return run.timeMs / 1000;
}

describe('the marks a run climbs past', () => {
  /**
   * The closed form is an integral of `currentSpeed`, and an integral of a
   * function is a thing you can get subtly wrong in a way no other test would
   * notice — every one of them would simply agree with the same mistake.
   *
   * So it is checked against the engine actually running. Within a tick's
   * worth of travel, because the simulation advances in 8.3 ms steps and
   * lands just past the line rather than exactly on it.
   */
  it('agrees with the engine about when a height is reached', () => {
    for (const px of [2_000, 11_053, 22_122, 43_650]) {
      const played = playTo(px);
      expect(Math.abs(secondsToClimb(px) - played), `${px} px`).toBeLessThan(0.05);
    }
  });

  it('and about a Free Solo run, which climbs the same wall faster', () => {
    const px = 11_053;
    expect(Math.abs(secondsToClimb(px, SPEED.freeSoloMultiplier) - playTo(px, 'freesolo'))).toBeLessThan(0.05);
    expect(secondsToClimb(px, SPEED.freeSoloMultiplier)).toBeLessThan(secondsToClimb(px));
  });

  /**
   * The first filter: nothing is marked before the wall has anything on it.
   *
   * `SPAWN.grace` is two screens of climbing, so the gym wall at 45 ft and
   * Devils Tower at 867 ft are both crossed over an empty wall. Announcing
   * them would be announcing the intro.
   */
  it('marks nothing before the first row can spawn', () => {
    expect(RUN_MARKS[0]!.px).toBeGreaterThanOrEqual(SPAWN.grace);
    expect(RUN_MARKS.map((m) => m.name)).not.toContain('First gym wall');
    expect(RUN_MARKS.map((m) => m.name)).not.toContain('Devils Tower');
    // And the rung directly above the line is kept, or the filter is not a
    // line but a taste.
    expect(RUN_MARKS[0]!.name).toBe('Half Dome');
  });

  /**
   * The second filter: no two marks can be announced over each other.
   *
   * Checked at Free Solo's speed, which is the fastest a run can go, because
   * that is the case the filter was built against — a pair that clears the
   * hold there clears it in every mode.
   */
  it('spaces them by at least as long as one is announced for', () => {
    for (let i = 1; i < RUN_MARKS.length; i++) {
      const gap =
        secondsToClimb(RUN_MARKS[i]!.px, SPEED.freeSoloMultiplier) -
        secondsToClimb(RUN_MARKS[i - 1]!.px, SPEED.freeSoloMultiplier);
      expect(gap, `${RUN_MARKS[i - 1]!.name} → ${RUN_MARKS[i]!.name}`).toBeGreaterThanOrEqual(
        MARK_HOLD_MS / 1000,
      );
    }
  });

  /**
   * The spacing is timed at Free Solo's 1.3×, and on today's ladder it makes
   * no difference — timing it at 1× produces exactly the same twenty marks.
   * A battery proved it: that swap survives the whole suite.
   *
   * So the guard goes on the fact the equivalence rests on. A pair is treated
   * differently by the two only if its gap lands between the hold at 1× and
   * the hold at 1.3×, and no pair does: the tightest kept gap is Half Dome to
   * El Capitan at 1.98 s in Free Solo, and the dropped one is Kilimanjaro to
   * Denali at 1.2 s. The day a pair lands in that band, the choice starts
   * mattering and this fires.
   */
  it('has no pair close enough for the choice of speed to matter', () => {
    const hold = MARK_HOLD_MS / 1000;
    const band: string[] = [];
    // Every rung of the real ladder, not just the kept ones: a pair the
    // filter dropped is exactly where the two answers could disagree.
    const rungs = MILESTONES.filter((m) => m.feet / FEET_PER_PX >= SPAWN.grace);
    for (let i = 1; i < rungs.length; i++) {
      const gap =
        secondsToClimb(rungs[i]!.feet / FEET_PER_PX) -
        secondsToClimb(rungs[i - 1]!.feet / FEET_PER_PX);
      if (gap >= hold && gap < hold * SPEED.freeSoloMultiplier) {
        band.push(`${rungs[i - 1]!.name} → ${rungs[i]!.name} (${gap.toFixed(2)}s)`);
      }
    }
    expect(band, 'the spacing speed now changes the ladder — test it directly').toEqual([]);
  });

  /**
   * Denali is the only rung the spacing drops, and it is worth pinning which
   * one: a filter that quietly started dropping Everest would still pass the
   * rule above.
   */
  it('drops Denali and keeps the climbs either side of it', () => {
    const names = RUN_MARKS.map((m) => m.name);
    expect(names).not.toContain('Denali');
    expect(names).toContain('Kilimanjaro');
    expect(names).toContain('Aconcagua');
    expect(names).toContain('El Capitan');
  });

  /**
   * The point of the milestone. The ten climbs to Everest are spent at 55
   * seconds and the ramp runs to ninety, so a ladder that stopped there would
   * leave the flat stretch — the part with no shape, which is what this is
   * for — with nothing on it at all.
   */
  it('keeps marking the wall long after the difficulty ramp is done', () => {
    const everest = RUN_MARKS.find((m) => m.name === 'Everest')!;
    expect(secondsToClimb(everest.px)).toBeLessThan(60);

    const afterRamp = RUN_MARKS.filter((m) => secondsToClimb(m.px) > 90);
    expect(afterRamp.length, 'the flat stretch has nothing to cross').toBeGreaterThan(5);

    // And at a steady cadence, because past the speed cap the wall moves at a
    // constant rate: every rung above Everest is one stacked eight-thousander.
    for (let i = 1; i < afterRamp.length; i++) {
      const gap = secondsToClimb(afterRamp[i]!.px) - secondsToClimb(afterRamp[i - 1]!.px);
      expect(gap).toBeGreaterThan(35);
      expect(gap).toBeLessThan(55);
    }
  });

  /** Every mark is a rung of the app's one ladder, not a number made up here. */
  it('invents no mountains', () => {
    for (const mark of RUN_MARKS) {
      const rung = MILESTONES.find((m) => m.name === mark.name);
      expect(rung, mark.name).toBeDefined();
      expect(mark.feet).toBe(rung!.feet);
      expect(mark.px * FEET_PER_PX).toBeCloseTo(mark.feet, 4);
    }
    expect(RUN_MARKS.length).toBeLessThan(MILESTONES.length);
  });

  it('runs upward, so a scan can stop early', () => {
    const heights = RUN_MARKS.map((m) => m.px);
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
  });

  describe('crossing one', () => {
    const halfDome = RUN_MARKS[0]!;

    it('reports the mark the step went past', () => {
      expect(markCrossed(halfDome.px - 10, halfDome.px + 10)).toEqual(halfDome);
    });

    it('reports nothing for a step that stayed below it', () => {
      expect(markCrossed(halfDome.px - 100, halfDome.px - 10)).toBeNull();
    });

    it('reports nothing for a step that was already past it', () => {
      expect(markCrossed(halfDome.px + 10, halfDome.px + 100)).toBeNull();
    });

    /**
     * A resumed tab simulates a quarter second at once — at the cap that is
     * 120 px, and a badly timed one could clear two marks. It reports the
     * higher: saying "past Half Dome" from above El Capitan is a lie about
     * where the climber is.
     */
    it('reports the highest when one step clears two', () => {
      const second = RUN_MARKS[1]!;
      expect(markCrossed(halfDome.px - 1, second.px + 1)).toEqual(second);
    });

    it('reports nothing for a step that went nowhere', () => {
      expect(markCrossed(halfDome.px, halfDome.px)).toBeNull();
    });
  });

  describe('what the wall can see', () => {
    /**
     * The renderer's window, which is the screen read back out of `screenY`:
     * a mark sits at `CLIMBER.y - (px - distance)`, so the top edge of the
     * screen is the climb at `distance + CLIMBER.y`.
     */
    it('finds the marks inside a viewport and none outside it', () => {
      const mark = RUN_MARKS[2]!;
      const distance = mark.px - 100;
      const top = distance + CLIMBER.y;
      const found = marksBetween(top - VIEW.height, top);
      expect(found).toContainEqual(mark);

      const far = marksBetween(0, RUN_MARKS[0]!.px - 1);
      expect(far).toEqual([]);
    });

    it('names the next one to aim at, and nothing past the last', () => {
      expect(nextMark(0)).toEqual(RUN_MARKS[0]);
      expect(nextMark(RUN_MARKS[0]!.px)).toEqual(RUN_MARKS[1]);
      expect(nextMark(RUN_MARKS.at(-1)!.px + 1)).toBeNull();
    });
  });

  describe('the run announcing one', () => {
    /**
     * The point of raising it as an event rather than leaving the page to
     * work it out: `step` knows every tick it simulated, and the page knows
     * one frame. A resumed tab hands `step` a quarter second at once.
     */
    it('raises the climb as the run goes past it', () => {
      const run = createRun({ seed: 3 });
      const first = RUN_MARKS[0]!;
      const seen: string[] = [];
      while (run.distance < first.px + 200 && run.timeMs < 60_000) {
        run.entities = [];
        step(run, 1000 / 120);
        for (const e of run.events) if (e.kind === 'mark') seen.push(e.mark.name);
      }
      expect(seen).toEqual([first.name]);
    });

    it('says nothing on a run that never reaches the first one', () => {
      const run = createRun({ seed: 3 });
      const seen: string[] = [];
      while (run.distance < RUN_MARKS[0]!.px - 100) {
        run.entities = [];
        step(run, 1000 / 120);
        for (const e of run.events) if (e.kind === 'mark') seen.push(e.mark.name);
      }
      expect(seen).toEqual([]);
    });

    /**
     * And each climb once. Events are cleared at the top of every `step`, so
     * a mark re-raised on the next tick would blink the banner rather than
     * hold it — and the tick after that, and the one after that.
     */
    it('announces each climb exactly once', () => {
      const run = createRun({ seed: 3 });
      const seen: string[] = [];
      while (run.distance < RUN_MARKS[2]!.px + 500 && run.timeMs < 120_000) {
        run.entities = [];
        step(run, 1000 / 120);
        for (const e of run.events) if (e.kind === 'mark') seen.push(e.mark.name);
      }
      expect(seen).toEqual([RUN_MARKS[0]!.name, RUN_MARKS[1]!.name, RUN_MARKS[2]!.name]);
    });

    /** A quarter second at once is the most `step` will simulate. */
    it('finds the climbs a resumed tab climbed straight past', () => {
      const run = createRun({ seed: 3 });
      const seen: string[] = [];
      while (run.distance < RUN_MARKS[1]!.px + 200 && run.timeMs < 60_000) {
        run.entities = [];
        step(run, 250);
        for (const e of run.events) if (e.kind === 'mark') seen.push(e.mark.name);
      }
      expect(seen).toEqual([RUN_MARKS[0]!.name, RUN_MARKS[1]!.name]);
    });
  });

  /**
   * The one-way wall, which `altimeter.ts` opens by promising and M210 kept.
   * A module that reads the ladder to place a line must not be able to write
   * to it, and the cheapest guard is that it never imports anything that can.
   */
  it('reads the ladder and writes nothing back', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/engine/ascent/marks.ts', 'utf8'),
    );
    expect(source).not.toMatch(/\bdb\/|useGame|putSession|appendLedger/);
    const before = MILESTONES.map((m) => m.feet).join();
    markCrossed(0, 500_000);
    expect(MILESTONES.map((m) => m.feet).join()).toBe(before);
  });
});
