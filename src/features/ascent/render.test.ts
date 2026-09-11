import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIMBER, VIEW } from '@/engine/ascent/config';
import { createRun } from '@/engine/ascent/game';
import { deriveAvatar } from '@/engine/avatar';
import {
  THEME_UNLOCKS,
  WALL_THEMES,
  buildWall,
  edgeProfile,
  facetLight,
  render,
  rockOutline,
  themeForHeight,
} from './render';

describe('wall themes', () => {
  it('unlock by height, keeping the best one earned', () => {
    expect(themeForHeight(0, false)).toBe(WALL_THEMES.granite);
    expect(themeForHeight(2_899, false)).toBe(WALL_THEMES.granite);
    expect(themeForHeight(2_900, false)).toBe(WALL_THEMES.sandstone);
    expect(themeForHeight(500_000, false)).toBe(WALL_THEMES.alpine);
  });

  it('give a rest day its own sky, whatever you have unlocked', () => {
    expect(themeForHeight(0, true)).toBe(WALL_THEMES.recovery);
    expect(themeForHeight(500_000, true)).toBe(WALL_THEMES.recovery);
  });

  it('are all complete palettes, so no colour is ever undefined', () => {
    const keys = Object.keys(WALL_THEMES.granite!);
    for (const [name, palette] of Object.entries(WALL_THEMES)) {
      expect(Object.keys(palette).sort(), name).toEqual(keys.sort());
      for (const value of Object.values(palette)) expect(value, name).toBeTruthy();
    }
    for (const unlock of THEME_UNLOCKS) expect(WALL_THEMES[unlock.id], unlock.id).toBeDefined();
  });
});

describe('the wall pattern', () => {
  it('is the same for one seed and different for another', () => {
    expect(buildWall(42)).toEqual(buildWall(42));
    expect(buildWall(42)).not.toEqual(buildWall(43));
  });

  it('never cuts more than a lane out of the screen', () => {
    const wall = buildWall(7, 64);
    for (const depth of [...wall.left, ...wall.right]) {
      expect(depth).toBeGreaterThan(0);
      expect(depth).toBeLessThan(60);
    }
  });
});

describe('which way the wall scrolls', () => {
  const DEPTHS = [20, 30, 40, 50, 25, 35];
  const STEP = 90;

  /** Where a given depth value appears, for a frame at this distance. */
  const findY = (depth: number, offset: number): number[] =>
    edgeProfile(DEPTHS, offset, STEP, 640)
      .filter((p) => p.depth === depth)
      .map((p) => p.y);

  it('moves the wall down as the climber goes up', () => {
    // The reported bug, and the reason this is a pure function: the climber
    // ascends, so everything fixed to the wall must travel *down* the
    // screen. Entities already did (`screenY` grows with distance) and so
    // did the strata; the walls were the one thing sliding the other way.
    const before = findY(40, 0);
    const after = findY(40, STEP);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(after[i]! - before[i]!).toBeCloseTo(STEP, 6);
    }
  });

  it('moves smoothly rather than in jumps', () => {
    // A fractional offset has to slide the outline, not snap it.
    const a = edgeProfile(DEPTHS, 0, STEP, 640);
    const b = edgeProfile(DEPTHS, 30, STEP, 640);
    expect(b[0]!.y - a[0]!.y).toBeCloseTo(30, 6);
    expect(b[0]!.depth).toBe(a[0]!.depth);
  });

  it('covers the whole view, with a slot spare at each end', () => {
    for (const offset of [0, 45, 89, 5_000]) {
      const points = edgeProfile(DEPTHS, offset, STEP, 640);
      expect(points[0]!.y).toBeLessThanOrEqual(0);
      expect(points[points.length - 1]!.y).toBeGreaterThanOrEqual(640);
    }
  });

  it('repeats seamlessly', () => {
    // One full pattern height on is the same frame again.
    const height = DEPTHS.length * STEP;
    expect(edgeProfile(DEPTHS, 17, STEP, 640)).toEqual(
      edgeProfile(DEPTHS, 17 + height, STEP, 640),
    );
  });

  it('handles a negative offset without a gap', () => {
    expect(() => edgeProfile(DEPTHS, -500, STEP, 640)).not.toThrow();
    expect(edgeProfile(DEPTHS, -500, STEP, 640).every((p) => DEPTHS.includes(p.depth))).toBe(true);
  });
});

