import { useMemo } from 'react';
import { create } from 'zustand';
import {
  EMPTY_ASCENT,
  appendLedger,
  getAscent,
  getWallet,
  listBounties,
  listLedger,
  putAscent,
  putBounties,
  putWallet,
  type AscentRecords,
  type LedgerEntry,
  type Wallet,
} from '@/db/game';
import type { BountySpec, Challenge, AcceptedBounty } from '@/engine/challenges';
import { today } from '@/engine/dates';
import { GAME_ACTION_CAP } from '@/engine/economy';
import { deriveXp, type XpState } from '@/engine/xp';
import { useProjects } from './projects';
import { useSessions } from './sessions';

export interface GameState {
  hydrated: boolean;
  ledger: LedgerEntry[];
  bounties: AcceptedBounty[];
  wallet: Wallet;
  ascent: AscentRecords;
  load: () => Promise<void>;
  /** Record a finished Ascent run. Bests only ever move up. */
  recordRun: (run: { mode: 'ascent' | 'freesolo'; metres: number; pure: boolean; date: string }) => Promise<void>;
  /** Append a game-lane award. The id is the idempotency guard, and the
   *  cap is applied on write so a bad caller cannot inflate the economy. */
  award: (entry: LedgerEntry) => Promise<void>;
  /** Bank a finished challenge. Ids are the challenge's own, so claiming
   *  twice is a no-op even across a reload. */
  claim: (challenge: Challenge) => Promise<void>;
  acceptBounty: (spec: BountySpec, cap?: number) => Promise<void>;
  abandonBounty: (id: string) => Promise<void>;
  spend: (amount: number) => Promise<void>;
}

/** Focus mechanic, same shape as the project cap. */
export const BOUNTY_CAP = 3;

export const useGame = create<GameState>((set, get) => ({
  hydrated: false,
  ledger: [],
  bounties: [],
  wallet: { spent: 0 },
  ascent: EMPTY_ASCENT,

  load: async () => {
    try {
      const [ledger, wallet, bounties, ascent] = await Promise.all([
        listLedger(),
        getWallet(),
        listBounties(),
        getAscent(),
      ]);
      set({ ledger, wallet, bounties, ascent, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  award: async (entry) => {
    const capped = { ...entry, units: Math.min(entry.units, GAME_ACTION_CAP), source: 'game' as const };
    set({ ledger: await appendLedger(capped) });
  },

  recordRun: async ({ mode, metres, pure, date }) => {
    const current = get().ascent;
    const daily =
      current.daily?.date === date
        ? { date, metres: Math.max(current.daily.metres, metres) }
        : { date, metres };
    set({
      ascent: await putAscent({
        best: { ...current.best, [mode]: Math.max(current.best[mode], metres) },
        pureBest: pure ? Math.max(current.pureBest, metres) : current.pureBest,
        runs: current.runs + 1,
        daily,
      }),
    });
  },

  claim: async (challenge) => {
    set({
      ledger: await appendLedger({
        id: `claim:${challenge.id}`,
        date: today(),
        label: challenge.title,
        units: challenge.reward,
        origin: `challenge:${challenge.kind}`,
        source: 'real',
      }),
    });
    // A finished bounty makes room for the next one.
    if (challenge.kind === 'bounty') {
      set({ bounties: await putBounties(get().bounties.filter((b) => b.id !== challenge.id)) });
    }
  },

  acceptBounty: async (spec, cap = BOUNTY_CAP) => {
    const current = get().bounties;
    if (current.length >= cap || current.some((b) => b.spec.key === spec.key)) return;
    const bounty: AcceptedBounty = {
      id: `bounty-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      spec,
      // A timestamp, not a date: work already logged today must not count.
      acceptedAt: new Date().toISOString(),
    };
    set({ bounties: await putBounties([...current, bounty]) });
  },

  abandonBounty: async (id) => {
    set({ bounties: await putBounties(get().bounties.filter((b) => b.id !== id)) });
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
    return deriveXp({ sessions, projects, ledger });
  }, [byDate, projects, ledger]);
}

/** Spendable soft currency: earned over all time, minus what is spent. */
export function useCurrency(): { balance: number; earned: number; spent: number } {
  const xp = useXp();
  const spent = useGame((s) => s.wallet.spent);
  return { balance: Math.max(0, xp.earned - spent), earned: xp.earned, spent };
}
