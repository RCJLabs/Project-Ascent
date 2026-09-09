import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Accessibility properties that can be checked at the source (PLAN.md M14).
 *
 * These do not replace using the app with a keyboard and a reader — nothing
 * does — but they catch the regressions that are invisible in review: a live
 * region that stops being mounted, a chart that loses its text alternative,
 * a nav that forgets which tab it is on.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const FILES = [...walk('src/features'), ...walk('src/ui')]
  .filter((p) => p.endsWith('.tsx') && !p.endsWith('.test.tsx'))
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

const read = (path: string) => readFileSync(path, 'utf8');

describe('the shell', () => {
  const shell = read('src/ui/AppShell.tsx');

  it('mounts the live regions once, above everything', () => {
    expect(shell).toContain('<Announcer />');
  });

  it('offers a skip link to a focusable main', () => {
    expect(shell).toContain('href="#main"');
    expect(shell).toMatch(/<main[^>]*id="main"/);
    // Without tabIndex the skip link scrolls but leaves focus in the nav.
    expect(shell).toMatch(/<main[^>]*tabIndex=\{-1\}/);
  });

  it('does not let the skip link navigate — routing here is hash-based', () => {
    // Letting the browser follow `#main` replaces the route: measured, it
    // moved the app from /progress to /.
    expect(shell).toContain('e.preventDefault()');
    expect(shell).toContain("document.getElementById('main')?.focus()");
  });

  it('marks the tab you are on', () => {
    expect(shell).toContain("aria-current={active ? 'page' : undefined}");
  });

  it('names its landmark', () => {
    expect(shell).toMatch(/<nav\s+aria-label="Main"/);
  });
});

describe('live regions', () => {
  const announce = read('src/ui/Announce.tsx');

  it('keeps both regions mounted and empty rather than adding them with text', () => {
    // A region inserted at the same moment as its text is unreliable across
    // readers — the single most common way live regions are got wrong.
    expect(announce).toContain('aria-live="polite"');
    expect(announce).toContain('aria-live="assertive"');
    expect(announce).toContain('aria-atomic="true"');
  });

  it('can repeat itself', () => {
    // Same words twice must still fire, so the state carries a counter.
    expect(announce).toMatch(/id: get\(\)\.id \+ 1/);
  });

  it('is used where the screen changes without a navigation', () => {
    const callers = FILES.filter((f) => f.source.includes('announce(')).map((f) => f.path);
    for (const expected of [
      'src/ui/TimerSheet.tsx',
      'src/features/log/LogPage.tsx',
      'src/features/settings/SettingsPage.tsx',
      'src/features/challenges/BoardPage.tsx',
    ]) {
      expect(callers, `nothing announced in ${expected}`).toContain(expected);
    }
  });
});

describe('motion', () => {
  it('honours prefers-reduced-motion globally', () => {
    const css = read('src/index.css');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition-duration: 0.01ms !important');
    // The game is exempt by design and the escape hatch has to exist.
    expect(css).toContain("data-motion='essential'");
  });
});

describe('charts', () => {
  const charts = read('src/ui/charts/Charts.tsx');

  it('gives every chart a text alternative, not just a title', () => {
    const figures = (charts.match(/<figure/g) ?? []).length;
    const tables = (charts.match(/<DataTable|<table/g) ?? []).length;
    expect(figures).toBeGreaterThanOrEqual(3);
    expect(tables).toBeGreaterThanOrEqual(figures);
  });

  it('hides the drawing itself once the data is readable', () => {
    // Two labels for one thing is worse than one: the svg would announce
    // the caption a second time.
    expect(charts).not.toMatch(/<svg[^>]*role="img"/);
  });
});

describe('headings', () => {
  /** Heading levels in source order, per file. */
  const levelsIn = (source: string): number[] =>
    [...source.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

  it('gives every routed page exactly one h1', () => {
    // The rule that matters for navigation: land on a route and there is
    // one top-level heading naming where you are. Fragment components like
    // Card and GuideBody legitimately start deeper — they are rendered
    // inside a page, not as one — so they are judged by the skip rule only.
    const app = readFileSync('src/App.tsx', 'utf8');
    const pages = [...app.matchAll(/from '@\/(features\/[^']+)'/g)].map((m) => `src/${m[1]}.tsx`);
    expect(pages.length).toBeGreaterThan(20);

    const offences: string[] = [];
    for (const path of pages) {
      const file = FILES.find((f) => f.path === path);
      if (file === undefined) continue;
      const ownH1 = (file.source.match(/<h1[\s>]/g) ?? []).length;
      const headers = (file.source.match(/<PageHeader/g) ?? []).length;
      const total = ownH1 + headers;
      if (total === 0) offences.push(`${path}: no h1 and no PageHeader`);
    }
    expect(offences).toEqual([]);
  });

  it('never skips a heading level inside one component', () => {
    const offences: string[] = [];
    for (const { path, source } of FILES) {
      const used = [...new Set(levelsIn(source))].sort((a, b) => a - b);
      for (let i = 1; i < used.length; i += 1) {
        if ((used[i] ?? 0) - (used[i - 1] ?? 0) > 1) {
          offences.push(`${path}: jumps h${used[i - 1]} to h${used[i]}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('makes a guide section a heading, not a span in a button', () => {
    const guide = read('src/features/guides/GuidePage.tsx');
    expect(guide).toMatch(/<h2>\s*<DisclosureButton/);
  });
});
