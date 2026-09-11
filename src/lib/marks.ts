/**
 * Beta drawn on a photo (PLAN.md M71).
 *
 * The proposal was "freehand and arrows on a canvas, saved as a second image
 * beside the first". That is how most apps do it and it is the wrong shape
 * for this one. A flattened copy costs a second 600KB blob and one of the
 * eight slots an owner gets; it cannot be undone, re-coloured, or partly
 * erased; and beta is the most revised thing a climber owns — the foot you
 * marked in March is wrong by May. So the marks are kept as **geometry, not
 * pixels**: a few hundred bytes on the photo's own record, editable forever,
 * and re-rendered crisp at whatever size the screen is.
 *
 * **Coordinates are normalised to 0..1 of the image box** so a mark survives
 * a re-encode at a different resolution and lands correctly on a thumbnail,
 * a viewer and a full-screen photo alike. They are *rendered* in the image's
 * own pixel space, though, and that distinction is load-bearing: a circle
 * drawn in normalised space on a 4:3 photo is an ellipse on screen, and an
 * arrowhead is skewed. Everything below that computes a shape takes the
 * image's width and height and works in those units.
 *
 * **Colours are ids, not hex.** A stored `#ffb300` freezes a palette
 * decision at the moment of drawing, the way the themes did before M61. It
 * also means an imported backup would be writing arbitrary text into an SVG
 * paint attribute; an id that falls back when unrecognised cannot.
 */

export type MarkKind = 'line' | 'arrow' | 'circle';
export type MarkColorId = 'gold' | 'red' | 'cyan' | 'white';

export interface Mark {
  kind: MarkKind;
  color: MarkColorId;
  /**
   * Flattened `x, y` pairs in 0..1 of the image box.
   *
   * `line` is a polyline of two or more points. `arrow` is exactly two: tail
   * then head. `circle` is exactly two: centre then a point on the rim, which
   * is the gesture you make when you circle a hold — start in the middle and
   * drag out.
   */
  points: number[];
}

/**
 * Ink that reads on rock.
 *
 * Rock is mid-grey to mid-brown in almost every photo anyone takes of it,
 * which is the worst possible backdrop: a mid-tone stroke disappears into
 * it. Every mark is drawn twice — a wider near-black halo, then the colour —
 * so the contrast never depends on what is underneath. These are the four
 * that survive that treatment and stay distinguishable from each other.
 */
export const MARK_COLORS: { id: MarkColorId; label: string; hex: string }[] = [
  { id: 'gold', label: 'Gold', hex: '#ffc233' },
  { id: 'red', label: 'Red', hex: '#ff5a4d' },
  { id: 'cyan', label: 'Cyan', hex: '#3fd8e8' },
  { id: 'white', label: 'White', hex: '#ffffff' },
];

/** The halo drawn under every mark. Near-black rather than black: a pure
 *  black edge on a dark photo reads as a hole rather than an outline. */
export const MARK_HALO = '#101014';

/** The colour a fresh drawing starts in, and the fallback for a stored mark
 *  whose colour this build does not recognise. */
export const DEFAULT_COLOR: MarkColorId = MARK_COLORS[0]!.id;

export function colorOf(id: MarkColorId | string): string {
  return (MARK_COLORS.find((c) => c.id === id) ?? MARK_COLORS[0]!).hex;
}

/** Per photo. Past this the picture is the annotation, not the climb. */
export const MAX_MARKS = 24;

/** Per freehand stroke, after simplifying. A finger drag on a phone emits
 *  several hundred points for a line the eye reads as four. */
export const MAX_POINTS = 120;

/** Decimal places kept. 0.001 of a 1600px edge is under two pixels — below
 *  what anyone can place by finger, and a third of the JSON of a raw float. */
export const PRECISION = 3;

/** How far a point may sit off the simplified line, in normalised units.
 *  0.004 is roughly six pixels on a 1600px edge. */
export const TOLERANCE = 0.004;

/** Clamped into the image and rounded. A drag that leaves the photo should
 *  stop at its edge, not store a mark nothing can ever display. */
export function quantise(n: number): number {
  const clamped = Math.min(1, Math.max(0, n));
  const factor = 10 ** PRECISION;
  return Math.round(clamped * factor) / factor;
}

