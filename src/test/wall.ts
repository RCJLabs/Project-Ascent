import type * as Config from '@/engine/ascent/config';

/** Whether the wall is currently allowed to end a run. */
export interface WallSwitch {
  deadly: boolean;
}

/**
 * A wall built to order, so a test decides when a run ends (PLAN.md M232,
 * shared at M287).
 *
 * The daily wall is built from `dailySeed(today())`, so how long an unsteered
 * run survives is a property of the date the suite runs on. Measured over
 * thirty-three dates it ranges from under Devils Tower to past Mt.
 * Washington — a spread wide enough that a test can want either end of it and
 * get the other. M232 found the first half of that (a run that has to reach a
 * climb and does not) and M287 the second (a run that has to earn nothing and
 * earns something), a year of wall apart.
 *
 * `spawnWeightsAt` is the one function that decides what a row is made of,
 * and nothing else in the tuning is touched — the ramp, the gaps and the
 * speeds are all the real ones, so a run climbs at exactly the rate it would
 * in a player's hands. All that changes is whether the wall can end it, which
 * is the part of the game these tests are not about. The crossing on a real
 * wall is `marks.test.ts`, which plays the actual engine.
 *
 * ## Deadly has to be quick, and quick was two dice rolls
 *
 * **Where it lands.** The spawner guarantees one clear lane per row, so a
 * climber left in the middle survives a row two times in three — on a seed
 * that changes daily. Three lanes wide leaves no lane clear: the width is
 * read at collision, while the guarantee counts the `lanes` field, which is
 * still one.
 *
 * **When it arrives.** A row spawns a full screen above the climber, so an
 * ordinary rock takes about 1.5 s to reach them — just past the 1.6 s a climb
 * name is held for, which is the window `runMarks.test.tsx` needs to land
 * inside. Debris falls as the climber climbs, so at `fallRate` 3 it closes at
 * four times the speed and arrives in a quarter of the time.
 *
 * Both are inert while `deadly` is false, because nothing else spawns an
 * obstacle at all. They are a stopwatch, not a wall.
 *
 * What it is worth as a fixture is that it is not a seed at all: measured
 * over the same thirty-three dates, a deadly run lands at 1,040 ft on every
 * one of them. Past Devils Tower, a long way short of El Capitan, and the
 * same number whatever wall the day built.
 */
export function switchableWall(real: typeof Config, wall: WallSwitch) {
  return {
    ...real,
    spawnWeightsAt: (): [string, number][] =>
      wall.deadly
        ? [
            ['obstacle', 100],
            ['coin', 0],
            ['powerup', 0],
          ]
        : [
            ['obstacle', 0],
            ['coin', 100 - real.DIFFICULTY.powerupWeight],
            ['powerup', real.DIFFICULTY.powerupWeight],
          ],
    SPAWN: { ...real.SPAWN, obstacles: [['debris', 100]] },
    SIZES: {
      ...real.SIZES,
      debris: { ...real.SIZES.debris, width: real.LANE_WIDTH * 3, fallRate: 3 },
    },
  };
}
