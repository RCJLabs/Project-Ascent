// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { exportAll } from '@/db/exportImport';
import { setLaunchFile, takeLaunchFile } from '@/lib/launchFile';
import { useSessions } from '@/store/sessions';
import { renderAt, reset } from '@/test/render';
import { SettingsPage } from './SettingsPage';

/**
 * A backup tapped in a file manager (PLAN.md M111).
 *
 * The thing being guarded is not that the file opens — it is that opening it
 * from a file manager is **not** one tap from replacing the database. M20
 * built the preview because "replace" and "merge" mean nothing until you can
 * see what they would do, and a launch handler is exactly the route by which
 * that gets skipped.
 */

const backupFile = async (): Promise<File> => {
  const file = await exportAll();
  return new File([JSON.stringify(file)], 'backup.json', { type: 'application/json' });
};

/**
 * Waited for, not slept through (PLAN.md M303).
 *
 * This was `new Promise((r) => setTimeout(r, 60))` and then a synchronous
 * read of the page — a clock standing in for a condition. Reading the file,
 * parsing it and building the preview all happen off the render, and on a
 * loaded CI runner they take longer than sixty milliseconds: the suite went
 * red on a commit that touched none of this, with *"the launched backup
 * never reached the preview"* over a page that simply had not got there
 * yet. It is the M302 shape one layer up — the fix there was
 * `asyncUtilTimeout`, and a hand-rolled sleep is the one wait that ignores
 * it.
 *
 * The two tests that assert an **absence** wait for something that has to
 * arrive first, so they are asking after the page has finished reacting
 * rather than before it started.
 */
const shows = (view: { container: HTMLElement }, pattern: RegExp) =>
  waitFor(() => expect(view.container.textContent ?? '').toMatch(pattern));

describe('a backup the app was opened with', () => {
  it('offers the preview rather than importing it', async () => {
    await reset();
    await useSessions.getState().create('2026-03-01');
    const file = await backupFile();
    await reset();
    setLaunchFile(file);

    const view = renderAt('/settings', <SettingsPage />);
    await shows(view, /replace|merge/i);
    expect(
      Object.keys(useSessions.getState().byDate),
      'a file manager tap restored a backup with nothing asked',
    ).toEqual([]);
  });

  it('names where the backup came from', async () => {
    await reset();
    const file = await backupFile();
    setLaunchFile(file);

    const view = renderAt('/settings', <SettingsPage />);
    await shows(view, /Exported \w+ \d/);
  });

  it('reports a file it cannot read', async () => {
    await reset();
    setLaunchFile(new File(['not a backup'], 'notes.json'));

    const view = renderAt('/settings', <SettingsPage />);
    // The app says so, and saying so is what proves it finished trying.
    await shows(view, /could not|failed|unexpected|invalid|not a/i);
    const text = view.container.textContent ?? '';
    expect(text).not.toMatch(/replace|merge/i);
    expect(text.length, 'the page rendered nothing at all').toBeGreaterThan(0);
  });

  it('shows no preview when nothing was opened', async () => {
    await reset();
    takeLaunchFile();

    const view = renderAt('/settings', <SettingsPage />);
    // Nothing was opened, so nothing will ever arrive — the wait is on the
    // page itself, which is the latest moment an absence can be asked about.
    await shows(view, /Your data/i);
    expect(view.container.textContent ?? '').not.toMatch(/replace|merge/i);
  });
});
