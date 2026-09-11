// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { act, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { addMedia, projectOwner, sessionOwner } from '@/db/media';
import { newSession, putSession } from '@/db/sessions';
import { newProject, putProject } from '@/db/projects';
import { hydrate, renderAt, reset } from '@/test/render';
import { JournalPage } from '@/features/journal/JournalPage';
import { YearPage } from '@/features/career/YearPage';

/**
 * Pictures in the retrospectives (PLAN.md M92).
 *
 * `MediaCard` was mounted in two places, the logger and the project page.
 * The journal — "a reading of your own words" — showed the words and none
 * of what the climber photographed to go with them, and the year in review,
 * the one surface in the app meant to be looked at rather than read, had no
 * image in it at all.
 */

const YEAR = 2026;
const IN_YEAR = `${YEAR}-03-04`;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  URL.createObjectURL = vi.fn((blob: Blob) => `blob:${(blob as Blob & { _id?: string })._id ?? 'photo'}`);
  URL.revokeObjectURL = vi.fn();
});

async function photoOn(ownerId: string, caption?: string): Promise<void> {
  await addMedia({
    ownerId,
    blob: new Blob(['x'], { type: 'image/webp' }),
    type: 'image/webp',
    width: 400,
    height: 300,
    ...(caption ? { caption } : {}),
  });
}

/** A session with a note, which is what puts it in the journal. */
async function wroteAbout(date: string, notes: string) {
  const session = { ...newSession(date, 0, { completed: true }), notes };
  await putSession(session);
  return session;
}

