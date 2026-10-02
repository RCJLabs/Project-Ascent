/**
 * The last day a reading of a block covers (PLAN.md M365): today, the
 * block's own last day, or the day the climber left it, whichever came
 * first.
 *
 * The window stays the calendar's (`blocks.ts` says why), but what is
 * counted inside it stops where the climber did. Without the third term a
 * block left in week six was measured to week twelve: six perfect weeks
 * read as *"36 of 48 sessions"*, the next program's sessions counted as
 * this one's wherever their ids matched, and its baseline tests became this
 * block's retests — under a sentence that said they moved *"while you were
 * on it"*. A reading the day after leaving is the next block's, not this
 * one's: the cutoff is hard, which is the coach's call.
 *
 * Its own module because only the block reviews and the finder read it,
 * and `plan.ts` is in the first load.
 */
export function blockThrough(to: string, today: string, until?: string | null): string {
  let through = today < to ? today : to;
  if (until && until < through) through = until;
  return through;
}
