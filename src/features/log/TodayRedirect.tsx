import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { today } from '@/engine/dates';
import { logHref } from '@/ui/routes';

/**
 * `/today` → today's log, which is Home (PLAN.md M115, M117).
 *
 * Six lines in their own file, and the file is the point. It used to live in
 * `LogPage.tsx`, which is 2,000 lines and pulls in the media card, the share
 * sheet, the warmup and circuit engines, the protocol registry and the grade
 * tables. `App.tsx` imported both names from there, so the route that only
 * needs to *redirect* was holding the whole logger in the entry chunk.
 *
 * The same split as `db/demoFlag.ts` (M110), and as `lib/launchFlag.ts` was
 * from M111 until M123 retired it with the redirect it served:
 * the small thing that has to be eager, separated from the large thing it
 * happened to be declared beside.
 *
 * **It stays eager deliberately.** `#/today` is one of M111's three launcher
 * shortcuts, so it is a cold-start entry point; making it lazy would put two
 * chunk loads in front of one navigation — this one, and then the logger it
 * redirects to. One is enough.
 */
export function TodayRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    // Through `logHref` rather than a literal `/`: the rule that today is
    // Home is written once, there, and this is one of its readers.
    navigate(logHref(today()), { replace: true });
  }, [navigate]);
  return null;
}
