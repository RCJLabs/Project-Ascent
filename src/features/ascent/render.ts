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
import { createRng, next } from '@/engine/ascent/rng';
import { climberShapes, type Shape } from '@/ui/climberShapes';

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
  /** Rest-day weather: lighter, calmer, unmistakably different. */
  recovery: {
    sky: '#22384a', rockNear: '#365065', rockFar: '#2b4155', strata: '#436a85',
    lane: 'rgba(255,255,255,0.07)', rock: '#9fb6c9', boulder: '#7f9ab0', debris: '#d9e6f0',
    coin: '#ffd97d', slowmo: '#8fd0f0', magnet: '#cfa8e8', heart: '#ef7f74', ink: '#eef6fb',
  },
};

/** Repeating jagged edge, generated once per run from its seed. */
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

function drawEdge(
  ctx: CanvasRenderingContext2D,
  depths: number[],
  offset: number,
  step: number,
  color: string,
  side: 'left' | 'right',
): void {
  const height = depths.length * step;
  const shift = ((offset % height) + height) % height;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(side === 'left' ? 0 : VIEW.width, -step);
  for (let i = -1; i <= VIEW.height / step + 1; i++) {
    const index = (((Math.floor((shift + i * step) / step) % depths.length) + depths.length) %
      depths.length) as number;
    const depth = depths[index]!;
    const y = i * step - (shift % step);
    ctx.lineTo(side === 'left' ? depth : VIEW.width - depth, y);
    ctx.lineTo(side === 'left' ? depth * 0.4 : VIEW.width - depth * 0.4, y + step / 2);
  }
  ctx.lineTo(side === 'left' ? 0 : VIEW.width, VIEW.height + step);
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
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x - entity.width / 2, y - entity.height / 2, entity.width, entity.height, 8);
    ctx.fill();
    // A lighter top face, so a rock reads as a solid rather than a slab.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.roundRect(x - entity.width / 2, y - entity.height / 2, entity.width, entity.height * 0.34, 8);
    ctx.fill();
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

  // The climber: the player's own avatar, scaled into the lane.
  const scale = (CLIMBER.height * 2.4) / 250;
  const x = climberX(state);
  ctx.save();
  ctx.translate(x - (180 * scale) / 2, CLIMBER.y - (250 * scale) / 2);
  ctx.scale(scale, scale);
  // Blink through the forgiveness window so a save is visible.
  ctx.globalAlpha = state.invulnMs > 0 && Math.floor(state.timeMs / 90) % 2 === 0 ? 0.35 : 1;
  for (const shape of climberShapes(options.avatar, {
    showGround: false,
    colors: { ground: palette.rockNear, surface: palette.sky, accentGround: palette.strata },
  })) {
    drawShape(ctx, shape);
  }
  ctx.restore();

  if (state.slowmoMs > 0) {
    ctx.fillStyle = 'rgba(90,163,212,0.14)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  ctx.restore();
}