describe('the journal', () => {
  it('shows the photos filed alongside the words', async () => {
    const session = await wroteAbout(IN_YEAR, 'Finally stuck the crux.');
    await photoOn(sessionOwner(session.id), 'The crux');
    await hydrate();

    renderAt('/journal', <JournalPage />);
    expect(await screen.findByText('Finally stuck the crux.')).toBeTruthy();
    expect(await screen.findByAltText('The crux')).toBeTruthy();
  });

  it('falls back to naming what the photo is on when it has no caption', async () => {
    const session = await wroteAbout(IN_YEAR, 'A note.');
    await photoOn(sessionOwner(session.id));
    await hydrate();

    renderAt('/journal', <JournalPage />);
    expect(await screen.findByAltText(/^Photo on /)).toBeTruthy();
  });

  it('shows nothing extra on an entry with no photos', async () => {
    await wroteAbout(IN_YEAR, 'A note with nothing filed beside it.');
    await hydrate();

    renderAt('/journal', <JournalPage />);
    await screen.findByText('A note with nothing filed beside it.');
    expect(screen.queryByRole('img')).toBeNull();
    // Not an empty strip either: it carries a top margin, so every note in
    // the journal would sit on eight pixels of nothing.
    expect(screen.queryByTestId('photo-strip')).toBeNull();
  });

  // Eight is the per-owner cap, and eight thumbnails would bury the note
  // they belong to.
  it('counts the overflow rather than showing every one', async () => {
    const session = await wroteAbout(IN_YEAR, 'A busy day.');
    for (let i = 0; i < 5; i++) await photoOn(sessionOwner(session.id), `Photo ${i}`);
    await hydrate();

    renderAt('/journal', <JournalPage />);
    await screen.findByText('A busy day.');
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('finds a project’s photos from a beta note', async () => {
    const project = newProject({ name: 'The Arete', grade: 'V6', scale: 'V' });
    await putProject({
      ...project,
      beta: [{ id: 'b1', text: 'Heel hook the arete.', date: IN_YEAR }],
    });
    await photoOn(projectOwner(project.id), 'The heel');
    await hydrate();

    renderAt('/journal', <JournalPage />);
    expect(await screen.findByText('Heel hook the arete.')).toBeTruthy();
    expect(await screen.findByAltText('The heel')).toBeTruthy();
  });
});

describe('the year in review', () => {
  async function yearWith(dates: string[]): Promise<void> {
    for (const [i, date] of dates.entries()) {
      const session = { ...newSession(date, i, { completed: true }), rpe: 7, durationMin: 90 };
      await putSession(session);
      await photoOn(sessionOwner(session.id), `On ${date}`);
    }
    await hydrate();
  }

  it('has pictures in it', async () => {
    await yearWith([IN_YEAR]);
    renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
    expect(await screen.findByText('The year in pictures')).toBeTruthy();
    expect(await screen.findByRole('link', { name: /On 2026-03-04/ })).toBeTruthy();
  });

  it('says nothing about pictures in a year with none', async () => {
    const session = { ...newSession(IN_YEAR, 0, { completed: true }), rpe: 7, durationMin: 90 };
    await putSession(session);
    await hydrate();

    renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
    await screen.findByText('Month by month');
    expect(screen.queryByText('The year in pictures')).toBeNull();
  });

  /** Twelve tiles, not four hundred. */
  it('caps the grid', async () => {
    await yearWith(Array.from({ length: 20 }, (_, i) => `${YEAR}-${String((i % 12) + 1).padStart(2, '0')}-05`));
    renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
    await screen.findByText('The year in pictures');
    await waitFor(() => expect(screen.getAllByRole('img').length).toBeGreaterThan(0));
    const grid = screen.getByText('The year in pictures').closest('section, div')!;
    expect(grid.querySelectorAll('a').length).toBe(12);
  });

  it('leaves last year’s photographs in last year', async () => {
    await yearWith([`${YEAR - 1}-06-01`]);
    renderAt(`/year/${YEAR}`, <YearPage params={{ year: String(YEAR) }} />);
    await waitFor(() => expect(screen.queryByText('The year in pictures')).toBeNull());
  });
});


/**
 * The lazy path, which jsdom silently skips (PLAN.md M92).
 *
 * With no `IntersectionObserver` the strip loads eagerly, so every test
 * above exercised the branch a phone never takes — and the branch a phone
 * *does* take was broken: the first draft set the observer up in an effect
 * keyed on a ref object, the journal's first render had no photos yet (the
 * owner index had not resolved), the effect saw a null ref and bailed, and
 * nothing ever re-ran it because a ref is not a dependency. Every strip on
 * the page stayed grey forever. Only a real browser found it, so this is
 * the stub that would have.
 */
describe('waiting until it is on screen', () => {
  /** A fake observer the test drives by hand. */
  function stubObserver(): { observed: Element[]; show: () => void } {
    const state: { observed: Element[]; fire: (() => void)[] } = { observed: [], fire: [] };
    class Fake {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(node: Element): void {
        state.observed.push(node);
        state.fire.push(() =>
          this.cb([{ isIntersecting: true, target: node } as IntersectionObserverEntry], this as never),
        );
      }
      disconnect(): void {}
      unobserve(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds: number[] = [];
    }
    vi.stubGlobal('IntersectionObserver', Fake as never);
    return {
      observed: state.observed,
      show: () => act(() => state.fire.forEach((f) => f())),
    };
  }

  it('observes the strip even though it had nothing to show at first', async () => {
    const observer = stubObserver();
    const session = await wroteAbout(IN_YEAR, 'A note.');
    await photoOn(sessionOwner(session.id), 'The crux');
    await hydrate();

    renderAt('/journal', <JournalPage />);
    // The strip appears only once the owner index resolves, which is after
    // the first render — the exact case the broken version missed.
    await waitFor(() => expect(screen.getByTestId('photo-strip')).toBeTruthy());
    await waitFor(() => expect(observer.observed.length).toBeGreaterThan(0));

    // And nothing is read until it is on screen.
    expect(screen.queryByAltText('The crux')).toBeNull();
    observer.show();
    expect(await screen.findByAltText('The crux')).toBeTruthy();
  });
});
