import { describe, expect, it } from 'vitest';
import { GUIDES } from '@/content/guides';
import { plain, sectionText, snippet } from './guideText';
import type { GuideSection } from '@/content/guides/types';

/**
 * The guides, searchable by what they say (PLAN.md M65).
 */

describe('flattening a section', () => {
  const section: GuideSection = {
    title: 'Deload weeks',
    content: [
      { kind: 'p', text: 'A **deload** is not time off.' },
      { kind: 'list', items: ['Half the volume', 'Same intensity'] },
      { kind: 'table', head: ['Week', 'Load'], rows: [['4', 'light']] },
      { kind: 'warn', title: 'Stop if it hurts', items: ['Pain is not progress'], footer: 'Ask a physio.' },
      { kind: 'exercises', group: 'Fingers', name: 'Repeaters', items: ['3 sets'] },
      { kind: 'quote', text: 'Rest _is_ training.' },
    ],
  };

  it('takes every kind of block, not only the paragraphs', () => {
    const text = sectionText(section);
    for (const words of [
      'Deload weeks',
      'not time off',
      'Half the volume',
      'Week',
      'light',
      'Stop if it hurts',
      'Pain is not progress',
      'Ask a physio',
      'Fingers',
      'Repeaters',
      '3 sets',
      'Rest is training',
    ]) {
      expect(text, words).toContain(words);
    }
  });

  // A climber typing "deload" should not miss the line that wrote it bold.
  it('drops the inline markers', () => {
    expect(sectionText(section)).toContain('A deload is not time off');
    expect(sectionText(section)).not.toMatch(/\*\*|_/);
    expect(plain('**bold** and _italic_')).toBe('bold and italic');
  });

  it('covers every block kind the guides actually use', () => {
    const kinds = new Set<string>();
    for (const guide of GUIDES) {
      for (const s of guide.sections) for (const block of s.content) kinds.add(block.kind);
    }
    // If a new kind is added to the content, this fails until it is flattened.
    expect([...kinds].sort()).toEqual(
      ['exercises', 'h', 'list', 'note', 'p', 'quote', 'table', 'warn'].filter((k) => kinds.has(k)),
    );
    for (const guide of GUIDES) {
      for (const s of guide.sections) expect(sectionText(s).length, `${guide.id}/${s.title}`).toBeGreaterThan(0);
    }
  });
});

describe('a snippet', () => {
  const text = 'The deload week exists so the next block can be hard. Half the volume, the same intensity, and no new maximums.';

  it('shows the words around the match', () => {
    const out = snippet(text, 'volume', 40);
    expect(out).toContain('volume');
    expect(out.length).toBeLessThanOrEqual(46);
  });

  it('marks where it cut', () => {
    expect(snippet(text, 'maximums', 30)).toMatch(/^…/);
    expect(snippet(text, 'deload', 30)).toMatch(/…$/);
  });

  it('never starts mid-word', () => {
    for (const query of ['volume', 'intensity', 'maximums', 'block']) {
      const out = snippet(text, query, 40).replace(/^…/, '');
      const first = out.split(' ')[0]!;
      expect(text, `${query} -> ${first}`).toContain(first);
    }
  });

  it('falls back to the opening when the query is not in it', () => {
    expect(snippet(text, 'kettlebell', 20)).toBe('The deload week…');
    expect(snippet(text, '', 20)).toBe('The deload week…');
  });

  it('leaves a short passage whole', () => {
    expect(snippet('Short enough.', 'enough', 100)).toBe('Short enough.');
  });
});
