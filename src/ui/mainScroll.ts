/**
 * The one thing on the page that scrolls (PLAN.md M225).
 *
 * `window.scrollTo` was the right call for as long as the document was what
 * scrolled. It is not any more: the shell is a fixed-height flex column with
 * the nav as a row of it rather than a bar floating over it, so `<main>` is
 * the scroll container and a call to `window` moves nothing at all — it does
 * not throw, it does not warn, it silently does nothing, which is exactly
 * the kind of regression a rule has to hold rather than a reviewer.
 */
export function pageScroller(): HTMLElement | null {
  return document.getElementById('main');
}

export function scrollPageToTop(behavior: ScrollBehavior = 'smooth'): void {
  pageScroller()?.scrollTo({ top: 0, behavior });
}
