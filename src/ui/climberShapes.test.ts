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

describe('the climbing cycle', () => {
  it('changes nothing at the start of a turn', () => {
    expect(climbingPose(BASE, 0).handL).toEqual(BASE.handL);
    expect(climbingPose(BASE, 0).footR).toEqual(BASE.footR);
  });

  it('repeats every turn', () => {
    expect(climbingPose(BASE, 0.3)).toEqual(climbingPose(BASE, 1.3));
    expect(climbingPose(BASE, 0.75)).toEqual(climbingPose(BASE, 2.75));
  });

  it('moves opposite limbs together', () => {
    // Left hand with right foot. Same-side movement is a gait nobody has
    // ever climbed with, and it looks wrong before you can say why.
    const quarter = climbingPose(BASE, 0.25);
    const handRose = quarter.handL[1] < BASE.handL[1];
    const rightFootRose = quarter.footR[1] < BASE.footR[1];
    const leftFootRose = quarter.footL[1] < BASE.footL[1];
    expect(handRose).toBe(true);
    expect(rightFootRose).toBe(true);
    expect(leftFootRose).toBe(false);
  });

  it('swaps sides half a turn later', () => {
    const a = climbingPose(BASE, 0.25);
    const b = climbingPose(BASE, 0.75);
    expect(a.handL[1] - BASE.handL[1]).toBeCloseTo(-(b.handL[1] - BASE.handL[1]), 6);
    expect(a.handR[1] - BASE.handR[1]).toBeCloseTo(-(b.handR[1] - BASE.handR[1]), 6);
  });

  it('swings a foot less than a hand', () => {
    // A foot travelling as far as a hand turns a climb into a march.
    const p = climbingPose(BASE, 0.25);
    const hand = Math.abs(p.handL[1] - BASE.handL[1]);
    const foot = Math.abs(p.footL[1] - BASE.footL[1]);
    expect(foot).toBeLessThan(hand);
    expect(foot).toBeGreaterThan(0);
  });

  it('never breaks a leg mid-cycle', () => {
    // The offsets are opposite on knee and foot, so this is exactly where a
    // knee could cross below its foot.
    for (const pose of Object.values(POSES)) {
      for (let phase = 0; phase < 1; phase += 0.02) {
        const p = climbingPose(pose, phase);
        expect(p.kneeL[1]).toBeLessThan(p.footL[1]);
        expect(p.kneeR[1]).toBeLessThan(p.footR[1]);
      }
    }
  });

  it('keeps the head above the hips', () => {
    for (const pose of Object.values(POSES)) {
      for (let phase = 0; phase < 1; phase += 0.05) {
        const p = climbingPose(pose, phase);
        expect(p.head[1]).toBeLessThan(p.hipL[1]);
      }
    }
  });

  it('moves everything only a little', () => {
    // The identity is the avatar: gear, colours and the posture that reads
    // vitality. Only motion is added.
    for (const pose of Object.values(POSES)) {
      for (let phase = 0; phase < 1; phase += 0.05) {
        const p = climbingPose(pose, phase);
        for (const key of Object.keys(pose) as (keyof typeof pose)[]) {
          expect(Math.abs(p[key][0] - pose[key][0]), `${key} x`).toBeLessThanOrEqual(4);
          expect(Math.abs(p[key][1] - pose[key][1]), `${key} y`).toBeLessThanOrEqual(17);
        }
      }
    }
  });

  it('handles a negative phase', () => {
    expect(() => climbingPose(BASE, -0.4)).not.toThrow();
    expect(climbingPose(BASE, -0.25).handL[1]).toBeGreaterThan(BASE.handL[1]);
  });
});
