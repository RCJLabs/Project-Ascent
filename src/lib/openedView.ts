import type { LogView } from '@/store/settings';

/**
 * The view a session was opened in, for this tab and no longer (PLAN.md M297).
 *
 * Home offers two ways into the logger and they name two different views:
 * the big button opens the whole log, *Quick log* opens it stripped to the
 * climbs and the effort. Both used to call `setLogView`, which writes to
 * device settings — so tapping *Quick log* once made quick the view for
 * every session opened afterwards, including last Tuesday's from the
 * calendar.
 *
 * The hazard was seen and solved in the other direction. `PreSession`'s own
 * comment reads: *"Inside the logger the fold is the climber's own choice,
 * and a start button that silently reset it would undo the setting every
 * session."* Exactly right, and the line it drew was Home versus in-logger
 * when the one that matters is **this session versus always**.
 *
 * So the two buttons set this instead, and only the fold's own *More* and
 * *Less* write the stored preference. A choice made on the way in lasts as
 * long as the way in did.
 *
 * ## Keyed by date rather than taken once
 *
 * `lib/launchFile.ts` holds its file in a slot that clears as it is read,
 * which is right for a file that must not be imported twice. It would be
 * wrong here: the app runs under `StrictMode`, React double-invokes a
 * `useState` initialiser in development, and a slot consumed in one would
 * be empty by the second call. Reading by date is idempotent, so it does
 * not matter how many times the logger asks.
 */
let opened: { date: string; view: LogView } | null = null;

/** Say which view this date's session is being opened in. */
export function openAt(date: string, view: LogView): void {
  opened = { date, view };
}

/** The view that date was opened in, or null for one nobody chose. */
export function openedViewFor(date: string): LogView | null {
  return opened?.date === date ? opened.view : null;
}

/** For tests, and for a climber's data being wiped out from under it. */
export function forgetOpenedView(): void {
  opened = null;
}
