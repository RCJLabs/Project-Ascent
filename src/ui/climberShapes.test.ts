import { describe, expect, it } from 'vitest';
import { SKIN_TONES, deriveAvatar } from '@/engine/avatar';
import { contrast } from './contrast';
import {
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

  it('gives the harness a belay loop only where one would show', () => {
    expect(rects(front).some((s) => s.w === 6 && s.h === 10)).toBe(true);
    expect(rects(back).some((s) => s.w === 6 && s.h === 10)).toBe(false);
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

  it('ties the rope into the belay loop', () => {
    // Not trailing off a waist you cannot see, which is where the back view
    // puts it and what a front view inherits if nothing checks.
    const loop = rects(front).find((s) => s.w === 6 && s.h === 10)!;
    const rope = front.find((s) => s.kind === 'path' && s.stroke === KITTED.palette.gear)!;
    if (rope.kind !== 'path') throw new Error('the rope is a path');
    const [, x, y] = /^M (-?[\d.]+) (-?[\d.]+)/.exec(rope.d)!;
    expect(Number(x)).toBe(loop.x + loop.w / 2);
    expect(Number(y)).toBeGreaterThanOrEqual(loop.y);
    expect(Number(y)).toBeLessThanOrEqual(loop.y + loop.h);
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
