import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ascentHistory } from '@/engine/ascent/history';
import { FREE_SOLO_UNLOCK } from '@/engine/ascent/unlock';
import { getDb, resetDbForTests } from './db';
import { EMPTY_ASCENT, getAscent, putAscent, type AscentRecords } from './game';

/**
 * A backup is whatever was in the file (PLAN.md M221).
 *
 * `getAscent` was a spread over `EMPTY_ASCENT`, which fills a *missing*
 * field and trusts a present one of any type. The two symptoms below were
 * measured before the fix rather than imagined: a `days` that is not an
 * array **threw** and took the Ascent page with it, and a `best.ascent`
 * holding the string `'9999'` drew 32,805 ft on the records card and
 * unlocked Free Solo — because `'9999' >= 2000` is `true`.
 *
 * This is the discipline `hydrateProfile` has had since M159, arriving in
 * the store that needed it second.
 */

async function stored(value: unknown): Promise<AscentRecords> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  const db = await getDb();
  await db.put('game', { key: 'ascent', value } as never);
  return getAscent();
}

const SOUND = { best: { ascent: 900, freesolo: 400 }, pureBest: 700, runs: 12, days: [] };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('reading a record that is what the app wrote', () => {
  it('changes nothing about it', async () => {
    // The control. A guard that rejects everything passes every test below
    // and breaks the app, which is the trap a validator falls into.
    const read = await stored(SOUND);
    expect(read.best).toEqual({ ascent: 900, freesolo: 400 });
    expect(read.pureBest).toBe(700);
    expect(read.runs).toBe(12);
  });

  it('round-trips a full record through its own writer', async () => {
    const full: AscentRecords = {
      ...EMPTY_ASCENT,
      best: { ascent: 1200, freesolo: 800 },
      pureBest: 1100,
      runs: 40,
      days: [
        { date: '2026-09-15', metres: 1200, coins: 9, mode: 'ascent', pureMetres: 1200 },
        { date: '2026-09-14', metres: 300, recovered: true },
      ],
      endings: { rock: 4, boulder: 2, debris: 3, metres: 5_000, counted: 9 },
    };
    await putAscent(full);
    expect(await getAscent()).toEqual({ ...full, daily: null });
  });
});

describe('reading one that is not', () => {
  it('refuses a height that is a string, which would otherwise open the gate', async () => {
    // The measured one. `'9999' >= FREE_SOLO_UNLOCK` is true in JavaScript.
    const read = await stored({ ...SOUND, best: { ascent: '9999', freesolo: 0 } });
    expect(read.best.ascent).toBe(0);
    expect(read.best.ascent >= FREE_SOLO_UNLOCK).toBe(false);
  });

  it('refuses NaN, an infinity and a negative height', async () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const read = await stored({ ...SOUND, best: { ascent: bad, freesolo: 0 } });
      expect(read.best.ascent, String(bad)).toBe(0);
    }
  });

  it('survives a `best` that is not an object at all', async () => {
    const read = await stored({ ...SOUND, best: 'lots' });
    expect(read.best).toEqual({ ascent: 0, freesolo: 0 });
  });

  it('survives a `days` that is not an array, which used to throw', async () => {
    // `input.days.reduce is not a function`, measured, on the page that
    // opens the game.
    const read = await stored({ ...SOUND, days: 'nope' });
    expect(read.days).toEqual([]);
    expect(() => ascentHistory({ days: read.days, to: '2026-09-16' })).not.toThrow();
  });

  it('drops a day that cannot be placed on a calendar, and keeps the rest', async () => {
    const read = await stored({
      ...SOUND,
      days: [
        { metres: 5 },
        { date: 'the fourth', metres: 5, coins: 0, mode: 'ascent' },
        { date: '2026-13-45', metres: 5, coins: 0, mode: 'ascent' },
        { date: '2026-09-15', metres: 900, coins: 4, mode: 'ascent' },
        null,
        'a day',
      ],
    });
    expect(read.days).toEqual([{ date: '2026-09-15', metres: 900, coins: 4, mode: 'ascent' }]);
  });

  it('repairs a day rather than dropping it when only a number is wrong', async () => {
    // A date is what makes a day a day. A height that arrived as a string
    // is a lost number, not a lost day — the row still says you played.
    const read = await stored({
      ...SOUND,
      days: [{ date: '2026-09-15', metres: '900', coins: null, mode: 'sideways' }],
    });
    expect(read.days).toEqual([{ date: '2026-09-15', metres: 0, coins: 0, mode: 'ascent' }]);
  });

  it('keeps a recovered day as recovered', async () => {
    const read = await stored({ ...SOUND, days: [{ date: '2026-09-15', metres: 400, recovered: true }] });
    expect(read.days).toEqual([{ date: '2026-09-15', metres: 400, recovered: true }]);
  });

  it('fills a tally that is missing, damaged or not an object', async () => {
    for (const bad of [undefined, null, 'none', { rock: 'four', boulder: 2 }]) {
      const read = await stored({ ...SOUND, endings: bad });
      expect(read.endings.rock, String(bad)).toBe(0);
      expect(read.endings.counted, String(bad)).toBe(0);
    }
    const partial = await stored({ ...SOUND, endings: { rock: 'four', boulder: 2 } });
    // The sound field beside the damaged one survives.
    expect(partial.endings.boulder).toBe(2);
  });

  it('passes a tape through, because the gate for that is where it is used', async () => {
    // Checking it here would import `isTape`, and `replay.ts` reaches the
    // arcade's tuning tables — on the boot path, which is M214's leak.
    // `tapeToRace` runs the real check, bounds and all.
    const tape = { seed: 1, mode: 'ascent', ticks: 10, moves: [], modifiers: { rampReduction: 99 } };
    const read = await stored({
      ...SOUND,
      days: [{ date: '2026-09-15', metres: 900, coins: 4, mode: 'ascent', tape }],
    });
    expect((read.days[0] as { tape?: unknown }).tape).toEqual(tape);
  });

  it('reads an empty record as an empty record', async () => {
    expect(await stored({})).toEqual({ ...EMPTY_ASCENT, daily: null });
    expect(await getAscent()).toEqual({ ...EMPTY_ASCENT, daily: null });
  });
});
