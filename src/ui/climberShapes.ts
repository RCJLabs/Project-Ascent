/**
 * The climber's geometry, as data.
 *
 * Three things draw this figure: the React `Avatar`, the share-card builder,
 * which emits a standalone SVG string with no React and no CSS variables,
 * and the Ascent's canvas. Keeping the geometry in one place means a pose
 * fix lands in all three — the alternative is copies of a figure that drift.
 *
 * **Drawn as a person since M357.** Until then it was a pictogram: limbs
 * were round-capped tubes of one width, the head a circle with two dots,
 * nothing shaded. Asked for in those words — *"more detailed, look like a
 * person"* — and the sizes it is drawn at carry it: 96 CSS pixels wide on
 * the Game tab (about 290 device pixels on a phone), about 300 on a share
 * card, and 80 by 110 in the game. So the limbs are tapered outlines with a
 * calf, a forearm and a shoulder; the head has a jaw, ears and a face; the
 * clothes have collars, hems and a rubber rand on the shoes; and one light
 * from the upper left — the direction the Ascent already lights its rocks
 * from — puts a shadow down the far side of everything.
 *
 * The skeleton did not change. The joints, the three vitality stances and
 * the climbing cycle are the same tables, so the posture still reads
 * training exactly as it did; what changed is the body drawn around them.
 */

import type {
  AvatarConfig,
  AvatarFigure,
  AvatarGround,
  AvatarPalette,
  AvatarPose,
} from '@/engine/avatar';

export type Point = readonly [number, number];

/**
 * What a shape is part of (PLAN.md M357).
 *
 * Nothing draws differently for it. It is here so a rule about the figure —
 * the chalk bag hangs beside the hips, the eyes sit under the helmet brim —
 * can find the chalk bag and the brim by name. The tests used to find them
 * by size (*the rect 16 wide is the chalk bag*), which made every redraw a
 * rewrite of the rules as well as the picture.
 */
export type Part =
  | 'ground' | 'hair' | 'head' | 'ear' | 'neck' | 'face' | 'eye' | 'brow' | 'mouth'
  | 'torso' | 'arm' | 'sleeve' | 'hand' | 'leg' | 'hips' | 'shorts' | 'trousers' | 'shoe'
  | 'harness' | 'buckle' | 'loop' | 'quickdraw' | 'chalk' | 'rope' | 'pack' | 'strap'
  | 'helmet' | 'brim' | 'jacket' | 'axe';

interface Tagged {
  part?: Part;
  /**
   * Shading, a seam, a feature on the face: anything the figure reads
   * without. The Ascent's ghost draws only the shapes without it, because a
   * translucent figure drawn shape by shape darkens wherever two overlap,
   * and a shadow band over every limb turned the ghost into a mottled
   * second climber rather than a silhouette.
   */
  detail?: true;
}

export type Shape = Tagged &
  (
    | { kind: 'circle'; cx: number; cy: number; r: number; fill: string }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string }
    | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: string }
    | {
        kind: 'path';
        d: string;
        fill?: string;
        stroke?: string;
        width?: number;
        /** A dash pattern for the stroke — the rope's sheath, and nothing else. */
        dash?: readonly number[];
      }
    | { kind: 'polyline'; points: Point[]; stroke: string; width: number }
  );

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

/**
 * On the wall, seen from behind (the Ascent).
 *
 * A climber on a wall is a back: that is what anybody watching one sees, and
 * it is why the head here has no face on it. `climbingPose` animates these,
 * and the game is the only thing that draws them.
 */
