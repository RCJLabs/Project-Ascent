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
}

export const EMPTY_ASCENT: AscentRecords = {
  best: { ascent: 0, freesolo: 0 },
  pureBest: 0,
  runs: 0,
  days: [],
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

export async function getAscent(): Promise<AscentRecords> {
  const db = await getDb();
  const record = await db.get('game', ASCENT_KEY);
  const stored = { ...EMPTY_ASCENT, ...((record?.value as Partial<AscentRecords> | undefined) ?? {}) };
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
