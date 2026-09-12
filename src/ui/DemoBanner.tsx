import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { FlaskConical } from 'lucide-react';
import { hasDemo } from '@/db/demoFlag';
import { useSessions } from '@/store/sessions';

/**
 * A standing reminder that none of this happened (PLAN.md M110).
 *
 * On every page, not only on the one that loaded it: the risk the milestone
 * names is sample data mistaken for a real log, and a climber who loads it,
 * closes the app and comes back a week later has no other way to tell. It
 * is small, it is not dismissible, and it goes when the data does.
 *
 * Re-read when the session store changes rather than subscribed to: the
 * answer only moves when something is written, and this is a `count` over
 * three stores.
 */
export function DemoBanner() {
  const byDate = useSessions((s) => s.byDate);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let live = true;
    void hasDemo().then((found) => {
      if (live) setDemo(found);
    });
    return () => {
      live = false;
    };
  }, [byDate]);

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
