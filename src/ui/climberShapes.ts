/**
 * The climber's geometry, as data.
 *
 * Two things draw this figure: the React `Avatar`, and the share-card
 * builder, which emits a standalone SVG string with no React and no CSS
 * variables. Keeping the geometry in one place means a pose fix lands in
 * both — the alternative is two copies of a figure that will drift.
 */

import type { AvatarConfig, AvatarGround, AvatarPalette, AvatarPose } from '@/engine/avatar';

export type Point = readonly [number, number];

export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string }
  | { kind: 'path'; d: string; fill?: string; stroke?: string; width?: number }
  | { kind: 'polyline'; points: Point[]; stroke: string; width: number };

export interface Joints {
  head: Point; neck: Point;
  shoulderL: Point; shoulderR: Point;
  elbowL: Point; handL: Point;
  elbowR: Point; handR: Point;
  hipL: Point; hipR: Point;
  kneeL: Point; footL: Point;
  kneeR: Point; footR: Point;
}

export const CLIMBER_VIEWBOX = { width: 180, height: 250 } as const;

export const POSES: Record<AvatarPose, Joints> = {
  reach: {
    head: [90, 58], neck: [90, 76],
    shoulderL: [70, 86], shoulderR: [110, 86],
    elbowL: [50, 62], handL: [44, 30],
    elbowR: [130, 66], handR: [136, 34],
    hipL: [78, 150], hipR: [102, 150],
    kneeL: [62, 190], footL: [70, 226],
    kneeR: [126, 182], footR: [120, 220],
  },
  highstep: {
    head: [92, 60], neck: [92, 78],
    shoulderL: [72, 88], shoulderR: [112, 88],
    elbowL: [48, 66], handL: [40, 30],
    elbowR: [134, 74], handR: [142, 40],
    hipL: [80, 152], hipR: [104, 152],
    kneeL: [60, 192], footL: [68, 228],
    // The knee folds up and out, above the foot. A knee below the foot reads
    // as a broken leg — the first pass drew exactly that.
    //
    // Lowered from 130/160: at that height the thigh crossed the torso and
    // the whole leg read as folded into the chest rather than stepped up.
    // The knee now sits level with the hip and the foot well below it, which
    // is still unmistakably a high step.
    kneeR: [148, 150], footR: [132, 182],
  },
  hang: {
    head: [90, 62], neck: [90, 80],
    shoulderL: [72, 90], shoulderR: [108, 90],
    elbowL: [56, 68], handL: [50, 34],
    elbowR: [124, 68], handR: [130, 34],
    hipL: [80, 152], hipR: [100, 152],
    kneeL: [74, 196], footL: [76, 232],
    kneeR: [106, 196], footR: [106, 232],
  },
};

/**
 * The same figure, mid-move (PLAN.md — the Ascent).
 *
 * The game drew the avatar as a fixed silhouette sliding up a scrolling
 * wall, which reads as a sticker being dragged rather than a climber
 * climbing. This offsets the limbs around whatever pose the avatar is in,
 * so the identity — gear, colours, the posture that reads vitality — is
 * untouched and only the motion is added.
 *
 * **Contralateral**, because that is how anyone climbs: left hand goes with
 * right foot. Moving the limbs on the same side together produces a gait
 * nobody has ever used, and it looks wrong before you can say why.
 *
 * `phase` is a turn, 0 to 1, and wraps — the caller drives it from distance
 * so the cadence rises with the climber's speed for free, and a paused game
 * holds a pose instead of running on the spot.
 */
