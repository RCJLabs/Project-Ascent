/**
 * The game's stores are loaded at boot, through a fetch rather than an
 * import (PLAN.md M320).
 *
 * `hydrateAll` named `store/game.ts` among thirteen static imports, and that
 * one edge put ten modules and 9.05KB gzipped into the entry chunk — the
 * wallet, the ledger, the run history, the altimeter, the payout table, and
 * `engine/derive.ts`, which `engine/xp.ts` reads to price a level. Every
 * screen that shows any of it is a lazy route.
 *
 * It is a dynamic `import()` now and **still hydrated at boot**, which is the
 * half `perf.test.ts` cannot check: that guard would pass just as happily on
 * a `hydrateAll` that had dropped the game entirely, and the logger's
 * achievements card and the climber's avatar both read this store.
 *
 * Nothing here asserted it before. The whole of it was held by one static
 * import being present.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { appendLedger, putWallet } from '@/db/game';
import { hydrateAll } from './index';
import { useGame } from './game';

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useGame.setState({ hydrated: false, ledger: [], bounties: [], wallet: { spent: 0 } });
});

const entry = (id: string, units: number) => ({
  id,
  date: '2026-09-22',
  label: 'A run',
  units,
  origin: 'ascent-run',
  source: 'game' as const,
});

describe('booting', () => {
  it('leaves the game store loaded', async () => {
    await appendLedger(entry('run-1', 0.25));
    await putWallet({ spent: 3 });

    await hydrateAll();

    expect(useGame.getState().hydrated, 'the game store was never loaded').toBe(true);
    expect(useGame.getState().ledger.map((e) => e.id)).toEqual(['run-1']);
    expect(useGame.getState().wallet.spent).toBe(3);
  });

  it('waits for the game store rather than merely starting it', async () => {
    /**
     * That `hydrateAll` *awaits* the fetch, not just that it fires it.
     *
     * A battery mutant that dropped the await survived two attempts at this.
     * The first two tests below and above it never noticed, because with a
     * fake database the game load finishes before the assertions run; and an
     * attempt to catch it by reading `hydrationInProgress()` at the moment
     * the store hydrates failed for a sharper reason — the game's read is
     * *faster* than the twelve beside it, so even unawaited it lands inside
     * the guard. Neither is a test of the ordering; both are a test of which
     * IndexedDB read wins a race.
     *
     * So the game's load is made the slow one. `endHydration()` sits in the
     * `finally` of the same `try` as the loads, so a `hydrateAll` that
     * resolves without this one has already dropped the guard and left the
     * store to land against a reconcile that is over — the M114 bug, from
     * the one store that used to be immune to it by being imported.
     */
    const real = useGame.getState().load;
    let finished = false;
    useGame.setState({
      load: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        await real();
        finished = true;
      },
    });
    try {
      await hydrateAll();
      expect(finished, 'hydrateAll resolved without waiting for the game store').toBe(true);
    } finally {
      useGame.setState({ load: real });
    }
  });

  it('brings it back in step after an import', async () => {
    await hydrateAll();
    expect(useGame.getState().ledger).toEqual([]);

    // What an import does: the database changes underneath the stores, and
    // `hydrateAll` runs again. A game store loaded by whichever screen
    // happened to mount would be left showing the balance from before the
    // restore — which is the bug this function's header is about, and the
    // reason the fetch is inside it rather than at each screen.
    await appendLedger(entry('restored', 0.5));
    await putWallet({ spent: 11 });
    await hydrateAll();

    expect(useGame.getState().ledger.map((e) => e.id)).toEqual(['restored']);
    expect(useGame.getState().wallet.spent).toBe(11);
  });
});