describe('rocks', () => {
  it('are the same rock every frame', () => {
    // A shape re-rolled per frame is a rock that boils.
    expect(rockOutline(7, 40, 40)).toEqual(rockOutline(7, 40, 40));
  });

  it('are different from each other', () => {
    expect(rockOutline(7, 40, 40)).not.toEqual(rockOutline(8, 40, 40));
  });

  it('stay inside the box the collision maths uses', () => {
    // Drawing outside it would punish a player for a hit they could not see
    // coming; drawing far inside it would do the reverse.
    for (const id of [0, 1, 2, 3, 17, 199, 5_000]) {
      for (const [w, h] of [[40, 40], [80, 34], [30, 60]] as const) {
        for (const p of rockOutline(id, w, h)) {
          expect(Math.abs(p.x), `id ${id}`).toBeLessThanOrEqual(w / 2);
          expect(Math.abs(p.y), `id ${id}`).toBeLessThanOrEqual(h / 2);
        }
      }
    }
  });

  it('are lumpy rather than round', () => {
    // The point of the change: a ring of equal radii is a rounded rect by
    // another name.
    const points = rockOutline(3, 40, 40);
    const radii = points.map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(2);
  });

  it('has enough vertices to read as rock and few enough to stay cheap', () => {
    expect(rockOutline(1, 40, 40)).toHaveLength(9);
  });
});

describe('rock shading', () => {
  it('lights the upper-left and shadows the lower-right', () => {
    // One light, so every rock on screen agrees about where it comes from.
    expect(facetLight(-1, -1)).toBeGreaterThan(0.9);
    expect(facetLight(1, 1)).toBeLessThan(-0.9);
  });

  it('leaves the faces across the light barely touched', () => {
    expect(Math.abs(facetLight(1, -1))).toBeLessThan(0.001);
    expect(Math.abs(facetLight(-1, 1))).toBeLessThan(0.001);
  });

  it('does not divide by a zero-length facet', () => {
    expect(facetLight(0, 0)).toBe(0);
  });

  it('depends on direction, not distance', () => {
    // A facet twice as far out faces the same way and is lit the same.
    expect(facetLight(-2, -2)).toBeCloseTo(facetLight(-0.1, -0.1), 10);
  });
});

describe('the climber moves', () => {
  const RENDER = readFileSync('src/features/ascent/render.ts', 'utf8');

  it('poses the figure per frame in the game', () => {
    // A fixed silhouette sliding up a scrolling wall reads as a sticker
    // being dragged, not a climber climbing.
    expect(RENDER).toContain('climbingPose(');
    expect(RENDER).toContain('joints:');
  });

  it('drives the cycle from distance, not from a clock', () => {
    // The cadence then rises with the climber's speed for free, and a
    // paused run holds a pose instead of running on the spot.
    expect(RENDER).toContain('state.distance / CLIMB_CYCLE_PX');
  });

  it('leaves the portraits still', () => {
    // The avatar on Home, the climber page and the share cards is an
    // identity, not an animation — and an SVG looping forever is motion
    // nobody asked for on a page they are reading.
    const still = ['src/ui/Avatar.tsx', 'src/ui/shareCard.ts'];
    for (const path of still) {
      expect(readFileSync(path, 'utf8'), path).not.toContain('climbingPose');
    }
  });
});

/**
 * A canvas that only remembers what it was asked to do.
 *
 * `ctx.scale` is called exactly once per climber drawn and nowhere else in
 * the file, which makes counting it the cheapest way to ask "is the ghost
 * on screen" without a real canvas or a pixel comparison.
 */
// Node has no canvas, and `drawShape` builds a Path2D for every limb.
(globalThis as { Path2D?: unknown }).Path2D ??= class {
  constructor(readonly d?: string) {}
};

