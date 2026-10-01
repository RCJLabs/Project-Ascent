/**
 * The layered climber (PLAN.md §9.1, decided: layered SVG).
 *
 * The geometry lives in `climberShapes` so the share-card builder can draw
 * the same figure without React. This component is only the renderer.
 *
 * Facing you, always. This is the portrait — a character sheet showing the
 * back of someone's head is a climber walking away — and the Ascent is the
 * one place the figure turns around.
 */

import type { AvatarConfig } from '@/engine/avatar';
import { CLIMBER_VIEWBOX, climberShapes, type Shape } from './climberShapes';

/** In-app colours come from the theme; the card passes concrete values. */
const THEME_COLORS = {
  ground: 'var(--color-sunken)',
  surface: 'var(--color-surface)',
  accentGround: 'var(--color-line)',
};

function Piece({ shape }: { shape: Shape }) {
  // What the shape is part of, for anyone reading the drawn figure — the
  // tests ask for the eyes and the head by name (PLAN.md M357).
  const part = shape.part ? { 'data-part': shape.part } : {};
  switch (shape.kind) {
    case 'circle':
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} {...part} />;
    case 'ellipse':
      return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={shape.fill} {...part} />;
    case 'rect':
      return (
        <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} fill={shape.fill} {...part} />
      );
    case 'path':
      return (
        <path
          d={shape.d}
          fill={shape.fill ?? 'none'}
          {...part}
          {...(shape.stroke
            ? {
                stroke: shape.stroke,
                strokeWidth: shape.width ?? 2,
                strokeLinecap: 'round' as const,
                strokeLinejoin: 'round' as const,
                ...(shape.dash ? { strokeDasharray: shape.dash.join(' ') } : {}),
              }
            : {})}
        />
      );
    case 'polyline':
      return (
        <polyline
          points={shape.points.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke={shape.stroke}
          strokeWidth={shape.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...part}
        />
      );
  }
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
  const shapes = climberShapes(config, { showGround, colors: THEME_COLORS, facing: 'front' });
  return (
    <svg
      viewBox={`0 0 ${CLIMBER_VIEWBOX.width} ${CLIMBER_VIEWBOX.height}`}
      className={className}
      role="img"
      aria-label={`Your climber: ${config.stage.name}`}
    >
      {shapes.map((shape, i) => (
        <Piece key={i} shape={shape} />
      ))}
    </svg>
  );
}
