import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, Dumbbell, Gamepad2, Mountain, Search, Settings, TrendingUp } from 'lucide-react';
import { Announcer } from './Announce';
import { IconButton } from './IconButton';
import { LiveBar, useLiveBanner } from './LiveBar';
import { DemoBanner } from './DemoBanner';
import { DbFaultBanner } from './DbFaultBanner';
import { StorageWarning } from './StorageWarning';
import { UndoBar } from './UndoBar';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * Five, and search is not one of them (PLAN.md M117).
 *
 * Home is today's session — the thing the app is for, on the screen it
 * opens to. Train, Calendar and Progress are the three ways of looking at
 * the training around it, and Game is everything training earns, which
 * used to be scattered across Home and the climber page. Projects live
 * under Train now; a project is what a block is for.
 *
 * Search had a permanent slot from M16 to M116 because it is what makes
 * the rest of the app reachable. It still is — it moved to a button in the
 * header of every page, which keeps "one tap to search, one to the result"
 * without spending a fifth of the bar on it.
 */
const TABS = [
  { href: '/', label: 'Home', icon: Mountain },
  { href: '/train', label: 'Train', icon: Dumbbell },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/game', label: 'Game', icon: Gamepad2 },
] as const;

/**
 * Loaded on the first tap, not on boot. The sheet's index walks the
 * glossary, every guide's prose, the drills and the metrics — the M116
 * measurement was 13.99KB for the glossary alone — and none of it is
 * needed until someone searches.
 */
