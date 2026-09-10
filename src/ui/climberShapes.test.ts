import { describe, expect, it } from 'vitest';
import { CLIMBER_VIEWBOX, POSES, climbingPose } from './climberShapes';

const BASE = POSES.reach;

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
    const { hipR, kneeR, footR, footL } = POSES.highstep;
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

const dist = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(b[0] - a[0], b[1] - a[1]);

/** How extended a limb is, 0 (folded) to 1 (straight). */
const extension = (
  anchor: readonly [number, number],
  joint: readonly [number, number],
  end: readonly [number, number],
) => dist(anchor, end) / (dist(anchor, joint) + dist(joint, end));

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
