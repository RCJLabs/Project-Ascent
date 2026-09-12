// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
describe('the shell', () => {
  const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');

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
    for (const expected of ['#/projects', '#/game', '#/glossary', '#/guides']) {
      // `/game` is a root and is not browsed; its children are.
      if (expected === '#/game') continue;
      expect(hrefs, `${expected} is not browsable`).toContain(expected);
    }
    expect(hrefs).toContain('#/climber');
    expect(hrefs).not.toContain('#/search');
  });
});
