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
  upsertLedger,
  putWallet,
  type AscentRecords,
  type LedgerEntry,
  type Wallet,
} from '@/db/game';
import type { Mode } from '@/engine/ascent/game';
import type { Tape } from '@/engine/ascent/replay';
import { dayRun, recordDay, recoverDays } from '@/engine/ascent/history';
import { payoutFor, type AscentPayout } from '@/engine/ascent/rewards';
import type { BountySpec, Challenge, AcceptedBounty } from '@/engine/challenges';
import { today } from '@/engine/dates';
import { GAME_ACTION_CAP } from '@/engine/economy';
import { deriveXp, type XpState } from '@/engine/xp';
import { useProjects } from './projects';
import { useSessions } from './sessions';
import { useSettings } from './settings';

export interface GameState {
  hydrated: boolean;
  ledger: LedgerEntry[];
  bounties: AcceptedBounty[];
  wallet: Wallet;
  ascent: AscentRecords;
  load: () => Promise<void>;
  /**
   * Record a finished Ascent run. Bests only ever move up, and the day's
   * payout is re-priced on the best run rather than added to per run.
   */
  recordRun: (run: {
    mode: Mode;
    metres: number;
    coins: number;
    pure: boolean;
    date: string;
    rested: boolean;
    /** The inputs, so the day's best can be raced (PLAN.md M81). */
    tape?: Tape;
  }) => Promise<AscentPayout | null>;
  /** Append a game-lane award. The id is the idempotency guard, and the
   *  cap is applied on write so a bad caller cannot inflate the economy. */
  award: (entry: LedgerEntry) => Promise<void>;
  /** Bank a finished challenge. Ids are the challenge's own, so claiming
   *  twice is a no-op even across a reload. */
  claim: (challenge: Challenge) => Promise<void>;
  acceptBounty: (spec: BountySpec, cap?: number) => Promise<void>;
  abandonBounty: (id: string) => Promise<void>;
  spend: (amount: number) => Promise<void>;
  /**
   * Buy a kit. Returns false when the balance will not cover it, or when it
   * is already owned — a caller that asks twice must not be charged twice.
   */
  buy: (outfit: { name: string; price?: number }, balance: number) => Promise<boolean>;
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
      // The heights the old shape left in ledger labels, read back into
      // numbers exactly once (PLAN.md M96).
      const days = recoverDays(ascent.days, ledger);
      const recovered = days.length === ascent.days.length ? ascent : { ...ascent, days };
      if (recovered !== ascent) await putAscent(recovered);
      set({ ledger, wallet, bounties, ascent: recovered, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  award: async (entry) => {
    const capped = { ...entry, units: Math.min(entry.units, GAME_ACTION_CAP), source: 'game' as const };
    set({ ledger: await appendLedger(capped) });
  },

  recordRun: async ({ mode, metres, coins, pure, date, rested, tape }) => {
    const current = get().ascent;
    // The day is priced on its best run, so a worse one changes nothing —
    // and the day is kept rather than overwritten (PLAN.md M96).
    const run = { date, metres, coins, mode, ...(tape ? { tape } : {}) };
    const days = recordDay(current.days, run);
    // The day's kept record, which is `run` unless an earlier run today was
    // better. Never a recovered day: `recordDay` replaces one of those with
    // the real recording outright.
    const kept = dayRun(days, date);
    const daily = kept !== null && kept.recovered !== true ? kept : run;

    set({
      ascent: await putAscent({
        best: { ...current.best, [mode]: Math.max(current.best[mode], metres) },
        pureBest: pure ? Math.max(current.pureBest, metres) : current.pureBest,
        runs: current.runs + 1,
        days,
      }),
    });

    const payout = payoutFor(daily, rested);
    set({
      ledger: await upsertLedger({
        id: `ascent:${date}`,
        date,
        label: `The Ascent · ${daily.metres.toLocaleString()} m`,
        units: payout.units,
        origin: 'ascent',
        source: 'game',
      }),
    });
    return payout;
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
    const wallet = await putWallet({ ...get().wallet, spent: get().wallet.spent + amount });
    set({ wallet });
  },

  buy: async (outfit, balance) => {
    const price = outfit.price;
    if (price === undefined || price <= 0) return false;
    const current = get().wallet;
    const owned = current.owned ?? [];
    if (owned.includes(outfit.name)) return false;
    if (balance < price) return false;
    // One write, so a purchase cannot leave the coins gone and the kit
    // unowned, or the other way round.
    const wallet = await putWallet({ spent: current.spent + price, owned: [...owned, outfit.name] });
    set({ wallet });
    return true;
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
  const display = useSettings((s) => s.display);

  // `flat()` builds a new array every call, which would miss the cache in
  // engine/xp.ts on identical input — so the flattening is memoised on the
  // store's own object identity and the cache sees the same reference.
  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  return useMemo(
    () => deriveXp({ sessions, projects, ledger, display }),
    [sessions, projects, ledger, display],
  );
}

/** Spendable soft currency: earned over all time, minus what is spent. */
/** Kits this climber has bought. */
export function useOwned(): string[] {
  return useGame((s) => s.wallet.owned ?? EMPTY_OWNED);
}

const EMPTY_OWNED: string[] = [];

export function useCurrency(): { balance: number; earned: number; spent: number } {
  const xp = useXp();
  const spent = useGame((s) => s.wallet.spent);
  return { balance: Math.max(0, xp.earned - spent), earned: xp.earned, spent };
}
