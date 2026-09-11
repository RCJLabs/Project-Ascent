/**
 * Canvas rendering for The Ascent.
 *
 * Everything is drawn in the simulation's virtual 360×640 space and scaled
 * once by a transform, so the game looks and plays identically on any
 * screen — and the climber is the player's own avatar, drawn from the same
 * shape list the app and the share cards use.
 */

import type { AvatarConfig } from '@/engine/avatar';
import { CLIMBER, LANES, LANE_WIDTH, VIEW } from '@/engine/ascent/config';
import { climberX, isObstacle, screenY, type Entity, type RunState } from '@/engine/ascent/game';
import { ghostY } from '@/engine/ascent/replay';
import { createRng, next } from '@/engine/ascent/rng';
import { POSES, climberShapes, climbingPose, type Shape } from '@/ui/climberShapes';

/**
 * World pixels per full climbing cycle.
 *
 * One reach per this much wall. Tuned by watching it: at 110 the limbs
 * cycled fast enough to blur into a flutter, which is what "make it a little
 * slower" was about; much longer than this and the figure looks dragged
 * rather than moving itself.
 */
const CLIMB_CYCLE_PX = 190;

export interface Palette {
  sky: string;
  rockNear: string;
  rockFar: string;
  strata: string;
  lane: string;
  rock: string;
  boulder: string;
  debris: string;
  coin: string;
  slowmo: string;
  magnet: string;
  heart: string;
  ink: string;
}

export const WALL_THEMES: Record<string, Palette> = {
  granite: {
    sky: '#1b2733', rockNear: '#2e3d4c', rockFar: '#243141', strata: '#35465a',
    lane: 'rgba(255,255,255,0.05)', rock: '#8a97a5', boulder: '#6d7d8d', debris: '#c2ccd6',
    coin: '#f2b705', slowmo: '#5aa3d4', magnet: '#b57edc', heart: '#e2574c', ink: '#e8eef3',
  },
  sandstone: {
    sky: '#2b1d18', rockNear: '#4a2f24', rockFar: '#3a251d', strata: '#5d3b2c',
    lane: 'rgba(255,255,255,0.05)', rock: '#c98b5f', boulder: '#a86f47', debris: '#e8c9a8',
    coin: '#ffd166', slowmo: '#6fb3d9', magnet: '#c48fd6', heart: '#e2574c', ink: '#f6ece3',
  },
  alpine: {
    sky: '#101c28', rockNear: '#22323f', rockFar: '#1a2733', strata: '#2c4050',
    lane: 'rgba(255,255,255,0.06)', rock: '#b9c9d6', boulder: '#94a8b8', debris: '#e9f2f8',
    coin: '#ffd166', slowmo: '#7dc3e8', magnet: '#c8a4e0', heart: '#e2574c', ink: '#eef6fb',
  },
  /** Rest-day weather: lighter, calmer, unmistakably different. */
  recovery: {
    sky: '#22384a', rockNear: '#365065', rockFar: '#2b4155', strata: '#436a85',
    lane: 'rgba(255,255,255,0.07)', rock: '#9fb6c9', boulder: '#7f9ab0', debris: '#d9e6f0',
    coin: '#ffd97d', slowmo: '#8fd0f0', magnet: '#cfa8e8', heart: '#ef7f74', ink: '#eef6fb',
  },
};

/** Repeating jagged edge, generated once per run from its seed. */
/** Cosmetic walls, unlocked by height on the altimeter. */
export const THEME_UNLOCKS: { id: string; name: string; feet: number }[] = [
  { id: 'granite', name: 'Granite', feet: 0 },
  { id: 'sandstone', name: 'Sandstone', feet: 2_900 },
  { id: 'alpine', name: 'Alpine', feet: 29_032 },
];

/** The best wall the climber has earned. Rest days override it. */
export function themeForHeight(feet: number, rested: boolean): Palette {
  if (rested) return WALL_THEMES.recovery!;
  let chosen = THEME_UNLOCKS[0]!;
  for (const theme of THEME_UNLOCKS) if (feet >= theme.feet) chosen = theme;
  return WALL_THEMES[chosen.id]!;
}

export interface WallPattern {
  left: number[];
  right: number[];
  step: number;
}

