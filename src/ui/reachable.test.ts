import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ROUTES } from './routes';

/**
 * Every room has a way out (PLAN.md M152).
 *
 * `routes.ts` declares a hierarchy and `BackLink` derives the way up from
 * it, so a page with a parent and no `BackLink` is a page whose own route
 * table says where it belongs and whose screen does not offer to go there.
 * Seven were like that, four of them named in the brainstorm and three more
 * this found — and nothing in the build notices, because a missing link
 * type-checks, lints and ships.
 *
 * Written as a scan rather than a list, for the reason M153 rewrote the
 * prescription guard: a list is a thing you have to remember to extend, and
 * it fails exactly when a new page appears. A route is checked **by
 * default** and has to be argued out of it.
 */

const APP = readFileSync('src/App.tsx', 'utf8');

/**
 * Routes with a parent that deliberately have no page to put a link on.
 *
 * Both are redirects: they render nothing and send the climber somewhere
 * else before a back link could be read. A parent is still the right thing
 * for them to declare, because search and the hierarchy both read it.
 */
/**
 * `<BackLink`, not `BackLink`: the import survives a deleted element, so
 * matching the bare name passed for a page that had stopped rendering one —
 * which the battery showed by removing it and watching this agree. Shared
 * with the self-check below so loosening it is caught rather than assumed.
 */
const RENDERS = /<BackLink/;

const NO_PAGE: Record<string, string> = {
  '/today': 'a redirect to the current day, with nothing rendered to go back from',
  '/gym': 'the retired gym route, redirecting to today (PLAN.md M120)',
};

/** The file that renders a route, found through `App.tsx`. */
function screenFor(path: string): string | null {
  const escaped = path.replace(/[:/]/g, (c) => `\\${c}`);
  const match = new RegExp(`<Route path="${escaped}"[^>]*component=\\{?(\\w+)`).exec(APP);
  if (!match) return null;
  const found = execSync(`grep -rl "export function ${match[1]}\\b" src --include=*.tsx || true`, {
    encoding: 'utf8',
  }).trim();
  /**
   * Never a test file, and never a silent pick between several
   * (PLAN.md M224).
   *
   * This took `found.split('\n')[0]` — the first line `grep -r` happened to
   * print, which is **directory order**, which differs between one machine
   * and another. A test that quotes `export function ObjectiveDetailPage`
   * in a string (M222's does, to slice the page apart) matches the grep,
   * and whether this rule read the page or the test was decided by the
   * filesystem. It passed here and failed on the CI runner.
   *
   * So: tests are excluded, and two candidates is a failure rather than a
   * coin toss — if a component is exported from two places the rule cannot
   * know which one the route renders, and should say so.
   */
  const files = found === '' ? [] : found.split('\n').filter((f) => !/\.test\.tsx?$/.test(f));
  if (files.length > 1) {
    throw new Error(`${match[1]} is exported from ${files.length} files: ${files.join(', ')}`);
  }
  return files[0] ?? null;
}

describe('every page with a parent offers the way back', () => {
  // `parent: null` is the explicit top-level marker the five tabs carry —
  // a tab root has nowhere above it and the bar is always on screen. Only a
  // *string* parent is a claim about where a page sits.
  const parented = ROUTES.filter((r) => typeof r.parent === 'string');

  it('finds the routes to check', () => {
    // A scan that quietly found nothing would pass every case below.
    expect(parented.length).toBeGreaterThanOrEqual(30);
  });

  it.each(parented.map((r) => r.path))('%s', (path) => {
    if (NO_PAGE[path]) return;
    const file = screenFor(path);
    expect(file, `${path} declares a parent and no <Route> renders it`).not.toBeNull();
    expect(readFileSync(file!, 'utf8'), `${path} has a parent and no BackLink (${file})`).toMatch(
      RENDERS,
    );
  });

  it('would notice a page that lost its way back', () => {
    // The assertion itself has to be able to fail, or the block above is a
    // list of names that always passes.
    expect(() => {
      expect(readFileSync('src/ui/EmptyState.tsx', 'utf8')).toMatch(RENDERS);
    }).toThrow();
  });

  /**
   * And it has to fail for a page that *imports* one and renders none,
   * which is what a half-finished edit looks like and what the first
   * version of this check accepted.
   */
  it('does not accept an import in place of an element', () => {
    const importedOnly = "import { BackLink } from '@/ui/BackLink';\nexport function P() { return null; }";
    expect(RENDERS.test(importedOnly)).toBe(false);
    expect(/BackLink/.test(importedOnly)).toBe(true);
  });

  it('exempts only pages that render nothing, and says why', () => {
    for (const [path, reason] of Object.entries(NO_PAGE)) {
      expect(ROUTES.some((r) => r.path === path), path).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
      expect(readFileSync(screenFor(path)!, 'utf8')).toMatch(/Redirect|useLocation|setLocation/);
    }
  });
});
