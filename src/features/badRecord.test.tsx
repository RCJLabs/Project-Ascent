// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getDb } from '@/db/db';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession } from '@/db/sessions';
import { hydrate, renderAt } from '@/test/render';
import { JournalPage } from '@/features/journal/JournalPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { SearchPage } from '@/features/search/SearchPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

/**
 * One record of the wrong shape costs one card (PLAN.md M20, M44).
 *
 * It did not. Deleting a single field from one project out of seven replaced
 * `/journal` and `/search` entirely with the route boundary, while
 * `/projects` and `/progress` carried on.
 *
 * `PageGrid` does give every card its own `CardBoundary`, and both those
 * pages use it — but the throw happens in a `useMemo` in the page body,
 * above the grid. A boundary catches what its children throw while
 * rendering; it cannot catch its parent computing what to hand them. So the
 * pages that derive across every record are precisely the ones no card
 * boundary protects.
 *
 * A backup restored from an older version is the app's own explanation for
 * this in its error text, and `importAll` checks only that the file is a
 * Project Ascent backup and that each store is an array before writing every
 * record verbatim.
 */

/** A record that lost a field, the way an old export or a hand-edit leaves one. */
async function storeMalformedProject(): Promise<void> {
  const whole = { ...newProject({ name: 'Half a Record', grade: 'V5', scale: 'V' }), id: 'broken' };
  const { beta: _dropped, ...missingBeta } = whole;
  const db = await getDb();
  await db.put('projects', missingBeta as never);
}

async function seed(): Promise<void> {
  await putProject({ ...newProject({ name: 'A Whole Record', grade: 'V4', scale: 'V' }), id: 'whole' });
  await putSession({
    ...newSession('2026-02-02', 0),
    completed: true,
    climbs: [{ id: 'c', grade: 'V4', scale: 'V', count: 1, result: 'send' }],
  });
  await storeMalformedProject();
  await hydrate();
}

describe('one record of the wrong shape', () => {
  it('leaves the journal standing', async () => {
    await seed();
    const view = renderAt('/journal', <JournalPage />);
    const h1 = await view.findByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Journal');
  });

  it('leaves search standing', async () => {
    await seed();
    const view = renderAt('/search', <SearchPage />);
    const h1 = await view.findByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Search');
  });

  it('still shows the records that are whole', async () => {
    // Degrading is the point. A page that renders but hides everything is
    // not better than one that fails loudly.
    await seed();
    const view = renderAt('/projects', <ProjectsPage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').toMatch(/A Whole Record/);
  });

  it('tells the climber their list is short, rather than repairing in silence', async () => {
    // A repair nobody is told about is its own kind of data loss: the page
    // renders, the list is one shorter, and there is nothing to notice.
    await seed();
    const view = renderAt('/settings', <SettingsPage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').toMatch(/1 project (could not be read|was missing part)/i);
  });
});