export function climbingPose(base: Joints, phase: number): Joints {
  const swing = Math.sin(phase * Math.PI * 2);
  // Twice the frequency: the body rises once per limb, not once per cycle.
  const bob = Math.cos(phase * Math.PI * 4) * 2.4;

  const shift = (p: Point, dx: number, dy: number): Point => [p[0] + dx, p[1] + dy];

  return {
    ...base,
    head: shift(base.head, swing * 1.6, bob),
    neck: shift(base.neck, swing * 1.2, bob),
    shoulderL: shift(base.shoulderL, swing * 1.5, bob - swing * 2.5),
    shoulderR: shift(base.shoulderR, swing * 1.5, bob + swing * 2.5),
    elbowL: shift(base.elbowL, swing * 2, bob - swing * 8),
    handL: shift(base.handL, swing * 2, -swing * 14),
    elbowR: shift(base.elbowR, swing * 2, bob + swing * 8),
    handR: shift(base.handR, swing * 2, swing * 14),
    hipL: shift(base.hipL, swing * 1.2, bob),
    hipR: shift(base.hipR, swing * 1.2, bob),
    // Opposite the hands, and gentler: a foot swinging as far as a hand
    // turns a climb into a march.
    kneeL: shift(base.kneeL, swing * 2.5, swing * 6),
    footL: shift(base.footL, swing * 2, swing * 10),
    kneeR: shift(base.kneeR, swing * 2.5, -swing * 6),
    footR: shift(base.footR, swing * 2, -swing * 10),
  };
}

