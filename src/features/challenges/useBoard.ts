/**
 * The board, derived from the log (PLAN.md M347).
 *
 * Out of `BoardPage.tsx`. The daily task card on Home needs the board and
 * not the page, and importing the hook from the page's module made every
 * cold Home load fetch the whole page — its bounty list, its rows and its
 * header — for a card that draws one line. `npm run homeload` named it.
 */

import { useEffect, useMemo } from 'react';
import { getProgram } from '@/content/programs';
import { deriveBoard } from '@/engine/challenges';
import { deriveClimberState } from '@/engine/derive';
import { useGame } from '@/store/game';
import { injuryPolicy } from '@/engine/injury';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { allSessions, useSessions } from '@/store/sessions';
import { useDeloadDates } from '@/store/deload';

/** Everything the board shows comes from the log, so this hook is the board. */
export function useBoard() {
  const byDate = useSessions((s) => s.byDate);
  const bounties = useGame((s) => s.bounties);
  const ledger = useGame((s) => s.ledger);
  const hydrated = useGame((s) => s.hydrated);
  const load = useGame((s) => s.load);
  const activeProgramId = useProfile((s) => s.activeProgramId);

  /**
   * The ledger is what says which challenges have already been claimed, so
   * the hook that reads it is the one that has to make sure it is there.
   *
   * This was the page's own effect, which was true for as long as the board
   * was the only caller. M231 gave the daily a second one on Home, where
   * nothing else touches the game store — and an unloaded ledger there does
   * not read as missing, it reads as *nothing claimed*: a task taken this
   * morning shown as still open, counted again in what is ready.
   */
  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const display = useSettings((s) => s.display);
  const injuries = useProfile((s) => s.injuries);
  const claimed = useMemo(
    () => ledger.filter((e) => e.id.startsWith('claim:')).map((e) => e.id.slice(6)),
    [ledger],
  );

  const deloadDates = useDeloadDates();
  return useMemo(() => {
    const sessions = allSessions(byDate);
    const state = deriveClimberState(sessions, { deloadDates });
    const program = activeProgramId ? getProgram(activeProgramId) : undefined;
    const rule = program?.constraints.find((c) => c.kind === 'sessions-per-week');
    const weeklyTarget = rule && rule.kind === 'sessions-per-week' ? rule.min : 3;
    return {
      board: deriveBoard({
        sessions, state, accepted: bounties, weeklyTarget, claimed, display,
        injured: injuryPolicy(injuries).excluded,
      }),
      claimed: new Set(claimed),
    };
  }, [byDate, bounties, activeProgramId, claimed, display, injuries, deloadDates]);
}
