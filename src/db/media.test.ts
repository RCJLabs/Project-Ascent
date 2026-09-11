import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from './db';
import {
  addMedia,
  deleteMediaFor,
  listMedia,
  moveMediaOwner,
  projectOwner,
  sessionOwner,
  findOrphanMedia,
  sweepOrphanMedia,
} from './media';

/**
 * Photos have to survive the things that happen to their owner (PLAN.md M30).
 *
 * A session's id encodes its date, so re-dating one destroys the id the
 * photos are filed under, and merging destroys it outright. Neither is a
 * hypothetical: both are buttons on the session editor.
 */

const blob = (bytes = 64) => new Blob([new Uint8Array(bytes)], { type: 'image/webp' });
const tick = () => new Promise((r) => setTimeout(r, 2));

async function photo(owner: string, caption?: string) {
  return addMedia({
    ownerId: owner,
    blob: blob(),
    type: 'image/webp',
    width: 100,
    height: 100,
    ...(caption ? { caption } : {}),
  });
}

async function seedSession(id: string): Promise<void> {
  const db = await getDb();
  await db.put('sessions', { id, date: id.split('#')[0], completed: true, climbs: [] } as never);
}

async function seedProject(id: string): Promise<void> {
  const db = await getDb();
  await db.put('projects', { id, name: id, scale: 'V', grade: 'V5', status: 'open' } as never);
}

