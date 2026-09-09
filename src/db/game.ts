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
}

const LEDGER_KEY = 'game-xp';
const WALLET_KEY = 'wallet';
const BOUNTY_KEY = 'bounties';

export async function listLedger(): Promise<LedgerEntry[]> {
  const db = await getDb();
  const record = await db.get('game', LEDGER_KEY);
  const rows = (record?.value as LedgerEntry[] | undefined) ?? [];
  return [...rows].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
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

export async function getWallet(): Promise<Wallet> {
  const db = await getDb();
  const record = await db.get('game', WALLET_KEY);
  return (record?.value as Wallet | undefined) ?? { spent: 0 };
}

export async function putWallet(wallet: Wallet): Promise<Wallet> {
  const db = await getDb();
  await db.put('game', { key: WALLET_KEY, value: wallet });
  return wallet;
}
