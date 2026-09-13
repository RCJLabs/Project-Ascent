// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { BASE_CAMP, THE_CRUISER } from '@/content/programs/catalogue';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinderPage } from '@/features/finder/FinderPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';

/**
 * How long a session takes, where a climber is choosing (PLAN.md M138).
 *
 * The estimate existed for the day you were about to do and nowhere near
 * the block you were picking. These are the two screens that had to say it:
 * the catalogue page, per session, and the finder, against the time an
 * evening actually has in it.
 */

const TEXT = () => document.body.textContent ?? '';
/** Base Camp's two tracks, by name, in the order it declares them. */
const THE_TRACKS = (BASE_CAMP.tracks ?? []).map((t) => t.name);

async function finder(): Promise<void> {
  await reset();
  await loadPrograms();
  await hydrate();
  renderAt('/find', <FinderPage />);
  await screen.findByRole('heading', { level: 1 });
}

/** Tap a chip inside the card with this heading. */
function chip(cardTitle: string, label: string): void {
  const card = [...document.querySelectorAll('section')].find(
    (s) => s.querySelector('h2')?.textContent === cardTitle,
  )!;
  const found = [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
  fireEvent.click(found);
}

describe('the finder asks how long an evening is', () => {
  it('offers the question, with no limit as the default', async () => {
    await finder();
    expect(screen.getByText('How long is a session for you?')).toBeTruthy();
    const card = screen.getByText('How long is a session for you?').closest('section')!;
    expect(
      [...card.querySelectorAll('button')].map((b) => b.textContent?.trim()),
    ).toEqual(['Any', '45', '60', '90', '120+']);
    const on = [...card.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent?.trim());
    expect(on).toEqual(['Any']);
  });

  it('says nothing about minutes when the answer is any', async () => {
    await finder();
    fireEvent.click(screen.getByRole('button', { name: /Find my program/ }));
    await screen.findByText(/Your program/i);
    expect(TEXT()).not.toMatch(/min\b.*(?:fits|runs past)/);
  });

  it('names what runs past the answer, and still offers the program', async () => {
    await finder();
    chip('How long is a session for you?', '45');
    fireEvent.click(screen.getByRole('button', { name: /Find my program/ }));
    await screen.findByText(/Your program/i);
    await waitFor(() => expect(TEXT()).toMatch(/sessions? runs? past 45 min|sessions run past 45 min/));
    // Never a filter: the whole catalogue is still on the page.
    expect(TEXT()).toMatch(/Every session fits your 45 min/);
  });
});

describe('the catalogue page says how long each session is', () => {
  async function program(id: string): Promise<void> {
    await reset();
    await loadPrograms();
    await hydrate();
    renderAt(`/train/${id}`, <ProgramDetailPage params={{ id }} />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByText(/What's in it/));
  }

  it('carries the authored length of a climbing day', async () => {
    // The Cruiser's volume day is counted in problems, which no clock can
    // read, and its own rationale says *drill it for 60 minutes*.
    await program('the_cruiser');
    const vol = THE_CRUISER.sessionTypes.find((t) => t.id === 'vol')!;
    const card = [...document.querySelectorAll('section')].find(
      (s) => s.querySelector('h3')?.textContent === vol.name,
    )!;
    expect(card.textContent).toContain('Moderate day');
    expect(card.textContent).toContain('about 45-60 min of work');
  });

  it('carries the derived length of a dosed day', async () => {
    await program('iron_grip');
    const card = [...document.querySelectorAll('section')].find((s) =>
      s.querySelector('h3')?.textContent?.includes('Finger Protocol'),
    )!;
    expect(card.textContent).toMatch(/Hard day · about \d+-\d+ min of work/);
  });

  it('says how hard a session is even where it cannot say how long', async () => {
    // Outdoor Climbing is a mode with no blocks: the intensity is authored,
    // the length is nobody's to know.
    await program('outdoor_climbing');
    const card = [...document.querySelectorAll('section')].find(
      (s) => s.querySelector('h3')?.textContent === 'Outdoor Sport',
    )!;
    expect(card.textContent).toContain('Hard day');
    expect(card.textContent).not.toContain('min of work');
  });
});

describe('the length follows what the page is showing', () => {
  async function open(id: string): Promise<void> {
    await reset();
    await loadPrograms();
    await hydrate();
    renderAt(`/train/${id}`, <ProgramDetailPage params={{ id }} />);
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByText(/What's in it/));
  }

  const lengthOf = (heading: string): string =>
    /about [\d-]+ min of work/.exec(
      [...document.querySelectorAll('section')].find((s) => s.querySelector('h3')?.textContent?.includes(heading))!
        .textContent ?? '',
    )![0];

  it('changes with the block of weeks, because the dose does', async () => {
    // Iron Grip's finger day is repeaters in the Anvil and max hangs in the
    // Hammer, and they are not the same length.
    await open('iron_grip');
    const anvil = lengthOf('Finger Protocol');
    fireEvent.click(screen.getByRole('button', { name: /The Hammer/ }));
    await waitFor(() => expect(lengthOf('Finger Protocol')).not.toBe(anvil));
    expect(anvil).toBe('about 42-51 min of work');
    expect(lengthOf('Finger Protocol')).toBe('about 37-45 min of work');
  });

  it('changes with the track, because a track is a different set of lines', async () => {
    // Base Camp's Engine Room is bodyweight on one track and loaded on the
    // other, and the untracked total is both at once — which is nobody's
    // session.
    await open('base_camp');
    const [bodyweight, loaded] = THE_TRACKS as [string, string];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(bodyweight) }));
    await waitFor(() => expect(lengthOf('Engine Room')).toBe('about 20-26 min of work'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(loaded) }));
    await waitFor(() => expect(lengthOf('Engine Room')).toBe('about 17-22 min of work'));
  });
});
