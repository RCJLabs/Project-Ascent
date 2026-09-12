// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
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

const settle = () => new Promise((r) => setTimeout(r, 60));

describe('a backup the app was opened with', () => {
  it('offers the preview rather than importing it', async () => {
    await reset();
    await useSessions.getState().create('2026-03-01');
    const file = await backupFile();
    await reset();
    setLaunchFile(file);

    const view = renderAt('/settings', <SettingsPage />);
    await settle();

    const text = view.container.textContent ?? '';
    expect(text, 'the launched backup never reached the preview').toMatch(/replace|merge/i);
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
    await settle();

    expect(view.container.textContent ?? '').toMatch(/Exported \w+ \d/);
  });

  it('reports a file it cannot read', async () => {
    await reset();
    setLaunchFile(new File(['not a backup'], 'notes.json'));

    const view = renderAt('/settings', <SettingsPage />);
    await settle();

    const text = view.container.textContent ?? '';
    expect(text).not.toMatch(/replace|merge/i);
    expect(text.length, 'the page rendered nothing at all').toBeGreaterThan(0);
  });

  it('shows no preview when nothing was opened', async () => {
    await reset();
    takeLaunchFile();

    const view = renderAt('/settings', <SettingsPage />);
    await settle();

    expect(view.container.textContent ?? '').not.toMatch(/replace|merge/i);
  });
});
