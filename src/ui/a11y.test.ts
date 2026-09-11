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

  it('moves focus into the content when the route changes', () => {
    // Measured before this: pressing Enter on "Start session" left
    // `document.activeElement` as `<body>`, because the control that was
    // focused had just unmounted. The next Tab started at the top of the
    // document, and a reader said nothing about having arrived.
    expect(shell).toMatch(/<main[^>]*ref=\{mainRef\}/s);
    expect(shell).toContain('mainRef.current?.focus()');
    expect(shell).toMatch(/\}, \[location\]\)/);
  });

  it('does not steal focus on the first render', () => {
    // The app has not navigated anywhere yet, and taking focus on load is
    // its own bug.
    expect(shell).toContain('navigated.current');
  });
});

/**
 * A dialog you can Tab out of is not a dialog.
 *
 * The app had three — the protocol timer, the share sheet and the photo
 * viewer — and between them one Escape handler, one `aria-modal` and no
 * focus management at all. `useDialog` is the one mechanism; these check
 * every dialog uses it rather than growing its own half.
 */
describe('modal dialogs', () => {
  const dialogs = FILES.filter(({ source }) => /role="dialog"/.test(source));

  it('finds the dialogs to check', () => {
    expect(dialogs.map((d) => d.path).sort()).toEqual([
      'src/features/assessments/HoldTimer.tsx',
      'src/features/media/MediaCard.tsx',
      'src/features/share/ShareSheet.tsx',
      'src/ui/TimerSheet.tsx',
    ]);
  });

  it('traps focus, closes on Escape and hands focus back', () => {
    // All four behaviours live in one hook, so calling it is the check —
    // and it has to be the call, not the import. Swapping the call for a
    // plain `useRef` and leaving the import behind passed the first version
    // of this test.
    const without = dialogs
      .filter(({ source }) => !/useDialog\s*[<(]/.test(source.replace(/^import .*$/gm, '')))
      .map((d) => d.path);
    expect(without).toEqual([]);
  });

  it('hides the page behind it from a screen reader', () => {
    const without = dialogs
      .filter(({ source }) => !/role="dialog"[\s\S]{0,200}aria-modal="true"|aria-modal="true"[\s\S]{0,200}role="dialog"/.test(source))
      .map((d) => d.path);
    expect(without).toEqual([]);
  });

  it('gives the container something to focus', () => {
    // `useDialog` focuses the container rather than the first control, so a
    // reader lands on the dialog's own label instead of mid-way through it.
    // A div is not focusable without this.
    const without = dialogs
      .filter(({ source }) => !/tabIndex=\{-1\}[\s\S]{0,300}role="dialog"|role="dialog"[\s\S]{0,300}tabIndex=\{-1\}/.test(source))
      .map((d) => d.path);
    expect(without).toEqual([]);
  });

  it('registers nothing while there is no dialog on screen', () => {
    // The photo card stays mounted and renders its viewer conditionally.
    // Without the `open` argument the trap would swallow every Escape on
    // every session page, with nothing to close.
    const media = read('src/features/media/MediaCard.tsx');
    expect(media).toMatch(/useDialog<[\s\S]{0,80}open !== undefined\)/);
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

describe('screen-reader-only content', () => {
  it('never puts sr-only on a table', () => {
    // A table treats a specified width as a minimum and expands to fit its
    // content regardless, so `sr-only` on the table itself leaves a
    // 459px-wide invisible element pushing the page sideways — measured at
    // the largest text size on a 320px screen. The wrapper is the fix.
    const offences = FILES.filter(({ source }) => /<table[^>]*className="[^"]*sr-only/.test(source));
    expect(offences.map((f) => f.path)).toEqual([]);
  });
});

describe('text size', () => {
  it('scales the root, which is the only thing that scales Tailwind', () => {
    const css = readFileSync('src/index.css', 'utf8');
    // Every size in this app is a rem utility, so scaling `body` would
    // leave text-sm and text-xs exactly where they were.
    expect(css).toMatch(/html\s*\{[^}]*font-size:\s*calc\(100% \* var\(--text-scale/);
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
    // Both forms: a page is either statically imported or lazily. Matching
    // only `from '@/features/…'` quietly stopped finding twenty-five of them
    // the moment M40 split the routes — the check still passed, on four
    // pages, which is the failure mode a coverage floor exists to catch.
    const app = readFileSync('src/App.tsx', 'utf8');
    const pages = [
      ...new Set(
        [...app.matchAll(/(?:from|import\()\s*'@\/(features\/[^']+)'/g)].map((m) => `src/${m[1]}.tsx`),
      ),
    ];
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
