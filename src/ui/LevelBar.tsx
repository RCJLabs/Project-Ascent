import { rankLabel, type LevelProgress, type Rank } from '@/engine/economy';
import { Meter } from './Meter';

/**
 * Level, rank and progress in one strip.
 *
 * The bar is decoration; the numbers beside it carry the meaning, so the
 * strip still reads at a glance with the fill invisible.
 */
export function LevelBar({
  progress,
  rank,
  next,
  compact = false,
}: {
  progress: LevelProgress;
  rank: Rank;
  /**
   * The rung ahead. Not optional and not nullable (PLAN.md M176): this used
   * to fall back to *"top rank reached"*, a sentence a climber met somewhere
   * in year nine and then read for ever. `nextRank` always answers now.
   */
  next: Rank;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-2xs font-bold uppercase tracking-widest text-ink-soft">Lvl</span>
        <span className="font-black text-lg leading-none tabular-nums">{progress.level}</span>
        <span className="font-semibold text-sm truncate">{rankLabel(rank)}</span>
        <span className="text-xs text-ink-soft ml-auto tabular-nums shrink-0">
          {progress.into.toLocaleString()} / {progress.width.toLocaleString()}
        </span>
      </div>
      <Meter
        value={progress.fraction}
        size="lg"
        label={`Level ${progress.level}: progress to level ${progress.level + 1}`}
        valueText={`${progress.into.toLocaleString()} of ${progress.width.toLocaleString()} XP`}
      />
      {!compact && (
        <p className="text-xs text-ink-soft mt-1.5">
          {progress.toNext.toLocaleString()} XP to level {progress.level + 1}
          {` · ${rankLabel(next)} at ${next.level}`}
        </p>
      )}
    </div>
  );
}