export function mid(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export interface ClimberColors {
  /** Holds, rock and ridge. */
  ground: string;
  /** The colour behind the figure, used for the chalk-bag seam and pack rim. */
  surface: string;
  /** Snow on the alpine ridge. */
  accentGround: string;
}

export interface ShapeOptions {
  showGround?: boolean;
  colors: ClimberColors;
  /** Override the pose table — for the game, which animates the figure. */
  joints?: Joints;
}

function groundShapes(ground: AvatarGround, j: Joints, colors: ClimberColors): Shape[] {
  if (ground === 'rock') {
    return [
      { kind: 'path', d: 'M 6 246 L 30 208 L 52 232 L 74 196 L 96 226 L 128 190 L 152 224 L 174 246 Z', fill: colors.ground },
    ];
  }
  if (ground === 'alpine') {
    return [
      { kind: 'path', d: 'M 4 246 L 34 176 L 56 210 L 88 148 L 118 200 L 146 168 L 176 246 Z', fill: colors.ground },
      { kind: 'path', d: 'M 88 148 L 100 170 L 76 170 Z', fill: colors.accentGround },
    ];
  }
  const holds: [Point, number, number][] = [
    [[j.handL[0], j.handL[1] - 12], 13, 8],
    [[j.handR[0], j.handR[1] - 12], 13, 8],
    [[j.footL[0], j.footL[1] + 8], 11, 7],
    [[j.footR[0], j.footR[1] + 8], 11, 7],
  ];
  return holds.map(([[cx, cy], rx, ry]) => ({ kind: 'ellipse' as const, cx, cy, rx, ry, fill: colors.ground }));
}

/** Back to front: ground, legs, shoes, torso, arms, head, gear, hands. */
export function climberShapes(config: AvatarConfig, options: ShapeOptions): Shape[] {
  const j = options.joints ?? POSES[config.pose];
  const c: AvatarPalette = config.palette;
  const g = config.gear;
  const out: Shape[] = [];

  if (options.showGround !== false) out.push(...groundShapes(config.ground, j, options.colors));

  out.push(
    { kind: 'polyline', points: [j.hipL, j.kneeL, j.footL], stroke: c.shorts, width: 15 },
    { kind: 'polyline', points: [j.hipR, j.kneeR, j.footR], stroke: c.shorts, width: 15 },
  );
  if (!g.jacket) {
    out.push(
      { kind: 'polyline', points: [mid(j.kneeL, j.footL, 0.15), j.footL], stroke: c.skin, width: 12 },
      { kind: 'polyline', points: [mid(j.kneeR, j.footR, 0.15), j.footR], stroke: c.skin, width: 12 },
    );
  }

  out.push(
    { kind: 'ellipse', cx: j.footL[0], cy: j.footL[1], rx: 11, ry: 8, fill: c.shoes },
    { kind: 'ellipse', cx: j.footR[0], cy: j.footR[1], rx: 11, ry: 8, fill: c.shoes },
  );

  out.push({
    kind: 'path',
    d: `M ${j.shoulderL.join(' ')} L ${j.shoulderR.join(' ')} L ${j.hipR[0] + 3} ${j.hipR[1] + 4} L ${j.hipL[0] - 3} ${j.hipL[1] + 4} Z`,
    fill: c.top,
  });
  if (g.jacket) {
    out.push(
      {
        kind: 'path',
        d: `M ${j.shoulderL[0] - 7} ${j.shoulderL[1] - 2} L ${j.shoulderR[0] + 7} ${j.shoulderR[1] - 2} L ${j.hipR[0] + 8} ${j.hipR[1] + 10} L ${j.hipL[0] - 8} ${j.hipL[1] + 10} Z`,
        fill: c.top,
      },
      { kind: 'path', d: `M ${j.neck[0] - 16} ${j.neck[1] - 2} q 16 -22 32 0 z`, fill: c.top },
    );
  }

  out.push(
    { kind: 'polyline', points: [j.shoulderL, j.elbowL, j.handL], stroke: c.skin, width: 12 },
    { kind: 'polyline', points: [j.shoulderR, j.elbowR, j.handR], stroke: c.skin, width: 12 },
    { kind: 'polyline', points: [j.shoulderL, mid(j.shoulderL, j.elbowL, 0.55)], stroke: c.top, width: 13 },
    { kind: 'polyline', points: [j.shoulderR, mid(j.shoulderR, j.elbowR, 0.55)], stroke: c.top, width: 13 },
    { kind: 'circle', cx: j.head[0], cy: j.head[1], r: 15, fill: c.skin },
  );

  if (g.harness) {
    out.push({ kind: 'rect', x: j.hipL[0] - 8, y: j.hipL[1] - 4, w: j.hipR[0] - j.hipL[0] + 16, h: 8, rx: 4, fill: c.gear });
  }
  if (g.chalk) {
    out.push(
      { kind: 'rect', x: j.head[0] - 11, y: j.hipL[1] + 4, w: 22, h: 24, rx: 9, fill: c.gear },
      { kind: 'path', d: `M ${j.head[0] - 11} ${j.hipL[1] + 12} h 22`, stroke: options.colors.surface, width: 2.5 },
    );
  }
  if (g.rope) {
    out.push({ kind: 'path', d: `M ${j.head[0]} ${j.hipL[1]} q -34 40 -66 32`, stroke: c.gear, width: 5 });
  }
  if (g.pack) {
    out.push(
      { kind: 'rect', x: j.head[0] - 17, y: j.neck[1] + 10, w: 34, h: 46, rx: 10, fill: c.gear },
      { kind: 'rect', x: j.head[0] - 12, y: j.neck[1] + 15, w: 24, h: 36, rx: 7, fill: c.shorts },
    );
  }
  if (g.helmet) {
    out.push(
      { kind: 'path', d: `M ${j.head[0] - 17} ${j.head[1] - 1} a 17 17 0 0 1 34 0 z`, fill: c.gear },
      { kind: 'rect', x: j.head[0] - 19, y: j.head[1] - 3, w: 38, h: 5, rx: 2.5, fill: c.gear },
    );
  }
  if (g.axe) {
    out.push(
      { kind: 'path', d: `M ${j.handR[0] + 2} ${j.handR[1] - 8} l 4 44`, stroke: c.gear, width: 5 },
      { kind: 'path', d: `M ${j.handR[0] - 10} ${j.handR[1] - 10} q 16 -6 22 4`, stroke: c.gear, width: 5 },
    );
  }

  out.push(
    { kind: 'circle', cx: j.handL[0], cy: j.handL[1], r: 7, fill: c.skin },
    { kind: 'circle', cx: j.handR[0], cy: j.handR[1], r: 7, fill: c.skin },
  );

  return out;
}

/** One shape as SVG markup, for the standalone card. */
export function shapeToSvg(shape: Shape): string {
  switch (shape.kind) {
    case 'circle':
      return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${shape.fill}"/>`;
    case 'ellipse':
      return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" fill="${shape.fill}"/>`;
    case 'rect':
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.rx}" fill="${shape.fill}"/>`;
    case 'path':
      return `<path d="${shape.d}" fill="${shape.fill ?? 'none'}"${
        shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.width ?? 2}" stroke-linecap="round"` : ''
      }/>`;
    case 'polyline':
      return `<polyline points="${shape.points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}
