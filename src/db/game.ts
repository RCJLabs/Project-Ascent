/**
 * The game lane's ledger (PLAN.md §7).
 *
 * Real climbing XP is never stored — it is folded from the logs, so editing
 * a session corrects your level and no double-pay is possible. Game-lane
 * events have no other record, so they are the one thing that has to be
 * written down: an append-only ledger of small, capped awards.
 */

import { getDb } from './db';

export interface GameXpEntry {
  id: string;
  date: string;
  label: string;
  /** Fraction of a level, capped on write at GAME_ACTION_CAP. */
  units: number;
  /** What produced it, e.g. 'ascent-run'. */
  origin: string;
}

export interface Wallet {
  /** Soft currency already spent. Earned is derived from total XP. */
  spent: number;
}

const LEDGER_KEY = 'game-xp';
const WALLET_KEY = 'wallet';

export async function listGameXp(): Promise<GameXpEntry[]> {
  const db = await getDb();
  const record = await db.get('game', LEDGER_KEY);
  const rows = (record?.value as GameXpEntry[] | undefined) ?? [];
  return [...rows].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

export async function appendGameXp(entry: GameXpEntry): Promise<GameXpEntry[]> {
  const db = await getDb();
  const rows = await listGameXp();
  // Ids are the idempotency guard: one run, one award, however many times
  // the writer is called.
  if (rows.some((r) => r.id === entry.id)) return rows;
  const next = [...rows, entry];
  await db.put('game', { key: LEDGER_KEY, value: next });
  return next;
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
