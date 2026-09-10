import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M20's "done when", made executable.
 *
 * "No single tap can lose a year of logs, and a bad record costs one card
 * rather than the page." The behaviour is tested in `db/snapshot.test.ts`,
 * `db/importPreview.test.ts` and `engine/onboarding.test.ts`; what is left is
 * that the app is actually wired to use any of it.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe('a bad record does not take the page', () => {
  it('wraps the routes in a boundary', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('<RouteBoundary resetKey={location}>');
  });

  it('puts the boundary inside the shell', () => {
    // Outside it, a page that throws takes the nav with it and there is no
    // way out but a reload.
    const app = read('src/App.tsx');
    expect(app.indexOf('<AppShell>')).toBeLessThan(app.indexOf('<RouteBoundary'));
  });

  it('resets on navigation', () => {
    // Without a reset key a page that threw once stays broken for the rest
    // of the run, even after the climber fixes what caused it.
    expect(read('src/ui/ErrorBoundary.tsx')).toContain('getDerivedStateFromProps');
  });

  it('gives every card on a browsing page its own boundary', () => {
    // This is the "one card rather than the page" half. Doing it in PageGrid
    // rather than at ~100 call sites is also what stops a new card
    // forgetting to have one.
    expect(read('src/ui/PageGrid.tsx')).toContain('<CardBoundary');
  });

  it('does not swallow the error', () => {
    // There is nowhere to report to — the app has no network — so the
    // console is the only record anyone will ever have from a device.
    expect(read('src/ui/ErrorBoundary.tsx')).toContain('console.error');
  });
});

describe('a bad record is normalised before anything reads it', () => {
  it('runs the stored baseline through readBaseline', () => {
    // A boundary catching the crash is a backstop, not a fix: the record
    // should not reach `finderInputFrom` in a shape it cannot handle.
    expect(read('src/store/profile.ts')).toContain('readBaseline(value.baseline)');
  });
});

describe('an import can be undone', () => {
  const settings = read('src/features/settings/SettingsPage.tsx');

  it('takes a restore point first', () => {
    expect(settings).toContain('takeSnapshot(');
    expect(settings.indexOf('takeSnapshot(')).toBeLessThan(settings.indexOf('await importAll('));
  });

  it('shows what the import would do before doing it', () => {
    expect(settings).toContain('previewFile(');
    expect(settings).toContain('<ImportPreviewCard');
  });

  it('offers the way back', () => {
    expect(settings).toContain('<UndoImportCard');
    expect(settings).toContain('restoreSnapshot(');
  });

  it('never writes a snapshot into a backup', () => {
    // A backup containing a backup doubles every time one is taken from a
    // restored database.
    expect(read('src/db/exportImport.ts')).toContain('SNAPSHOT_KEY');
  });
});

describe('a delete can be undone', () => {
  it('offers it from the shell', () => {
    expect(read('src/ui/AppShell.tsx')).toContain('<UndoBar />');
  });

  it('covers the deletes that lose the most', () => {
    const sites = [
      'src/features/log/LogPage.tsx',
      'src/features/projects/ProjectDetailPage.tsx',
      'src/features/objectives/ObjectiveDetailPage.tsx',
    ];
    const missing = sites.filter((path) => !read(path).includes('offerUndo('));
    expect(missing).toEqual([]);
  });

  it('restores into the store, not just the database', () => {
    // `update` maps over the list, and a record that is no longer in it has
    // nothing to map onto — the write would land in IndexedDB and never
    // reach the screen.
    expect(read('src/store/sessions.ts')).toContain('restore: async (session)');
    expect(read('src/store/projects.ts')).toContain('restore: async (project)');
  });

  it('tells a screen reader, which cannot see a bar appear', () => {
    expect(read('src/ui/UndoBar.tsx')).toContain('announce(');
  });
});

describe('bytes and boundaries stay in one place', () => {
  it('has one error boundary implementation', () => {
    const implementations = walk('src')
      .filter((p) => /\.tsx?$/.test(p) && !p.endsWith('.test.ts'))
      .filter((p) => /getDerivedStateFromError/.test(read(p)));
    expect(implementations).toEqual(['src/ui/ErrorBoundary.tsx']);
  });
});
