import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { CalendarDays, Dumbbell, Gamepad2, Mountain, Search, Settings, TrendingUp } from 'lucide-react';
import { Announcer } from './Announce';
import { ErrorBoundary } from './ErrorBoundary';
import { lazyRoute } from './lazyRoute';
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
const SearchSheet = lazyRoute(
  () => import('@/features/search/SearchSheet'),
  (m) => m.SearchSheet,
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
    // Focusing `main` used to do this by itself: the browser scrolls a
    // focused element into view, and `main` started at the top of the
    // document. It is the scroll container now, so its own `scrollTop` is
    // not something focus touches — without this line a climber who
    // navigates from the bottom of the calendar lands halfway down Home.
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location]);
  // Only a running session holds an update back. A stale one is already over
  // — it is waiting for a decision, not counting — and reloading costs it
  // nothing, because its clock is derived from what is stored.
  const live = banner?.kind === 'running';

  return (
    <div className="h-dvh flex flex-col overflow-hidden lg:flex-row">
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
          // Phone: the last row of the shell. Desktop: the first column.
          // One element carries both, which is why it reads as two sets of
          // rules rather than there being two navs.
          //
          // **In the layout, not over it (PLAN.md M225).** This was
          // `fixed bottom-0` from M0 to M224, and a fixed element is placed
          // against the *layout* viewport — which on a phone is the tall
          // one, measured with the browser's chrome retracted. With the
          // chrome showing, the bottom of the bar is underneath it:
          // reported as "the bottom navigation buttons scroll with the
          // page", and the screenshots showed exactly that — five icons
          // with their labels cut off at the top of a page, the whole bar
          // once it had been scrolled. Nothing scrolls past it now because
          // the document does not scroll at all; `main` does.
          //
          // `flex flex-col` at both widths so the banners can be placed by
          // order rather than mounted twice (PLAN.md M141). The children
          // stack exactly as they did in block flow.
          // **`min-h-0`, not `shrink-0` (PLAN.md M269).** The banners live
          // in here, and `shrink-0` meant the nav took its content height
          // whatever that was: once the stack outgrew the room, `main`
          // shrank to nothing and then the nav pushed its own tab row out
          // of the bottom of an `overflow-hidden` shell. Measured at
          // 360×640 with the banner box padded: at +600px the tabs sat at
          // 723–780 on a 640px screen, which is the whole bar gone with no
          // way to scroll to it. `main` is `flex-1` from a zero basis, so
          // it still takes the room the nav does not want — the ordinary
          // layout is unchanged and only the squeeze behaves differently.
          'order-last min-h-0 flex flex-col bg-surface border-t border-line ' +
          'lg:shrink-0 lg:order-first lg:w-60 lg:border-t-0 lg:border-r lg:overflow-y-auto'
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
        {/* The part that gives way. A warning nobody can dismiss is worth
            less than the way out of the screen it is covering, so when
            there is not room for both the banners scroll and the tabs
            stay (PLAN.md M269). */}
        <div className="order-first min-h-0 overflow-y-auto lg:overflow-visible w-full max-w-2xl mx-auto lg:order-last lg:max-w-none lg:mt-3 lg:[&>*:not(:empty)+*]:mt-2">
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

        {/* `shrink-0`: the one row that must never give way. */}
        <div className="shrink-0 w-full max-w-2xl mx-auto grid grid-cols-5 lg:flex lg:flex-col lg:gap-0.5 lg:px-3 lg:max-w-none">
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
      {/* The one thing on the page that scrolls (PLAN.md M225).
          `min-h-0` because a flex item will not shrink below its content
          without it, and an item that cannot shrink cannot scroll — it
          pushes the nav off the bottom instead, which is the bug wearing
          a different hat. The bottom padding used to clear a bar floating
          over this; there is nothing to clear now. */}
      <main
        id="main"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-y-contain px-4 pt-3 pb-8 outline-none lg:px-8 lg:pt-6 lg:pb-12"
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
        /**
         * Inside a boundary, because it is outside the route one (PLAN.md
         * M187). This sheet is a sibling of `<main>` and `RouteBoundary`
         * lives inside it, so nothing above this caught anything — and the
         * sheet is a chunk, so it can fail to arrive. Measured, with the
         * search chunk blocked: the whole app went to a **white screen**, no
         * nav and no way back, which is the failure M20 was written to make
         * impossible.
         */
        <ErrorBoundary label="Search">
          <Suspense fallback={null}>
            <SearchSheet onClose={() => setSearching(false)} />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
}
