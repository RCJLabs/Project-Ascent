import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, Dumbbell, Mountain, Search, Target, TrendingUp } from 'lucide-react';
import { Announcer } from './Announce';
import { LiveBar, useLiveBanner } from './LiveBar';

/**
 * Six, not five.
 *
 * Search earns a permanent slot because that is what makes the rest of the
 * app reachable: twenty-six routes behind five tabs meant the glossary, the
 * guides, the career timeline, objectives, the coach, the board and the
 * altimeter were each findable only by knowing which page hid them. One tap
 * to search, one to the result — which is the whole of M16's "done when".
 */
const TABS = [
  { href: '/', label: 'Home', icon: Mountain },
  { href: '/train', label: 'Train', icon: Dumbbell },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/projects', label: 'Projects', icon: Target },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/search', label: 'Search', icon: Search },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const banner = useLiveBanner();
  return (
    <div className="min-h-dvh flex flex-col max-w-2xl mx-auto">
      {/* Visible only when tabbed to. Without it, every page starts a
          keyboard user at the top of the nav and makes them walk through
          five tabs to reach the content they navigated to.

          It stays an anchor with a real href — that is what assistive
          technology expects a skip link to be, and it still works with
          scripting off — but the default is prevented, because routing
          here is hash-based and letting the browser follow `#main` would
          replace the route. Measured: activating it moved the app from
          /progress to /. Focus is moved by hand instead. */}
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="focus-ring sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-surface focus:border focus:border-line focus:rounded-xl focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold"
      >
        Skip to content
      </a>
      <Announcer />
      {/* `tabIndex={-1}` so the skip link can actually move focus here —
          a heading or a div is not focusable by default, and skipping to
          something unfocusable moves the scroll and leaves focus behind. */}
      <main id="main" tabIndex={-1} className={`flex-1 px-4 pt-6 outline-none ${banner ? 'pb-36' : 'pb-24'}`}>
        {children}
      </main>
      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto">
          <LiveBar banner={banner} />
        </div>
        <div className="max-w-2xl mx-auto grid grid-cols-6">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  active ? 'text-accent' : 'text-ink-soft hover:text-ink'
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
