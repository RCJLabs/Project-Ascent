import { Link } from 'wouter';
import { Check, ChevronRight, Target } from 'lucide-react';
import { Meter } from '@/ui/Meter';
import { useBoard } from './BoardPage';

/**
 * Today's task, on the screen the day starts on (PLAN.md M231).
 *
 * **This reverses part of M117, deliberately and on the author's word.**
 * That milestone moved four cards off Home for the game tab — the climber
 * strip, the altimeter, the board and the arcade — on the principle that
 * "the point of a move is that the thing is in one place afterwards", and
 * M230 was withdrawn for walking into that decision without reading it. The
 * decision was then reversed for the daily, and only for the daily.
 *
 * ## Why the daily is the exception
 *
 * The other three are *readings*: how high you have climbed, what level you
 * are, a game to play. They are things to go and look at, which is what a
 * tab is for. The daily is none of those. It is a **quality rung for the
 * session you have not done yet** — warm up, rate the effort, leave a note,
 * complete the drill, rest properly — chosen by how much has been logged.
 *
 * That makes it the one thing on the board that is worth reading *before*
 * training rather than after, and a page under Game could never be that:
 * you open Home on the way to the gym and the game tab on the way home.
 *
 * ## The daily, and nothing else from the board
 *
 * Not the weekly set, which counts sessions against the program's target —
 * the fact `YourWeekCard` already states, in the climber's own week, on this
 * same screen. Not the bounties, which are accepted rather than given and so
 * are a thing to go and choose. `gamePage.test.tsx` holds both halves: the
 * daily is here, and the rest of the game tab still is not.
 *
 * ## Claiming stays on the board
 *
 * The count of what is ready is here, because that is the state worth
 * acting on. The button is not. A claim writes to the ledger, and Home has
 * never paid anything — a reward button on the screen the app opens on
 * would make the first thing a climber sees a thing to press.
 */
export function DailyTaskCard() {
  const { board, claimed } = useBoard();
  const daily = board.daily;
  const ready = [board.daily, ...board.weekly, ...board.bounties].filter(
    (c) => c.done && !claimed.has(c.id),
  ).length;

  return (
    /**
     * The card owns its surface rather than being wrapped, which is what
     * `ReviewCard` beside it does. Not a `Card`: that renders a `<section>`,
     * and a section inside an anchor is two boxes and a landmark nobody
     * asked for. The heading is written in the same hand instead.
     *
     * No hydration gate, and that is a rule rather than a preference
     * (`polish.test.ts`): returning null while the stores load collapses the
     * layout and snaps it back a frame later. Nothing here reads wrong on an
     * empty log either — an unlogged day has a daily at zero, which is what
     * an unlogged day has.
     */
    <Link href="/board" className="block bg-surface border border-line rounded-2xl p-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-3">
        Today&rsquo;s task
      </h2>

      <div className="flex items-baseline gap-2 mb-1">
        <Target size={14} className="text-accent shrink-0 translate-y-0.5" aria-hidden />
        <span className="font-semibold text-sm">{daily.title}</span>
        <span className="text-xs text-ink-soft ml-auto tabular-nums shrink-0">
          {daily.progress} / {daily.target} {daily.unit}
        </span>
      </div>

      {/* Every rung of the daily ladder has a target of one, so this bar
          reads full or empty and nothing in between. Written as the fraction
          anyway, because that is what the bar means rather than what today's
          content happens to be; `Meter` clamps a non-finite value to zero on
          its own, so a target of nought needs no guard here. */}
      <Meter
        value={daily.progress / daily.target}
        tone={daily.done ? 'positive' : 'accent'}
        label={daily.title}
        valueText={`${daily.progress} of ${daily.target} ${daily.unit}`}
        className="mb-1.5"
      />

      <p className="text-xs text-ink-soft leading-relaxed">{daily.detail}</p>

      <div className="flex items-center gap-1.5 mt-2 text-xs">
        {claimed.has(daily.id) && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-positive">
            <Check size={13} aria-hidden /> Claimed
          </span>
        )}
        <span className="text-ink-soft ml-auto inline-flex items-center gap-1">
          {ready > 0 ? `${ready} ready to claim` : 'The board'}
          <ChevronRight size={14} aria-hidden />
        </span>
      </div>
    </Link>
  );
}
