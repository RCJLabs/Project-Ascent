import { useMemo } from 'react';
import { create } from 'zustand';
import {
  appendGameXp,
  getWallet,
  listGameXp,
  putWallet,
  type GameXpEntry,
  type Wallet,
} from '@/db/game';
import { GAME_ACTION_CAP } from '@/engine/economy';
import { deriveXp, type XpState } from '@/engine/xp';
import { useProjects } from './projects';
import { useSessions } from './sessions';

export interface GameState {
  hydrated: boolean;
  ledger: GameXpEntry[];
  wallet: Wallet;
  load: () => Promise<void>;
  /** Append a game-lane award. The id is the idempotency guard, and the
   *  cap is applied on write so a bad caller cannot inflate the economy. */
  award: (entry: GameXpEntry) => Promise<void>;
  spend: (amount: number) => Promise<void>;
}

export const useGame = create<GameState>((set, get) => ({
  hydrated: false,
  ledger: [],
  wallet: { spent: 0 },

  load: async () => {
    try {
      const [ledger, wallet] = await Promise.all([listGameXp(), getWallet()]);
      set({ ledger, wallet, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  award: async (entry) => {
    const capped = { ...entry, units: Math.min(entry.units, GAME_ACTION_CAP) };
    set({ ledger: await appendGameXp(capped) });
  },

  spend: async (amount) => {
    const wallet = await putWallet({ spent: get().wallet.spent + amount });
    set({ wallet });
  },
}));

/**
 * The climber's XP, folded from everything that earned it.
 *
 * A hook rather than stored state: real XP has no independent existence, it
 * is a reading of the log. Anything that changes a session, a project or the
 * ledger re-derives it on the next render, so the number on screen can never
 * disagree with the history behind it.
 */
export function useXp(): XpState {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const ledger = useGame((s) => s.ledger);

  return useMemo(() => {
    const sessions = Object.values(byDate).flat();
    return deriveXp({ sessions, projects, gameXp: ledger });
  }, [byDate, projects, ledger]);
}

/** Spendable soft currency: earned over all time, minus what is spent. */
export function useCurrency(): { balance: number; earned: number; spent: number } {
  const xp = useXp();
  const spent = useGame((s) => s.wallet.spent);
  return { balance: Math.max(0, xp.earned - spent), earned: xp.earned, spent };
}
