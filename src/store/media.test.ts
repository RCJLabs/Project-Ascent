import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { addMedia, listMedia, projectOwner, sessionOwner, sweepOrphanMedia } from '@/db/media';
import { resetDbForTests } from '@/db/db';
import { newProject } from '@/db/projects';
import { useProjects } from './projects';
import { useSessions } from './sessions';

/**
 * Photos have to survive what the app does to their owner (PLAN.md M30).
 *
 * `media.test.ts` proves the database functions; this proves the stores
 * actually call them. A session's id encodes its date, so "move to a
 * different day" and "merge in" both destroy the key its pictures are filed
 * under — and both are buttons on the session editor.
 */

async function photo(owner: string, caption: string) {
  return addMedia({
    ownerId: owner,
    blob: new Blob([new Uint8Array(32)], { type: 'image/webp' }),
    type: 'image/webp',
    width: 10,
    height: 10,
    caption,
  });
}
const captions = async (owner: string) => (await listMedia(owner)).map((m) => m.caption);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useSessions.setState({ byDate: {}, hydrated: false });
  useProjects.setState({ projects: [], hydrated: false });
});

describe('re-dating a session', () => {
  it('takes its photos with it', async () => {
    const sessions = useSessions.getState();
    const session = await sessions.create('2026-09-01', { completed: true });
    await photo(sessionOwner(session.id), 'the board');

    const moved = await useSessions.getState().move(session, '2026-09-05');
    expect(moved.id).not.toBe(session.id);
    expect(await captions(sessionOwner(session.id))).toEqual([]);
    expect(await captions(sessionOwner(moved.id))).toEqual(['the board']);
  });

  it('leaves another day\'s photos where they are', async () => {
    const sessions = useSessions.getState();
    const a = await sessions.create('2026-09-01');
    const b = await useSessions.getState().create('2026-09-02');
    await photo(sessionOwner(a.id), 'mine');
    await photo(sessionOwner(b.id), 'not mine');

    await useSessions.getState().move(a, '2026-09-08');
    expect(await captions(sessionOwner(b.id))).toEqual(['not mine']);
  });
});

describe('merging one session into another', () => {
  it('brings the photos across rather than losing them with the id', async () => {
    const sessions = useSessions.getState();
    const a = await sessions.create('2026-09-01', { completed: true, durationMin: 60, rpe: 7 });
    const b = await useSessions.getState().create('2026-09-01', {
      completed: true,
      durationMin: 45,
      rpe: 7,
    });
    await photo(sessionOwner(a.id), 'kept');
    await photo(sessionOwner(b.id), 'folded in');

    const merged = await useSessions.getState().merge(a, b);
    expect(await captions(sessionOwner(b.id))).toEqual([]);
    expect(await captions(sessionOwner(merged.id))).toEqual(['kept', 'folded in']);
  });
});

describe('deleting an owner', () => {
  it('keeps a session\'s photos so the undo can hand them back', async () => {
    const session = await useSessions.getState().create('2026-09-01', { completed: true });
    await photo(sessionOwner(session.id), 'still here');

    await useSessions.getState().remove(session);
    expect(await captions(sessionOwner(session.id))).toEqual(['still here']);

    await useSessions.getState().restore(session);
    expect(await captions(sessionOwner(session.id))).toEqual(['still here']);
    expect(await sweepOrphanMedia()).toBe(0);
  });

  it('keeps a project\'s photos too', async () => {
    // This one used to delete them outright, so the undo handed back a
    // project whose pictures were silently gone.
    const project = await useProjects.getState().create(newProject({ name: 'Test', scale: 'V', grade: 'V5' }));
    await photo(projectOwner(project.id), 'the crux');

    await useProjects.getState().remove(project.id);
    expect(await captions(projectOwner(project.id))).toEqual(['the crux']);

    await useProjects.getState().restore(project);
    expect(await sweepOrphanMedia()).toBe(0);
    expect(await captions(projectOwner(project.id))).toEqual(['the crux']);
  });

  it('collects them once the delete stands', async () => {
    const session = await useSessions.getState().create('2026-09-01', { completed: true });
    await photo(sessionOwner(session.id), 'gone');
    await useSessions.getState().remove(session);

    expect(await sweepOrphanMedia()).toBe(1);
    expect(await captions(sessionOwner(session.id))).toEqual([]);
  });
});
