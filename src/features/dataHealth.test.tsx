// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getDb } from '@/db/db';
import { addMedia, listMedia, projectOwner } from '@/db/media';
import { readDbHealth } from '@/db/health';
import { takeSnapshot } from '@/db/snapshot';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { DataPage } from '@/features/data/DataPage';

/**
 * The data page (PLAN.md M80).
 *
 * The engine's rules are tested next door. These are the three things the
 * page exists for: it says so when nothing is wrong, it counts what is
 * there, and it shows *every* stale session rather than the first.
 */

const DATE = today();

beforeEach(async () => {
  await reset();
  const db = await getDb();
  await db.clear('media');
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
});

const photo = (owner: string) =>
  addMedia({
    ownerId: owner,
    blob: new Blob(['x'.repeat(500)], { type: 'image/webp' }),
    type: 'image/webp',
    width: 80,
    height: 60,
  });

/** A session started yesterday and never finished. */
const openSession = (daysAgo: number) => {
  const date = addDays(DATE, -daysAgo);
  return putSession({
    ...newSession(date, 0, { completed: false }),
    startedAt: new Date(`${date}T18:00:00`).toISOString(),
  } as never);
};

describe('a healthy database', () => {
  it('says so, rather than showing an empty page', async () => {
    await putSession({ ...newSession(DATE, 0, { completed: true }), durationMin: 90, rpe: 7 } as never);
    await hydrate();
    renderAt('/data', <DataPage />);
    // Silence and health look identical; this is the difference.
    expect(await screen.findByText(/Nothing needs attention/)).toBeTruthy();
    expect(screen.getByText(/Every record is readable/)).toBeTruthy();
  });

  it('is honest about the limit of the check', async () => {
    await hydrate();
    renderAt('/data', <DataPage />);
    expect(await screen.findByText(/cannot tell you whether what you logged was true/)).toBeTruthy();
  });
});

describe('what is stored', () => {
  it('counts each kind, which nothing else in the app did', async () => {
    await putSession({ ...newSession(DATE, 0, { completed: true }) } as never);
    await putSession({ ...newSession(addDays(DATE, -2), 0, { completed: true }) } as never);
    await putProject(newProject({ name: 'The Nose', grade: 'V7', scale: 'V' }));
    await hydrate();
    renderAt('/data', <DataPage />);

    const table = await screen.findByRole('table', { name: /Records held on this device/ });
    const row = (label: string) =>
      within(table).getByRole('row', { name: new RegExp(`^${label}`) }).textContent ?? '';
    expect(row('Sessions')).toMatch(/2$/);
    expect(row('Projects')).toMatch(/1$/);
  });

  it('shows what the photos cost, and nothing else in bytes', async () => {
    const project = newProject({ name: 'Boulder', grade: 'V4', scale: 'V' });
    await putProject(project);
    await photo(projectOwner(project.id));
    await hydrate();
    renderAt('/data', <DataPage />);

    const table = await screen.findByRole('table', { name: /Records held/ });
    // The number is the browser's — jsdom hands back a blob with no size —
    // so this asserts a size is shown beside the count, not what it reads.
    expect(within(table).getByRole('row', { name: /^Photos/ }).textContent).toMatch(/1 · \S/);
    // A session is an object graph; a byte count for it would be invented.
    expect(within(table).getByRole('row', { name: /^Sessions/ }).textContent).not.toContain('·');
  });
});

describe('the app\'s own bookkeeping', () => {
  it('does not count the import restore point as your data', async () => {
    await putSession({ ...newSession(DATE, 0, { completed: true }) } as never);
    await hydrate();
    const before = await readDbHealth();
    await takeSnapshot('a backup');
    const after = await readDbHealth();
    // The snapshot is one meta record the app wrote about itself. Counting
    // it would make "App bookkeeping" read as growing every time a climber
    // imported something.
    expect(after.counts.meta).toBe(before.counts.meta);
  });

  it('counts a real meta record', async () => {
    const db = await getDb();
    const before = (await readDbHealth()).counts.meta ?? 0;
    await db.put('meta', { key: 'something-real', value: 1 });
    expect((await readDbHealth()).counts.meta).toBe(before + 1);
  });
});

describe('photos whose owner is gone', () => {
  async function orphaned() {
    const project = newProject({ name: 'Deleted', grade: 'V4', scale: 'V' });
    await putProject(project);
    await photo(projectOwner(project.id));
    await photo(projectOwner(project.id));
    const db = await getDb();
    await db.delete('projects', project.id);
    await hydrate();
    renderAt('/data', <DataPage />);
  }

  it('are reported before anything deletes them', async () => {
    await orphaned();
    expect(await screen.findByText(/2 photos belong to something that is gone/)).toBeTruthy();
    // Reported, not yet swept: the sweep's own count was being discarded by
    // its only caller, so this is the first time it is visible at all.
    expect(await listMedia(projectOwner('nope'))).toEqual([]);
    const db = await getDb();
    expect(await db.count('media')).toBe(2);
  });

  it('are deleted by the tidy-up, which says what it did', async () => {
    await orphaned();
    await screen.findByText(/2 photos belong to something/);
    fireEvent.click(screen.getByRole('button', { name: /Tidy up/ }));

    expect(await screen.findByText(/Deleted 2 photos/)).toBeTruthy();
    const db = await getDb();
    await waitFor(async () => expect(await db.count('media')).toBe(0));
    // And the page re-reads: the finding goes.
    await waitFor(() => expect(screen.queryByText(/belong to something that is gone/)).toBeNull());
  });

  it('leaves a photo whose owner is still there', async () => {
    const project = newProject({ name: 'Kept', grade: 'V4', scale: 'V' });
    await putProject(project);
    await photo(projectOwner(project.id));
    await hydrate();
    renderAt('/data', <DataPage />);
    await screen.findByText(/Nothing needs attention/);
    fireEvent.click(screen.getByRole('button', { name: /Tidy up/ }));
    expect(await screen.findByText(/Nothing to tidy up/)).toBeTruthy();
    expect(await listMedia(projectOwner(project.id))).toHaveLength(1);
  });
});

describe('sessions left open', () => {
  it('lists all of them, where the bar shows one', async () => {
    await openSession(1);
    await openSession(3);
    await openSession(5);
    await hydrate();
    renderAt('/data', <DataPage />);

    expect(await screen.findByText(/3 sessions were left open/)).toBeTruthy();
    const card = (await screen.findByText('Sessions left open')).closest('section, div') as HTMLElement;
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(3);
    // Each one goes to its own log, which is where it can be finished.
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      `#/log/${addDays(DATE, -5)}`,
      `#/log/${addDays(DATE, -3)}`,
      `#/log/${addDays(DATE, -1)}`,
    ]);
  });

  it("does not offer to sweep them — that is the climber's call", async () => {
    await openSession(2);
    await hydrate();
    renderAt('/data', <DataPage />);
    await screen.findByText(/1 session was left open/);
    fireEvent.click(screen.getByRole('button', { name: /Tidy up/ }));
    await screen.findByText(/Nothing to tidy up/);
    // Still there: finishing or discarding it is a decision, not tidying.
    expect(screen.getByText(/1 session was left open/)).toBeTruthy();
  });
});