/**
 * Ramer–Douglas–Peucker: keep the points that carry the shape.
 *
 * Chosen over "drop anything within Npx of the last point", which is
 * cheaper and worse — that thins straight runs and curves at the same rate,
 * so a long smooth arc loses its curvature while a stationary pause keeps
 * its jitter. This keeps whatever deviates and discards whatever the
 * straight line between its neighbours already says.
 */
function rdp(points: number[], tolerance: number): number[] {
  if (points.length <= 4) return points.slice();
  const last = points.length - 2;
  const [x1, y1] = [points[0]!, points[1]!];
  const [x2, y2] = [points[last]!, points[last + 1]!];

  let worst = 0;
  let index = 0;
  for (let i = 2; i < last; i += 2) {
    const d = pointToSegment(points[i]!, points[i + 1]!, x1, y1, x2, y2);
    if (d > worst) {
      worst = d;
      index = i;
    }
  }

  if (worst <= tolerance) return [x1, y1, x2, y2];
  // The split point belongs to both halves, so the tail drops its first.
  const head = rdp(points.slice(0, index + 2), tolerance);
  const tail = rdp(points.slice(index), tolerance);
  return [...head.slice(0, -2), ...tail];
}

/**
 * Simplified, and guaranteed to fit.
 *
 * The cap is enforced by loosening the tolerance rather than by truncating:
 * a sliced stroke is a stroke that stops halfway up the wall, which is a
 * worse lie than a coarser one that reaches the top.
 */
export function simplify(points: number[], tolerance = TOLERANCE, max = MAX_POINTS): number[] {
  if (max < 2) throw new Error('a stroke needs at least two points');
  let t = Math.max(tolerance, Number.EPSILON);
  let out = rdp(points, t);
  while (out.length / 2 > max) {
    t *= 2;
    out = rdp(points, t);
  }
  return out;
}

/** Perpendicular distance from a point to a segment — not to the infinite
 *  line, which reports a point beyond the end of a stroke as being on it. */
export function pointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** A drawn shape's points in the image's own pixel space. */
export function toPixels(mark: Mark, width: number, height: number): number[] {
  return mark.points.map((n, i) => n * (i % 2 === 0 ? width : height));
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** A circle mark as a centre and a radius, in pixel space. */
export function circleOf(mark: Mark, width: number, height: number): Circle {
  const [cx = 0, cy = 0, ex = 0, ey = 0] = toPixels(mark, width, height);
  return { cx, cy, r: Math.hypot(ex - cx, ey - cy) };
}

/**
 * The two wings of an arrowhead, in pixel space.
 *
 * The head is sized from the shaft so a short arrow does not end in a
 * barb wider than itself, and floored so a very short one is still
 * recognisably an arrow rather than a tick.
 */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): [number, number][] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const length = Math.min(size, Math.hypot(x2 - x1, y2 - y1) * 0.4);
  const spread = Math.PI / 7;
  return [angle - spread, angle + spread].map(
    (a): [number, number] => [x2 - length * Math.cos(a), y2 - length * Math.sin(a)],
  );
}

/** How far a point is from a mark, in pixel space. */
export function distanceTo(mark: Mark, px: number, py: number, width: number, height: number): number {
  const points = toPixels(mark, width, height);
  if (mark.kind === 'circle') {
    const { cx, cy, r } = circleOf(mark, width, height);
    // To the ring, not to the middle: a circle round a hold is empty in the
    // centre, and tapping the hold should not erase the ring around it.
    return Math.abs(Math.hypot(px - cx, py - cy) - r);
  }
  let best = Infinity;
  for (let i = 0; i + 3 < points.length; i += 2) {
    best = Math.min(best, pointToSegment(px, py, points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!));
  }
  // A one-point mark cannot happen through `makeMark`, but a hand-written
  // backup can carry one, and Infinity would make it uneraseable.
  return points.length === 2 ? Math.hypot(px - points[0]!, py - points[1]!) : best;
}

/**
 * The mark nearest a tap, or null when the tap missed everything.
 *
 * Searched newest first, so the mark drawn last — the one on top, and the
 * one most likely meant — wins a tie against an older one underneath it.
 */
export function nearestMark(
  marks: Mark[],
  px: number,
  py: number,
  width: number,
  height: number,
  tolerance: number,
): number | null {
  let index: number | null = null;
  let best = tolerance;
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    const d = distanceTo(marks[i]!, px, py, width, height);
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return index;
}

