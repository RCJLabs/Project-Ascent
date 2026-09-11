// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT, putAscent, getAscent, upsertLedger, type ClimbedDay } from '@/db/game';
import { addDays, today } from '@/engine/dates';
import { useGame } from '@/store/game';
import { renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';

/**
 * The day's wall stops being thrown away (PLAN.md M96).
 *
 * `engine/ascent/history.test.ts` proves the series. These prove the page
 * shows it, and that a climber who has been playing since before the
 * history existed does not start from nothing.
 */

const TODAY = today();
const back = (n: number) => addDays(TODAY, -n);

const climbed = (date: string, metres: number): ClimbedDay => ({ date, metres, coins: 2, mode: 'ascent' });

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  useGame.setState({ ledger: [], bounties: [], wallet: { spent: 0 }, ascent: EMPTY_ASCENT, hydrated: false });
});

async function open(days: ClimbedDay[]): Promise<void> {
  await putAscent({ ...EMPTY_ASCENT, days });
  await useGame.getState().load();
  renderAt('/ascent', <AscentPage />);
}

describe('the month behind you', () => {
  it('shows the days, not just today', async () => {
    await open([climbed(TODAY, 900), climbed(back(3), 400)]);
    expect(await screen.findByText('The month behind you')).toBeTruthy();
    // Four days of history, so four walls — the window stops at the first
    // one climbed rather than inventing a month of misses.
    expect(screen.getByText(/2 of the last 4 walls, 1,300 m in total/)).toBeTruthy();
  });

  // One wall is a score, not a history.
  it('stays away on a single day', async () => {
    await open([climbed(TODAY, 900)]);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('The month behind you')).toBeNull();
  });

  it('still shows today’s wall on the records card', async () => {
    await open([climbed(TODAY, 900), climbed(back(3), 400)]);
    await screen.findByText('The month behind you');
    expect(screen.getByText("Today's wall")).toBeTruthy();
  });

  /**
   * Yesterday's best is not today's: the wall is seeded from the date, and
   * a record left over from another day would price the payout and the
   * ghost on a wall that is not there.
   */
  it('says nothing about today when today has not been climbed', async () => {
    await open([climbed(back(1), 900), climbed(back(3), 400)]);
    await screen.findByText('The month behind you');
    expect(screen.queryByText("Today's wall")).toBeNull();
  });

  it('draws a bar for every day of the window', async () => {
    await open([climbed(TODAY, 900), climbed(back(29), 400)]);
    const chart = await screen.findByRole('img', { name: /of the last 30 daily walls climbed/ });
    expect(chart.children).toHaveLength(30);
  });

  it('draws only the days a climber could have played', async () => {
    await open([climbed(TODAY, 900), climbed(back(3), 400)]);
    const chart = await screen.findByRole('img', { name: /of the last 4 daily walls climbed/ });
    expect(chart.children).toHaveLength(4);
  });
});

describe('the days the ledger remembers', () => {
  /**
   * Before M96 the only trace of a past wall was the rewards label, which
   * reads "The Ascent · 1,063 m". This reads them back exactly once.
   */
  it('recovers a height the old shape left in a label', async () => {
    await upsertLedger({
      id: `ascent:${back(2)}`,
      date: back(2),
      label: 'The Ascent · 1,063 m',
      units: 0.2,
      origin: 'ascent',
      source: 'game',
    });
    await putAscent({ ...EMPTY_ASCENT, days: [climbed(TODAY, 400)] });
    await useGame.getState().load();

    const days = useGame.getState().ascent.days;
    expect(days.map((d) => d.date)).toEqual([back(2), TODAY]);
    expect(days[0]).toMatchObject({ metres: 1063, recovered: true });
  });

  // Written down, so the next load is not another parse of the same label.
  it('keeps what it recovered', async () => {
    await upsertLedger({
      id: `ascent:${back(2)}`,
      date: back(2),
      label: 'The Ascent · 500 m',
      units: 0.2,
      origin: 'ascent',
      source: 'game',
    });
    await useGame.getState().load();
    await waitFor(async () => expect((await getAscent()).days).toHaveLength(1));
  });

  it('leaves a label it cannot read alone', async () => {
    await upsertLedger({
      id: `ascent:${back(2)}`,
      date: back(2),
      label: 'The Ascent',
      units: 0.2,
      origin: 'ascent',
      source: 'game',
    });
    await useGame.getState().load();
    expect(useGame.getState().ascent.days).toEqual([]);
  });
});

describe('the single record the old shape kept', () => {
  it('is promoted into the history rather than dropped', async () => {
    await putAscent({ ...EMPTY_ASCENT, daily: climbed(back(1), 700) } as never);
    const records = await getAscent();
    expect(records.days).toEqual([climbed(back(1), 700)]);
    expect(records.daily).toBeNull();
  });

  // A record written since carries its own days, and the stale `daily`
  // beside it must not overwrite them.
  it('does not overwrite a history that already exists', async () => {
    await putAscent({ ...EMPTY_ASCENT, days: [climbed(TODAY, 900)], daily: climbed(back(9), 1) } as never);
    expect((await getAscent()).days).toEqual([climbed(TODAY, 900)]);
  });
});
