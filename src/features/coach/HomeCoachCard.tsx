import { Link } from 'wouter';
import { MessageSquare } from 'lucide-react';
import { useTips } from './useTips';

/**
 * Home's one coach card, in its own chunk (PLAN.md M183).
 *
 * **It lived in `HomePage.tsx` and that one import was the app's largest
 * single first-load cost.** `useTips` reaches `engine/coach.ts`,
 * `plateau.ts`, `planVsLog.ts`, `adherence.ts`, `trip.ts`, `progress.ts`,
 * `effort.ts` and `phrase.ts` — nine modules and 121KB of source that
 * nothing else on the entry path needs. M104 split this hook out of
 * `CoachPage.tsx` so the page's lazy boundary would be real, and it was;
 * Home then imported the hook eagerly and put the whole engine back in the
 * entry chunk by the other door.
 *
 * **Deferring it costs nothing visible, which was measured rather than
 * assumed.** Home renders nothing at all until the stores come back from
 * IndexedDB — the heading, the review card and this one all appear in the
 * same frame — so this card was never on the first paint to begin with. The
 * chunk request starts when Home mounts and runs against that same wait,
 * and the service worker precaches it, so after the first visit it is a
 * cache read. `fallback={null}` rather than a skeleton for the same reason
 * the card returns null: a climber with nothing to be told should see
 * nothing, not a box that reserves space and then collapses.
 */
export function HomeCoachCard() {
  const { visible } = useTips();
  const top = visible[0];
  if (!top) return null;
  const rest = visible.length - 1;
  const tone =
    top.tone === 'caution' ? 'text-warn' : top.tone === 'good' ? 'text-positive' : 'text-accent';
  return (
    <Link href="/coach" className="block bg-surface border border-line rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare size={15} className={tone} />
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          Coach's Corner
        </span>
        {rest > 0 && <span className="text-xs text-ink-soft ml-auto">+{rest} more</span>}
      </div>
      <div className="font-bold leading-snug mb-1">{top.headline}</div>
      <p className="text-sm text-ink-soft leading-relaxed line-clamp-2">{top.body}</p>
    </Link>
  );
}
