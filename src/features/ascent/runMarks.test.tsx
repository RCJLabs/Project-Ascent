// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { RUN_MARKS } from '@/engine/ascent/marks';
import { playableCanvas } from '@/test/canvas';
import { hydrate, renderAt, reset } from '@/test/render';
import { useGame } from '@/store/game';
import { AscentPage } from './AscentPage';

/**
 * The name of the climb a run has just passed (PLAN.md M232).
 *
 * The line is the renderer's and is checked in `render.test.ts`; the crossing
 * is the engine's and is checked in `marks.test.ts`. What is left for here is
 * the half neither can see — that the page is listening for the event at all,
 * and that the name goes up and comes back down.
 *
 * A run has to survive six seconds to reach Half Dome, and an unsteered run
 * on a real wall does not get close: the first draft of this file waited
 * fifteen seconds three times over and never saw a mark.
 *
 * So the wall is built to order. `spawnWeightsAt` is the one function that
 * decides what a row is made of, and nothing else in the tuning is touched —
 * the ramp, the gaps and the speeds are all the real ones, so a run climbs at
 * exactly the rate it would in a player's hands. All that changes is whether
 * the wall can end it, which is the part of the game these tests are not
 * about. The crossing on a real wall is `marks.test.ts`, which plays the
 * actual engine.
 */
const wall = vi.hoisted(() => ({ deadly: false }));

vi.mock('@/engine/ascent/config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/engine/ascent/config')>();
  return {
    ...real,
    spawnWeightsAt: () =>
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
    /**
     * And when it is deadly, it ends the run inside a third of a second.
     *
     * Two things had to go, and both were dice rolls rather than difficulty:
     *
     * **Where it lands.** The spawner guarantees one clear lane per row, so a
     * climber left in the middle survives a row two times in three — on a
     * seed that changes daily. Three lanes wide leaves no lane clear: the
     * width is read at collision, while the guarantee counts the `lanes`
     * field, which is still one.
     *
     * **When it arrives.** A row spawns a full screen above the climber, so
     * an ordinary rock takes about 1.5 s to reach them — just past the 1.6 s
     * the name is held for, which is the window the last test needs to land
     * inside. Debris falls as the climber climbs, so at `fallRate` 3 it
     * closes at four times the speed and arrives in a quarter of the time.
     *
     * Both are inert unless `deadly` is set, because nothing else spawns an
     * obstacle at all. They are a stopwatch, not a wall.
     */
    SPAWN: { ...real.SPAWN, obstacles: [['debris', 100]] },
    SIZES: {
      ...real.SIZES,
      debris: { ...real.SIZES.debris, width: real.LANE_WIDTH * 3, fallRate: 3 },
    },
  };
});

let restore: (() => void) | null = null;

afterEach(() => {
  // Unmount before the mocks go: tearing down the page cancels the frame
  // loop, and a loop still running when `requestAnimationFrame` is handed
  // back is a loop drawing into a canvas that no longer accepts it.
  cleanup();
  restore?.();
  restore = null;
  wall.deadly = false;
});

async function climb(): Promise<void> {
  await reset();
  await useGame.getState().load();
  await hydrate();
  restore = playableCanvas();
  renderAt('/ascent', <AscentPage />);
  (await screen.findByRole('button', { name: /Climb/ })).click();
}

/**
 * What the banner on the wall says, or the empty string.
 *
 * Found by its region and never by its words. The card a finished run shows
 * says *"Past Half Dome. El Capitan is 285 ft higher."* — M210's sentence,
 * the same opening, in the same page — and a query for the text matched it
 * instead. The third test below passed on that match while the thing it was
 * built to catch walked straight through, and the region has a name now
 * because of it.
 */
function banner(): string {
  return screen.queryByLabelText('Climb passed')?.textContent ?? '';
}

/**
 * What the banner said, once per frame, for `count` frames.
 *
 * `playableCanvas` queues each frame as a `setTimeout(0)`, so draining one
 * macrotask is exactly one frame — which makes this a recording of the run
 * rather than a poll of it. `waitFor` cannot do this job: a `waitFor` looking
 * for the banner *gone* is satisfied the moment the next climb replaces it,
 * so a banner that never cleared at all would pass. That is not hypothetical
 * either; it is what the first version of this file did.
 */
