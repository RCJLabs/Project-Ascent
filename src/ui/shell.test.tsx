// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { offerUndo } from '@/store/undo';
import { hydrate, renderAt, reset } from '@/test/render';
import { AppShell } from './AppShell';
import { SearchSheet } from '@/features/search/SearchSheet';

/**
 * The shell after the overhaul (PLAN.md M117).
 *
 * Five tabs, and search as a control in the shell rather than a tab: this
 * checks the arrangement rather than trusting the file, because a sixth
 * tab or a search button that went nowhere would each look fine in review.
 */
const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');

describe('the shell', () => {

  it('has five tabs, and they are these', () => {
    const tabs = [...shell.matchAll(/href: '([^']+)', label: '([^']+)'/g)].map((m) => `${m[2]} ${m[1]}`);
    expect(tabs).toEqual(['Home /', 'Train /train', 'Calendar /calendar', 'Progress /progress', 'Game /game']);
    // The bar's grid has to agree with the list, or the fifth tab wraps.
    expect(shell).toContain('grid-cols-5');
    expect(shell).not.toContain('grid-cols-6');
  });

  it('offers search and settings from the shell on both shapes', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    // Two of each: the phone header and the sidebar row. Both are in the
    // DOM; the stylesheet hides one pair per width, which jsdom cannot see.
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Search' })).toBeNull();
  });

  it('keeps the settings link out of the tab list the route test reads', () => {
    // `routes.test.ts` reads every `href: '…'` in this file as a tab and
    // requires it to be a root. Settings is not a root, so it has to be
    // written as JSX rather than as a TABS entry — this pins that.
    expect(shell).not.toMatch(/href: '\/settings'/);
  });

  it('opens the search sheet from either control and closes it on Escape', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
    // Both buttons, not the first one found: the sidebar's comes first in
    // the DOM, and a phone header button wired to nothing survived a
    // version of this that only pressed `[0]`.
    for (const opener of screen.getAllByRole('button', { name: 'Search' })) {
      opener.focus();
      fireEvent.click(opener);
      const dialog = await screen.findByRole('dialog', { name: 'Search' });
      const field = dialog.querySelector('input[aria-label="Search everything"]');
      expect(field).not.toBeNull();
      // Opens ready to type, and hands focus back to the button that
      // opened it — both measured broken in a browser before the sheet
      // owned focus.
      expect(document.activeElement).toBe(field);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
      expect(document.activeElement).toBe(opener);
    }
  });

  it('closes the sheet when a result is picked', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    // The browse list is up before anything is typed; any entry will do.
    const link = dialog.querySelector('a[href]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    fireEvent.click(link);
    expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull();
  });

  it('closes the sheet when the location changes under it', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Search' })[0]!);
    await screen.findByRole('dialog', { name: 'Search' });
    // `hashchange` is delivered asynchronously; wait for the router to see it.
    window.location.hash = '#/progress';
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search' })).toBeNull());
  });
});

