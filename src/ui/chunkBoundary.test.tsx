// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { RetryAttempt } from './lazyRoute';

/**
 * What the boundary says, and what it counts (PLAN.md M187).
 *
 * The behaviour this milestone is really about — a retry that fetches a
 * chunk again — cannot be reached from jsdom: it turns on the browser's
 * module map caching a failed record, which is why the retry fetched nothing
 * before and why busting the URL is what fixes it. That half is measured in
 * a browser and written down in `lazyRoute.tsx`.
 *
 * Two halves are checkable here and both were wrong before: which failure
 * the card claims, and whether the boundary counts its retries at all. The
 * count is what a `lazyRoute` reads to build a new instance, so a boundary
 * that does not raise it is a retry button that does nothing, quietly.
 */

// `src/test/render.tsx` registers this for the screen tests; this file
// renders the boundary directly, so it has to register its own — without it
// each test queries a document still holding the one before it.
afterEach(cleanup);

function Boom({ error }: { error: Error }): never {
  throw error;
}

const chunkError = new Error(
  'Failed to fetch dynamically imported module: http://localhost/assets/CoachPage-abc.js',
);
const dataError = new Error("Cannot read properties of undefined (reading 'grade')");

describe('the card names the failure it actually caught', () => {
  it('calls a missing chunk a download, and says the logs are fine', () => {
    render(
      <ErrorBoundary label="This page">
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/This page could not be downloaded/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Nothing is wrong with your logs/);
    expect(
      document.body.textContent,
      'told a climber on a train that their data was corrupt',
    ).not.toMatch(/not the shape the app expected/);
  });

  it('offers a reload rather than a backup, because the data is not the problem', () => {
    render(
      <ErrorBoundary label="This page">
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    expect(screen.queryByText(/Export a backup/)).toBeNull();
  });

  /** And the failure M20 built this for keeps its own copy and its own offer. */
  it('still calls a bad record a bad record', () => {
    render(
      <ErrorBoundary label="This card">
        <Boom error={dataError} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/This card could not be shown/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/not the shape the app expected/);
    expect(screen.getByText(/Export a backup/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
  });
});

describe('the retry count a lazy route reads', () => {
  function Attempt() {
    return <span data-testid="attempt">{useContext(RetryAttempt)}</span>;
  }

  it('is published even while nothing has failed', () => {
    render(
      <ErrorBoundary>
        <Attempt />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('attempt').textContent).toBe('0');
  });

  /**
   * Rises on a retry, which is the whole mechanism: `React.lazy` caches its
   * factory's rejection, so the only way to ask again is a new instance, and
   * the only thing that tells a route to build one is this number changing.
   */
  it('rises when the climber asks again', () => {
    const { rerender } = render(
      <ErrorBoundary label="This page">
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );
    expect(screen.queryByTestId('attempt'), 'the boundary did not catch').toBeNull();

    // The children are swapped before the click, standing in for the chunk
    // arriving on the second ask: a boundary whose children still throw goes
    // straight back to the card, which is the real behaviour and not what is
    // under test here.
    rerender(
      <ErrorBoundary label="This page">
        <Attempt />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByTestId('attempt').textContent).toBe('1');
  });

  /**
   * And on navigating away from a failure, which is a retry by another name.
   * But **only** then: raising it on every navigation would hand React a new
   * lazy component for every route each time the location changed, which
   * re-imports and re-suspends the whole app for nothing.
   */
  it('rises on navigation away from a failure and not otherwise', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/coach" label="This page">
        <Boom error={chunkError} />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary resetKey="/game" label="This page">
        <Attempt />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('attempt').textContent).toBe('1');

    rerender(
      <ErrorBoundary resetKey="/progress" label="This page">
        <Attempt />
      </ErrorBoundary>,
    );
    expect(
      screen.getByTestId('attempt').textContent,
      'a navigation with nothing broken rebuilt every lazy route',
    ).toBe('1');
  });
});

describe('the sheet that sat outside every boundary', () => {
  /**
   * `SearchSheet` is a sibling of `<main>` and `RouteBoundary` lives inside
   * it, so a search chunk that failed to arrive took the whole app with it —
   * measured in a browser at M187: no nav, no way back, a body with zero
   * characters of text in it. That is the failure M20 exists to make
   * impossible, in the one place the boundary did not reach.
   */
  it('is wrapped in one now', () => {
    const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
    expect(shell).toMatch(/<ErrorBoundary label="Search">[\s\S]{0,200}<SearchSheet/);
    expect(shell, 'the sheet is a chunk, so it must be able to retry').toMatch(
      /const SearchSheet = lazyRoute\(/,
    );
  });
});
