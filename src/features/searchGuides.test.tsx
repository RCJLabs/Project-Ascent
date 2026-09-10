// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { GUIDES } from '@/content/guides';
import { scoreItem } from '@/engine/search';
import { renderAt, reset } from '@/test/render';
import { SearchPage } from '@/features/search/SearchPage';
import { GuidePage } from '@/features/guides/GuidePage';

/**
 * Searching what the guides say (PLAN.md M65).
 *
 * They were indexed by name, subtitle and section titles, so the app was
 * holding several thousand lines of its own knowledge and could not hand
 * any of it over.
 */

/** A phrase that appears in one guide body and in no title anywhere. */
function bodyOnlyPhrase(): { phrase: string; guide: string; section: string } {
  for (const guide of GUIDES) {
    for (const section of guide.sections) {
      for (const block of section.content) {
        if (block.kind !== 'p') continue;
        for (const words of block.text.replace(/[*_]/g, '').split(/[.,;—]/)) {
          const phrase = words.trim();
          if (phrase.length < 18 || phrase.length > 40) continue;
          const inATitle = GUIDES.some(
            (g) =>
              g.name.toLowerCase().includes(phrase.toLowerCase()) ||
              g.sections.some((s) => s.title.toLowerCase().includes(phrase.toLowerCase())),
          );
          if (!inATitle) return { phrase, guide: guide.name, section: section.title };
        }
      }
    }
  }
  throw new Error('no body-only phrase found');
}

async function searchFor(query: string) {
  await reset();
  renderAt('/search', <SearchPage />);
  fireEvent.change(screen.getByLabelText('Search everything'), { target: { value: query } });
}

describe('searching the prose', () => {
  it('finds a phrase that appears only in a body', async () => {
    const { phrase, section } = bodyOnlyPhrase();
    await searchFor(phrase);
    expect(screen.getByText('In the guides')).toBeTruthy();
    const group = screen.getByText('In the guides').closest('section')!;
    expect(within(group).getByText(section)).toBeTruthy();
  });

  it('shows the words around the match, not just the section name', async () => {
    const { phrase } = bodyOnlyPhrase();
    await searchFor(phrase);
    const group = screen.getByText('In the guides').closest('section')!;
    expect(within(group).getAllByText(new RegExp(phrase.slice(0, 16), 'i')).length).toBeGreaterThan(0);
  });

  it('links to the section rather than the top of the guide', async () => {
    const { phrase } = bodyOnlyPhrase();
    await searchFor(phrase);
    const group = screen.getByText('In the guides').closest('section')!;
    const href = within(group).getAllByRole('link')[0]!.getAttribute('href');
    expect(href).toMatch(/^#\/guides\/[a-z_]+\/\d+$/);
  });

  // A guide's own name should bring back the guide, not a paragraph of it
  // that happens to repeat the name. Scored rather than read off the
  // grouping, which is in a fixed order and would hide the ranking.
  it('keeps a whole guide above a passage of it', () => {
    const guide = { id: 'g', kind: 'guide', title: 'Iron Grip', href: '/guides/iron_grip' } as const;
    const passage = {
      id: 'p',
      kind: 'passage',
      title: 'Iron Grip',
      href: '/guides/iron_grip/2',
      body: 'Iron Grip is a twelve week block.',
    } as const;
    expect(scoreItem(guide, 'iron grip')).toBeGreaterThan(scoreItem(passage, 'iron grip'));
  });

  it('finds nothing rather than something wrong', async () => {
    await searchFor('kettlebell swing ladder');
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });
});

describe('arriving at a passage', () => {
  const guide = GUIDES.find((g) => g.sections.length > 3)!;

  /** Which section is open, by its heading rather than by its prose. */
  function openSection(): string | null {
    const expanded = screen
      .getAllByRole('button', { expanded: true })
      .filter((b) => guide.sections.some((s) => b.textContent?.includes(s.title)));
    return expanded[0]?.textContent ?? null;
  }

  // Following a link to section one from section six used to leave the
  // reader where they were: the scroll was skipped for index 0, which
  // conflated "the first section" with "no section asked for".
  it('scrolls to the section it was sent to, including the first', async () => {
    await reset();
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scroll(this: Element) {
      scrolled.push(this.textContent?.slice(0, 40) ?? '');
    };
    try {
      renderAt(`/guides/${guide.id}/1`, <GuidePage params={{ id: guide.id, section: '1' }} />);
      expect(scrolled.length, 'section 1 was not scrolled to').toBeGreaterThan(0);
      scrolled.length = 0;
      renderAt(`/guides/${guide.id}`, <GuidePage params={{ id: guide.id }} />);
      expect(scrolled, 'a guide with no section should stay put').toEqual([]);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('opens the section the link asked for', async () => {
    await reset();
    renderAt(`/guides/${guide.id}/3`, <GuidePage params={{ id: guide.id, section: '3' }} />);
    expect(openSection()).toContain(guide.sections[2]!.title);
  });

  it('opens the first section when no section is asked for', async () => {
    await reset();
    renderAt(`/guides/${guide.id}`, <GuidePage params={{ id: guide.id }} />);
    expect(openSection()).toContain(guide.sections[0]!.title);
  });

  // A stale link should open the document, not silently show a different
  // passage than the one it named.
  it('ignores a section that is not in this guide', async () => {
    await reset();
    for (const section of ['0', '999', 'nonsense']) {
      renderAt(`/guides/${guide.id}/${section}`, <GuidePage params={{ id: guide.id, section }} />);
      expect(openSection(), section).toContain(guide.sections[0]!.title);
    }
  });
});
