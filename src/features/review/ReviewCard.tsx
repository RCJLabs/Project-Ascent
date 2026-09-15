/**
 * The week's note, and the hook that builds it (PLAN.md M184).
 *
 * **Its own module, and not `ReviewPage.tsx`, because `HomePage` reads it.**
 * That is M104's sentence about `useTips`, word for word, and the same
 * mistake was live one card over: the page is `lazy()` in the router, and
 * Home's single import of `ReviewCard` from it pulled the page — its share
 * sheet, the SVG card builder behind it, its header and back link — into the
 * entry chunk, 13.32KB gzipped.
 *
 * Unlike M183 this needed no boundary. The card never depended on the page;
 * one file held both. `engine/review.ts` is a real first-load cost and stays
 * one, because Home shows the note and the note is what that module builds —
 * what leaves is everything the *page* needs and the card does not.
 *
 * `useReview` and `TONE` live here rather than beside the page because the
 * card is the one with the smaller appetite: a page importing two names from
 * a card costs nothing, and a card importing them from a page costs the
 * page.
 */

import { useMemo } from 'react';
import { ChevronRight, Info, Sparkles, TrendingDown } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { startOfWeek, today as todayKey } from '@/engine/dates';
import { buildReview, type NoteTone, type WeekReview } from '@/engine/review';
import { useXp } from '@/store/game';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { useProjects } from '@/store/projects';
import { useSessions, allSessions } from '@/store/sessions';


/** The review for a week containing `date`, assembled from every store. */
export function useReview(date: string): WeekReview {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const injuries = useProfile((s) => s.injuries);
  const xp = useXp();
  const display = useSettings((s) => s.display);

  return useMemo(() => {
    const program = activeProgramId ? getProgram(activeProgramId) : undefined;
    return buildReview({
      sessions: allSessions(byDate),
      date,
      program,
      startDate: activeProgramId ? startDates[activeProgramId] : undefined,
      plan: activeProgramId ? plans[activeProgramId] : undefined,
      projects,
      xp,
      injuries: injuries.map((i) => i.part),
      display,
    });
  }, [byDate, date, activeProgramId, startDates, plans, projects, xp, injuries, display]);
}

export const TONE: Record<NoteTone, { color: string; Icon: typeof Info }> = {
  good: { color: 'var(--viz-good)', Icon: Sparkles },
  caution: { color: 'var(--viz-serious)', Icon: TrendingDown },
  neutral: { color: 'var(--c-ink-soft)', Icon: Info },
};


/** Home entry: leads with the note, which is the part worth reading. */
export function ReviewCard() {
  const review = useReview(startOfWeek(todayKey()));
  const { color, Icon } = TONE[review.note.tone];
  return (
    <div className="flex items-center gap-3">
      <Icon size={18} style={{ color }} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{review.note.headline}</p>
        <p className="text-xs text-ink-soft mt-0.5">
          {review.sessions} of {review.target} sessions · {review.sends} sends this week
        </p>
      </div>
      <ChevronRight size={18} className="text-ink-soft shrink-0" />
    </div>
  );
}
