import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, SKIN_TONES, deriveAvatar, type AvatarFigure } from '@/engine/avatar';
import { HAIR_TONES } from '@/engine/kits';
import { contrast } from './contrast';
import {
  BUILDS,
  CLIMBER_VIEWBOX,
  POSES,
  STANDING,
  climberShapes,
  climbingPose,
  eyeColor,
  type Joints,
  type Point,
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

const COLORS = { ground: '#dddddd', surface: '#ffffff', accentGround: '#999999' };
const KITTED = deriveAvatar({ level: 90, vitality: 'worked', feet: 0 });
const circles = (shapes: Shape[]) => shapes.filter((s) => s.kind === 'circle');
const rects = (shapes: Shape[]) => shapes.filter((s) => s.kind === 'rect');

describe('the two views', () => {
  const front = climberShapes(KITTED, { colors: COLORS, facing: 'front' });
  const back = climberShapes(KITTED, { colors: COLORS, facing: 'back' });

  it('takes the standing table in front and the climbing one behind', () => {
    const head = (shapes: Shape[]) => circles(shapes).find((s) => s.r === 15)!;
    expect(head(front).cy).toBe(STANDING.steady.head[1]);
    expect(head(back).cy).toBe(POSES.steady.head[1]);
  });

  it('puts eyes on the face and nothing on the back of the head', () => {
    // "No nose or mouth, just eyes" — two of them, below the middle of the
    // head so a helmet brim does not sit on top of them.
    const head = circles(front).find((s) => s.r === 15)!;
    const eyes = circles(front).filter((s) => s.r < 5);
    expect(eyes).toHaveLength(2);
    for (const eye of eyes) {
      expect(eye.cy).toBeGreaterThan(head.cy);
      expect(eye.cy).toBeLessThan(head.cy + 15);
      expect(Math.abs(eye.cx - head.cx)).toBeLessThan(15);
    }
    expect(eyes[0]!.cx).not.toBe(eyes[1]!.cx);
    expect(circles(back).filter((s) => s.r < 5)).toHaveLength(0);
  });

  it('keeps the eyes out from under the helmet brim', () => {
    // The brim is drawn after the head and would cover them. Level 40 is
    // where a helmet arrives, so this is the case that breaks.
    // By its corner radius, not its width: the harness belt is 38 wide too.
    const brim = rects(front).find((s) => s.rx === 2.5)!;
    for (const eye of circles(front).filter((s) => s.r < 5)) {
      expect(eye.cy - eye.r).toBeGreaterThan(brim.y + brim.h);
    }
  });

  it('stands the climber on a floor rather than on four holds', () => {
    const ground = front.filter((s) => s.kind === 'ellipse' && s.fill === COLORS.ground);
    expect(ground).toHaveLength(1);
    expect(back.filter((s) => s.kind === 'ellipse' && s.fill === COLORS.ground)).toHaveLength(4);
  });

  it('turns the pack into straps and the chalk bag onto a hip', () => {
    // A pack drawn on the front of a climber is a pack worn on the chest,
    // and a chalk bag centred on the spine is one you cannot see at all.
    const gear = KITTED.palette.gear;
    expect(rects(back).some((s) => s.w === 34)).toBe(true);
    expect(rects(front).some((s) => s.w === 34)).toBe(false);
    expect(front.filter((s) => s.kind === 'polyline' && s.stroke === gear)).toHaveLength(2);

    const waist = (STANDING.steady.hipL[0] + STANDING.steady.hipR[0]) / 2;
    const bag = rects(front).find((s) => s.w === 16)!;
    expect(bag.x).toBeGreaterThan(waist);
    expect(rects(back).find((s) => s.w === 22)!.x).toBeLessThan(POSES.steady.head[0]);
    expect(rects(back).some((s) => s.w === 38 && s.h === 5)).toBe(true);
  });

  it('puts the harness on the thighs and nothing down the middle', () => {
    // Two leg loops facing you, and none behind: from the back the belt is
    // the whole harness at the size the game draws this.
    const loops = rects(front).filter((s) => s.w === 20 && s.h === 6);
    expect(loops).toHaveLength(2);
    expect(rects(back).filter((s) => s.w === 20 && s.h === 6)).toHaveLength(0);
    // One either side of the centre line, which is the entire point.
    const centre = (STANDING.steady.hipL[0] + STANDING.steady.hipR[0]) / 2;
    const sides = loops.map((s) => Math.sign(s.x + s.w / 2 - centre)).sort();
    expect(sides).toEqual([-1, 1]);
  });

  it('joins the head to the shoulders', () => {
    // Nothing drew the `neck` joint until M209 and the head floated over the
    // collar. One skin-coloured limb starts inside the head — the arms all
    // start at a shoulder.
    const head = circles(front).find((s) => s.r === 15)!;
    const inHead = (p: readonly [number, number]) =>
      Math.hypot(p[0] - head.cx, p[1] - head.cy) < 15;
    const neck = front.filter(
      (s) => s.kind === 'polyline' && s.stroke === KITTED.palette.skin && inHead(s.points[0]!),
    );
    expect(neck).toHaveLength(1);
    const drawn = neck[0]!;
    if (drawn.kind !== 'polyline') throw new Error('the neck is a polyline');
    expect(drawn.points[1]![1]).toBeGreaterThan(STANDING.steady.shoulderL[1]);
  });

  it('shows the pack past the shoulders and nothing on the chest', () => {
    // The straps go over the front; the body of the pack is behind, and what
    // shows of it either side of the shoulders is the only part that says
    // pack rather than braces.
    const slivers = rects(front).filter((s) => s.w === 13);
    expect(slivers).toHaveLength(2);
    expect(Math.min(...slivers.map((s) => s.x + s.w))).toBeLessThanOrEqual(
      STANDING.steady.shoulderL[0],
    );
    expect(Math.max(...slivers.map((s) => s.x))).toBeGreaterThanOrEqual(
      STANDING.steady.shoulderR[0],
    );
  });

  it('hangs one chalk bag, not two', () => {
    // The hip bag replaces the spine bag rather than joining it.
    expect(rects(front).some((s) => s.w === 22)).toBe(false);
  });

  it('drops the rope off a hip rather than out of the middle', () => {
    // It used to be tied into the belay loop, which was the right detail and
    // the wrong place: the loop is gone and a rope leaving the centre line
    // is the same shape wearing a different name.
    const rope = front.find((s) => s.kind === 'path' && s.stroke === KITTED.palette.gear)!;
    if (rope.kind !== 'path') throw new Error('the rope is a path');
    const [, x, y] = /^M (-?[\d.]+) (-?[\d.]+)/.exec(rope.d)!;
    const { hipL, hipR } = STANDING.steady;
    const centre = (hipL[0] + hipR[0]) / 2;
    expect(Math.abs(Number(x) - centre)).toBeGreaterThan((hipR[0] - hipL[0]) / 2);
    expect(Number(y)).toBeGreaterThan(hipL[1]);
  });

  it('still lets the game drive the joints', () => {
    // The Ascent animates the figure, so its override has to beat the table.
    const driven = climbingPose(POSES.strong, 0.25);
    const shapes = climberShapes(KITTED, { colors: COLORS, facing: 'back', joints: driven });
    expect(circles(shapes).find((s) => s.r === 15)!.cy).toBeCloseTo(driven.head[1], 6);
  });
});

describe('the eyes', () => {
  it('picks whichever colour the skin tone can actually show', () => {
    // Six tones from #f2d3b8 to #4d2f1c. One fixed eye colour disappears at
    // one end of that range or the other.
    for (const skin of SKIN_TONES) {
      const chosen = eyeColor(skin);
      const other = chosen === '#14181d' ? '#f3f6f8' : '#14181d';
      expect(contrast(chosen, skin), skin).toBeGreaterThanOrEqual(contrast(other, skin));
    }
    expect(eyeColor('#f2d3b8')).toBe('#14181d');
    expect(eyeColor('#4d2f1c')).toBe('#f3f6f8');
  });

  it('stays legible on every tone the app offers', () => {
    for (const skin of SKIN_TONES) {
      expect(contrast(eyeColor(skin), skin), skin).toBeGreaterThan(3);
    }
  });
});

// ── The body under the kit (PLAN.md M225) ────────────────────────────────

const FIGURES: AvatarFigure[] = ['male', 'female'];
const kitted = (figure: AvatarFigure, level = 90) =>
  deriveAvatar({ level, vitality: 'worked', feet: 0, figure });

describe('the figure below the waist', () => {
  /**
   * The report was one sentence long and it was not about equipment: a
   * six-by-ten rounded rect hanging from the middle of the waist, into the
   * gap between two leg-shaped tubes that started at the hip joints with
   * nothing between them. Both halves of that are rules now.
   */
  it('draws nothing narrow on the centre line below the waist', () => {
    for (const figure of FIGURES) {
      for (const level of [0, 8, 20, 40, 60, 90]) {
        const config = kitted(figure, level);
        const shapes = climberShapes(config, { colors: COLORS, facing: 'front' });
        const { hipL, hipR } = STANDING.steady;
        const centre = (hipL[0] + hipR[0]) / 2;
        const span = hipR[0] - hipL[0];
        for (const shape of rects(shapes)) {
          // Wide things on the centre line are the hips and the waist belt,
          // and both of them are meant to be there. It is the narrow ones
          // that read as anatomy.
          const onCentre = Math.abs(shape.x + shape.w / 2 - centre) < 4;
          const narrow = shape.w < span;
          const belowWaist = shape.y >= hipL[1];
          expect(
            onCentre && narrow && belowWaist,
            `${figure} L${level}: a ${shape.w}×${shape.h} rect at ${shape.x},${shape.y}`,
          ).toBe(false);
        }
      }
    }
  });

  it('closes the gap between the thighs with one block of hips', () => {
    // Without this the background ran up between the legs to the shirt hem.
    // The block has to be at least as wide as the hips and reach from the
    // waist down past where the two legs have separated.
    for (const figure of FIGURES) {
      const shapes = climberShapes(kitted(figure, 0), { colors: COLORS, facing: 'front' });
      const { hipL, hipR } = STANDING.steady;
      const hips = rects(shapes).find((s) => s.fill === DEFAULT_PALETTE.shorts);
      expect(hips, `${figure} has hips`).toBeDefined();
      expect(hips!.x).toBeLessThanOrEqual(hipL[0]);
      expect(hips!.x + hips!.w).toBeGreaterThanOrEqual(hipR[0]);
      expect(hips!.y).toBeLessThanOrEqual(hipL[1]);
      expect(hips!.y + hips!.h).toBeGreaterThan(hipL[1] + 16);
    }
  });

  it('stops the shorts above the knee, and only the jacket wears trousers', () => {
    // They were drawn in the shorts colour from hip to ankle with skin
    // painted back over the shin, which put the hem past the knee: a figure
    // in shorts that read as baggy trousers.
    const shortsOf = (level: number) => {
      const shapes = climberShapes(kitted('male', level), { colors: COLORS, facing: 'front' });
      return shapes.filter((s) => s.kind === 'polyline' && s.stroke === DEFAULT_PALETTE.shorts);
    };
    const { hipL, kneeL, footL } = STANDING.steady;
    for (const leg of shortsOf(20)) {
      if (leg.kind !== 'polyline') throw new Error('a leg is a polyline');
      expect(leg.points).toHaveLength(2);
      expect(leg.points[1]![1]).toBeLessThan(kneeL[1]);
    }
    for (const leg of shortsOf(90)) {
      if (leg.kind !== 'polyline') throw new Error('a leg is a polyline');
      expect(leg.points.at(-1)![1]).toBeGreaterThanOrEqual(footL[1]);
    }
    // And the leg itself is skin underneath either one, rather than being
    // the clothing with skin painted back over part of it.
    const skin = climberShapes(kitted('male', 90), { colors: COLORS, facing: 'front' }).filter(
      (s) => s.kind === 'polyline' && s.stroke === DEFAULT_PALETTE.skin && s.points[0]?.[1] === hipL[1],
    );
    expect(skin).toHaveLength(2);
  });

  it('hangs the chalk bag beside the hips rather than on a thigh', () => {
    for (const figure of FIGURES) {
      const shapes = climberShapes(kitted(figure, 20), { colors: COLORS, facing: 'front' });
      const hips = rects(shapes).find((s) => s.fill === DEFAULT_PALETTE.shorts)!;
      const bag = rects(shapes).find((s) => s.w === 16 && s.h === 19)!;
      expect(bag.x, figure).toBeGreaterThanOrEqual(hips.x + hips.w);
    }
  });
});

describe('the two builds', () => {
  /**
   * 180 viewBox units are drawn at 96 pixels on a profile card, so one unit
   * is about half a pixel. A difference smaller than a few units is a
   * setting that does nothing, which is worse than not offering it.
   */
  const torso = (figure: AvatarFigure) => {
    const shapes = climberShapes(kitted(figure, 0), { colors: COLORS, facing: 'front' });
    const path = shapes.find((s) => s.kind === 'path' && s.fill === DEFAULT_PALETTE.top)!;
    if (path.kind !== 'path') throw new Error('the torso is a path');
    const xs = [...path.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[1]));
    return { min: Math.min(...xs), max: Math.max(...xs) };
  };

  it('gives one broader shoulders and the other broader hips', () => {
    const male = torso('male');
    const female = torso('female');
    expect(male.max - male.min).toBeGreaterThan(female.max - female.min);

    const hipsOf = (figure: AvatarFigure) => {
      const shapes = climberShapes(kitted(figure, 0), { colors: COLORS, facing: 'front' });
      return rects(shapes).find((s) => s.fill === DEFAULT_PALETTE.shorts)!.w;
    };
    expect(hipsOf('female')).toBeGreaterThan(hipsOf('male'));
  });

  it('makes both differences big enough to see at the size this is drawn', () => {
    // Four units is roughly two pixels at 96 wide. Anything less and the
    // picker would be a control with no visible effect.
    const male = torso('male');
    const female = torso('female');
    expect(male.max - male.min - (female.max - female.min)).toBeGreaterThanOrEqual(4);
    expect(BUILDS.female.hip - BUILDS.male.hip).toBeGreaterThanOrEqual(2);
  });

  it('shares one skeleton, so the build cannot move a joint', () => {
    // The posture is the one number the game reads from training. A build is
    // paint; it must not reach the vitality gradient.
    for (const level of [0, 40, 90]) {
      const male = climberShapes(kitted('male', level), { colors: COLORS, facing: 'front' });
      const female = climberShapes(kitted('female', level), { colors: COLORS, facing: 'front' });
      const feet = (shapes: Shape[]) =>
        shapes.filter((s) => s.kind === 'ellipse' && s.fill === DEFAULT_PALETTE.shoes);
      expect(feet(female)).toEqual(feet(male));
    }
  });
});

