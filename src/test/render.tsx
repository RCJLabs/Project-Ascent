// @vitest-environment jsdom
import { cleanup, render, type RenderResult } from '@testing-library/react';
import { Router } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { hydrateAll } from '@/store';

/**
 * Mount a page the way the app mounts it (PLAN.md M43).
 *
 * The features layer was 12,934 lines against 362 lines of test, and every
 * defect in M35, M39, M41 and M42 lived in it and was found by driving a
 * browser by hand. The tests written since scan source text, which can prove
 * a call is *written* but not that it does anything — two of them survived
 * their first mutation for exactly that reason.
 *
 * This is not a replacement for a browser. jsdom has no layout and no real
 * stylesheet, so it cannot see the M30 bug where `p-0` lost to `p-3` on
 * Tailwind's ordering, or a card that collapses to no height. It sees the
 * other kind: what a page decides to render, from the stores, for a given
 * route. That is the kind this app keeps shipping.
 */

afterEach(cleanup);

/**
 * The app has no context providers — the stores are module-level zustand and
 * routing is hash-based — so a page needs only a `Router` around it. Keeping
 * that here rather than in each test means a provider added to `App.tsx`
 * later has one place to be added to.
 */
export function renderAt(path: string, element: ReactElement): RenderResult {
  // Unmount anything already up. `cleanup` runs between tests, not between
  // calls, so a test that renders two routes to compare them otherwise
  // queries a document holding both — which reads as "found multiple
  // elements with the role heading" rather than as the mistake it is.
  cleanup();
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
  return render(<Router hook={useHashLocation}>{element}</Router>);
}

/**
 * Load every store from the (fake) database, as boot does.
 *
 * Call this after seeding and before rendering. Pages gate on `hydrated`
 * and show a skeleton until it flips, so a test that skips this asserts
 * against a loading state and passes for the wrong reason.
 */
export async function hydrate(): Promise<void> {
  await hydrateAll();
}
