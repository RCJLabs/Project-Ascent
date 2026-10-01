import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIMBER, VIEW } from '@/engine/ascent/config';
import { createRun, type RunState } from '@/engine/ascent/game';
import { RUN_MARKS } from '@/engine/ascent/marks';
import { deriveAvatar } from '@/engine/avatar';
import { wall } from '@/engine/ascent/walls';
import { POSES, climberShapes, climbingPose } from '@/ui/climberShapes';
import { POSE_STEPS, buildWall, climberFrame, edgeProfile, facetLight, merged, render, rockOutline } from './render';

// The wall palettes and the rules for having one moved to
// `engine/ascent/walls.ts` at M227, and so did the tests that were here.

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
    palette: wall('granite')!.palette,
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

describe('which way the climber faces', () => {
  const options = {
    palette: wall('granite')!.palette,
    wall: buildWall(9),
    avatar: deriveAvatar({ level: 3, vitality: 'fresh', feet: 0 }),
    scale: 1,
  };

  /** How many ellipses one climber costs, isolated from the rest of the scene. */
  const ellipsesPerClimber = (): number => {
    const live = createRun({ seed: 9 });
    live.distance = 190 * 3;
    const before = stubCtx();
    render(before.ctx, live, options);
    return before.calls.ellipse ?? 0;
  };

  it('draws a back, and a back has no face on it (PLAN.md M209, M226, M357)', () => {
    // The portrait and the share card turned around at M209 and this one did
    // not, because a climber on a wall is a back. A face is two eye-whites,
    // and they are the only ellipses a front adds; from behind, the ellipses
    // are the ears and the helmet's vents, and the count is exactly the back
    // view's.
    const back = climberFrame(options.avatar, options.palette, 3).filter((s) => s.kind === 'ellipse').length;
    expect(ellipsesPerClimber()).toBe(back);
    const frame = climberFrame(options.avatar, options.palette, 3);
    for (const part of ['eye', 'brow', 'mouth', 'face'] as const) {
      expect(frame.filter((s) => s.part === part), part).toEqual([]);
    }
  });
});

/**
 * The line across the wall (PLAN.md M232).
 *
 * The mark's *name* is announced in the page, so what belongs here is the
 * line: that one is drawn where the climb sits, and that no line is drawn
 * for a climb the run is nowhere near.
 *
 * It is found by its shape. The only perfectly horizontal full-width
 * segments on the wall are these — the lane lines run vertically and the
 * strata drop six pixels across the screen, which is what makes them read as
 * strata in the first place.
 */
