// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getDb } from '@/db/db';
import { MAX_PER_OWNER, addMedia, listMedia, projectOwner, sessionOwner } from '@/db/media';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession, type Session } from '@/db/sessions';
import { today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';

/**
 * A photo, and where it belongs (PLAN.md M111b).
 *
 * `prepareImage` needs a canvas and `createImageBitmap`, neither of which
 * jsdom has, so it is stubbed — the engine that decides *where* a photo can
 * go is tested in `engine/attach.test.ts`, and what is left here is the
 * wiring: that the picture is prepared before the question is asked, that a
 * destination cannot be tapped until there is something to put in it, and
 * that the photo lands on the owner the climber actually chose.
 */
vi.mock('@/lib/image', async () => {
  const actual = await vi.importActual<typeof import('@/lib/image')>('@/lib/image');
  return {
    ...actual,
    prepareImage: vi.fn(async (file: File) => {
      if (!file.type.startsWith('image/')) throw new actual.ImageError('That is not an image.');
      return { blob: new Blob(['x'], { type: 'image/webp' }), type: 'image/webp', width: 8, height: 6 };
    }),
  };
});

const { AttachPage } = await import('@/features/media/AttachPage');

const TODAY = today();

function stubUrls(): void {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
}

const photo = (type = 'image/jpeg') => new File(['bytes'], 'crag.jpg', { type });

async function page(
  opts: { sessions?: Session[]; projects?: number; seedMedia?: () => Promise<void> } = {},
) {
  stubUrls();
  await reset();
  const db = await getDb();
  await db.clear('media');
  for (const s of opts.sessions ?? [newSession(TODAY, 0, { completed: true })]) {
    await putSession(s as never);
  }
  for (let i = 0; i < (opts.projects ?? 0); i++) {
    await putProject({ ...newProject({ name: `Project ${i}`, grade: 'V7', scale: 'V' }), id: `p${i}` });
  }
  // Before the mount, never after: the page reads the per-owner counts once
  // on mount, so media written afterwards needs a second render to show up —
  // and a second render leaves two file inputs in the document, which is how
  // the first version of the full-destination test picked the wrong one.
  await opts.seedMedia?.();
  await hydrate();
  const view = renderAt('/attach', <AttachPage />);
  await screen.findByText('Where it goes');
  return view;
}

const fileInput = (view: { container: HTMLElement }) =>
  view.container.querySelector('input[type="file"]') as HTMLInputElement;

const destinations = () => {
  const heading = screen.getByText('Where it goes');
  const box = heading.closest('section, div[class*="rounded"]') as HTMLElement;
  return within(box).queryAllByRole('button');
};

async function choose(view: { container: HTMLElement }, file = photo()): Promise<void> {
  fireEvent.change(fileInput(view), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText(/about to attach/i)).toBeTruthy());
}

