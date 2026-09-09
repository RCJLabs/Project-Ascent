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

function isActive(href: string, location: string): boolean {
  return href === '/' ? location === '/' : location.startsWith(href);
}

/**
 * The shell, in two shapes (PLAN.md M17).
 *
 * On a phone the nav is a bottom bar, because that is where a thumb is. On
 * anything wide it is a sidebar, because a bar stretched across 1280px with
 * six small icons huddled in the middle is what "a phone app in a desktop
 * window" looks like — measured before this change: 608px of the viewport,
 * 48% of it, was empty margin either side of a 672px column.
 *
 * One nav element, not two. Rendering both and hiding one would announce
 * the app's navigation twice to a screen reader, and put every tab in the
 * tab order twice.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const banner = useLiveBanner();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Visible only when tabbed to. Without it, every page starts a
          keyboard user at the top of the nav and makes them walk through
          six tabs to reach the content they navigated to.

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

      <nav
        aria-label="Main"
        className={
          // Phone: a bar pinned to the bottom. Desktop: a column pinned to
          // the left, which is why the same element carries both sets of
          // positioning rather than there being two of them.
          'fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line ' +
          'lg:static lg:inset-auto lg:w-60 lg:shrink-0 lg:border-t-0 lg:border-r lg:h-dvh lg:sticky lg:top-0 lg:backdrop-blur-none'
        }
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto lg:hidden">
          <LiveBar banner={banner} />
        </div>

        <div className="hidden lg:block px-5 pt-6 pb-4">
          <div className="font-black tracking-tight text-lg leading-none">Project Ascent</div>
          <p className="text-xs text-ink-soft mt-1">Train. Understand. Grow.</p>
        </div>

        <div className="max-w-2xl mx-auto grid grid-cols-6 lg:flex lg:flex-col lg:gap-0.5 lg:px-3 lg:max-w-none">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, location);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:rounded-xl lg:text-sm ${
                  active
                    ? 'text-accent lg:bg-accent/10'
                    : 'text-ink-soft hover:text-ink lg:hover:bg-sunken'
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.5 : 2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>

        <div className="hidden lg:block px-3 mt-3">
          <LiveBar banner={banner} />
        </div>
      </nav>

      {/* `tabIndex={-1}` so the skip link can actually move focus here —
          a heading or a div is not focusable by default, and skipping to
          something unfocusable moves the scroll and leaves focus behind. */}
      <main
        id="main"
        tabIndex={-1}
        className={`flex-1 min-w-0 px-4 pt-6 outline-none lg:px-8 lg:pb-12 ${
          banner ? 'pb-36' : 'pb-24'
        }`}
      >
        {/* The content still has a maximum: a paragraph 1,200px wide is
            unreadable whatever the window is doing. Wide enough for two
            columns of cards, and no wider. */}
        <div className="max-w-2xl mx-auto lg:max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