export const POSES: Record<AvatarPose, Joints> = {
  steady: {
    head: [90, 58], neck: [90, 76],
    shoulderL: [70, 86], shoulderR: [110, 86],
    elbowL: [50, 62], handL: [44, 30],
    elbowR: [130, 66], handR: [136, 34],
    hipL: [78, 150], hipR: [102, 150],
    kneeL: [62, 190], footL: [70, 226],
    kneeR: [126, 182], footR: [120, 220],
  },
  strong: {
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
  spent: {
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
 * On the ground, facing you (the portrait and the share card).
 *
 * The figure was a back view everywhere, which is right on a wall and wrong
 * on a profile: a character sheet showing the back of someone's head is a
 * climber walking away from you. These are the same body standing up and
 * turned around, so the portrait has a face and the Ascent does not.
 *
 * **The posture still reads vitality**, which is the only reason there are
 * three of these rather than one. Fresh stands tall with the shoulders open;
 * worked shifts its weight and puts a hand on a hip; spent drops the
 * shoulders, lowers the head and brings the feet together. Head height and
 * shoulder width fall in that order, because at 96 pixels wide that gradient
 * is the whole signal — a single frozen stance would have thrown away the
 * one number the game reads from training.
 */
export const STANDING: Record<AvatarPose, Joints> = {
  strong: {
    // Head and shoulders sit eleven apart in all three, which is about a
    // third of a head. The first pass had twenty-one and the figure had a
    // giraffe's neck — nothing showed it until a neck was drawn at all.
    head: [90, 50], neck: [90, 68],
    shoulderL: [67, 76], shoulderR: [113, 76],
    elbowL: [57, 110], handL: [54, 144],
    elbowR: [123, 110], handR: [126, 144],
    hipL: [79, 146], hipR: [101, 146],
    kneeL: [74, 190], footL: [72, 228],
    kneeR: [106, 190], footR: [108, 228],
  },
  steady: {
    head: [89, 53], neck: [89, 71],
    shoulderL: [68, 79], shoulderR: [110, 79],
    elbowL: [59, 113], handL: [57, 147],
    // The right hand rests on the hip. A breather, not a collapse — and a
    // silhouette you can tell from the other two at thumbnail size, which
    // three near-identical standing figures would not be.
    elbowR: [128, 109], handR: [108, 137],
    // The legs mirror about the body's centre line in all three stances, so
    // the two sides are the same length by construction rather than by my
    // arithmetic. Facing you is the one view where a mismatch shows: the
    // legs are side by side instead of one behind the other.
    hipL: [78, 148], hipR: [100, 148],
    kneeL: [75, 191], footL: [76, 229],
    kneeR: [103, 191], footR: [102, 229],
  },
  spent: {
    head: [90, 58], neck: [90, 76],
    shoulderL: [72, 84], shoulderR: [108, 84],
    elbowL: [65, 117], handL: [69, 150],
    elbowR: [115, 117], handR: [111, 150],
    hipL: [80, 150], hipR: [100, 150],
    kneeL: [75, 192], footL: [79, 229],
    kneeR: [105, 192], footR: [101, 229],
  },
};

/**
 * The two builds, in viewBox units (PLAN.md M225, M357).
 *
 * The joint table is shared: both figures have the same skeleton, the same
 * limb lengths and the same three vitality stances, because the posture is
 * the one number the game reads from training and it must not depend on a
 * cosmetic choice. What differs is the body drawn around those joints.
 *
 * Every figure here is measured against the size a profile picture is
 * actually drawn at — 96 pixels wide, so 180 viewBox units map to 96 and one
 * unit is about half a pixel. That is the whole reason the numbers are as
 * large as they are: a two-unit difference in hip width is a single pixel,
 * and a choice nobody can see is a choice that does not exist.
 *
 * Shoulders against hips is what carries at that size, and the hair carries
 * before either of them. The face and the limbs add a little of their own
 * since M357 — a narrower jaw, slighter arms and legs — but none of it is
 * relied on: each would be invisible alone at 96 pixels, and together they
 * only agree with what the silhouette already says.
 */
export interface Build {
  /** Half the hips' width, out from the hip joints. */
  hip: number;
  /** Half the shirt hem's width, out from the hip joints. */
  hem: number;
  /** How far the waist is drawn in from the line shoulder → hem. */
  waist: number;
  /** How far the torso's top edge sits inside the shoulder joints. */
  shoulder: number;
  /** The neck's width where it leaves the jaw. */
  neck: number;
  /** Hair past the jaw rather than cropped at it. */
  longHair: boolean;
  /** Half the face's width across the cheekbones. */
  cheek: number;
  /** Half the jaw's width at its corners. */
  jaw: number;
  /** Every limb's thickness, as a fraction of the profiles below. */
  limb: number;
}

export const BUILDS: Record<AvatarFigure, Build> = {
  // Shoulders 46 wide against hips 40: a taper, and no waist drawn into it.
  male: { hip: 9, hem: 6, waist: 0, shoulder: 0, neck: 12, longHair: false, cheek: 13, jaw: 9.8, limb: 1 },
  // Shoulders 38 against hips 46, and five units off each side of the waist.
  female: { hip: 12, hem: 7, waist: 5, shoulder: 4, neck: 10, longHair: true, cheek: 12.4, jaw: 8.2, limb: 0.9 },
};

/** Distance between two joints. */
function span(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Where the middle joint sits, given both ends and the limb's length.
 *
 * Two-bone inverse kinematics with equal segments: the knee is wherever it
 * has to be for a thigh and a shin of fixed length to reach from hip to
 * foot. Pull the foot in and the knee swings out; push it away and the leg
 * straightens.
 *
 * That is the whole reason this exists. The first version of the animation
 * *translated* the limbs from a fixed pose, which meant a leg that started
 * bent stayed bent for the entire cycle and one that started straight never
 * folded — reported as "the right leg doesn't go straight and the left leg
 * doesn't bend as much as the right", and that is exactly what it was.
 *
 * `side` is which way the joint breaks: knees and elbows bend away from the
 * body, and a knee that hinges the other way is a horror film.
 */
export function bendJoint(anchor: Point, end: Point, length: number, side: number): Point {
  const reach = span(anchor, end);
  const half = length / 2;
  const ux = (end[0] - anchor[0]) / (reach || 1);
  const uy = (end[1] - anchor[1]) / (reach || 1);
  // Straight when the limb is stretched to or past its length.
  const along = Math.min(half, reach / 2);
  const out = Math.sqrt(Math.max(0, half * half - along * along));
  return [
    anchor[0] + ux * along + -uy * out * side,
    anchor[1] + uy * along + ux * out * side,
  ];
}

/** Ease so a limb pauses at the top and bottom of its travel. */
function wave(phase: number): number {
  return (Math.sin(phase * Math.PI * 2) + 1) / 2;
}

/**
 * The same figure, climbing (the Ascent).
 *
 * The game drew the avatar as a fixed silhouette sliding up a scrolling
 * wall, which reads as a sticker being dragged rather than a climber
 * climbing. This generates all four limbs from the torso, so each one moves
 * through the same range as its opposite and actually bends and straightens.
 *
 * **Contralateral**, because that is how anyone climbs: left hand goes with
 * right foot. Moving the limbs on the same side together produces a gait
 * nobody has ever used, and it looks wrong before you can say why.
 *
 * The torso, head and gear come from whatever pose the avatar is in, so the
 * identity is untouched. The limbs do not — a cycle generated from the hips
 * and shoulders is the point, and the vitality posture still reads on the
 * app's own portraits, which is where anyone looks for it.
 *
 * `phase` is a turn, 0 to 1, and wraps: the caller drives it from distance
 * so cadence rises with speed and a paused game holds a pose rather than
 * running on the spot.
 */
export function climbingPose(base: Joints, phase: number): Joints {
  const legLength = span(base.hipL, base.kneeL) + span(base.kneeL, base.footL);
  const armLength = span(base.shoulderL, base.elbowL) + span(base.elbowL, base.handL);

  // One limb of each pair is up while the other is down.
  const rightLift = wave(phase);
  const leftLift = 1 - rightLift;
  // Left hand with right foot.
  const leftReach = rightLift;
  const rightReach = leftLift;
  // Twice the frequency: the body rises once per limb, not once per turn.
  const bob = Math.cos(phase * Math.PI * 4) * 2.5;

  /** A foot, from fully extended below the hip to stepped up and out. */
  // More up than out: a foot that swings as far sideways as it does upward
  // is a star jump, not a step.
  const foot = (hip: Point, side: number, lift: number): Point => [
    hip[0] + side * legLength * (0.07 + 0.21 * lift),
    hip[1] + legLength * (0.97 - 0.55 * lift),
  ];
  /** A hand, from pulled in beside the shoulder to reaching overhead. */
  const hand = (shoulder: Point, side: number, reach: number): Point => [
    shoulder[0] + side * armLength * (0.46 - 0.28 * reach),
    shoulder[1] - armLength * (0.42 + 0.5 * reach),
  ];

  const lift = (p: Point): Point => [p[0], p[1] + bob];
  const hipL = lift(base.hipL);
  const hipR = lift(base.hipR);
  const shoulderL = lift(base.shoulderL);
  const shoulderR = lift(base.shoulderR);

  const footL = foot(hipL, -1, leftLift);
  const footR = foot(hipR, 1, rightLift);
  const handL = hand(shoulderL, -1, leftReach);
  const handR = hand(shoulderR, 1, rightReach);

  return {
    head: lift(base.head),
    neck: lift(base.neck),
    shoulderL,
    shoulderR,
    hipL,
    hipR,
    footL,
    footR,
    handL,
    handR,
    kneeL: bendJoint(hipL, footL, legLength, 1),
    kneeR: bendJoint(hipR, footR, legLength, -1),
    elbowL: bendJoint(shoulderL, handL, armLength, -1),
    elbowR: bendJoint(shoulderR, handR, armLength, 1),
  };
}

export function mid(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}


export interface ClimberColors {
  /** Holds, rock and ridge. */
  ground: string;
  /** The colour behind the figure. */
  surface: string;
  /** Snow on the alpine ridge. */
  accentGround: string;
}

export type Facing = 'front' | 'back';

export interface ShapeOptions {
  showGround?: boolean;
  colors: ClimberColors;
  /**
   * Which way the climber is turned, and it has no default on purpose.
   *
   * Three things draw this figure and each one has an answer: the portrait
   * and the share card face you, the Ascent climbs away. A default would
   * mean the site that forgot got a face on the back of a head, or lost one
   * off a profile, and neither shows up in a type check.
   */
  facing: Facing;
  /** Override the pose table — for the game, which animates the figure. */
  joints?: Joints;
}

/** Half the head's height, crown to chin. Hair and helmets are measured from it. */
export const HEAD = 15;

// ── Colour ───────────────────────────────────────────────────────────────

/**
 * One colour moved toward another, by a fraction.
 *
 * Every palette the app offers is six-digit hex, and anything else — a value
 * restored from some older backup — comes back unchanged: a figure drawn
 * without its shading is a flatter figure, not a broken one.
 */
function mix(color: string, toward: string, amount: number): string {
  const key = `${color}|${toward}|${amount}`;
  const known = MIXED.get(key);
  if (known !== undefined) return known;
  const a = /^#([0-9a-f]{6})$/i.exec(color);
  const b = /^#([0-9a-f]{6})$/i.exec(toward);
  let out = color;
  if (a && b) {
    const from = parseInt(a[1]!, 16);
    const to = parseInt(b[1]!, 16);
    out = '#';
    for (const shift of [16, 8, 0]) {
      const x = (from >> shift) & 255;
      const y = (to >> shift) & 255;
      out += Math.round(x + (y - x) * amount).toString(16).padStart(2, '0');
    }
  }
  if (MIXED.size > 512) MIXED.clear();
  MIXED.set(key, out);
  return out;
}

/**
 * Every mix asked for, remembered. A figure asks for some forty tones of
 * its own six colours, and the game asks for them every frame it draws a
 * new pose; a palette has a handful of colours, so this stays small.
 */
const MIXED = new Map<string, string>();

/**
 * The colours shadows fall toward.
 *
 * Not black. A shadow mixed toward black greys whatever it touches, which
 * on skin reads as bruising and on a coloured shirt as dirt; a deep cool
 * violet for cloth and kit and a deep warm brown for skin is how an
 * illustration keeps the colour in the shade.
 */
const SHADOW = '#1d1630';
const SKIN_SHADOW = '#4a1c16';
const shade = (color: string, amount = 0.18): string => mix(color, SHADOW, amount);
const skinShade = (skin: string, amount = 0.2): string => mix(skin, SKIN_SHADOW, amount);
const lit = (color: string, amount = 0.2): string => mix(color, '#ffffff', amount);

/** The white of an eye, and the iris on it. */
export const SCLERA = '#f7f3ec';
export const IRIS = '#2b1c13';

// ── Geometry ─────────────────────────────────────────────────────────────

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Point, k: number): Point => [a[0] * k, a[1] * k];
const unit = (from: Point, to: Point): Point => {
  const length = span(from, to) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};
const normal = (u: Point): Point => [-u[1], u[0]];

/**
 * Where the light comes from: the upper left, as a unit vector.
 *
 * The same direction `render.ts` shades the Ascent's rocks from, so the
 * climber on the wall is lit by the same sun as the wall.
 */
const LIGHT: Point = [-Math.SQRT1_2, -Math.SQRT1_2];

/** A number for a path string: one decimal is a fifth of a device pixel at the largest size drawn. */
const n = (x: number): string => String(Math.round(x * 10) / 10);
const pt = (p: Point): string => `${n(p[0])} ${n(p[1])}`;

/**
 * A closed outline through a ring of points, with every corner rounded.
 *
 * Each segment runs from the middle of one edge to the middle of the next,
 * curving through the corner between them, so the outline is smooth without
 * a single arc in it. That is deliberate: arcs in SVG take two flags, and a
 * wrong flag is the shape M225 shipped on the back of the head — a
 * moustache. A curve through midpoints has no flags to get wrong.
 */
function smooth(points: readonly Point[]): string {
  // Every outline wound the same way round, so two of one colour drawn as a
  // single path fill their overlap rather than cutting a hole in it — the
  // game merges them (PLAN.md M357), and under the nonzero rule a clockwise
  // thigh and an anticlockwise calf would leave the knee empty.
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    area += x0 * y1 - x1 * y0;
  }
  if (area < 0) points = [...points].reverse();
  const count = points.length;
  const at = (i: number) => points[i % count]!;
  const midpoint = (i: number) => mid(at(i), at(i + 1), 0.5);
  let d = `M ${pt(midpoint(0))}`;
  for (let i = 1; i <= count; i += 1) d += ` Q ${pt(at(i))} ${pt(midpoint(i))}`;
  return `${d} Z`;
}

/** An open curve through points, for strokes: brows, mouths, seams. */
function curve(points: readonly Point[]): string {
  if (points.length < 3) return `M ${points.map(pt).join(' L ')}`;
  let d = `M ${pt(points[0]!)}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const end = i === points.length - 2 ? points[i + 1]! : mid(points[i]!, points[i + 1]!, 0.5);
    d += ` Q ${pt(points[i]!)} ${pt(end)}`;
  }
  return d;
}

/**
 * A limb's thickness along its length: [fraction of the way along, radius].
 *
 * A tube of one width is what made the old figure a pictogram. A thigh is
 * thickest at the hip, a calf bulges a third of the way below the knee and
 * thins to the ankle, a forearm swells below the elbow — and those few
 * changes of width are most of what reads as a leg rather than a stick.
 */
export type Profile = readonly (readonly [number, number])[];

const THIGH: Profile = [[0, 8.6], [0.45, 7.7], [1, 6]];
const CALF: Profile = [[0, 5.9], [0.3, 6.6], [0.78, 4.4], [1, 3.9]];
const UPPER_ARM: Profile = [[0, 6.8], [0.45, 6.1], [1, 4.7]];
const FOREARM: Profile = [[0, 5], [0.24, 5.5], [1, 3.6]];

function radius(profile: Profile, t: number): number {
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [t0, r0] = profile[i]!;
    const [t1, r1] = profile[i + 1]!;
    if (t <= t1) return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0 || 1);
  }
  return profile.at(-1)![1];
}

const thicker = (profile: Profile, by: number, factor = 1): Profile =>
  profile.map(([t, r]) => [t, r * factor + by] as const);

const STEPS = 6;

/** The outline of one segment of a limb, rounded at both ends. */
export function limbOutline(a: Point, b: Point, profile: Profile): Point[] {
  const u = unit(a, b);
  const side = normal(u);
  const length = span(a, b);
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const centre = add(a, scale(u, length * t));
    const r = radius(profile, t);
    left.push(add(centre, scale(side, r)));
    right.push(add(centre, scale(side, -r)));
  }
  const cap = (at: Point, r: number, forward: number): Point[] =>
    [0.25, 0.5, 0.75].map((f) => {
      const angle = f * Math.PI;
      return add(at, add(scale(side, forward * r * Math.cos(angle)), scale(u, forward * r * Math.sin(angle))));
    });
  return [
    ...left,
    ...cap(b, radius(profile, 1), 1),
    ...right.reverse(),
    ...cap(a, radius(profile, 0), -1),
  ];
}

/**
 * The shadow down the side of a segment that faces away from the light.
 *
 * A band from just off the centre line to the edge, so the limb keeps its
 * lit half and reads as round. Which side is decided per segment, by which
 * way the segment points — so a forearm crossing the body is shaded on its
 * lower edge and an arm reaching up on its right, without either being a
 * special case.
 */
export function limbShadow(a: Point, b: Point, profile: Profile, from = 0.18): Point[] {
  const u = unit(a, b);
  let side = normal(u);
  if (side[0] * LIGHT[0] + side[1] * LIGHT[1] > 0) side = scale(side, -1);
  const length = span(a, b);
  const outer: Point[] = [];
  const inner: Point[] = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    const centre = add(a, scale(u, length * t));
    const r = radius(profile, t);
    outer.push(add(centre, scale(side, r * 0.97)));
    inner.push(add(centre, scale(side, r * from)));
  }
  return [...outer, ...inner.reverse()];
}

/** Points given in a frame along a direction, placed into the figure. */
function place(origin: Point, along: Point, across: Point, local: readonly Point[]): Point[] {
  return local.map(([x, y]) => add(origin, add(scale(along, x), scale(across, y))));
}

const mirror = (points: readonly Point[], about: number): Point[] =>
  points.map(([x, y]) => [2 * about - x, y] as const);

// ── The figure ───────────────────────────────────────────────────────────

function groundShapes(
  ground: AvatarGround,
  j: Joints,
  colors: ClimberColors,
  facing: Facing,
): Shape[] {
  if (ground === 'rock') {
    return [
      { kind: 'path', d: 'M 6 246 L 30 208 L 52 232 L 74 196 L 96 226 L 128 190 L 152 224 L 174 246 Z', fill: colors.ground, part: 'ground' },
    ];
  }
  if (ground === 'alpine') {
    return [
      { kind: 'path', d: 'M 4 246 L 34 176 L 56 210 L 88 148 L 118 200 L 146 168 L 176 246 Z', fill: colors.ground, part: 'ground' },
      { kind: 'path', d: 'M 88 148 L 100 170 L 76 170 Z', fill: colors.accentGround, part: 'ground' },
    ];
  }
  if (facing === 'front') {
    // The gym ground is four holds under the hands and feet, which is a wall
    // and not a floor. A climber standing in front of you is on the mat.
    return [
      {
        kind: 'ellipse',
        cx: (j.footL[0] + j.footR[0]) / 2,
        cy: Math.max(j.footL[1], j.footR[1]) + 7,
        rx: 36,
        ry: 7,
        fill: colors.ground,
        part: 'ground',
      },
    ];
  }
  const holds: [Point, number, number][] = [
    [[j.handL[0], j.handL[1] - 12], 13, 8],
    [[j.handR[0], j.handR[1] - 12], 13, 8],
    [[j.footL[0], j.footL[1] + 8], 11, 7],
    [[j.footR[0], j.footR[1] + 8], 11, 7],
  ];
  return holds.map(([[cx, cy], rx, ry]) => ({ kind: 'ellipse' as const, cx, cy, rx, ry, fill: colors.ground, part: 'ground' as const }));
}

/**
 * A pair of limbs: every segment filled, then every segment shaded.
 *
 * Both limbs' fills before either's shadow, rather than limb by limb, so
 * the four fills of one colour are next to each other and the game can
 * draw them as one path (PLAN.md M357). Two legs barely overlap, so the
 * order between them changes nothing anyone can see.
 */
function limbs(
  out: Shape[],
  pair: readonly (readonly [Point, Point, Point])[],
  [upper, lower]: readonly [Profile, Profile],
  fill: string,
  shadow: string,
  part: Part,
): void {
  for (const [a, joint, end] of pair) {
    out.push(
      { kind: 'path', d: smooth(limbOutline(a, joint, upper)), fill, part },
      { kind: 'path', d: smooth(limbOutline(joint, end, lower)), fill, part },
    );
  }
  for (const [a, joint, end] of pair) {
    out.push(
      { kind: 'path', d: smooth(limbShadow(a, joint, upper)), fill: shadow, part, detail: true },
      { kind: 'path', d: smooth(limbShadow(joint, end, lower)), fill: shadow, part, detail: true },
    );
  }
}

/** A band across a limb at `t` of the way along a segment: a hem, a cuff, a leg loop. */
function band(a: Point, b: Point, profile: Profile, t: number, depth: number, extra = 0.8): Point[] {
  const u = unit(a, b);
  const side = normal(u);
  const centre = add(a, scale(u, span(a, b) * t));
  const r = radius(profile, t) + extra;
  return [
    add(centre, add(scale(side, r), scale(u, -depth / 2))),
    add(centre, add(scale(side, r), scale(u, depth / 2))),
    add(centre, add(scale(side, -r), scale(u, depth / 2))),
    add(centre, add(scale(side, -r), scale(u, -depth / 2))),
  ];
}

/** A stroke across a limb at `t` of the way along a segment: a hem line. */
function seam(a: Point, b: Point, profile: Profile, t: number, extra = 0.4): string {
  const u = unit(a, b);
  const side = normal(u);
  const centre = add(a, scale(u, span(a, b) * t));
  const r = radius(profile, t) + extra;
  return `M ${pt(add(centre, scale(side, r)))} Q ${pt(add(centre, scale(u, 1.2)))} ${pt(add(centre, scale(side, -r)))}`;
}

/**
 * A hand, from the wrist joint outward, in the frame of the forearm.
 *
 * `x` runs from the wrist toward the fingertips and `y` toward the thumb. An
 * open hand hangs at the side of a standing climber; a closed one is on a
 * hold — fingers curled over the edge, which from behind is the back of a
 * fist. The thumb is on the side toward the body in both, which is where a
 * relaxed thumb is and where a gripping one wraps.
 */
const OPEN_HAND: Point[] = [
  [-4.4, -2.9], [0.4, -3.7], [5, -3.4], [7.5, -1.9], [8, 0.3], [7, 2.4],
  [3.4, 3.2], [1.8, 4.6], [3.9, 6.1], [2.4, 6.8], [-1.2, 4.8], [-4.4, 2.9],
];
const GRIP: Point[] = (
  [
    [-4.2, -3], [2.6, -3.7], [5.8, -2.7], [6.7, 0], [5.8, 2.7], [2.8, 3.7],
    [1.6, 5.3], [-1, 4.8], [-4.2, 3],
  ] as const
).map(([x, y]) => [x * 1.15, y * 1.15] as const);

function hand(out: Shape[], elbow: Point, wrist: Point, centreX: number, open: boolean, skin: string): void {
  const along = unit(elbow, wrist);
  let across = normal(along);
  // The thumb goes toward the body's centre line.
  const toward = Math.sign(centreX - wrist[0]) || 1;
  if (Math.sign(across[0]) !== toward) across = scale(across, -1);
  const outline = place(wrist, along, across, open ? OPEN_HAND : GRIP);
  out.push({ kind: 'path', d: smooth(outline), fill: skin, part: 'hand' });
  const line = skinShade(skin, 0.32);
  const knuckles: Point[][] = open
    ? [[[4.2, -1.4], [7.2, -1.1]], [[4.4, 0.6], [7.3, 0.7]]]
    : [[[2.2, -2.6], [5.4, -1.4], [5.9, 1.2], [2.6, 2.8]]];
  for (const stroke of knuckles) {
    out.push({ kind: 'path', d: curve(place(wrist, along, across, stroke)), stroke: line, width: 0.8, part: 'hand', detail: true });
  }
}

/**
 * Where the wrist is: four units back from the hand joint along the forearm.
 *
 * The joint tables put the hand joint at the middle of the hand, which is
 * where the old figure centred a circle on it. A hand with a shape needs a
 * wrist to grow from, and moving the joint would have moved the skeleton
 * the posture tests are written against.
 */
const wristOf = (elbow: Point, hand: Point): Point => add(hand, scale(unit(elbow, hand), -4));

/**
 * A climbing shoe, from the front or from behind.
 *
 * The rubber rand round the bottom is what makes it a climbing shoe and
 * not a trainer, so it is drawn dark whatever the shoe's own colour; from
 * behind, the heel cup and the pull loop at the top are what a belayer sees.
 */
function shoe(out: Shape[], foot: Point, colour: string, front: boolean): void {
  const [x, y] = foot;
  const local = (points: Point[]): Point[] => points.map(([px, py]) => [x + px, y + py] as const);
  const rand = mix(colour, '#1b1b20', 0.78);
  if (front) {
    out.push(
      { kind: 'path', d: smooth(local([[-4.8, -7], [4.8, -7], [6.8, -1.5], [8.2, 3.4], [6.8, 7], [0, 7.9], [-6.8, 7], [-8.2, 3.4], [-6.8, -1.5]])), fill: colour, part: 'shoe' },
      { kind: 'path', d: smooth(local([[-8.3, 2.6], [8.3, 2.6], [7.6, 6.9], [0, 8.2], [-7.6, 6.9]])), fill: rand, part: 'shoe' },
      { kind: 'path', d: smooth(local([[-6.9, -2.6], [6.9, -2.6], [7.2, 0.6], [-7.2, 0.6]])), fill: shade(colour, 0.22), part: 'shoe', detail: true },
      { kind: 'ellipse', cx: x - 2.6, cy: y + 0.9, rx: 2.3, ry: 1.1, fill: lit(colour, 0.3), part: 'shoe', detail: true },
    );
    return;
  }
  out.push(
    { kind: 'path', d: smooth(local([[-5.2, -7.6], [5.2, -7.6], [6.6, -1], [6.4, 4.6], [3.6, 7.6], [-3.6, 7.6], [-6.4, 4.6], [-6.6, -1]])), fill: colour, part: 'shoe' },
    { kind: 'path', d: smooth(local([[-6.6, 3.6], [6.6, 3.6], [6.2, 6], [3.4, 8], [-3.4, 8], [-6.2, 6]])), fill: rand, part: 'shoe' },
    { kind: 'path', d: `M ${pt([x - 1.8, y - 7.2])} Q ${pt([x, y - 12.5])} ${pt([x + 1.8, y - 7.2])}`, stroke: shade(colour, 0.3), width: 1.6, part: 'shoe', detail: true },
  );
}

/**
 * The head, as an outline with a jaw (PLAN.md M357).
 *
 * It was a circle. A circle is a ball or an emoji; a person's head is
 * taller than it is wide, widest across the cheekbones and narrowing to a
 * chin, and that one change does more for "a person" than anything drawn
 * on the face.
 */
function headOutline([x, y]: Point, b: Build): Point[] {
  const right: Point[] = [
    [x + 7.8, y - 14.6],
    [x + 12.2, y - 9.8],
    [x + b.cheek, y - 2.4],
    [x + b.cheek - 0.5, y + 4.6],
    [x + b.jaw + 1.4, y + 10.6],
    [x + b.jaw - 2.6, y + 14.6],
    [x + 2.6, y + 16],
  ];
  return [[x, y - 15.6], ...right, ...mirror(right, x).reverse()];
}

/**
 * Hair, by build and by view.
 *
 * Short hair facing you is a cap with a hairline and a parting dipped off
 * centre, and the sideburns come down to the ears. Long hair is three
 * pieces: a mass behind the head and the neck, drawn before them; a crown
 * with a fringe swept to one side; and a lock either side falling in front
 * of the shoulders, drawn after the shirt. From behind, either is the whole
 * back of the head, and long hair carries on down the back.
 *
 * Nothing in front of the face below the eyes, in any of them. M225's first
 * long hair was one block behind the head and everything of it below the
 * chin showed across the jaw — a full beard.
 */
function hairShapes(j: Joints, b: Build, hair: string, front: boolean): { behind: Shape[]; over: Shape[]; locks: Shape[] } {
  const [x, y] = j.head;
  const c = b.cheek;
  const strand = shade(hair, 0.22);
  const shine = lit(hair, 0.13);
  if (!front) {
    const outline: Point[] = b.longHair
      ? [
          [x - c - 1.4, y - 6], [x - 9.6, y - 16.2], [x, y - 19.2], [x + 9.6, y - 16.2], [x + c + 1.4, y - 6],
          [x + c + 1.8, y + 8], [x + c - 0.4, y + 24], [x + 6.4, y + 38], [x, y + 40.5], [x - 6.4, y + 38],
          [x - c + 0.4, y + 24], [x - c - 1.8, y + 8],
        ]
      : [
          [x - c - 1.3, y + 1], [x - c - 1.4, y - 6.5], [x - 9.6, y - 15.8], [x, y - 18.8], [x + 9.6, y - 15.8],
          [x + c + 1.4, y - 6.5], [x + c + 1.3, y + 1], [x + c - 0.8, y + 8.4], [x + 6, y + 12.6],
          [x, y + 14.4], [x - 6, y + 12.6], [x - c + 0.8, y + 8.4],
        ];
    const over: Shape[] = [
      { kind: 'path', d: smooth(outline), fill: hair, part: 'hair' },
      { kind: 'path', d: curve([[x - 7, y - 12], [x - 3, y - 2], [x - 4, y + (b.longHair ? 30 : 9)]]), stroke: strand, width: 1.1, part: 'hair', detail: true },
      { kind: 'path', d: curve([[x + 4, y - 14], [x + 6, y - 1], [x + 5, y + (b.longHair ? 34 : 10)]]), stroke: strand, width: 1.1, part: 'hair', detail: true },
      { kind: 'path', d: curve([[x - 9, y - 11], [x - 5, y - 16.5], [x + 1, y - 17.2]]), stroke: shine, width: 1.4, part: 'hair', detail: true },
    ];
    return { behind: [], over, locks: [] };
  }
  if (!b.longHair) {
    const cap: Point[] = [
      [x - c + 0.3, y + 4], [x - c - 1.4, y - 3], [x - c - 0.8, y - 10.4], [x - 8.6, y - 17],
      [x - 1, y - 19.2], [x + 7.6, y - 18], [x + c + 0.5, y - 11.2], [x + c + 1.4, y - 3.4],
      [x + c - 0.1, y + 4], [x + c - 1.7, y + 3.4], [x + c - 2.1, y - 3.6], [x + 8.4, y - 8.8],
      [x + 2.6, y - 10.6], [x - 2.8, y - 9.2], [x - 8.4, y - 8.9], [x - c + 2, y - 3.6], [x - c + 1.7, y + 3.4],
    ];
    return {
      behind: [],
      over: [
        { kind: 'path', d: smooth(cap), fill: hair, part: 'hair' },
        { kind: 'path', d: curve([[x - 9.5, y - 12.4], [x - 4.5, y - 16.6], [x + 2, y - 17.2]]), stroke: shine, width: 1.3, part: 'hair', detail: true },
      ],
      locks: [],
    };
  }
  const mass: Point[] = [
    [x - c - 2, y - 6], [x - c - 3.6, y + 8], [x - c - 4.6, y + 22], [x - c - 2.2, y + 33], [x - 6, y + 36.5],
    [x + 6, y + 36.5], [x + c + 2.2, y + 33], [x + c + 4.6, y + 22], [x + c + 3.6, y + 8], [x + c + 2, y - 6],
    [x + 9.2, y - 17.6], [x, y - 19.6], [x - 9.2, y - 17.6],
  ];
  const crown: Point[] = [
    [x - c - 1.2, y + 4.2], [x - c - 1.9, y - 5.2], [x - 9.6, y - 16], [x - 1, y - 19.4], [x + 8.6, y - 17.2],
    [x + c + 1.2, y - 9.2], [x + c + 1.6, y + 1], [x + c + 1, y + 6], [x + c - 1.6, y + 3], [x + c - 2.2, y - 4.6],
    [x + 6, y - 9.8], [x - 1, y - 7.8], [x - 7, y - 5.4], [x - c + 1.4, y - 3.2], [x - c + 1.2, y + 3],
  ];
  const lock: Point[] = [
    [x - c - 1.2, y - 1], [x - c + 0.9, y + 4.2], [x - c + 0.3, y + 16], [x - c - 1.4, y + 30], [x - c - 4.6, y + 38.4],
    [x - c - 7.2, y + 33], [x - c - 5.6, y + 18], [x - c - 3.7, y + 4], [x - c - 2.6, y - 2.4],
  ];
  return {
    behind: [{ kind: 'path', d: smooth(mass), fill: shade(hair, 0.12), part: 'hair' }],
    over: [
      { kind: 'path', d: smooth(crown), fill: hair, part: 'hair' },
      { kind: 'path', d: curve([[x - 9.5, y - 12.4], [x - 4.5, y - 17], [x + 2, y - 17.4]]), stroke: shine, width: 1.3, part: 'hair', detail: true },
    ],
    locks: [
      { kind: 'path', d: smooth(lock), fill: hair, part: 'hair' },
      { kind: 'path', d: smooth(mirror(lock, x)), fill: hair, part: 'hair' },
      { kind: 'path', d: curve([[x - c - 2.2, y + 6], [x - c - 2.6, y + 20], [x - c - 4.6, y + 33]]), stroke: strand, width: 1, part: 'hair', detail: true },
      { kind: 'path', d: curve([[x + c + 2.2, y + 6], [x + c + 2.6, y + 20], [x + c + 4.6, y + 33]]), stroke: strand, width: 1, part: 'hair', detail: true },
    ],
  };
}

/**
 * The face (PLAN.md M357).
 *
 * Until M357 the face was two dots, on the reasoning that a nose and a
 * mouth on a head that small would be *"three smudges"*. Drawn in ink they
 * would be. So nothing on this face is ink except the iris: the nose is a
 * shadow, the mouth a line two shades deeper than the skin, the lids and
 * the brows soft — at 96 pixels they recede into a face rather than
 * sitting on it, and on a share card they are a face.
 *
 * The eyes have whites. A dot of one colour on a skin tone has to be either
 * dark or pale to show, and the pale dot the dark tones got read as two
 * glowing points; a white with a dark iris on it is an eye on every tone,
 * because one of the two always stands off the skin.
 *
 * **The expression reads vitality**, like the stance does: fresh smiles with
 * the brows up, worked is level, spent has heavy lids, brows tipped and the
 * mouth turned down. It is the same one number, said twice.
 */
function faceShapes(out: Shape[], head: Point, pose: AvatarPose, skin: string, hair: string): void {
  const [x, y] = head;
  const line = skinShade(skin, 0.42);
  const deep = skinShade(skin, 0.3);
  const brow = mix(hair, '#000000', 0.18);
  const eyeY = y + 1.6;
  for (const side of [-1, 1] as const) {
    const ex = x + side * 5.6;
    out.push(
      { kind: 'ellipse', cx: ex, cy: eyeY, rx: 3, ry: 2.05, fill: SCLERA, part: 'eye' },
      { kind: 'circle', cx: ex + side * 0.2, cy: eyeY + 0.25, r: 1.85, fill: IRIS, part: 'eye' },
      { kind: 'circle', cx: ex + side * 0.2 - 0.55, cy: eyeY - 0.35, r: 0.55, fill: '#ffffff', part: 'eye', detail: true },
    );
    if (pose === 'spent') {
      // Heavy lids: skin drawn down over the top of the eye.
      out.push({
        kind: 'path',
        d: smooth([[ex - 3.4, eyeY - 0.2], [ex - 2.6, eyeY - 2.6], [ex + 2.6, eyeY - 2.6], [ex + 3.4, eyeY - 0.2], [ex, eyeY + 0.3]]),
        fill: skinShade(skin, 0.06),
        part: 'eye',
        detail: true,
      });
    }
    const lid = pose === 'spent' ? eyeY - 0.2 : eyeY - 1.9;
    out.push({
      kind: 'path',
      d: curve([[ex - 3.3, lid + 1.1], [ex, lid - 0.9], [ex + 3.3, lid + 1.1]]),
      stroke: line,
      width: 1.1,
      part: 'eye',
      detail: true,
    });
    // Brows: up and arched when fresh, level when worked, inner end raised
    // and outer end dropped when spent — the shape of tired.
    const inner = x + side * 2.4;
    const outer = x + side * 9;
    const by = y - 3.8;
    const browLine: Point[] =
      pose === 'strong'
        ? [[inner, by + 0.4], [x + side * 5.6, by - 1.6], [outer, by]]
        : pose === 'steady'
          ? [[inner, by + 0.5], [x + side * 5.6, by - 0.8], [outer, by + 0.6]]
          : [[inner, by - 0.6], [x + side * 5.6, by - 0.2], [outer, by + 1.6]];
    out.push({ kind: 'path', d: curve(browLine), stroke: brow, width: 1.5, part: 'brow', detail: true });
  }
  // The nose is the shadow down its far side and under it, not an outline.
  out.push(
    { kind: 'path', d: curve([[x + 1.1, y + 3.2], [x + 1.9, y + 5.6], [x + 2, y + 7.2]]), stroke: deep, width: 1.1, part: 'face', detail: true },
    { kind: 'path', d: curve([[x - 1.9, y + 8], [x, y + 9.4], [x + 2.1, y + 7.9]]), stroke: deep, width: 1.2, part: 'face', detail: true },
  );
  const my = y + 11.2;
  const mouth: Point[] =
    pose === 'strong'
      ? [[x - 3.8, my - 0.4], [x, my + 2.4], [x + 3.8, my - 0.4]]
      : pose === 'steady'
        ? [[x - 3.2, my], [x, my + 0.9], [x + 3.2, my]]
        : [[x - 3, my + 0.6], [x, my - 0.6], [x + 3, my + 0.6]];
  out.push({ kind: 'path', d: curve(mouth), stroke: line, width: 1.3, part: 'mouth', detail: true });
}

/**
 * The torso's outline: shoulders, armpits, waist and hem.
 *
 * From the front the shoulder rounds over a deltoid before the side drops to
 * the waist; from behind, on the wall, the arms are up, so there is no
 * shoulder to round over — the side runs straight from the armpit.
 */
function torsoOutline(j: Joints, b: Build, front: boolean, longer: number, wider: number): { outline: Point[]; right: Point[] } {
  const sY = (j.shoulderL[1] + j.shoulderR[1]) / 2;
  const hipY = (j.hipL[1] + j.hipR[1]) / 2;
  const hemY = hipY + 4 + longer;
  const waistY = sY + (hemY - sY) * 0.62;
  const nx = j.neck[0];
  const cx = (j.hipL[0] + j.hipR[0]) / 2;
  const sL = j.shoulderL[0] + b.shoulder - wider;
  const sR = j.shoulderR[0] - b.shoulder + wider;
  const hemL = j.hipL[0] - b.hem - wider;
  const hemR = j.hipR[0] + b.hem + wider;
  const waistL = sL + (hemL - sL) * 0.62 + b.waist;
  const waistR = sR + (hemR - sR) * 0.62 - b.waist;
  const collar = b.neck / 2 + 3;
  /** One side, from the collar down; `out` is -1 on the left and 1 on the right. */
  const side = (s: number, waist: number, hem: number, out: number): Point[] =>
    front
      ? [[s - out * 4, sY - 5.2], [s + out * 3.2, sY - 2.8], [s + out * 6, sY + 4.6], [s + out * 4, sY + 13], [waist, waistY], [hem + out * 0.4, hemY - 3], [hem - out * 2, hemY + 1]]
      : [[s - out * 3, sY - 5.4], [s + out * 3.4, sY - 3], [s + out * 3.4, sY + 4], [s + out * 1.6, sY + 13], [waist, waistY], [hem + out * 0.4, hemY - 3], [hem - out * 2, hemY + 1]];
  const leftSide = side(sL, waistL, hemL, -1);
  const rightSide = side(sR, waistR, hemR, 1);
  // The neckline: a crew neck dips in front and barely at all behind.
  const dip = front ? 4.6 : 1.2;
  return {
    outline: [
      [nx - collar, sY - 6.6],
      ...leftSide,
      [cx, hemY + 2.2],
      ...[...rightSide].reverse(),
      [nx + collar, sY - 6.6],
      [nx + collar - 1.6, sY - 6.6 + dip * 0.5],
      [nx, sY - 6.6 + dip],
      [nx - collar + 1.6, sY - 6.6 + dip * 0.5],
    ],
    // From the armpit to the hem: the side the light does not reach.
    right: rightSide.slice(3),
  };
}

/** Back to front: ground, hair behind, legs, body, kit, arms, head, hands. */
export function climberShapes(config: AvatarConfig, options: ShapeOptions): Shape[] {
  const front = options.facing === 'front';
  const j = options.joints ?? (front ? STANDING : POSES)[config.pose];
  const c: AvatarPalette = config.palette;
  const g = config.gear;
  const b = BUILDS[config.figure];
  const hipY = (j.hipL[1] + j.hipR[1]) / 2;
  const sY = (j.shoulderL[1] + j.shoulderR[1]) / 2;
  const cx = (j.hipL[0] + j.hipR[0]) / 2;
  /** The hips' outer edges, which is the widest the shorts get. */
  const hipsL = j.hipL[0] - b.hip;
  const hipsR = j.hipR[0] + b.hip;
  const skin = c.skin;
  const skinDark = skinShade(skin);
  const out: Shape[] = [];

  if (options.showGround !== false) {
    out.push(...groundShapes(config.ground, j, options.colors, options.facing));
  }

  const hair = hairShapes(j, b, c.hair, front);
  out.push(...hair.behind);

  // A hood, bunched behind the collar, on the jacket.
  if (g.jacket && front) {
    out.push({
      kind: 'path',
      d: smooth([[j.neck[0] - 15, sY - 4], [j.neck[0] - 12, sY - 13], [j.neck[0], sY - 16], [j.neck[0] + 12, sY - 13], [j.neck[0] + 15, sY - 4]]),
      fill: shade(c.top, 0.16),
      part: 'jacket',
    });
  }

  // Two pieces of kit sit *behind* the climber, so from the front they go in
  // before the torso and the arms rather than after: the body of the pack,
  // showing past the shoulders, and the chalk bag hanging off the far hip.
  if (front && g.pack) {
    for (const side of [-1, 1] as const) {
      const shoulder = side < 0 ? j.shoulderL : j.shoulderR;
      const x0 = side < 0 ? shoulder[0] - 13 : shoulder[0];
      out.push({ kind: 'rect', x: x0, y: shoulder[1] + 1, w: 13, h: 42, rx: 6, fill: shade(c.gear, 0.12), part: 'pack' });
    }
  }
  if (front && g.chalk) {
    // Off the hips, not on them. At `hipR + 2` the bag sat on top of the
    // right thigh and read as a pocket sewn to the leg; it hangs beside the
    // figure, which is where one hangs.
    const x0 = hipsR + 1;
    out.push(
      { kind: 'rect', x: x0, y: hipY + 5, w: 15, h: 19, rx: 6, fill: c.gear, part: 'chalk' },
      { kind: 'rect', x: x0 + 9.5, y: hipY + 7, w: 4.5, h: 16, rx: 2.2, fill: shade(c.gear, 0.2), part: 'chalk', detail: true },
      // The fleece rim, and the drawstring toggle hanging from it.
      { kind: 'rect', x: x0 - 0.6, y: hipY + 3.6, w: 16.2, h: 5, rx: 2.5, fill: lit(c.gear, 0.5), part: 'chalk', detail: true },
      { kind: 'path', d: `M ${n(x0 + 3)} ${n(hipY + 8)} q -1 5 0.6 8`, stroke: shade(c.gear, 0.35), width: 1.1, part: 'chalk', detail: true },
    );
  }

  /**
   * Legs (PLAN.md M225, M357).
   *
   * Skin all the way down, with the clothing drawn over them; and one block
   * across the pelvis first, so the legs come out of a body rather than out
   * of the air — without it a wedge of background ran up between the thighs
   * to the shirt hem.
   */
  const thigh = thicker(THIGH, 0, b.limb);
  const calf = thicker(CALF, 0, b.limb);
  const legs: [Point, Point, Point][] = [
    [j.hipL, j.kneeL, j.footL],
    [j.hipR, j.kneeR, j.footR],
  ];
  const rope = (): void => {
    if (!g.rope) return;
    const ropeColour = mix(c.gear, c.top, 0.35);
    // Off the left hip rather than out of the centre line: a rope dropping
    // from the middle of the figure is the shape M225 was reported for.
    const d = front
      ? `M ${n(hipsL + 3)} ${n(hipY + 9)} q -14 26 -33 38`
      : `M ${n(cx)} ${n(hipY + 12)} q -34 40 -66 32`;
    out.push(
      { kind: 'path', d, stroke: ropeColour, width: 4.6, part: 'rope' },
      { kind: 'path', d, stroke: lit(ropeColour, 0.45), width: 1.6, dash: [2.5, 3.5], part: 'rope', detail: true },
    );
  };
  if (!front) rope();

  out.push({
    kind: 'path',
    d: smooth([
      [hipsL + 1, hipY - 4.6], [hipsR - 1, hipY - 4.6], [hipsR + 0.6, hipY + 6], [hipsR - 0.8, hipY + 19.4],
      [cx + 3.4, hipY + 21.4], [cx, hipY + 19.2], [cx - 3.4, hipY + 21.4], [hipsL + 0.8, hipY + 19.4], [hipsL - 0.6, hipY + 6],
    ]),
    fill: c.shorts,
    part: 'hips',
  });
  limbs(out, legs, [thigh, calf], skin, skinDark, 'leg');

  // Two units wider than the leg, so the hem sits proud of the thigh rather
  // than flush with it. The alpinist's trousers run to the ankle; everyone
  // else's shorts stop above the knee.
  const shorts = thicker(thigh, 2);
  for (const [hip, knee, foot] of legs) {
    if (g.jacket) {
      const upper = thicker(THIGH, 2.4, b.limb);
      const lower: Profile = [[0, 7.4 * b.limb], [0.4, 7.4 * b.limb], [1, 6.6]];
      out.push(
        { kind: 'path', d: smooth(limbOutline(hip, knee, upper)), fill: c.shorts, part: 'trousers' },
        { kind: 'path', d: smooth(limbOutline(knee, foot, lower)), fill: c.shorts, part: 'trousers' },
        { kind: 'path', d: smooth(limbShadow(hip, knee, upper)), fill: shade(c.shorts, 0.2), part: 'trousers', detail: true },
        { kind: 'path', d: smooth(limbShadow(knee, foot, lower)), fill: shade(c.shorts, 0.2), part: 'trousers', detail: true },
        { kind: 'path', d: seam(knee, foot, lower, 0.05, -1.5), stroke: shade(c.shorts, 0.28), width: 1, part: 'trousers', detail: true },
      );
    } else {
      const hem = mid(hip, knee, 0.7);
      out.push(
        { kind: 'path', d: smooth(limbOutline(hip, hem, shorts)), fill: c.shorts, part: 'shorts' },
        { kind: 'path', d: smooth(limbShadow(hip, hem, shorts)), fill: shade(c.shorts, 0.2), part: 'shorts', detail: true },
        { kind: 'path', d: seam(hip, hem, shorts, 0.93, -0.6), stroke: shade(c.shorts, 0.32), width: 1.3, part: 'shorts', detail: true },
      );
    }
  }
  if (!g.harness) {
    out.push({
      kind: 'path',
      d: `M ${n(hipsL + 0.5)} ${n(hipY - 1)} Q ${n(cx)} ${n(hipY + 0.6)} ${n(hipsR - 0.5)} ${n(hipY - 1)}`,
      stroke: shade(c.shorts, 0.3),
      width: 1.6,
      part: 'shorts',
      detail: true,
    });
  }
  for (const [, , foot] of legs) shoe(out, foot, c.shoes, front);
  if (front) rope();

  // The neck: wider where it meets the shoulders than under the jaw, and
  // darkest right under the chin, where the head shades it.
  const [hx, hy] = j.head;
  const nw = b.neck / 2;
  out.push(
    {
      kind: 'path',
      d: smooth([[hx - nw, hy + 6], [hx + nw, hy + 6], [hx + nw + 0.6, sY - 5], [j.neck[0] + nw + 3.4, sY - 1], [j.neck[0] - nw - 3.4, sY - 1], [hx - nw - 0.6, sY - 5]]),
      fill: skin,
      part: 'neck',
    },
    {
      kind: 'path',
      d: smooth([[hx - nw - 0.4, hy + 10], [hx + nw + 0.4, hy + 10], [hx + nw + 0.4, hy + 17.6], [hx, hy + 19.6], [hx - nw - 0.4, hy + 17.6]]),
      fill: skinShade(skin, 0.3),
      part: 'neck',
      detail: true,
    },
  );

  /**
   * The torso, and the one place the build actually lives.
   *
   * Shoulders, armpits and a waist the female build draws in by five units
   * a side; a crew neck in front, the shirt's far side in shadow, and the
   * chest picked out by two soft lines rather than drawn.
   */
  const shirt = c.top;
  const torso = torsoOutline(j, b, front, g.jacket ? 7 : 0, g.jacket ? 2.4 : 0);
  out.push({ kind: 'path', d: smooth(torso.outline), fill: shirt, part: g.jacket ? 'jacket' : 'torso' });
  const inside = torso.right.map(([px, py], i) => [px - (i === 0 ? 5 : 8), py] as const).reverse();
  out.push({ kind: 'path', d: smooth([...torso.right, ...inside]), fill: shade(shirt, 0.16), part: 'torso', detail: true });
  const fold = shade(shirt, 0.11);
  if (front) {
    const chestY = sY + (config.figure === 'female' ? 19 : 16);
    for (const side of [-1, 1] as const) {
      out.push({
        kind: 'path',
        d: curve([[cx + side * 11.5, chestY - 0.6], [cx + side * 7, chestY + 2.6], [cx + side * 2.4, chestY + 0.2]]),
        stroke: fold,
        width: 1,
        part: 'torso',
        detail: true,
      });
    }
    const collar = b.neck / 2 + 3;
    out.push({
      kind: 'path',
      d: `M ${n(j.neck[0] - collar)} ${n(sY - 6.6)} Q ${n(j.neck[0])} ${n(sY + 1.6)} ${n(j.neck[0] + collar)} ${n(sY - 6.6)}`,
      stroke: shade(shirt, 0.24),
      width: 1.8,
      part: 'torso',
      detail: true,
    });
  } else {
    // Shoulder blades, and the crease down the spine above the waist.
    for (const side of [-1, 1] as const) {
      out.push({
        kind: 'path',
        d: curve([[cx + side * 4, sY + 4], [cx + side * 13, sY + 9], [cx + side * 11, sY + 21]]),
        stroke: fold,
        width: 1.1,
        part: 'torso',
        detail: true,
      });
    }
    out.push({ kind: 'path', d: curve([[cx, sY + 6], [cx + 0.6, sY + 22], [cx, hipY - 12]]), stroke: fold, width: 1, part: 'torso', detail: true });
  }
  if (g.jacket) {
    const nx = j.neck[0];
    const collar = b.neck / 2 + 3;
    out.push(
      // A stand-up collar round the neck, and the zip down the front.
      { kind: 'path', d: smooth([[nx - collar - 2.6, sY - 5.6], [nx - collar + 0.4, sY - 13], [nx + collar - 0.4, sY - 13], [nx + collar + 2.6, sY - 5.6], [nx, sY - 2.6]]), fill: shade(shirt, 0.08), part: 'jacket' },
      ...(front
        ? [
            { kind: 'path' as const, d: `M ${n(cx)} ${n(sY - 2.6)} L ${n(cx)} ${n(hipY + 4)}`, stroke: shade(shirt, 0.34), width: 1.2, part: 'jacket' as const, detail: true as const },
            { kind: 'path' as const, d: `M ${n(cx + 5)} ${n(sY + 9)} l 9 -1.4`, stroke: shade(shirt, 0.34), width: 1.1, part: 'jacket' as const, detail: true as const },
          ]
        : []),
    );
  }

  if (front && g.pack) {
    // Straps over the chest, and the sternum strap between them. The body of
    // the pack went in behind the torso; drawing it here would be a pack
    // worn on the front.
    const top = (s: Point, toward: number): Point => [s[0] + toward * 5, s[1] - 3];
    const bottom = (h: Point, toward: number): Point => [h[0] + toward, h[1] - 6];
    out.push(
      { kind: 'polyline', points: [top(j.shoulderL, 1), bottom(j.hipL, 1)], stroke: c.gear, width: 6.5, part: 'strap' },
      { kind: 'polyline', points: [top(j.shoulderR, -1), bottom(j.hipR, -1)], stroke: c.gear, width: 6.5, part: 'strap' },
      { kind: 'path', d: `M ${n(j.shoulderL[0] + 8)} ${n(sY + 16)} L ${n(j.shoulderR[0] - 8)} ${n(sY + 16)}`, stroke: shade(c.gear, 0.25), width: 2.2, part: 'strap', detail: true },
    );
  }

  if (g.harness) {
    out.push(
      { kind: 'path', d: smooth([[hipsL - 0.6, hipY - 6.4], [hipsR + 0.6, hipY - 6.4], [hipsR + 0.9, hipY + 2.4], [hipsL - 0.9, hipY + 2.4]]), fill: c.gear, part: 'harness' },
      { kind: 'path', d: `M ${n(hipsL + 1)} ${n(hipY - 5)} L ${n(hipsR - 1)} ${n(hipY - 5)}`, stroke: lit(c.gear, 0.24), width: 1, part: 'harness', detail: true },
    );
    if (front) {
      // The buckle sits on the belt, above the waist; nothing hangs below it
      // on the centre line (M225 — the belay loop, and the reason it went).
      out.push({ kind: 'rect', x: cx - 3.6, y: hipY - 5.6, w: 7.2, h: 6.2, rx: 1.6, fill: lit(c.gear, 0.42), part: 'buckle' });
      /**
       * Leg loops, and not a belay loop (PLAN.md M225).
       *
       * Two bands round the thighs say harness, they are symmetric about the
       * centre line rather than sitting on it, and they are the part of a
       * harness a climber standing in front of you actually reads first.
       */
      for (const [hip, knee] of legs) {
        out.push({ kind: 'path', d: smooth(band(hip, knee, shorts, 0.34, 5.6, 0.6)), fill: c.gear, part: 'loop' });
      }
      if (g.rope) {
        // Two quickdraws racked on the gear loop, the far side from the bag.
        for (const dx of [-3, 3]) {
          const qx = hipsL + 2 + dx;
          out.push(
            { kind: 'path', d: `M ${n(qx)} ${n(hipY + 1)} l 0 5`, stroke: lit(c.gear, 0.55), width: 1.4, part: 'quickdraw', detail: true },
            { kind: 'path', d: `M ${n(qx)} ${n(hipY + 6)} l 0 5.5`, stroke: shade(c.top, 0.1), width: 2.2, part: 'quickdraw', detail: true },
            { kind: 'path', d: `M ${n(qx)} ${n(hipY + 11.5)} l 0 4.5`, stroke: lit(c.gear, 0.55), width: 1.4, part: 'quickdraw', detail: true },
          );
        }
      }
    }
  }
  if (g.chalk && !front) {
    // From behind the bag hangs at the small of the back.
    const x0 = j.head[0] - 11;
    out.push(
      { kind: 'rect', x: x0, y: j.hipL[1] + 4, w: 22, h: 24, rx: 9, fill: c.gear, part: 'chalk' },
      { kind: 'rect', x: x0 - 0.6, y: j.hipL[1] + 3, w: 23.2, h: 6, rx: 3, fill: lit(c.gear, 0.5), part: 'chalk', detail: true },
      { kind: 'rect', x: x0 + 14, y: j.hipL[1] + 8, w: 6, h: 18, rx: 3, fill: shade(c.gear, 0.2), part: 'chalk', detail: true },
    );
  }
  if (g.pack && !front) {
    const top = j.neck[1] + 10;
    const x0 = j.head[0] - 17;
    out.push(
      { kind: 'rect', x: x0, y: top, w: 34, h: 46, rx: 10, fill: c.gear, part: 'pack' },
      { kind: 'rect', x: x0 + 2, y: top - 2, w: 30, h: 12, rx: 6, fill: shade(c.gear, 0.16), part: 'pack' },
      { kind: 'rect', x: x0 + 5, y: top + 15, w: 24, h: 26, rx: 7, fill: c.shorts, part: 'pack' },
      { kind: 'path', d: `M ${n(x0 + 1)} ${n(top + 22)} L ${n(x0 + 33)} ${n(top + 22)}`, stroke: shade(c.gear, 0.3), width: 1.6, part: 'pack', detail: true },
    );
  }

  /**
   * Arms (PLAN.md M357).
   *
   * A shoulder, a biceps, an elbow, a forearm that swells below it and
   * thins to the wrist, then a hand — and the sleeve over the top of it.
   */
  const upperArm = thicker(UPPER_ARM, 0, b.limb);
  const forearm = thicker(FOREARM, 0, b.limb);
  const arms: [Point, Point, Point][] = [
    [j.shoulderL, j.elbowL, wristOf(j.elbowL, j.handL)],
    [j.shoulderR, j.elbowR, wristOf(j.elbowR, j.handR)],
  ];
  limbs(out, arms, [upperArm, forearm], skin, skinDark, 'arm');
  for (const [shoulder, elbow, wrist] of arms) {
    if (g.jacket) {
      const sleeveUpper = thicker(upperArm, 1.8);
      const sleeveLower = thicker(forearm, 1.6);
      const cuff = mid(elbow, wrist, 0.86);
      out.push(
        { kind: 'path', d: smooth(limbOutline(shoulder, elbow, sleeveUpper)), fill: shirt, part: 'sleeve' },
        { kind: 'path', d: smooth(limbOutline(elbow, cuff, sleeveLower)), fill: shirt, part: 'sleeve' },
        { kind: 'path', d: smooth(limbShadow(shoulder, elbow, sleeveUpper)), fill: shade(shirt, 0.16), part: 'sleeve', detail: true },
        { kind: 'path', d: smooth(limbShadow(elbow, cuff, sleeveLower)), fill: shade(shirt, 0.16), part: 'sleeve', detail: true },
        { kind: 'path', d: seam(elbow, cuff, sleeveLower, 0.94, -0.4), stroke: shade(shirt, 0.3), width: 1.4, part: 'sleeve', detail: true },
      );
    } else {
      const end = mid(shoulder, elbow, 0.55);
      const sleeve = thicker(upperArm, 1.3);
      out.push(
        { kind: 'path', d: smooth(limbOutline(shoulder, end, sleeve)), fill: shirt, part: 'sleeve' },
        { kind: 'path', d: smooth(limbShadow(shoulder, end, sleeve)), fill: shade(shirt, 0.16), part: 'sleeve', detail: true },
        { kind: 'path', d: seam(shoulder, end, sleeve, 0.92, -0.5), stroke: shade(shirt, 0.28), width: 1.3, part: 'sleeve', detail: true },
      );
    }
  }

  /**
   * The head: ears, the shaped head, its shading, the face, the hair.
   *
   * The ears go in first so the head covers their inner half; from behind
   * they go in after the hair, because from behind they stick out of it.
   */
  const ears = (): void => {
    for (const side of [-1, 1] as const) {
      const ex = hx + side * (b.cheek - 0.4);
      out.push(
        { kind: 'ellipse', cx: ex, cy: hy + 2.6, rx: 2.8, ry: 4.3, fill: skin, part: 'ear' },
        { kind: 'ellipse', cx: ex + side * 1, cy: hy + 2.8, rx: 1.2, ry: 2.5, fill: skinShade(skin, 0.24), part: 'ear', detail: true },
      );
    }
  };
  if (front) ears();
  out.push({ kind: 'path', d: smooth(headOutline(j.head, b)), fill: skin, part: 'head' });
  if (front) {
    // The far side of the face, from the temple down the jaw.
    out.push({
      kind: 'path',
      d: smooth([
        [hx + b.cheek - 0.4, hy - 3], [hx + b.cheek - 0.8, hy + 4.6], [hx + b.jaw + 1, hy + 10.6], [hx + b.jaw - 2.6, hy + 14.4],
        [hx + 4.4, hy + 15.2], [hx + b.jaw - 2.2, hy + 12.4], [hx + b.jaw + 0.2, hy + 8.4], [hx + b.cheek - 2.4, hy + 3], [hx + b.cheek - 2.2, hy - 3],
      ]),
      fill: skinShade(skin, 0.1),
      part: 'head',
      detail: true,
    });
    faceShapes(out, j.head, config.pose, skin, c.hair);
  }
  out.push(...hair.over);
  // From behind, long hair covers the ears; short hair leaves them out.
  if (!front && !b.longHair) ears();
  out.push(...hair.locks);

  if (g.helmet) {
    // On the forehead, above the brows — where a climbing helmet sits — so
    // the brim is clear of the eyes and the face stays a face.
    const rim = front ? hy - 6.2 : hy - 3.6;
    out.push(
      {
        kind: 'path',
        d: smooth([[hx - 16, rim + 1.6], [hx - 15.4, rim - 5.6], [hx - 9.8, rim - 13.6], [hx, rim - 15.8], [hx + 9.8, rim - 13.6], [hx + 15.4, rim - 5.6], [hx + 16, rim + 1.6], [hx, rim - 0.6]]),
        fill: c.gear,
        part: 'helmet',
      },
      { kind: 'path', d: smooth([[hx - 16.6, rim - 1.6], [hx + 16.6, rim - 1.6], [hx + 16.4, rim + 1.6], [hx, rim + 0.4], [hx - 16.4, rim + 1.6]]), fill: shade(c.gear, 0.2), part: 'brim' },
      { kind: 'path', d: curve([[hx - 11, rim - 7], [hx - 6, rim - 12.6], [hx + 1, rim - 13.6]]), stroke: lit(c.gear, 0.34), width: 1.8, part: 'helmet', detail: true },
      ...[-6, 0, 6].map((dx) => ({
        kind: 'ellipse' as const, cx: hx + dx, cy: rim - 10 + Math.abs(dx) * 0.35, rx: 2, ry: 1, fill: shade(c.gear, 0.4), part: 'helmet' as const, detail: true as const,
      })),
    );
    if (front) {
      // The chin strap, down the line of the jaw.
      for (const side of [-1, 1] as const) {
        out.push({
          kind: 'path',
          d: curve([[hx + side * (b.cheek + 0.4), rim + 1], [hx + side * (b.jaw + 1.6), hy + 10], [hx + side * 2.6, hy + 15.8]]),
          stroke: shade(c.gear, 0.18),
          width: 1.1,
          part: 'helmet',
          detail: true,
        });
      }
    }
  }
  if (g.axe) {
    const [ax, ay] = j.handR;
    const top: Point = [ax + 1.6, ay - 9];
    const shape: Point[] = [[-2, -2.2], [2, -2.2], [12, -0.6], [15.6, 4.4], [11.2, 2.4], [2, 2], [-2, 2], [-9.4, 1.8], [-9.8, -2.6]];
    const head = shape.map(([dx, dy]) => [top[0] + dx, top[1] + dy] as const);
    out.push(
      { kind: 'path', d: `M ${n(top[0])} ${n(top[1])} L ${n(ax + 4.6)} ${n(ay + 34)}`, stroke: mix(c.gear, '#8a5a32', 0.4), width: 3.4, part: 'axe' },
      { kind: 'path', d: `M ${head.map(pt).join(' L ')} Z`, fill: shade(c.gear, 0.2), part: 'axe' },
      { kind: 'path', d: `M ${n(ax + 4.6)} ${n(ay + 34)} l 0.6 5`, stroke: shade(c.gear, 0.3), width: 2, part: 'axe', detail: true },
    );
  }

  for (const [, elbow, wrist] of arms) hand(out, elbow, wrist, cx, front, skin);

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
        shape.stroke
          ? ` stroke="${shape.stroke}" stroke-width="${shape.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"${
              shape.dash ? ` stroke-dasharray="${shape.dash.join(' ')}"` : ''
            }`
          : ''
      }/>`;
    case 'polyline':
      return `<polyline points="${shape.points.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}
