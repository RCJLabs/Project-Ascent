// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DRILLS } from '@/content/drills';
import { DRILL_TEXT } from '@/content/drillText';
import { renderAt, reset } from '@/test/render';
import { SearchSheet } from '@/features/search/SearchSheet';

/**
 * Searching what a drill says (PLAN.md M137).
 *
 * The drill text left the entry chunk, and the search sheet was its one
 * eager reader: it indexed every description as a keyword. It fetches the
 * text when it opens now, the way it fetches the glossary, and a phrase
 * that appears only in a description still finds the drill once the text
 * has landed.
 */

/** A phrase from one drill's text that appears in no drill's name or focus. */
function textOnlyPhrase(): { phrase: string; name: string } {
  for (const drill of DRILLS) {
    for (const words of DRILL_TEXT[drill.id]!.split(/[.,;—()]/)) {
      const phrase = words.trim();
      if (phrase.length < 18 || phrase.length > 40) continue;
      const named = DRILLS.some((d) => `${d.name} ${d.focus}`.toLowerCase().includes(phrase.toLowerCase()));
      if (!named) return { phrase, name: drill.name };
    }
  }
  throw new Error('no text-only phrase found');
}

async function searchFor(query: string) {
  await reset();
  renderAt('/', <SearchSheet onClose={() => undefined} />);
  fireEvent.change(screen.getByLabelText('Search everything'), { target: { value: query } });
}

describe('searching a drill by what it says', () => {
  it('finds a phrase that appears only in the text, once the text has arrived', async () => {
    const { phrase, name } = textOnlyPhrase();
    await searchFor(phrase);
    await waitFor(() => expect(screen.getByText(name)).toBeTruthy());
  });

  it('finds a drill by its name without waiting for anything', () => {
    // The names are in the entry chunk and always were.
    const drill = DRILLS[0]!;
    void searchFor(drill.name);
    // More than once when a guide passage quotes the name too.
    return waitFor(() => expect(screen.getAllByText(drill.name).length).toBeGreaterThan(0));
  });
});
