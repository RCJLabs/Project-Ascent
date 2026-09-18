// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { MAX_EDGE } from '@/lib/image';
import type { Mark } from '@/lib/marks';
import { MarkPad, PhotoMarks } from './PhotoMarks';

/**
 * Drawing on a photo, driven (PLAN.md M265).
 *
 * `lib/marks.ts` has its own tests and `PhotoMarks`, `MarkPad`, `PhotoStrip`
 * and `PhotoTile` had none between them — so nothing had ever checked that
 * the geometry the library computes lands where a finger actually is.
 */

/** A photo the size this app stores them at, shown on a phone. */
const STORED = { width: MAX_EDGE, height: 900 };
const SHOWN = { width: 390, height: Math.round((390 * 900) / MAX_EDGE) };

/** One horizontal line across the middle of the image. */
const line = (): Mark => ({ kind: 'line', color: 'red', points: [0.2, 0.5, 0.8, 0.5] });

/**
 * The pad, with its box stubbed: jsdom has no layout, so a component that
 * reads `getBoundingClientRect` reads zeroes and bails out of everything.
 */
function pad(marks: Mark[], onErase: (i: number) => void) {
  const view = render(
    <MarkPad
      src="blob:photo"
      alt="a boulder"
      marks={marks}
      width={STORED.width}
      height={STORED.height}
      tool="erase"
      color="red"
      onCommit={() => {}}
      onErase={onErase}
    />,
  );
  const surface = view.container.querySelector('[data-testid="mark-pad"]') as HTMLDivElement;
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: SHOWN.width, height: SHOWN.height,
    right: SHOWN.width, bottom: SHOWN.height, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  capturing(surface);
  return surface;
}

/**
 * One pointer event at a point on the surface, in screen pixels.
 *
 * Inside `act`, because the handlers read state the previous event set:
 * dispatched back to back without a flush, `move` still sees the `raw` that
 * `down` replaced and the draft never starts.
 */
function pointer(surface: HTMLDivElement, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true }) as PointerEvent & {
    clientX: number; clientY: number; pointerId: number;
  };
  Object.assign(event, { clientX: x, clientY: y, pointerId: 1 });
  act(() => {
    surface.dispatchEvent(event);
  });
}

/**
 * The pad, with `setPointerCapture` recorded.
 *
 * jsdom has no such method, so it has to be supplied either way — and
 * capturing the pointer is what the no-tool guard is really for. Nothing
 * else downstream shows a dropped guard: the draft expression and `up`
 * both re-check the tool, so a stroke begun with no tool in hand draws
 * nothing and commits nothing. What it does do is take the pointer off the
 * browser, which is how a photo stops scrolling under the finger.
 */
function capturing(surface: HTMLDivElement): number[] {
  const captured: number[] = [];
  (surface as unknown as { setPointerCapture: (id: number) => void }).setPointerCapture = (id) => {
    captured.push(id);
  };
  return captured;
}

/** A tap `offBy` screen pixels below the line, in the middle of it. */
function tapNear(surface: HTMLDivElement, offBy: number) {
  pointer(surface, 'pointerdown', SHOWN.width * 0.5, SHOWN.height * 0.5 + offBy);
}

/** How many strokes the drawing is showing — halo and ink, so two a mark. */
const drawn = (container: HTMLElement) => container.querySelectorAll('svg path').length;

