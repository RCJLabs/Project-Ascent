// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '@/db/db';
import { exportAll, importAll } from '@/db/exportImport';
import type { AwayPeriod } from '@/engine/away';
import { useAway } from './away';

/**
 * The stretches the climber said they were away for (PLAN.md M275).
 *
 * Under one key in the `profile` store, which is the shape `objectives` uses
 * beside it — and which is why a backup carries this without `exportImport`
 * learning anything: the whole store is exported by key.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useAway.setState({ hydrated: false, periods: [] });
});

const period = (over: Partial<AwayPeriod> = {}): AwayPeriod => ({
  id: 'a1',
  from: '2026-06-01',
  to: '2026-06-14',
  kind: 'trip',
  note: "Font '26",
  updatedAt: '2026-06-15T00:00:00.000Z',
  ...over,
});

describe('storing a period', () => {
  it('survives a save and a reload', async () => {
    await useAway.getState().save(period());
    useAway.setState({ hydrated: false, periods: [] });
    await useAway.getState().load();
    expect(useAway.getState().periods).toHaveLength(1);
    expect(useAway.getState().periods[0]?.note).toBe("Font '26");
    expect(useAway.getState().hydrated).toBe(true);
  });

  it('replaces by id rather than piling up edits', async () => {
    await useAway.getState().save(period());
    await useAway.getState().save(period({ note: 'Fontainebleau' }));
    expect(useAway.getState().periods).toHaveLength(1);
    expect(useAway.getState().periods[0]?.note).toBe('Fontainebleau');
  });

  it('stamps the write, so a later edit is distinguishable', async () => {
    await useAway.getState().save(period({ updatedAt: '2000-01-01T00:00:00.000Z' }));
    expect(useAway.getState().periods[0]?.updatedAt).not.toBe('2000-01-01T00:00:00.000Z');
  });

  it('removes one and leaves the rest', async () => {
    await useAway.getState().save(period());
    await useAway.getState().save(period({ id: 'a2', from: '2026-07-01', to: '2026-07-05' }));
    await useAway.getState().remove('a1');
    expect(useAway.getState().periods.map((p) => p.id)).toEqual(['a2']);
  });

  it('reads back newest first', async () => {
    await useAway.getState().save(period({ id: 'old', from: '2026-01-01', to: '2026-01-05' }));
    await useAway.getState().save(period({ id: 'new', from: '2026-08-01', to: '2026-08-05' }));
    await useAway.getState().load();
    expect(useAway.getState().periods.map((p) => p.id)).toEqual(['new', 'old']);
  });
});

/**
 * A malformed range reads as covering nothing or everything, and either one is
 * a wrong sentence on the coach card — so it is filtered on the way in rather
 * than trusted. This is what comes back out of IndexedDB after an old schema
 * or a hand-edited backup.
 */
describe('a stored value the app did not write', () => {
  it('drops the rows it cannot read and keeps the rest', async () => {
    const db = await getDb();
    await db.put('profile', {
      key: 'away',
      value: [period(), { id: 'bad', from: 'soon', to: '2026-06-14', kind: 'trip' }, null, 'x'],
    });
    await useAway.getState().load();
    expect(useAway.getState().periods.map((p) => p.id)).toEqual(['a1']);
  });

  it('reads a value that is not a list as none at all', async () => {
    const db = await getDb();
    await db.put('profile', { key: 'away', value: { from: '2026-06-01' } });
    await useAway.getState().load();
    expect(useAway.getState().periods).toEqual([]);
    expect(useAway.getState().hydrated).toBe(true);
  });
});

describe('a backup', () => {
  it('carries the markers without exportImport knowing they exist', async () => {
    await useAway.getState().save(period());
    const file = await exportAll();

    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    useAway.setState({ hydrated: false, periods: [] });
    await useAway.getState().load();
    expect(useAway.getState().periods).toEqual([]);

    await importAll(file, 'replace');
    await useAway.getState().load();
    expect(useAway.getState().periods[0]?.note).toBe("Font '26");
    expect(useAway.getState().periods[0]?.from).toBe('2026-06-01');
    expect(useAway.getState().periods[0]?.to).toBe('2026-06-14');
    expect(useAway.getState().periods[0]?.kind).toBe('trip');
  });
});
