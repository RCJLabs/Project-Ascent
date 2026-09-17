// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { putMetricEntry } from '@/db/metrics';
import { loadPrograms } from '@/content/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { useSettings } from '@/store/settings';
import { MetricDetailPage } from './MetricDetailPage';

/**
 * Where a reading sits on the catalogue's ladder (PLAN.md M235).
 *
 * The engine is `standards.test.ts`. What is left for here is that the page
 * asks at all, that it reads in the climber's own notation, and that it says
 * nothing about the thirty metrics the catalogue has nothing to say about.
 */

async function open(
  metricId: string,
  readings: [string, number][] = [],
  font = false,
): Promise<void> {
  // Two renders in one test leave two copies in the body, and a check that
  // the old notation is *gone* would read the first one and pass.
  cleanup();
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (const [date, value] of readings) await putMetricEntry({ metricId, date, value } as never);
  await hydrate();
  // After `hydrate`, which reloads settings and would put this back.
  // `{ boulder, route }` — the first version wrote `{ V, YDS }` behind an
  // `as never`, which type-checked and set nothing.
  if (font) useSettings.setState({ display: { boulder: 'Font', route: 'YDS' } });
  renderAt(`/assessments/${metricId}`, <MetricDetailPage params={{ id: metricId }} />);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('what a reading qualifies you for', () => {
  it('places the latest reading between the floors either side of it', async () => {
    await open('dead_hang', [['2026-02-11', 52]]);
    // `45 sec`, not `45`: the floor goes through the same formatter the
    // reading does, so it carries the unit and the climber's own notation.
    expect(
      await screen.findByText(/Past 45 sec, which Gravity Defied and The Long Game ask for\./),
    ).toBeTruthy();
    expect(screen.getByText(/Iron Grip asks for 60 sec/)).toBeTruthy();
  });

  /**
   * And before the first test, which is the case the item was written about:
   * a first result with nothing to be placed against. The floor a climber is
   * working toward is worth knowing *before* they test, not after.
   */
  it('names the floor to aim at with nothing recorded at all', async () => {
    await open('dead_hang');
    expect(await screen.findByText(/Base Camp and The Cruiser ask for 30 sec\./)).toBeTruthy();
  });

  it('says so once every floor is behind', async () => {
    await open('dead_hang', [['2026-02-11', 95]]);
    expect(await screen.findByText(/Past every floor the catalogue sets/)).toBeTruthy();
    expect(screen.getByText(/the highest is the 60 sec Iron Grip asks for/)).toBeTruthy();
  });

  /**
   * A grade floor is stored as an ordinal, and `3` is not a grade anybody has
   * climbed. It goes through the same formatter the reading does, so a
   * climber reading Font sees Font.
   */
  it('reads a grade floor in the climber’s own notation', async () => {
    await open('max_boulder_grade', [['2026-02-11', 4]]);
    expect(await screen.findByText(/Past V3, which Lockdown asks for\./)).toBeTruthy();

    await open('max_boulder_grade', [['2026-02-11', 4]], true);
    const said = document.body.textContent ?? '';
    expect(said, 'the ladder is still in V').not.toMatch(/Past V3, which Lockdown/);
    expect(said).toMatch(/which Lockdown asks for/);
  });

  /**
   * Thirty of the thirty-seven metrics have no floor anywhere in the
   * catalogue, and the page says nothing rather than inventing one.
   */
  it('stays quiet about a metric the catalogue sets no floor for', async () => {
    await open('max_hang_20mm_7s', [['2026-02-11', 30]]);
    await screen.findByText('Max Hang 20mm 7s');
    expect(screen.queryByText(/asks for/)).toBeNull();
    expect(screen.queryByText(/Past every floor/)).toBeNull();
  });

  it('stays quiet where lower is better, rather than inverting the floor', async () => {
    await open('min_edge', [['2026-02-11', 12]]);
    await screen.findByText('Min Edge Achievable');
    expect(screen.queryByText(/asks for/)).toBeNull();
  });

  /** It reports. The finder is the thing that acts on these numbers. */
  it('neither congratulates nor warns', async () => {
    await open('dead_hang', [['2026-02-11', 20]]);
    const line = (await screen.findByText(/ask(s)? for 30 sec/)).textContent ?? '';
    expect(line).not.toMatch(/well done|great|only|just|short|should|need/i);
  });
});
