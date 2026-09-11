import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT, getAscent } from '@/db/game';
import { NO_MODIFIERS } from '@/engine/ascent/game';
import type { Tape } from '@/engine/ascent/replay';
import { useGame } from './game';

/**
 * The day's best keeps the inputs that climbed it (PLAN.md M81).
 *
 * `replay.test.ts` proves a tape replays its run. This proves the store
 * files the right one: the tape has to travel with the height it belongs
 * to, or the ghost on tomorrow's wall is a run nobody climbed.
 */

function tape(seed: number, moves: number[]): Tape {
  return { seed, mode: 'ascent', ticks: 500, moves, modifiers: NO_MODIFIERS };
}

const DAY = '2026-09-11';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  useGame.setState({ ledger: [], bounties: [], wallet: { spent: 0 }, ascent: EMPTY_ASCENT, hydrated: false });
});

async function run(metres: number, moves: number[] | null) {
  const t = moves === null ? {} : { tape: tape(1, moves) };
  await useGame.getState().recordRun({
    mode: 'ascent',
    metres,
    coins: 0,
    pure: true,
    date: DAY,
    rested: false,
    ...t,
  });
}

describe('the tape of the day’s best', () => {
  it('is stored with it', async () => {
    await run(300, [10, 1]);
    expect(useGame.getState().ascent.daily?.tape?.moves).toEqual([10, 1]);
    expect((await getAscent()).daily?.tape?.moves).toEqual([10, 1]);
  });

  it('is replaced when the day’s best is', async () => {
    await run(300, [10, 1]);
    await run(700, [20, -1]);
    expect(useGame.getState().ascent.daily?.metres).toBe(700);
    expect(useGame.getState().ascent.daily?.tape?.moves).toEqual([20, -1]);
  });

  it('survives a worse run, because the record does', async () => {
    await run(700, [20, -1]);
    await run(100, [30, 1]);
    expect(useGame.getState().ascent.daily?.metres).toBe(700);
    expect(useGame.getState().ascent.daily?.tape?.moves).toEqual([20, -1]);
  });

  it('is dropped when a better run brought none', async () => {
    // A run past the move cap, or one finished on yesterday's wall: the
    // height is the record, so the old tape must not be left behind
    // claiming to be how it was climbed.
    await run(300, [10, 1]);
    await run(900, null);
    expect(useGame.getState().ascent.daily?.metres).toBe(900);
    expect(useGame.getState().ascent.daily?.tape).toBeUndefined();
  });

  it('starts fresh on a new day', async () => {
    await run(700, [20, -1]);
    await useGame.getState().recordRun({
      mode: 'ascent', metres: 50, coins: 0, pure: true, date: '2026-09-12', rested: false,
    });
    expect(useGame.getState().ascent.daily?.date).toBe('2026-09-12');
    expect(useGame.getState().ascent.daily?.tape).toBeUndefined();
  });
});
