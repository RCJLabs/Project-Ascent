import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES, browsable, matchRoute, parentOf } from './routes';

/**
 * The route table is only worth having if it cannot drift from the router.
 *
 * A page added to App.tsx without an entry here would have no back link and
 * would be missing from search — silently, and in a way nobody notices
 * until they go looking for it.
 */

const APP = readFileSync('src/App.tsx', 'utf8');
const ROUTED = [...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1] as string);

describe('the table matches the router', () => {
  it('covers every route the app defines', () => {
    const known = new Set(ROUTES.map((r) => r.path));
    // /welcome is outside the shell by design — it has no back link and no
    // business in search, because you are on it before there is an app.
    const missing = ROUTED.filter((path) => path !== '/welcome' && !known.has(path));
    expect(missing).toEqual([]);
  });

  it('invents no routes the app does not have', () => {
    const routed = new Set(ROUTED);
    const extra = ROUTES.filter((r) => !routed.has(r.path));
    expect(extra.map((r) => r.path)).toEqual([]);
  });

  it('finds a real page for every tab in the shell', () => {
    const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
    const tabs = [...shell.matchAll(/href: '([^']+)'/g)].map((m) => m[1] as string);
    expect(tabs.length).toBeGreaterThanOrEqual(5);
    for (const tab of tabs) {
      const route = matchRoute(tab);
      expect(route, `tab ${tab} has no route`).toBeDefined();
      expect(route?.parent, `tab ${tab} should be a root`).toBeNull();
    }
  });
});

describe('the hierarchy is sound', () => {
  it('points every parent at a route that exists', () => {
    const known = new Set(ROUTES.map((r) => r.path));
    const broken = ROUTES.filter((r) => r.parent !== null && !known.has(r.parent));
    expect(broken.map((r) => `${r.path} → ${r.parent}`)).toEqual([]);
  });

  it('never loops', () => {
    for (const route of ROUTES) {
      const seen = new Set<string>([route.path]);
      let current = route.parent;
      while (current !== null && current !== undefined) {
        expect(seen.has(current), `cycle through ${route.path}`).toBe(false);
        seen.add(current);
        current = ROUTES.find((r) => r.path === current)?.parent ?? null;
      }
    }
  });

  it('reaches a root from anywhere in at most three steps', () => {
    // Deeper than that and "back" stops being a way out.
    for (const route of ROUTES) {
      let depth = 0;
      let current: string | null = route.parent;
      while (current !== null) {
        depth += 1;
        current = ROUTES.find((r) => r.path === current)?.parent ?? null;
        expect(depth, `${route.path} is buried`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('matching a location', () => {
  it('prefers the longer pattern', () => {
    expect(matchRoute('/train/iron_grip/start')?.path).toBe('/train/:id/start');
    expect(matchRoute('/train/iron_grip')?.path).toBe('/train/:id');
  });

  it('prefers an exact path over a pattern', () => {
    // `/year` is its own page; `/year/2026` is the pattern.
    expect(matchRoute('/year')?.path).toBe('/year');
    expect(matchRoute('/year/2026')?.path).toBe('/year/:year');
  });

  it('returns nothing for a path the app does not have', () => {
    expect(matchRoute('/nope')).toBeUndefined();
    expect(parentOf('/nope')).toBeNull();
  });

  it('gives a root no parent', () => {
    expect(parentOf('/')).toBeNull();
    expect(parentOf('/progress')).toBeNull();
  });

  it('names the parent a climber would expect', () => {
    expect(parentOf('/guides/app_guide')).toEqual({ href: '/guides', title: 'Guides' });
    expect(parentOf('/objectives/obj-1')).toEqual({ href: '/objectives', title: 'Objectives' });
    expect(parentOf('/log/2026-09-09')).toEqual({ href: '/calendar', title: 'Calendar' });
  });
});

describe('what search can browse', () => {
  it('lists no route that needs an id', () => {
    // You cannot link to `/projects/:id` without knowing the id.
    const parameterised = browsable().filter((r) => r.path.includes(':'));
    expect(parameterised.map((r) => r.path)).toEqual([]);
  });

  it('reaches every feature in two taps', () => {
    // M16's "done when": Search is one tap from anywhere, so everything
    // listed there is the second. Anything not listed has to be a tab, a
    // detail page, or reachable from a listed page.
    const listed = new Set(browsable().map((r) => r.path));
    const roots = new Set(ROUTES.filter((r) => r.parent === null).map((r) => r.path));
    const orphans = ROUTES.filter(
      (r) => !listed.has(r.path) && !roots.has(r.path) && !r.path.includes(':'),
    );
    expect(orphans.map((r) => r.path)).toEqual([]);
  });
});

describe('feature files no longer hand-roll a back link', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it('uses BackLink everywhere', () => {
    const offenders = walk('src/features')
      .filter((p) => p.endsWith('.tsx'))
      .filter((p) => readFileSync(p, 'utf8').includes('text-sm text-ink-soft py-1.5 mb-1.5'));
    expect(offenders).toEqual([]);
  });
});