async function ownersHeld(): Promise<string[]> {
  const db = await getDb();
  return [...new Set((await db.getAll('media')).map((r) => r.ownerId))].sort();
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('carrying photos to a new owner key', () => {
  it('moves every photo an owner holds', async () => {
    await photo(sessionOwner('2026-09-01#0'), 'one');
    await photo(sessionOwner('2026-09-01#0'), 'two');
    await photo(sessionOwner('2026-09-02#0'), 'elsewhere');

    const moved = await moveMediaOwner(sessionOwner('2026-09-01#0'), sessionOwner('2026-09-05#0'));
    expect(moved).toBe(2);
    expect(await listMedia(sessionOwner('2026-09-01#0'))).toEqual([]);
    expect((await listMedia(sessionOwner('2026-09-05#0'))).map((m) => m.caption)).toEqual([
      'one',
      'two',
    ]);
    expect(await listMedia(sessionOwner('2026-09-02#0'))).toHaveLength(1);
  });

  it('keeps the captions and the blobs, not just the rows', async () => {
    const before = await photo(projectOwner('p1'), 'the crux');
    await moveMediaOwner(projectOwner('p1'), projectOwner('p2'));
    const after = (await listMedia(projectOwner('p2')))[0]!;
    expect(after.id).toBe(before.id);
    expect(after.caption).toBe('the crux');
    expect(after.blob.size).toBe(before.blob.size);
    expect(after.createdAt).toBe(before.createdAt);
  });

  it('adds to what is already there rather than replacing it', async () => {
    // A merge folds one session into another that may already have photos.
    await photo(sessionOwner('a'), 'kept');
    await photo(sessionOwner('b'), 'brought along');
    await moveMediaOwner(sessionOwner('b'), sessionOwner('a'));
    expect((await listMedia(sessionOwner('a'))).map((m) => m.caption)).toEqual([
      'kept',
      'brought along',
    ]);
  });

  it('does not enforce the per-owner cap', async () => {
    // Dropping photos to satisfy a limit would be the move quietly deleting
    // a climber's pictures to tidy up after itself.
    for (let i = 0; i < 6; i++) await photo(sessionOwner('a'), `a${i}`);
    for (let i = 0; i < 6; i++) await photo(sessionOwner('b'), `b${i}`);
    await moveMediaOwner(sessionOwner('b'), sessionOwner('a'));
    expect(await listMedia(sessionOwner('a'))).toHaveLength(12);
  });

  it('is a no-op when nothing is there or the key is unchanged', async () => {
    await photo(sessionOwner('a'));
    expect(await moveMediaOwner(sessionOwner('nothing'), sessionOwner('x'))).toBe(0);
    expect(await moveMediaOwner(sessionOwner('a'), sessionOwner('a'))).toBe(0);
    expect(await listMedia(sessionOwner('a'))).toHaveLength(1);
  });
});

describe('collecting photos whose owner is gone', () => {
  it('deletes what no session or project claims', async () => {
    await seedSession('2026-09-01#0');
    await seedProject('p1');
    await photo(sessionOwner('2026-09-01#0'));
    await photo(projectOwner('p1'));
    await photo(sessionOwner('2026-08-01#0'));
    await photo(projectOwner('gone'));

    expect(await sweepOrphanMedia()).toBe(2);
    expect(await ownersHeld()).toEqual(['project:p1', 'session:2026-09-01#0']);
  });

  it('leaves everything alone when every owner is alive', async () => {
    await seedSession('2026-09-01#0');
    await photo(sessionOwner('2026-09-01#0'));
    expect(await sweepOrphanMedia()).toBe(0);
    expect(await ownersHeld()).toEqual(['session:2026-09-01#0']);
  });

  it('never touches a namespace it cannot look up', async () => {
    // An unknown prefix means this module cannot tell a live owner from a
    // dead one, and guessing costs a climber their pictures.
    await photo('objective:o1');
    await photo('whatever');
    expect(await sweepOrphanMedia()).toBe(0);
    expect(await ownersHeld()).toEqual(['objective:o1', 'whatever']);
  });

  it('gives a deleted owner back its photos if the delete is undone first', async () => {
    // Deleting is undoable (PLAN.md M20), so the blobs outlive the record.
    // An undo that returns a project without its pictures is data loss with
    // a friendly label on it.
    await seedProject('p1');
    await photo(projectOwner('p1'), 'still here');
    const db = await getDb();
    await db.delete('projects', 'p1');
    expect(await listMedia(projectOwner('p1'))).toHaveLength(1);

    await seedProject('p1'); // the undo
    expect(await sweepOrphanMedia()).toBe(0);
    expect((await listMedia(projectOwner('p1')))[0]!.caption).toBe('still here');
  });

  it('collects them once the undo is no longer possible', async () => {
    await seedProject('p1');
    await photo(projectOwner('p1'));
    const db = await getDb();
    await db.delete('projects', 'p1');
    expect(await sweepOrphanMedia()).toBe(1);
    expect(await listMedia(projectOwner('p1'))).toEqual([]);
  });
});

describe('the order photos come back in', () => {
  it('is oldest first, across a real gap', async () => {
    await photo(projectOwner('p'), 'first');
    await tick();
    await photo(projectOwner('p'), 'second');
    expect((await listMedia(projectOwner('p'))).map((m) => m.caption)).toEqual(['first', 'second']);
  });

  it('keeps the order they were added in inside one millisecond', async () => {
    // The clock has millisecond resolution and the old comparator answered
    // 1 for a tie either way, so eight photos added in one tick came back in
    // whatever order the sort produced — and not the same one twice.
    for (let i = 0; i < 8; i++) await photo(projectOwner('p'), `c${i}`);
    const captions = (await listMedia(projectOwner('p'))).map((m) => m.caption);
    expect(captions).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    const again = (await listMedia(projectOwner('p'))).map((m) => m.caption);
    expect(again).toEqual(captions);
  });
});

describe('the owner keys themselves', () => {
  it('cannot collide between a session and a project', async () => {
    await photo(sessionOwner('x'));
    await photo(projectOwner('x'));
    expect(await listMedia(sessionOwner('x'))).toHaveLength(1);
    expect(await listMedia(projectOwner('x'))).toHaveLength(1);
  });

  it('still take everything with them on an explicit delete', async () => {
    await photo(sessionOwner('a'));
    await photo(sessionOwner('a'));
    expect(await deleteMediaFor(sessionOwner('a'))).toBe(2);
    expect(await listMedia(sessionOwner('a'))).toEqual([]);
  });
});

/**
 * Finding orphans is not sweeping them (PLAN.md M80).
 *
 * The data page has to say what is there before it offers to delete it, so
 * the scan was split out of the sweep. Node environment on purpose: a jsdom
 * blob round-tripped through fake-indexeddb comes back without a `size`, so
 * the byte count can only be asserted here.
 */
describe('finding orphan photos', () => {
  it('reports them without touching them', async () => {
    const db = await getDb();
    await db.put('projects', { id: 'gone', name: 'Deleted' } as never);
    await addMedia({ ownerId: projectOwner('gone'), blob: blob(), type: 'image/webp', width: 8, height: 6 });
    await db.delete('projects', 'gone');

    expect((await findOrphanMedia()).ids).toHaveLength(1);
    expect(await db.count('media'), 'finding them deleted them').toBe(1);
    // Repeatable, which a scan that destroyed as it went would not be.
    expect((await findOrphanMedia()).ids).toHaveLength(1);
  });

  it('measures what they cost', async () => {
    const db = await getDb();
    await db.put('projects', { id: 'gone', name: 'Deleted' } as never);
    await addMedia({ ownerId: projectOwner('gone'), blob: blob(), type: 'image/webp', width: 8, height: 6 });
    await db.delete('projects', 'gone');
    expect((await findOrphanMedia()).bytes).toBe(blob().size);
  });

  it('costs nothing when there are none', async () => {
    expect(await findOrphanMedia()).toEqual({ ids: [], bytes: 0 });
  });
});