describe('before a photo is chosen', () => {
  it('shows the destinations anyway', async () => {
    // Worth seeing what the options *are* before committing to a picture.
    await page();
    expect(destinations().length).toBeGreaterThan(0);
  });

  it('will not let one be tapped', async () => {
    await page();
    for (const button of destinations()) expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('says why they are not tappable', async () => {
    await page();
    expect(screen.getByText(/Choose a photo first/i)).toBeTruthy();
  });
});

describe('choosing the photo', () => {
  it('prepares it before asking where it goes', async () => {
    // The order the page is built on: a file the app cannot read says so
    // immediately, rather than after the climber has answered a question
    // about a photo that was never going to work.
    const view = await page();
    await choose(view);
    expect(screen.getByText(/Choose where it goes below/i)).toBeTruthy();
  });

  it('makes the destinations tappable', async () => {
    const view = await page();
    await choose(view);
    await waitFor(() => expect(destinations()[0]?.hasAttribute('disabled')).toBe(false));
  });

  it('says so when the file is not an image', async () => {
    const view = await page();
    fireEvent.change(fileInput(view), { target: { files: [photo('application/pdf')] } });
    expect(await screen.findByText(/not an image/i)).toBeTruthy();
  });

  it('leaves the destinations locked after a bad file', async () => {
    const view = await page();
    fireEvent.change(fileInput(view), { target: { files: [photo('application/pdf')] } });
    await screen.findByText(/not an image/i);
    for (const button of destinations()) expect(button.hasAttribute('disabled')).toBe(true);
  });

  /**
   * The reset that lets the same file be picked twice, read at the source.
   *
   * A first version asserted `input.value === ''` after picking, and
   * mutation showed it was vacuous: jsdom's `fireEvent.change` sets `.files`
   * and never `.value`, so the assertion passed whether or not the code
   * cleared anything. Staging the dirty state is not available either —
   * assigning a non-empty value to a file input throws, by design.
   *
   * So this reads the line instead, and says why. Without it a climber who
   * picks the wrong photo, comes back and picks the same one again gets no
   * change event and no response at all.
   */
  it('resets the file input after reading it', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/features/media/AttachPage.tsx', 'utf8');
    expect(source).toMatch(/if \(fileRef\.current\) fileRef\.current\.value = '';/);
  });
});

describe('where it lands', () => {
  it('attaches to the destination that was tapped', async () => {
    const view = await page({ sessions: [newSession(TODAY, 0, { completed: true })], projects: 1 });
    await choose(view);
    const project = destinations().find((b) => /Project 0/.test(b.textContent ?? ''))!;
    fireEvent.click(project);
    await waitFor(async () => expect(await listMedia(projectOwner('p0'))).toHaveLength(1));
    expect(await listMedia(sessionOwner(`${TODAY}#0`)), 'it landed on the session too').toHaveLength(0);
  });

  it('says where it went, and links there', async () => {
    const view = await page({ projects: 1 });
    await choose(view);
    fireEvent.click(destinations().find((b) => /Project 0/.test(b.textContent ?? ''))!);
    expect(await screen.findByText('Added')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open it/i })).toBeTruthy();
  });

  it('clears the photo so the next one starts fresh', async () => {
    // Otherwise a second tap files the same picture twice, which is the
    // obvious way to lose a camera roll into one session.
    const view = await page({ projects: 1 });
    await choose(view);
    fireEvent.click(destinations().find((b) => /Project 0/.test(b.textContent ?? ''))!);
    await screen.findByText('Added');
    expect(screen.queryByAltText(/about to attach/i)).toBeNull();
    for (const button of destinations()) expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('updates the count on the destination it landed on, in words', async () => {
    // "1 photo", not "1". The browser showed a bare number running into the
    // grade beside it — "The Nose · V7" and "1" reading as V71 — and a
    // count with no unit is one a climber has to guess at anyway.
    const view = await page({ projects: 1 });
    await choose(view);
    fireEvent.click(destinations().find((b) => /Project 0/.test(b.textContent ?? ''))!);
    await screen.findByText('Added');
    await waitFor(() =>
      expect(destinations().find((b) => /Project 0/.test(b.textContent ?? ''))?.textContent).toMatch(
        /1 photo\b/,
      ),
    );
  });

  it('pluralises the count', async () => {
    const view = await page({
      projects: 1,
      seedMedia: async () => {
        await addMedia({
          ownerId: projectOwner('p0'),
          blob: new Blob(['x'], { type: 'image/webp' }),
          type: 'image/webp',
          width: 8,
          height: 6,
        });
      },
    });
    await choose(view);
    fireEvent.click(destinations().find((b) => /Project 0/.test(b.textContent ?? ''))!);
    await screen.findByText('Added');
    await waitFor(() =>
      expect(destinations().find((b) => /Project 0/.test(b.textContent ?? ''))?.textContent).toMatch(
        /2 photos/,
      ),
    );
  });
});

describe('a destination that is full', () => {
  const filled = () =>
    page({
      projects: 1,
      seedMedia: async () => {
        for (let i = 0; i < MAX_PER_OWNER; i++) {
          await addMedia({
            ownerId: projectOwner('p0'),
            blob: new Blob(['x'], { type: 'image/webp' }),
            type: 'image/webp',
            width: 8,
            height: 6,
          });
        }
      },
    });

  it('says so rather than disappearing', async () => {
    const view = await filled();
    await choose(view);
    const project = destinations().find((b) => /Project 0/.test(b.textContent ?? ''));
    expect(project, 'the full project vanished instead of being marked').toBeTruthy();
    expect(project!.textContent).toMatch(/Full/);
  });

  it('will not let it be tapped', async () => {
    const view = await filled();
    await choose(view);
    const project = destinations().find((b) => /Project 0/.test(b.textContent ?? ''))!;
    expect(project.hasAttribute('disabled')).toBe(true);
  });

  it('leaves a destination with room tappable', async () => {
    // Without this the check above passes just as happily on a page where
    // everything is disabled because no photo was ever prepared.
    const view = await filled();
    await choose(view);
    const session = destinations().find((b) => /Today/.test(b.textContent ?? ''))!;
    expect(session.hasAttribute('disabled')).toBe(false);
  });
});

describe('a climber with nowhere to put it', () => {
  it('says what a photo attaches to', async () => {
    await page({ sessions: [] });
    expect(screen.getByText(/Photos attach to a session or a project/i)).toBeTruthy();
  });

  it('offers no destinations at all', async () => {
    await page({ sessions: [] });
    expect(destinations()).toEqual([]);
  });
});