describe('erasing a mark with a finger', () => {
  it('is a fixture at the size this app stores photos', () => {
    // The defect only shows on a photo bigger than its box, which is every
    // photo: `prepareImage` allows 1600 on the long edge.
    expect(STORED.width).toBe(1600);
    expect(STORED.width / SHOWN.width).toBeGreaterThan(4);
  });

  it('takes a tap twenty screen pixels off the line', () => {
    // Twenty pixels is a finger missing slightly. In image pixels that is
    // over eighty — where the old tolerance was forty-eight, so this tap
    // used to do nothing at all.
    const erased: number[] = [];
    const surface = pad([line()], (i) => erased.push(i));
    tapNear(surface, 20);
    expect(erased).toEqual([0]);
    cleanup();
  });

  it('leaves a tap far from any mark alone', () => {
    const erased: number[] = [];
    const surface = pad([line()], (i) => erased.push(i));
    tapNear(surface, 60);
    expect(erased).toEqual([]);
    cleanup();
  });

  it('keeps the same reach on a photo stored at a quarter the size', () => {
    // The point of the change: the tolerance follows the hand, not the
    // file. A small photo shown at the same width used to get almost three
    // times the reach.
    const erased: number[] = [];
    const view = render(
      <MarkPad
        src="blob:photo"
        alt="a boulder"
        marks={[line()]}
        width={400}
        height={225}
        tool="erase"
        color="red"
        onCommit={() => {}}
        onErase={(i) => erased.push(i)}
      />,
    );
    const surface = view.container.querySelector('[data-testid="mark-pad"]') as HTMLDivElement;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: SHOWN.width, height: SHOWN.height,
      right: SHOWN.width, bottom: SHOWN.height, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    capturing(surface);
    tapNear(surface, 20);
    expect(erased, 'twenty screen pixels should reach on any photo').toEqual([0]);
    cleanup();
  });

  it('draws nothing and erases nothing when there is no tool in hand', () => {
    // A photo being looked at rather than drawn on. Nothing commits either
    // way — `makeMark` refuses a null tool — so the thing that shows a
    // dropped guard is the draft appearing under the finger.
    const erased: number[] = [];
    const view = render(
      <MarkPad
        src="blob:photo" alt="a boulder" marks={[line()]}
        width={STORED.width} height={STORED.height}
        tool={null} color="red"
        onCommit={() => {}} onErase={(i) => erased.push(i)}
      />,
    );
    const surface = view.container.querySelector('[data-testid="mark-pad"]') as HTMLDivElement;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: SHOWN.width, height: SHOWN.height,
      right: SHOWN.width, bottom: SHOWN.height, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const captured = capturing(surface);

    expect(drawn(view.container), 'one line is a halo and an ink stroke').toBe(2);
    pointer(surface, 'pointerdown', 40, 40);
    pointer(surface, 'pointermove', 200, 120);
    expect(drawn(view.container), 'a drag with no tool drew something').toBe(2);
    expect(erased).toEqual([]);
    // The one thing a dropped guard would actually do: take the pointer off
    // the browser, so the photo stops scrolling under the finger.
    expect(captured, 'a photo being looked at kept the pointer').toEqual([]);
    cleanup();
  });

  it('does draw a draft once a tool is in hand, so the check above means something', () => {
    // The control: without this, the test above passes on a pad that never
    // draws anything at all.
    const view = render(
      <MarkPad
        src="blob:photo" alt="a boulder" marks={[line()]}
        width={STORED.width} height={STORED.height}
        tool="line" color="red"
        onCommit={() => {}} onErase={() => {}}
      />,
    );
    const surface = view.container.querySelector('[data-testid="mark-pad"]') as HTMLDivElement;
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: SHOWN.width, height: SHOWN.height,
      right: SHOWN.width, bottom: SHOWN.height, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    const captured = capturing(surface);

    pointer(surface, 'pointerdown', 40, 40);
    pointer(surface, 'pointermove', 200, 120);
    expect(drawn(view.container)).toBe(4);
    expect(captured, 'a tool in hand takes the pointer').toEqual([1]);
    cleanup();
  });
});

describe('what the drawing says it is', () => {
  it('describes the marks for a reader who cannot see them', () => {
    const view = render(
      <MarkPad
        src="blob:photo" alt="a boulder"
        marks={[line(), { kind: 'circle', color: 'cyan', points: [0.5, 0.5, 0.6, 0.5] }]}
        width={STORED.width} height={STORED.height}
        tool={null} color="red"
        onCommit={() => {}} onErase={() => {}}
      />,
    );
    expect(view.container.querySelector('.sr-only')?.textContent).toBe('1 circle, 1 line');
    cleanup();
  });

  it('draws every mark twice, halo under ink, and hides the svg from readers', () => {
    const view = render(
      <PhotoMarks marks={[line()]} width={STORED.width} height={STORED.height} />,
    );
    const svg = view.container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${STORED.width} ${STORED.height}`);
    expect(svg.querySelectorAll('path')).toHaveLength(2);
    cleanup();
  });

  it('draws the stroke in screen pixels rather than image pixels', () => {
    // The rule the erase tolerance was missing, on the constant that has
    // always had it.
    const view = render(
      <PhotoMarks marks={[line()]} width={STORED.width} height={STORED.height} />,
    );
    for (const path of view.container.querySelectorAll('path')) {
      expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    }
    cleanup();
  });
});
