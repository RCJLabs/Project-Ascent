/**
 * The layered climber (PLAN.md §9.1, decided: layered SVG).
 *
 * One geometry, painted in passes. Nine joints drive stroked polylines with
 * round caps — no traced path data — so a pose change is two coordinates and
 * a cosmetic is one colour. Layers paint back to front: legs, shoes, torso,
 * arms, head, gear, hands.
 */

import type { AvatarConfig, AvatarGround, AvatarPalette, AvatarPose } from '@/engine/avatar';

type Point = readonly [number, number];

interface Joints {
  head: Point; neck: Point;
  shoulderL: Point; shoulderR: Point;
  elbowL: Point; handL: Point;
  elbowR: Point; handR: Point;
  hipL: Point; hipR: Point;
  kneeL: Point; footL: Point;
  kneeR: Point; footR: Point;
}

const POSES: Record<AvatarPose, Joints> = {
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
    // The knee folds up and out, above the foot. A knee below the foot
    // reads as a broken leg — the first pass drew exactly that.
    kneeR: [150, 130], footR: [134, 160],
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

function mid(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function Limb({ points, width, color }: { points: Point[]; width: number; color: string }) {
  return (
    <polyline
      points={points.map((q) => q.join(',')).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Ground({ ground, joints }: { ground: AvatarGround; joints: Joints }) {
  if (ground === 'rock') {
    return (
      <path
        d="M 6 246 L 30 208 L 52 232 L 74 196 L 96 226 L 128 190 L 152 224 L 174 246 Z"
        fill="var(--color-sunken)"
      />
    );
  }
  if (ground === 'alpine') {
    return (
      <>
        <path
          d="M 4 246 L 34 176 L 56 210 L 88 148 L 118 200 L 146 168 L 176 246 Z"
          fill="var(--color-sunken)"
        />
        <path d="M 88 148 L 100 170 L 76 170 Z" fill="var(--color-line)" />
      </>
    );
  }
  // Gym: the holds the climber is actually on.
  const holds: [Point, number, number][] = [
    [[joints.handL[0], joints.handL[1] - 12], 13, 8],
    [[joints.handR[0], joints.handR[1] - 12], 13, 8],
    [[joints.footL[0], joints.footL[1] + 8], 11, 7],
    [[joints.footR[0], joints.footR[1] + 8], 11, 7],
  ];
  return (
    <>
      {holds.map(([[cx, cy], rx, ry], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="var(--color-sunken)" />
      ))}
    </>
  );
}

export function Avatar({
  config,
  className = '',
  showGround = true,
}: {
  config: AvatarConfig;
  className?: string;
  showGround?: boolean;
}) {
  const j = POSES[config.pose];
  const c: AvatarPalette = config.palette;
  const g = config.gear;

  return (
    <svg
      viewBox="0 0 180 250"
      className={className}
      role="img"
      aria-label={`Your climber: ${config.stage.name}`}
    >
      {showGround && <Ground ground={config.ground} joints={j} />}

      {/* Legs, then bare lower leg so shorts read as shorts. */}
      <Limb points={[j.hipL, j.kneeL, j.footL]} width={15} color={c.shorts} />
      <Limb points={[j.hipR, j.kneeR, j.footR]} width={15} color={c.shorts} />
      {!g.jacket && (
        <>
          <Limb points={[mid(j.kneeL, j.footL, 0.15), j.footL]} width={12} color={c.skin} />
          <Limb points={[mid(j.kneeR, j.footR, 0.15), j.footR]} width={12} color={c.skin} />
        </>
      )}

      <ellipse cx={j.footL[0]} cy={j.footL[1]} rx={11} ry={8} fill={c.shoes} />
      <ellipse cx={j.footR[0]} cy={j.footR[1]} rx={11} ry={8} fill={c.shoes} />

      {/* Torso */}
      <path
        d={`M ${j.shoulderL.join(' ')} L ${j.shoulderR.join(' ')} L ${j.hipR[0] + 3} ${j.hipR[1] + 4} L ${j.hipL[0] - 3} ${j.hipL[1] + 4} Z`}
        fill={c.top}
      />
      {g.jacket && (
        <>
          <path
            d={`M ${j.shoulderL[0] - 7} ${j.shoulderL[1] - 2} L ${j.shoulderR[0] + 7} ${j.shoulderR[1] - 2} L ${j.hipR[0] + 8} ${j.hipR[1] + 10} L ${j.hipL[0] - 8} ${j.hipL[1] + 10} Z`}
            fill={c.top}
          />
          <path d={`M ${j.neck[0] - 16} ${j.neck[1] - 2} q 16 -22 32 0 z`} fill={c.top} />
        </>
      )}

      {/* Arms, with sleeves over the upper arm */}
      <Limb points={[j.shoulderL, j.elbowL, j.handL]} width={12} color={c.skin} />
      <Limb points={[j.shoulderR, j.elbowR, j.handR]} width={12} color={c.skin} />
      <Limb points={[j.shoulderL, mid(j.shoulderL, j.elbowL, 0.55)]} width={13} color={c.top} />
      <Limb points={[j.shoulderR, mid(j.shoulderR, j.elbowR, 0.55)]} width={13} color={c.top} />

      <circle cx={j.head[0]} cy={j.head[1]} r={15} fill={c.skin} />

      {/* Gear */}
      {g.harness && (
        <rect
          x={j.hipL[0] - 8}
          y={j.hipL[1] - 4}
          width={j.hipR[0] - j.hipL[0] + 16}
          height={8}
          rx={4}
          fill={c.gear}
        />
      )}
      {g.chalk && (
        <>
          <rect x={j.head[0] - 11} y={j.hipL[1] + 4} width={22} height={24} rx={9} fill={c.gear} />
          <path
            d={`M ${j.head[0] - 11} ${j.hipL[1] + 12} h 22`}
            stroke="var(--color-surface)"
            strokeWidth={2.5}
            fill="none"
          />
        </>
      )}
      {g.rope && (
        <path
          d={`M ${j.head[0]} ${j.hipL[1]} q -34 40 -66 32`}
          stroke={c.gear}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {g.pack && (
        <>
          <rect x={j.head[0] - 17} y={j.neck[1] + 10} width={34} height={46} rx={10} fill={c.gear} />
          <rect x={j.head[0] - 12} y={j.neck[1] + 15} width={24} height={36} rx={7} fill={c.shorts} />
        </>
      )}
      {g.helmet && (
        <>
          <path
            d={`M ${j.head[0] - 17} ${j.head[1] - 1} a 17 17 0 0 1 34 0 z`}
            fill={c.gear}
          />
          <rect x={j.head[0] - 19} y={j.head[1] - 3} width={38} height={5} rx={2.5} fill={c.gear} />
        </>
      )}
      {g.axe && (
        <>
          <path
            d={`M ${j.handR[0] + 2} ${j.handR[1] - 8} l 4 44`}
            stroke={c.gear}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M ${j.handR[0] - 10} ${j.handR[1] - 10} q 16 -6 22 4`}
            stroke={c.gear}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}

      <circle cx={j.handL[0]} cy={j.handL[1]} r={7} fill={c.skin} />
      <circle cx={j.handR[0]} cy={j.handR[1]} r={7} fill={c.skin} />
    </svg>
  );
}