export function buildWall(seed: number, points = 24): WallPattern {
  const rng = createRng(seed ^ 0x5f3759df);
  return {
    left: Array.from({ length: points }, () => 18 + next(rng) * 34),
    right: Array.from({ length: points }, () => 18 + next(rng) * 34),
    step: 90,
  };
}

/**
 * Where each notch of a wall edge sits on screen, for one frame.
 *
 * Pure, and separate from the drawing, because the scroll *direction* was
 * wrong and a direction bug is invisible in a canvas call. The climber is
 * going up, so everything fixed to the wall must travel **down** the screen
 * — which is what `screenY` does for entities and what the strata already
 * did, leaving the walls as the one thing sliding the other way. Reported as
 * "the side walls are moving upwards instead of down", and that is exactly
 * what it was.
 *
 * The arithmetic, so the next person does not have to re-derive it: with
 * `base = floor(shift / step)` and `frac = shift % step`, taking the depth
 * at `base - i` and drawing it at `i * step + frac` means that when `shift`
 * grows by one `step`, the same depth is found one slot further down and
 * lands one `step` lower. Both halves have to move together; changing only
 * the `y` slides the outline while the peaks stay put.
 */
export function edgeProfile(
  depths: readonly number[],
  offset: number,
  step: number,
  viewHeight: number,
): { y: number; depth: number }[] {
  const n = depths.length;
  const height = n * step;
  const shift = ((offset % height) + height) % height;
  const base = Math.floor(shift / step);
  const frac = shift % step;

  const out: { y: number; depth: number }[] = [];
  // Two extra slots at each end: `frac` slides the whole run by up to a
  // step, and a gap at the top edge is a visible seam.
  for (let i = -2; i <= viewHeight / step + 2; i++) {
    const index = (((base - i) % n) + n) % n;
    out.push({ y: i * step + frac, depth: depths[index]! });
  }
  return out;
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  depths: number[],
  offset: number,
  step: number,
  color: string,
  side: 'left' | 'right',
): void {
  const points = edgeProfile(depths, offset, step, VIEW.height);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(side === 'left' ? 0 : VIEW.width, -step * 2);
  for (const { y, depth } of points) {
    ctx.lineTo(side === 'left' ? depth : VIEW.width - depth, y);
    ctx.lineTo(side === 'left' ? depth * 0.4 : VIEW.width - depth * 0.4, y + step / 2);
  }
  ctx.lineTo(side === 'left' ? 0 : VIEW.width, VIEW.height + step * 2);
  ctx.closePath();
  ctx.fill();
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  switch (shape.kind) {
    case 'circle':
      ctx.fillStyle = shape.fill;
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ellipse':
      ctx.fillStyle = shape.fill;
      ctx.beginPath();
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'rect':
      ctx.fillStyle = shape.fill;
      ctx.beginPath();
      ctx.roundRect(shape.x, shape.y, shape.w, shape.h, shape.rx);
      ctx.fill();
      break;
    case 'path': {
      const path = new Path2D(shape.d);
      if (shape.fill && shape.fill !== 'none') {
        ctx.fillStyle = shape.fill;
        ctx.fill(path);
      }
      if (shape.stroke) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.width ?? 2;
        ctx.lineCap = 'round';
        ctx.stroke(path);
      }
      break;
    }
    case 'polyline':
      ctx.strokeStyle = shape.stroke;
      ctx.lineWidth = shape.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      shape.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.stroke();
      break;
  }
}

/**
 * An obstacle's outline: a lumpy polygon, not a rounded rectangle.
 *
 * Rocks were rounded rects with a lighter band across the top, which reads
 * as a brick. Real rock has facets and no two are the same, so the outline
 * is a ring of points at varying radii — deterministic from the entity's id,
 * because a shape re-rolled every frame is a rock that boils.
 *
 * Returned as plain numbers so the shape can be tested without a canvas: it
 * has to stay inside the box the collision maths uses, or the game will
 * punish a player for a hit they could not see coming.
 */
