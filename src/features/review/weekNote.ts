/**
 * The week's note, and the hook that builds it (PLAN.md M184, M239).
 *
 * **The card itself is gone (PLAN.md M239).** It was Home's, and it had the
 * defect it was measuring: `note.headline` and the line under it can be the
 * same sentence — *"2 of 4 sessions"* over *"2 of 4 sessions · 8 sends this
 * week"* — with *Your week* beneath it saying it a third time. M239 took it
 * off the front door, which also took `engine/review.ts` out of the entry
 * chunk: **2.09KB**, measured, and the only eager importer it had.
 *
 * Rendering it on Progress instead was tried and reverted. `buildReview`
 * derives its own `ClimberState`, keyed on the week under review rather than
 * on today, so the card cost that page a second walk of the whole log — the
 * exact thing M157's `oneDerivation.test.tsx` exists to catch, and it caught
 * it on the first run. The note lives at `/review`, which M152 already gave
 * a way in from Progress.
 *
 * What stays here is what the page needs, in the file the page has imported
 * since M184 — renamed from `ReviewCard.tsx`, because a file named after a
 * component it no longer holds is a lie the next reader has to unpick.
 *
 * ── the original note ──
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
import { Info, Sparkles, TrendingDown } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { buildReview, type NoteTone, type WeekReview } from '@/engine/review';
import type { Challenge } from '@/engine/challenges';
import { useXp } from '@/store/game';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { useProjects } from '@/store/projects';
import { useSessions, allSessions } from '@/store/sessions';


/**
 * The review for a week containing `date`, assembled from every store.
 *
 * `challenges` is passed in rather than derived here (PLAN.md M230). This
 * hook is in the file that holds the Home card, so it is on the boot path,
 * and resolving the week's challenges here put the whole of
 * `engine/challenges.ts` in the entry chunk — 2.12KB gzipped for a field
 * only the lazy `ReviewPage` reads.
 */
export function useReview(date: string, challenges: Challenge[] = []): WeekReview {
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
      challenges,
    });
  }, [byDate, date, activeProgramId, startDates, plans, projects, xp, injuries, display, challenges]);
}

export const TONE: Record<NoteTone, { color: string; Icon: typeof Info }> = {
  good: { color: 'var(--viz-good)', Icon: Sparkles },
  caution: { color: 'var(--viz-serious)', Icon: TrendingDown },
  neutral: { color: 'var(--c-ink-soft)', Icon: Info },
};
