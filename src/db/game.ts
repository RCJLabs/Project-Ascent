/**
 * The awards ledger (PLAN.md §7).
 *
 * Session XP is never stored — it is folded from the logs, so editing a
 * session corrects your level and no double-pay is possible. Two kinds of
 * award have no other record and so have to be written down: game-lane
 * events, and challenge-board claims. Both live here, append-only, keyed by
 * an id that makes a repeat write a no-op.
 *
 * `source` separates them for the economy. A game award is capped at
 * GAME_ACTION_CAP; a challenge resolves from the log and counts as real.
 */

import { getDb } from './db';
import { isDateKey } from '@/engine/dates';
import { NO_ENDINGS, type Endings } from '@/engine/ascent/endings';
import type { Tape } from '@/engine/ascent/replay';
import type { AcceptedBounty } from '@/engine/challenges';

export type LedgerSource = 'real' | 'game';

export interface LedgerEntry {
  id: string;
  date: string;
  label: string;
  /** Fraction of a level. Game entries are capped on write. */
  units: number;
  /** What produced it, e.g. 'ascent-run' or 'challenge'. */
  origin: string;
  /** Absent on records written before the board existed: those were all game. */
  source?: LedgerSource;
}

/** @deprecated Kept as an alias so older call sites keep type-checking. */
export type GameXpEntry = LedgerEntry;

export interface Wallet {
  /** Soft currency already spent. Earned is derived from total XP. */
  spent: number;
  /**
   * Kits bought, by name (PLAN.md M62).
   *
   * Stored rather than derived, because unlike everything else in the game
   * a purchase is not a reading of the log — nothing about the training says
   * it happened. It rides in the `game` store, so it is in the backup.
   */
  owned?: string[];
}

/** The best run on one day's wall, as the app recorded it (PLAN.md M96). */
export interface ClimbedDay {
  date: string;
  metres: number;
  coins: number;
  mode: 'ascent' | 'freesolo';
  /**
   * The best run that day with no power-up touched (PLAN.md M212).
   *
   * Its own number rather than a flag on the record, because the record
   * keeps the day's **highest** run: a climber whose best run took a heart
   * and whose second-best was pure and long would have had the pure one
   * thrown away by a boolean. Absent on every day written before M212, and
   * absent is not zero — it is unknown, which is why the achievement that
   * reads it treats a missing value as no evidence rather than as a failure.
   */
  pureMetres?: number;
  /**
   * The inputs that climbed it, so it can be raced (PLAN.md M81).
   *
   * Kept on the newest day and pruned from the rest: the wall is seeded
   * from the date, so replaying an older day's tape would draw a climber
   * dodging boulders that are not there — and a year of tapes is a hundred
   * times the bytes of a year of heights. Optional — every record written
   * before M81 has no tape, and a run past the move cap stores none.
   */
  tape?: Tape;
  recovered?: false;
}

/**
 * A day read back out of a rewards-ledger label rather than recorded
 * (PLAN.md M96).
 *
 * A separate shape rather than a record with optional fields, because it
 * genuinely knows less: the label carried a height and nothing else. Making
 * `coins` and `mode` optional everywhere would push that one day's
 * ignorance into every reader as a `?? 0`.
 */
export interface RecoveredDay {
  date: string;
  metres: number;
  recovered: true;
}

export type DayRecord = ClimbedDay | RecoveredDay;

export interface AscentRecords {
  /** Best height in metres, per mode. */
  best: { ascent: number; freesolo: number };
  /** Best run with no power-up touched. */
  pureBest: number;
  runs: number;
  /**
   * The best run on each day's wall, oldest first (PLAN.md M96).
   *
   * Before this there was one `daily` record and it was overwritten every
   * day, so a game built on "everyone gets the same wall, and a score is
   * comparable" kept nothing to compare. The single record survives below
   * only so an old one can be migrated.
   */
  days: DayRecord[];
  /** @deprecated Migrated into `days` on read. Never written. */
  daily?: DayRecord | null;
  /**
   * How the runs ended (PLAN.md M214).
   *
   * Not on `ClimbedDay`, which keeps the day's **best** run: the ending of
   * the one run you did not die early on is the least representative sample
   * available. This is a tally over every run instead.
   */
  endings: Endings;
}

