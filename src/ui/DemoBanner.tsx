import { Link } from 'wouter';
import { FlaskConical } from 'lucide-react';
import { useHasDemo } from '@/store/demoPresence';

/**
 * A standing reminder that none of this happened (PLAN.md M110).
 *
 * On every page, not only on the one that loaded it: the risk the milestone
 * names is sample data mistaken for a real log, and a climber who loads it,
 * closes the app and comes back a week later has no other way to tell. It
 * is small, it is not dismissible, and it goes when the data does.
 *
 * Answered from the stores, not the database (PLAN.md M353). This used to
 * call `hasDemo` whenever the session log changed, and that reads every row
 * of the log, then every project and every metric when none is tagged. The
 * log changes on every write, so each climb added to a session read it all
 * back, 20 to 45ms a time at a quarter CPU speed on the sample climber's
 * year.
 */
export function DemoBanner() {
  const demo = useHasDemo();

  if (!demo) return null;

  return (
    <Link
      href="/settings"
      className="focus-ring flex items-center gap-2 bg-warn/15 text-ink rounded-xl px-3 py-2 mb-3"
    >
      <FlaskConical size={15} className="text-warn shrink-0" aria-hidden />
      <span className="text-xs leading-relaxed flex-1">
        <span className="font-semibold">Sample data.</span> None of this happened — it is here so
        the app has something to show. Clear it in Settings.
      </span>
    </Link>
  );
}