export function rockOutline(
  id: number,
  width: number,
  height: number,
  points = 9,
): { x: number; y: number }[] {
  const rng = createRng((id + 1) * 0x9e3779b1);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points; i++) {
    // Jitter the angle as well as the radius: evenly spaced vertices read as
    // a gem, and a boulder is not a gem.
    const spread = (Math.PI * 2) / points;
    const angle = i * spread + (next(rng) - 0.5) * spread * 0.55;
    // Never past the collision box — 0.5 is its edge, so this stays inside.
    const radius = 0.34 + next(rng) * 0.16;
    out.push({ x: Math.cos(angle) * radius * width, y: Math.sin(angle) * radius * height });
  }
  return out;
}

/** One colour, lightened or darkened. Amount is a fraction of full white/black. */
function shade(color: string, amount: number): string {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return color;
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16);
    return Math.max(0, Math.min(255, Math.round(value + amount * 255)));
  };
  return `rgb(${channel(0)}, ${channel(2)}, ${channel(4)})`;
}

/** Light from the upper-left, as a unit vector. Canvas y grows downward. */
const LIGHT = { x: -0.707, y: -0.707 };

/**
 * How bright one facet of a rock is, from where it faces.
 *
 * The first attempt shaded three vertical bands across the whole rock, which
 * at 40px read as a striped slab rather than stone — the stripes ran
 * straight while the silhouette was lumpy, so nothing lined up. Shading each
 * triangle by the direction it actually faces costs the same and gives the
 * faceted look the outline was for.
 *
 * Returned as a number in roughly [-1, 1] so the mapping to a colour stays
 * in one place, and so this can be checked without a canvas.
 */
export function facetLight(cx: number, cy: number): number {
  const length = Math.hypot(cx, cy);
  if (length === 0) return 0;
  return (cx / length) * LIGHT.x + (cy / length) * LIGHT.y;
}

function drawRock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  entity: Entity,
  color: string,
): void {
  const points = rockOutline(entity.id, entity.width, entity.height);
  const trace = () => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = color;
  trace();
  ctx.fill();

  // One triangle per edge, from the centre out, each shaded by which way it
  // faces. A hairline stroke in the same colour closes the seams antialiasing
  // leaves between adjacent triangles.
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const tone = shade(color, facetLight((a.x + b.x) / 2, (a.y + b.y) / 2) * 0.12);
    ctx.fillStyle = tone;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // A dark rim, so a rock separates from the wall behind it at speed.
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 1.5;
  trace();
  ctx.stroke();

  ctx.restore();
}

function entityColor(entity: Entity, palette: Palette): string {
  switch (entity.kind) {
    case 'rock': return palette.rock;
    case 'boulder': return palette.boulder;
    case 'debris': return palette.debris;
    case 'coin': return palette.coin;
    case 'slowmo': return palette.slowmo;
    case 'magnet': return palette.magnet;
    case 'heart': return palette.heart;
  }
}

function drawEntity(ctx: CanvasRenderingContext2D, state: RunState, entity: Entity, palette: Palette): void {
  const x = (entity.lane + entity.lanes / 2) * LANE_WIDTH;
  const y = screenY(state, entity);
  if (y < -60 || y > VIEW.height + 60) return;
  const color = entityColor(entity, palette);

  if (isObstacle(entity.kind)) {
    drawRock(ctx, x, y, entity, color);
    return;
  }

  if (entity.kind === 'coin') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, entity.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, entity.width / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - entity.width / 2, y - entity.height / 2, entity.width, entity.height, 10);
  ctx.fill();
  ctx.fillStyle = palette.sky;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entity.kind === 'slowmo' ? '◷' : entity.kind === 'magnet' ? '✦' : '♥', x, y + 1);
}

export interface RenderOptions {
  palette: Palette;
  wall: WallPattern;
  avatar: AvatarConfig;
  /** Device pixel scale already applied by the caller. */
  scale: number;
  /**
   * The day's best run, replayed alongside (PLAN.md M81). Absent when there
   * is nothing to race.
   */
  ghost?: RunState | undefined;
}

/**
 * How faint the ghost is.
 *
 * Low enough that it never competes with the figure you are steering —
 * mistaking the ghost for yourself for one lane change is a crash — and
 * drawn flat in `palette.ink` rather than the avatar's own colours, because
 * two identical climbers in the same frame is the same mistake made
 * prettier.
 */
const GHOST_ALPHA = 0.38;

