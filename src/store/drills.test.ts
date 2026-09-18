// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '@/db/db';
import { loadDrills, drillsByCategory, filterDrills, getDrill } from '@/content/drills';
import { drillText } from '@/content/drillText';
import { exportAll, importAll } from '@/db/exportImport';
import type { Drill, DrillId } from '@/content/types';
import { blankDrill } from '@/engine/customDrill';
import { useCustomDrills } from './drills';

/**
 * Drills the climber wrote (PLAN.md M286).
 *
 * The point of the registry half is that nothing downstream learns where a
 * drill came from — `content/programs/index.ts` states it for programs and it
 * holds here: six modules on the first-paint path call `getDrill`, and none of
 * them should know.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useCustomDrills.setState({ hydrated: false, custom: [] });
  await useCustomDrills.getState().load();
  await loadDrills();
});

const mine = (over: Partial<Drill> = {}): Drill => ({
  ...blankDrill(),
  id: 'own_test' as DrillId,
  name: 'Three-point rule',
  focus: 'Foot precision',
  text: 'Keep three points on, always.',
  category: 'technique',
  ...over,
});

describe('storing one', () => {
  it('survives a save and a reload', async () => {
    await useCustomDrills.getState().save(mine());
    useCustomDrills.setState({ hydrated: false, custom: [] });
    await useCustomDrills.getState().load();
    expect(useCustomDrills.getState().custom.map((d) => d.name)).toEqual(['Three-point rule']);
  });

  it('replaces by id rather than piling up edits', async () => {
    await useCustomDrills.getState().save(mine());
    await useCustomDrills.getState().save(mine({ name: 'Four-point rule' }));
    expect(useCustomDrills.getState().custom).toHaveLength(1);
  });

  it('removes one', async () => {
    await useCustomDrills.getState().save(mine());
    await useCustomDrills.getState().remove('own_test' as DrillId);
    expect(useCustomDrills.getState().custom).toEqual([]);
  });

  /** What comes back out of IndexedDB is not to be trusted (M275's rule). */
  it('drops rows it cannot read', async () => {
    const db = await getDb();
    await db.put('profile', {
      key: 'drills',
      value: [mine(), { id: 'sticky_feet', name: 'Not yours' }, null, 'x', { name: 'No id' }],
    });
    await useCustomDrills.getState().load();
    expect(useCustomDrills.getState().custom.map((d) => d.id)).toEqual(['own_test']);
  });
});

describe('a written drill in the registry', () => {
  beforeEach(async () => {
    await useCustomDrills.getState().save(mine());
  });

  it('answers getDrill like any other', () => {
    expect(getDrill('own_test' as DrillId)?.name).toBe('Three-point rule');
    // And the shipped ones still do.
    expect(getDrill('sticky_feet' as DrillId)).toBeDefined();
  });

  it('appears in its category beside the shipped ones', () => {
    const list = drillsByCategory('technique');
    expect(list.some((d) => d.id === 'own_test')).toBe(true);
    expect(list.length).toBeGreaterThan(1);
  });

  it('is found by a search of its own words', () => {
    expect(filterDrills({ search: 'three-point' }).map((d) => d.id)).toEqual(['own_test']);
    // Its text too, which for a shipped drill needs the map handed in.
    expect(filterDrills({ search: 'three points on' }).map((d) => d.id)).toEqual(['own_test']);
  });

  it('is filtered by kit like any other', () => {
    expect(filterDrills({ equipment: [] }).some((d) => d.id === 'own_test')).toBe(false);
    expect(filterDrills({ equipment: ['wall'] }).some((d) => d.id === 'own_test')).toBe(true);
  });

  /**
   * Its paragraph is on the record, because `DRILL_TEXT` is a build artefact
   * of the library and a written drill will never be in it.
   */
  it('reads its own text back', () => {
    expect(drillText('own_test' as DrillId)).toBe('Keep three points on, always.');
    expect(drillText('sticky_feet' as DrillId)).toContain('once a foot is placed');
  });

  /**
   * `loadDrills` replaces `DRILLS` wholesale, which is why written drills are
   * kept apart from it rather than spliced in — the order of those two events
   * should not be something anyone has to reason about.
   */
  it('survives the library landing after it', async () => {
    await loadDrills();
    expect(getDrill('own_test' as DrillId)).toBeDefined();
    expect(drillsByCategory('technique').some((d) => d.id === 'own_test')).toBe(true);
  });
});

describe('a backup', () => {
  it('carries written drills, because the profile store is exported whole', async () => {
    await useCustomDrills.getState().save(mine());
    const file = await exportAll();

    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    useCustomDrills.setState({ hydrated: false, custom: [] });
    await useCustomDrills.getState().load();
    expect(useCustomDrills.getState().custom).toEqual([]);

    await importAll(file, 'replace');
    await useCustomDrills.getState().load();
    expect(useCustomDrills.getState().custom[0]?.text).toBe('Keep three points on, always.');
  });
});
