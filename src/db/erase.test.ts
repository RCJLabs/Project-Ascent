import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from './db';
import { ERASED_STORES, eraseEverything, storeNames } from './erase';
import { hasRealData } from './exportImport';
import { canLoadDemo, loadDemo } from './demo';

/**
 * Delete everything (PLAN.md M114).
 *
 * The two things worth testing are not "does clear() clear": they are that
 * the list of stores is the *whole* list, and that erasing actually returns
 * the app to the state the sample-data gate calls empty. The first is what a
 * future schema version breaks; the second is the reason the feature exists.
 */

async function seed(): Promise<void> {
  const db = await getDb();
  await db.put('sessions', { id: '2026-01-01#0', date: '2026-01-01' } as never);
  await db.put('projects', { id: 'p1', name: 'The Nose' } as never);
  await db.put('profile', { key: 'active-plan', value: { activeProgramId: 'base_camp' } } as never);
  await db.put('meta', { key: 'something', value: 1 } as never);
  await db.put('programs', { id: 'custom-1' } as never);
  await db.put('metrics', { metricId: 'max_hang', date: '2026-01-01', value: 10 } as never);
  await db.put('game', { key: 'wallet', value: 300 } as never);
  await db.put('media', {
    id: 'm1',
    ownerId: 'project:p1',
    blob: new Blob(['x']),
    type: 'image/png',
    width: 1,
    height: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  } as never);
}

const counts = async (): Promise<Record<string, number>> => {
  const db = await getDb();
  const out: Record<string, number> = {};
  for (const store of ERASED_STORES) out[store] = await db.count(store as never);
  return out;
};

beforeEach(async () => {
  await eraseEverything();
});

describe('what gets erased', () => {
  it('leaves every store empty', async () => {
    await seed();
    await eraseEverything();
    expect(await counts()).toEqual(Object.fromEntries(ERASED_STORES.map((s) => [s, 0])));
  });

  it('takes the photos with it', async () => {
    // The one this could plausibly get wrong. `EXPORTABLE_STORES` omits
    // `media` because blobs do not survive JSON, so reusing that list here
    // would leave every photo behind after a delete that said everything.
    await seed();
    const db = await getDb();
    expect(await db.count('media'), 'the fixture wrote no photo').toBe(1);
    await eraseEverything();
    expect(await db.count('media')).toBe(0);
  });

  it('names every store the database actually declares', async () => {
    // A store added in a future SCHEMA_VERSION and not added to the list
    // would survive a delete silently. This is what says so.
    expect(await storeNames()).toEqual([...ERASED_STORES].sort());
  });

  it('counts what it removed', async () => {
    await seed();
    const { records, photos } = await eraseEverything();
    expect(records).toBe(8);
    expect(photos).toBe(1);
  });

  it('says nothing was removed from an empty database', async () => {
    expect(await eraseEverything()).toEqual({ records: 0, photos: 0 });
  });
});

describe('why this exists', () => {
  it('hands the sample climber back', async () => {
    // The immediate reason for the feature. `canLoadDemo` is
    // `!hasRealData()`, so one logged session locked the demo away for good
    // and the only way back was clearing site data — which a standalone
    // install does not really offer.
    await seed();
    expect(await canLoadDemo(), 'the fixture did not actually block the demo').toBe(false);
    await eraseEverything();
    expect(await canLoadDemo()).toBe(true);
  });

  it('leaves nothing hasRealData can find', async () => {
    await seed();
    expect(await hasRealData()).toBe(true);
    await eraseEverything();
    expect(await hasRealData()).toBe(false);
  });

  it('erases the sample climber too, not only what you wrote', async () => {
    // `wipeDemo` removes tagged records and leaves yours. This is the other
    // direction, and a tester who loaded the demo and then wants a clean
    // start needs it to be the whole thing.
    await loadDemo();
    expect(await hasRealData()).toBe(true);
    await eraseEverything();
    expect(await hasRealData()).toBe(false);
  });
});
