// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getDb } from '@/db/db';
import { addMedia, listMedia, projectOwner } from '@/db/media';
import type { MediaRecord } from '@/db/schema';
import { MARK_HALO, MAX_MARKS, type Mark } from '@/lib/marks';
import { renderAt, reset } from '@/test/render';
import { MediaCard } from '@/features/media/MediaCard';

/**
 * Drawing the beta on a photo (PLAN.md M71).
 *
 * jsdom has no layout, so the surface is told what rectangle it occupies —
 * everything downstream of that is the component's own arithmetic, and it is
 * the arithmetic that decides whether a mark lands on the hold.
 */

const OWNER = projectOwner('p1');
const WIDTH = 400;
const HEIGHT = 200;
/** The photo's box on screen: offset, and half the stored size, so a test
 *  that quietly used pixels instead of ratios would put marks in the wrong
 *  place rather than passing. */
const BOX = { left: 100, top: 50, width: 200, height: 100 };

function stubUrls(): void {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
}

async function seed(marks?: Mark[]): Promise<MediaRecord> {
  await reset();
  const db = await getDb();
  await db.clear('media');
  return addMedia({
    ownerId: OWNER,
    blob: new Blob(['x'], { type: 'image/webp' }),
    type: 'image/webp',
    width: WIDTH,
    height: HEIGHT,
    ...(marks ? { marks } : {}),
  });
}

async function openPhoto(marks?: Mark[]): Promise<HTMLElement> {
  await seed(marks);
  renderAt('/', <MediaCard owner={OWNER} blurb="No photos yet" fullNote="Full" />);
  const thumb = await screen.findByRole('button', { name: /Open photo/ });
  fireEvent.click(thumb);
  const pad = await screen.findByTestId('mark-pad');
  pad.getBoundingClientRect = () => ({ ...BOX, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => '' });
  return pad;
}

/** A drag, in the photo's on-screen box, given as fractions of it. */
function drag(pad: HTMLElement, points: [number, number][]): void {
  const client = (p: [number, number]) => ({
    clientX: BOX.left + p[0] * BOX.width,
    clientY: BOX.top + p[1] * BOX.height,
    pointerId: 1,
  });
  fireEvent.pointerDown(pad, client(points[0]!));
  for (const point of points.slice(1)) fireEvent.pointerMove(pad, client(point));
  fireEvent.pointerUp(pad, client(points[points.length - 1]!));
}

const tool = (name: RegExp | string) => screen.getByRole('button', { name });

beforeEach(stubUrls);

describe('a photo you have not drawn on', () => {
  it('offers the tools and says what they are for', async () => {
    await openPhoto();
    expect(tool('Draw')).toBeTruthy();
    expect(tool('Arrow')).toBeTruthy();
    expect(tool('Circle a hold')).toBeTruthy();
    expect(screen.getByText(/draw the beta straight onto the photo/i)).toBeTruthy();
  });

  it('does not draw when no tool is up — the photo is still a photo', async () => {
    const pad = await openPhoto();
    drag(pad, [
      [0.1, 0.1],
      [0.9, 0.9],
    ]);
    await waitFor(async () => expect((await listMedia(OWNER))[0]?.marks).toBeUndefined());
    expect(pad.querySelectorAll('path').length).toBe(0);
  });
});

