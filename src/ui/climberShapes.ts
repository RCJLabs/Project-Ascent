/**
 * The climber's geometry, as data.
 *
 * Two things draw this figure: the React `Avatar`, and the share-card
 * builder, which emits a standalone SVG string with no React and no CSS
 * variables. Keeping the geometry in one place means a pose fix lands in
 * both — the alternative is two copies of a figure that will drift.
 */

import type {
  AvatarConfig,
  AvatarFigure,
  AvatarGround,
  AvatarPalette,
  AvatarPose,
} from '@/engine/avatar';
import { contrast } from './contrast';

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
 * The two builds, in viewBox units (PLAN.md M225).
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
 * before either of them.
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
  /** The neck's stroke width. */
  neck: number;
  /** Hair past the jaw rather than cropped at it. */
  longHair: boolean;
}

export const BUILDS: Record<AvatarFigure, Build> = {
  // Shoulders 46 wide against hips 40: a taper, and no waist drawn into it.
  male: { hip: 9, hem: 6, waist: 0, shoulder: 0, neck: 13, longHair: false },
  // Shoulders 38 against hips 46, and five units off each side of the waist.
  female: { hip: 12, hem: 7, waist: 5, shoulder: 4, neck: 11, longHair: true },
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
  /** The colour behind the figure, used for the chalk-bag seam and pack rim. */
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

/**
 * Eyes, and nothing else on the face.
 *
 * Dark or pale, whichever this skin tone can actually show: the six tones
 * run from `#f2d3b8` to `#4d2f1c`, and one fixed eye colour disappears at
 * one end of that or the other. The contrast maths is the app's one copy
 * (`ui/contrast`), so the eyes and the themes agree about what is legible.
 */
/** The head's radius. The hair is cut from the same circle. */
export const HEAD = 15;

const EYE_DARK = '#14181d';
const EYE_PALE = '#f3f6f8';

export function eyeColor(skin: string): string {
  return contrast(EYE_DARK, skin) >= contrast(EYE_PALE, skin) ? EYE_DARK : EYE_PALE;
}

/**
 * The top of the head, cut `down` units below its centre.
 *
 * An arc of the head's own radius between two points on the head's own
 * circle, so the hair hugs the skull instead of hovering over it — which is
 * what a rounded rect across the top of a circle does, and what the first
 * pass drew. `down` is negative for a fringe above the eyes and positive for
 * the fuller cap the back of the head takes.
 */
export function scalp(head: Point, down: number, fill: string): Shape {
  const half = Math.sqrt(HEAD * HEAD - down * down);
  const y = head[1] + down;
  return {
    kind: 'path',
    d: `M ${(head[0] - half).toFixed(2)} ${y} A ${HEAD} ${HEAD} 0 0 1 ${(head[0] + half).toFixed(2)} ${y} Z`,
    fill,
  };
}

function groundShapes(
  ground: AvatarGround,
  j: Joints,
  colors: ClimberColors,
  facing: Facing,
): Shape[] {
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
      },
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

/** Back to front: ground, hips, legs, shoes, torso, arms, head, gear, hands. */
export function climberShapes(config: AvatarConfig, options: ShapeOptions): Shape[] {
  const front = options.facing === 'front';
  const j = options.joints ?? (front ? STANDING : POSES)[config.pose];
  const c: AvatarPalette = config.palette;
  const g = config.gear;
  const b = BUILDS[config.figure];
  const hipY = (j.hipL[1] + j.hipR[1]) / 2;
  /** The hips' outer edges, which is the widest the shorts get. */
  const hipsL = j.hipL[0] - b.hip;
  const hipsR = j.hipR[0] + b.hip;
  const out: Shape[] = [];

  if (options.showGround !== false) {
    out.push(...groundShapes(config.ground, j, options.colors, options.facing));
  }

  /**
   * Hips, then legs (PLAN.md M225).
   *
   * The figure used to be two leg-shaped tubes starting at the hip joints
   * with nothing between them, which left a wedge of background running up
   * into the crotch — reported as "the legs and pants look weird", and it is
   * the same wedge that framed the belay loop and made the complaint above
   * it. One block across the pelvis closes it, and the legs come out of a
   * body rather than out of the air.
   */
  out.push({
    kind: 'rect',
    x: hipsL,
    y: hipY - 4,
    w: hipsR - hipsL,
    h: 26,
    rx: 11,
    fill: c.shorts,
  });

  // Legs are skin all the way down and the clothing goes over them, which is
  // the other half of it. They were drawn in the shorts colour from hip to
  // ankle with skin painted back over the shin, so the "shorts" reached past
  // the knee and read as baggy trousers on a figure wearing shorts.
  out.push(
    { kind: 'polyline', points: [j.hipL, j.kneeL, j.footL], stroke: c.skin, width: 13 },
    { kind: 'polyline', points: [j.hipR, j.kneeR, j.footR], stroke: c.skin, width: 13 },
  );
  // Two units wider than the leg, so the hem sits proud of the thigh rather
  // than flush with it. The alpinist's trousers run to the ankle; everyone
  // else's shorts stop above the knee.
  const leg = (hip: Point, knee: Point, foot: Point): Point[] =>
    g.jacket ? [hip, knee, foot] : [hip, mid(hip, knee, 0.7)];
  out.push(
    { kind: 'polyline', points: leg(j.hipL, j.kneeL, j.footL), stroke: c.shorts, width: 17 },
    { kind: 'polyline', points: leg(j.hipR, j.kneeR, j.footR), stroke: c.shorts, width: 17 },
  );

  out.push(
    { kind: 'ellipse', cx: j.footL[0], cy: j.footL[1], rx: 11, ry: 8, fill: c.shoes },
    { kind: 'ellipse', cx: j.footR[0], cy: j.footR[1], rx: 11, ry: 8, fill: c.shoes },
  );

  // Two pieces of kit sit *behind* the climber, so from the front they go in
  // before the torso and the arms rather than after. The rest of the gear is
  // worn on the front of the body and stays where it was.
  if (front && g.pack) {
    out.push(
      { kind: 'rect', x: j.shoulderL[0] - 13, y: j.shoulderL[1] + 1, w: 13, h: 42, rx: 6, fill: c.gear },
      { kind: 'rect', x: j.shoulderR[0], y: j.shoulderR[1] + 1, w: 13, h: 42, rx: 6, fill: c.gear },
    );
  }
  if (front && g.chalk) {
    // Off the hips, not on them. At `hipR + 2` the bag sat on top of the
    // right thigh and read as a pocket sewn to the leg; it hangs beside the
    // figure now, which is where one hangs.
    const x = hipsR + 1;
    out.push(
      { kind: 'rect', x, y: hipY + 6, w: 16, h: 19, rx: 7, fill: c.gear },
      { kind: 'path', d: `M ${x} ${hipY + 12} h 16`, stroke: options.colors.surface, width: 2.5 },
    );
  }

  if (front) {
    // A neck. The `neck` joint has always been in the table and nothing ever
    // drew it: on the wall the head sits close enough to the shoulders to
    // get away with it, and facing you, fifteen pixels of background between
    // the chin and the collar is a head floating over a shirt.
    out.push({
      kind: 'polyline',
      points: [[j.head[0], j.head[1] + 7], [j.neck[0], j.shoulderL[1] + 2]],
      stroke: c.skin,
      width: b.neck,
    });
  }
  /**
   * The torso, and the one place the build actually lives.
   *
   * It was a trapezoid straight from shoulder to hip. Six points instead, so
   * there is a waist to pull in: the male build leaves it on the line and
   * gets the same taper it always had, the female build takes five units off
   * each side of it and sets the hips wider than the shoulders.
   */
  const shoulderY = (j.shoulderL[1] + j.shoulderR[1]) / 2;
  const hemY = hipY + 4;
  const waistY = shoulderY + (hemY - shoulderY) * 0.62;
  const sL = j.shoulderL[0] + b.shoulder;
  const sR = j.shoulderR[0] - b.shoulder;
  const hemL = j.hipL[0] - b.hem;
  const hemR = j.hipR[0] + b.hem;
  const waistL = sL + (hemL - sL) * 0.62 + b.waist;
  const waistR = sR + (hemR - sR) * 0.62 - b.waist;
  // Three units above the joints, because the sleeves are 13-wide strokes
  // with round caps centred on them: a shirt whose top edge runs through the
  // middle of those caps leaves two bumps with a flat span between, which is
  // a puff sleeve rather than a shoulder.
  const capY = 3;
  out.push({
    kind: 'path',
    d:
      `M ${sL} ${j.shoulderL[1] - capY} L ${sR} ${j.shoulderR[1] - capY} ` +
      `L ${waistR.toFixed(2)} ${waistY.toFixed(2)} L ${hemR} ${hemY} ` +
      `L ${hemL} ${hemY} L ${waistL.toFixed(2)} ${waistY.toFixed(2)} Z`,
    fill: c.top,
  });
  if (g.jacket) {
    out.push(
      {
        kind: 'path',
        d: `M ${j.shoulderL[0] - 7} ${j.shoulderL[1] - 5} L ${j.shoulderR[0] + 7} ${j.shoulderR[1] - 5} L ${j.hipR[0] + 8} ${j.hipR[1] + 10} L ${j.hipL[0] - 8} ${j.hipL[1] + 10} Z`,
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
  );

  /**
   * Hair (PLAN.md M225).
   *
   * The head was a bare circle and the two builds are four units apart at
   * the hips, which is two pixels on a profile card — so without this the
   * choice between them would be a setting nobody could see changing. Hair
   * is what carries at that size and it carries first.
   *
   * Long hair falls *behind* the face and *in front of* the back of the
   * head, which is the same hair drawn in two orders rather than two
   * different shapes. Cropped hair is an arc cut from the head's own circle,
   * higher in front so it clears the eyes, much lower behind because there
   * is nothing back there to clear and a cap cut at the crown reads as a
   * hat — the helmet brim makes the same trade, two units of it.
   */
  //
  // Two lobes in front and one mass behind, not one mass in both. The first
  // pass drew a single rounded rect behind the head, and everything of it
  // below the chin — thirteen units of it — showed across the jaw: the
  // figure came out with a full beard, which is a long way from the
  // silhouette this is here to draw. Split either side of the centre line
  // there is a gap for the neck, and hair reads as hair.
  const mane: Shape[] = front
    ? ([-1, 1] as const).map((side) => ({
        kind: 'rect' as const,
        x: j.head[0] + side * 13 - 8,
        y: j.head[1] - 12,
        w: 16,
        h: 40,
        rx: 8,
        fill: c.hair,
      }))
    : [{ kind: 'rect', x: j.head[0] - 18, y: j.head[1] - 15, w: 36, h: 42, rx: 17, fill: c.hair }];
  if (b.longHair && front) out.push(...mane);
  out.push({ kind: 'circle', cx: j.head[0], cy: j.head[1], r: HEAD, fill: c.skin });
  if (b.longHair && !front) out.push(...mane);
  else out.push(scalp(j.head, front ? -3 : 11, c.hair));
  // Cropped hair still needs a fringe on a face with long hair beside it,
  // or the crown is bare between the two lobes.
  if (b.longHair && front) out.push(scalp(j.head, -3, c.hair));

  if (front) {
    // Eyes, and that is the whole face. A nose and a mouth on a head fifteen
    // pixels across at full size — six on a profile — is three smudges, and
    // the kit and the posture are what this figure is for.
    const ink = eyeColor(c.skin);
    for (const side of [-1, 1]) {
      // Just below centre and well apart. Lower and closer than this and
      // two dots on a circle stop reading as eyes and start reading as a
      // snout, which is what the first pass drew.
      out.push({ kind: 'circle', cx: j.head[0] + side * 6.5, cy: j.head[1] + 3, r: 2.6, fill: ink });
    }
  }

  if (g.harness) {
    out.push({ kind: 'rect', x: hipsL, y: hipY - 5, w: hipsR - hipsL, h: 9, rx: 4, fill: c.gear });
    /**
     * Leg loops, and not a belay loop (PLAN.md M225).
     *
     * M209 drew the belay loop because it is the part of a harness that only
     * shows from the front and the part that says harness rather than belt.
     * That is all true and it does not survive contact with the size this is
     * drawn at: six units wide and ten tall, hanging from the centre of the
     * waist into the gap between two disconnected legs, on a figure with no
     * other detail below the chin. The report was one sentence long and it
     * was not about climbing equipment.
     *
     * Two bars across the thighs say harness at least as well, they are
     * symmetric about the centre line rather than sitting on it, and they are
     * the part of a harness a climber standing in front of you actually
     * reads first.
     */
    if (front) {
      for (const hip of [j.hipL, j.hipR]) {
        out.push({ kind: 'rect', x: hip[0] - 10, y: hipY + 12, w: 20, h: 6, rx: 3, fill: c.gear });
      }
    }
  }
  if (g.chalk && !front) {
    out.push(
      { kind: 'rect', x: j.head[0] - 11, y: j.hipL[1] + 4, w: 22, h: 24, rx: 9, fill: c.gear },
      { kind: 'path', d: `M ${j.head[0] - 11} ${j.hipL[1] + 12} h 22`, stroke: options.colors.surface, width: 2.5 },
    );
  }
  if (g.rope) {
    out.push({
      kind: 'path',
      // Off the left hip rather than out of the centre line: the belay loop
      // it used to be tied into is gone, and a rope dropping from the middle
      // of a figure is the shape that was reported in the first place.
      d: front
        ? `M ${hipsL + 2} ${hipY + 10} q -12 28 -32 38`
        : `M ${j.head[0]} ${hipY} q -34 40 -66 32`,
      stroke: c.gear,
      width: 5,
    });
  }
  if (g.pack) {
    if (front) {
      // Straps over the chest. The body of the pack went in behind the
      // torso; drawing it here would be a pack worn on the front.
      out.push(
        { kind: 'polyline', points: [[j.shoulderL[0] + 5, j.shoulderL[1] - 3], [j.hipL[0] + 1, j.hipL[1] - 6]], stroke: c.gear, width: 7 },
        { kind: 'polyline', points: [[j.shoulderR[0] - 5, j.shoulderR[1] - 3], [j.hipR[0] - 1, j.hipR[1] - 6]], stroke: c.gear, width: 7 },
      );
    } else {
      out.push(
        { kind: 'rect', x: j.head[0] - 17, y: j.neck[1] + 10, w: 34, h: 46, rx: 10, fill: c.gear },
        { kind: 'rect', x: j.head[0] - 12, y: j.neck[1] + 15, w: 24, h: 36, rx: 7, fill: c.shorts },
      );
    }
  }
  if (g.helmet) {
    // Two higher in front, because the brim is drawn over the head and the
    // eyes are under it. From behind there is nothing to clear.
    const brow = front ? j.head[1] - 3 : j.head[1] - 1;
    out.push(
      { kind: 'path', d: `M ${j.head[0] - 17} ${brow} a 17 17 0 0 1 34 0 z`, fill: c.gear },
      { kind: 'rect', x: j.head[0] - 19, y: brow - 2, w: 38, h: front ? 4 : 5, rx: 2.5, fill: c.gear },
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