/**
 * The smallest move worth recording during a drag, in normalised units —
 * about five pixels on a 1600px edge.
 *
 * A pointer emits an event per frame whether the finger moved or not, and
 * simplification afterwards cannot undo the cost of having carried them: the
 * live preview re-runs on every one. Dropping them at the door bounds the
 * array a long drag builds and, incidentally, removes the jitter of a hand
 * resting still on the glass.
 */
export const MIN_STEP = 0.003;

/**
 * A point added to a drag in progress, or the same array back when the
 * finger has not moved far enough to say anything new.
 *
 * Returning the identical reference is deliberate: React bails out of the
 * re-render, so a stationary finger costs nothing at all.
 */
export function appendPoint(raw: number[], x: number, y: number, minStep = MIN_STEP): number[] {
  const n = raw.length;
  if (n >= 2 && Math.hypot(x - raw[n - 2]!, y - raw[n - 1]!) < minStep) return raw;
  return [...raw, quantise(x), quantise(y)];
}

/**
 * The shape under the finger, mid-drag.
 *
 * Deliberately *not* simplified. `makeMark` runs Douglas–Peucker over the
 * whole stroke, and doing that once per pointer event — on an array that is
 * still growing — is the sort of thing that makes a drawing tool lag behind
 * the hand. The saved mark is simplified; the preview only has to be true.
 */
export function draftMark(kind: MarkKind, color: MarkColorId, raw: number[]): Mark | null {
  if (raw.length < 4) return null;
  if (kind === 'line') return { kind, color, points: raw };
  const last = raw.length - 2;
  return { kind, color, points: [raw[0]!, raw[1]!, raw[last]!, raw[last + 1]!] };
}

/**
 * A finished mark, or null when the gesture was not one.
 *
 * A tap that never moved is a tap, not a stroke, and storing it leaves an
 * invisible speck on the photo that only the eraser can find.
 */
export function makeMark(kind: MarkKind, color: MarkColorId, raw: number[]): Mark | null {
  const points = raw.map(quantise);
  // Only that there is a point at all. Everything else — one point, or fifty
  // identical ones — is `moved`'s to reject, and a `< 4` here that looked
  // like it was rejecting short gestures turned out to change nothing: it
  // survived being loosened to `< 2` because `moved` had already caught
  // every case it claimed to be catching.
  if (points.length < 2) return null;
  const last = points.length - 2;
  const [x1, y1] = [points[0]!, points[1]!];
  const [x2, y2] = [points[last]!, points[last + 1]!];

  if (kind === 'line') {
    const simplified = simplify(points);
    // Simplify to two identical points and the stroke went nowhere.
    return moved(simplified) ? { kind, color, points: simplified } : null;
  }
  const ends = [x1, y1, x2, y2];
  return moved(ends) ? { kind, color, points: ends } : null;
}

/** Whether a shape covers any ground at all. */
function moved(points: number[]): boolean {
  const [x = 0, y = 0] = points;
  for (let i = 2; i < points.length; i += 2) {
    if (points[i] !== x || points[i + 1] !== y) return true;
  }
  return false;
}

/** Adding a mark, respecting the cap. Returns the list unchanged when full. */
export function addMark(marks: Mark[], mark: Mark): Mark[] {
  return marks.length >= MAX_MARKS ? marks : [...marks, mark];
}

const KIND_LABEL: Record<MarkKind, string> = { line: 'line', arrow: 'arrow', circle: 'circle' };

/**
 * What is on the photo, in words.
 *
 * The drawing is an SVG with no text in it, so this is the only thing a
 * screen reader can be told about it. Counting by kind rather than saying
 * "5 marks" because "two circles and three arrows" is the difference
 * between holds picked out and a sequence described.
 */
export function describeMarks(marks: Mark[]): string {
  if (marks.length === 0) return 'No marks';
  const parts: string[] = [];
  for (const kind of ['circle', 'arrow', 'line'] as MarkKind[]) {
    const n = marks.filter((m) => m.kind === kind).length;
    if (n > 0) parts.push(`${n} ${KIND_LABEL[kind]}${n === 1 ? '' : 's'}`);
  }
  return parts.join(', ');
}
