// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT, getWallet } from '@/db/game';
import { GAME_ACHIEVEMENTS, gameAchievements } from '@/engine/achievements';
import { WALLS, shopWalls, wall } from '@/engine/ascent/walls';
import { shopOutfits } from '@/engine/kits';
import { useGame } from '@/store/game';
import { playableCanvas } from '@/test/canvas';
import { renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';

/**
 * Buying and picking a wall (PLAN.md M227).
 *
 * The engine can be right about every unlock and the page can still read the
 * wrong bucket, spend from the wrong balance, or write a wallet that drops
 * half of itself — which is the one that nearly shipped.
 */

const cheapest = shopWalls()[0]!;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  useGame.setState({
    ledger: [], bounties: [], ascent: EMPTY_ASCENT, hydrated: false,
    wallet: { spent: 0, owned: [], walls: [], wall: null },
  });
});

/** Coins are a quarter of an XP point, folded from the ledger. */
async function withCoins(levels: number): Promise<void> {
  // `load()` sets the ledger from the database, so the seed goes in after
  // it. The other way round the balance is always zero and half of this
  // file passes for the wrong reason.
  await useGame.getState().load();
  useGame.setState({
    ledger: levels > 0
      ? [{ id: 'seed', date: '2026-01-01', label: 'seed', units: levels, origin: 'test', source: 'real' }]
      : [],
  });
  renderAt('/ascent', <AscentPage />);
}

