// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { putProject, type Project } from '@/db/projects';
import { venueKey } from '@/engine/venues';
import { hydrate, renderAt, reset } from '@/test/render';
import { useObjectives } from '@/store/objectives';
import { CareerPage } from '@/features/career/CareerPage';
import { VenuePage } from './VenuePage';

/**
 * A place you can open (PLAN.md M192).
 *
 * M88b built the reading and nothing rendered it beyond eight rows on
 * Career. Two of the fields it computed — `projects` and `objectives` —
 * were asserted in `venues.test.ts` and shown by nothing at all, which is
 * M155 and M156's shape in an engine interface the M169 sweep does not
 * reach. They are gone; this page lists the projects and objectives
 * themselves, which is what a count was standing in for.
 */

const KEY = venueKey('The Works');

async function climbedAtTheWorks(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  // "The Works" twice against one of each other spelling, because `name` is
  // the spelling typed **most often** — a fixture with a three-way tie made
  // the page render "the works" and the first draft of this test read that
  // as a bug in the page.
  // Two on one day, so `days` and `sessions` are different numbers — a
  // fixture of one session per day cannot tell them apart, and the battery
  // proved it by swapping one for the other and surviving.
  for (const [date, where, index] of [
    ['2026-03-02', 'The Works', 0],
    ['2026-03-02', 'The Works', 1],
    ['2026-03-04', 'The Works', 0],
    ['2026-03-06', 'the works', 0],
    ['2026-03-07', 'The  Works', 0],
    ['2026-03-08', 'Stanage', 0],
  ] as [string, string, number][]) {
    await putSession({
      id: `${date}#${index}`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: where === 'Stanage' ? 'outdoor' : 'indoor',
      rpe: 7,
      durationMin: 90,
      warmup: true,
      drillDone: false,
      fields: { location: where },
      climbs: [
        { id: `c${date}#${index}`, grade: 'V5', scale: 'V', count: 2, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as unknown as Session);
  }
  // Somewhere else, so a list that forgets to filter shows it (the battery
  // found both lists unfiltered against a fixture that had nothing else in
  // it).
  await putProject({
    id: 'p2',
    name: 'Careless Torque',
    grade: 'V13',
    scale: 'V',
    setting: 'outdoor',
    location: 'Stanage',
    status: 'active',
    beta: [],
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  } as unknown as Project);
  await putProject({
    id: 'p1',
    name: 'The Wheel',
    grade: 'V7',
    scale: 'V',
    setting: 'indoor',
    location: 'the works',
    status: 'active',
    beta: [],
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  } as unknown as Project);
  await hydrate();
  useObjectives.setState({
    objectives: [
      {
        id: 'o1',
        name: 'Send The Wheel',
        kind: 'route',
        status: 'training',
        location: 'The Works',
        requirements: [],
      },
      {
        id: 'o2',
        name: 'A week at Stanage',
        kind: 'trip',
        status: 'training',
        location: 'Stanage',
        requirements: [],
      },
    ] as never,
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a place, opened', () => {
  it('says what you have done there', async () => {
    await climbedAtTheWorks();
    renderAt(`/venues/${encodeURIComponent(KEY)}`, <VenuePage params={{ key: KEY }} />);
    expect(await screen.findByRole('heading', { name: 'The Works' })).toBeTruthy();
    const body = document.body.textContent ?? '';
    expect(body, 'the day count is missing').toMatch(/Days/);
    expect(body, 'four days at one place read as something else').toMatch(/4/);
    expect(body, 'the hardest sent here is missing').toMatch(/V5/);
  });

  /**
   * The two fields that were computed and shown to nobody, as the lists
   * they were standing in for. A count told a climber there were three
   * projects here; this tells them which.
   */
  it('lists the projects and objectives at that place', async () => {
    await climbedAtTheWorks();
    renderAt(`/venues/${encodeURIComponent(KEY)}`, <VenuePage params={{ key: KEY }} />);
    await screen.findByRole('heading', { name: 'The Works' });
    expect(screen.getByText('The Wheel')).toBeTruthy();
    expect(screen.getByText('Send The Wheel')).toBeTruthy();
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links, 'the project does not open').toContain('#/projects/p1');
    expect(links, 'the objective does not open').toContain('#/objectives/o1');

    // And only the ones here. Both lists were unfiltered and survived the
    // battery against a fixture with nothing else in it.
    expect(screen.queryByText('Careless Torque'), "another crag's project is on this page")
      .toBeNull();
    expect(screen.queryByText('A week at Stanage'), "another crag's objective is on this page")
      .toBeNull();
  });

  /**
   * Days and sessions are different numbers, and the page says both. Two
   * sessions on one day at The Works is what makes them differ, without
   * which one can be swapped for the other unnoticed.
   */
  it('counts days and sessions apart', async () => {
    await climbedAtTheWorks();
    renderAt(`/venues/${encodeURIComponent(KEY)}`, <VenuePage params={{ key: KEY }} />);
    await screen.findByRole('heading', { name: 'The Works' });
    const days = screen.getByText('Days').parentElement?.textContent ?? '';
    const sessions = screen.getByText('Sessions').parentElement?.textContent ?? '';
    expect(days).toMatch(/4/);
    expect(sessions).toMatch(/5/);
  });

  /**
   * And it says which spellings it folded together, because the grouping is
   * timid on purpose and a climber should be able to see what it did.
   */
  it('is titled by the spelling used most, not the first seen', async () => {
    await climbedAtTheWorks();
    renderAt(`/venues/${encodeURIComponent(KEY)}`, <VenuePage params={{ key: KEY }} />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('The Works');
  });

  it('shows the spellings it counted as one', async () => {
    await climbedAtTheWorks();
    renderAt(`/venues/${encodeURIComponent(KEY)}`, <VenuePage params={{ key: KEY }} />);
    await screen.findByRole('heading', { name: 'The Works' });
    const body = document.body.textContent ?? '';
    for (const spelling of ['The Works', 'the works']) {
      expect(body, `${spelling} is not shown as a spelling`).toContain(spelling);
    }
  });

  /**
   * And says nothing about spellings when there is only one — the card
   * exists to explain a merge, and there is no merge to explain.
   */
  it('keeps quiet about a place written one way', async () => {
    await climbedAtTheWorks();
    const stanage = venueKey('Stanage');
    renderAt(`/venues/${stanage}`, <VenuePage params={{ key: stanage }} />);
    await screen.findByRole('heading', { name: 'Stanage' });
    expect(
      screen.queryByText(/Written as/),
      'explained a merge that did not happen',
    ).toBeNull();
  });

  /** A place with nothing at it is a place that is not there. */
  it('answers a name nobody has typed with the not-found shape', async () => {
    await climbedAtTheWorks();
    renderAt('/venues/malham', <VenuePage params={{ key: 'malham' }} />);
    expect(await screen.findByText(/That place/)).toBeTruthy();
  });

  /**
   * The key comes back through a URL, so it is decoded and re-normalised
   * rather than trusted: a venue name is free text someone typed.
   */
  it('reads a key that has been through a url', async () => {
    await climbedAtTheWorks();
    renderAt('/venues/The%20Works', <VenuePage params={{ key: 'The%20Works' }} />);
    expect(await screen.findByRole('heading', { name: 'The Works' })).toBeTruthy();
  });
});

describe('the way in', () => {
  it('is a link on the career page', async () => {
    await climbedAtTheWorks();
    renderAt('/career', <CareerPage />);
    await screen.findByText(/Where you climb/);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links, 'the venue rows still go nowhere').toContain(`#/venues/${encodeURIComponent(KEY)}`);
  });
});