function horizontals(state: RunState): number[] {
  const found: number[] = [];
  let from: [number, number] | null = null;
  const held: Record<string, unknown> = {};
  const ctx = new Proxy(held, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        if (prop === 'moveTo') from = [args[0] as number, args[1] as number];
        else if (prop === 'lineTo' && from !== null) {
          const [x0, y0] = from;
          const [x1, y1] = [args[0] as number, args[1] as number];
          if (x0 === 0 && x1 === VIEW.width && y0 === y1) found.push(y0);
          from = null;
        }
        return prop === 'measureText' ? { width: 1 } : undefined;
      };
    },
    set(target, prop: string, value: unknown) {
      target[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;

  render(ctx, state, {
    palette: wall('granite')!.palette,
    wall: buildWall(9),
    avatar: deriveAvatar({ level: 3, vitality: 'fresh', feet: 0 }),
    scale: 1,
  });
  return found;
}

describe('the climbs marked on the wall', () => {
  const first = RUN_MARKS[0]!;

  it('draws nothing while the first climb is still out of sight', () => {
    // A run at the start: the first mark is 1,524 px up and the screen shows
    // 166 of them, so there is nothing to draw and no line to mistake for one.
    expect(horizontals(createRun({ seed: 9 }))).toEqual([]);
  });

  it('draws the line where the climb sits', () => {
    const run = createRun({ seed: 9 });
    run.distance = first.px - 100;
    // `screenY`'s own arithmetic: the climber is fixed at CLIMBER.y and the
    // mark is 100 px above them, so the line lands 100 px higher up.
    expect(horizontals(run)).toEqual([CLIMBER.y - 100]);
  });

  it('carries it down past the climber as the run goes on', () => {
    const above = createRun({ seed: 9 });
    above.distance = first.px - 200;
    const past = createRun({ seed: 9 });
    past.distance = first.px + 60;
    expect(horizontals(above)[0]!).toBeLessThan(CLIMBER.y);
    expect(horizontals(past)[0]!).toBeGreaterThan(CLIMBER.y);
  });

  /**
   * Never two at once, and it is worth knowing rather than assuming.
   *
   * The closest pair on the ladder is Half Dome and El Capitan at 686 px, and
   * the screen is 640 — so a frame can hold one line and no more. The drawer
   * still loops, because that is a fact about the tuning and not about the
   * code, and a retune that brought a pair inside a screen should draw both
   * rather than pick one.
   */
  it('never has two on the wall at the same time', () => {
    for (let d = 0; d < RUN_MARKS[3]!.px; d += 57) {
      const run = createRun({ seed: 9 });
      run.distance = d;
      expect(horizontals(run).length, `${d} px`).toBeLessThanOrEqual(1);
    }
    const gaps = RUN_MARKS.slice(1).map((m, i) => m.px - RUN_MARKS[i]!.px);
    expect(Math.min(...gaps)).toBeGreaterThan(VIEW.height);
  });

  /**
   * And the stretches between are bare.
   *
   * The first draft put the run a screen above Half Dome and expected an
   * empty wall; El Capitan was in view, 686 px up, and the test was wrong
   * rather than the code. Between El Capitan and Mt. Washington there really
   * is 2,202 px of nothing, which is where this asks.
   */
  it('leaves the wall bare between two climbs', () => {
    const run = createRun({ seed: 9 });
    run.distance = 3_000;
    expect(horizontals(run)).toEqual([]);
  });

  /** A line only marks a climb while that climb is on the screen. */
  it('takes the line away once the climb has gone by', () => {
    const run = createRun({ seed: 9 });
    run.distance = first.px + VIEW.height;
    expect(horizontals(run)).not.toContain(CLIMBER.y - (first.px - run.distance));
  });
});

/**
 * The figure in the game, frame by frame (PLAN.md M357).
 *
 * Since M357 the climber is a person rather than a pictogram, and building
 * one costs about 0.8ms at full speed. The game draws it every frame, twice
 * with a ghost on screen, so it is built once per step of the climbing cycle
 * and kept, and drawn with neighbouring fills of one colour merged.
 */
describe('the figure in the game', () => {
  const palette = wall('granite')!.palette;
  const avatar = deriveAvatar({ level: 90, vitality: 'worked', feet: 0 });

  it('builds each step of the cycle once', () => {
    expect(climberFrame(avatar, palette, 0.25)).toBe(climberFrame(avatar, palette, 0.25));
    expect(climberFrame(avatar, palette, 0.25)).not.toBe(climberFrame(avatar, palette, 0.5));
    // The cycle wraps, and a phase within half a step is the same step.
    expect(climberFrame(avatar, palette, 1.25)).toBe(climberFrame(avatar, palette, 0.25));
    expect(climberFrame(avatar, palette, 0.25 + 0.4 / POSE_STEPS)).toBe(climberFrame(avatar, palette, 0.25));
  });

  it('is the climbing pose for its step, not a fixed one', () => {
    const head = (phase: number) => {
      const shapes = climberShapes(avatar, { facing: 'back', showGround: false, colors: { ground: '#000000', surface: '#000000', accentGround: '#000000' }, joints: climbingPose(POSES[avatar.pose], phase) });
      return shapes.find((s) => s.part === 'head');
    };
    const drawn = climberFrame(avatar, palette, 0.5).find((s) => s.part === 'head');
    expect(drawn).toEqual(head(0.5));
  });

  it('draws few enough shapes to hold sixty frames a second', () => {
    // The old pictogram was 28 to 36; the person is 80-odd before the game
    // leaves out what is under a pixel and merges what shares a colour.
    for (const level of [0, 8, 20, 40, 60, 90]) {
      for (const figure of ['male', 'female'] as const) {
        const frame = climberFrame(deriveAvatar({ level, figure, vitality: 'worked', feet: 0 }), palette, 0.3);
        expect(frame.length, `${figure} L${level}`).toBeLessThanOrEqual(44);
      }
    }
  });

  it('keeps the painting order: only neighbours are merged', () => {
    // Merging two fills of one colour with something painted between them
    // would lift the lower one over it.
    const full = climberShapes(avatar, { facing: 'back', showGround: false, colors: { ground: palette.rockNear, surface: palette.sky, accentGround: palette.strata }, joints: climbingPose(POSES[avatar.pose], 0.3125) });
    const paints = (shapes: typeof full) =>
      shapes
        .filter((s) => !(s.detail && s.kind === 'path' && s.fill === undefined))
        .map((s) => (s.kind === 'path' ? `${s.fill ?? ''}/${s.stroke ?? ''}` : s.kind === 'polyline' ? `/${s.stroke}` : s.fill))
        .filter((paint, i, all) => i === 0 || paint !== all[i - 1]);
    const drawn = climberFrame(avatar, palette, 0.3125);
    expect(paints(drawn)).toEqual(paints(full));
  });

  it('merges fills, and never a stroke into anything', () => {
    // The figure today has no stroke beside a fill of its colour, so this is
    // the one place the rule is asked: a stroke merged into a fill would be
    // filled instead of drawn, and two strokes merged would draw the second
    // in the first one's colour.
    const fill = (d: string, colour: string) => ({ kind: 'path' as const, d, fill: colour });
    const stroke = (d: string, colour: string) => ({ kind: 'path' as const, d, stroke: colour, width: 2 });
    expect(merged([fill('M 0 0 Z', '#111111'), fill('M 1 1 Z', '#111111')])).toHaveLength(1);
    expect(merged([fill('M 0 0 Z', '#111111'), fill('M 1 1 Z', '#222222')])).toHaveLength(2);
    expect(merged([fill('M 0 0 Z', '#111111'), { ...stroke('M 1 1 L 2 2', '#111111'), fill: '#111111' }])).toHaveLength(2);
    expect(merged([stroke('M 0 0 L 1 1', '#111111'), stroke('M 1 1 L 2 2', '#222222')])).toHaveLength(2);
    expect(merged([fill('M 0 0 Z', '#111111'), fill('M 1 1 Z', '#222222'), fill('M 2 2 Z', '#111111')])).toHaveLength(3);
  });

  it('draws the ghost as a silhouette: one ink, no shading or seams', () => {
    const ghost = climberFrame(avatar, palette, 0.3, palette.ink);
    expect(ghost.some((s) => s.detail)).toBe(false);
    for (const shape of ghost) {
      const paints = shape.kind === 'path' ? [shape.fill, shape.stroke].filter(Boolean) : shape.kind === 'polyline' ? [shape.stroke] : [shape.fill];
      expect(paints.every((p) => p === palette.ink), shape.part).toBe(true);
    }
  });
});