/** One colour for every shape, which is what makes it read as a shadow. */
function flatten(shape: Shape, ink: string): Shape {
  if (shape.kind === 'polyline') return { ...shape, stroke: ink };
  if (shape.kind === 'path') {
    return {
      ...shape,
      ...(shape.fill && shape.fill !== 'none' ? { fill: ink } : {}),
      ...(shape.stroke ? { stroke: ink } : {}),
    };
  }
  return { ...shape, fill: ink };
}

function drawClimber(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  options: RenderOptions,
  at: { y: number; alpha: number; ink?: string },
): void {
  const scale = (CLIMBER.height * 2.4) / 250;
  ctx.save();
  ctx.translate(climberX(state) - (180 * scale) / 2, at.y - (250 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.globalAlpha = at.alpha;
  for (const shape of climberShapes(options.avatar, {
    showGround: false,
    colors: {
      ground: options.palette.rockNear,
      surface: options.palette.sky,
      accentGround: options.palette.strata,
    },
    // Driven by distance rather than time, so the cadence rises with the
    // climber's speed and a paused run holds a pose instead of running on
    // the spot.
    joints: climbingPose(POSES[options.avatar.pose], state.distance / CLIMB_CYCLE_PX),
  })) {
    drawShape(ctx, at.ink === undefined ? shape : flatten(shape, at.ink));
  }
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: RunState,
  options: RenderOptions,
): void {
  const { palette, wall } = options;

  ctx.save();
  ctx.setTransform(options.scale, 0, 0, options.scale, 0, 0);

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  // Strata drift slower than the near rock: cheap parallax, no images.
  ctx.strokeStyle = palette.strata;
  ctx.lineWidth = 2;
  const strataStep = 64;
  const strataShift = (state.distance * 0.35) % strataStep;
  for (let y = -strataStep; y < VIEW.height + strataStep; y += strataStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + strataShift);
    ctx.lineTo(VIEW.width, y + strataShift + 6);
    ctx.stroke();
  }

  drawEdge(ctx, wall.left, state.distance * 0.55, wall.step, palette.rockFar, 'left');
  drawEdge(ctx, wall.right, state.distance * 0.55, wall.step, palette.rockFar, 'right');
  drawEdge(ctx, wall.left, state.distance * 0.85, wall.step * 0.7, palette.rockNear, 'left');
  drawEdge(ctx, wall.right, state.distance * 0.85, wall.step * 0.7, palette.rockNear, 'right');

  ctx.strokeStyle = palette.lane;
  ctx.lineWidth = 2;
  for (let lane = 1; lane < LANES; lane++) {
    ctx.beginPath();
    ctx.moveTo(lane * LANE_WIDTH, 0);
    ctx.lineTo(lane * LANE_WIDTH, VIEW.height);
    ctx.stroke();
  }

  for (const entity of state.entities) drawEntity(ctx, state, entity, palette);

  // The ghost first, so the climber you are steering is never drawn under
  // it, and only while it is on screen — once it is off the canvas there is
  // nothing to paint and the check saves a figure's worth of work a frame.
  //
  // A *crashed* ghost keeps being drawn, and that is the whole race. Height
  // in this game is time: the ramp is driven by `timeMs`, and a lane change
  // costs nothing, so two runs on the same wall climb at exactly the same
  // rate and sit level however well either is being played. The gap only
  // opens when one of them stops. So the ghost freezes at the height its
  // run ended and the live wall carries it down past you — which is the
  // moment you have beaten your best, said by the picture rather than by a
  // number that reads +0 m until it happens.
  const ghost = options.ghost;
  if (ghost) {
    const y = ghostY(state, ghost);
    if (y > -CLIMBER.height && y < VIEW.height + CLIMBER.height) {
      drawClimber(ctx, ghost, options, { y, alpha: GHOST_ALPHA, ink: palette.ink });
    }
  }

  // The climber: the player's own avatar, scaled into the lane.
  drawClimber(ctx, state, options, {
    y: CLIMBER.y,
    // Blink through the forgiveness window so a save is visible.
    alpha: state.invulnMs > 0 && Math.floor(state.timeMs / 90) % 2 === 0 ? 0.35 : 1,
  });

  if (state.slowmoMs > 0) {
    ctx.fillStyle = 'rgba(90,163,212,0.14)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  ctx.restore();
}
