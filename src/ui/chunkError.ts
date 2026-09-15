/**
 * Telling a failed download from a bad record (PLAN.md M187).
 *
 * `ErrorBoundary` was written for one kind of failure — *"one bad stored
 * record took the whole page with it"* (M20) — and its card says so: *"Something
 * in your data is not the shape the app expected — often a backup restored
 * from an older version."* Every route in this app is a separate file the
 * browser fetches on demand, so there is a second kind, and the card was
 * telling a climber on a bad connection that their training log was corrupt.
 *
 * ## Measured rather than reasoned about
 *
 * With the coach chunk blocked and the service worker out of the way, the
 * card appeared with that copy and the message
 * `Failed to fetch dynamically imported module: …/CoachPage-DFA9Sk34.js`
 * underneath it. That is Chromium's wording, verified here. Firefox and
 * Safari word it differently and neither runs in this environment, so their
 * spellings are taken from the specification's prose and matched loosely —
 * if a third browser invents a fourth wording the consequence is the old
 * copy, which is the same place this started.
 *
 * Matching on a message is not something to do lightly, and it is done here
 * because there is nothing else: a dynamic `import()` rejects with a plain
 * `TypeError`, with no code, no cause and no distinguishing property.
 */

const WORDINGS = [
  // Chromium, verified in a browser at M187.
  'failed to fetch dynamically imported module',
  // Firefox.
  'error loading dynamically imported module',
  // Safari.
  'importing a module script failed',
  // Older Vite builds and some proxies mangling the response.
  'failed to import',
];

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return WORDINGS.some((wording) => lower.includes(wording));
}

/**
 * The chunk's URL, taken out of the error message (PLAN.md M187).
 *
 * Grubby, and the only source there is. It exists because **React was only
 * half the reason a retry did nothing**: the browser's module map caches a
 * failed module record too, so a second `import()` of the same URL rejects
 * without a network request. Measured here — first import blocked, then the
 * block lifted, and the second import failed with the request count still at
 * one. The same URL with a query string appended loaded fine.
 *
 * So a retry has to ask for a *different* URL, and a build rewrites the
 * specifier into a hashed filename that the source no longer knows. The
 * message is where that filename survives:
 *
 *     Failed to fetch dynamically imported module: https://…/CoachPage-kpR0y-2H.js
 *
 * Null when there is no URL in it, which is the honest answer for a browser
 * whose wording differs — the caller then rethrows and the card's *Reload*
 * is the remaining way out.
 */
export function chunkUrlFrom(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const found = /https?:\/\/[^\s"']+/.exec(message);
  if (found === null) return null;
  try {
    return new URL(found[0]).href;
  } catch {
    return null;
  }
}

/** The same chunk, spelled so the module map has to fetch it again. */
export function bustedUrl(url: string, attempt: number): string {
  const fresh = new URL(url);
  fresh.searchParams.set('retry', String(attempt));
  return fresh.href;
}
