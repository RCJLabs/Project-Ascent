import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT, getAscent, putAscent } from '@/db/game';
import { NO_MODIFIERS } from '@/engine/ascent/game';
import type { Tape } from '@/engine/ascent/replay';
import { useSettings } from '@/store/settings';
import { useGame } from './game';
import { dayRun, heightFromLabel } from '@/engine/ascent/history';

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

/** Today's record, as the page reads it. */
function todayRecord(date = DAY) {
  const day = dayRun(useGame.getState().ascent.days, date);
  return day !== null && day.recovered !== true ? day : null;
}

async function run(metres: number, moves: number[] | null) {
  const t = moves === null ? {} : { tape: tape(1, moves) };
  await useGame.getState().recordRun({
    mode: 'ascent',
    metres,
    coins: 0,
    pure: true,
    date: DAY,
    rested: false,
    units: 'metric',
    endedBy: 'rock',
    ...t,
  });
}

describe('the tape of the day’s best', () => {
  it('is stored with it', async () => {
    await run(300, [10, 1]);
    expect(todayRecord()?.tape?.moves).toEqual([10, 1]);
    const stored = dayRun((await getAscent()).days, DAY);
    expect(stored?.recovered !== true ? stored?.tape?.moves : null).toEqual([10, 1]);
  });

  it('is replaced when the day’s best is', async () => {
    await run(300, [10, 1]);
    await run(700, [20, -1]);
    expect(todayRecord()?.metres).toBe(700);
    expect(todayRecord()?.tape?.moves).toEqual([20, -1]);
  });

  it('survives a worse run, because the record does', async () => {
    await run(700, [20, -1]);
    await run(100, [30, 1]);
    expect(todayRecord()?.metres).toBe(700);
    expect(todayRecord()?.tape?.moves).toEqual([20, -1]);
  });

  it('is dropped when a better run brought none', async () => {
    // A run past the move cap, or one finished on yesterday's wall: the
    // height is the record, so the old tape must not be left behind
    // claiming to be how it was climbed.
    await run(300, [10, 1]);
    await run(900, null);
    expect(todayRecord()?.metres).toBe(900);
    expect(todayRecord()?.tape).toBeUndefined();
  });

  it('starts fresh on a new day', async () => {
    await run(700, [20, -1]);
    await useGame.getState().recordRun({
      mode: 'ascent', metres: 50, coins: 0, pure: true, date: '2026-09-12', rested: false, units: 'metric', endedBy: 'rock',
    });
    expect(todayRecord('2026-09-12')?.date).toBe('2026-09-12');
    expect(todayRecord('2026-09-12')?.tape).toBeUndefined();
    // And yesterday is still there, which is the whole of M96 — with its
    // tape pruned, because only the newest wall can be raced.
    expect(todayRecord(DAY)?.metres).toBe(700);
    expect(todayRecord(DAY)?.tape).toBeUndefined();
  });
});

describe('the payout a finished run hands back', () => {
  it('reads in the units the run was recorded with (PLAN.md M210)', async () => {
    // The card shown when a run ends renders exactly this object, so a store
    // that priced it in metres put *1,621 ft* above *Best run · 494 m* —
    // which is what shipped for the length of one browser check.
    const payout = await useGame.getState().recordRun({
      mode: 'ascent', metres: 494, coins: 0, pure: true, date: DAY, rested: false,
      units: 'imperial', endedBy: 'rock',
    });
    expect(payout!.lines[0]!.label).toBe('Best run · 1,621 ft');
  });
});

describe('the ledger label the Ascent writes', () => {
  it('stays in metres whatever units the climber reads in (PLAN.md M210)', async () => {
    // Not a display string: `heightFromLabel` parses this back to recover
    // days written before M96, so it is a storage format that happens to be
    // readable. Localising it would also mean a day written in feet and
    // read after a switch to metric.
    useSettings.getState().setUnits('imperial');
    try {
      await run(1_063, null);
      const entry = useGame.getState().ledger.find((e) => e.origin === 'ascent');
      expect(entry?.label).toBe('The Ascent · 1,063 m');
      expect(heightFromLabel(entry!.label)).toBe(1_063);
    } finally {
      useSettings.getState().setUnits('imperial');
    }
  });
});

describe('the tally of how runs end (PLAN.md M214)', () => {
  it('counts every run, not the day’s best', async () => {
    // The day record keeps the best run only, and the ending of the one run
    // you did not die early on is the least representative sample there is.
    const record = (metres: number, endedBy: 'rock' | 'boulder' | 'debris') =>
      useGame.getState().recordRun({
        mode: 'ascent', metres, coins: 0, pure: true, date: DAY, rested: false,
        units: 'metric', endedBy,
      });
    await record(900, 'rock');
    await record(100, 'debris');
    await record(200, 'debris');
    const { endings } = useGame.getState().ascent;
    expect(endings).toEqual({ rock: 1, boulder: 0, debris: 2, metres: 1_200, counted: 3 });
  });

  it('leaves the tally alone for a run that ended some other way', async () => {
    await useGame.getState().recordRun({
      mode: 'ascent', metres: 300, coins: 0, pure: true, date: DAY, rested: false,
      units: 'metric', endedBy: null,
    });
    expect(useGame.getState().ascent.endings).toEqual({ ...EMPTY_ASCENT.endings });
    expect(useGame.getState().ascent.runs).toBe(1);
  });

  it('survives a record written before any of this existed', async () => {
    // No `endings` key at all, which is every record on disk today.
    const legacy = { best: { ascent: 5, freesolo: 0 }, pureBest: 0, runs: 4, days: [] };
    await putAscent(legacy as never);
    expect((await getAscent()).endings).toEqual(EMPTY_ASCENT.endings);
  });
});

describe('what a run tells the record about purity (PLAN.md M212)', () => {
  const play = (metres: number, pure: boolean) =>
    useGame.getState().recordRun({
      mode: 'ascent', metres, coins: 0, pure, date: DAY, rested: false,
      units: 'metric', endedBy: 'rock',
    });

  it('writes the height only when the run was pure', async () => {
    await play(900, false);
    expect('pureMetres' in (todayRecord() as object)).toBe(false);
    await play(600, true);
    expect((todayRecord() as { pureMetres?: number }).pureMetres).toBe(600);
  });

  it('keeps the day’s best pure run, not the day’s best run', async () => {
    await play(600, true);
    await play(900, false);
    expect(todayRecord()?.metres).toBe(900);
    expect((todayRecord() as { pureMetres?: number }).pureMetres).toBe(600);
  });
});
