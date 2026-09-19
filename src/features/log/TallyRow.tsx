import { Minus, Plus } from 'lucide-react';
import type { Climb } from '@/db/sessions';
import { climbOutcome } from '@/engine/gym';
import { IconButton } from '@/ui/IconButton';

/**
 * One row of the tally, and the only control that matters mid-session
 * (PLAN.md M74, the logger's own row since M120).
 *
 * A 56px target for the plus, because the whole premise is a cold hand on
 * glass. Minus is smaller on purpose: it is the correction, not the action,
 * and making both the same size makes the wrong one as easy to hit.
 */
export function TallyRow({
  climb,
  label,
  onBump,
  onEdit,
}: {
  climb: Climb;
  label: string;
  onBump: (by: number) => void;
  /**
   * Correcting the row rather than counting it (PLAN.md M298).
   *
   * The grade and the words are the target, not a pencil in the corner:
   * they are what is wrong when something is wrong, and a row already
   * carrying a 56px plus and a 36px minus has no room for a third control
   * that is only occasionally wanted.
   */
  onEdit?: () => void;
}) {
  const said = `${climb.name ? `${climb.name} · ` : ''}${climbOutcome(climb)}`;
  return (
    <li className="flex items-center gap-2 bg-sunken rounded-xl pl-3 pr-2 py-2">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Correct ${label} ${climbOutcome(climb)}`}
          className="focus-ring flex items-center gap-2 flex-1 min-w-0 text-left rounded-lg py-1"
        >
          <span className="font-black text-lg w-16 tabular-nums">{label}</span>
          <span className="text-xs text-ink-soft flex-1 truncate">{said}</span>
        </button>
      ) : (
        <>
          <span className="font-black text-lg w-16 tabular-nums">{label}</span>
          <span className="text-xs text-ink-soft flex-1 truncate">{said}</span>
        </>
      )}
      <IconButton
        inline={false}
        label={`One fewer ${label} ${climbOutcome(climb)}`}
        onClick={() => onBump(-1)}
        className="w-9 h-9 bg-surface border border-line"
      >
        <Minus size={16} />
      </IconButton>
      <span className="font-black text-xl tabular-nums w-7 text-center">{climb.count}</span>
      <IconButton
        inline={false}
        size="lg"
        tone="onAccent"
        label={`One more ${label} ${climbOutcome(climb)}`}
        onClick={() => onBump(1)}
      >
        <Plus size={26} />
      </IconButton>
    </li>
  );
}
