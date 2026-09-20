/**
 * The shell's height, measured rather than declared (PLAN.md M302).
 *
 * `AppShell` was `h-dvh`, which is the right unit and not a reliable one.
 * M225 moved the nav out of `fixed bottom-0` and into the layout precisely
 * so the bar could not end up under something; the layout is only as good
 * as the height it is given, and a dynamic viewport unit is a number the
 * browser promises to keep up to date.
 *
 * Reported from an installed app: the bottom bar vanished after *Update
 * now*, the page otherwise normal and styled, and it came back on a
 * force-close. Reproduced by pinning the shell's height above the viewport
 * and changing nothing else:
 *
 * ```
 * shell 780px, viewport 560   tabs off screen: Home, Train, Calendar, Progress, Game
 * ```
 *
 * That is the whole symptom, and it needs only for the height to go stale
 * once. The shell is `overflow-hidden`, so a shell taller than the screen
 * puts its last row past the bottom edge with nothing to scroll to reach
 * it — and a reload inside a WebView is exactly the moment a viewport unit
 * has to be re-resolved across a system-UI change.
 *
 * So the unit becomes a fallback and a measurement takes over.
 * `--app-height` is written on every event that can change the viewport,
 * and `100dvh` is what the shell uses until the first one lands, which
 * keeps the first paint identical.
 *
 * ## `innerHeight`, not `visualViewport.height`
 *
 * The visual viewport shrinks when the keyboard opens. Driving the shell
 * from it would lift the nav above the keyboard mid-note — a bar that
 * moves while somebody is typing, covering the line they are writing. The
 * layout viewport does not move for the keyboard, which is the behaviour
 * `dvh` already had and the one worth keeping. This changes when the
 * height is measured, not what it means.
 */

/**
 * Every moment the height can have changed without this document knowing.
 *
 * `resize` and `orientationchange` are the ordinary ones. `pageshow` covers
 * a navigation and a restore from the back/forward cache — the update
 * reload among them. `visibilitychange` is the installed app coming back
 * from the task switcher, which is where a phone spends most of its life
 * and which fires no resize if the system bars settled while it was away.
 */
const EVENTS = ['resize', 'orientationchange', 'pageshow', 'visibilitychange'] as const;

export function measureAppHeight(view: { innerHeight: number }): string {
  return `${view.innerHeight}px`;
}

export function trackAppHeight(
  deps: {
    view?: { innerHeight: number };
    root?: { style: { setProperty: (name: string, value: string) => void } };
    on?: (type: string, fn: () => void) => void;
    off?: (type: string, fn: () => void) => void;
  } = {},
): () => void {
  const view = deps.view ?? window;
  const root = deps.root ?? document.documentElement;
  // `visibilitychange` is a document event; the rest are the window's.
  const target = (type: string): EventTarget =>
    type === 'visibilitychange' ? document : window;
  const on = deps.on ?? ((type, fn) => target(type).addEventListener(type, fn));
  const off = deps.off ?? ((type, fn) => target(type).removeEventListener(type, fn));

  const write = (): void => {
    // Zero is what a WebView reports mid-transition, and a shell of no
    // height is a worse answer than a stale one.
    if (view.innerHeight > 0) root.style.setProperty('--app-height', measureAppHeight(view));
  };

  write();
  for (const type of EVENTS) on(type, write);
  return () => {
    for (const type of EVENTS) off(type, write);
  };
}