const row = (name: string): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^(Wall: )?${name}\\b`) });

describe('the wall picker', () => {
  it('starts on Automatic, which is what every climber already had', async () => {
    await withCoins(0);
    expect(row('Automatic').getAttribute('aria-pressed')).toBe('true');
    expect(row('Granite').getAttribute('aria-pressed')).toBe('false');
  });

  it('pins a free wall and keeps it', async () => {
    await withCoins(0);
    fireEvent.click(row('Granite'));
    await waitFor(() => expect(useGame.getState().wallet.wall).toBe('granite'));
    expect(row('Automatic').getAttribute('aria-pressed')).toBe('false');
    expect((await getWallet()).wall).toBe('granite');
  });

  it('shows the price of a wall that is not yours, and will not pin it', async () => {
    await withCoins(0);
    const locked = row(cheapest.name);
    expect(locked.getAttribute('aria-label')).toContain(cheapest.price!.toLocaleString());
    expect(locked.hasAttribute('disabled')).toBe(true);
    fireEvent.click(locked);
    expect(useGame.getState().wallet.wall).toBeNull();
    expect(useGame.getState().wallet.spent).toBe(0);
  });

  it('buys, pins and pays for it in one tap', async () => {
    // Waited on the *pin*, which is the second of the two writes: buying
    // resolves first and pinning follows it. Waiting on the purchase and
    // then asserting the pin is a race, and it passed here until a no-op
    // mutation shifted the timing by a few milliseconds and it did not.
    await withCoins(400);
    fireEvent.click(row(cheapest.name));
    await waitFor(() => expect(useGame.getState().wallet.wall).toBe(cheapest.id));
    expect(useGame.getState().wallet.walls).toContain(cheapest.id);
    expect(useGame.getState().wallet.spent).toBe(cheapest.price);
  });

  it('is never charged for the same wall twice', async () => {
    await withCoins(400);
    const price = cheapest.price! * 3;
    expect(await useGame.getState().buyWall(cheapest, price)).toBe(true);
    expect(await useGame.getState().buyWall(cheapest, price)).toBe(false);
    expect(useGame.getState().wallet.spent).toBe(cheapest.price);
  });
});

describe('the two buckets', () => {
  it('keeps kits and walls apart, both ways', async () => {
    /**
     * Three walls and three kits share a name, so one list would have buying
     * a kit hand you a wall. And **the wallet is one record**: writing it
     * back from the two fields a kit cares about would drop the walls and
     * the chosen wall on every kit bought — which is what the code did
     * before this milestone generalised it, and what this catches.
     */
    await withCoins(4_000);
    const kit = shopOutfits()[0]!;
    const balance = 999_999;
    expect(await useGame.getState().buyWall(cheapest, balance)).toBe(true);
    await useGame.getState().chooseWall(cheapest.id);
    expect(await useGame.getState().buy(kit, balance)).toBe(true);

    const after = await getWallet();
    expect(after.owned).toEqual([kit.name]);
    expect(after.walls).toEqual([cheapest.id]);
    expect(after.wall).toBe(cheapest.id);
    expect(after.spent).toBe(cheapest.price! + kit.price!);

    // And the other way: a wall bought after a kit does not drop the kit.
    const second = shopWalls()[1]!;
    expect(await useGame.getState().buyWall(second, balance)).toBe(true);
    expect((await getWallet()).owned).toEqual([kit.name]);
  });

  it('does not let a kit name buy a wall', async () => {
    await withCoins(4_000);
    const kit = shopOutfits()[0]!;
    expect(await useGame.getState().buy(kit, 999_999)).toBe(true);
    expect(useGame.getState().wallet.walls).toEqual([]);
    // Granite is both a kit and a wall; owning neither means the wall row
    // is still a free one and the kit is not a wall.
    expect(wall('granite')!.price).toBeUndefined();
  });
});

describe('every wall is reachable', () => {
  it('offers all of them, and Automatic', async () => {
    await withCoins(0);
    for (const w of WALLS) expect(row(w.name), w.id).toBeTruthy();
    expect(row('Automatic')).toBeTruthy();
  });
});

describe('the achievement a run can earn (PLAN.md M229)', () => {
  /**
   * `no-takes` is the one achievement that is not in the training log
   * (M212), so the reward card after a session can never report it. It is
   * reported where it happens instead, and compared before against after —
   * otherwise every run after the one that earned it claims it again.
   *
   * **A run cannot earn it in jsdom**: it wants a pure run past El Capitan
   * and the wall ends an unsteered run in seconds. So the qualifying day is
   * put into the record *while the run is in the air* — `hadRef` was taken
   * when it started, the reading after it lands differs, and that is exactly
   * the transition. `runEarned` is tested directly for the decision itself.
   */
  const PURE = {
    date: '2026-01-02',
    metres: 99_999,
    coins: 0,
    mode: 'ascent' as const,
    pureMetres: 99_999,
  };

  /** Let the run get airborne, then make the record qualify. */
  async function qualifyMidRun(): Promise<void> {
    await new Promise((r) => setTimeout(r, 60));
    await act(async () => {
      const game = useGame.getState();
      useGame.setState({ ascent: { ...game.ascent, days: [PURE, ...game.ascent.days] } });
    });
  }

  it('reports it on the run that earned it, and not on the next one', async () => {
    const stop = playableCanvas();
    try {
      await useGame.getState().load();
      renderAt('/ascent', <AscentPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Climb/ }));
      await qualifyMidRun();
      // The run lands and the page asks what changed.
      expect(await screen.findByText('No Takes', undefined, { timeout: 15_000 })).toBeTruthy();
      expect(screen.getByText('Achievement')).toBeTruthy();

      // The next run holds it already, so it says nothing — which is the
      // whole reason this is a comparison and not "do I hold it".
      fireEvent.click(screen.getByRole('button', { name: /Again/ }));
      await waitFor(() => expect(screen.queryByText('No Takes')).toBeNull());
      await screen.findByRole('button', { name: /Again/ }, { timeout: 15_000 });
      await waitFor(() => expect(useGame.getState().ascent.runs).toBeGreaterThan(1));
      // `runs` is set by `recordRun` and the report is the continuation of
      // the promise it returns, so seeing the count move is not the question
      // having been asked. One turn of the queue is: the callback is already
      // scheduled by then, and `act` flushes the render it causes.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByText('No Takes')).toBeNull();
      expect(screen.queryByText('Achievement')).toBeNull();
    } finally {
      stop();
    }
  }, 40_000);

  it('says nothing on a run that earned nothing', async () => {
    const stop = playableCanvas();
    try {
      await useGame.getState().load();
      renderAt('/ascent', <AscentPage />);
      fireEvent.click(await screen.findByRole('button', { name: /Climb/ }));
      await screen.findByRole('button', { name: /Again/ }, { timeout: 15_000 });
      // `setPhase('over')` is synchronous and the report happens once
      // `recordRun` resolves, so *Again* being on screen is not the run
      // having landed. Two mutants survived a version of this that assumed
      // it was.
      await waitFor(() => expect(useGame.getState().ascent.runs).toBeGreaterThan(0));
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(screen.queryByText('Achievement')).toBeNull();
      expect(screen.queryByText('No Takes')).toBeNull();
    } finally {
      stop();
    }
  }, 30_000);

  it('holds the whole list to what the game can earn', () => {
    // A definition that stopped reading the sessions would go unreported by
    // the run card and unreportable by the session card. `achievements.test`
    // holds the list complete; this holds the page to that list.
    expect(GAME_ACHIEVEMENTS).toContain('no-takes');
    expect(gameAchievements([]).map((a) => a.id)).toEqual([...GAME_ACHIEVEMENTS]);
  });
});
