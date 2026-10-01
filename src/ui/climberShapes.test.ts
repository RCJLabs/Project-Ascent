import { describe, expect, it } from 'vitest';
import { SKIN_TONES, deriveAvatar, type AvatarFigure } from '@/engine/avatar';
import { DEFAULT_PALETTE } from '@/engine/avatarPalette';
import { HAIR_TONES } from '@/engine/kits';
import { contrast } from './contrast';
import {
  BUILDS,
  CLIMBER_VIEWBOX,
  HEAD,
  IRIS,
  POSES,
  SCLERA,
  STANDING,
  climberShapes,
  climbingPose,
  limbOutline,
  limbShadow,
  type Joints,
  type Part,
  type Point,
  type Profile,
  type Shape,
} from './climberShapes';

const BASE = POSES.steady;

describe('the high step', () => {
  it('keeps the knee above the foot', () => {
    // A knee below the foot reads as a broken leg. Both legs, every pose.
    for (const [name, pose] of Object.entries(POSES)) {
      expect(pose.kneeL[1], `${name} left`).toBeLessThan(pose.footL[1]);
      expect(pose.kneeR[1], `${name} right`).toBeLessThan(pose.footR[1]);
    }
  });

  it('steps the right foot up without folding it into the chest', () => {
    // At the original 130/160 the thigh crossed the torso. The foot must
    // still be clearly higher than the other one — it is a high step — but
    // the knee no better than level with the hip.
    const { hipR, kneeR, footR, footL } = POSES.strong;
    expect(footR[1]).toBeLessThan(footL[1]);
    expect(kneeR[1]).toBeGreaterThanOrEqual(hipR[1] - 4);
    expect(footR[1]).toBeGreaterThan(hipR[1] + 20);
  });

  it('keeps every joint inside the frame', () => {
    for (const [name, pose] of Object.entries(POSES)) {
      for (const [joint, [x, y]] of Object.entries(pose)) {
        expect(x, `${name} ${joint} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${name} ${joint} x`).toBeLessThanOrEqual(CLIMBER_VIEWBOX.width);
        expect(y, `${name} ${joint} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${name} ${joint} y`).toBeLessThanOrEqual(CLIMBER_VIEWBOX.height);
      }
    }
  });
});

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** How extended a limb is, 0 (folded) to 1 (straight). */
const extension = (anchor: Point, joint: Point, end: Point) =>
  dist(anchor, end) / (dist(anchor, joint) + dist(joint, end));

const TURN = Array.from({ length: 40 }, (_, i) => i / 40);

