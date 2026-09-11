// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { getProgram } from '@/content/programs';
import { newSession, putSession, type Session } from '@/db/sessions';
import { newProject, putProject } from '@/db/projects';
import { dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { CareerPage } from '@/features/career/CareerPage';
import { VENUE_LIST_ID } from './useVenues';

/**
 * Where you climbed (PLAN.md M88b).
 *
 * `engine/venues.test.ts` proves the reading. These prove the part that
 * makes the reading worth having: the three inputs that ask for a place
 * offer what has already been typed, so the same crag is typed the same
 * way. A grouping over free text is only as good as the text.
 */

const DATE = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

/** A completed session that names a place. */
async function climbedAt(date: string, location: string, index = 0): Promise<void> {
  await putSession({
    ...newSession(date, index, { completed: true }),
    fields: { location },
  } as unknown as Session);
}

async function logger(): Promise<void> {
  const program = getProgram('outdoor_climbing')!;
  const type = program.sessionTypes.find((t) => (t.fields ?? []).includes('location'))!;
  await putSession({
    ...newSession(DATE, 9, { completed: false }),
    programId: program.id,
    sessionTypeId: type.id,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: DATE },
    plans: { [program.id]: { [dayOfWeek(DATE)]: type.id } },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

const options = (): string[] =>
  [...document.querySelectorAll(`#${VENUE_LIST_ID} option`)].map((o) => o.getAttribute('value') ?? '');

describe('the places already named', () => {
  it('are offered back in the logger', async () => {
    await climbedAt('2026-08-01', 'Stanage');
    await logger();
    expect(screen.getByLabelText('Where').getAttribute('list')).toBe(VENUE_LIST_ID);
    expect(options()).toContain('Stanage');
  });

  // The finding the milestone missed: three independent strings. A place
  // typed on a project has to reach the logger, or the app keeps three
  // unconnected spellings of one crag.
  it('include one that was only ever typed on a project', async () => {
    await putProject({ ...newProject({ name: 'The Arete', grade: 'V6', scale: 'V' }), location: 'Camp 4' });
    await logger();
    expect(options()).toContain('Camp 4');
  });

  it('reach the project form as well', async () => {
    await climbedAt('2026-08-01', 'Stanage');
    await hydrate();
    renderAt('/projects', <ProjectsPage />);
    fireEvent.click(screen.getByRole('button', { name: /New/ }));
    expect(screen.getByPlaceholderText('Camp 4, or the cave').getAttribute('list')).toBe(VENUE_LIST_ID);
    expect(options()).toContain('Stanage');
  });

  // Only the place field. Hanging the list on every text input would offer
  // crag names for a route name and a gear note.
  it('are offered on the place field and no other', async () => {
    await climbedAt('2026-08-01', 'Stanage');
    await logger();
    expect(screen.getByLabelText('Where').getAttribute('list')).toBe(VENUE_LIST_ID);
    for (const label of ['Attempts today', 'Day of the trip']) {
      const field = screen.queryByLabelText(label);
      if (field) expect(field.getAttribute('list'), label).toBeNull();
    }
  });

  // An empty dropdown arrow on a field with nothing behind it.
  it('are not offered at all on a fresh install', async () => {
    await logger();
    expect(document.querySelector(`#${VENUE_LIST_ID}`)).toBeNull();
  });
});

describe('where you climb', () => {
  async function career(): Promise<void> {
    await hydrate();
    renderAt('/career', <CareerPage />);
  }

  it('counts the days at each place', async () => {
    await climbedAt('2026-08-01', 'The Works');
    await climbedAt('2026-08-03', 'The Works');
    await climbedAt('2026-08-05', 'Stanage');
    await career();
    expect(await screen.findByText('Where you climb')).toBeTruthy();
    expect(screen.getByText('The Works').closest('div')!.textContent).toMatch(/2 days/);
  });

  it('groups two spellings of one place', async () => {
    await climbedAt('2026-08-01', 'the works');
    await climbedAt('2026-08-03', 'The Works');
    await career();
    await screen.findByText('Where you climb');
    expect(screen.getByText('The Works').closest('div')!.textContent).toMatch(/2 days/);
    expect(screen.queryByText('the works')).toBeNull();
  });

  /**
   * A crag you have only ever named on a project is a place you know, and
   * it belongs in the suggestions — but a list of days climbed is a list of
   * days climbed.
   */
  it('leaves out a place that has only been named, never climbed at', async () => {
    await climbedAt('2026-08-01', 'The Works');
    await putProject({ ...newProject({ name: 'The Arete', grade: 'V6', scale: 'V' }), location: 'Camp 4' });
    await career();
    await screen.findByText('Where you climb');
    expect(screen.queryByText('Camp 4')).toBeNull();
  });

  it('stays away when nowhere has been named', async () => {
    await putSession(newSession('2026-08-01', 0, { completed: true }));
    await career();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Where you climb')).toBeNull();
  });

  // The app cannot tell a second gym from a second way of writing the
  // first, and a card that grouped on a guess would say it could.
  it('says what it will and will not group', async () => {
    await climbedAt('2026-08-01', 'The Works');
    await career();
    await screen.findByText('Where you climb');
    expect(screen.getByText(/cannot tell a second gym from a second way of writing the first/)).toBeTruthy();
  });
});
