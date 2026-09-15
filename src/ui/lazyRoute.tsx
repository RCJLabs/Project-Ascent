import {
  createContext,
  lazy,
  useContext,
  type ComponentProps,
  type ComponentType,
  type LazyExoticComponent,
} from 'react';
import { bustedUrl, chunkUrlFrom } from './chunkError';

/**
 * A lazy component whose retry actually retries (PLAN.md M187).
 *
 * ## Two caches, and the second is the hard one
 *
 * `React.lazy` memoises its factory's *result*, rejection included, so a
 * chunk that failed to arrive stays failed and every later render re-throws
 * from the cache. That was the claim this milestone started from, and it is
 * only half true: fixing it alone changed nothing, because **the browser's
 * module map caches the failed record too**. Measured — with the block
 * lifted, a second `import()` of the same URL rejected with the request
 * count still at one.
 *
 * So a retry needs a new `lazy` instance *and* a URL the module map has not
 * seen. The instance comes from the attempt counter below; the URL comes out
 * of the error message, which is the only place a built chunk's hashed
 * filename survives.
 *
 * ## Why the instance is held outside render
 *
 * `useMemo` was the first draft and it does not work: a component that
 * suspends on its first render never commits, so its hook state is thrown
 * away, the memo runs again, and React is handed a different component type
 * every pass. Measured in a browser — the route sat on the Suspense fallback
 * for ever instead of reaching the error boundary, which is worse than the
 * bug being fixed. A closure is stable across suspension and remount, which
 * is what React needs a lazy type to be.
 */
export const RetryAttempt = createContext(0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<M, T extends ComponentType<any>>(
  importer: () => Promise<M>,
  pick: (module: M) => T,
): T {
  const load = (attempt: number) => async (): Promise<{ default: T }> => {
    try {
      return { default: pick(await importer()) };
    } catch (error) {
      // First time through there is nothing to work around; the failure is
      // the network's and the card says so.
      const url = attempt === 0 ? null : chunkUrlFrom(error);
      if (url === null) throw error;
      const again = (await import(/* @vite-ignore */ bustedUrl(url, attempt))) as M;
      return { default: pick(again) };
    }
  };

  // Only the latest is kept: an older attempt is a rejected promise nothing
  // will ask for again, and a map keyed on a counter only ever grows.
  let current: { attempt: number; component: LazyExoticComponent<T> } | null = null;
  const instanceFor = (attempt: number): LazyExoticComponent<T> => {
    if (current === null || current.attempt !== attempt) {
      current = { attempt, component: lazy(load(attempt)) };
    }
    return current.component;
  };

  function LazyRoute(props: ComponentProps<T>) {
    const Loaded = instanceFor(useContext(RetryAttempt));
    return <Loaded {...props} />;
  }
  return LazyRoute as unknown as T;
}
