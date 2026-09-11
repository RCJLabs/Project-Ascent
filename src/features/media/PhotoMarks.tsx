import { useRef, useState } from 'react';
import {
  MARK_HALO,
  appendPoint,
  arrowHead,
  circleOf,
  colorOf,
  describeMarks,
  draftMark,
  makeMark,
  nearestMark,
  quantise,
  toPixels,
  type Mark,
  type MarkColorId,
  type MarkKind,
} from '@/lib/marks';

/**
 * Drawn beta, on the photo (PLAN.md M71).
 *
 * SVG rather than a canvas, which is the opposite of the choice the game
 * made in `features/ascent` — and for the opposite reason. That draws sixty
 * frames a second of moving geometry, where a canvas is the only thing fast
 * enough and the pixels are the output. This draws a dozen static shapes
 * that have to survive a re-render, scale to any screen, and be assertable
 * by a test. A canvas would put all of that behind an opaque bitmap and
 * make every check a screenshot comparison.
 *
 * The viewBox is the image's own pixel dimensions and the points arrive
 * normalised, so shapes are computed where a circle is round — see
 * lib/marks.ts on why that is not the same space they are stored in.
 */

/** Screen pixels, held constant by `vectorEffect` regardless of the photo's
 *  size on screen: a hairline on a 1600px photo shown 350px wide is not a
 *  line anyone can follow. */
const STROKE = 4;
const HALO = 8;
/** How near a tap has to land to erase something, in image pixels at the
 *  photo's stored size. Generous — this is a finger on a phone. */
const ERASE_WITHIN = 48;

export function PhotoMarks({
  marks,
  width,
  height,
  draft,
}: {
  marks: Mark[];
  width: number;
  height: number;
  /** The stroke in progress, drawn but not yet committed. */
  draft?: Mark | null;
}) {
  const all = draft ? [...marks, draft] : marks;
  const headSize = Math.max(width, height) * 0.05;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      {/* Every mark twice: the halo for all of them first, so a later mark's
          outline does not cut a channel through an earlier mark's colour. */}
      {[MARK_HALO, null].map((halo) => (
        <g key={halo ?? 'ink'} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {all.map((mark, i) => (
            <Shape
              key={i}
              mark={mark}
              width={width}
              height={height}
              headSize={headSize}
              stroke={halo ?? colorOf(mark.color)}
              strokeWidth={halo ? HALO : STROKE}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Shape({
  mark,
  width,
  height,
  headSize,
  stroke,
  strokeWidth,
}: {
  mark: Mark;
  width: number;
  height: number;
  headSize: number;
  stroke: string;
  strokeWidth: number;
}) {
  const shared = { stroke, strokeWidth, vectorEffect: 'non-scaling-stroke' as const };

  if (mark.kind === 'circle') {
    const { cx, cy, r } = circleOf(mark, width, height);
    return <circle cx={cx} cy={cy} r={r} {...shared} />;
  }

  const points = toPixels(mark, width, height);
  const path = points.reduce((d, n, i) => (i % 2 === 0 ? `${d}${i === 0 ? 'M' : 'L'}${n}` : `${d} ${n}`), '');
  if (mark.kind === 'line') return <path d={path} {...shared} />;

  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = points;
  const wings = arrowHead(x1, y1, x2, y2, headSize);
  return (
    <g {...shared}>
      <path d={path} />
      <path d={wings.map(([x, y]) => `M${x} ${y}L${x2} ${y2}`).join('')} />
    </g>
  );
}

/**
 * The photo, with the marks on it, and — when a tool is chosen — a surface
 * that draws.
 *
 * The wrapper carries the image's aspect ratio rather than measuring the
 * rendered `<img>`, because `object-contain` puts the picture somewhere
 * inside its box and an overlay aligned to the box is aligned to the letter-
 * boxing instead of the photo. Sizing the wrapper to the aspect makes the
 * two the same rectangle by construction, with no layout read at all.
 */
export function MarkPad({
  src,
  alt,
  marks,
  width,
  height,
  tool,
  color,
  onCommit,
  onErase,
  className = '',
}: {
  src: string;
  alt: string;
  marks: Mark[];
  width: number;
  height: number;
  /** null when the photo is only being looked at. */
  tool: MarkKind | 'erase' | null;
  color: MarkColorId;
  onCommit: (mark: Mark) => void;
  onErase: (index: number) => void;
  className?: string;
}) {
  const [raw, setRaw] = useState<number[] | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  function at(event: { clientX: number; clientY: number }): [number, number] | null {
    const box = surface.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height];
  }

  function down(event: React.PointerEvent<HTMLDivElement>) {
    if (!tool) return;
    const point = at(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'erase') {
      const hit = nearestMark(marks, point[0] * width, point[1] * height, width, height, ERASE_WITHIN);
      if (hit !== null) onErase(hit);
      return;
    }
    setRaw([quantise(point[0]), quantise(point[1])]);
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    if (!raw) return;
    const point = at(event);
    if (point) setRaw(appendPoint(raw, point[0], point[1]));
  }

  function up() {
    if (!raw) return;
    const mark = tool && tool !== 'erase' ? makeMark(tool, color, raw) : null;
    setRaw(null);
    if (mark) onCommit(mark);
  }

  // The draft follows the tool, so a circle is a circle while you drag it
  // rather than a squiggle that becomes one when you let go.
  const draft = raw && tool && tool !== 'erase' ? draftMark(tool, color, raw) : null;

  return (
    <div
      ref={surface}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ aspectRatio: `${width} / ${height}`, touchAction: tool ? 'none' : undefined }}
      className={`relative max-w-full max-h-full ${className}`}
      data-testid="mark-pad"
    >
      <img src={src} alt={alt} className="w-full h-full object-contain rounded-xl select-none" draggable={false} />
      <PhotoMarks marks={marks} width={width} height={height} draft={draft} />
      <span className="sr-only">{describeMarks(marks)}</span>
    </div>
  );
}