const SearchSheet = lazy(() =>
  import('@/features/search/SearchSheet').then((m) => ({ default: m.SearchSheet })),
);

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
  const mainRef = useRef<HTMLElement>(null);
  const navigated = useRef(false);
  const [searching, setSearching] = useState(false);

  // A result is a navigation, and a sheet still open over the page it
  // navigated to is a sheet the climber has to close by hand. The sheet
  // also closes itself on the tap (see `SearchSheet`); this catches the
  // other ways a location can change underneath it — a back button, a
  // launcher shortcut into an already-open app.
  useEffect(() => {
    setSearching(false);
  }, [location]);

  /**
   * Move focus into the content when the route changes (PLAN.md M14).
   *
   * Nothing did, and the consequence was measurable rather than theoretical:
   * pressing Enter on "Start session" left `document.activeElement` as
   * `<body>`, because the control that was focused had just unmounted. A
   * keyboard user arrives on the new page with focus nowhere, has to Tab
   * from the top of the document past the whole nav to reach what they
   * navigated to, and a screen reader says nothing about having arrived.
   *
   * Focusing the `<main>` landmark is what assistive technology expects
   * here, and the page's own `h1` is the first thing inside it — which is
   * why nothing is announced on top. Synthesising a "now on Progress" would
   * make every navigation say the page name twice.
   *
   * Not on the first render: the app has not navigated anywhere yet, and
   * stealing focus on load is its own bug.
   */
  useEffect(() => {
    if (!navigated.current) {
      navigated.current = true;
      return;
    }
    mainRef.current?.focus();
  }, [location]);
  // Only a running session holds an update back. A stale one is already over
  // — it is waiting for a decision, not counting — and reloading costs it
  // nothing, because its clock is derived from what is stored.
  const live = banner?.kind === 'running';

  return (
    <div className="min-h-dvh lg:flex">
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

      <nav
        aria-label="Main"
        className={
          // Phone: a bar pinned to the bottom. Desktop: a column pinned to
          // the left, which is why the same element carries both sets of
          // positioning rather than there being two of them.
          // `flex flex-col` at both widths so the banners can be placed by
          // order rather than mounted twice (PLAN.md M141). The children
          // stack exactly as they did in block flow.
          'fixed bottom-0 inset-x-0 z-30 flex flex-col bg-surface/95 backdrop-blur border-t border-line ' +
          'lg:static lg:inset-auto lg:w-60 lg:shrink-0 lg:border-t-0 lg:border-r lg:h-dvh lg:sticky lg:top-0 lg:backdrop-blur-none'
        }
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/**
         * One instance of each banner, above the tabs on a phone and below
         * them in the sidebar (PLAN.md M141).
         *
         * It used to be two, one per breakpoint, and `display: none` takes
         * the hidden copy out of the accessibility tree — so nothing was
         * announced twice and the duplication was invisible. Effects do not
         * care about `display`: `StorageWarning` asked the browser for a
         * storage estimate twice on every page and hung two
         * `visibilitychange` listeners, and `UndoBar` ran two one-second
         * intervals per offer and handed the announcer the same sentence
         * twice.
         */}
        <div className="order-first lg:order-last w-full max-w-2xl mx-auto lg:max-w-none lg:mt-3 lg:[&>*:not(:empty)+*]:mt-2">
          {/* Its own box: LiveBar is a full-bleed bar with its own padding
              and a bottom border, and sharing a padded container with it
              would inset the bar. */}
          <div className="px-3 pt-3 lg:pt-0 empty:hidden [&>*+*]:mt-2">
            {/* First of the banners: a disk filling up is a warning, a
                database that will not answer is already happening. */}
            <DbFaultBanner />
            <StorageWarning />
            <UndoBar />
            <UpdatePrompt live={live} />
          </div>
          <div className="lg:px-3">
            <LiveBar banner={banner} />
          </div>
        </div>

        <div className="hidden lg:block px-5 pt-6 pb-4">
          <div className="font-black tracking-tight text-lg leading-none">Project Ascent</div>
          <p className="text-xs text-ink-soft mt-1">Train. Understand. Grow.</p>
        </div>

        <div className="w-full max-w-2xl mx-auto grid grid-cols-5 lg:flex lg:flex-col lg:gap-0.5 lg:px-3 lg:max-w-none">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href, location);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`focus-ring flex flex-col items-center gap-1 py-2.5 text-2xs font-semibold transition-colors lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 lg:rounded-xl lg:text-sm ${
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

        {/* The two controls the phone carries in its header, as sidebar
            rows here. Hidden below `lg`, so neither pair is in the tab
            order twice — the same arrangement the banners use. */}
        <div className="hidden lg:flex lg:flex-col lg:gap-0.5 lg:px-3 lg:mt-3 lg:pt-3 lg:border-t lg:border-line">
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="focus-ring flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-soft hover:text-ink hover:bg-sunken transition-colors"
          >
            <Search size={19} strokeWidth={2} aria-hidden />
            Search
          </button>
          <Link
            href="/settings"
            aria-current={isActive('/settings', location) ? 'page' : undefined}
            className={`focus-ring flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isActive('/settings', location) ? 'text-accent bg-accent/10' : 'text-ink-soft hover:text-ink hover:bg-sunken'
            }`}
          >
            <Settings size={19} strokeWidth={2} aria-hidden />
            Settings
          </Link>
        </div>

      </nav>

      {/* `tabIndex={-1}` so the skip link can actually move focus here —
          a heading or a div is not focusable by default, and skipping to
          something unfocusable moves the scroll and leaves focus behind. */}
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className={`flex-1 min-w-0 px-4 pt-3 outline-none lg:px-8 lg:pt-6 lg:pb-12 ${
          banner ? 'pb-36' : 'pb-24'
        }`}
      >
        {/* The content still has a maximum: a paragraph 1,200px wide is
            unreadable whatever the window is doing. Wide enough for two
            columns of cards, and no wider. */}
        <div className="max-w-2xl mx-auto lg:max-w-5xl">
          {/* The phone's header (PLAN.md M117): the name, because Home no
              longer carries it — Home is a date now — and the two controls
              that used to be a tab and a gear on the front door. On a wide
              screen the sidebar already says the name and carries both
              controls as rows, so this row is gone rather than doubled. */}
          <div className="flex items-center justify-between mb-2 lg:hidden">
            <Link href="/" className="focus-ring font-black tracking-tight leading-none rounded-lg py-1">
              Project Ascent
            </Link>
            <div className="flex items-center -mr-2">
              <IconButton inline={false} label="Search" onClick={() => setSearching(true)}>
                <Search size={20} />
              </IconButton>
              <Link
                href="/settings"
                aria-label="Settings"
                className="focus-ring inline-flex items-center justify-center w-11 h-11 rounded-xl text-ink-soft hover:text-ink"
              >
                <Settings size={20} />
              </Link>
            </div>
          </div>
          <DemoBanner />
          {children}
        </div>
      </main>

      {searching && (
        <Suspense fallback={null}>
          <SearchSheet onClose={() => setSearching(false)} />
        </Suspense>
      )}
    </div>
  );
}