describe('the climbing cycle', () => {
  it('repeats every turn', () => {
    expect(climbingPose(BASE, 0.3)).toEqual(climbingPose(BASE, 1.3));
    expect(climbingPose(BASE, 0.75)).toEqual(climbingPose(BASE, 2.75));
  });

  it('keeps every limb its own length', () => {
    // The whole reason for the IK: a limb that changes length as it moves is
    // a limb that stretches, and nothing else here would catch it.
    for (const pose of Object.values(POSES)) {
      const legLength = dist(pose.hipL, pose.kneeL) + dist(pose.kneeL, pose.footL);
      const armLength = dist(pose.shoulderL, pose.elbowL) + dist(pose.elbowL, pose.handL);
      for (const phase of TURN) {
        const p = climbingPose(pose, phase);
        expect(dist(p.hipL, p.kneeL) + dist(p.kneeL, p.footL)).toBeCloseTo(legLength, 6);
        expect(dist(p.hipR, p.kneeR) + dist(p.kneeR, p.footR)).toBeCloseTo(legLength, 6);
        expect(dist(p.shoulderL, p.elbowL) + dist(p.elbowL, p.handL)).toBeCloseTo(armLength, 6);
        expect(dist(p.shoulderR, p.elbowR) + dist(p.elbowR, p.handR)).toBeCloseTo(armLength, 6);
      }
    }
  });

  it('straightens and bends each leg', () => {
    // The reported bug: the first version translated a fixed pose, so a leg
    // that started bent stayed bent all cycle and one that started straight
    // never folded.
    const left = TURN.map((t) => { const p = climbingPose(BASE, t); return extension(p.hipL, p.kneeL, p.footL); });
    const right = TURN.map((t) => { const p = climbingPose(BASE, t); return extension(p.hipR, p.kneeR, p.footR); });
    for (const leg of [left, right]) {
      expect(Math.max(...leg)).toBeGreaterThan(0.93);
      expect(Math.min(...leg)).toBeLessThan(0.8);
    }
  });

  it('gives both legs the same range', () => {
    // "The right leg doesn't go straight and the left leg doesn't bend as
    // much as the right" — the two must travel the same distance.
    const left = TURN.map((t) => { const p = climbingPose(BASE, t); return extension(p.hipL, p.kneeL, p.footL); });
    const right = TURN.map((t) => { const p = climbingPose(BASE, t); return extension(p.hipR, p.kneeR, p.footR); });
    expect(Math.max(...left)).toBeCloseTo(Math.max(...right), 6);
    expect(Math.min(...left)).toBeCloseTo(Math.min(...right), 6);
  });

  it('gives both arms the same range', () => {
    const left = TURN.map((t) => { const p = climbingPose(BASE, t); return extension(p.shoulderL, p.elbowL, p.handL); });
    const right = TURN.map((t) => { const p = climbingPose(BASE, t); return extension(p.shoulderR, p.elbowR, p.handR); });
    expect(Math.max(...left)).toBeCloseTo(Math.max(...right), 6);
    expect(Math.min(...left)).toBeCloseTo(Math.min(...right), 6);
  });

  it('moves opposite limbs together', () => {
    // Left hand with right foot. Same-side movement is a gait nobody has
    // ever climbed with, and it looks wrong before you can say why.
    for (const phase of TURN) {
      const p = climbingPose(BASE, phase);
      const handUp = p.shoulderL[1] - p.handL[1];
      const footUp = p.hipR[1] - p.footR[1];
      const otherHandUp = p.shoulderR[1] - p.handR[1];
      // When the left hand is the higher of the two, the right foot is the
      // higher of the two as well.
      if (Math.abs(handUp - otherHandUp) < 0.5) continue;
      const leftHandLeads = handUp > otherHandUp;
      const rightFootLeads = footUp > p.hipL[1] - p.footL[1];
      expect(leftHandLeads, `phase ${phase}`).toBe(rightFootLeads);
    }
  });

  it('breaks knees and elbows outward', () => {
    // A knee that hinges the other way is a horror film.
    for (const pose of Object.values(POSES)) {
      for (const phase of TURN) {
        const p = climbingPose(pose, phase);
        const centre = (p.hipL[0] + p.hipR[0]) / 2;
        expect(p.kneeL[0]).toBeLessThan(centre);
        expect(p.kneeR[0]).toBeGreaterThan(centre);
        expect(p.elbowL[0]).toBeLessThan(centre);
        expect(p.elbowR[0]).toBeGreaterThan(centre);
      }
    }
  });

  it('keeps the head above the hips and the hands above the head', () => {
    for (const pose of Object.values(POSES)) {
      for (const phase of TURN) {
        const p = climbingPose(pose, phase);
        expect(p.head[1]).toBeLessThan(p.hipL[1]);
        expect(p.handL[1]).toBeLessThan(p.shoulderL[1]);
        expect(p.handR[1]).toBeLessThan(p.shoulderR[1]);
      }
    }
  });

  it('keeps both feet below the hips', () => {
    for (const pose of Object.values(POSES)) {
      for (const phase of TURN) {
        const p = climbingPose(pose, phase);
        expect(p.footL[1]).toBeGreaterThan(p.hipL[1]);
        expect(p.footR[1]).toBeGreaterThan(p.hipR[1]);
      }
    }
  });

  it('stays inside the frame', () => {
    for (const pose of Object.values(POSES)) {
      for (const phase of TURN) {
        const p = climbingPose(pose, phase);
        for (const [joint, [x, y]] of Object.entries(p)) {
          expect(x, joint).toBeGreaterThan(-14);
          expect(x, joint).toBeLessThan(CLIMBER_VIEWBOX.width + 14);
          expect(y, joint).toBeGreaterThan(-14);
          expect(y, joint).toBeLessThan(CLIMBER_VIEWBOX.height + 14);
        }
      }
    }
  });

  it('handles a negative phase', () => {
    expect(() => climbingPose(BASE, -0.4)).not.toThrow();
    expect(climbingPose(BASE, -0.25)).toEqual(climbingPose(BASE, 0.75));
  });
});

// ── The standing figure (PLAN.md M209) ───────────────────────────────────

const STANCES = Object.entries(STANDING);

