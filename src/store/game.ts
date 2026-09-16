import { useMemo } from 'react';
import { reportDbError } from '@/db/db';
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
import { recordEnding } from '@/engine/ascent/endings';
import type { ObstacleKind } from '@/engine/ascent/game';
import { payoutFor, type AscentPayout } from '@/engine/ascent/rewards';
import type { UnitSystem } from '@/engine/units';
import type { BountySpec, Challenge, AcceptedBounty } from '@/engine/challenges';
import { today } from '@/engine/dates';
import { deriveXp, type XpState } from '@/engine/xp';
import { useProjects } from './projects';
import { useAllSessions } from './sessions';
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
    /**
     * The climber's units, for the payout this hands back (PLAN.md M210).
     *
     * Display, not storage: it reaches `payoutFor` only so the *Best run ·
     * 3,488 ft* line reads in the same unit as the screen around it. Nothing
     * written below depends on it — the economy units are a fraction of a
     * level either way, and the ledger label stays metres on purpose.
     *
     * Passed in rather than read off the settings store here, so the one
     * place that knows a display preference is the screen.
     */
    units: UnitSystem;
    /**
     * What ended the run, or null when nothing did (PLAN.md M214).
     *
     * Nullable because a run can in principle reach here without a fatal
     * collision, and a tally that counted those would have a denominator
     * bigger than the deaths in it.
     */
    endedBy: ObstacleKind | null;
    mode: Mode;
    metres: number;
    coins: number;
    pure: boolean;
    date: string;
    rested: boolean;
    /** The inputs, so the day's best can be raced (PLAN.md M81). */
    tape?: Tape;
  }) => Promise<AscentPayout | null>;
  /** Bank a finished challenge. Ids are the challenge's own, so claiming
   *  twice is a no-op even across a reload. */
  claim: (challenge: Challenge) => Promise<void>;
  acceptBounty: (spec: BountySpec, cap?: number) => Promise<void>;
  abandonBounty: (id: string) => Promise<void>;
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
    } catch (error) {
      // Hydrated, because the app has to render — but the reason is kept
      // rather than swallowed, so the shell can say why the log is empty
      // instead of letting it read as a fresh install (PLAN.md M151).
      reportDbError(error);
      set({ hydrated: true });
    }
  },

  recordRun: async ({ mode, metres, coins, pure, date, rested, tape, units, endedBy }) => {
    const current = get().ascent;
    // The day is priced on its best run, so a worse one changes nothing —
    // and the day is kept rather than overwritten (PLAN.md M96).
    const run = {
      date,
      metres,
      coins,
      mode,
      // Only when it was one: a zero would claim a pure run of no height.
      ...(pure ? { pureMetres: metres } : {}),
      ...(tape ? { tape } : {}),
    };
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
        // Every run, not the day's best: the ending of the one run you did
        // not die early on is the least representative sample there is.
        endings:
          endedBy === null ? current.endings : recordEnding(current.endings, endedBy, metres),
      }),
    });

    const payout = payoutFor(daily, rested, units);
    set({
      ledger: await upsertLedger({
        id: `ascent:${date}`,
        date,
        // Metres, and **not** the climber's units (PLAN.md M210). This
        // string is parsed back by `heightFromLabel` to recover days written
        // before M96, so its shape is a storage format that happens to be
        // readable; a stored string that encoded a display preference would
        // also mean a day written in feet and read after a switch to metric.
        // The cost is that the XP feed shows metres to an imperial climber,
        // which is one line in a ledger rather than the game's own screen.
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

  /**
   * Buying is the only thing that spends (PLAN.md M155).
   *
   * There was a `spend(amount)` beside this and nothing ever called it —
   * `buy` writes the wallet once on purpose, so a purchase cannot leave the
   * coins gone and the kit unowned. A second way to move the same number,
   * with no caller and no such guarantee, was a hole waiting for a caller.
   */
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
  const projects = useProjects((s) => s.projects);
  const ledger = useGame((s) => s.ledger);
  const display = useSettings((s) => s.display);

  // `flat()` builds a new array every call, which misses the cache in
  // engine/xp.ts on identical input. This was a `useMemo` here until M157,
  // which only helped across *this component's* re-renders: `useMemo` is
  // per-instance, so two components calling `useXp()` built two arrays and
  // both missed. `useAllSessions` caches on the store's own object identity,
  // one entry for the whole app, so every caller passes the same reference.
  const sessions = useAllSessions();
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