describe('drawing', () => {
  it('saves a stroke where it was drawn, in fractions of the photo', async () => {
    const pad = await openPhoto();
    fireEvent.click(tool('Draw'));
    drag(pad, [
      [0.25, 0.5],
      [0.5, 0.5],
      [0.75, 0.5],
    ]);

    const saved = await waitFor(async () => {
      const marks = (await listMedia(OWNER))[0]?.marks;
      expect(marks?.length).toBe(1);
      return marks![0]!;
    });
    expect(saved.kind).toBe('line');
    // Straight, so the middle point is dropped; the ends are where the
    // finger was, as a share of the box rather than of the stored pixels.
    expect(saved.points).toEqual([0.25, 0.5, 0.75, 0.5]);
  });

  it('draws it, twice — a halo under the colour, or it vanishes into the rock', async () => {
    const pad = await openPhoto();
    fireEvent.click(tool('Draw'));
    drag(pad, [
      [0.2, 0.2],
      [0.8, 0.8],
    ]);
    await waitFor(() => expect(pad.querySelectorAll('path').length).toBe(2));
    const strokes = [...pad.querySelectorAll('path')].map((p) => p.getAttribute('stroke'));
    expect(new Set(strokes).size).toBe(2);
    // Every halo before any ink, not halo-then-ink per mark: otherwise the
    // outline of the mark drawn second cuts a channel through the colour of
    // the one drawn first.
    expect(strokes[0]).toBe(MARK_HALO);
  });

  it('does not rebuild the photo under the pen', async () => {
    const pad = await openPhoto();
    const before = vi.mocked(URL.createObjectURL).mock.calls.length;
    fireEvent.click(tool('Draw'));
    drag(pad, [
      [0.2, 0.2],
      [0.8, 0.8],
    ]);
    await waitFor(async () => expect((await listMedia(OWNER))[0]?.marks?.length).toBe(1));
    // A new object URL means a new `src`, which means the browser reloads
    // the image — a flicker on every stroke.
    expect(vi.mocked(URL.createObjectURL).mock.calls.length).toBe(before);
  });

  it('puts a circle where the drag started, not where it ended', async () => {
    const pad = await openPhoto();
    fireEvent.click(tool('Circle a hold'));
    drag(pad, [
      [0.5, 0.5],
      [0.6, 0.5],
    ]);
    const circle = await waitFor(() => {
      const found = pad.querySelector('circle');
      expect(found).toBeTruthy();
      return found!;
    });
    // Centre in the middle of a 400×200 photo, radius a tenth of its width.
    expect(circle.getAttribute('cx')).toBe('200');
    expect(circle.getAttribute('cy')).toBe('100');
    expect(Number(circle.getAttribute('r'))).toBeCloseTo(40, 6);
  });

  it('keeps the colour you picked', async () => {
    const pad = await openPhoto();
    fireEvent.click(tool('Cyan'));
    fireEvent.click(tool('Draw'));
    drag(pad, [
      [0.2, 0.2],
      [0.8, 0.8],
    ]);
    await waitFor(async () => expect((await listMedia(OWNER))[0]?.marks?.[0]?.color).toBe('cyan'));
  });

  it('ignores a tap that never moved', async () => {
    const pad = await openPhoto();
    fireEvent.click(tool('Draw'));
    drag(pad, [
      [0.4, 0.4],
      [0.4, 0.4],
    ]);
    await waitFor(async () => expect((await listMedia(OWNER))[0]?.marks).toBeUndefined());
  });

  it('puts the tool down when you tap it again', async () => {
    const pad = await openPhoto();
    fireEvent.click(tool('Draw'));
    fireEvent.click(tool('Draw'));
    drag(pad, [
      [0.2, 0.2],
      [0.8, 0.8],
    ]);
    await waitFor(async () => expect((await listMedia(OWNER))[0]?.marks).toBeUndefined());
  });
});

describe('taking it back', () => {
  const two: Mark[] = [
    { kind: 'line', color: 'gold', points: [0, 0.5, 1, 0.5] },
    { kind: 'arrow', color: 'red', points: [0, 0.9, 1, 0.9] },
  ];

  it('undoes the last mark, leaving the rest', async () => {
    await openPhoto(two);
    fireEvent.click(tool('Undo the last mark'));
    await waitFor(async () => {
      const marks = (await listMedia(OWNER))[0]?.marks;
      expect(marks?.length).toBe(1);
      expect(marks![0]!.kind).toBe('line');
    });
  });

  it('erases the mark you tapped, not the one drawn last', async () => {
    const pad = await openPhoto(two);
    fireEvent.click(tool('Erase a mark'));
    // Half-way along the first mark, which sits at y = 0.5.
    drag(pad, [
      [0.5, 0.5],
      [0.5, 0.5],
    ]);
    await waitFor(async () => {
      const marks = (await listMedia(OWNER))[0]?.marks;
      expect(marks?.length).toBe(1);
      expect(marks![0]!.kind).toBe('arrow');
    });
  });

  it('clears everything, and leaves no empty bag behind', async () => {
    await openPhoto(two);
    fireEvent.click(tool('Clear'));
    await waitFor(async () => {
      const record = (await listMedia(OWNER))[0]!;
      expect('marks' in record).toBe(false);
    });
  });

  it('offers nothing to undo on a photo with nothing on it', async () => {
    await openPhoto();
    expect(tool('Undo the last mark').hasAttribute('disabled')).toBe(true);
    expect(tool('Clear').hasAttribute('disabled')).toBe(true);
  });
});

describe('the cap', () => {
  const many: Mark[] = Array.from({ length: MAX_MARKS }, (_, i) => ({
    kind: 'line',
    color: 'gold',
    points: [0, i / MAX_MARKS, 1, i / MAX_MARKS],
  }));

  it('stops the pens and says why, but still lets you erase', async () => {
    await openPhoto(many);
    expect(tool('Draw').hasAttribute('disabled')).toBe(true);
    expect(tool('Erase a mark').hasAttribute('disabled')).toBe(false);
    fireEvent.click(tool('Erase a mark'));
    expect(screen.getByText(new RegExp(`${MAX_MARKS} marks`))).toBeTruthy();
  });
});

describe('the grid', () => {
  it('says a photo is marked rather than drawing the marks on a cropped square', async () => {
    await seed([{ kind: 'circle', color: 'gold', points: [0.5, 0.5, 0.6, 0.5] }]);
    renderAt('/', <MediaCard owner={OWNER} blurb="No photos yet" fullNote="Full" />);
    expect(await screen.findByRole('button', { name: /Open photo — 1 circle/ })).toBeTruthy();
  });
});