describe('the standing figure', () => {
  it('stands', () => {
    // Head over shoulders over hips over knees over feet, and the hands
    // below the shoulders rather than over the head. That last one is the
    // whole difference from the climbing table, where both hands are up.
    for (const [name, p] of STANCES) {
      expect(p.head[1], `${name} head`).toBeLessThan(p.shoulderL[1]);
      expect(p.shoulderL[1], `${name} shoulders`).toBeLessThan(p.hipL[1]);
      expect(p.hipL[1], `${name} hips`).toBeLessThan(p.kneeL[1]);
      expect(p.kneeL[1], `${name} knee left`).toBeLessThan(p.footL[1]);
      expect(p.kneeR[1], `${name} knee right`).toBeLessThan(p.footR[1]);
      expect(p.handL[1], `${name} hand left`).toBeGreaterThan(p.shoulderL[1]);
      expect(p.handR[1], `${name} hand right`).toBeGreaterThan(p.shoulderR[1]);
    }
  });

  it('keeps the left and right limbs the same length', () => {
    // A figure facing you is the one place a mismatch shows: the two sides
    // are side by side rather than one behind the other.
    for (const [name, p] of STANCES) {
      const leg = (h: Point, k: Point, f: Point) => dist(h, k) + dist(k, f);
      const arm = (s: Point, e: Point, h: Point) => dist(s, e) + dist(e, h);
      expect(leg(p.hipL, p.kneeL, p.footL), `${name} legs`).toBeCloseTo(
        leg(p.hipR, p.kneeR, p.footR),
        0,
      );
      expect(arm(p.shoulderL, p.elbowL, p.handL), `${name} arms`).toBeCloseTo(
        arm(p.shoulderR, p.elbowR, p.handR),
        0,
      );
    }
  });

  it('keeps every joint inside the frame', () => {
    for (const [name, pose] of STANCES) {
      for (const [joint, [x, y]] of Object.entries(pose)) {
        expect(x, `${name} ${joint} x`).toBeGreaterThanOrEqual(0);
        expect(x, `${name} ${joint} x`).toBeLessThanOrEqual(CLIMBER_VIEWBOX.width);
        expect(y, `${name} ${joint} y`).toBeGreaterThanOrEqual(0);
        expect(y, `${name} ${joint} y`).toBeLessThanOrEqual(CLIMBER_VIEWBOX.height);
      }
    }
  });

  it('still reads vitality, which is the only reason there are three', () => {
    // The risk in turning the portrait around was freezing one stance and
    // silently dropping the one number the game reads from training. Head
    // height, shoulder width and stance width all fall together, so the
    // gradient survives at the size a profile picture is actually drawn.
    const head = (p: Joints) => p.head[1];
    const shoulders = (p: Joints) => p.shoulderR[0] - p.shoulderL[0];
    const stance = (p: Joints) => p.footR[0] - p.footL[0];
    //
    // Each step has a minimum size, because merely *ordered* is not the same
    // as visible: a stance two pixels narrower than the one before it is
    // under half a pixel at the size a profile picture is drawn, and a
    // mutation that flattened the steps to that passed an ordering check.
    const order = [STANDING.strong, STANDING.steady, STANDING.spent];
    for (const [i, p] of order.slice(1).entries()) {
      const before = order[i]!;
      expect(head(p) - head(before), `head ${i}`).toBeGreaterThanOrEqual(3);
      expect(shoulders(before) - shoulders(p), `shoulders ${i}`).toBeGreaterThanOrEqual(3);
      expect(stance(before) - stance(p), `stance ${i}`).toBeGreaterThanOrEqual(4);
    }
  });
});


// ── The drawn figure (PLAN.md M209, M225, M357) ─────────────────────────
//
// Everything below finds the parts of the figure by what they are, not by
// their size. Until M357 the chalk bag was "the rect 16 wide" and the head
// "the circle of radius 15", so redrawing the climber meant rewriting the
// rules about it too — and a rule rewritten alongside the picture it checks
// is a rule that can be rewritten to pass.

const COLORS = { ground: '#dddddd', surface: '#ffffff', accentGround: '#999999' };
const KITTED = deriveAvatar({ level: 90, vitality: 'worked', feet: 0 });
const LEVELS = [0, 8, 20, 40, 60, 90];
const FIGURES: AvatarFigure[] = ['male', 'female'];
const kitted = (figure: AvatarFigure, level = 90) =>
  deriveAvatar({ level, vitality: 'worked', feet: 0, figure });
const draw = (config: ReturnType<typeof deriveAvatar>, facing: 'front' | 'back') =>
  climberShapes(config, { colors: COLORS, facing });

/** The shapes of one part; by default without the shading and seams on it. */
const of = (shapes: Shape[], part: Part, withDetail = false) =>
  shapes.filter((s) => s.part === part && (withDetail || !s.detail));

/**
 * The points a shape is drawn through.
 *
 * For a path that is every coordinate in it — its corners and the control
 * points its curves bend toward — which is the outline near enough to say
 * what it covers. Relative commands are followed, so the rope's `q` lands
 * where the rope does.
 */