function stubCtx() {
  const held: Record<string, unknown> = {};
  const calls: Record<string, number> = {};
  const alphas: number[] = [];
  /** The y each climber was placed at, in the order they were drawn. */
  const tops: number[] = [];
  let pending: number | null = null;
  const ctx = new Proxy(held, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls[prop] = (calls[prop] ?? 0) + 1;
        // `translate` then `scale` is the climber's own pair; every other
        // translate in the file stands alone.
        if (prop === 'translate') pending = args[1] as number;
        else if (prop === 'scale' && pending !== null) {
          tops.push(pending);
          pending = null;
        }
        return prop === 'measureText' ? { width: args.length } : undefined;
      };
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      if (prop === 'globalAlpha') alphas.push(value as number);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, alphas, tops };
}

describe('the ghost on the wall', () => {
  const options = {
    palette: WALL_THEMES.granite!,
    wall: buildWall(9),
    avatar: deriveAvatar({ level: 3, vitality: 'fresh', feet: 0 }),
    scale: 1,
  };

  /** Two climbers drawn means the ghost was one of them. */
  const drawn = (ghost?: ReturnType<typeof createRun>) => {
    const { ctx, calls, alphas, tops } = stubCtx();
    render(ctx, createRun({ seed: 9 }), { ...options, ...(ghost ? { ghost } : {}) });
    return { climbers: calls.scale ?? 0, alphas, tops };
  };

  it('is not drawn when there is none', () => {
    expect(drawn().climbers).toBe(1);
  });

  it('is drawn beside the climber when it is close', () => {
    const ghost = createRun({ seed: 9 });
    ghost.distance = 60;
    expect(drawn(ghost).climbers).toBe(2);
  });

  it('is fainter than the climber, so the two cannot be confused', () => {
    const ghost = createRun({ seed: 9 });
    ghost.distance = 60;
    const { alphas } = drawn(ghost);
    expect(alphas.length).toBe(2);
    // The ghost is drawn first, and the live climber at full strength.
    expect(alphas[0]).toBeLessThan(0.5);
    expect(alphas[1]).toBe(1);
  });

  it('is drawn above the climber when it is ahead on the wall', () => {
    // The whole point of the second figure: you can see the gap. Pinned to
    // the climber's own line it would say nothing at all.
    const ghost = createRun({ seed: 9 });
    ghost.distance = 90;
    const { tops } = drawn(ghost);
    expect(tops.length).toBe(2);
    // Ghost first, then the live climber. Smaller y is higher up.
    expect(tops[0]!).toBeLessThan(tops[1]!);
    expect(tops[1]! - tops[0]!).toBeCloseTo(90, 6);
  });

  it('is not drawn once it is off the top of the screen', () => {
    const ghost = createRun({ seed: 9 });
    ghost.distance = CLIMBER.y + CLIMBER.height + 1;
    expect(drawn(ghost).climbers).toBe(1);
  });

  it('is not drawn once it is off the bottom', () => {
    const { ctx, calls } = stubCtx();
    const live = createRun({ seed: 9 });
    live.distance = VIEW.height + CLIMBER.height * 2;
    render(ctx, live, { ...options, ghost: createRun({ seed: 9 }) });
    expect(calls.scale ?? 0).toBe(1);
  });

  it('keeps being drawn after its run ended, until the wall carries it off', () => {
    // The crashed ghost is the race: two runs on one wall climb at the same
    // rate, so the gap only opens when one of them stops. It freezes where
    // it fell and scrolls down past the live climber.
    const ghost = createRun({ seed: 9 });
    ghost.distance = 60;
    ghost.over = true;
    expect(drawn(ghost).climbers).toBe(2);
  });

  it('is gone once the wall has carried the fall off the bottom', () => {
    const { ctx, calls } = stubCtx();
    const live = createRun({ seed: 9 });
    live.distance = VIEW.height + CLIMBER.height * 2;
    const ghost = createRun({ seed: 9 });
    ghost.over = true;
    render(ctx, live, { ...options, ghost });
    expect(calls.scale ?? 0).toBe(1);
  });
});
