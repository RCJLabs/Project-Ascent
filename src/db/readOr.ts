import { reportDbError } from './db';

/**
 * A read whose answer, when the database will not open, is "nothing"
 * (PLAN.md M158).
 *
 * Its own module since M353: `db.ts` is in the entry chunk, and once the
 * sample-data banner stopped reading the database nothing there called this.
 *
 * The stores own their catches — eight of them call `reportDbError` and
 * hydrate empty (M151). A handful of reads have no store above them: they
 * live in `db/` and a component calls them straight, in an effect, as
 * `void read().then(setState)`. `void` satisfies the linter and handles
 * nothing, so on a database that refuses each of those is a rejected promise
 * with no one listening — six of them, found by walking the app under a real
 * `VersionError` rather than by reading the code.
 *
 * Wrapping the *reads* rather than the call sites, for the reason M151 gave
 * for not wrapping twenty-nine writes: a fix applied caller by caller is
 * churn with a missed site at the end of it. And the knowledge belongs here
 * — a count over a database that will not open is not an exception a banner
 * is missing, it is zero, and `DbFaultBanner` is already saying why.
 *
 * Not for writes, and not for anything a climber asked for by name. An
 * import that fails has to say so on the button that started it; this is for
 * the reads a screen does on its own behalf, whose failure the climber did
 * not ask about and cannot act on.
 */
export async function readOr<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    reportDbError(error);
    return fallback;
  }
}
