import { shouldCheckForUpdate } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';

/**
 * Asking whether there is a new version (PLAN.md M154).
 *
 * M19 built the prompt and the rules around showing it, and left the
 * noticing to the browser. For a tab that is right: a navigation re-fetches
 * `sw.js`, and closing the last tab hands over to whatever was waiting. For
 * an installed app it is not — it is resumed from the task switcher rather
 * than launched, hash routing means no in-app navigation requests the
 * document, and nothing here had ever called `registration.update()`. A
 * home-screen install could run for a week on a version that was replaced
 * on day one.
 *
 * **Only when the app is looked at.** A timer that fires in the background
 * spends a climber's data to learn something they cannot act on until they
 * come back, and on a phone it is the case that happens most. So the
 * triggers are *became visible* and *still visible, six hours on*, and both
 * go through one elapsed test — `shouldCheckForUpdate` — so a run of tab
 * switches costs one request.
 *
 * The check is deliberately not gated on a live session. Asking is silent;
 * `engine/offline.ts` already decides when the answer may interrupt anyone,
 * and it will not do so mid-session.
 */
export function watchForUpdates(
  registration: ServiceWorkerRegistration,
  /** Injected so the rule can be tested without a browser or a clock. */
  deps: {
    now?: () => number;
    visible?: () => boolean;
    addListener?: (type: string, fn: () => void) => void;
    setInterval?: (fn: () => void, ms: number) => unknown;
  } = {},
): () => void {
  const now = deps.now ?? (() => Date.now());
  const visible = deps.visible ?? (() => document.visibilityState === 'visible');
  const addListener =
    deps.addListener ?? ((type, fn) => document.addEventListener(type, fn));
  const every = deps.setInterval ?? ((fn, ms) => window.setInterval(fn, ms));

  const check = (): void => {
    const store = useAppUpdate.getState();
    // A deferral that has run out is cleared here rather than on a render
    // clock: the next check is the natural moment to ask again, and it
    // keeps a timer out of the prompt.
    store.expireDeferral(now());
    if (!shouldCheckForUpdate({ visible: visible(), lastCheckedAt: store.lastCheckedAt, now: now() })) {
      return;
    }
    store.markChecked(now());
    // Offline, or the server is down: there is nothing to do about it and
    // nothing to say. The next check asks again.
    void registration.update().catch(() => {});
  };

  check();
  addListener('visibilitychange', check);
  every(check, 60_000);
  return check;
}