export const EMPTY_ASCENT: AscentRecords = {
  best: { ascent: 0, freesolo: 0 },
  pureBest: 0,
  runs: 0,
  days: [],
  endings: NO_ENDINGS,
};

const ASCENT_KEY = 'ascent';
const LEDGER_KEY = 'game-xp';
const WALLET_KEY = 'wallet';
const BOUNTY_KEY = 'bounties';

export async function listLedger(): Promise<LedgerEntry[]> {
  const db = await getDb();
  const record = await db.get('game', LEDGER_KEY);
  const rows = (record?.value as LedgerEntry[] | undefined) ?? [];
  return [...rows].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

/**
 * Write an entry, replacing any with the same id.
 *
 * The one place the append-only rule bends, and deliberately: the Ascent
 * pays for your *best* run of the day, so a better run later has to revise
 * the day's entry rather than add a second one. The day still pays once.
 */
export async function upsertLedger(entry: LedgerEntry): Promise<LedgerEntry[]> {
  const db = await getDb();
  const rows = await listLedger();
  const next = [...rows.filter((r) => r.id !== entry.id), entry];
  await db.put('game', { key: LEDGER_KEY, value: next });
  return next;
}

export async function appendLedger(entry: LedgerEntry): Promise<LedgerEntry[]> {
  const db = await getDb();
  const rows = await listLedger();
  // Ids are the idempotency guard: one run, one claim, one award, however
  // many times the writer is called.
  if (rows.some((r) => r.id === entry.id)) return rows;
  const next = [...rows, entry];
  await db.put('game', { key: LEDGER_KEY, value: next });
  return next;
}

export async function listBounties(): Promise<AcceptedBounty[]> {
  const db = await getDb();
  const record = await db.get('game', BOUNTY_KEY);
  return (record?.value as AcceptedBounty[] | undefined) ?? [];
}

export async function putBounties(bounties: AcceptedBounty[]): Promise<AcceptedBounty[]> {
  const db = await getDb();
  await db.put('game', { key: BOUNTY_KEY, value: bounties });
  return bounties;
}

/**
 * A number the app could have written: finite, and never negative
 * (PLAN.md M221).
 *
 * Heights, counts and tallies are all of this shape. `Number.isFinite`
 * rejects `NaN` and both infinities, and it rejects a *string* — which
 * matters more than it looks, because `'9999' >= 2000` is `true` in
 * JavaScript and that is the Free Solo gate.
 */
function count(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * One day of the history, or nothing.
 *
 * A day without a usable date cannot be placed on the calendar or compared
 * to another, so there is no salvaging it — dropping the row keeps the rest
 * of a damaged file readable, which is the whole point of reading it field
 * by field rather than trusting the object.
 *
 * **The tape is passed through unexamined on purpose.** Checking it here
 * would mean importing `isTape`, and `replay.ts` reaches `ascent/config`
 * and the boons — the arcade's tuning tables, on the boot path, which is
 * the leak M214 exists to stop. It is already refused at the point of use:
 * `tapeToRace` runs `isTape` over it, bounds and all, before a ghost is
 * built from it.
 */
/** The tally, one counter at a time. */
function readEndings(value: unknown): Endings {
  const from = (typeof value === 'object' && value !== null ? value : {}) as Partial<Endings>;
  return {
    rock: count(from.rock),
    boulder: count(from.boulder),
    debris: count(from.debris),
    metres: count(from.metres),
    counted: count(from.counted),
  };
}

function readDay(value: unknown): DayRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  // Field by field rather than `Partial<ClimbedDay & RecoveredDay>`: that
  // intersection is `never`, because `ClimbedDay.recovered` is `false` and
  // `RecoveredDay.recovered` is `true`. The two shapes are a union on
  // purpose and this is the one place that has to read either.
  const day = value as {
    date?: unknown;
    metres?: unknown;
    coins?: unknown;
    mode?: unknown;
    pureMetres?: unknown;
    tape?: unknown;
    recovered?: unknown;
  };
  if (typeof day.date !== 'string' || !isDateKey(day.date)) return null;
  const metres = count(day.metres);
  if (day.recovered === true) return { date: day.date, metres, recovered: true };
  return {
    date: day.date,
    metres,
    coins: count(day.coins),
    // Anything else is not a mode this app has ever had.
    mode: day.mode === 'freesolo' ? 'freesolo' : 'ascent',
    ...(day.pureMetres !== undefined ? { pureMetres: count(day.pureMetres) } : {}),
    ...(day.tape !== undefined ? { tape: day.tape as ClimbedDay['tape'] } : {}),
  };
}

export async function getAscent(): Promise<AscentRecords> {
  const db = await getDb();
  const record = await db.get('game', ASCENT_KEY);
  const value = (record?.value as Partial<AscentRecords> | undefined) ?? {};
  /**
   * Read field by field, because a backup is whatever was in the file
   * (PLAN.md M221).
   *
   * This used to be a spread over `EMPTY_ASCENT`, which fills a *missing*
   * field and trusts a present one of any type. Measured, on a damaged
   * record: `days` as a string threw `input.days.reduce is not a function`
   * and took the Ascent page down; `best.ascent` as the string `'9999'`
   * drew **32,805 ft** on the records card and unlocked Free Solo, because
   * `'9999' >= 2000` is true.
   *
   * The same discipline `hydrateProfile` has had since M159, arriving in
   * the store that needed it second.
   */
  // No object check on `best`: M221's battery showed one could never fire.
  // `count` defends every field, so a `best` that is a string, a number or
  // null reaches the same `{ ascent: 0, freesolo: 0 }` either way — and a
  // line that cannot change a result is a line on the boot path for nothing
  // (the dead guard M198 removed, met again).
  const best = (value.best ?? {}) as Partial<AscentRecords['best']>;
  const stored: AscentRecords = {
    best: { ascent: count(best.ascent), freesolo: count(best.freesolo) },
    pureBest: count(value.pureBest),
    runs: count(value.runs),
    days: Array.isArray(value.days)
      ? value.days.map(readDay).filter((day): day is DayRecord => day !== null)
      : [],
    // `endings` is spread field by field rather than taken whole: a record
    // written before M214 has none at all, and one written before a *later*
    // field would otherwise arrive missing it (PLAN.md M214).
    endings: readEndings(value.endings),
    ...(value.daily !== undefined ? { daily: readDay(value.daily) } : {}),
  };
  // The one day the old shape kept, promoted into the history (PLAN.md
  // M96). Only when there is no history yet: a record written since carries
  // its own days and the stale `daily` beside it must not overwrite them.
  if (stored.days.length === 0 && stored.daily) {
    return { ...stored, days: [stored.daily], daily: null };
  }
  return { ...stored, daily: null };
}

export async function putAscent(records: AscentRecords): Promise<AscentRecords> {
  const db = await getDb();
  await db.put('game', { key: ASCENT_KEY, value: records });
  return records;
}

export async function getWallet(): Promise<Wallet> {
  const db = await getDb();
  const record = await db.get('game', WALLET_KEY);
  const wallet = record?.value as Wallet | undefined;
  // A wallet written before kits could be bought has no `owned` at all.
  return { spent: wallet?.spent ?? 0, owned: wallet?.owned ?? [] };
}

export async function putWallet(wallet: Wallet): Promise<Wallet> {
  const db = await getDb();
  await db.put('game', { key: WALLET_KEY, value: wallet });
  return wallet;
}
