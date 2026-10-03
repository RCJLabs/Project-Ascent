import { useMemo } from 'react';
import { activeBlock, type BlockRecord } from '@/engine/blocks';
import { useProfile } from '@/store/profile';

/**
 * The running block's row, or null (PLAN.md M374).
 *
 * Every reader that numbers a day — the logger, the week, the calendar —
 * needs it for a block that was picked up, because the row is what knows
 * which start a day before the pick-up was counted from. Only the running
 * program's row: an open row for any other program is not this block.
 */
export function useRunningRow(): BlockRecord | null {
  const blocks = useProfile((s) => s.blocks);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  return useMemo(() => {
    const open = activeBlock(blocks);
    return open !== null && open.programId === activeProgramId ? open : null;
  }, [blocks, activeProgramId]);
}
