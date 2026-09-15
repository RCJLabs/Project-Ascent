import { describe, expect, it } from 'vitest';
import {
  LEVELS_PER_DEGREE,
  RANKS,
  levelFor,
  nextRank,
  rankFor,
  rankLabel,
  xpForLevel,
} from './economy';

/**
 * The ladder does not end (PLAN.md M176).
 *
 * ## What it did
 *
 * `RANKS` is twenty-four titles topping out at level 100, and `levelFor` is
 * `floor(sqrt(xp / 100))` over a total that only grows — so the number beside
 * the name climbed for ever and the name did not. Measured on a three-a-week
 * climber: **level 108 at ten years, 172 at twenty-five, 217 at forty**, all
 * of them GOAT. `nextRank` returned `null` past 100 and `LevelBar` rendered
 * that as *"top rank reached"*, a sentence met somewhere in year nine and
 * then read for the rest of a career.
 *
 * Forty per cent of the ladder is also spent in the first twelve months, and
 * that is **not** what this milestone changes: the author's decision was that
 * ranking up continues, not that the early pace is wrong. The sqrt curve
 * already slows the climb down on its own.
 *
 * ## What it does now
 *
 * Past the last title the title stays and a **degree** counts, every
 * `LEVELS_PER_DEGREE` levels: GOAT, GOAT 2, GOAT 3, unbounded. Not a lap back
 * to `Newcomer` the way the altimeter repeats its ladder — a mountain's
 * height is a distance you cover again, and `career.ts` says why a rank is
 * not: a climber is *"better than being told they are 45 feet from their
 * first gym wall again"*.
 */

const TOP = RANKS.at(-1)!;

describe('every level has a rank and a next one', () => {
  const LEVELS = [0, 1, 2, 17, 50, 99, 100, 101, 104, 105, 150, 217, 500, 5000];

  it.each(LEVELS)('answers at level %i', (level) => {
    expect(rankFor(level).title).toBeTruthy();
    expect(rankFor(level).degree).toBeGreaterThanOrEqual(1);
    expect(nextRank(level).level).toBeGreaterThan(level);
  });

  /**
   * The invariant that ties the two together in both regimes: the rung
   * `nextRank` points at is the rung you hold when you get there.
   */
  it.each(LEVELS)('points at a rung you will actually hold, from %i', (level) => {
    const ahead = nextRank(level);
    expect(rankFor(ahead.level)).toEqual(ahead);
  });

  /** And it never runs out however far it is walked. */
  it('walks a hundred rungs past the top without ending', () => {
    let at = TOP.level;
    const seen: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      const rung = nextRank(at);
      expect(rung.level).toBeGreaterThan(at);
      seen.push(rankLabel(rung));
      at = rung.level;
    }
    expect(new Set(seen).size, 'a rung repeated its name').toBe(seen.length);
    expect(seen.at(-1)).toBe(`${TOP.title} ${101}`);
  });
});

describe('the authored ladder is walked once', () => {
  it('gives every authored rung the first degree', () => {
    for (const rung of RANKS) expect(rankFor(rung.level).degree, rung.title).toBe(1);
    expect(rankFor(TOP.level - 1).degree).toBe(1);
  });

  it('never sends a climber back down the names', () => {
    const order = RANKS.map((r) => r.title);
    let seen = -1;
    for (let level = 0; level <= 400; level += 1) {
      const at = order.indexOf(rankFor(level).title);
      expect(at, `level ${level} left the ladder`).toBeGreaterThanOrEqual(seen);
      seen = at;
    }
    // And the last title is where it stays: no lap back to the first.
    expect(rankFor(400).title).toBe(TOP.title);
  });
});

describe('degrees, past the last title', () => {
  it('starts at the top itself, undecorated', () => {
    expect(rankFor(TOP.level).degree).toBe(1);
    expect(rankLabel(rankFor(TOP.level))).toBe(TOP.title);
  });

  it('steps exactly on the boundary and not before', () => {
    for (let i = 1; i <= 4; i += 1) {
      const boundary = TOP.level + i * LEVELS_PER_DEGREE;
      expect(rankFor(boundary - 1).degree, `just under ${boundary}`).toBe(i);
      expect(rankFor(boundary).degree, `at ${boundary}`).toBe(i + 1);
    }
  });

  it('reports the level the degree began at, not the climber’s', () => {
    const level = TOP.level + LEVELS_PER_DEGREE + 3;
    expect(rankFor(level).degree).toBe(2);
    expect(rankFor(level).level).toBe(TOP.level + LEVELS_PER_DEGREE);
  });

  /**
   * A degree is a bigger ask than the last authored rung, which is the whole
   * pacing claim: the slowest step in the game, and it never stops.
   */
  it('costs more than the final authored rung did', () => {
    const lastRung = xpForLevel(TOP.level) - xpForLevel(RANKS.at(-2)!.level);
    const degree = xpForLevel(TOP.level + LEVELS_PER_DEGREE) - xpForLevel(TOP.level);
    expect(degree).toBeGreaterThan(lastRung);
  });
});

describe('what a rank is called', () => {
  it('leaves the first degree unsaid', () => {
    expect(rankLabel({ level: 0, title: 'Newcomer', degree: 1 })).toBe('Newcomer');
  });

  it('says every degree after it', () => {
    expect(rankLabel({ level: 105, title: 'GOAT', degree: 2 })).toBe('GOAT 2');
    expect(rankLabel({ level: 700, title: 'GOAT', degree: 25 })).toBe('GOAT 25');
  });

  /** Arabic, because roman numerals stop being readable around the point a
   *  long career reaches them — measured at GOAT 24 by year forty. */
  it('stays readable at the far end of a career', () => {
    const atForty = rankFor(levelFor(4_734_651));
    expect(rankLabel(atForty)).toBe('GOAT 24');
    expect(rankLabel(atForty)).toMatch(/^[A-Za-z ]+ \d+$/);
  });
});
