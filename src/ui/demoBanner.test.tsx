// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { act, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resetDbForTests } from '@/db/db';
import { loadDemo, wipeDemo } from '@/db/demo';
import { putMetricEntry } from '@/db/metrics';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useSessions } from '@/store/sessions';
import { writesSettled } from '@/store/writes';
import { hydrate, renderAt, reset } from '@/test/render';
import { DemoBanner } from './DemoBanner';

/**
 * The sample-data banner answers from the stores (PLAN.md M353).
 *
 * It used to ask the database whenever the session log changed, and the
 * log changes on every write: each climb added to a session read every row
 * of the log back, and for a climber with no sample data every project and
 * every metric too. Measured in the browser at 20 to 45ms a climb at a
 * quarter CPU speed, and twice more at launch.
 */

const DAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const shown = () => screen.queryByText(/None of this happened/) !== null;

describe('what it shows', () => {
  /**
   * The wipe is by tag and a climber can delete records one at a time, so
   * any one of the three stores can be the last to hold the sample: each
   * has to be enough on its own.
   */
  it.each([
    ['a session', () => putSession({ ...newSession(DAY, 0), demo: true })],
    ['a project', () => putProject({ ...newProject({ name: 'Sample line', grade: 'V5', scale: 'V' }), demo: true })],
    ['a metric', () => putMetricEntry({ metricId: 'dead_hang', date: DAY, value: 30, demo: true })],
  ])('shows for %s tagged as sample data, and nothing else', async (_, put) => {
    await putSession(newSession(addDays(DAY, -1), 0));
    await put();
    await hydrate();
    renderAt('/', <DemoBanner />);
    expect(shown()).toBe(true);
  });

  it('shows nothing for a log with no sample data in it', async () => {
    await putSession(newSession(DAY, 0));
    await putProject(newProject({ name: 'Mine', grade: 'V5', scale: 'V' }));
    await putMetricEntry({ metricId: 'dead_hang', date: DAY, value: 30 });
    await hydrate();
    renderAt('/', <DemoBanner />);
    expect(shown()).toBe(false);
  });

  it('comes with the sample climber and goes with it, without a reload', async () => {
    renderAt('/', <DemoBanner />);
    expect(shown()).toBe(false);

    await act(async () => {
      await loadDemo();
      await hydrate();
    });
    await waitFor(() => expect(shown()).toBe(true));

    await act(async () => {
      await wipeDemo();
      await hydrate();
    });
    await waitFor(() => expect(shown()).toBe(false));
  });
});

describe('what it reads', () => {
  it('reads nothing back when a session is written', async () => {
    // A climber with no sample data: the case that used to read all three
    // stores in full, because nothing tagged stopped the search early.
    await putSession(newSession(DAY, 0));
    await putProject(newProject({ name: 'Mine', grade: 'V5', scale: 'V' }));
    await putMetricEntry({ metricId: 'dead_hang', date: DAY, value: 30 });
    await hydrate();
    renderAt('/', <DemoBanner />);

    const read = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const session = useSessions.getState().byDate[DAY]![0]!;
    await act(async () => {
      await useSessions.getState().update({ ...session, rpe: 6 });
      await writesSettled();
    });
    // The write landed, so the banner had its chance to ask.
    expect(useSessions.getState().byDate[DAY]![0]!.rpe).toBe(6);
    const whole = read.mock.contexts.map((store) => (store as { name: string }).name);
    expect(whole.filter((name) => ['sessions', 'projects', 'metrics'].includes(name))).toEqual([]);
  });

  it('does not reach the database at all', () => {
    const source = readFileSync('src/ui/DemoBanner.tsx', 'utf8');
    expect(source).not.toMatch(/from '@\/db\//);
  });
});
