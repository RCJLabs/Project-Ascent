// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Suspense } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { RetryAttempt, lazyRoute } from './lazyRoute';

/**
 * The factory, driven by hand (PLAN.md M187).
 *
 * The real mechanism — the browser's module map caching a failed record, and
 * a query string defeating it — cannot be reached from jsdom, and is measured
 * in a browser instead. Two things can be reached here, and the battery found
 * both: whether a new attempt really builds a new `lazy`, and whether the
 * *first* attempt leaves the error alone instead of chasing a busted URL for
 * a failure that has nothing to do with caching.
 *
 * The importer is a plain function, so this needs no chunks and no network.
 */

afterEach(cleanup);

const Hello = () => <span data-testid="hello">loaded</span>;

/**
 * No boundary around these: `ErrorBoundary` publishes its **own** attempt
 * count to its subtree, which is right — each boundary retries what it wraps
 * — and means a boundary between the provider and the route shadows the
 * value under test. The failure case below wants the boundary and drives the
 * count through it instead.
 */
function at(attempt: number, node: React.ReactNode) {
  return (
    <RetryAttempt.Provider value={attempt}>
      <Suspense fallback={<span data-testid="pending" />}>{node}</Suspense>
    </RetryAttempt.Provider>
  );
}

describe('a lazy route, per attempt', () => {
  it('asks the importer once and renders what it picked', async () => {
    let calls = 0;
    const Route = lazyRoute(
      async () => {
        calls += 1;
        return { Hello };
      },
      (m) => m.Hello,
    );
    render(at(0, <Route />));
    await screen.findByTestId('hello');
    expect(calls).toBe(1);
  });

  /**
   * The whole mechanism. `React.lazy` caches its factory's result, so the
   * only way to ask again is a component that has never asked — and the
   * attempt count is what tells the route to build one. Holding a single
   * instance for ever survived the battery until this test existed.
   */
  it('builds a new instance when the attempt rises, and asks again', async () => {
    let calls = 0;
    const Route = lazyRoute(
      async () => {
        calls += 1;
        return { Hello };
      },
      (m) => m.Hello,
    );
    const { rerender } = render(at(0, <Route />));
    await screen.findByTestId('hello');
    expect(calls).toBe(1);

    rerender(at(1, <Route />));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('does not ask again while the attempt holds', async () => {
    let calls = 0;
    const Route = lazyRoute(
      async () => {
        calls += 1;
        return { Hello };
      },
      (m) => m.Hello,
    );
    const { rerender } = render(at(0, <Route />));
    await screen.findByTestId('hello');
    rerender(at(0, <Route />));
    await waitFor(() => expect(screen.getByTestId('hello')).toBeTruthy());
    expect(calls, 'a re-render re-imported the chunk').toBe(1);
  });

  /**
   * And the first failure is reported as itself. Busting the URL on attempt
   * zero would chase a cache that is not yet holding anything, and replace a
   * true message — the one the card and `isChunkLoadError` both read — with
   * whatever the second request failed with.
   */
  it('lets the first failure through untouched', async () => {
    const chunk = new Error(
      'Failed to fetch dynamically imported module: http://localhost/assets/Page-abc.js',
    );
    let calls = 0;
    const Route = lazyRoute(
      async () => {
        calls += 1;
        throw chunk;
      },
      (m: { Hello: typeof Hello }) => m.Hello,
    );
    render(
      <ErrorBoundary label="This page">
        <Suspense fallback={<span data-testid="pending" />}>
          <Route />
        </Suspense>
      </ErrorBoundary>,
    );
    await screen.findByText(/could not be downloaded/i);
    expect(document.body.textContent, 'the original message was replaced').toContain(
      'assets/Page-abc.js',
    );
    expect(calls, 'the first attempt retried something').toBe(1);
  });

  /**
   * And a later attempt does chase the busted URL. That the busted request
   * *succeeds* is a browser fact — the module map is what makes it necessary
   * and jsdom has none — and it is measured in a browser and written down in
   * `lazyRoute.tsx`. What is observable here is that the attempt is made at
   * all: the second try fails against a URL the runner cannot resolve, so the
   * error the boundary shows is no longer the one the importer threw.
   *
   * Without this the battery is happy for the retry to quietly give up and
   * rethrow, which is precisely the bug M187 started from.
   */
  it('chases the busted url once the attempt has risen', async () => {
    const chunk = new Error(
      'Failed to fetch dynamically imported module: http://localhost/assets/Page-abc.js',
    );
    const Route = lazyRoute(
      async () => {
        throw chunk;
      },
      (m: { Hello: typeof Hello }) => m.Hello,
    );
    // The provider goes *inside* the boundary: a boundary publishes its own
    // count to everything under it, so one wrapped around this would put the
    // route back on attempt zero — which is the first-failure path and not
    // what is under test. The same trap cost two runs of this file.
    render(
      <ErrorBoundary label="This page">
        <RetryAttempt.Provider value={1}>
          <Suspense fallback={<span data-testid="pending" />}>
            <Route />
          </Suspense>
        </RetryAttempt.Provider>
      </ErrorBoundary>,
    );
    await screen.findByRole('alert');
    expect(
      document.body.textContent,
      'the retry rethrew the first error instead of asking again',
    ).not.toContain('Failed to fetch dynamically imported module: http://localhost/assets/Page-abc.js');
  });
});