describe('hair', () => {
  const hairOf = (figure: AvatarFigure, facing: 'front' | 'back') =>
    climberShapes(kitted(figure, 0), { colors: COLORS, facing }).filter(
      (s) => (s.kind === 'rect' || s.kind === 'path') && s.fill === DEFAULT_PALETTE.hair,
    );

  it('puts some on every head, in both views', () => {
    // The two builds are a few units apart in the shoulders and the hips,
    // which is a pixel or two. Hair is what makes the choice legible, and a
    // bald climber on the wall would be a different person from the one on
    // the profile.
    for (const figure of FIGURES) {
      for (const facing of ['front', 'back'] as const) {
        expect(hairOf(figure, facing).length, `${figure} ${facing}`).toBeGreaterThan(0);
      }
    }
  });

  it('gives only one build hair past the jaw', () => {
    expect(hairOf('male', 'front').filter((s) => s.kind === 'rect')).toHaveLength(0);
    expect(hairOf('female', 'front').filter((s) => s.kind === 'rect')).toHaveLength(2);
  });

  it('leaves a gap down the middle for the neck', () => {
    // One rounded rect behind the head was the first version, and everything
    // of it below the chin showed across the jaw: the figure came out with a
    // full beard.
    const head = STANDING.steady.head;
    const lobes = hairOf('female', 'front').filter((s) => s.kind === 'rect');
    for (const lobe of lobes) {
      if (lobe.kind !== 'rect') throw new Error('a lobe is a rect');
      const nearEdge = lobe.x + lobe.w / 2 < head[0] ? lobe.x + lobe.w : lobe.x;
      expect(Math.abs(nearEdge - head[0])).toBeGreaterThanOrEqual(5);
    }
  });

  it('keeps the fringe off the eyes', () => {
    for (const figure of FIGURES) {
      const shapes = climberShapes(kitted(figure, 0), { colors: COLORS, facing: 'front' });
      const fringe = shapes.find((s) => s.kind === 'path' && s.fill === DEFAULT_PALETTE.hair)!;
      if (fringe.kind !== 'path') throw new Error('the fringe is a path');
      const brow = Number(/^M [-\d.]+ (-?[\d.]+)/.exec(fringe.d)![1]);
      for (const eye of circles(shapes).filter((s) => s.r < 5)) {
        expect(eye.cy - eye.r, figure).toBeGreaterThan(brow);
      }
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
