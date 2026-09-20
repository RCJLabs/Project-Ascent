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

/**
 * Pressing *Update now* and having something happen (PLAN.md M302).
 *
 * `updateSW(true)` messages the waiting worker to skip waiting, and
 * workbox-window reloads the page from its `controlling` event — but only
 * `if (event.isUpdate)`, which is false when there was no controller to
 * update *from*. A document is not controlled by its own worker until the
 * next navigation, so the first launch after an install sits in exactly
 * that state: the prompt appears, the button is pressed, and **nothing
 * happens at all**. Measured in a browser — no navigation, the page's own
 * marker still set, the prompt still up.
 *
 * And it is worse than a dead button, because the tap does deliver
 * skip-waiting. The new worker activates and drops the old precache while
 * this document goes on running the old build, and a deploy has already
 * taken the old chunks off the server — so every route not already loaded
 * 404s into *"This page could not be downloaded"* until the app is
 * relaunched. Measured the same way:
 *
 * ```
 * after the tap — controlled: false, still the old document: true
 * /progress  404 ProgressPage-CUsdU5rX.js   "This page could not be downloaded"
 * /settings  404 …                          "This page could not be downloaded"
 * ```
 *
 * Waiting for `controllerchange` is not the fix: `registerType: 'prompt'`
 * means the generated worker does not call `clients.claim()`, so a page
 * with no controller never gets one without a navigation. What the reload
 * has to wait for is the **new worker being activated** — reloading before
 * that is served the old shell by the old worker and lands in the same
 * place.
 *
 * So: ask for the handover, reload when the new worker has it, and reload
 * anyway after `HANDOVER_MS` rather than leave the button dead. A reload is
 * what *Update now* means; the waiting is only about which build answers
 * it.
 */
export const HANDOVER_MS = 4_000;

export async function applyUpdate(
  skipWaiting: () => void,
  deps: {
    registration?: () => Promise<ServiceWorkerRegistration | undefined>;
    controlled?: () => boolean;
    reload?: () => void;
    after?: (fn: () => void, ms: number) => void;
  } = {},
): Promise<void> {
  const controlled = deps.controlled ?? (() => Boolean(navigator.serviceWorker?.controller));
  const reload = deps.reload ?? (() => window.location.reload());
  const after = deps.after ?? ((fn, ms) => window.setTimeout(fn, ms));
  const getRegistration =
    deps.registration ?? (() => navigator.serviceWorker.getRegistration());

  // The worker in hand **before** the message, not after: skip-waiting is
  // what makes it stop waiting, so reading `registration.waiting` on the
  // other side of the call is a race that returns null on the fast path and
  // reloads into whichever worker happens to be active.
  const waiting = controlled() ? undefined : (await getRegistration().catch(() => undefined))?.waiting;

  skipWaiting();

  // The ordinary path: workbox reloads on its own `controlling` event, and
  // a second reload from here would race it.
  if (controlled()) return;

  let done = false;
  const once = (): void => {
    if (done) return;
    done = true;
    reload();
  };
  // Never a dead button, whatever the worker does.
  after(once, HANDOVER_MS);

  if (!waiting) {
    // Nothing was waiting, so whatever is active is what a navigation will
    // be served by — and that is the version being asked for.
    once();
    return;
  }
  // A worker that got there first fires no `statechange` to catch.
  if (waiting.state === 'activated') {
    once();
    return;
  }
  waiting.addEventListener('statechange', () => {
    if (waiting.state === 'activated') once();
  });
}
