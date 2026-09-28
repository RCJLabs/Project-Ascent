// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { newProject, putProject } from '@/db/projects';
import { useProjects } from './projects';

/**
 * What the projects store reads when it loads (PLAN.md M349).
 *
 * Two things, from two stores of the database: the projects, and the
 * suggestions the climber has waved away. M349 made the two reads one
 * `Promise.all` rather than one after the other, because the second
 * queued behind every other store's read at boot. Nothing held the second
 * one at all before this — a load that dropped it would have brought back
 * every suggestion a climber had dismissed, on every launch.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useProjects.setState({ hydrated: false, projects: [], dismissed: [] });
});

describe('loading the projects store', () => {
  it('brings back the projects', async () => {
    await putProject(newProject({ name: 'Midnight Lightning', grade: 'V8', scale: 'V' }));
    await useProjects.getState().load();
    expect(useProjects.getState().projects.map((p) => p.name)).toEqual(['Midnight Lightning']);
    expect(useProjects.getState().hydrated).toBe(true);
  });

  it('brings back the suggestions set aside, as a relaunch would find them', async () => {
    await useProjects.getState().dismiss('V6:the roof');
    await useProjects.getState().dismiss('V7:the arete');
    // A relaunch: nothing in memory, everything from the database.
    useProjects.setState({ hydrated: false, projects: [], dismissed: [] });
    await useProjects.getState().load();
    expect(useProjects.getState().dismissed).toEqual(['V6:the roof', 'V7:the arete']);
  });

  it('starts with none set aside on a fresh install', async () => {
    await useProjects.getState().load();
    expect(useProjects.getState().dismissed).toEqual([]);
    expect(useProjects.getState().hydrated).toBe(true);
  });
});