describe('the search sheet', () => {
  it('is a dialog that the picked result closes, by delegation', () => {
    const source = readFileSync('src/features/search/SearchSheet.tsx', 'utf8');
    expect(source).toMatch(/useDialog</);
    expect(source).toMatch(/closest\('a\[href\]'\)/);
  });

  it('browses everything the route table lists', async () => {
    await reset();
    await hydrate();
    renderAt('/', <SearchSheet onClose={() => undefined} />);
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    const hrefs = [...dialog.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    // `/game` is a root and is browsed anyway (M118): "level", "rank" and
    // "kit" have to find something, and the tab is what they find.
    for (const expected of ['#/projects', '#/game', '#/body', '#/glossary', '#/guides']) {
      expect(hrefs, `${expected} is not browsable`).toContain(expected);
    }
    expect(hrefs).not.toContain('#/climber');
    expect(hrefs).not.toContain('#/search');
  });
});

/**
 * Every banner mounted once, not once per breakpoint (PLAN.md M141).
 *
 * The shell rendered `StorageWarning`, `UndoBar`, `UpdatePrompt` and
 * `LiveBar` twice — a phone copy and a sidebar copy, one of them always
 * `display: none`. That hid the duplication perfectly from anything that
 * reads the accessibility tree, because a hidden element is not in it.
 * Effects do not care about `display`.
 */
describe('the banners are mounted once', () => {
  /** A storage reading the browser would give, counted as it is asked for. */
  function countStorageReads(): { calls: () => number; restore: () => void } {
    let calls = 0;
    const had = Object.getOwnPropertyDescriptor(navigator, 'storage');
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => {
          calls += 1;
          return { usage: 1_000, quota: 1_000_000 };
        },
        persisted: async () => true,
      },
    });
    return {
      calls: () => calls,
      restore: () => {
        if (had) Object.defineProperty(navigator, 'storage', had);
        else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'storage');
      },
    };
  }

  it('asks the browser for its storage reading once per page, not twice', async () => {
    const storage = countStorageReads();
    try {
      await reset();
      await hydrate();
      renderAt('/train', <AppShell><p>page</p></AppShell>);
      await waitFor(() => expect(storage.calls()).toBeGreaterThan(0));
      // Settle, so a second copy's effect would have run by now.
      await new Promise((r) => setTimeout(r, 20));
      expect(storage.calls()).toBe(1);
    } finally {
      storage.restore();
    }
  });

  it('hangs one visibility listener, not two', async () => {
    const added: string[] = [];
    const real = document.addEventListener.bind(document);
    document.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.push(type);
      return real(type, ...(rest as [EventListenerOrEventListenerObject]));
    }) as typeof document.addEventListener;
    try {
      await reset();
      await hydrate();
      renderAt('/train', <AppShell><p>page</p></AppShell>);
      await waitFor(() => expect(added.length).toBeGreaterThan(0));
      expect(added.filter((t) => t === 'visibilitychange')).toHaveLength(1);
    } finally {
      document.addEventListener = real;
    }
  });

  /**
   * One offer, one clock. `UndoBar` runs a one-second interval to count the
   * window down, so a second copy is a second interval waking the app every
   * second for the same fifteen seconds — and a second `announce()` call
   * handing the announcer the same sentence twice.
   */
  it('runs one countdown for one undo offer', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    const intervals: number[] = [];
    const real = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void, ms?: number, ...rest: unknown[]) => {
      intervals.push(ms ?? 0);
      return real(fn, ms, ...rest);
    }) as typeof globalThis.setInterval;
    try {
      act(() => offerUndo('The session', async () => undefined));
      // One clock per offer. Two copies meant two, both waking the app every
      // second for the same fifteen seconds.
      expect(intervals.filter((ms) => ms === 1000)).toHaveLength(1);
    } finally {
      globalThis.setInterval = real;
    }
  });

  it('draws one undo bar, not one per breakpoint', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    act(() => offerUndo('The session', async () => undefined));
    // By its button, not its text: the offer is also announced, and the
    // announcer's live region is a `role="status"` carrying the same words.
    expect(await screen.findAllByRole('button', { name: /Undo/ })).toHaveLength(1);
  });

  /**
   * Above the tabs, which is where a phone shows them. Which side of the
   * tabs they land on at desktop width is `order`, and CSS is not something
   * jsdom applies — the browser check holds that half.
   */
  it('puts the banners before the tab row in the markup', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <AppShell><p>page</p></AppShell>);
    const nav = document.querySelector('nav[aria-label="Main"]')!;
    const kids = [...nav.children];
    const banners = kids.findIndex((el) => el.querySelector('[class*="px-3"]') && el.className.includes('order-first'));
    const tabs = kids.findIndex((el) => el.className.includes('grid-cols-5'));
    expect(banners).toBeGreaterThanOrEqual(0);
    expect(tabs).toBeGreaterThanOrEqual(0);
    expect(banners).toBeLessThan(tabs);
  });

  /**
   * And the source carries one of each. The effects above are the reason
   * this matters, but they only catch the two components that have one —
   * a second `LiveBar` would cost nothing measurable and still be a second
   * live region racing the first.
   */
  it('names each banner once in the shell', () => {
    for (const banner of ['<StorageWarning', '<UndoBar', '<UpdatePrompt', '<LiveBar']) {
      expect(shell.split(banner).length - 1, `${banner} is mounted more than once`).toBe(1);
    }
  });
});