function points(shape: Shape): Point[] {
  switch (shape.kind) {
    case 'circle':
      return [[shape.cx - shape.r, shape.cy - shape.r], [shape.cx + shape.r, shape.cy + shape.r]];
    case 'ellipse':
      return [[shape.cx - shape.rx, shape.cy - shape.ry], [shape.cx + shape.rx, shape.cy + shape.ry]];
    case 'rect':
      return [[shape.x, shape.y], [shape.x + shape.w, shape.y + shape.h]];
    case 'polyline':
      return shape.points;
    case 'path': {
      const out: Point[] = [];
      let at: Point = [0, 0];
      for (const [, command, args] of shape.d.matchAll(/([MLQCZmlqcz])([^MLQCZmlqcz]*)/g)) {
        const nums = (args ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
        for (let i = 0; i + 1 < nums.length; i += 2) {
          const p: Point = command === command!.toLowerCase()
            ? [at[0] + nums[i]!, at[1] + nums[i + 1]!]
            : [nums[i]!, nums[i + 1]!];
          out.push(p);
          // Relative curves are relative to where the segment started, not
          // to their own control point.
          const last = command === 'q' ? i + 2 >= nums.length - 1 : command === 'c' ? i + 2 >= nums.length - 1 : true;
          if (last || command === command!.toUpperCase()) at = p;
        }
        expect(command, 'an arc, which is the flag M225 got wrong').not.toMatch(/[Aa]/);
      }
      return out;
    }
  }
}

function box(shapes: Shape[]) {
  const all = shapes.flatMap(points);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

const centreOf = (shapes: Shape[]): Point => {
  const b = box(shapes);
  return [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
};

/** Whether a point is inside a shape's outline (paths and polylines only). */
function covers(shape: Shape, [x, y]: Point): boolean {
  if (shape.kind !== 'path' || shape.fill === undefined) return false;
  const poly = points(shape);
  let inside = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i, i += 1) {
    const [xi, yi] = poly[i]!;
    const [xk, yk] = poly[k]!;
    if (yi > y !== yk > y && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) inside = !inside;
  }
  return inside;
}

/** How wide a filled outline is across one height. */
function widthAt(shape: Shape, y: number): number {
  const poly = points(shape);
  const xs: number[] = [];
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i, i += 1) {
    const [xi, yi] = poly[i]!;
    const [xk, yk] = poly[k]!;
    if (yi > y !== yk > y) xs.push(((xk - xi) * (y - yi)) / (yk - yi) + xi);
  }
  return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs);
}

