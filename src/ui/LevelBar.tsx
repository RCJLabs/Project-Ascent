import type { LevelProgress, Rank } from '@/engine/economy';
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
  next?: Rank | null;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">Lvl</span>
        <span className="font-black text-lg leading-none tabular-nums">{progress.level}</span>
        <span className="font-semibold text-sm truncate">{rank.title}</span>
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
          {next ? ` · ${next.title} at ${next.level}` : ' · top rank reached'}
        </p>
      )}
    </div>
  );
}