async function sample(count: number): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < count; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    seen.push(banner());
  }
  return seen;
}

/** Frames at 16 ms: Half Dome lands at 6.2 s and El Capitan at 8.7 s. */
const TO_EL_CAPITAN = 620;

describe('the climb a run has just passed', () => {
  /**
   * The whole wiring in one recording: the page starts a run, the engine
   * raises the event, the name goes up, it comes down on its own, and the
   * next climb puts a different name up.
   *
   * Driven by the real loop rather than by pushing an event in, because the
   * thing most likely to break is the listening — an event the page never
   * reads is exactly what a test that pushed one would not notice.
   */
  it('goes up, comes back down, and the next climb follows it', async () => {
    await climb();
    const frames = await sample(TO_EL_CAPITAN);

    const first = `Past ${RUN_MARKS[0]!.name}`;
    const second = `Past ${RUN_MARKS[1]!.name}`;
    expect(frames, 'the first climb was never announced').toContain(first);
    expect(frames, 'the second climb was never announced').toContain(second);

    // The gap between them is the part a `setTimeout` would have got wrong.
    // Half Dome and El Capitan are 2.45 s apart and the name holds for 1.6,
    // so there is close to a second of wall with nothing written on it.
    const upAt = frames.indexOf(first);
    const nextAt = frames.indexOf(second);
    expect(nextAt).toBeGreaterThan(upAt);
    const between = frames.slice(upAt, nextAt);
    expect(between, 'the name never came down on its own').toContain('');

    // And it came down *after* being readable, not instead of being read.
    expect(between.filter((f) => f === first).length).toBeGreaterThan(30);
  }, 30_000);

  /**
   * It is a caption and never a control.
   *
   * The canvas under it is how the game is played — every tap is a lane
   * change — so a banner that took pointer events would cost a dodge at the
   * exact moment the player was being told something, and the crash would be
   * the game's fault.
   */
  it('never takes a tap away from the wall', async () => {
    await climb();
    const holder = await waitFor(() => screen.getByLabelText('Climb passed'), { timeout: 15_000 });
    expect(holder.textContent).toBe(`Past ${RUN_MARKS[0]!.name}`);
    expect(holder.className).toContain('pointer-events-none');
    // Polite: worth hearing, never worth cutting off a hit cue.
    expect(holder.getAttribute('aria-live')).toBe('polite');
  }, 20_000);

  /**
   * A climb passed on the last run is not one passed on this one.
   *
   * The banner is held by a timestamp the frame loop checks, and a loop that
   * has stopped checks nothing. A run that ends *inside* the hold leaves the
   * name standing, and the next run would open claiming a climb it had not
   * made — for a whole second, because the clock the hold is measured against
   * does not advance while nothing is being drawn.
   *
   * So the run is killed one frame after the name goes up, which is what the
   * three-lane rock in the mock above is for. A run that outlived the hold
   * would have nothing left to leak, and this would pass without testing
   * anything — so it checks that the name is still up before it restarts.
   */
  it('starts the next run with nothing claimed', async () => {
    await climb();
    for (let i = 0; i < TO_EL_CAPITAN && banner() === ''; i++) await sample(1);
    expect(banner(), 'no climb was ever announced').toBe(`Past ${RUN_MARKS[0]!.name}`);

    wall.deadly = true;
    for (let i = 0; i < 90 && screen.queryByRole('button', { name: /Again/ }) === null; i++) {
      await sample(1);
    }
    wall.deadly = false;
    const again = screen.getByRole('button', { name: /Again/ });
    expect(banner(), 'the run outlasted the hold, so there is nothing to carry').not.toBe('');

    act(() => again.click());
    // Read before a single frame is drained: `start` renders synchronously,
    // so this is the DOM the new run opens on.
    expect(banner(), 'the new run opened claiming the last one’s climb').toBe('');
    // And it stays empty while the run climbs nowhere near the first mark.
    expect(await sample(30)).toEqual(Array.from({ length: 30 }, () => ''));
  }, 30_000);
});