describe('every shape', () => {
  it('says what it is part of', () => {
    for (const figure of FIGURES) {
      for (const level of LEVELS) {
        for (const facing of ['front', 'back'] as const) {
          const unnamed = draw(kitted(figure, level), facing).filter((s) => s.part === undefined);
          expect(unnamed, `${figure} L${level} ${facing}`).toEqual([]);
        }
      }
    }
  });

  it('is drawn without a single arc', () => {
    // `points` refuses one. M225 drew the back of the head with an arc whose
    // flag picked the other of its two possible circles, and shipped a
    // moustache; the outlines here are curves through midpoints instead, and
    // have no flag to get wrong.
    for (const facing of ['front', 'back'] as const) {
      for (const shape of draw(KITTED, facing)) points(shape);
    }
  });

  it('is wound one way round, so shapes of one colour can be drawn as one', () => {
    // The game draws neighbouring shapes of one colour as a single path. Under
    // the nonzero rule two outlines wound opposite ways cancel where they
    // overlap, and a thigh and a calf would leave a hole at the knee.
    for (const facing of ['front', 'back'] as const) {
      for (const shape of draw(KITTED, facing)) {
        if (shape.kind !== 'path' || shape.fill === undefined || !shape.d.includes(' Q ')) continue;
        const poly = points(shape);
        let area = 0;
        for (let i = 0; i < poly.length; i += 1) {
          const [x0, y0] = poly[i]!;
          const [x1, y1] = poly[(i + 1) % poly.length]!;
          area += x0 * y1 - x1 * y0;
        }
        expect(area, `${shape.part} ${facing}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the two views', () => {
  const front = draw(KITTED, 'front');
  const back = draw(KITTED, 'back');

  it('takes the standing table in front and the climbing one behind', () => {
    expect(centreOf(of(front, 'head'))[1]).toBeCloseTo(STANDING.steady.head[1], 0);
    expect(centreOf(of(back, 'head'))[1]).toBeCloseTo(POSES.steady.head[1], 0);
  });

  it('puts a face on the front and none on the back of the head', () => {
    const head = centreOf(of(front, 'head'));
    const whites = of(front, 'eye').filter((s) => s.kind === 'ellipse' && s.fill === SCLERA);
    expect(whites).toHaveLength(2);
    for (const eye of whites) {
      if (eye.kind !== 'ellipse') throw new Error('an eye white is an ellipse');
      // Just below the middle of the head, so a helmet brim clears them.
      expect(eye.cy).toBeGreaterThan(head[1]);
      expect(eye.cy).toBeLessThan(head[1] + 8);
      expect(Math.abs(eye.cx - head[0])).toBeLessThan(10);
    }
    for (const part of ['eye', 'brow', 'mouth', 'face'] as const) {
      expect(of(back, part, true), part).toEqual([]);
      expect(of(front, part, true).length, part).toBeGreaterThan(0);
    }
  });

  it('keeps the eyes out from under the helmet brim', () => {
    const brim = box(of(front, 'brim'));
    for (const eye of of(front, 'eye').filter((s) => s.kind === 'ellipse')) {
      if (eye.kind !== 'ellipse') throw new Error('an eye white is an ellipse');
      expect(eye.cy - eye.ry).toBeGreaterThan(brim.bottom);
    }
  });

  it('stands the climber on a floor rather than on four holds', () => {
    expect(of(front, 'ground').filter((s) => s.kind === 'ellipse')).toHaveLength(1);
    expect(of(back, 'ground').filter((s) => s.kind === 'ellipse')).toHaveLength(4);
  });

  it('wears the pack on the back: straps in front, the pack itself behind', () => {
    // A pack drawn on the front of a climber is a pack worn on the chest.
    const { shoulderL, shoulderR } = STANDING.steady;
    for (const piece of of(front, 'pack')) {
      const b = box([piece]);
      expect(b.right <= shoulderL[0] || b.left >= shoulderR[0], 'a pack on the chest').toBe(true);
    }
    expect(of(front, 'pack')).toHaveLength(2);
    expect(of(front, 'strap').filter((s) => s.kind === 'polyline')).toHaveLength(2);
    const behind = box(of(back, 'pack'));
    expect(behind.right - behind.left).toBeGreaterThanOrEqual(30);
  });

  it('hangs one chalk bag: at the hip in front, at the small of the back behind', () => {
    // A bag centred on the spine is one you cannot see from the front, and
    // the hip bag replaces it rather than joining it.
    const hips = box(of(front, 'hips'));
    expect(of(front, 'chalk')).toHaveLength(1);
    expect(box(of(front, 'chalk')).left).toBeGreaterThanOrEqual(hips.right);
    const spine = (POSES.steady.hipL[0] + POSES.steady.hipR[0]) / 2;
    const bag = box(of(back, 'chalk'));
    expect(bag.left).toBeLessThan(spine);
    expect(bag.right).toBeGreaterThan(spine);
  });

  it('puts the harness on the thighs and nothing down the middle', () => {
    // Two leg loops facing you, one either side of the centre line, and none
    // behind: from the back the belt is the whole harness at game size.
    const loops = of(front, 'loop');
    expect(loops).toHaveLength(2);
    expect(of(back, 'loop')).toHaveLength(0);
    const centre = (STANDING.steady.hipL[0] + STANDING.steady.hipR[0]) / 2;
    expect(loops.map((s) => Math.sign(centreOf([s])[0] - centre)).sort()).toEqual([-1, 1]);
    expect(of(back, 'harness').length).toBeGreaterThan(0);
  });

  it('joins the head to the shoulders', () => {
    // Nothing drew the neck until M209 and the head floated over the collar.
    // In a plain shirt, because a jacket's collar and hood stand up round
    // the neck and would hide a neck that stopped short.
    for (const figure of FIGURES) {
      const plain = draw(kitted(figure, 0), 'front');
      const neck = box(of(plain, 'neck'));
      expect(neck.top, figure).toBeLessThan(box(of(plain, 'head')).bottom);
      expect(neck.bottom, figure).toBeGreaterThan(box(of(plain, 'torso')).top + 3);
    }
  });

  it('drops the rope off a hip rather than out of the middle', () => {
    const [start] = points(of(front, 'rope')[0]!);
    const { hipL, hipR } = STANDING.steady;
    const centre = (hipL[0] + hipR[0]) / 2;
    expect(Math.abs(start![0] - centre)).toBeGreaterThan((hipR[0] - hipL[0]) / 2);
    expect(start![1]).toBeGreaterThan(hipL[1]);
  });

  it('still lets the game drive the joints', () => {
    // The Ascent animates the figure, so its override has to beat the table.
    const driven = climbingPose(POSES.strong, 0.25);
    const shapes = climberShapes(KITTED, { colors: COLORS, facing: 'back', joints: driven });
    const head = centreOf(of(shapes, 'head'));
    expect(head[0]).toBeCloseTo(driven.head[0], 0);
    expect(head[1]).toBeCloseTo(driven.head[1], 0);
  });
});

describe('the eyes', () => {
  /**
   * A white with a dark iris on it, on every skin (PLAN.md M357).
   *
   * Until M357 an eye was one dot, dark or pale by whichever the skin could
   * show — and the pale dot the darker tones got read as two points of
   * light. A white and an iris need no choosing: one of the two always
   * stands off the skin, whichever skin it is.
   */
  it('are an eye on every skin tone the app offers', () => {
    for (const skin of SKIN_TONES) {
      expect(Math.max(contrast(SCLERA, skin), contrast(IRIS, skin)), skin).toBeGreaterThan(3);
    }
  });

  it('have an iris that stands off its white', () => {
    expect(contrast(SCLERA, IRIS)).toBeGreaterThan(7);
  });
});

describe('the face reads vitality, like the stance does', () => {
  const face = (vitality: 'fresh' | 'tired') =>
    draw(deriveAvatar({ level: 0, vitality, feet: 0 }), 'front');
  /** A curve's ends and its middle: `M a Q control b`. */
  const bend = (shape: Shape) => {
    const [a, control, b] = points(shape);
    return { a: a!, control: control!, b: b! };
  };

  it('smiles fresh and turns the mouth down spent', () => {
    const fresh = bend(of(face('fresh'), 'mouth', true)[0]!);
    const spent = bend(of(face('tired'), 'mouth', true)[0]!);
    // Canvas y grows downward: a smile's middle is below its corners.
    expect(fresh.control[1]).toBeGreaterThan(Math.max(fresh.a[1], fresh.b[1]));
    expect(spent.control[1]).toBeLessThan(Math.min(spent.a[1], spent.b[1]));
  });

  it('drops the outer end of each brow when spent', () => {
    const head = centreOf(of(face('tired'), 'head'));
    for (const brow of of(face('tired'), 'brow', true)) {
      const { a, b } = bend(brow);
      const [inner, outer] = Math.abs(a[0] - head[0]) < Math.abs(b[0] - head[0]) ? [a, b] : [b, a];
      expect(outer[1]).toBeGreaterThan(inner[1]);
    }
  });

  it('draws heavy lids only on a spent climber', () => {
    const lids = (vitality: 'fresh' | 'tired') => of(face(vitality), 'eye', true).filter((s) => s.kind === 'path' && s.fill !== undefined);
    expect(lids('fresh')).toHaveLength(0);
    expect(lids('tired')).toHaveLength(2);
  });
});

describe('limbs, drawn as limbs (PLAN.md M357)', () => {
  it('follow their profile: as wide at each end as the profile says', () => {
    const profile: Profile = [[0, 8], [1, 4]];
    const outline = limbOutline([0, 0], [0, 60], profile);
    // The first side runs from the start to the end, one point per step.
    const side = outline.slice(0, 7);
    expect(Math.abs(side[0]![0])).toBeCloseTo(8, 6);
    expect(Math.abs(side[3]![0])).toBeCloseTo(6, 6);
    expect(Math.abs(side[6]![0])).toBeCloseTo(4, 6);
  });

  it('taper the way a body does: the thigh from the hip, the calf with a bulge', () => {
    // A tube of one width is a pictogram; these few changes of width are
    // most of what reads as a leg.
    const legs = of(draw(kitted('male', 0), 'front'), 'leg');
    const { hipL, kneeL, footL } = STANDING.steady;
    const thigh = legs[0]!;
    const calf = legs[1]!;
    expect(widthAt(thigh, hipL[1] + 6)).toBeGreaterThan(widthAt(thigh, kneeL[1] - 4) + 2);
    const span = footL[1] - kneeL[1];
    const bulge = widthAt(calf, kneeL[1] + span * 0.3);
    expect(bulge).toBeGreaterThan(widthAt(calf, kneeL[1] + 3));
    expect(bulge).toBeGreaterThan(widthAt(calf, footL[1] - 3) + 3);
  });

  it('are shaded down the side away from the light, whichever way they point', () => {
    const profile: Profile = [[0, 6], [1, 6]];
    // The light is upper left: a limb hanging down is shaded on its right…
    for (const [x] of limbShadow([50, 0], [50, 60], profile)) expect(x).toBeGreaterThanOrEqual(50);
    // …and one reaching out to the right is shaded underneath.
    for (const [, y] of limbShadow([0, 50], [60, 50], profile)) expect(y).toBeGreaterThanOrEqual(50);
    // Inside the limb either way.
    for (const [x] of limbShadow([50, 0], [50, 60], profile)) expect(x).toBeLessThanOrEqual(56);
  });

  it('end in a hand at the end of each arm, with the thumb toward the body', () => {
    // A relaxed thumb points in, and a gripping one wraps from the inside.
    for (const facing of ['front', 'back'] as const) {
      const table = facing === 'front' ? STANDING.steady : POSES.steady;
      const hands = of(draw(KITTED, facing), 'hand');
      expect(hands, facing).toHaveLength(2);
      const centre = (table.hipL[0] + table.hipR[0]) / 2;
      for (const [hand, joint] of [[hands[0]!, table.handL], [hands[1]!, table.handR]] as const) {
        const b = box([hand]);
        expect(b.left <= joint[0] && joint[0] <= b.right && b.top <= joint[1] && joint[1] <= b.bottom, `${facing} hand at its joint`).toBe(true);
        // Measured across the forearm, not across the screen: a hand on a
        // hip points down and in, and its fingers would count as thumb.
        const elbow = joint === table.handL ? table.elbowL : table.elbowR;
        const length = Math.hypot(joint[0] - elbow[0], joint[1] - elbow[1]);
        let across: Point = [-(joint[1] - elbow[1]) / length, (joint[0] - elbow[0]) / length];
        if (Math.sign(across[0]) !== Math.sign(centre - joint[0])) across = [-across[0], -across[1]];
        const reach = points(hand).map(([x, y]) => (x - joint[0]) * across[0] + (y - joint[1]) * across[1]);
        expect(Math.max(...reach), `${facing} thumb`).toBeGreaterThan(-Math.min(...reach));
      }
    }
  });
});

describe('the figure below the waist', () => {
  /**
   * The report was one sentence long and it was not about equipment: a
   * six-by-ten rounded rect hanging from the middle of the waist, into the
   * gap between two leg-shaped tubes that started at the hip joints with
   * nothing between them. Both halves of that are rules now — for every
   * shape, since M357, not only the rects.
   */
  it('draws nothing narrow on the centre line below the waist', () => {
    for (const figure of FIGURES) {
      for (const level of LEVELS) {
        const shapes = draw(kitted(figure, level), 'front').filter((s) => !s.detail);
        const { hipL, hipR } = STANDING.steady;
        const centre = (hipL[0] + hipR[0]) / 2;
        const span = hipR[0] - hipL[0];
        for (const shape of shapes) {
          const b = box([shape]);
          const onCentre = Math.abs((b.left + b.right) / 2 - centre) < 4;
          const narrow = b.right - b.left < span;
          const belowWaist = b.top >= hipL[1];
          expect(onCentre && narrow && belowWaist, `${figure} L${level}: a ${shape.part} at ${b.left},${b.top}`).toBe(false);
        }
      }
    }
  });

  it('closes the gap between the thighs with one block of hips', () => {
    for (const figure of FIGURES) {
      const hips = box(of(draw(kitted(figure, 0), 'front'), 'hips'));
      const { hipL, hipR } = STANDING.steady;
      expect(hips.left).toBeLessThanOrEqual(hipL[0]);
      expect(hips.right).toBeGreaterThanOrEqual(hipR[0]);
      expect(hips.top).toBeLessThanOrEqual(hipL[1]);
      expect(hips.bottom).toBeGreaterThan(hipL[1] + 16);
    }
  });

  it('stops the shorts above the knee, and only the jacket wears trousers', () => {
    const { kneeL, footL } = STANDING.steady;
    const at20 = draw(kitted('male', 20), 'front');
    expect(of(at20, 'shorts')).toHaveLength(2);
    for (const leg of of(at20, 'shorts')) expect(box([leg]).bottom).toBeLessThan(kneeL[1]);
    expect(of(at20, 'trousers')).toHaveLength(0);
    const at90 = draw(kitted('male', 90), 'front');
    expect(of(at90, 'shorts')).toHaveLength(0);
    expect(box(of(at90, 'trousers')).bottom).toBeGreaterThanOrEqual(footL[1]);
    // And the leg is skin underneath either one, rather than the clothing
    // with skin painted back over part of it.
    expect(of(at90, 'leg').every((s) => s.kind === 'path' && s.fill === DEFAULT_PALETTE.skin)).toBe(true);
    expect(of(at90, 'leg')).toHaveLength(4);
  });

  it('hangs the chalk bag beside the hips rather than on a thigh', () => {
    for (const figure of FIGURES) {
      const shapes = draw(kitted(figure, 20), 'front');
      expect(box(of(shapes, 'chalk')).left, figure).toBeGreaterThanOrEqual(box(of(shapes, 'hips')).right);
    }
  });
});

describe('the two builds', () => {
  /**
   * 180 viewBox units are drawn at 96 pixels on a profile card, so one unit
   * is about half a pixel. A difference smaller than a few units is a
   * setting that does nothing, which is worse than not offering it.
   */
  const width = (figure: AvatarFigure, part: Part) => {
    const b = box(of(draw(kitted(figure, 0), 'front'), part));
    return b.right - b.left;
  };

  it('gives one broader shoulders and the other broader hips', () => {
    expect(width('male', 'torso')).toBeGreaterThan(width('female', 'torso'));
    expect(width('female', 'hips')).toBeGreaterThan(width('male', 'hips'));
  });

  it('makes both differences big enough to see at the size this is drawn', () => {
    expect(width('male', 'torso') - width('female', 'torso')).toBeGreaterThanOrEqual(4);
    expect(BUILDS.female.hip - BUILDS.male.hip).toBeGreaterThanOrEqual(2);
  });

  it('shares one skeleton, so the build cannot move a joint', () => {
    // The posture is the one number the game reads from training. A build is
    // paint; it must not reach the vitality gradient.
    for (const level of [0, 40, 90]) {
      const shoes = (figure: AvatarFigure) => of(draw(kitted(figure, level), 'front'), 'shoe', true);
      expect(shoes('female')).toEqual(shoes('male'));
    }
  });
});

describe('hair', () => {
  const hairOf = (figure: AvatarFigure, facing: 'front' | 'back') => of(draw(kitted(figure, 0), facing), 'hair');

  it('puts some on every head, in both views', () => {
    // Hair is what makes the choice of build legible, and a bald climber on
    // the wall would be a different person from the one on the profile.
    for (const figure of FIGURES) {
      for (const facing of ['front', 'back'] as const) {
        expect(hairOf(figure, facing).length, `${figure} ${facing}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives only one build hair past the jaw', () => {
    const chin = (figure: AvatarFigure) => box(of(draw(kitted(figure, 0), 'front'), 'head')).bottom;
    expect(box(hairOf('male', 'front')).bottom).toBeLessThan(chin('male'));
    expect(box(hairOf('female', 'front')).bottom).toBeGreaterThan(chin('female') + 10);
  });

  it('keeps the face clear: nothing in front of it covers the eyes, the nose or the mouth', () => {
    // M225's first long hair was one block behind the head, and everything
    // of it below the chin showed across the jaw: a full beard.
    for (const figure of FIGURES) {
      for (const level of [0, 40]) {
        const shapes = draw(kitted(figure, level), 'front');
        const head = shapes.findIndex((s) => s.part === 'head');
        const [hx, hy] = STANDING.steady.head;
        const face: Point[] = [[hx - 5.6, hy + 1.6], [hx + 5.6, hy + 1.6], [hx, hy + 6], [hx, hy + 11], [hx - 4, hy + 11], [hx + 4, hy + 11], [hx, hy + 14]];
        for (const shape of shapes.slice(head + 1)) {
          if (shape.part !== 'hair' && shape.part !== 'helmet' && shape.part !== 'brim') continue;
          for (const point of face) {
            expect(covers(shape, point), `${figure} L${level}: ${shape.part} over ${point}`).toBe(false);
          }
        }
      }
    }
  });

  it('covers the whole of the back of the head', () => {
    /**
     * There is no face back there to keep clear of, so hair from behind is
     * the whole head rather than a cap cut out of it — and drawn *over* the
     * head rather than under it. M225 cut a cap below the centre and shipped
     * a moustache, on the one view of the figure that has no face at all.
     */
    for (const figure of FIGURES) {
      const back = draw(kitted(figure, 0), 'back');
      const skull = back.findIndex((s) => s.part === 'head');
      const hair = back.findIndex((s, i) => i > skull && s.part === 'hair' && !s.detail);
      expect(skull, `${figure} has a head`).toBeGreaterThanOrEqual(0);
      expect(hair, `${figure} has hair behind`).toBeGreaterThan(skull);
      expect(box([back[hair]!]).top, `${figure} hair top`).toBeLessThanOrEqual(POSES.steady.head[1] - HEAD);
    }
  });

  it('stays visible against every skin tone the app offers', () => {
    // Hair the colour of a forehead is a bald climber, and the two tone
    // lists are picked independently — any pair has to work.
    for (const skin of SKIN_TONES) {
      const best = Math.max(...HAIR_TONES.map((hair) => contrast(hair, skin)));
      expect(best, skin).toBeGreaterThan(2);
    }
  });
});
